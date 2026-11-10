-- Client zone UX review, top 4 and top 8 (docs/admin/client-zone-ux-review/review.html). 0001-0022 are never edited.
--
-- 1. Client members' names. client_member.display_name (0017) was never written, so the lab read "A client member" for
--    whoever asked for an order. From now on, accepting an invitation for a client role (accept_invitation or
--    accept_my_invitation, 0015) names the member: the full name of the access request the invitation came from (0020),
--    else the invited email. A name the row already has is kept when the invitation brings no request name. Existing
--    members are named the same way from their accepted invitations, preferring one that came from an access request.
--    Lab staff (Owner, Admin and Operator) and the client's own members read it through client_member_read (0004).
-- 2. The lab's contact for clients: one current text, stored like 0019's shipping instructions (earlier texts kept,
--    archived), read by every signed-in user and written only by admin.set_client_contact (lab Owner or Admin). The
--    public Request access page has no session: it reads the current text, and nothing else, through
--    admin.client_contact_text(). Empty means no text: the app then shows nothing.

-- ---------------------------------------------------------------- client members' names

-- After the invitation row records its acceptance; join_invitation has already inserted or revived the membership.
CREATE FUNCTION admin.name_client_member() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  UPDATE admin.client_member m
     SET display_name = coalesce((SELECT r.full_name FROM admin.access_request r WHERE r.invitation_id = NEW.id), m.display_name, NEW.email)
   WHERE m.client_id = NEW.client_id AND m.user_id = NEW.accepted_by;
  RETURN NULL;
END $$;
CREATE TRIGGER name_client_member AFTER UPDATE OF accepted_at ON admin.invitation FOR EACH ROW
  WHEN (OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL AND NEW.client_id IS NOT NULL)
  EXECUTE FUNCTION admin.name_client_member();

-- Backfill: each unnamed member from their accepted invitations to that client, an access request's name first,
-- then the newest invitation.
UPDATE admin.client_member m
   SET display_name = n.name
  FROM (SELECT DISTINCT ON (i.client_id, i.accepted_by) i.client_id, i.accepted_by, coalesce(r.full_name, i.email) AS name
          FROM admin.invitation i
          LEFT JOIN admin.access_request r ON r.invitation_id = i.id
         WHERE i.client_id IS NOT NULL AND i.accepted_at IS NOT NULL
         ORDER BY i.client_id, i.accepted_by, (r.full_name IS NULL), i.accepted_at DESC) n
 WHERE m.client_id = n.client_id AND m.user_id = n.accepted_by AND m.display_name IS NULL;

-- ---------------------------------------------------------------- the lab's contact for clients

CREATE TABLE admin.client_contact (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  body            text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 500),
  set_by          uuid REFERENCES auth.users,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);
CREATE UNIQUE INDEX client_contact_one_current ON admin.client_contact ((true)) WHERE archived_at IS NULL;

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.client_contact FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.client_contact FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.client_contact FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

ALTER TABLE admin.client_contact ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_contact_read ON admin.client_contact FOR SELECT TO authenticated USING (true);
REVOKE ALL ON admin.client_contact FROM PUBLIC, anon, authenticated;
GRANT SELECT ON admin.client_contact TO authenticated;

-- Replace the current text; a blank text clears it (clients then see no contact line). Owner or Admin.
CREATE FUNCTION admin.set_client_contact(p_body text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_body text := nullif(btrim(p_body), '');
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to set the contact for clients' USING ERRCODE = '42501';
  END IF;
  IF length(v_body) > 500 THEN
    RAISE EXCEPTION 'the contact for clients is limited to 500 characters (got %)', length(v_body) USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('admin.client_contact'));
  UPDATE admin.client_contact SET archived_at = now(), archived_reason = CASE WHEN v_body IS NULL THEN 'cleared' ELSE 'replaced' END
   WHERE archived_at IS NULL;
  IF v_body IS NOT NULL THEN
    INSERT INTO admin.client_contact (body, set_by) VALUES (v_body, auth.uid());
  END IF;
END $$;

-- The current text or NULL, for the public Request access page (anon key): no row, date or person, only the text.
CREATE FUNCTION admin.client_contact_text() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT body FROM admin.client_contact WHERE archived_at IS NULL $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.name_client_member() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION admin.set_client_contact(text), admin.client_contact_text() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.set_client_contact(text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.client_contact_text() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
