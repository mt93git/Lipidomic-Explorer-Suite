-- Row-level security and grants for the application role `authenticated`.
--
-- Read:  lab staff (owner, admin, operator) read everything; client members read their clients' rows;
--        a mixed batch shows each client only its own injections; clients see only released datasets;
--        result files, instruments and audit are staff-only; panels are readable by everyone signed in.
-- Write: owner/admin manage clients, members, lab staff, instruments and panels;
--        owner/admin/operator run the lab (aliquots, boxes, exclusions, batches, injections, results,
--        names, datasets, signatures, jobs); client admins and requesters submit orders, shipments and
--        sample metadata for their own client; client admins manage their own client's members;
--        viewers and lab members only read.
-- There are no DELETE policies and no DELETE/TRUNCATE grants.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client', 'client_member', 'lab_staff', 'instrument', 'panel', 'order', 'shipment',
                           'sample', 'aliquot', 'box_position', 'exclusion', 'batch', 'batch_version', 'injection',
                           'result_file', 'name_map', 'dataset', 'signature', 'audit_event', 'job'] LOOP
    EXECUTE format('ALTER TABLE admin.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- client
CREATE POLICY client_read ON admin.client FOR SELECT TO authenticated USING (admin.can_read_client(id));
CREATE POLICY client_insert ON admin.client FOR INSERT TO authenticated WITH CHECK (admin.is_lab_manager());
CREATE POLICY client_update ON admin.client FOR UPDATE TO authenticated
  USING (admin.is_lab_manager()) WITH CHECK (admin.is_lab_manager());

-- client_member
CREATE POLICY client_member_read ON admin.client_member FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY client_member_insert ON admin.client_member FOR INSERT TO authenticated
  WITH CHECK (admin.is_lab_manager() OR admin.client_role(auth.uid(), client_id) = 'client_admin');
CREATE POLICY client_member_update ON admin.client_member FOR UPDATE TO authenticated
  USING (admin.is_lab_manager() OR admin.client_role(auth.uid(), client_id) = 'client_admin')
  WITH CHECK (admin.is_lab_manager() OR admin.client_role(auth.uid(), client_id) = 'client_admin');

-- lab_staff: only an owner may create or keep an owner.
CREATE POLICY lab_staff_read ON admin.lab_staff FOR SELECT TO authenticated
  USING (admin.is_lab_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY lab_staff_insert ON admin.lab_staff FOR INSERT TO authenticated
  WITH CHECK (admin.is_lab_manager() AND (role <> 'owner' OR admin.lab_role(auth.uid()) = 'owner'));
CREATE POLICY lab_staff_update ON admin.lab_staff FOR UPDATE TO authenticated
  USING (admin.is_lab_manager() AND (role <> 'owner' OR admin.lab_role(auth.uid()) = 'owner'))
  WITH CHECK (admin.is_lab_manager() AND (role <> 'owner' OR admin.lab_role(auth.uid()) = 'owner'));

-- instrument, panel (reference data)
CREATE POLICY instrument_read ON admin.instrument FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()));
CREATE POLICY instrument_insert ON admin.instrument FOR INSERT TO authenticated WITH CHECK (admin.is_lab_manager());
CREATE POLICY instrument_update ON admin.instrument FOR UPDATE TO authenticated
  USING (admin.is_lab_manager()) WITH CHECK (admin.is_lab_manager());

CREATE POLICY panel_read ON admin.panel FOR SELECT TO authenticated USING (true);
CREATE POLICY panel_insert ON admin.panel FOR INSERT TO authenticated WITH CHECK (admin.is_lab_manager());
CREATE POLICY panel_update ON admin.panel FOR UPDATE TO authenticated
  USING (admin.is_lab_manager()) WITH CHECK (admin.is_lab_manager());

-- order, shipment, sample: submitted by the client, managed by the lab
CREATE POLICY order_read ON admin."order" FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY order_insert ON admin."order" FOR INSERT TO authenticated WITH CHECK (admin.can_submit(client_id));
CREATE POLICY order_update ON admin."order" FOR UPDATE TO authenticated
  USING (admin.can_submit(client_id)) WITH CHECK (admin.can_submit(client_id));

CREATE POLICY shipment_read ON admin.shipment FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY shipment_insert ON admin.shipment FOR INSERT TO authenticated WITH CHECK (admin.can_submit(client_id));
CREATE POLICY shipment_update ON admin.shipment FOR UPDATE TO authenticated
  USING (admin.can_submit(client_id)) WITH CHECK (admin.can_submit(client_id));

CREATE POLICY sample_read ON admin.sample FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY sample_insert ON admin.sample FOR INSERT TO authenticated WITH CHECK (admin.can_submit(client_id));
CREATE POLICY sample_update ON admin.sample FOR UPDATE TO authenticated
  USING (admin.can_submit(client_id)) WITH CHECK (admin.can_submit(client_id));

-- lab-operated client data: clients read, lab writes
CREATE POLICY aliquot_read ON admin.aliquot FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY aliquot_insert ON admin.aliquot FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY aliquot_update ON admin.aliquot FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

CREATE POLICY box_position_read ON admin.box_position FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY box_position_insert ON admin.box_position FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY box_position_update ON admin.box_position FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

CREATE POLICY exclusion_read ON admin.exclusion FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY exclusion_insert ON admin.exclusion FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY exclusion_update ON admin.exclusion FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

CREATE POLICY name_map_read ON admin.name_map FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY name_map_insert ON admin.name_map FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY name_map_update ON admin.name_map FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

CREATE POLICY job_read ON admin.job FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY job_insert ON admin.job FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY job_update ON admin.job FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

-- batches: shared across clients. A client sees a batch (name, version) only if it holds one of its injections.
CREATE POLICY batch_read ON admin.batch FOR SELECT TO authenticated
  USING (admin.is_lab_staff(auth.uid()) OR admin.batch_has_my_injection(auth.uid(), id));
CREATE POLICY batch_insert ON admin.batch FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY batch_update ON admin.batch FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

CREATE POLICY batch_version_read ON admin.batch_version FOR SELECT TO authenticated
  USING (admin.is_lab_staff(auth.uid()) OR admin.batch_has_my_injection(auth.uid(), batch_id));
CREATE POLICY batch_version_insert ON admin.batch_version FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY batch_version_update ON admin.batch_version FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

-- injection: QC/blank rows (client_id NULL) are staff-only.
CREATE POLICY injection_read ON admin.injection FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY injection_insert ON admin.injection FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY injection_update ON admin.injection FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

CREATE POLICY result_file_read ON admin.result_file FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()));
CREATE POLICY result_file_insert ON admin.result_file FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY result_file_update ON admin.result_file FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

-- dataset: clients see released (and later superseded/withdrawn) versions only.
CREATE POLICY dataset_read ON admin.dataset FOR SELECT TO authenticated
  USING (admin.is_lab_staff(auth.uid())
         OR (status IN ('released', 'superseded', 'withdrawn') AND admin.is_client_member(auth.uid(), client_id)));
CREATE POLICY dataset_insert ON admin.dataset FOR INSERT TO authenticated WITH CHECK (admin.is_lab_writer());
CREATE POLICY dataset_update ON admin.dataset FOR UPDATE TO authenticated
  USING (admin.is_lab_writer()) WITH CHECK (admin.is_lab_writer());

-- signature: lab people sign as themselves.
CREATE POLICY signature_read ON admin.signature FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
CREATE POLICY signature_insert ON admin.signature FOR INSERT TO authenticated
  WITH CHECK (admin.is_lab_writer() AND user_id = auth.uid());
CREATE POLICY signature_update ON admin.signature FOR UPDATE TO authenticated
  USING (admin.is_lab_writer() AND user_id = auth.uid()) WITH CHECK (admin.is_lab_writer() AND user_id = auth.uid());

-- audit_event: read by lab staff only; written only by the audit trigger.
CREATE POLICY audit_event_read ON admin.audit_event FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()));

-- ---------------------------------------------------------------- grants

REVOKE ALL ON SCHEMA admin FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA admin FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA admin FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA admin FROM PUBLIC;

GRANT USAGE ON SCHEMA admin TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA admin TO authenticated;
REVOKE INSERT, UPDATE ON admin.audit_event FROM authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA admin TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA admin TO authenticated;
