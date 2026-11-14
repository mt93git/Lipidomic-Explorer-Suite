-- Small permission fixes (2026-11-14). 0001-0037 are never edited.
--
-- 1. admin.record_audit_export(p_entity, p_order, p_rows, p_truncated): lab staff (Owner, Admin, Operator) only,
--    called by the Audit log's Export CSV route before the file is sent: one audit row (entity audit_export, no
--    client, actor = the person exporting) with the filter used and how many rows the file holds. The Audit log
--    shows it like other events ("Audit log exported: 12 rows, entity order, ORD080").
-- 2. admin.next_client_code() (0037) was executable by every authenticated user, clients included, and each call
--    spent a code. Now the function refuses a signed-in caller who is not a lab Owner or Admin (the only people who
--    may create clients). EXECUTE stays granted to authenticated because it is admin.client.code's default: a lab
--    Owner or Admin's insert (RLS client_write) evaluates it as that user. create_client and approve_access_request
--    (SECURITY DEFINER) run it as the owner; seeds and migrations run as the owner without a JWT and keep working.

CREATE FUNCTION admin.record_audit_export(p_entity text, p_order text, p_rows integer, p_truncated boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF NOT admin.is_lab_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Lab staff access is required to export the audit log' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR p_rows < 0 THEN
    RAISE EXCEPTION 'The export''s row count is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO admin.audit_event (actor, client_id, entity, entity_id, action, before, after)
  VALUES (auth.uid(), NULL, 'audit_export', NULL, 'INSERT', NULL,
          jsonb_build_object('entity', left(nullif(btrim(p_entity), ''), 40), 'order', left(nullif(btrim(p_order), ''), 40),
                             'rows', p_rows, 'truncated', coalesce(p_truncated, false)));
END $$;

REVOKE EXECUTE ON FUNCTION admin.record_audit_export(text, text, integer, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.record_audit_export(text, text, integer, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION admin.next_client_code() RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to give a client code' USING ERRCODE = '42501';
  END IF;
  RETURN 'CL-' || lpad(nextval('admin.client_code_seq')::text, 3, '0');
END $$;

REVOKE EXECUTE ON FUNCTION admin.next_client_code() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.next_client_code() TO authenticated;

NOTIFY pgrst, 'reload schema';
