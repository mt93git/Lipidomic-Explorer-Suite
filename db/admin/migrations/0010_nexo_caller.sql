-- Admin accounts in Nexo (docs/integration/admin-identity.md). 0001-0009 are never edited; everything here is
-- additive.
--
-- The Nexo API calls this through PostgREST with `apikey: <anon>` and the signed-in Admin user's own access token
-- (`Authorization: Bearer <GoTrue JWT>`, from GET /admin/api/session-token). PostgREST verifies the JWT and switches
-- to `authenticated`; auth.uid() is that user. A row only when the dataset is released and unarchived, its order is
-- unarchived, and the caller is lab staff (owner, admin or operator: caller_view 'staff') or an active member of the
-- dataset's client (membership and client unarchived: caller_view 'client'). Staff wins when someone is both. No row
-- for anything else, so "not yours" and "does not exist" are the same answer (the Nexo API's 404).
-- The download itself stays on the nexo_reader path of 0009; this function grants nothing in Storage.

CREATE FUNCTION admin.nexo_dataset_for_caller(p_dataset_id uuid)
  RETURNS TABLE (dataset_id uuid, order_code text, version int, storage_path text, sha256 text, client_id uuid,
                 caller uuid, caller_view text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  SELECT d.id, o.code, d.version, d.storage_path, d.sha256, d.client_id, who.uid, who.caller_view
    FROM admin.dataset d
    JOIN admin."order" o ON o.id = d.order_id
    CROSS JOIN LATERAL (
      SELECT auth.uid() AS uid,
             CASE WHEN admin.is_lab_staff(auth.uid()) THEN 'staff'
                  WHEN admin.is_client_member(auth.uid(), d.client_id) THEN 'client' END AS caller_view
    ) who
   WHERE d.id = p_dataset_id
     AND d.status = 'released'
     AND d.archived_at IS NULL
     AND o.archived_at IS NULL
     AND who.uid IS NOT NULL
     AND who.caller_view IS NOT NULL $$;

REVOKE EXECUTE ON FUNCTION admin.nexo_dataset_for_caller(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.nexo_dataset_for_caller(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
