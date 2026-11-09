-- Access helpers used by RLS policies.
-- The three base helpers are SECURITY DEFINER (they read lab_staff / client_member without being
-- filtered by those tables' own policies) with a fixed search_path so a caller cannot hijack them.
-- The convenience wrappers are plain SQL and only call the base helpers with auth.uid().

-- Lab role of a user ('owner', 'admin', 'operator', 'member') or NULL.
CREATE FUNCTION admin.lab_role(uid uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT role FROM admin.lab_staff WHERE user_id = uid AND archived_at IS NULL $$;

-- Lab staff = owner, admin or operator: they see every client. A lab 'member' is not staff.
CREATE FUNCTION admin.is_lab_staff(uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT EXISTS (SELECT 1 FROM admin.lab_staff
                       WHERE user_id = uid AND archived_at IS NULL AND role IN ('owner', 'admin', 'operator')) $$;

CREATE FUNCTION admin.is_client_member(uid uuid, cid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT EXISTS (SELECT 1 FROM admin.client_member m JOIN admin.client c ON c.id = m.client_id
                       WHERE m.user_id = uid AND m.client_id = cid
                         AND m.archived_at IS NULL AND c.archived_at IS NULL) $$;

-- Client role of a user in one client ('client_admin', 'requester', 'viewer') or NULL.
CREATE FUNCTION admin.client_role(uid uuid, cid uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT m.role FROM admin.client_member m JOIN admin.client c ON c.id = m.client_id
        WHERE m.user_id = uid AND m.client_id = cid AND m.archived_at IS NULL AND c.archived_at IS NULL $$;

-- True when the batch holds at least one live injection of a client the user belongs to.
CREATE FUNCTION admin.batch_has_my_injection(uid uuid, bid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT EXISTS (SELECT 1 FROM admin.injection i JOIN admin.batch_version v ON v.id = i.batch_version_id
                       WHERE v.batch_id = bid AND i.archived_at IS NULL AND i.client_id IS NOT NULL
                         AND admin.is_client_member(uid, i.client_id)) $$;

-- Wrappers for the current user.
CREATE FUNCTION admin.can_read_client(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, admin
  AS $$ SELECT admin.is_lab_staff(auth.uid()) OR coalesce(admin.is_client_member(auth.uid(), cid), false) $$;

CREATE FUNCTION admin.is_lab_manager() RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, admin
  AS $$ SELECT coalesce(admin.lab_role(auth.uid()) IN ('owner', 'admin'), false) $$;

CREATE FUNCTION admin.is_lab_writer() RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, admin
  AS $$ SELECT coalesce(admin.lab_role(auth.uid()) IN ('owner', 'admin', 'operator'), false) $$;

-- Client admins and requesters submit orders, shipments and sample metadata for their client.
CREATE FUNCTION admin.can_submit(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, admin
  AS $$ SELECT admin.is_lab_writer() OR coalesce(admin.client_role(auth.uid(), cid) IN ('client_admin', 'requester'), false) $$;
