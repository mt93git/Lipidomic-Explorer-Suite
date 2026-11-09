-- Admin wave 2 fixes (docs/admin/wave2-review.md, findings 1-7 and 10). 0005 is applied on staging and
-- is never edited; everything here is additive or replaces a function/grant.
--
--  1. Signing only through sign_dataset: no INSERT on admin.signature for the app role; retraction stays a
--     plain update of archived_at/archived_reason, and a retracted signature cannot be restored.
--     One live signature per person and dataset, enforced by a unique index for every writer.
--  2. Release only through release_dataset: no table-level UPDATE on admin.dataset, only a whitelist of
--     content/manifest/archive columns. The dataset trigger counts signatures like release_dataset does.
--  3. The one-argument admin.release_dataset(uuid) from 0003 is dropped.
--  4. Team ownership at release only for signers still eligible under the current policy.
--  5. A built dataset records the analysis and companion files (sha256, size); signing needs them and
--     release_dataset refuses an analysis file that is not the recorded one.
--  6. register_samples only while the order's registry is open (received, registered).
--  7. Private bucket admin-files, staff-only, paths <client_id>/<order_code>/..., no overwrite or delete.
-- 10. One live lab-wide name_map entry per export name.

-- ---------------------------------------------------------------- 5. file manifest of a built dataset

-- The analysis file (Abundance + Metadata, the one written to Team's pilot_files) and the companion file
-- (Internal_Standards, QC_Injections, Provenance, kept by Admin) are recorded when the dataset is built,
-- before anyone signs. A live signature freezes them with the rest of the row (guard_dataset).
ALTER TABLE admin.dataset ADD COLUMN analysis_sha256 text CHECK (analysis_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE admin.dataset ADD COLUMN analysis_size_bytes bigint CHECK (analysis_size_bytes > 0);
ALTER TABLE admin.dataset ADD COLUMN companion_sha256 text CHECK (companion_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE admin.dataset ADD COLUMN companion_size_bytes bigint CHECK (companion_size_bytes > 0);

-- ---------------------------------------------------------------- 1. signatures

DROP POLICY signature_insert ON admin.signature;
REVOKE INSERT, UPDATE ON admin.signature FROM authenticated;
GRANT UPDATE (archived_at, archived_reason) ON admin.signature TO authenticated;

-- Fails (with the duplicate's key) if a person already holds two live signatures on one dataset; resolve by
-- archiving one of them before applying.
CREATE UNIQUE INDEX signature_one_live_per_person ON admin.signature (dataset_id, user_id) WHERE archived_at IS NULL;

-- Same as 0003, plus: a signature needs the dataset's file manifest; a retracted signature stays retracted.
CREATE OR REPLACE FUNCTION admin.guard_signature() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  ds admin.dataset;
BEGIN
  SELECT * INTO ds FROM admin.dataset WHERE id = NEW.dataset_id FOR UPDATE;
  IF ds.status IN ('released', 'superseded', 'withdrawn') THEN
    RAISE EXCEPTION 'dataset % is %; its signatures are frozen', NEW.dataset_id, ds.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NEW.user_id <> auth.uid() THEN
      RAISE EXCEPTION 'you can only sign as yourself' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF ds.analysis_sha256 IS NULL OR ds.analysis_size_bytes IS NULL OR ds.companion_sha256 IS NULL OR ds.companion_size_bytes IS NULL THEN
      RAISE EXCEPTION 'dataset % cannot be signed yet: record the analysis and companion files (sha256 and size) first', NEW.dataset_id
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    NEW.signed_at := now();
  ELSIF OLD.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'signature % was retracted and stays retracted; sign again instead', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  ELSIF NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['archived_at', 'archived_reason']) THEN
    RAISE EXCEPTION 'signature % can only be archived', OLD.id USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------- 2. dataset updates

-- Release state (status, released_at, project_id, companion_path) and identity are written only by
-- release_dataset. Withdrawing or superseding a released dataset needs a checked function (not built yet).
REVOKE UPDATE ON admin.dataset FROM authenticated;
GRANT UPDATE (result_file_id, version, dataset_format, value_type, storage_path, sha256,
              analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes,
              archived_at, archived_reason) ON admin.dataset TO authenticated;

-- Same as 0005, except that release counts distinct live signers eligible under the current policy against
-- the policy's required count (as release_dataset does), for every writer including the owner.
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
    RETURN NEW;
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

-- ---------------------------------------------------------------- 3. the wave 1 release RPC

DROP FUNCTION admin.release_dataset(uuid);

-- ---------------------------------------------------------------- 4 and 5. release

-- Same contract as 0005. In addition: the analysis file must be the one recorded on the dataset (sha256 and
-- size), and only signers eligible under the current policy become Team owners.
CREATE OR REPLACE FUNCTION admin.release_dataset(p_dataset_id uuid, p_analysis_object_path text, p_analysis_sha256 text,
                                                 p_analysis_size_bytes bigint, p_analysis_name text, p_companion_path text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  d admin.dataset;
  o admin."order";
  needed int := admin.required_signatures();
  have int;
  pid uuid;
BEGIN
  IF NOT admin.is_release_signer(auth.uid()) THEN
    RAISE EXCEPTION 'you are not an eligible release signer under the current policy' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO d FROM admin.dataset WHERE id = p_dataset_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset % not found or archived', p_dataset_id USING ERRCODE = 'no_data_found';
  END IF;
  IF d.status <> 'built' THEN
    RAISE EXCEPTION 'dataset % is already %', d.id, d.status USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Only distinct people who are eligible under the current policy count.
  SELECT count(DISTINCT user_id) INTO have FROM admin.signature
   WHERE dataset_id = d.id AND archived_at IS NULL AND admin.is_release_signer(user_id);
  IF have < needed THEN
    RAISE EXCEPTION 'release of dataset % needs % signatures by different eligible people (has %)', d.id, needed, have
      USING ERRCODE = 'check_violation';
  END IF;

  -- The signers approved the recorded files; publish exactly that analysis file.
  IF d.analysis_sha256 IS NULL OR p_analysis_sha256 IS DISTINCT FROM d.analysis_sha256
     OR p_analysis_size_bytes IS DISTINCT FROM d.analysis_size_bytes THEN
    RAISE EXCEPTION 'this is not the analysis file recorded and signed for dataset % (got sha256 %, % bytes; recorded %, % bytes)',
      d.id, p_analysis_sha256, p_analysis_size_bytes, d.analysis_sha256, d.analysis_size_bytes
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_analysis_object_path IS NULL OR p_analysis_object_path !~ '^[0-9a-f-]{36}/[0-9a-f]{64}$'
     OR split_part(p_analysis_object_path, '/', 2) IS DISTINCT FROM p_analysis_sha256 THEN
    RAISE EXCEPTION 'analysis object_path must be <project_id>/<sha256> of the analysis file (got %)', p_analysis_object_path
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  pid := split_part(p_analysis_object_path, '/', 1)::uuid;
  SELECT * INTO o FROM admin."order" WHERE id = d.order_id FOR UPDATE;

  -- Team's library: insert only. A signature of someone no longer eligible stays as evidence but grants
  -- nothing; that person can still be a viewer through a live client membership.
  INSERT INTO public.pilot_projects (id, name) VALUES (pid, o.code || coalesce(' ' || nullif(btrim(o.title), ''), ''));
  INSERT INTO public.pilot_members (project_id, user_id, role)
  SELECT DISTINCT ON (user_id) pid, user_id, role FROM (
    SELECT user_id, 'owner' AS role, 0 AS rank FROM admin.signature
     WHERE dataset_id = d.id AND archived_at IS NULL AND admin.is_release_signer(user_id)
    UNION ALL
    SELECT m.user_id, 'viewer', 1 FROM admin.client_member m JOIN admin.client c ON c.id = m.client_id
     WHERE m.client_id = d.client_id AND m.archived_at IS NULL AND c.archived_at IS NULL) people
  ORDER BY user_id, rank;
  INSERT INTO public.pilot_files (project_id, object_path, original_name, sha256, size_bytes, created_by)
  VALUES (pid, p_analysis_object_path, p_analysis_name, p_analysis_sha256, p_analysis_size_bytes, auth.uid());

  UPDATE admin.dataset SET status = 'released', project_id = pid, companion_path = p_companion_path WHERE id = d.id;
  PERFORM admin.advance_stage(o.id, 'released');
  RETURN pid;
END $$;

-- Signing refuses a dataset without its file manifest before anything else about the dataset.
CREATE OR REPLACE FUNCTION admin.sign_dataset(p_dataset_id uuid, p_role text, p_note text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  d admin.dataset;
  sid uuid;
BEGIN
  IF NOT admin.is_release_signer(auth.uid()) THEN
    RAISE EXCEPTION 'you are not an eligible release signer under the current policy' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO d FROM admin.dataset WHERE id = p_dataset_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset % not found or archived', p_dataset_id USING ERRCODE = 'no_data_found';
  END IF;
  IF d.status <> 'built' THEN
    RAISE EXCEPTION 'dataset % is %; it can no longer be signed', d.id, d.status USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF d.analysis_sha256 IS NULL OR d.analysis_size_bytes IS NULL OR d.companion_sha256 IS NULL OR d.companion_size_bytes IS NULL THEN
    RAISE EXCEPTION 'dataset % cannot be signed yet: record the analysis and companion files (sha256 and size) first', d.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF EXISTS (SELECT 1 FROM admin.signature WHERE dataset_id = d.id AND user_id = auth.uid() AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'you have already signed dataset %; a second signature must come from someone else', d.id
      USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO admin.signature (client_id, dataset_id, user_id, role, note)
  VALUES (d.client_id, d.id, auth.uid(), p_role, p_note)
  RETURNING id INTO sid;
  RETURN sid;
END $$;

-- ---------------------------------------------------------------- 6. register only into an open registry

-- Same as 0005, plus the stage check on the locked order before anything is inserted, so a grid left open
-- while the order moved on cannot append samples (and neither can a direct RPC call).
CREATE OR REPLACE FUNCTION admin.register_samples(p_order_id uuid, p_shipment_id uuid, p_samples jsonb) RETURNS SETOF admin.sample
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  dups text;
  e jsonb;
  s admin.sample;
BEGIN
  PERFORM admin.require_lab_writer('register samples');
  o := admin.lock_order(p_order_id);
  IF o.stage = 'request' THEN
    RAISE EXCEPTION '% is at stage request; receive the shipment before registering samples', o.code
      USING ERRCODE = 'object_not_in_prerequisite_state';
  ELSIF o.stage NOT IN ('received', 'registered') THEN
    RAISE EXCEPTION '% is at stage %; its sample registry is closed', o.code, o.stage
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF jsonb_typeof(p_samples) IS DISTINCT FROM 'array' OR jsonb_array_length(p_samples) = 0 THEN
    RAISE EXCEPTION 'p_samples must be a non-empty JSON array' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_shipment_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.shipment WHERE id = p_shipment_id AND order_id = o.id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'shipment % does not belong to order %', p_shipment_id, o.code USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_samples) x WHERE coalesce(btrim(x ->> 'full_name'), '') = '') THEN
    RAISE EXCEPTION 'every sample needs a full_name' USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT string_agg(n, ', ' ORDER BY n) INTO dups FROM (
    SELECT x ->> 'full_name' AS n FROM jsonb_array_elements(p_samples) x GROUP BY 1 HAVING count(*) > 1
    UNION
    SELECT s2.full_name FROM admin.sample s2
     WHERE s2.order_id = o.id AND s2.full_name IN (SELECT x ->> 'full_name' FROM jsonb_array_elements(p_samples) x)) d;
  IF dups IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate full_name in order %: %', o.code, dups USING ERRCODE = 'unique_violation';
  END IF;

  FOR e IN SELECT x FROM jsonb_array_elements(p_samples) WITH ORDINALITY AS t(x, n) ORDER BY n LOOP
    INSERT INTO admin.sample (client_id, order_id, shipment_id, full_name, client_sample_id, group1_term, group2_term,
                              replicate_term, patient_term, time_point_term, matrix, volume_ul)
    VALUES (o.client_id, o.id, p_shipment_id, e ->> 'full_name', e ->> 'client_sample_id', e ->> 'group1_term',
            e ->> 'group2_term', e ->> 'replicate_term', e ->> 'patient_term', e ->> 'time_point_term', e ->> 'matrix',
            (e ->> 'volume_ul')::numeric)
    RETURNING * INTO s;
    RETURN NEXT s;
  END LOOP;
  PERFORM admin.advance_stage(o.id, 'registered');
END $$;

-- ---------------------------------------------------------------- 7. bucket admin-files

-- Admin's own files: SCIEX OS results TXT and dataset companion files. Private; read by lab staff, written
-- by lab writers (owner, admin, operator) with their own token. Every object lives under
-- <client_id>/<order_code>/<at least one more segment>, naming a live order of that client. No UPDATE or
-- DELETE policy: an object is never overwritten (an upsert needs UPDATE) or removed.
-- Created like Team's case-files (pilot/supabase/schema.sql); needs Supabase Storage's schema.
INSERT INTO storage.buckets (id, name, public) VALUES ('admin-files', 'admin-files', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

CREATE FUNCTION admin.is_admin_files_path(p_name text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT coalesce(p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ORD[0-9]{3,}/[^/]'
                        AND p_name !~ '(^|/)\.{1,2}(/|$)' AND p_name !~ '//' AND p_name !~ '/$', false)
              AND EXISTS (SELECT 1 FROM admin."order" o
                           WHERE o.client_id::text = split_part(p_name, '/', 1) AND o.code = split_part(p_name, '/', 2)
                             AND o.archived_at IS NULL) $$;
REVOKE EXECUTE ON FUNCTION admin.is_admin_files_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.is_admin_files_path(text) TO authenticated; -- evaluated inside the policies below

CREATE POLICY admin_files_staff_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'admin-files' AND admin.is_lab_staff(auth.uid()));
CREATE POLICY admin_files_staff_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'admin-files' AND admin.is_lab_writer() AND admin.is_admin_files_path(name));

-- ---------------------------------------------------------------- 10. name dictionary

-- Fails if two live lab-wide entries already share an export name; archive one of them before applying.
CREATE UNIQUE INDEX name_map_lab_wide_export_name ON admin.name_map (export_name)
  WHERE client_id IS NULL AND archived_at IS NULL;

NOTIFY pgrst, 'reload schema';
