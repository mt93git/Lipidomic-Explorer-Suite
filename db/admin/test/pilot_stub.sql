-- Test-only stand-in for Team's project library. Do not apply to Supabase.
-- The three tables, their RLS and grants are copied verbatim from pilot/supabase/schema.sql
-- (pilot_runs, storage and the seed rows are left out; `anon` does not exist in PGlite).
CREATE TABLE public.pilot_projects(id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.pilot_members(project_id uuid REFERENCES public.pilot_projects, user_id uuid NOT NULL, role text CHECK(role IN ('owner','editor','viewer')), PRIMARY KEY(project_id,user_id));
CREATE TABLE public.pilot_files(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES public.pilot_projects NOT NULL, object_path text NOT NULL UNIQUE, original_name text NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'), size_bytes bigint NOT NULL CHECK(size_bytes>0), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,sha256), CHECK(object_path=project_id::text||'/'||sha256));
ALTER TABLE public.pilot_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pilot_projects,public.pilot_members,public.pilot_files FROM authenticated;
GRANT SELECT ON public.pilot_projects,public.pilot_members,public.pilot_files TO authenticated;
GRANT INSERT ON public.pilot_files TO authenticated;
CREATE POLICY own_membership ON public.pilot_members FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY project_read ON public.pilot_projects FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id=id AND m.user_id=auth.uid()));
CREATE POLICY file_read ON public.pilot_files FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id=pilot_files.project_id AND m.user_id=auth.uid()));
CREATE POLICY file_insert ON public.pilot_files FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id=pilot_files.project_id AND m.user_id=auth.uid() AND role IN ('owner','editor')));
