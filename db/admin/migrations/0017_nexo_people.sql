-- Additive Admin profile contract for Nexo (written as 0012 on router/20261109-235832-1ec3be; renumbered 0017: 0012 is storage orphan cleanup).
ALTER TABLE admin.client_member ADD COLUMN display_name text;

-- Same caller scope and EXECUTE roles as nexo_caller; names only, never auth.users/e-mails.
CREATE FUNCTION admin.nexo_people(p_client_id uuid)
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
   WHERE m.client_id = p_client_id AND m.archived_at IS NULL AND c.archived_at IS NULL
     AND admin.can_read_client(p_client_id)
     AND NOT admin.is_lab_staff(m.user_id) $$;

REVOKE EXECUTE ON FUNCTION admin.nexo_people(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.nexo_people(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
