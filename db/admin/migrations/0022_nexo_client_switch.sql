-- F4b: the per-client Nexo switch (0021's admin.client.nexo_access) decides access in the database, not only in the
-- app. 0001-0021 are never edited; this replaces three functions with the same signatures, grants and style.
--
-- A client's people reach Nexo only while their client's nexo_access is true:
--   nexo_dataset_for_caller (0010): caller_view 'client' only for a dataset whose client has the switch on.
--   nexo_caller (0011): client rows only for clients with the switch on.
--   nexo_people (0017): members of a client with the switch off are not listed as share targets.
-- Lab staff are unchanged everywhere: they keep their rows whatever the switch says.

CREATE OR REPLACE FUNCTION admin.nexo_dataset_for_caller(p_dataset_id uuid)
  RETURNS TABLE (dataset_id uuid, order_code text, version int, storage_path text, sha256 text, client_id uuid,
                 caller uuid, caller_view text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  SELECT d.id, o.code, d.version, d.storage_path, d.sha256, d.client_id, who.uid, who.caller_view
    FROM admin.dataset d
    JOIN admin."order" o ON o.id = d.order_id
    JOIN admin.client c ON c.id = d.client_id
    CROSS JOIN LATERAL (
      SELECT auth.uid() AS uid,
             CASE WHEN admin.is_lab_staff(auth.uid()) THEN 'staff'
                  WHEN c.nexo_access AND admin.is_client_member(auth.uid(), d.client_id) THEN 'client' END AS caller_view
    ) who
   WHERE d.id = p_dataset_id
     AND d.status = 'released'
     AND d.archived_at IS NULL
     AND o.archived_at IS NULL
     AND who.uid IS NOT NULL
     AND who.caller_view IS NOT NULL $$;

REVOKE EXECUTE ON FUNCTION admin.nexo_dataset_for_caller(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.nexo_dataset_for_caller(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION admin.nexo_caller()
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
     AND c.nexo_access
     AND NOT admin.is_lab_staff(auth.uid())
   ORDER BY 3 $$;

REVOKE EXECUTE ON FUNCTION admin.nexo_caller() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.nexo_caller() TO authenticated;

CREATE OR REPLACE FUNCTION admin.nexo_people(p_client_id uuid)
  RETURNS TABLE (user_id uuid, display_name text, kind text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  SELECT s.user_id, s.display_name, 'staff'::text
    FROM admin.lab_staff s
   WHERE s.archived_at IS NULL AND s.role IN ('owner', 'admin', 'operator')
     AND admin.can_read_client(p_client_id)
  UNION ALL
  SELECT m.user_id, m.display_name, 'member'::text
    FROM admin.client_member m
    JOIN admin.client c ON c.id = m.client_id
   WHERE m.client_id = p_client_id AND m.archived_at IS NULL AND c.archived_at IS NULL AND c.nexo_access
     AND admin.can_read_client(p_client_id)
     AND NOT admin.is_lab_staff(m.user_id) $$;

REVOKE EXECUTE ON FUNCTION admin.nexo_people(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.nexo_people(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
