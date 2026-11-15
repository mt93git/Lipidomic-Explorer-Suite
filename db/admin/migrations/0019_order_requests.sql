-- F2: clients request orders, the lab accepts or declines (docs/admin/client-zone-proposal/proposal.html, 0019).
-- admin."order" gains a review: pending (a client asked, the lab has not answered), accepted or declined. The default
-- is accepted, so every existing row and every order the lab opens with create_order is unchanged. A client admin or
-- requester asks through admin.request_order (the one way in for a client: 0018 closed their direct writes); a lab
-- writer answers with admin.accept_order or admin.decline_order. Declining archives the order with the lab's reason,
-- so it leaves every lab list while the client still reads the row and the reason (order_read is can_read_client).
-- receive_shipment refuses a pending order. All writes are audited by the existing zz_audit trigger on order.
-- Also the lab's shipping instructions: one current text, shown to clients on the Accepted step, read by every
-- signed-in user and written only by admin.set_shipping_instructions (lab Owner or Admin). Earlier texts are kept,
-- archived, like release_policy.

ALTER TABLE admin."order"
  ADD COLUMN review      text NOT NULL DEFAULT 'accepted' CHECK (review IN ('pending', 'accepted', 'declined')),
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by uuid REFERENCES auth.users,
  -- A declined request is always archived (with the lab's reason); an answer records when it was given.
  ADD CONSTRAINT order_declined_is_archived CHECK (review <> 'declined' OR archived_at IS NOT NULL),
  ADD CONSTRAINT order_pending_not_reviewed CHECK (review <> 'pending' OR (reviewed_at IS NULL AND reviewed_by IS NULL));

-- ---------------------------------------------------------------- request, accept, decline

-- Same fields and checks as create_order; the caller must be a client admin or requester of that client.
-- The role is read without the client's archival so a member of an archived client is told it is archived.
CREATE FUNCTION admin.request_order(p_client_id uuid, p_panel_id uuid, p_title text, p_matrix text, p_expected_samples int,
                                    p_billing_ref text, p_notes text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  c admin.client;
  p admin.panel;
  v_title text := nullif(btrim(p_title), '');
  new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin.client_member
                  WHERE user_id = auth.uid() AND client_id = p_client_id AND archived_at IS NULL
                    AND role IN ('client_admin', 'requester')) THEN
    RAISE EXCEPTION 'only a client admin or requester of this client may request orders for it' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- FOR SHARE: a concurrent archive_client waits for this order and then sees it.
  SELECT * INTO c FROM admin.client WHERE id = p_client_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING ERRCODE = 'no_data_found';
  END IF;
  IF c.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'client % is archived; it cannot request new orders', c.name USING ERRCODE = 'object_not_in_prerequisite_state';
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

  INSERT INTO admin."order" (client_id, panel_id, title, matrix, expected_samples, stage, billing_ref, requested_by, notes, review)
  VALUES (c.id, p_panel_id, v_title, nullif(btrim(p_matrix), ''), p_expected_samples, 'request',
          nullif(btrim(p_billing_ref), ''), auth.uid(), nullif(btrim(p_notes), ''), 'pending')
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- Lock a live order that is still waiting for an answer. An answered one is a conflict (PT409, HTTP 409: read the
-- order again; not 40001, which PostgREST retries forever): someone else answered first.
CREATE FUNCTION admin.lock_pending_order(p_order_id uuid) RETURNS admin."order"
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE o admin."order";
BEGIN
  o := admin.lock_order(p_order_id);
  IF o.review <> 'pending' THEN
    RAISE EXCEPTION 'order % is not waiting for an answer; it is already %', o.code, o.review USING ERRCODE = 'PT409';
  END IF;
  RETURN o;
END $$;

-- Accept a pending request: who and when, and the panel when the lab set or changed it (null keeps the client's).
CREATE FUNCTION admin.accept_order(p_order_id uuid, p_panel_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  p admin.panel;
BEGIN
  PERFORM admin.require_lab_writer('accept order requests');
  o := admin.lock_pending_order(p_order_id);
  IF p_panel_id IS NOT NULL THEN
    SELECT * INTO p FROM admin.panel WHERE id = p_panel_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'panel % not found', p_panel_id USING ERRCODE = 'no_data_found';
    END IF;
    IF p.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'panel % is archived; choose an active panel', p.name USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;
  UPDATE admin."order"
     SET review = 'accepted', reviewed_at = now(), reviewed_by = auth.uid(), panel_id = coalesce(p_panel_id, panel_id)
   WHERE id = o.id;
END $$;

-- Decline a pending request with the reason the client reads; the order is archived with that reason, never deleted.
CREATE FUNCTION admin.decline_order(p_order_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  PERFORM admin.require_lab_writer('decline order requests');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'declining a request needs a reason; the client reads it' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  o := admin.lock_pending_order(p_order_id);
  UPDATE admin."order"
     SET review = 'declined', reviewed_at = now(), reviewed_by = auth.uid(), archived_at = now(), archived_reason = v_reason
   WHERE id = o.id;
END $$;

-- ---------------------------------------------------------------- receive_shipment (0005) with one more check

CREATE OR REPLACE FUNCTION admin.receive_shipment(p_order_id uuid, p_carrier text, p_tracking_number text, p_condition text,
                                                  p_box_count int, p_notes text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  sid uuid;
BEGIN
  PERFORM admin.require_lab_writer('receive shipments');
  o := admin.lock_order(p_order_id);
  IF o.review = 'pending' THEN
    RAISE EXCEPTION 'order % is a client request waiting for an answer. Accept the request first', o.code
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  INSERT INTO admin.shipment (client_id, order_id, carrier, tracking_number, condition, box_count, notes, received_at, received_by)
  VALUES (o.client_id, o.id, p_carrier, p_tracking_number, p_condition, p_box_count, p_notes, now(), auth.uid())
  RETURNING id INTO sid;
  PERFORM admin.advance_stage(o.id, 'received');
  RETURN sid;
END $$;

-- ---------------------------------------------------------------- shipping instructions

CREATE TABLE admin.shipping_instructions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  body            text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 2000),
  set_by          uuid REFERENCES auth.users,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);
CREATE UNIQUE INDEX shipping_instructions_one_current ON admin.shipping_instructions ((true)) WHERE archived_at IS NULL;

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.shipping_instructions FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.shipping_instructions FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.shipping_instructions FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

ALTER TABLE admin.shipping_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY shipping_instructions_read ON admin.shipping_instructions FOR SELECT TO authenticated USING (true);
REVOKE ALL ON admin.shipping_instructions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON admin.shipping_instructions TO authenticated;

-- Replace the current text; a blank text clears it (clients then read the generic sentence). Owner or Admin.
CREATE FUNCTION admin.set_shipping_instructions(p_body text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_body text := nullif(btrim(p_body), '');
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to set the shipping instructions' USING ERRCODE = '42501';
  END IF;
  IF length(v_body) > 2000 THEN
    RAISE EXCEPTION 'shipping instructions are limited to 2000 characters (got %)', length(v_body) USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('admin.shipping_instructions'));
  UPDATE admin.shipping_instructions SET archived_at = now(), archived_reason = CASE WHEN v_body IS NULL THEN 'cleared' ELSE 'replaced' END
   WHERE archived_at IS NULL;
  IF v_body IS NOT NULL THEN
    INSERT INTO admin.shipping_instructions (body, set_by) VALUES (v_body, auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.lock_pending_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin.request_order(uuid, uuid, text, text, int, text, text), admin.accept_order(uuid, uuid),
  admin.decline_order(uuid, text), admin.set_shipping_instructions(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.request_order(uuid, uuid, text, text, int, text, text), admin.accept_order(uuid, uuid),
  admin.decline_order(uuid, text), admin.set_shipping_instructions(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
