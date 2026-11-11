-- F0: close direct client writes on order, shipment and sample.
-- Until now these policies used admin.can_submit(client_id) (0004; order_insert re-gated in 0014), so a
-- client_admin or requester could insert or update the rows with their own token, order.stage included.
-- The app writes them only through SECURITY DEFINER functions (create_order, receive_shipment,
-- register_samples, advance_stage and the batch and release functions), which bypass RLS, so client roles
-- never need a direct write. Now only lab writers write directly, like aliquot (0004). For lab writers
-- can_submit was client_is_active AND is_lab_writer (0014), so that is kept: an archived client still takes
-- no new or changed rows. Read policies are unchanged.

DROP POLICY order_insert ON admin."order";
DROP POLICY order_update ON admin."order";
CREATE POLICY order_insert ON admin."order" FOR INSERT TO authenticated
  WITH CHECK (admin.client_is_active(client_id) AND admin.is_lab_writer());
CREATE POLICY order_update ON admin."order" FOR UPDATE TO authenticated
  USING (admin.client_is_active(client_id) AND admin.is_lab_writer())
  WITH CHECK (admin.client_is_active(client_id) AND admin.is_lab_writer());

DROP POLICY shipment_insert ON admin.shipment;
DROP POLICY shipment_update ON admin.shipment;
CREATE POLICY shipment_insert ON admin.shipment FOR INSERT TO authenticated
  WITH CHECK (admin.client_is_active(client_id) AND admin.is_lab_writer());
CREATE POLICY shipment_update ON admin.shipment FOR UPDATE TO authenticated
  USING (admin.client_is_active(client_id) AND admin.is_lab_writer())
  WITH CHECK (admin.client_is_active(client_id) AND admin.is_lab_writer());

DROP POLICY sample_insert ON admin.sample;
DROP POLICY sample_update ON admin.sample;
CREATE POLICY sample_insert ON admin.sample FOR INSERT TO authenticated
  WITH CHECK (admin.client_is_active(client_id) AND admin.is_lab_writer());
CREATE POLICY sample_update ON admin.sample FOR UPDATE TO authenticated
  USING (admin.client_is_active(client_id) AND admin.is_lab_writer())
  WITH CHECK (admin.client_is_active(client_id) AND admin.is_lab_writer());
