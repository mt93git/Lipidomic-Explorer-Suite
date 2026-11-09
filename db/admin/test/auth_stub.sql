CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE ROLE authenticated NOLOGIN;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
-- Supabase's other API roles: PostgREST connects as `authenticator`, Storage as `supabase_storage_admin` (granted
-- `authenticator` in Supabase's image); both switch to the JWT's role.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticator NOLOGIN NOINHERIT;
