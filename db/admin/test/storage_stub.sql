-- Test-only stand-in for Supabase Storage's two tables. Do not apply to Supabase.
-- Shape follows supabase/storage-api (buckets keyed by text id; objects unique on (bucket_id, name); RLS on
-- objects; the API role `authenticated` holds table privileges and RLS policies decide).
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text NOT NULL UNIQUE, owner uuid, public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text,
  owner uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb, path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED);
CREATE UNIQUE INDEX bucketid_objname ON storage.objects(bucket_id, name);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;
-- Team's bucket and its two object policies, verbatim from pilot/supabase/schema.sql, so the pre-release
-- upload of the analysis file (0007) runs next to Team's own rule in PGlite.
INSERT INTO storage.buckets(id,name,public) VALUES('case-files','case-files',false);
CREATE POLICY pilot_object_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='case-files' AND EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id::text=split_part(name,'/',1) AND m.user_id=auth.uid()));
CREATE POLICY pilot_object_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='case-files' AND name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$' AND EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id::text=split_part(name,'/',1) AND m.user_id=auth.uid() AND role IN ('owner','editor')));
-- Storage sets the route's operation transaction-locally with the caller's role (v1.81.0
-- src/internal/database/postgres/scope.ts: set_config('storage.operation', <op>, true), e.g.
-- 'storage.object.get_authenticated', 'storage.object.sign', 'storage.object.sign_many', 'storage.object.list'), and
-- reads it back through this function (migrations/tenant/0024-operation-function.sql). Tests set it the same way.
CREATE FUNCTION storage.operation() RETURNS text LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN current_setting('storage.operation', true);
END; $$;
