-- Admin wave 2b fixes (docs/admin/wave2b-review.md, findings 1, 3 and 7; 2, 4, 6 and 8 are app-side). 0005-0007
-- are never edited; everything here is additive or replaces a function, a grant or a policy.
--
--  1. build_dataset is the only way a dataset is created: no INSERT for the app role. Its content (source
--     results file, order, client, version, format, value type, path, workbook digest and the analysis/companion
--     manifest) never changes after the build, for any writer: the app role may only archive a discarded build,
--     and the dataset trigger refuses a content change even to the migration owner. The combined workbook's path
--     is bound to the order and to its own digest: <client_id>/<order_code>/datasets/<sha256>/<name>.xlsx.
--  3. supersede_dataset locks both versions in one order (by id) and needs a live (unarchived) released
--     replacement. A released dataset is retired only through withdraw_dataset or supersede_dataset: archiving it
--     without retiring it, or retiring it without archiving it, is refused for every writer.
--  7. build_dataset takes the version the caller wrote into the files (p_expected_version) and refuses another
--     one under the order lock (SQLSTATE PT409, HTTP 409: build the files again; not 40001, which PostgREST retries forever), so the dataset_version in a workbook's
--     Provenance always equals admin.dataset.version. The eight-argument function without it is dropped.

-- ---------------------------------------------------------------- 1. no direct writes of dataset content

DROP POLICY dataset_insert ON admin.dataset;
-- Revoking the table privilege also revokes the column grants 0006 made; archiving is granted again.
REVOKE INSERT, UPDATE ON admin.dataset FROM authenticated;
GRANT UPDATE (archived_at, archived_reason) ON admin.dataset TO authenticated;

-- Same as 0006, plus: content never changes after the build; a released dataset is retired (withdrawn or
-- superseded) and archived together, never one without the other.
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
  IF NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW),
       ARRAY['status', 'released_at', 'project_id', 'companion_path', 'archived_at', 'archived_reason']) THEN
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

-- ---------------------------------------------------------------- 1 and 7. build_dataset

DROP FUNCTION admin.build_dataset(uuid, uuid, text, text, text, bigint, text, bigint);

-- Same contract as 0007, plus: the caller names the version it wrote into the files, and the combined workbook's
-- path is <client_id>/<order_code>/datasets/<p_sha256>/<name>.xlsx (the analysis and companion files sit beside
-- it under their own digests; the app derives those paths from the manifest).
CREATE FUNCTION admin.build_dataset(p_order_id uuid, p_result_file_id uuid, p_expected_version int, p_storage_path text, p_sha256 text,
                                    p_analysis_sha256 text, p_analysis_size_bytes bigint,
                                    p_companion_sha256 text, p_companion_size_bytes bigint) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  f admin.result_file;
  prefix text;
  next_version int;
  did uuid;
BEGIN
  PERFORM admin.require_lab_writer('build datasets');
  o := admin.lock_order(p_order_id);
  SELECT * INTO f FROM admin.result_file WHERE id = p_result_file_id AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'results file % not found or archived', p_result_file_id USING ERRCODE = 'no_data_found';
  END IF;
  IF f.order_id IS DISTINCT FROM o.id THEN
    RAISE EXCEPTION 'results file % was not accepted for order %', f.id, o.code USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF f.status <> 'accepted' THEN
    RAISE EXCEPTION 'results file % is %; only an accepted file is built into a dataset', f.id, f.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_expected_version IS NULL THEN
    RAISE EXCEPTION 'the expected version (the dataset_version written into the files) is required' USING ERRCODE = 'not_null_violation';
  END IF;
  IF p_sha256 IS NULL OR p_analysis_sha256 IS NULL OR p_analysis_size_bytes IS NULL
     OR p_companion_sha256 IS NULL OR p_companion_size_bytes IS NULL THEN
    RAISE EXCEPTION 'a built dataset records the combined workbook and both files it is split into (sha256 and size)'
      USING ERRCODE = 'not_null_violation';
  END IF;
  IF p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'p_sha256 must be the lowercase hex SHA-256 of the combined workbook (got %)', p_sha256 USING ERRCODE = 'invalid_parameter_value';
  END IF;
  prefix := o.client_id::text || '/' || o.code || '/datasets/' || p_sha256 || '/';
  IF p_storage_path IS NULL OR NOT starts_with(p_storage_path, prefix)
     OR substr(p_storage_path, length(prefix) + 1) !~ '^[^/]+\.xlsx$' THEN
    RAISE EXCEPTION 'p_storage_path must be %<name>.xlsx, the combined workbook under its own digest (got %)', prefix, p_storage_path
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- The order row is locked, so concurrent builds of one order see each other's versions (retired ones count).
  SELECT coalesce(max(version), 0) + 1 INTO next_version FROM admin.dataset WHERE order_id = o.id;
  IF p_expected_version <> next_version THEN
    RAISE EXCEPTION 'version % is next for order %, but these files were built for version %; build them again', next_version, o.code, p_expected_version
      USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO admin.dataset (client_id, order_id, result_file_id, version, storage_path, sha256,
                             analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes)
  VALUES (o.client_id, o.id, f.id, next_version, p_storage_path, p_sha256,
          p_analysis_sha256, p_analysis_size_bytes, p_companion_sha256, p_companion_size_bytes)
  RETURNING id INTO did;
  PERFORM admin.advance_stage(o.id, 'excel_built');
  RETURN did;
END $$;

-- ---------------------------------------------------------------- 3. supersede

-- Same as 0007, plus: both rows are locked together in id order before either is read (two supersedes, or a
-- supersede and a withdrawal, of the same pair cannot deadlock or interleave), and the replacement must be live.
CREATE OR REPLACE FUNCTION admin.supersede_dataset(p_dataset_id uuid, p_new_dataset_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  d admin.dataset;
  n admin.dataset;
BEGIN
  IF NOT admin.is_release_signer(auth.uid()) THEN
    RAISE EXCEPTION 'you are not an eligible release signer under the current policy' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_new_dataset_id IS NOT DISTINCT FROM p_dataset_id THEN
    RAISE EXCEPTION 'a dataset cannot supersede itself' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM 1 FROM admin.dataset WHERE id IN (p_dataset_id, p_new_dataset_id)
    ORDER BY id
    FOR UPDATE;
  SELECT * INTO d FROM admin.dataset WHERE id = p_dataset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset % not found', p_dataset_id USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO n FROM admin.dataset WHERE id = p_new_dataset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset % not found', p_new_dataset_id USING ERRCODE = 'no_data_found';
  END IF;
  IF d.status <> 'released' THEN
    RAISE EXCEPTION 'dataset % is %; only a released dataset can be superseded', d.id, d.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF n.order_id <> d.order_id THEN
    RAISE EXCEPTION 'dataset % belongs to another order', n.id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF n.status <> 'released' THEN
    RAISE EXCEPTION 'dataset % (version %) is %; a dataset is superseded only by a live released version of the same order', n.id, n.version, n.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF n.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'dataset % (version %) is archived; a dataset is superseded only by a live released version of the same order', n.id, n.version
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF n.version <= d.version THEN
    RAISE EXCEPTION 'dataset % (version %) is not newer than version %', n.id, n.version, d.version USING ERRCODE = 'invalid_parameter_value';
  END IF;
  UPDATE admin.dataset SET status = 'superseded', archived_at = now(), archived_reason = 'superseded by version ' || n.version || ' (' || n.id || ')'
   WHERE id = d.id;
END $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.build_dataset(uuid, uuid, int, text, text, text, bigint, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.build_dataset(uuid, uuid, int, text, text, text, bigint, text, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
