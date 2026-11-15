-- Who hears about what, by email (Gerardo, 2026-11-13): the Notifications page becomes an event x audience matrix that a
-- lab Owner or Admin edits, and the Admin app server emails four more events. 0001-0031 are never edited; this
-- migration depends only on 0028 (notifications) and 0029 (account emails).
--
-- Events (kind): the 0028 four, request_answered, dataset_released, order_requested and access_requested, plus
--   shipment_received  a shipment was recorded for an order (receive_shipment);
--   gate_failed        a pipeline gate turned red: a shipment arrived not intact, or injections were recorded Failed;
--   batch_acquired     a batch was marked acquired (mark_batch_acquired), for each order in it;
--   results_missing    an order is still Acquired, with no accepted results TXT, N days after it was acquired (the
--                      scheduled check, below; N = days, 3 by default).
-- Audiences, one cell each: lab staff by lab role (Owner, Admin, Operator; a lab Member sees no client data), the
-- owner of the step (gate_failed only: who recorded the step that failed), the client's admins, and the requester
-- (the client member who asked for the order). Nothing is sent to a cell that is off; each person may still turn a
-- kind off for themselves (0028 notification_pref).
--
-- 1. admin.notification_rule: one row per kind, seeded with the defaults below. Lab staff read it; the service role
--    reads it to pick recipients; only set_notification_rule (lab Owner or Admin) changes it. Audited (zz_audit).
-- 2. admin.notification_event: one row per order the scheduled check has emailed about, so each order is announced
--    once. Written only by claim_results_missing (service role); lab staff read it. Audited, never deleted.
-- 3. admin.claim_results_missing(): service role only. Finds the orders due (stage acquired, live order and client,
--    acquired - from the order's audit row that moved it to acquired - at least `days` days ago, not yet announced),
--    records them in notification_event and returns them; a concurrent call gets each order at most once. Does
--    nothing while every audience of results_missing is off. The app calls it from the lab's Pipeline page, at most
--    once every 10 minutes per server.
-- 4. notification_pref and notification_log take the new kinds; set_my_notification_pref accepts them.

-- ---------------------------------------------------------------- kinds

ALTER TABLE admin.notification_pref DROP CONSTRAINT notification_pref_kind_check;
ALTER TABLE admin.notification_pref ADD CONSTRAINT notification_pref_kind_check
  CHECK (kind IN ('request_answered', 'dataset_released', 'order_requested', 'access_requested',
                  'shipment_received', 'gate_failed', 'batch_acquired', 'results_missing'));
ALTER TABLE admin.notification_log DROP CONSTRAINT notification_log_kind_check;
ALTER TABLE admin.notification_log ADD CONSTRAINT notification_log_kind_check
  CHECK (kind IN ('request_answered', 'dataset_released', 'order_requested', 'access_requested', 'invitation', 'activation',
                  'shipment_received', 'gate_failed', 'batch_acquired', 'results_missing'));

-- ---------------------------------------------------------------- the matrix

CREATE TABLE admin.notification_rule (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  kind         text NOT NULL UNIQUE CHECK (kind IN ('request_answered', 'dataset_released', 'order_requested', 'access_requested',
                                                    'shipment_received', 'gate_failed', 'batch_acquired', 'results_missing')),
  lab_roles    text[] NOT NULL DEFAULT '{}' CHECK (lab_roles <@ ARRAY['owner', 'admin', 'operator']::text[]),
  step_owner   boolean NOT NULL DEFAULT false,
  client_admin boolean NOT NULL DEFAULT false,
  requester    boolean NOT NULL DEFAULT false,
  days         int CHECK (days BETWEEN 1 AND 60),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES auth.users,
  -- Only a failed gate has a step owner; only the scheduled check has a delay; an access request has no client yet.
  CHECK (NOT step_owner OR kind = 'gate_failed'),
  CHECK ((days IS NOT NULL) = (kind = 'results_missing')),
  CHECK (kind <> 'access_requested' OR NOT (client_admin OR requester))
);

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.notification_rule FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.notification_rule FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.notification_rule FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

-- The defaults: the prototype's five events, and the 0028 four as they were sent until now (dataset_released moves
-- from every client member to the client's admins and the requester, plus the lab's Operators).
INSERT INTO admin.notification_rule (kind, lab_roles, step_owner, client_admin, requester, days) VALUES
  ('shipment_received', '{admin}',                  false, true,  true,  NULL),
  ('gate_failed',       '{}',                       true,  false, false, NULL),
  ('batch_acquired',    '{operator}',               false, false, true,  NULL),
  ('results_missing',   '{operator,admin}',         false, false, false, 3),
  ('dataset_released',  '{operator}',               false, true,  true,  NULL),
  ('order_requested',   '{owner,admin,operator}',   false, false, false, NULL),
  ('request_answered',  '{}',                       false, false, true,  NULL),
  ('access_requested',  '{owner,admin,operator}',   false, false, false, NULL);

ALTER TABLE admin.notification_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_rule_read ON admin.notification_rule FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()));
REVOKE ALL ON admin.notification_rule FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON admin.notification_rule TO authenticated, service_role;

-- One row of the matrix, whole: the lab roles, the step owner, client admin, requester and the delay. Owner or Admin.
CREATE FUNCTION admin.set_notification_rule(p_kind text, p_lab_roles text[], p_step_owner boolean, p_client_admin boolean,
                                            p_requester boolean, p_days int) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_roles text[];
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to change who gets which email' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR NOT EXISTS (SELECT 1 FROM admin.notification_rule WHERE kind = p_kind) THEN
    RAISE EXCEPTION 'Unknown kind of email notification' USING ERRCODE = '22023';
  END IF;
  IF p_step_owner IS NULL OR p_client_admin IS NULL OR p_requester IS NULL THEN
    RAISE EXCEPTION 'Say for each audience whether it gets this email' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT r ORDER BY r), '{}') INTO v_roles FROM unnest(coalesce(p_lab_roles, '{}')) r;
  IF NOT v_roles <@ ARRAY['owner', 'admin', 'operator']::text[] THEN
    RAISE EXCEPTION 'Lab staff are chosen by role: owner, admin or operator' USING ERRCODE = '22023';
  END IF;
  IF p_step_owner AND p_kind <> 'gate_failed' THEN
    RAISE EXCEPTION 'Only a failed gate goes to the owner of the step' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'access_requested' AND (p_client_admin OR p_requester) THEN
    RAISE EXCEPTION 'An access request has no client yet; it goes to lab staff only' USING ERRCODE = '22023';
  END IF;
  IF (p_kind = 'results_missing') <> (p_days IS NOT NULL) OR p_days NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'The results check waits 1 to 60 days after acquisition; other events have no delay' USING ERRCODE = '22023';
  END IF;
  UPDATE admin.notification_rule
     SET lab_roles = v_roles, step_owner = p_step_owner, client_admin = p_client_admin, requester = p_requester, days = p_days,
         updated_at = now(), updated_by = auth.uid()
   WHERE kind = p_kind
     AND (lab_roles, step_owner, client_admin, requester, days) IS DISTINCT FROM (v_roles, p_step_owner, p_client_admin, p_requester, p_days);
END $$;

-- ---------------------------------------------------------------- the scheduled check

CREATE TABLE admin.notification_event (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind       text NOT NULL CHECK (kind = 'results_missing'),
  order_id   uuid NOT NULL REFERENCES admin."order",
  client_id  uuid NOT NULL REFERENCES admin.client,
  reference  text NOT NULL CHECK (length(reference) <= 40),
  UNIQUE (kind, order_id)
);
CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.notification_event FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.notification_event FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.notification_event FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

ALTER TABLE admin.notification_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_event_read ON admin.notification_event FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()));
REVOKE ALL ON admin.notification_event FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON admin.notification_event TO authenticated;

CREATE FUNCTION admin.claim_results_missing()
  RETURNS TABLE (order_id uuid, code text, title text, client_id uuid, client_name text, requested_by uuid, acquired_at timestamptz, days int)
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  WITH rule AS (
    SELECT r.days FROM admin.notification_rule r
     WHERE r.kind = 'results_missing' AND (cardinality(r.lab_roles) > 0 OR r.client_admin OR r.requester)
  ), acquired AS (
    SELECT o.id, o.code, o.title, o.client_id, c.name AS client_name, o.requested_by,
           (SELECT min(a.created_at) FROM admin.audit_event a
             WHERE a.entity = 'order' AND a.entity_id = o.id AND a.after ->> 'stage' = 'acquired') AS acquired_at
      FROM admin."order" o
      JOIN admin.client c ON c.id = o.client_id
     WHERE o.stage = 'acquired' AND o.archived_at IS NULL AND c.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM admin.notification_event e WHERE e.kind = 'results_missing' AND e.order_id = o.id)
  ), due AS (
    SELECT q.*, rule.days FROM acquired q, rule WHERE q.acquired_at <= now() - make_interval(days => rule.days)
  ), claimed AS (
    INSERT INTO admin.notification_event (kind, order_id, client_id, reference)
    SELECT 'results_missing', d.id, d.client_id, d.code FROM due d
    ON CONFLICT (kind, order_id) DO NOTHING
    RETURNING notification_event.order_id
  )
  SELECT d.id, d.code, d.title, d.client_id, d.client_name, d.requested_by, d.acquired_at, d.days
    FROM due d JOIN claimed k ON k.order_id = d.id
   ORDER BY d.code $$;

-- ---------------------------------------------------------------- the person's own switch takes the new kinds

CREATE OR REPLACE FUNCTION admin.set_my_notification_pref(p_kind text, p_enabled boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to change your email notifications' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('request_answered', 'dataset_released', 'order_requested', 'access_requested',
                                      'shipment_received', 'gate_failed', 'batch_acquired', 'results_missing') THEN
    RAISE EXCEPTION 'Unknown kind of email notification' USING ERRCODE = '22023';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Say whether this email notification is on or off' USING ERRCODE = '22023';
  END IF;
  INSERT INTO admin.notification_pref AS f (user_id, kind, enabled) VALUES (auth.uid(), p_kind, p_enabled)
  ON CONFLICT (user_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled WHERE f.enabled IS DISTINCT FROM EXCLUDED.enabled;
END $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.set_notification_rule(text, text[], boolean, boolean, boolean, int),
  admin.claim_results_missing() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.set_notification_rule(text, text[], boolean, boolean, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.claim_results_missing() TO service_role;

NOTIFY pgrst, 'reload schema';
