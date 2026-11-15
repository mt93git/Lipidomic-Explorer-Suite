-- New order (Admin waves 2 rest / 3, round 1 contract): lab staff open an order for a client.
-- admin.create_order inserts admin."order" at stage request with requested_by = the caller; the existing zz_audit
-- trigger records it. Refuses non-writers, an unknown or archived client, an unknown or archived panel.
-- A null panel is allowed (the column is nullable: the panel can be chosen later). Blank text is stored as null.

CREATE FUNCTION admin.create_order(p_client_id uuid, p_panel_id uuid, p_title text, p_matrix text, p_expected_samples int,
                                   p_billing_ref text, p_notes text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  c admin.client;
  p admin.panel;
  v_title text := nullif(btrim(p_title), '');
  new_id uuid;
BEGIN
  PERFORM admin.require_lab_writer('create orders');
  -- FOR SHARE: a concurrent archive_client waits for this order and then sees it.
  SELECT * INTO c FROM admin.client WHERE id = p_client_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING ERRCODE = 'no_data_found';
  END IF;
  IF c.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'client % is archived; it cannot receive new orders', c.name USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_panel_id IS NOT NULL THEN
    SELECT * INTO p FROM admin.panel WHERE id = p_panel_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'panel % not found', p_panel_id USING ERRCODE = 'no_data_found';
    END IF;
    IF p.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'panel % is archived; choose an active panel', p.name USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'an order title is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_expected_samples < 0 THEN
    RAISE EXCEPTION 'expected samples must be zero or more' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO admin."order" (client_id, panel_id, title, matrix, expected_samples, stage, billing_ref, requested_by, notes)
  VALUES (c.id, p_panel_id, v_title, nullif(btrim(p_matrix), ''), p_expected_samples, 'request',
          nullif(btrim(p_billing_ref), ''), auth.uid(), nullif(btrim(p_notes), ''))
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION admin.create_order(uuid, uuid, text, text, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.create_order(uuid, uuid, text, text, int, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
