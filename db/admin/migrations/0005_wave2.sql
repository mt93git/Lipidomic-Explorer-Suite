-- Admin wave 2: the six write functions of the UI/database contract (docs/admin/admin-wave2-brief.md)
-- and the release policy. Every function is SECURITY DEFINER with a pinned search_path, checks the
-- caller inside, and is executable by `authenticated` only.
--
-- Release and Team: a released dataset becomes a project in Team's library (public.pilot_projects,
-- pilot_members, pilot_files; see pilot/supabase/schema.sql). Admin only INSERTs there, only from
-- admin.release_dataset, and never updates or deletes Team rows.
-- Project id: the app server generates it, uploads the analysis file to bucket case-files at
-- <project_id>/<sha256> (Team's rule), then calls release_dataset with that path; the function takes
-- the project id from the path and returns it.

-- ---------------------------------------------------------------- columns the contract needs

-- A batch built by hand in SCIEX OS and recorded when its results file is accepted.
ALTER TABLE admin.batch ADD COLUMN imported boolean NOT NULL DEFAULT false;

-- The order a results file was accepted for (an imported batch has no injections to link it), and
-- the parser summary shown at acceptance.
ALTER TABLE admin.result_file ADD COLUMN order_id uuid REFERENCES admin."order";
ALTER TABLE admin.result_file ADD COLUMN summary jsonb;

-- Set at release: the Team project created from the dataset, and Admin's companion file
-- (Internal_Standards, QC_Injections, Provenance), which never goes into pilot_files.
ALTER TABLE admin.dataset ADD COLUMN project_id uuid;
ALTER TABLE admin.dataset ADD COLUMN companion_path text;

-- ---------------------------------------------------------------- release policy

-- One current row (archived_at IS NULL); every earlier policy is kept, archived. Written only by
-- admin.set_release_policy (lab Owner); the app role may only read it.
-- eligible_signers empty = any lab owner or admin may sign. No row = the same, with 2 signatures.
CREATE TABLE admin.release_policy (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  archived_at         timestamptz,
  archived_reason     text,
  eligible_signers    uuid[] NOT NULL DEFAULT '{}',
  required_signatures int NOT NULL CHECK (required_signatures >= 2),
  set_by              uuid REFERENCES auth.users,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);
CREATE UNIQUE INDEX release_policy_one_current ON admin.release_policy ((true)) WHERE archived_at IS NULL;

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.release_policy FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.release_policy FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.release_policy FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

ALTER TABLE admin.release_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY release_policy_read ON admin.release_policy FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()));
REVOKE ALL ON admin.release_policy FROM PUBLIC;
GRANT SELECT ON admin.release_policy TO authenticated;

-- ---------------------------------------------------------------- internal helpers (not granted)

CREATE FUNCTION admin.required_signatures() RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT coalesce((SELECT required_signatures FROM admin.release_policy WHERE archived_at IS NULL), 2) $$;

-- May this user sign or release under the current policy? A listed person must still be lab staff.
CREATE FUNCTION admin.is_release_signer(uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT CASE WHEN coalesce(cardinality(p.eligible_signers), 0) = 0
                    THEN coalesce(admin.lab_role(uid) IN ('owner', 'admin'), false)
                    ELSE uid = ANY (p.eligible_signers) AND admin.is_lab_staff(uid) END
        FROM (SELECT 1) one LEFT JOIN admin.release_policy p ON p.archived_at IS NULL $$;

-- Move an order forward to a stage; never moves it back (going back is an explicit, separate act).
CREATE FUNCTION admin.advance_stage(p_order uuid, target text) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  WITH s(list) AS (SELECT ARRAY['request', 'received', 'registered', 'extracted', 'in_batch', 'sequence_exported',
                                'acquired', 'processed', 'qc_checked', 'excel_built', 'released'])
  UPDATE admin."order" o SET stage = target FROM s
   WHERE o.id = p_order AND array_position(s.list, o.stage) < array_position(s.list, target) $$;

CREATE FUNCTION admin.require_lab_writer(action text) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF NOT admin.is_lab_writer() THEN
    RAISE EXCEPTION 'only lab staff (owner, admin, operator) may %', action USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;

-- Lock and return a live order, or fail clearly.
CREATE FUNCTION admin.lock_order(p_order uuid) RETURNS admin."order"
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE o admin."order";
BEGIN
  SELECT * INTO o FROM admin."order" WHERE id = p_order AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found or archived', p_order USING ERRCODE = 'no_data_found';
  END IF;
  RETURN o;
END $$;

-- ---------------------------------------------------------------- dataset guard (replaces 0003)

-- Same rules as 0003; in addition project_id is never set by hand and, together with companion_path,
-- may be written on a signed dataset only in the release update itself.
CREATE OR REPLACE FUNCTION admin.guard_dataset() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  allowed text[] := ARRAY['archived_at', 'archived_reason'];
  signers int;
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

  SELECT count(DISTINCT user_id) INTO signers
    FROM admin.signature WHERE dataset_id = OLD.id AND archived_at IS NULL;

  IF signers > 0 AND NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW),
       ARRAY['status', 'released_at', 'archived_at', 'archived_reason']
       || CASE WHEN NEW.status = 'released' THEN ARRAY['project_id', 'companion_path'] ELSE '{}'::text[] END) THEN
    RAISE EXCEPTION 'dataset % is signed; its content cannot change (build a new version)', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NEW.status = 'released' THEN
    IF signers < 2 THEN
      RAISE EXCEPTION 'release of dataset % needs two signatures by two different people (has %)', OLD.id, signers
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.released_at := now();
  ELSIF NEW.status <> 'built' THEN
    RAISE EXCEPTION 'dataset % is not released; it cannot become %', OLD.id, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------- contract functions

CREATE FUNCTION admin.receive_shipment(p_order_id uuid, p_carrier text, p_tracking_number text, p_condition text,
                                       p_box_count int, p_notes text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  sid uuid;
BEGIN
  PERFORM admin.require_lab_writer('receive shipments');
  o := admin.lock_order(p_order_id);
  INSERT INTO admin.shipment (client_id, order_id, carrier, tracking_number, condition, box_count, notes, received_at, received_by)
  VALUES (o.client_id, o.id, p_carrier, p_tracking_number, p_condition, p_box_count, p_notes, now(), auth.uid())
  RETURNING id INTO sid;
  PERFORM admin.advance_stage(o.id, 'received');
  RETURN sid;
END $$;

-- All-or-nothing: any error (duplicate, bad value, constraint) aborts the whole call.
CREATE FUNCTION admin.register_samples(p_order_id uuid, p_shipment_id uuid, p_samples jsonb) RETURNS SETOF admin.sample
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  dups text;
  e jsonb;
  s admin.sample;
BEGIN
  PERFORM admin.require_lab_writer('register samples');
  o := admin.lock_order(p_order_id);
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

-- The batch is the one the order's injections (or an earlier accepted file) point to; with none, a batch
-- marked imported is created (built by hand in SCIEX OS). An order spread over several batches is refused.
CREATE FUNCTION admin.accept_result_file(p_order_id uuid, p_storage_path text, p_sha256 text, p_sciex_os_version text,
                                         p_processing_method text, p_summary jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  batches uuid[];
  bid uuid;
  yr text := to_char(now(), 'YYYY');
  rid uuid;
BEGIN
  PERFORM admin.require_lab_writer('accept results files');
  o := admin.lock_order(p_order_id);

  SELECT array_agg(DISTINCT b) INTO batches FROM (
    SELECT v.batch_id AS b FROM admin.injection i
      JOIN admin.batch_version v ON v.id = i.batch_version_id
      JOIN admin.aliquot a ON a.id = i.aliquot_id
      JOIN admin.sample s ON s.id = a.sample_id
     WHERE s.order_id = o.id AND i.archived_at IS NULL AND v.archived_at IS NULL
    UNION
    SELECT f.batch_id FROM admin.result_file f
     WHERE f.order_id = o.id AND f.status = 'accepted' AND f.archived_at IS NULL) x
   WHERE b IN (SELECT id FROM admin.batch WHERE archived_at IS NULL);

  IF cardinality(batches) > 1 THEN
    RAISE EXCEPTION 'order % is in % batches; accepting a file for it needs the batch to be chosen', o.code, cardinality(batches)
      USING ERRCODE = 'cardinality_violation';
  ELSIF cardinality(batches) = 1 THEN
    bid := batches[1];
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('admin.batch.name'));
    INSERT INTO admin.batch (name, panel_id, status, imported, notes)
    SELECT 'B' || yr || '-' || admin.pad3(coalesce(max(substr(name, 7)::bigint), 0) + 1), o.panel_id, 'processed', true,
           'imported: batch built by hand in SCIEX OS'
      FROM admin.batch WHERE name LIKE 'B' || yr || '-%'
    RETURNING id INTO bid;
  END IF;

  INSERT INTO admin.result_file (batch_id, order_id, sha256, storage_path, sciex_os_version, processing_method, summary,
                                 uploaded_by, status, accepted_at, accepted_by)
  VALUES (bid, o.id, p_sha256, p_storage_path, p_sciex_os_version, p_processing_method, p_summary,
          auth.uid(), 'accepted', now(), auth.uid())
  RETURNING id INTO rid;
  PERFORM admin.advance_stage(o.id, 'processed');
  RETURN rid;
END $$;

CREATE FUNCTION admin.set_release_policy(p_eligible_signers uuid[], p_required_signatures int) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  -- The caller's list in its own order (the UI shows it), without NULLs or duplicates.
  signers uuid[] := ARRAY(SELECT u FROM unnest(coalesce(p_eligible_signers, '{}')) WITH ORDINALITY t(u, n)
                           WHERE u IS NOT NULL GROUP BY u ORDER BY min(n));
  outsiders text;
BEGIN
  IF admin.lab_role(auth.uid()) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only a lab owner may set the release policy' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_required_signatures IS NULL OR p_required_signatures < 2 THEN
    RAISE EXCEPTION 'a release needs at least 2 signatures (got %)', p_required_signatures USING ERRCODE = 'check_violation';
  END IF;
  SELECT string_agg(u::text, ', ') INTO outsiders FROM unnest(signers) u WHERE NOT admin.is_lab_staff(u);
  IF outsiders IS NOT NULL THEN
    RAISE EXCEPTION 'eligible signers must be lab staff (owner, admin, operator); not lab staff: %', outsiders
      USING ERRCODE = 'check_violation';
  END IF;
  IF cardinality(signers) > 0 AND cardinality(signers) < p_required_signatures THEN
    RAISE EXCEPTION 'fewer eligible signers (%) than required signatures (%)', cardinality(signers), p_required_signatures
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('admin.release_policy'));
  UPDATE admin.release_policy SET archived_at = now(), archived_reason = 'replaced' WHERE archived_at IS NULL;
  INSERT INTO admin.release_policy (eligible_signers, required_signatures, set_by)
  VALUES (signers, p_required_signatures, auth.uid());
END $$;

CREATE FUNCTION admin.sign_dataset(p_dataset_id uuid, p_role text, p_note text) RETURNS uuid
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
  IF EXISTS (SELECT 1 FROM admin.signature WHERE dataset_id = d.id AND user_id = auth.uid() AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'you have already signed dataset %; a second signature must come from someone else', d.id
      USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO admin.signature (client_id, dataset_id, user_id, role, note)
  VALUES (d.client_id, d.id, auth.uid(), p_role, p_note)
  RETURNING id INTO sid;
  RETURN sid;
END $$;

CREATE FUNCTION admin.release_dataset(p_dataset_id uuid, p_analysis_object_path text, p_analysis_sha256 text,
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

  IF p_analysis_object_path IS NULL OR p_analysis_object_path !~ '^[0-9a-f-]{36}/[0-9a-f]{64}$'
     OR split_part(p_analysis_object_path, '/', 2) IS DISTINCT FROM p_analysis_sha256 THEN
    RAISE EXCEPTION 'analysis object_path must be <project_id>/<sha256> of the analysis file (got %)', p_analysis_object_path
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  pid := split_part(p_analysis_object_path, '/', 1)::uuid;
  SELECT * INTO o FROM admin."order" WHERE id = d.order_id FOR UPDATE;

  -- Team's library: insert only.
  INSERT INTO public.pilot_projects (id, name) VALUES (pid, o.code || coalesce(' ' || nullif(btrim(o.title), ''), ''));
  INSERT INTO public.pilot_members (project_id, user_id, role)
  SELECT DISTINCT ON (user_id) pid, user_id, role FROM (
    SELECT user_id, 'owner' AS role, 0 AS rank FROM admin.signature WHERE dataset_id = d.id AND archived_at IS NULL
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

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.required_signatures(), admin.is_release_signer(uuid), admin.advance_stage(uuid, text),
  admin.require_lab_writer(text), admin.lock_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
  admin.receive_shipment(uuid, text, text, text, int, text),
  admin.register_samples(uuid, uuid, jsonb),
  admin.accept_result_file(uuid, text, text, text, text, jsonb),
  admin.set_release_policy(uuid[], int),
  admin.sign_dataset(uuid, text, text),
  admin.release_dataset(uuid, text, text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  admin.receive_shipment(uuid, text, text, text, int, text),
  admin.register_samples(uuid, uuid, jsonb),
  admin.accept_result_file(uuid, text, text, text, text, jsonb),
  admin.set_release_policy(uuid[], int),
  admin.sign_dataset(uuid, text, text),
  admin.release_dataset(uuid, text, text, bigint, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
