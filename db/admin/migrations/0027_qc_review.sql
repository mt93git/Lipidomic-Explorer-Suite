-- QC review (Gerardo, 2026-11-10): sample exclusions plus an optional "QC reviewed" step. Scientific QC lives in
-- Nexo/R; Admin only records the lab's decisions. An exclusion never changes science: build_dataset does not read
-- admin.exclusion, so no sample's data is dropped or altered; the decisions are shown beside the dataset's provenance.
-- 0001-0026 are never edited.
--
-- 1. admin.exclusion: at most one live exclusion per sample (partial unique index), and no direct insert or update by
--    the app role any more: the lab records and withdraws exclusions only through the two functions below.
-- 2. add_exclusion(p_sample_id, p_reason): a lab writer (require_lab_writer, the sample registry's rule) excludes a
--    live sample of a live order at processed or qc_checked, with a reason; decided_by is the caller.
-- 3. withdraw_exclusion(p_exclusion_id, p_reason): archives a live exclusion with the reason; same writers, same stages.
-- 4. mark_qc_checked(p_order_id): processed → qc_checked; refused at any other stage. The step is optional: the release
--    path (build_dataset, 0008) has no stage check and moves processed or qc_checked to excel_built alike.
-- Each write is recorded by the tables' zz_audit trigger (0003), with the caller as actor.

CREATE UNIQUE INDEX exclusion_live_sample ON admin.exclusion (sample_id) WHERE archived_at IS NULL;

REVOKE INSERT, UPDATE ON admin.exclusion FROM authenticated;

-- The sample's order, locked, when its exclusions may change (Processed or QC reviewed); otherwise a clear refusal.
CREATE FUNCTION admin.lock_order_for_exclusions(p_order_id uuid) RETURNS admin."order"
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE o admin."order";
BEGIN
  o := admin.lock_order(p_order_id);
  IF o.stage NOT IN ('processed', 'qc_checked') THEN
    RAISE EXCEPTION '% is at stage %; exclusions are recorded only while an order is processed or QC reviewed', o.code, o.stage
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN o;
END $$;

CREATE FUNCTION admin.add_exclusion(p_sample_id uuid, p_reason text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  s admin.sample;
  o admin."order";
  eid uuid;
BEGIN
  PERFORM admin.require_lab_writer('exclude samples');
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'give the reason for excluding this sample' USING ERRCODE = 'not_null_violation';
  END IF;
  SELECT * INTO s FROM admin.sample WHERE id = p_sample_id AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sample % not found or archived', p_sample_id USING ERRCODE = 'no_data_found';
  END IF;
  o := admin.lock_order_for_exclusions(s.order_id);
  IF EXISTS (SELECT 1 FROM admin.exclusion WHERE sample_id = s.id AND archived_at IS NULL) THEN
    RAISE EXCEPTION '% is already excluded; withdraw that exclusion first', s.sample_code USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO admin.exclusion (client_id, sample_id, reason, decided_by)
  VALUES (s.client_id, s.id, btrim(p_reason), auth.uid())
  RETURNING id INTO eid;
  RETURN eid;
END $$;

CREATE FUNCTION admin.withdraw_exclusion(p_exclusion_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  e admin.exclusion;
  s admin.sample;
BEGIN
  PERFORM admin.require_lab_writer('withdraw exclusions');
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'give the reason for withdrawing this exclusion' USING ERRCODE = 'not_null_violation';
  END IF;
  SELECT * INTO e FROM admin.exclusion WHERE id = p_exclusion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'exclusion % not found', p_exclusion_id USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO s FROM admin.sample WHERE id = e.sample_id;
  PERFORM admin.lock_order_for_exclusions(s.order_id);
  -- Read again under the order lock: a concurrent withdrawal has finished by now.
  SELECT * INTO e FROM admin.exclusion WHERE id = p_exclusion_id FOR UPDATE;
  IF e.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'the exclusion of % was already withdrawn', s.sample_code USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE admin.exclusion SET archived_at = now(), archived_reason = btrim(p_reason) WHERE id = e.id;
END $$;

CREATE FUNCTION admin.mark_qc_checked(p_order_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE o admin."order";
BEGIN
  PERFORM admin.require_lab_writer('mark orders QC reviewed');
  o := admin.lock_order(p_order_id);
  IF o.stage <> 'processed' THEN
    RAISE EXCEPTION '% is at stage %; only a processed order can be marked QC reviewed', o.code, o.stage
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM admin.advance_stage(o.id, 'qc_checked');
END $$;

REVOKE EXECUTE ON FUNCTION admin.lock_order_for_exclusions(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION admin.add_exclusion(uuid, text), admin.withdraw_exclusion(uuid, text), admin.mark_qc_checked(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.add_exclusion(uuid, text), admin.withdraw_exclusion(uuid, text), admin.mark_qc_checked(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
