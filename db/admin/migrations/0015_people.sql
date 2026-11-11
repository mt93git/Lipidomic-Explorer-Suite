-- People, invitations and roles (Admin wave 3, round 2 contract). 0001-0014 are never edited; this is additive.
--
-- An Owner (lab roles) or an Owner/Admin (client roles) creates a 7-day invitation link and copies it; the app sends
-- no email. Only the SHA-256 of the link's token is stored: create_invitation returns the raw token once.
-- Self sign-up is off on GoTrue, so the Admin app server creates the invited person's auth user with the
-- service-role key and then calls accept_invitation, which only `service_role` may execute. A person who already has
-- an account signs in and calls accept_my_invitation instead (their own auth email must be the invited one). The
-- public invitation page reads invitation_preview with the anon key: a valid token shows who is invited for what
-- (and whether that email already has an account), anything else no row.
-- Memberships are changed or archived only through accept_*invitation / set_lab_role / set_client_member_role /
-- archive_member: signed-in users lose the direct INSERT/UPDATE on admin.lab_staff and admin.client_member (and the
-- 0004 write policies). Nothing is deleted, and a trigger refuses any change that leaves no active lab Owner,
-- whatever the path. The token digest stays out of the audit log.
-- Needs Supabase's `anon` and `service_role` roles, and auth.users(email).

-- ---------------------------------------------------------------- memberships: no direct writes, always an Owner

DROP POLICY lab_staff_insert ON admin.lab_staff;
DROP POLICY lab_staff_update ON admin.lab_staff;
DROP POLICY client_member_insert ON admin.client_member;
DROP POLICY client_member_update ON admin.client_member;
REVOKE INSERT, UPDATE ON admin.lab_staff, admin.client_member FROM authenticated;

-- Serialises every change that could leave the lab without an active Owner: returns the active Owners, locked.
CREATE FUNCTION admin.lock_owners() RETURNS int
  LANGUAGE sql SET search_path = pg_catalog, admin
  AS $$ SELECT count(*)::int FROM (SELECT 1 FROM admin.lab_staff WHERE role = 'owner' AND archived_at IS NULL FOR UPDATE) o $$;

-- After the statement's rows changed: an active Owner row that stops being one needs another active Owner left.
-- Rows are never deleted (refuse_delete), so UPDATE is the only way out.
CREATE FUNCTION admin.keep_an_owner() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF OLD.role = 'owner' AND OLD.archived_at IS NULL AND NOT (NEW.role = 'owner' AND NEW.archived_at IS NULL)
     AND admin.lock_owners() = 0 THEN
    RAISE EXCEPTION 'The lab needs at least one active Owner; make someone else Owner first' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER keep_an_owner AFTER UPDATE ON admin.lab_staff FOR EACH ROW EXECUTE FUNCTION admin.keep_an_owner();

CREATE TABLE admin.invitation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  email           text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  lab_role        text CHECK (lab_role IN ('owner', 'admin', 'operator', 'member')),
  client_id       uuid REFERENCES admin.client,
  client_role     text CHECK (client_role IN ('client_admin', 'requester', 'viewer')),
  token_sha256    text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at      timestamptz NOT NULL,
  created_by      uuid REFERENCES auth.users,
  accepted_at     timestamptz,
  accepted_by     uuid REFERENCES auth.users,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES auth.users,
  -- Exactly one target: a lab role, or a client with a client role.
  CHECK ((lab_role IS NULL) <> (client_id IS NULL)),
  CHECK ((client_id IS NULL) = (client_role IS NULL)),
  CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);
CREATE INDEX invitation_email ON admin.invitation (email);

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.invitation FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.invitation FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
-- admin.record_audit (0003) without the token digest: Operators read the audit log.
CREATE FUNCTION admin.record_invitation_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  INSERT INTO admin.audit_event (actor, client_id, entity, entity_id, action, before, after)
  VALUES (auth.uid(), NEW.client_id, TG_TABLE_NAME, NEW.id, TG_OP,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) - 'token_sha256' END,
          to_jsonb(NEW) - 'token_sha256');
  RETURN NULL;
END $$;
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.invitation FOR EACH ROW EXECUTE FUNCTION admin.record_invitation_audit();

-- Lab Owners and Admins read invitations (the People screen); every write goes through the functions below.
-- The token digest is not readable through the API.
ALTER TABLE admin.invitation ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_read ON admin.invitation FOR SELECT TO authenticated USING (admin.is_lab_manager());
REVOKE ALL ON admin.invitation FROM PUBLIC, authenticated;
GRANT SELECT (id, created_at, archived_at, archived_reason, email, lab_role, client_id, client_role, expires_at,
              created_by, accepted_at, accepted_by, revoked_at, revoked_by) ON admin.invitation TO authenticated;

-- ---------------------------------------------------------------- helpers (not callable through the API)

CREATE FUNCTION admin.token_digest(p_token text) RETURNS text
  LANGUAGE sql STABLE SET search_path = pg_catalog
  AS $$ SELECT encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') $$;

-- What the invitation grants, in plain lab words: 'Lab Operator', 'Requester at Synthetic Lab Alpha'.
CREATE FUNCTION admin.invitation_target(i admin.invitation) RETURNS text
  LANGUAGE sql STABLE SET search_path = pg_catalog, admin
  AS $$ SELECT CASE
    WHEN i.lab_role IS NOT NULL THEN 'Lab ' || CASE i.lab_role WHEN 'owner' THEN 'Owner' WHEN 'admin' THEN 'Admin'
                                                               WHEN 'operator' THEN 'Operator' ELSE 'Member' END
    ELSE CASE i.client_role WHEN 'client_admin' THEN 'Client admin' WHEN 'requester' THEN 'Requester' ELSE 'Viewer' END
         || ' at ' || (SELECT name FROM admin.client WHERE id = i.client_id)
  END $$;

-- Who may create or revoke an invitation for this target: lab roles need the lab Owner; client roles an Owner or Admin.
CREATE FUNCTION admin.require_inviter(p_lab_role text) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, admin AS $$
BEGIN
  IF p_lab_role IS NOT NULL AND admin.lab_role(auth.uid()) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the lab Owner can invite or manage lab staff' USING ERRCODE = '42501';
  END IF;
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to invite people' USING ERRCODE = '42501';
  END IF;
END $$;

-- ---------------------------------------------------------------- invitations

CREATE FUNCTION admin.create_invitation(p_email text, p_lab_role text, p_client_id uuid, p_client_role text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_lab text := nullif(btrim(p_lab_role), '');
  v_role text := nullif(btrim(p_client_role), '');
  c admin.client;
  held text;
  v_token text;
BEGIN
  IF (v_lab IS NOT NULL) = (p_client_id IS NOT NULL OR v_role IS NOT NULL) OR (v_lab IS NULL AND (p_client_id IS NULL OR v_role IS NULL)) THEN
    RAISE EXCEPTION 'Invite for exactly one of: a lab role, or a client with a client role' USING ERRCODE = '22023';
  END IF;
  PERFORM admin.require_inviter(v_lab);
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF v_lab IS NOT NULL THEN
    IF v_lab NOT IN ('owner', 'admin', 'operator', 'member') THEN
      RAISE EXCEPTION 'Choose a valid lab role' USING ERRCODE = '22023';
    END IF;
    SELECT s.role INTO held FROM admin.lab_staff s JOIN auth.users u ON u.id = s.user_id
      WHERE lower(u.email) = v_email AND s.archived_at IS NULL;
    IF FOUND THEN
      RAISE EXCEPTION '% already holds a lab role (%); change it in People instead', v_email, held USING ERRCODE = '23505';
    END IF;
  ELSE
    IF v_role NOT IN ('client_admin', 'requester', 'viewer') THEN
      RAISE EXCEPTION 'Choose a valid client role' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO c FROM admin.client WHERE id = p_client_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002'; END IF;
    IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Client % is archived', c.name USING ERRCODE = '55000'; END IF;
    SELECT m.role INTO held FROM admin.client_member m JOIN auth.users u ON u.id = m.user_id
      WHERE m.client_id = p_client_id AND lower(u.email) = v_email AND m.archived_at IS NULL;
    IF FOUND THEN
      RAISE EXCEPTION '% is already a member of % (%); change the role in People instead', v_email, c.name, held USING ERRCODE = '23505';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM admin.invitation
             WHERE email = v_email AND lab_role IS NOT DISTINCT FROM v_lab AND client_id IS NOT DISTINCT FROM p_client_id
               AND accepted_at IS NULL AND revoked_at IS NULL AND archived_at IS NULL AND expires_at > now()) THEN
    RAISE EXCEPTION '% already has a pending invitation for this; revoke it first to send a new link', v_email USING ERRCODE = '23505';
  END IF;

  -- 2 x 122 random bits from the server's strong random source; only the digest is stored.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO admin.invitation (email, lab_role, client_id, client_role, token_sha256, expires_at, created_by)
  VALUES (v_email, v_lab, CASE WHEN v_lab IS NULL THEN p_client_id END, CASE WHEN v_lab IS NULL THEN v_role END,
          admin.token_digest(v_token), now() + interval '7 days', auth.uid());
  RETURN v_token;
END $$;

-- Public: what the invitation page shows. Valid, unexpired, unaccepted, unrevoked tokens only; otherwise no row.
-- has_account: the invited email already has an auth account, so the page asks the person to sign in and accept
-- (accept_my_invitation) instead of choosing a password. Only a holder of the link learns it.
CREATE FUNCTION admin.invitation_preview(p_token text)
  RETURNS TABLE (email text, target text, expires_at timestamptz, has_account boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT i.email, admin.invitation_target(i), i.expires_at,
               EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = i.email)
        FROM admin.invitation i LEFT JOIN admin.client c ON c.id = i.client_id
        WHERE i.token_sha256 = admin.token_digest(p_token)
          AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.archived_at IS NULL AND i.expires_at > now()
          AND c.archived_at IS NULL $$;

-- Shared by accept_invitation and accept_my_invitation (not callable through the API): p_user_id's auth email must be
-- the invited one.
CREATE FUNCTION admin.join_invitation(p_token text, p_user_id uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
DECLARE
  i admin.invitation;
  v_user_email text;
  existing_id uuid;
  existing_archived timestamptz;
BEGIN
  SELECT * INTO i FROM admin.invitation WHERE token_sha256 = admin.token_digest(p_token) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid' USING ERRCODE = 'P0002'; END IF;
  IF i.revoked_at IS NOT NULL OR i.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation was revoked' USING ERRCODE = '55000';
  END IF;
  IF i.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation was already used' USING ERRCODE = '55000'; END IF;
  IF i.expires_at <= now() THEN RAISE EXCEPTION 'This invitation has expired' USING ERRCODE = '55000'; END IF;
  SELECT lower(email) INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002'; END IF;
  IF v_user_email IS DISTINCT FROM i.email THEN
    RAISE EXCEPTION 'This invitation is for a different email address' USING ERRCODE = '42501';
  END IF;

  IF i.lab_role IS NOT NULL THEN
    -- One lab row per person (UNIQUE user_id): a person who left the lab comes back on the same row.
    SELECT id, archived_at INTO existing_id, existing_archived FROM admin.lab_staff WHERE user_id = p_user_id FOR UPDATE;
    IF existing_id IS NULL THEN
      INSERT INTO admin.lab_staff (user_id, role) VALUES (p_user_id, i.lab_role);
    ELSIF existing_archived IS NULL THEN
      RAISE EXCEPTION 'This person already holds a lab role' USING ERRCODE = '23505';
    ELSE
      UPDATE admin.lab_staff SET role = i.lab_role, archived_at = NULL, archived_reason = NULL WHERE id = existing_id;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM admin.client WHERE id = i.client_id AND archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'The client of this invitation is archived' USING ERRCODE = '55000';
    END IF;
    SELECT id, archived_at INTO existing_id, existing_archived FROM admin.client_member
      WHERE client_id = i.client_id AND user_id = p_user_id FOR UPDATE;
    IF existing_id IS NULL THEN
      INSERT INTO admin.client_member (client_id, user_id, role) VALUES (i.client_id, p_user_id, i.client_role);
    ELSIF existing_archived IS NULL THEN
      RAISE EXCEPTION 'This person is already a member of this client' USING ERRCODE = '23505';
    ELSE
      UPDATE admin.client_member SET role = i.client_role, archived_at = NULL, archived_reason = NULL WHERE id = existing_id;
    END IF;
  END IF;
  UPDATE admin.invitation SET accepted_at = now(), accepted_by = p_user_id WHERE id = i.id;
END $$;

-- service_role only (the Admin app server, after it created p_user_id with the invited email).
CREATE FUNCTION admin.accept_invitation(p_token text, p_user_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  PERFORM admin.join_invitation(p_token, p_user_id);
END $$;

-- A signed-in person whose account already exists (their auth email is the invited one) accepts for themselves;
-- the password is not touched.
CREATE FUNCTION admin.accept_my_invitation(p_token text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to accept this invitation' USING ERRCODE = '42501'; END IF;
  PERFORM admin.join_invitation(p_token, auth.uid());
END $$;

CREATE FUNCTION admin.revoke_invitation(p_invitation_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE i admin.invitation;
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to invite people' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO i FROM admin.invitation WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM admin.require_inviter(i.lab_role);
  IF i.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation was already used' USING ERRCODE = '55000'; END IF;
  IF i.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation is already revoked' USING ERRCODE = '55000'; END IF;
  UPDATE admin.invitation SET revoked_at = now(), revoked_by = auth.uid() WHERE id = i.id;
END $$;

-- ---------------------------------------------------------------- memberships

CREATE FUNCTION admin.set_lab_role(p_user_id uuid, p_role text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE s admin.lab_staff;
BEGIN
  IF admin.lab_role(auth.uid()) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the lab Owner can invite or manage lab staff' USING ERRCODE = '42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('owner', 'admin', 'operator', 'member') THEN
    RAISE EXCEPTION 'Choose a valid lab role' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM admin.lab_staff WHERE user_id = p_user_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This person is not active lab staff' USING ERRCODE = 'P0002'; END IF;
  UPDATE admin.lab_staff SET role = p_role WHERE id = s.id; -- keep_an_owner refuses demoting the last Owner
END $$;

CREATE FUNCTION admin.set_client_member_role(p_member_id uuid, p_role text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE m admin.client_member;
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to manage client members' USING ERRCODE = '42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('client_admin', 'requester', 'viewer') THEN
    RAISE EXCEPTION 'Choose a valid client role' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM admin.client_member WHERE id = p_member_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This client membership is not active' USING ERRCODE = 'P0002'; END IF;
  UPDATE admin.client_member SET role = p_role WHERE id = m.id;
END $$;

-- p_kind 'lab_staff' (lab Owner only; never the last active Owner) or 'client_member' (Owner/Admin); p_id is the row id.
CREATE FUNCTION admin.archive_member(p_kind text, p_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  v_reason text := nullif(btrim(p_reason), '');
  s admin.lab_staff;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('lab_staff', 'client_member') THEN
    RAISE EXCEPTION 'Choose lab_staff or client_member' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'lab_staff' THEN
    IF admin.lab_role(auth.uid()) IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only the lab Owner can invite or manage lab staff' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to manage client members' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Archiving a membership needs a reason' USING ERRCODE = '22023'; END IF;

  IF p_kind = 'lab_staff' THEN
    SELECT * INTO s FROM admin.lab_staff WHERE id = p_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This person is not active lab staff' USING ERRCODE = 'P0002'; END IF;
    UPDATE admin.lab_staff SET archived_at = now(), archived_reason = v_reason WHERE id = s.id; -- keep_an_owner: never the last
  ELSE
    UPDATE admin.client_member SET archived_at = now(), archived_reason = v_reason WHERE id = p_id AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'This client membership is not active' USING ERRCODE = 'P0002'; END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.token_digest(text), admin.invitation_target(admin.invitation), admin.require_inviter(text),
  admin.lock_owners(), admin.keep_an_owner(), admin.record_invitation_audit(), admin.join_invitation(text, uuid),
  admin.create_invitation(text, text, uuid, text), admin.invitation_preview(text),
  admin.accept_invitation(text, uuid), admin.accept_my_invitation(text), admin.revoke_invitation(uuid), admin.set_lab_role(uuid, text),
  admin.set_client_member_role(uuid, text), admin.archive_member(text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA admin TO anon, service_role;
GRANT EXECUTE ON FUNCTION admin.invitation_preview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin.accept_invitation(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION admin.create_invitation(text, text, uuid, text), admin.revoke_invitation(uuid), admin.accept_my_invitation(text),
  admin.set_lab_role(uuid, text), admin.set_client_member_role(uuid, text), admin.archive_member(text, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
