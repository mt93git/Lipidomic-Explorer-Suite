CREATE SCHEMA auth;
-- last_sign_in_at, encrypted_password and mfa_factors as Supabase has them (0029 reads them; factor status is an enum there).
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, last_sign_in_at timestamptz, encrypted_password varchar(255));
CREATE TABLE auth.mfa_factors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users, status text NOT NULL);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE ROLE authenticated NOLOGIN;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
-- Supabase's other API roles: PostgREST connects as `authenticator`, Storage as `supabase_storage_admin` (granted
-- `authenticator` in Supabase's image); both switch to the JWT's role.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticator NOLOGIN NOINHERIT;
-- The service-role key's role (BYPASSRLS on Supabase): the Admin app server accepts invitations with it (0015).
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
