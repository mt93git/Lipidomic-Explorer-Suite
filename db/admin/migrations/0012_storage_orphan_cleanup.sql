-- Storage orphan cleanup. 0001-0011 are never edited; everything here is additive.
--
-- The app uploads files with the signed-in user's own token and then calls the function that records them
-- (build_dataset for three files in admin-files, release_dataset for the analysis file in Team's case-files).
-- When that call fails the uploads stay behind, because neither bucket had a DELETE policy. These policies let the
-- same token remove them, and nothing else:
--
--  1. admin-files: a lab writer (owner, admin, operator) may delete an object under <client_id>/<order_code>/ of a
--     live order (admin.is_admin_files_path, 0006) that no admin row refers to. Referred to = the path is a
--     dataset's storage_path or companion_path or a results file's storage_path, or it lies in a datasets/<digest>/
--     folder whose digest any dataset records (sha256, analysis_sha256, companion_sha256: build_dataset's files and
--     0007's single-folder layout). Every dataset counts, built, released, withdrawn, superseded or archived, so a
--     recorded file is never removable. Staff can already read the bucket (admin_files_staff_read), which a
--     DELETE needs (Postgres applies SELECT policies to the rows a DELETE ... WHERE/RETURNING reads).
--  2. case-files (Team's bucket): an eligible signer may read and delete an object while its path is pending in the
--     sense of 0007 (admin.is_pending_analysis_path: path shape <project_id>/<analysis_sha256>, the digest of a
--     built, live dataset, no pilot_projects row with that id yet), the same condition under which it could insert
--     it. Never a released project's file. Team's own policies are untouched.
--
-- Still no UPDATE policy on either bucket: an object is never overwritten.

-- ---------------------------------------------------------------- 1. admin-files

CREATE FUNCTION admin.is_referenced_admin_file(p_name text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT p_name IS NULL OR NOT admin.is_lab_writer() -- answers only lab writers; anyone else learns nothing
            OR EXISTS (SELECT 1 FROM admin.result_file f WHERE f.storage_path = p_name)
            OR EXISTS (SELECT 1 FROM admin.dataset d
                        WHERE d.storage_path = p_name OR d.companion_path = p_name
                           OR (split_part(p_name, '/', 3) = 'datasets'
                               AND split_part(p_name, '/', 4) IN (d.sha256, d.analysis_sha256, d.companion_sha256))) $$;
REVOKE EXECUTE ON FUNCTION admin.is_referenced_admin_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.is_referenced_admin_file(text) TO authenticated; -- evaluated inside the policy below

CREATE POLICY admin_files_orphan_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'admin-files' AND admin.is_lab_writer() AND admin.is_admin_files_path(name)
         AND NOT admin.is_referenced_admin_file(name));

-- ---------------------------------------------------------------- 2. case-files

CREATE POLICY case_files_pending_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'case-files' AND admin.is_pending_analysis_path(name));
CREATE POLICY case_files_pending_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'case-files' AND admin.is_pending_analysis_path(name));
