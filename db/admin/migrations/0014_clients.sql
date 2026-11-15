-- Round 1 client management and active-client write gates.
CREATE FUNCTION admin.client_is_active(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT EXISTS (SELECT 1 FROM admin.client WHERE id = cid AND archived_at IS NULL) $$;

CREATE OR REPLACE FUNCTION admin.can_submit(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, admin
  AS $$ SELECT admin.client_is_active(cid)
               AND (admin.is_lab_writer() OR coalesce(admin.client_role(auth.uid(), cid) IN ('client_admin', 'requester'), false)) $$;

-- Require an active client for order inserts, including those made by lab writers.
ALTER POLICY order_insert ON admin."order"
  WITH CHECK (admin.client_is_active(client_id) AND admin.can_submit(client_id));

CREATE FUNCTION admin.create_client(p_name text, p_kind text, p_billing_method text, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE client_id uuid;
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to manage clients' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Client name is required' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('pi_lab', 'internal_group', 'company') THEN
    RAISE EXCEPTION 'Choose a valid client kind' USING ERRCODE = '22023';
  END IF;
  IF p_billing_method IS NOT NULL AND p_billing_method NOT IN ('charge_code', 'po', 'grant', 'quote') THEN
    RAISE EXCEPTION 'Choose a valid billing method' USING ERRCODE = '22023';
  END IF;
  INSERT INTO admin.client(name, kind, billing_method, notes)
    VALUES (btrim(p_name), p_kind, p_billing_method, nullif(btrim(p_notes), '')) RETURNING id INTO client_id;
  RETURN client_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A client named "%" already exists', btrim(p_name) USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION admin.update_client(p_client_id uuid, p_name text, p_kind text, p_billing_method text, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE client admin.client;
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to manage clients' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO client FROM admin.client WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002'; END IF;
  IF client.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Client is archived' USING ERRCODE = '55000'; END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Client name is required' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('pi_lab', 'internal_group', 'company') THEN
    RAISE EXCEPTION 'Choose a valid client kind' USING ERRCODE = '22023';
  END IF;
  IF p_billing_method IS NOT NULL AND p_billing_method NOT IN ('charge_code', 'po', 'grant', 'quote') THEN
    RAISE EXCEPTION 'Choose a valid billing method' USING ERRCODE = '22023';
  END IF;
  UPDATE admin.client SET name = btrim(p_name), kind = p_kind, billing_method = p_billing_method,
    notes = nullif(btrim(p_notes), '') WHERE id = p_client_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A client named "%" already exists', btrim(p_name) USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION admin.archive_client(p_client_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE client admin.client;
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to manage clients' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Archiving a client needs a reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO client FROM admin.client WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002'; END IF;
  IF client.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Client is already archived' USING ERRCODE = '55000'; END IF;
  IF EXISTS (SELECT 1 FROM admin."order" WHERE client_id = p_client_id AND archived_at IS NULL AND stage <> 'released') THEN
    RAISE EXCEPTION 'Client has an open order; release or archive its open orders first' USING ERRCODE = '55000';
  END IF;
  UPDATE admin.client SET archived_at = now(), archived_reason = btrim(p_reason) WHERE id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION admin.client_is_active(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.create_client(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.update_client(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.archive_client(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.client_is_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.create_client(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.update_client(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.archive_client(uuid, text) TO authenticated;
