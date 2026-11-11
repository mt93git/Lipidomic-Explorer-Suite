-- Email notifications (Gerardo, 2026-11-10). The Admin app server sends short emails through Resend after four events:
-- to a client, (1) request_answered: their order request was accepted or declined (to the person who asked), and
-- (2) dataset_released: a dataset was released to their client (to every active member); to the lab (Owner, Admin and
-- Operator), (3) order_requested: a client asked for an order, and (4) access_requested: someone asked for access.
-- 0001-0024 are never edited; this migration does not depend on 0025-0027.
--
-- 1. admin.notification_pref: one row per person and kind they changed; no row means on. Written only by
--    set_my_notification_pref (any signed-in user, for themselves); each person reads their own rows. Audited.
-- 2. admin.notification_log: one row per recipient and email, sent, failed or skipped (with why). Inserted only by the
--    app server with the service role, read only by lab Owner and Admin. Append-only, like audit_event: it is itself
--    the record, so it has no zz_audit (which would copy the addresses into the audit log Operators read).
-- 3. admin.notification_audience(p_client_id): who could receive an email for an event: active lab staff with their
--    lab role, and the active members of that client (none for NULL) with their client role, each with their email and
--    the kinds they turned off. Service role only; the app picks the recipients per kind (src/lib/notifications.ts).

CREATE TABLE admin.notification_pref (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id    uuid NOT NULL REFERENCES auth.users,
  kind       text NOT NULL CHECK (kind IN ('request_answered', 'dataset_released', 'order_requested', 'access_requested')),
  enabled    boolean NOT NULL,
  UNIQUE (user_id, kind)
);

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.notification_pref FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.notification_pref FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.notification_pref FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

ALTER TABLE admin.notification_pref ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_pref_own ON admin.notification_pref FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON admin.notification_pref FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON admin.notification_pref TO authenticated;

CREATE TABLE admin.notification_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind       text NOT NULL CHECK (kind IN ('request_answered', 'dataset_released', 'order_requested', 'access_requested')),
  user_id    uuid NOT NULL REFERENCES auth.users,
  email      text NOT NULL CHECK (btrim(email) <> '' AND length(email) <= 254),
  subject    text NOT NULL CHECK (btrim(subject) <> '' AND length(subject) <= 300),
  status     text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error      text CHECK (length(error) <= 1000),
  -- What the email was about: the order (ORD059), the access request (AR-0012), the dataset and the client.
  client_id  uuid REFERENCES admin.client,
  order_id   uuid REFERENCES admin."order",
  dataset_id uuid REFERENCES admin.dataset,
  reference  text CHECK (length(reference) <= 40),
  -- A sent email has no error; a failed or skipped one says why.
  CHECK ((status = 'sent') = (error IS NULL))
);
CREATE INDEX notification_log_recent ON admin.notification_log (created_at DESC);

CREATE FUNCTION admin.refuse_notification_log_change() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
BEGIN
  RAISE EXCEPTION 'admin.notification_log is append-only (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER refuse_change BEFORE UPDATE OR DELETE ON admin.notification_log FOR EACH ROW EXECUTE FUNCTION admin.refuse_notification_log_change();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.notification_log FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_notification_log_change();

-- service_role bypasses RLS on Supabase and inserts; the app role reads only as lab Owner or Admin.
ALTER TABLE admin.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_log_read ON admin.notification_log FOR SELECT TO authenticated USING (admin.is_lab_manager());
REVOKE ALL ON admin.notification_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON admin.notification_log TO authenticated;
GRANT INSERT ON admin.notification_log TO service_role;

-- ---------------------------------------------------------------- the switch (any signed-in user, for themselves)

CREATE FUNCTION admin.set_my_notification_pref(p_kind text, p_enabled boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to change your email notifications' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('request_answered', 'dataset_released', 'order_requested', 'access_requested') THEN
    RAISE EXCEPTION 'Unknown kind of email notification' USING ERRCODE = '22023';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Say whether this email notification is on or off' USING ERRCODE = '22023';
  END IF;
  INSERT INTO admin.notification_pref AS f (user_id, kind, enabled) VALUES (auth.uid(), p_kind, p_enabled)
  ON CONFLICT (user_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled WHERE f.enabled IS DISTINCT FROM EXCLUDED.enabled;
END $$;

-- ---------------------------------------------------------------- who could receive an email (service role only)

CREATE FUNCTION admin.notification_audience(p_client_id uuid)
  RETURNS TABLE (user_id uuid, email text, lab_role text, client_role text, off text[])
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  WITH people AS (
    SELECT s.user_id, s.role AS lab_role, NULL::text AS client_role
      FROM admin.lab_staff s
     WHERE s.archived_at IS NULL
    UNION ALL
    SELECT m.user_id, NULL::text, m.role
      FROM admin.client_member m
      JOIN admin.client c ON c.id = m.client_id
     WHERE m.client_id = p_client_id AND m.archived_at IS NULL AND c.archived_at IS NULL
  )
  SELECT p.user_id, u.email, p.lab_role, p.client_role,
         coalesce((SELECT array_agg(f.kind ORDER BY f.kind) FROM admin.notification_pref f WHERE f.user_id = p.user_id AND NOT f.enabled), '{}')
    FROM people p
    JOIN auth.users u ON u.id = p.user_id
   WHERE nullif(btrim(u.email), '') IS NOT NULL
   ORDER BY u.email, p.lab_role NULLS LAST $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.refuse_notification_log_change(), admin.set_my_notification_pref(text, boolean),
  admin.notification_audience(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.set_my_notification_pref(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.notification_audience(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
