-- Open a released Admin dataset in Nexo (docs/integration/admin-nexo-open.md). 0001-0008 are never edited;
-- everything here is additive.
--
-- The Nexo API reads one released, current dataset (its row and its frozen workbook in admin-files) with a JWT
-- whose `role` claim is nexo_reader, signed with the stack's JWT secret at deploy time (never committed).
-- PostgREST connects as `authenticator` and Storage as `supabase_storage_admin` (which Supabase's image grants
-- `authenticator`); both switch to the JWT's role, so granting nexo_reader to authenticator serves both. The role
-- holds nothing but:
--   - EXECUTE on admin.nexo_dataset(uuid): the row of a released, unarchived dataset (withdrawn, superseded,
--     built or unknown → no row; the API answers 404);
--   - SELECT on storage.objects, filtered by one policy to the authenticated download of the admin-files object
--     whose name is the storage_path of a released, current dataset. Signing (single or bulk), listing, object
--     info and every other Storage operation see no row, and nothing can be written. A signed URL is checked
--     only when it is issued and is served later as a superuser, so it would outlive withdrawal and
--     supersession; refusing to issue one keeps retirement immediate.
-- It reads no admin or Team table and calls no staff function. Needs Supabase's `authenticator` role and the
-- Storage schema (bucket admin-files, 0006), Storage v1.81.0 or later (it sets storage.operation per request).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_reader') THEN
    CREATE ROLE nexo_reader NOLOGIN;
  END IF;
END $$;
-- No ALTER ROLE: on Supabase the migrating role (postgres) is not a superuser, and ALTER ROLE ... NOSUPERUSER
-- needs one. A new role already has every attribute off; refuse a pre-existing role that has any of them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_reader'
             AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'role nexo_reader exists with login or elevated attributes; fix it by hand before 0009';
  END IF;
END $$;
GRANT nexo_reader TO authenticator;

-- Schema usage only: tables stay without grants; the two functions below are the whole surface.
GRANT USAGE ON SCHEMA admin TO nexo_reader;

CREATE FUNCTION admin.nexo_dataset(p_dataset_id uuid)
  RETURNS TABLE (dataset_id uuid, order_code text, version int, storage_path text, sha256 text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  SELECT d.id, o.code, d.version, d.storage_path, d.sha256
    FROM admin.dataset d
    JOIN admin."order" o ON o.id = d.order_id
   WHERE d.id = p_dataset_id
     AND d.status = 'released'
     AND d.archived_at IS NULL $$;

-- Evaluated inside the storage policy below, with the caller's privileges (hence EXECUTE for nexo_reader).
CREATE FUNCTION admin.is_nexo_object(p_name text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  SELECT EXISTS (SELECT 1 FROM admin.dataset d
                  WHERE d.storage_path = p_name AND d.status = 'released' AND d.archived_at IS NULL) $$;

REVOKE EXECUTE ON FUNCTION admin.nexo_dataset(uuid), admin.is_nexo_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.nexo_dataset(uuid), admin.is_nexo_object(text) TO nexo_reader;

-- Storage: authenticated download only. Storage reads storage.objects under the JWT's role, in a transaction where
-- it has set the route's operation locally (set_config('storage.operation', <op>, true));
-- 'storage.object.get_authenticated' is the operation of GET /object/authenticated/<bucket>/<path> and
-- GET /object/<bucket>/<path>. The setting is read directly (no EXECUTE on Storage's helper functions needed); an
-- unset or empty operation matches nothing.
GRANT USAGE ON SCHEMA storage TO nexo_reader;
GRANT SELECT ON storage.objects TO nexo_reader;
CREATE POLICY admin_files_nexo_read ON storage.objects FOR SELECT TO nexo_reader
  USING (bucket_id = 'admin-files'
         AND current_setting('storage.operation', true) = 'storage.object.get_authenticated'
         AND admin.is_nexo_object(name));

NOTIFY pgrst, 'reload schema';
