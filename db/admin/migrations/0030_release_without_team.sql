-- Team is retired (Gerardo, 2026-11-11: "Estamos apagando y descontinuando completamente a Team"). Releasing a
-- dataset no longer creates a Team project: no public.pilot_projects / pilot_members / pilot_files rows and no copy
-- of the analysis file in the case-files bucket. Nexo reads released datasets from admin.dataset and the
-- admin-files bucket only, which do not change. Projects made by earlier releases stay as they are.
-- 0001-0029 are never edited.
--
-- admin.release_dataset(p_dataset_id, p_companion_path), a new two-argument form: same checks as 0006 (an eligible
-- signer, a built dataset with its recorded analysis file, enough distinct eligible signatures), then the dataset is
-- released and the order moves to Released. The app calls only this form; the six-argument form of 0006 stays for
-- the history its tests describe and is no longer called.

CREATE FUNCTION admin.release_dataset(p_dataset_id uuid, p_companion_path text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  d admin.dataset;
  needed int := admin.required_signatures();
  have int;
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
  IF d.analysis_sha256 IS NULL THEN
    RAISE EXCEPTION 'dataset % has no recorded analysis file', d.id USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Only distinct people who are eligible under the current policy count.
  SELECT count(DISTINCT user_id) INTO have FROM admin.signature
   WHERE dataset_id = d.id AND archived_at IS NULL AND admin.is_release_signer(user_id);
  IF have < needed THEN
    RAISE EXCEPTION 'release of dataset % needs % signatures by different eligible people (has %)', d.id, needed, have
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM admin."order" WHERE id = d.order_id FOR UPDATE;
  UPDATE admin.dataset SET status = 'released', companion_path = p_companion_path WHERE id = d.id;
  PERFORM admin.advance_stage(d.order_id, 'released');
END $$;

REVOKE EXECUTE ON FUNCTION admin.release_dataset(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.release_dataset(uuid, text) TO authenticated;
