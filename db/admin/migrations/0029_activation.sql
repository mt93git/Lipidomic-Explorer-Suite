-- Account emails (Gerardo, 2026-11-11), so nobody needs "Forgot password" to get in the first time. The Admin app
-- server sends them through Resend like the 0028 notifications; they have no switch (an invitee has no account yet).
-- 0001-0028 are never edited.
--
-- 1. admin.notification_log takes two more kinds: 'invitation' (the welcome email sent when someone is invited from
--    People; to an email without an account, so the row has no user) and 'activation' (the "Send activation email"
--    of People, to an existing account that has not signed in to Admin yet). Only an invitation row has no user.
-- 2. admin.account_state(): lab Owner and Admin only. For every person with an active lab or client membership: their
--    email, when they last signed in (auth.users, shared with Team), whether they have a verified two-step factor (only
--    Admin enrolls one) and a password, and when an activation email was last sent to them. The app decides from it
--    whether the account is active (src/lib/activation.ts) and keeps one activation email per person per 10 minutes.
-- 3. admin.record_activation_email(p_user_id): lab Owner and Admin only, called by the app right after an activation
--    email was sent: one audit row (entity activation_email, the person's id and name), actor = the sender.
-- Needs Supabase's auth.users (last_sign_in_at, encrypted_password) and auth.mfa_factors.

ALTER TABLE admin.notification_log DROP CONSTRAINT notification_log_kind_check;
ALTER TABLE admin.notification_log ADD CONSTRAINT notification_log_kind_check
  CHECK (kind IN ('request_answered', 'dataset_released', 'order_requested', 'access_requested', 'invitation', 'activation'));
ALTER TABLE admin.notification_log ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE admin.notification_log ADD CONSTRAINT notification_log_user_check CHECK ((user_id IS NULL) = (kind = 'invitation'));

CREATE FUNCTION admin.account_state()
  RETURNS TABLE (user_id uuid, email text, signed_in_at timestamptz, two_step boolean, has_password boolean, activation_sent_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
#variable_conflict use_column
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to see whether accounts are active' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.last_sign_in_at,
         EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status::text = 'verified'),
         coalesce(u.encrypted_password, '') <> '',
         (SELECT max(l.created_at) FROM admin.notification_log l WHERE l.user_id = u.id AND l.kind = 'activation' AND l.status = 'sent')
    FROM auth.users u
   WHERE u.id IN (SELECT s.user_id FROM admin.lab_staff s WHERE s.archived_at IS NULL
                  UNION SELECT m.user_id FROM admin.client_member m WHERE m.archived_at IS NULL)
   ORDER BY u.id;
END $$;

CREATE FUNCTION admin.record_activation_email(p_user_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Only a lab Owner or Admin can send activation emails' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin.lab_staff s WHERE s.user_id = p_user_id AND s.archived_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM admin.client_member m WHERE m.user_id = p_user_id AND m.archived_at IS NULL) THEN
    RAISE EXCEPTION 'This person has no active membership' USING ERRCODE = 'P0002';
  END IF;
  -- Named as People shows them: the lab name, else a client membership's name, else the email.
  v_name := coalesce(
    (SELECT nullif(btrim(s.display_name), '') FROM admin.lab_staff s WHERE s.user_id = p_user_id AND s.archived_at IS NULL),
    (SELECT nullif(btrim(m.display_name), '') FROM admin.client_member m
      WHERE m.user_id = p_user_id AND m.archived_at IS NULL AND nullif(btrim(m.display_name), '') IS NOT NULL ORDER BY m.created_at LIMIT 1),
    (SELECT u.email::text FROM auth.users u WHERE u.id = p_user_id));
  INSERT INTO admin.audit_event (actor, client_id, entity, entity_id, action, before, after)
  VALUES (auth.uid(), NULL, 'activation_email', p_user_id, 'INSERT', NULL, jsonb_build_object('user_id', p_user_id, 'name', v_name));
END $$;

REVOKE EXECUTE ON FUNCTION admin.account_state(), admin.record_activation_email(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.account_state(), admin.record_activation_email(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
