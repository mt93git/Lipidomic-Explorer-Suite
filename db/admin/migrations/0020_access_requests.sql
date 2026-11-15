-- F3: request access (docs/admin/client-zone-proposal/proposal.html, 0020; decisions in docs/admin/client-zone-decisions.md).
-- A person without an account asks for access on the public Request access page. That creates a pending
-- admin.access_request and no account. A lab Owner or Admin approves it, into an existing client or a new one and
-- with the client role they pick, which creates the existing 7-day invitation link (0015's create_invitation, so all
-- its rules apply) and returns the token once. Or they decline it, with an internal reason; the app tells the
-- requester nothing. The app sends no email.
-- submit_access_request is executed only by service_role (the Admin app server, after its own per-IP/per-email
-- limit), never by anon, so nobody can skip that limit by calling PostgREST directly. The queue is capped: one pending
-- request per email and a total of pending requests. The answer does not depend on whether the email has an account.
-- Nobody reads or writes the table directly. The lab reads it through list_access_requests (Owner or Admin).
-- Declined requests are kept 90 days; then their personal data (name, email, organisation, message, and the lab's
-- reason, which may quote them) is erased and the row stays with its status and dates. There is no scheduler: every
-- access-request function erases what is due before it does anything else. The audit log records these rows
-- without the personal data, so erasing the row erases it everywhere.

CREATE TABLE admin.access_request (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,  -- the reference: AR-0012
  created_at     timestamptz NOT NULL DEFAULT now(),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  full_name      text CHECK (btrim(full_name) <> '' AND length(full_name) <= 200),
  email          text CHECK (email = lower(btrim(email)) AND length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  organisation   text CHECK (btrim(organisation) <> '' AND length(organisation) <= 200),
  kind           text NOT NULL CHECK (kind IN ('pi_lab', 'internal_group', 'company')),
  message        text CHECK (length(message) <= 2000),
  decided_at     timestamptz,
  decided_by     uuid REFERENCES auth.users,
  decline_reason text CHECK (length(decline_reason) <= 500),
  client_id      uuid REFERENCES admin.client,
  invitation_id  uuid REFERENCES admin.invitation,
  erased_at      timestamptz,
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK ((status = 'approved') = (invitation_id IS NOT NULL) AND (status = 'approved') = (client_id IS NOT NULL)),
  CHECK (status <> 'declined' OR decline_reason IS NOT NULL OR erased_at IS NOT NULL),
  CHECK (status = 'declined' OR decline_reason IS NULL),
  -- Personal data is there until it is erased, and erasing (declined requests only) removes all of it.
  CHECK (CASE WHEN erased_at IS NULL THEN full_name IS NOT NULL AND email IS NOT NULL AND organisation IS NOT NULL
              ELSE status = 'declined' AND full_name IS NULL AND email IS NULL AND organisation IS NULL AND message IS NULL
                   AND decline_reason IS NULL END)
);
-- One pending request per email.
CREATE UNIQUE INDEX access_request_one_pending ON admin.access_request (email) WHERE status = 'pending';
CREATE INDEX access_request_erase_due ON admin.access_request (decided_at) WHERE status = 'declined' AND erased_at IS NULL;

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.access_request FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.access_request FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
-- admin.record_audit (0003) without the personal data, which is erased after 90 days on a declined request.
CREATE FUNCTION admin.record_access_request_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE personal text[] := ARRAY['full_name', 'email', 'organisation', 'message', 'decline_reason'];
BEGIN
  INSERT INTO admin.audit_event (actor, client_id, entity, entity_id, action, before, after)
  VALUES (auth.uid(), NEW.client_id, TG_TABLE_NAME, NEW.id, TG_OP,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) - personal END, to_jsonb(NEW) - personal);
  RETURN NULL;
END $$;
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.access_request FOR EACH ROW EXECUTE FUNCTION admin.record_access_request_audit();

-- No policy and no grant: every read and write goes through the functions below.
ALTER TABLE admin.access_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin.access_request FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------- helpers (not callable through the API)

CREATE FUNCTION admin.access_request_reference(p_number bigint) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
  AS $$ SELECT 'AR-' || lpad(p_number::text, 4, '0') $$;

-- Declined more than 90 days ago: erase the personal data, keep the row, its status and dates.
CREATE FUNCTION admin.erase_expired_access_requests() RETURNS int
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
DECLARE n int;
BEGIN
  UPDATE admin.access_request
     SET full_name = NULL, email = NULL, organisation = NULL, message = NULL, decline_reason = NULL, erased_at = now()
   WHERE status = 'declined' AND erased_at IS NULL AND decided_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION admin.require_access_manager() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, admin AS $$
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to answer access requests' USING ERRCODE = '42501';
  END IF;
END $$;

-- Lock a request that still waits for an answer. An answered one is a conflict (PT409, HTTP 409; not 40001, which
-- PostgREST retries): someone else answered first.
CREATE FUNCTION admin.lock_pending_access_request(p_request_id uuid) RETURNS admin.access_request
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
DECLARE r admin.access_request;
BEGIN
  SELECT * INTO r FROM admin.access_request WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access request not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Access request % was already answered: it is %', admin.access_request_reference(r.number), r.status
      USING ERRCODE = 'PT409';
  END IF;
  RETURN r;
END $$;

-- ---------------------------------------------------------------- submit (service_role only)

-- Returns the reference (AR-0012). A second pending request for the same email is PT409; a full queue is 54000.
-- Neither looks at auth.users: whether the email already has an account changes nothing.
CREATE FUNCTION admin.submit_access_request(p_full_name text, p_email text, p_organisation text, p_kind text, p_message text)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  v_name text := nullif(btrim(p_full_name), '');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_org text := nullif(btrim(p_organisation), '');
  v_message text := nullif(btrim(p_message), '');
  max_pending constant int := 200;
  v_number bigint;
BEGIN
  PERFORM admin.erase_expired_access_requests();
  IF v_name IS NULL OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'Enter your full name (200 characters at most)' USING ERRCODE = '22023';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF v_org IS NULL OR length(v_org) > 200 THEN
    RAISE EXCEPTION 'Enter your organisation or lab (200 characters at most)' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('pi_lab', 'internal_group', 'company') THEN
    RAISE EXCEPTION 'Choose a type: PI lab, internal group or company' USING ERRCODE = '22023';
  END IF;
  IF length(v_message) > 2000 THEN
    RAISE EXCEPTION 'The message is limited to 2000 characters' USING ERRCODE = '22023';
  END IF;
  -- Serialise submits so the total cap holds under concurrency.
  PERFORM pg_advisory_xact_lock(hashtext('admin.access_request'));
  IF EXISTS (SELECT 1 FROM admin.access_request WHERE email = v_email AND status = 'pending') THEN
    RAISE EXCEPTION 'A request for this email address is already waiting for the lab' USING ERRCODE = 'PT409';
  END IF;
  IF (SELECT count(*) FROM admin.access_request WHERE status = 'pending') >= max_pending THEN
    RAISE EXCEPTION 'The lab is not taking more access requests right now' USING ERRCODE = '54000';
  END IF;
  INSERT INTO admin.access_request (full_name, email, organisation, kind, message)
  VALUES (v_name, v_email, v_org, p_kind, v_message)
  RETURNING number INTO v_number;
  RETURN admin.access_request_reference(v_number);
END $$;

-- ---------------------------------------------------------------- the lab: list, count, approve, decline

CREATE FUNCTION admin.list_access_requests()
  RETURNS TABLE (id uuid, reference text, created_at timestamptz, status text, full_name text, email text, organisation text,
                 kind text, message text, decided_at timestamptz, decided_by uuid, decline_reason text, client_id uuid,
                 invitation_id uuid, erased_at timestamptz, matching_client_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  PERFORM admin.require_access_manager();
  PERFORM admin.erase_expired_access_requests();
  -- matching_client_id: an active client whose name is the organisation the person wrote (case-insensitive), so the
  -- screen can suggest adding them to it.
  RETURN QUERY
    SELECT r.id, admin.access_request_reference(r.number), r.created_at, r.status, r.full_name, r.email, r.organisation,
           r.kind, r.message, r.decided_at, r.decided_by, r.decline_reason, r.client_id, r.invitation_id, r.erased_at,
           (SELECT c.id FROM admin.client c WHERE c.archived_at IS NULL AND lower(c.name) = lower(r.organisation) LIMIT 1)
      FROM admin.access_request r
     ORDER BY r.created_at DESC, r.number DESC;
END $$;

-- The sidebar counter. Reads no personal data, so it does not erase (and can stay STABLE).
CREATE FUNCTION admin.pending_access_request_count() RETURNS int
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  PERFORM admin.require_access_manager();
  RETURN (SELECT count(*)::int FROM admin.access_request WHERE status = 'pending');
END $$;

-- Approve into an existing client (p_client_id) or a new one (p_new_client_name and p_new_client_kind; created here
-- with create_client, in the same transaction, so a refused approval leaves no client behind), with the client role
-- the lab picks. The invitation is create_invitation's, with all its checks; the raw token is returned once.
CREATE FUNCTION admin.approve_access_request(p_request_id uuid, p_client_id uuid, p_new_client_name text, p_new_client_kind text,
                                             p_client_role text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  r admin.access_request;
  v_new text := nullif(btrim(p_new_client_name), '');
  v_client uuid := p_client_id;
  v_token text;
  v_invitation uuid;
BEGIN
  PERFORM admin.require_access_manager();
  PERFORM admin.erase_expired_access_requests();
  IF (p_client_id IS NULL) = (v_new IS NULL) THEN
    RAISE EXCEPTION 'Approve into exactly one of: an existing client, or a new client with its name' USING ERRCODE = '22023';
  END IF;
  IF p_client_role IS NULL OR p_client_role NOT IN ('client_admin', 'requester', 'viewer') THEN
    RAISE EXCEPTION 'Choose a valid client role' USING ERRCODE = '22023';
  END IF;
  r := admin.lock_pending_access_request(p_request_id);
  IF v_new IS NOT NULL THEN
    v_client := admin.create_client(v_new, coalesce(p_new_client_kind, r.kind), NULL, NULL);
  END IF;
  v_token := admin.create_invitation(r.email, NULL, v_client, p_client_role);
  SELECT i.id INTO v_invitation FROM admin.invitation i WHERE i.token_sha256 = admin.token_digest(v_token);
  UPDATE admin.access_request
     SET status = 'approved', decided_at = now(), decided_by = auth.uid(), client_id = v_client, invitation_id = v_invitation
   WHERE id = r.id;
  RETURN v_token;
END $$;

-- Decline with an internal reason (the app does not tell the requester). The row is kept; its personal data is
-- erased 90 days later.
CREATE FUNCTION admin.decline_access_request(p_request_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  r admin.access_request;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  PERFORM admin.require_access_manager();
  PERFORM admin.erase_expired_access_requests();
  IF v_reason IS NULL OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Declining a request needs a reason (500 characters at most); only the lab reads it' USING ERRCODE = '22023';
  END IF;
  r := admin.lock_pending_access_request(p_request_id);
  UPDATE admin.access_request SET status = 'declined', decided_at = now(), decided_by = auth.uid(), decline_reason = v_reason
   WHERE id = r.id;
END $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.record_access_request_audit(), admin.access_request_reference(bigint),
  admin.erase_expired_access_requests(), admin.require_access_manager(), admin.lock_pending_access_request(uuid),
  admin.submit_access_request(text, text, text, text, text), admin.list_access_requests(), admin.pending_access_request_count(),
  admin.approve_access_request(uuid, uuid, text, text, text), admin.decline_access_request(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.submit_access_request(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION admin.list_access_requests(), admin.pending_access_request_count(),
  admin.approve_access_request(uuid, uuid, text, text, text), admin.decline_access_request(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
