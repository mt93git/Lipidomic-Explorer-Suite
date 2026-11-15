-- Clients and Datasets screens as prototypes a16/a17/a18 (2026-11-13). 0001-0031 are never edited.
--
-- 1. admin.client.code: a short code per client (CL-001, CL-002, ...), shown next to its name. Given by the database
--    on insert (create_client needs no change); existing clients get one now. Never edited by the app.
-- 2. admin.client_people(p_client_id): lab staff (Owner, Admin, Operator) only. For each active member of the client:
--    the name it was given (0023), its email and when it last signed in (auth.users, which the lab cannot read), and
--    its client role. Client detail lists members by name or email from it, never by user id. Nothing else of
--    auth.users is returned (no factors: two-step sign-in is off for everyone, decision 2026-11-11).
-- 3. admin.dataset.sample_count / lipid_count and admin.record_dataset_counts(p_dataset_id, p_samples, p_lipids): lab
--    writers record how many samples and lipids a version holds right after build_dataset, while nobody has signed
--    it (the guard then freezes the row). Written once: the same numbers again are accepted, other numbers refused.
--    Versions built before this migration keep NULL (the Datasets list shows a dash).
-- Needs Supabase's auth.users (email, last_sign_in_at).

CREATE SEQUENCE admin.client_code_seq;
-- The default runs as the owner, so a caller needs no right on the sequence (a direct insert is still refused by the
-- client policies, as before).
CREATE FUNCTION admin.next_client_code() RETURNS text
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT 'CL-' || lpad(nextval('admin.client_code_seq')::text, 3, '0') $$;
REVOKE EXECUTE ON FUNCTION admin.next_client_code() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION admin.next_client_code() TO authenticated;
-- A volatile default on ADD COLUMN fills every existing row (no row trigger runs), then serves each new client.
ALTER TABLE admin.client ADD COLUMN code text NOT NULL DEFAULT admin.next_client_code();
ALTER TABLE admin.client ADD CONSTRAINT client_code_key UNIQUE (code);

CREATE FUNCTION admin.client_people(p_client_id uuid)
  RETURNS TABLE (user_id uuid, display_name text, email text, role text, last_sign_in_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
#variable_conflict use_column
BEGIN
  IF NOT admin.is_lab_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Lab staff access is required to see a client''s people' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id, nullif(btrim(m.display_name), ''), u.email::text, m.role, u.last_sign_in_at
    FROM admin.client_member m
    LEFT JOIN auth.users u ON u.id = m.user_id
   WHERE m.client_id = p_client_id AND m.archived_at IS NULL
   ORDER BY CASE m.role WHEN 'client_admin' THEN 0 WHEN 'requester' THEN 1 ELSE 2 END,
            lower(coalesce(nullif(btrim(m.display_name), ''), u.email::text, '')), m.user_id;
END $$;

ALTER TABLE admin.dataset ADD COLUMN sample_count int CHECK (sample_count >= 0);
ALTER TABLE admin.dataset ADD COLUMN lipid_count int CHECK (lipid_count >= 0);
ALTER TABLE admin.dataset ADD CONSTRAINT dataset_counts_together CHECK ((sample_count IS NULL) = (lipid_count IS NULL));

-- guard_dataset as 0008 wrote it, with one change: a built dataset's counts may be filled once (see 3. above).
CREATE OR REPLACE FUNCTION admin.guard_dataset() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  allowed text[] := ARRAY['archived_at', 'archived_reason'];
  signers int;
  eligible int;
  needed int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'built' THEN
      RAISE EXCEPTION 'a dataset is created as built, not %', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    NEW.released_at := NULL;
    NEW.project_id := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('released', 'superseded', 'withdrawn') THEN
    IF OLD.status = 'released' AND NEW.status IN ('superseded', 'withdrawn') THEN
      allowed := allowed || 'status'::text;
    END IF;
    IF NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW), allowed) THEN
      RAISE EXCEPTION 'dataset % is % and frozen', OLD.id, OLD.status
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    -- Retiring and archiving go together (withdraw_dataset, supersede_dataset), for every writer.
    IF NEW.status = 'released' AND NEW.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'dataset % is released; it is retired only through withdraw_dataset or supersede_dataset', OLD.id
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW.status IN ('superseded', 'withdrawn') AND NEW.archived_at IS NULL THEN
      RAISE EXCEPTION 'dataset % is %; a retired dataset stays archived with its reason', OLD.id, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Built: only the release (release_dataset) and archiving may change the row.
  -- 0037: the sample and lipid counts may be filled once (record_dataset_counts), while nobody has signed.
  IF NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW),
       ARRAY['status', 'released_at', 'project_id', 'companion_path', 'archived_at', 'archived_reason']
       || CASE WHEN OLD.sample_count IS NULL THEN ARRAY['sample_count', 'lipid_count'] ELSE '{}'::text[] END) THEN
    RAISE EXCEPTION 'dataset % content cannot change: build_dataset fixed its source, version, paths and files (build a new version)', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND NEW.status <> 'released' THEN
    RAISE EXCEPTION 'dataset % gets its project only when released', OLD.id USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(DISTINCT user_id), count(DISTINCT user_id) FILTER (WHERE admin.is_release_signer(user_id))
    INTO signers, eligible
    FROM admin.signature WHERE dataset_id = OLD.id AND archived_at IS NULL;

  IF signers > 0 AND NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW),
       ARRAY['status', 'released_at', 'archived_at', 'archived_reason']
       || CASE WHEN NEW.status = 'released' THEN ARRAY['project_id', 'companion_path'] ELSE '{}'::text[] END) THEN
    RAISE EXCEPTION 'dataset % is signed; its content cannot change (build a new version)', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NEW.status = 'released' AND NEW.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'dataset % is archived; an archived build cannot be released', OLD.id USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW.status = 'released' THEN
    needed := admin.required_signatures();
    IF eligible < needed THEN
      RAISE EXCEPTION 'release of dataset % needs % signatures by different eligible people (has %)', OLD.id, needed, eligible
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.released_at := now();
  ELSIF NEW.status <> 'built' THEN
    RAISE EXCEPTION 'dataset % is not released; it cannot become %', OLD.id, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION admin.record_dataset_counts(p_dataset_id uuid, p_samples int, p_lipids int) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  d admin.dataset;
BEGIN
  IF NOT admin.is_lab_writer() THEN
    RAISE EXCEPTION 'Only lab Owner, Admin or Operator may record dataset counts' USING ERRCODE = '42501';
  END IF;
  IF p_samples IS NULL OR p_lipids IS NULL OR p_samples < 0 OR p_lipids < 0 THEN
    RAISE EXCEPTION 'sample and lipid counts must be zero or more' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO d FROM admin.dataset WHERE id = p_dataset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset % was not found', p_dataset_id USING ERRCODE = 'P0002';
  END IF;
  IF d.sample_count IS NOT NULL THEN
    IF d.sample_count = p_samples AND d.lipid_count = p_lipids THEN RETURN; END IF;
    RAISE EXCEPTION 'dataset % already records % samples and % lipids', p_dataset_id, d.sample_count, d.lipid_count
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- Signed content is frozen by guard_dataset too; the message here says why.
  IF d.status <> 'built' OR EXISTS (SELECT 1 FROM admin.signature s WHERE s.dataset_id = d.id AND s.archived_at IS NULL) THEN
    RAISE EXCEPTION 'dataset % is signed or no longer built; its counts are recorded at build time only', p_dataset_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE admin.dataset SET sample_count = p_samples, lipid_count = p_lipids WHERE id = p_dataset_id;
END $$;

REVOKE EXECUTE ON FUNCTION admin.client_people(uuid), admin.record_dataset_counts(uuid, int, int) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.client_people(uuid), admin.record_dataset_counts(uuid, int, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
