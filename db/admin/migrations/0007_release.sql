-- Admin wave 2b, release side (docs/admin/admin-wave2b-brief.md). 0005 and 0006 are applied on staging and
-- are never edited; everything here is additive.
--
--  1. build_dataset: the contract function that creates a dataset version. Operator+; the results file must be
--     the one accepted for that order; the manifest of the combined workbook and of the two files it is split
--     into (analysis = Abundance + Metadata, companion = Internal_Standards + QC_Injections + Provenance) is
--     recorded at once, so the version can be signed; versions are numbered per order; stage → excel_built.
--  2. withdraw_dataset and supersede_dataset: the two moves a released dataset may still make (0006 took
--     dataset.status away from the app role). Both need an eligible signer under the current policy, both
--     retire the row (archived_at + archived_reason, the schema's way of retiring anything), both are
--     audited like every update. Team's library is never touched: the project a withdrawn or superseded
--     dataset created stays there (Admin only inserts into Team tables).
--  3. The analysis file reaches Team's bucket case-files before release_dataset creates the project (Team's
--     own insert policy needs project membership, which does not exist yet). An eligible signer may stage it
--     with their own token at <project_id>/<analysis_sha256> while that digest belongs to a built dataset and
--     the project id is unused. No service role is needed in the app.

-- ---------------------------------------------------------------- 1. build

CREATE FUNCTION admin.build_dataset(p_order_id uuid, p_result_file_id uuid, p_storage_path text, p_sha256 text,
                                    p_analysis_sha256 text, p_analysis_size_bytes bigint,
                                    p_companion_sha256 text, p_companion_size_bytes bigint) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  f admin.result_file;
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
  IF coalesce(btrim(p_storage_path), '') = '' THEN
    RAISE EXCEPTION 'p_storage_path (the combined workbook in admin-files) is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_sha256 IS NULL OR p_analysis_sha256 IS NULL OR p_analysis_size_bytes IS NULL
     OR p_companion_sha256 IS NULL OR p_companion_size_bytes IS NULL THEN
    RAISE EXCEPTION 'a built dataset records the combined workbook and both files it is split into (sha256 and size)'
      USING ERRCODE = 'not_null_violation';
  END IF;
  -- The order row is locked, so concurrent builds of one order get distinct numbers (retired versions count).
  SELECT coalesce(max(version), 0) + 1 INTO next_version FROM admin.dataset WHERE order_id = o.id;
  INSERT INTO admin.dataset (client_id, order_id, result_file_id, version, storage_path, sha256,
                             analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes)
  VALUES (o.client_id, o.id, f.id, next_version, btrim(p_storage_path), p_sha256,
          p_analysis_sha256, p_analysis_size_bytes, p_companion_sha256, p_companion_size_bytes)
  RETURNING id INTO did;
  PERFORM admin.advance_stage(o.id, 'excel_built');
  RETURN did;
END $$;

-- ---------------------------------------------------------------- 2. withdraw, supersede

CREATE FUNCTION admin.withdraw_dataset(p_dataset_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  d admin.dataset;
BEGIN
  IF NOT admin.is_release_signer(auth.uid()) THEN
    RAISE EXCEPTION 'you are not an eligible release signer under the current policy' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'withdrawing a dataset needs a reason' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO d FROM admin.dataset WHERE id = p_dataset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset % not found', p_dataset_id USING ERRCODE = 'no_data_found';
  END IF;
  IF d.status <> 'released' THEN
    RAISE EXCEPTION 'dataset % is %; only a released dataset can be withdrawn', d.id, d.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE admin.dataset SET status = 'withdrawn', archived_at = now(), archived_reason = btrim(p_reason) WHERE id = d.id;
END $$;

CREATE FUNCTION admin.supersede_dataset(p_dataset_id uuid, p_new_dataset_id uuid) RETURNS void
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
  SELECT * INTO d FROM admin.dataset WHERE id = p_dataset_id FOR UPDATE;
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
    RAISE EXCEPTION 'dataset % (version %) is %; a dataset is superseded only by a released version of the same order', n.id, n.version, n.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF n.version <= d.version THEN
    RAISE EXCEPTION 'dataset % (version %) is not newer than version %', n.id, n.version, d.version USING ERRCODE = 'invalid_parameter_value';
  END IF;
  UPDATE admin.dataset SET status = 'superseded', archived_at = now(), archived_reason = 'superseded by version ' || n.version || ' (' || n.id || ')'
   WHERE id = d.id;
END $$;

-- ---------------------------------------------------------------- 3. the analysis file in case-files before release

-- <project_id>/<analysis_sha256>: the caller is an eligible signer, the digest is the recorded analysis file of a
-- built, live dataset (so a signed-off artefact, not anything else), and no Team project has that id yet.
-- Once released the digest is no longer pending; Team's own policy (project membership) takes over.
CREATE FUNCTION admin.is_pending_analysis_path(p_name text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT coalesce(p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}$', false)
               AND admin.is_release_signer(auth.uid())
               AND NOT EXISTS (SELECT 1 FROM public.pilot_projects p WHERE p.id::text = split_part(p_name, '/', 1))
               AND EXISTS (SELECT 1 FROM admin.dataset d
                            WHERE d.analysis_sha256 = split_part(p_name, '/', 2) AND d.status = 'built' AND d.archived_at IS NULL) $$;
REVOKE EXECUTE ON FUNCTION admin.is_pending_analysis_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.is_pending_analysis_path(text) TO authenticated; -- evaluated inside the policy below

CREATE POLICY case_files_release_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-files' AND admin.is_pending_analysis_path(name));

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION
  admin.build_dataset(uuid, uuid, text, text, text, bigint, text, bigint),
  admin.withdraw_dataset(uuid, text),
  admin.supersede_dataset(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  admin.build_dataset(uuid, uuid, text, text, text, bigint, text, bigint),
  admin.withdraw_dataset(uuid, text),
  admin.supersede_dataset(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
