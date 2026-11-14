-- Who hears about what, corrected (Gerardo, 2026-11-14). Depends on 0036 (the matrix and the results check); 0036 is
-- not edited.
--
-- 1. Lab-only events. order_requested, gate_failed and results_missing are written for the lab (lab wording, links to
--    lab pages), like access_requested: no client cell may be on for them. Any such cell is turned off first, then the
--    0036 CHECK (access_requested only) is replaced by one for the four, and set_notification_rule refuses them.
-- 2. "Client members": a new cell, every active member of the order's client (viewers too), for the client-facing events
--    only. On for dataset_released, which reached every member before 0036; the lab can turn it off. Each person's own
--    switch still applies (notification_pref). set_notification_rule takes it as p_client_members; the old six-argument
--    function is dropped, so an app that does not know the cell cannot clear it by accident.
-- 3. The results check no longer loses an email. notification_event gets claimed_at (the lease) and sent_at. A claimed
--    order stays unsent until the app calls mark_results_missing_sent after the send; claim_results_missing hands an
--    unsent claim out again once its lease (15 minutes) has run out and the order is still Acquired, at most to one
--    caller (the UPDATE re-checks the lease under the row lock). Rows recorded before this migration count as sent.
-- 4. A discrepancy at receipt (confirm_shipment_receipt with tubes missing or not intact) is emailed by the app under the
--    shipment_received row: no new kind.

-- ---------------------------------------------------------------- 1 and 2: the matrix

UPDATE admin.notification_rule
   SET client_admin = false, requester = false, updated_at = now()
 WHERE kind IN ('order_requested', 'gate_failed', 'results_missing', 'access_requested') AND (client_admin OR requester);

DO $$
DECLARE v_name text;
BEGIN
  SELECT conname INTO v_name FROM pg_constraint
   WHERE conrelid = 'admin.notification_rule'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%client_admin%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE admin.notification_rule DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE admin.notification_rule ADD COLUMN client_members boolean NOT NULL DEFAULT false;
UPDATE admin.notification_rule SET client_members = true, updated_at = now() WHERE kind = 'dataset_released';
ALTER TABLE admin.notification_rule ADD CONSTRAINT notification_rule_lab_only
  CHECK (kind NOT IN ('order_requested', 'gate_failed', 'results_missing', 'access_requested') OR NOT (client_admin OR requester OR client_members));

DROP FUNCTION admin.set_notification_rule(text, text[], boolean, boolean, boolean, int);

-- One row of the matrix, whole: the lab roles, the step owner, client admin, requester, client members and the delay.
CREATE FUNCTION admin.set_notification_rule(p_kind text, p_lab_roles text[], p_step_owner boolean, p_client_admin boolean,
                                            p_requester boolean, p_client_members boolean, p_days int) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_roles text[];
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to change who gets which email' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR NOT EXISTS (SELECT 1 FROM admin.notification_rule WHERE kind = p_kind) THEN
    RAISE EXCEPTION 'Unknown kind of email notification' USING ERRCODE = '22023';
  END IF;
  IF p_step_owner IS NULL OR p_client_admin IS NULL OR p_requester IS NULL OR p_client_members IS NULL THEN
    RAISE EXCEPTION 'Say for each audience whether it gets this email' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT r ORDER BY r), '{}') INTO v_roles FROM unnest(coalesce(p_lab_roles, '{}')) r;
  IF NOT v_roles <@ ARRAY['owner', 'admin', 'operator']::text[] THEN
    RAISE EXCEPTION 'Lab staff are chosen by role: owner, admin or operator' USING ERRCODE = '22023';
  END IF;
  IF p_step_owner AND p_kind <> 'gate_failed' THEN
    RAISE EXCEPTION 'Only a failed gate goes to the owner of the step' USING ERRCODE = '22023';
  END IF;
  IF p_kind IN ('order_requested', 'gate_failed', 'results_missing', 'access_requested') AND (p_client_admin OR p_requester OR p_client_members) THEN
    RAISE EXCEPTION 'This email is written for the lab; it goes to lab staff only' USING ERRCODE = '22023';
  END IF;
  IF (p_kind = 'results_missing') <> (p_days IS NOT NULL) OR p_days NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'The results check waits 1 to 60 days after acquisition; other events have no delay' USING ERRCODE = '22023';
  END IF;
  UPDATE admin.notification_rule
     SET lab_roles = v_roles, step_owner = p_step_owner, client_admin = p_client_admin, requester = p_requester,
         client_members = p_client_members, days = p_days, updated_at = now(), updated_by = auth.uid()
   WHERE kind = p_kind
     AND (lab_roles, step_owner, client_admin, requester, client_members, days)
         IS DISTINCT FROM (v_roles, p_step_owner, p_client_admin, p_requester, p_client_members, p_days);
END $$;

-- ---------------------------------------------------------------- 3: the results check keeps unsent emails

ALTER TABLE admin.notification_event ADD COLUMN claimed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE admin.notification_event ADD COLUMN sent_at timestamptz;
UPDATE admin.notification_event SET claimed_at = created_at, sent_at = created_at;

-- The due orders not claimed yet, and the unsent claims whose lease ran out (order still Acquired, live order and
-- client); each is (re)claimed for 15 minutes and returned. Nothing while every audience of results_missing is off.
CREATE OR REPLACE FUNCTION admin.claim_results_missing()
  RETURNS TABLE (order_id uuid, code text, title text, client_id uuid, client_name text, requested_by uuid, acquired_at timestamptz, days int)
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  WITH rule AS (
    SELECT r.days FROM admin.notification_rule r
     WHERE r.kind = 'results_missing' AND (cardinality(r.lab_roles) > 0 OR r.client_admin OR r.requester OR r.client_members)
  ), live AS (
    SELECT o.id, o.code, o.title, o.client_id, c.name AS client_name, o.requested_by,
           (SELECT min(a.created_at) FROM admin.audit_event a
             WHERE a.entity = 'order' AND a.entity_id = o.id AND a.after ->> 'stage' = 'acquired') AS acquired_at
      FROM admin."order" o
      JOIN admin.client c ON c.id = o.client_id
     WHERE o.stage = 'acquired' AND o.archived_at IS NULL AND c.archived_at IS NULL
  ), due AS (
    SELECT q.*, rule.days FROM live q, rule
     WHERE q.acquired_at <= now() - make_interval(days => rule.days)
       AND NOT EXISTS (SELECT 1 FROM admin.notification_event e WHERE e.kind = 'results_missing' AND e.order_id = q.id)
  ), claimed AS (
    INSERT INTO admin.notification_event (kind, order_id, client_id, reference)
    SELECT 'results_missing', d.id, d.client_id, d.code FROM due d
    ON CONFLICT (kind, order_id) DO NOTHING
    RETURNING notification_event.order_id
  ), reclaimed AS (
    UPDATE admin.notification_event e SET claimed_at = now()
     WHERE e.kind = 'results_missing' AND e.sent_at IS NULL AND e.claimed_at <= now() - interval '15 minutes'
       AND EXISTS (SELECT 1 FROM rule) AND e.order_id IN (SELECT q.id FROM live q)
    RETURNING e.order_id
  )
  SELECT d.id, d.code, d.title, d.client_id, d.client_name, d.requested_by, d.acquired_at, d.days
    FROM due d JOIN claimed k ON k.order_id = d.id
  UNION ALL
  SELECT q.id, q.code, q.title, q.client_id, q.client_name, q.requested_by, q.acquired_at, rule.days
    FROM live q JOIN reclaimed k ON k.order_id = q.id CROSS JOIN rule
   ORDER BY 2 $$;

-- The app emailed the order (or there was nobody to email): it is never handed out again.
CREATE FUNCTION admin.mark_results_missing_sent(p_order_id uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  UPDATE admin.notification_event SET sent_at = now()
   WHERE kind = 'results_missing' AND order_id = p_order_id AND sent_at IS NULL $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.set_notification_rule(text, text[], boolean, boolean, boolean, boolean, int),
  admin.claim_results_missing(), admin.mark_results_missing_sent(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.set_notification_rule(text, text[], boolean, boolean, boolean, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.claim_results_missing(), admin.mark_results_missing_sent(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
