-- Reapply least privilege after restore: inherited Supabase default grants must not widen access.
REVOKE ALL ON public.pilot_projects,public.pilot_members,public.pilot_files,public.pilot_runs FROM anon, authenticated;
GRANT SELECT ON public.pilot_projects,public.pilot_members,public.pilot_files,public.pilot_runs TO authenticated;
GRANT INSERT ON public.pilot_files TO authenticated;
NOTIFY pgrst,'reload schema';
