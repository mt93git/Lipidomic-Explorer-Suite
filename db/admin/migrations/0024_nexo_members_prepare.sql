-- Nexo's own entry (Gerardo, 2026-11-10): Nexo is a separate app signed in with Admin's accounts. A client's members may
-- prepare datasets and upload their own Excel in Nexo only when the lab enables it per client (off by default).
-- 0001-0023 are never edited.
--
-- 1. admin.client.members_prepare (default off). Changed only by set_client_members_prepare (lab Owner or Admin), and
--    turned on only while the client's nexo_access (0021) is on; audited by the client's zz_audit. Like nexo_access, it
--    is not in the app role's column grants (0021), so no direct insert or update.
-- 2. admin.nexo_datasets_for_caller(): the released datasets the signed-in user may open in Nexo (Nexo's landing list).
--    Lab staff: every released dataset of a live order. A client member: those of their clients with nexo_access on.
--    Same rule as nexo_dataset_for_caller (0022), for all datasets at once; no e-mail anywhere.
-- 3. nexo_dataset_for_caller (0022) and nexo_caller (0022) gain a last column members_prepare: same rows and grants.
--
-- members_prepare in every row is the row's client's effective switch: nexo_access AND members_prepare (the stored
-- value does not count while Nexo access is off). nexo_caller's staff row has no client, so NULL there.

ALTER TABLE admin.client ADD COLUMN members_prepare boolean NOT NULL DEFAULT false;

CREATE FUNCTION admin.set_client_members_prepare(p_client_id uuid, p_enabled boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE c admin.client;
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to change whether a client''s members prepare in Nexo' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'Say whether the client''s members may prepare in Nexo' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM admin.client WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002'; END IF;
  IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Client is archived' USING ERRCODE = '55000'; END IF;
  IF p_enabled AND NOT c.nexo_access THEN
    RAISE EXCEPTION 'Turn Nexo access on for this client first' USING ERRCODE = '55000';
  END IF;
  IF c.members_prepare = p_enabled THEN RETURN; END IF;
  UPDATE admin.client SET members_prepare = p_enabled WHERE id = c.id;
END $$;

REVOKE EXECUTE ON FUNCTION admin.set_client_members_prepare(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.set_client_members_prepare(uuid, boolean) TO authenticated;

CREATE FUNCTION admin.nexo_datasets_for_caller()
  RETURNS TABLE (dataset_id uuid, order_code text, version int, client_id uuid, client_name text, released_at timestamptz,
                 members_prepare boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  SELECT d.id, o.code, d.version, d.client_id, c.name, d.released_at, c.nexo_access AND c.members_prepare
    FROM admin.dataset d
    JOIN admin."order" o ON o.id = d.order_id
    JOIN admin.client c ON c.id = d.client_id
   WHERE d.status = 'released'
     AND d.archived_at IS NULL
     AND o.archived_at IS NULL
     AND auth.uid() IS NOT NULL
     AND (admin.is_lab_staff(auth.uid()) OR (c.nexo_access AND admin.is_client_member(auth.uid(), d.client_id)))
   ORDER BY o.code, d.version $$;

REVOKE EXECUTE ON FUNCTION admin.nexo_datasets_for_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.nexo_datasets_for_caller() TO authenticated;

-- The result types change, so DROP + CREATE (CREATE OR REPLACE cannot add a column); grants as 0010/0011 set them.
DROP FUNCTION admin.nexo_dataset_for_caller(uuid);
CREATE FUNCTION admin.nexo_dataset_for_caller(p_dataset_id uuid)
  RETURNS TABLE (dataset_id uuid, order_code text, version int, storage_path text, sha256 text, client_id uuid,
                 caller uuid, caller_view text, members_prepare boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  SELECT d.id, o.code, d.version, d.storage_path, d.sha256, d.client_id, who.uid, who.caller_view,
         c.nexo_access AND c.members_prepare
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

REVOKE EXECUTE ON FUNCTION admin.nexo_dataset_for_caller(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.nexo_dataset_for_caller(uuid) TO authenticated;

DROP FUNCTION admin.nexo_caller();
CREATE FUNCTION admin.nexo_caller()
  RETURNS TABLE (caller uuid, caller_view text, client_id uuid, members_prepare boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
  SELECT auth.uid(), 'staff', NULL::uuid, NULL::boolean
   WHERE admin.is_lab_staff(auth.uid())
  UNION ALL
  SELECT m.user_id, 'client', m.client_id, c.members_prepare
    FROM admin.client_member m
    JOIN admin.client c ON c.id = m.client_id
   WHERE m.user_id = auth.uid()
     AND m.archived_at IS NULL
     AND c.archived_at IS NULL
     AND c.nexo_access
     AND NOT admin.is_lab_staff(auth.uid())
   ORDER BY 3 $$;

REVOKE EXECUTE ON FUNCTION admin.nexo_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.nexo_caller() TO authenticated;

NOTIFY pgrst, 'reload schema';
