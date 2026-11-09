-- Nexo's store per client (docs/integration/nexo-store-scope.md). 0001-0010 are never edited; everything here is
-- additive.
--
-- The Nexo API calls this through PostgREST with `apikey: <anon>` and the signed-in Admin user's own access token
-- (as for 0010's nexo_dataset_for_caller) to decide which checkpoint workspaces the caller may use. Lab staff (owner,
-- admin or operator, unarchived): one row, caller_view 'staff', client_id null (the staff workspace). A client member:
-- one row per active membership of an unarchived client, caller_view 'client'. Staff wins when someone is both.
-- Anyone else (a lab member, no role, archived, no subject): no rows. Grants nothing else.

CREATE FUNCTION admin.nexo_caller()
  RETURNS TABLE (caller uuid, caller_view text, client_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  SELECT auth.uid(), 'staff', NULL::uuid
   WHERE admin.is_lab_staff(auth.uid())
  UNION ALL
  SELECT m.user_id, 'client', m.client_id
    FROM admin.client_member m
    JOIN admin.client c ON c.id = m.client_id
   WHERE m.user_id = auth.uid()
     AND m.archived_at IS NULL
     AND c.archived_at IS NULL
     AND NOT admin.is_lab_staff(auth.uid())
   ORDER BY 3 $$;

REVOKE EXECUTE ON FUNCTION admin.nexo_caller() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.nexo_caller() TO authenticated;

NOTIFY pgrst, 'reload schema';
