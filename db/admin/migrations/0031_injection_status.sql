-- Run monitor: the lab records how each injection of a running batch went.
--
-- admin.injection.status (0001: planned, acquired, failed, skipped) was only moved in bulk by mark_batch_acquired.
-- The 7500 PC stays offline, so the operator pastes the batch status exported from SCIEX OS (or sets one injection)
-- and Admin matches each row by injection name (sample_name).
--
-- admin.record_injection_status(p_batch_id uuid, p_rows jsonb) RETURNS int
--   p_rows: [{"sample_name": "...", "status": "planned" | "acquired" | "failed" | "skipped"}, ...]
--   Lab writers only. The batch must be Sequence exported or Acquired (a failure may be noticed after the run);
--   only the latest live, exported version's live injections are touched (freeze_injection lets status move).
--   An unknown name or status refuses the whole call. Returns how many injections changed status.
--   The batch status and the orders' stages are not moved here: Mark acquired still does that.

CREATE FUNCTION admin.record_injection_status(p_batch_id uuid, p_rows jsonb) RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  b admin.batch;
  v admin.batch_version;
  r jsonb;
  v_name text;
  v_status text;
  v_changed int := 0;
  n int;
BEGIN
  PERFORM admin.require_lab_writer('record injection status');
  b := admin.lock_batch(p_batch_id);
  IF b.status NOT IN ('sequence_exported', 'acquired') THEN
    RAISE EXCEPTION 'batch % is %; injection status is recorded once its sequence is exported and until results are accepted', b.name, b.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v FROM admin.batch_version WHERE batch_id = b.id AND archived_at IS NULL ORDER BY version DESC LIMIT 1;
  IF v.id IS NULL OR v.exported_at IS NULL THEN
    RAISE EXCEPTION 'the latest version of batch % was not exported', b.name USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'send at least one injection and its status' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_name := btrim(coalesce(r->>'sample_name', ''));
    v_status := lower(btrim(coalesce(r->>'status', '')));
    IF v_status NOT IN ('planned', 'acquired', 'failed', 'skipped') THEN
      RAISE EXCEPTION 'status "%" for % is not one of planned, acquired, failed, skipped', v_status, v_name USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM admin.injection WHERE batch_version_id = v.id AND archived_at IS NULL AND sample_name = v_name) THEN
      RAISE EXCEPTION 'batch % has no injection named %', b.name, v_name USING ERRCODE = 'P0002';
    END IF;
    UPDATE admin.injection SET status = v_status
     WHERE batch_version_id = v.id AND archived_at IS NULL AND sample_name = v_name AND status <> v_status;
    GET DIAGNOSTICS n = ROW_COUNT;
    v_changed := v_changed + n;
  END LOOP;
  RETURN v_changed;
END $$;

REVOKE EXECUTE ON FUNCTION admin.record_injection_status(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.record_injection_status(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
