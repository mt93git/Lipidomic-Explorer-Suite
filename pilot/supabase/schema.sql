-- Minimal pilot omits GoTrue migrations; support current PostgREST JWT claims.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''), NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
CREATE TABLE public.pilot_projects(id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.pilot_members(project_id uuid REFERENCES public.pilot_projects, user_id uuid NOT NULL, role text CHECK(role IN ('owner','editor','viewer')), PRIMARY KEY(project_id,user_id));
CREATE TABLE public.pilot_files(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES public.pilot_projects NOT NULL, object_path text NOT NULL UNIQUE, original_name text NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'), size_bytes bigint NOT NULL CHECK(size_bytes>0), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,sha256), CHECK(object_path=project_id::text||'/'||sha256));
CREATE TABLE public.pilot_runs(id uuid PRIMARY KEY, project_id uuid REFERENCES public.pilot_projects NOT NULL, manifest jsonb NOT NULL, provenance text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.pilot_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pilot_projects,public.pilot_members,public.pilot_files,public.pilot_runs FROM anon, authenticated;
GRANT SELECT ON public.pilot_projects,public.pilot_members,public.pilot_files,public.pilot_runs TO authenticated;
GRANT INSERT ON public.pilot_files TO authenticated;
CREATE POLICY own_membership ON public.pilot_members FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY project_read ON public.pilot_projects FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id=id AND m.user_id=auth.uid()));
CREATE POLICY file_read ON public.pilot_files FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id=pilot_files.project_id AND m.user_id=auth.uid()));
CREATE POLICY file_insert ON public.pilot_files FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id=pilot_files.project_id AND m.user_id=auth.uid() AND role IN ('owner','editor')));
CREATE POLICY run_read ON public.pilot_runs FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id=pilot_runs.project_id AND m.user_id=auth.uid()));
INSERT INTO public.pilot_projects VALUES('10000000-0000-4000-8000-000000000001','Sickle cell — isolated persistence pilot');
INSERT INTO public.pilot_members VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner'),('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','viewer');
INSERT INTO storage.buckets(id,name,public) VALUES('case-files','case-files',false);
CREATE POLICY pilot_object_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='case-files' AND EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id::text=split_part(name,'/',1) AND m.user_id=auth.uid()));
CREATE POLICY pilot_object_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='case-files' AND name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$' AND EXISTS(SELECT 1 FROM public.pilot_members m WHERE m.project_id::text=split_part(name,'/',1) AND m.user_id=auth.uid() AND role IN ('owner','editor')));
NOTIFY pgrst,'reload schema';
