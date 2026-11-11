-- Batches (Admin waves 3, round 2): the lab staff's way to plan a batch, export its sequence and record acquisition.
-- RLS already lets lab writers insert batch, batch_version and injection rows and update orders, but a batch is
-- several rows plus a name, aliquots and the orders' stage that must change together or not at all, and a REST client
-- cannot make that atomic. So the three writes are SECURITY DEFINER functions (search_path pinned, require_lab_writer,
-- granted to `authenticated`); the existing zz_audit triggers record every row they write, with the caller as actor.
--
-- The injection list is built by the app (frontends/admin/src/lib/batch/, the deterministic engine); the function only
-- checks it and stores it. An Unknown injection names a sample; the function uses the sample's live aliquot or, when
-- the lab has not recorded one yet, creates it (extracted now, by the caller), because no screen records extraction.

-- The planning rules and the seed that produced version 1, kept so the sequence can be explained and reproduced.
ALTER TABLE admin.batch_version ADD COLUMN rules jsonb;

-- freeze_injection (0003) let an injection of an exported version be archived, which drops it from the sequence file
-- the app serves for that version. From now on only its acquisition status moves; the version may still be archived
-- as a whole (freeze_batch_version), which keeps every row of its file.
CREATE OR REPLACE FUNCTION admin.freeze_injection() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND EXISTS (SELECT 1 FROM admin.batch_version WHERE id = OLD.batch_version_id AND exported_at IS NOT NULL)
     AND NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status']) THEN
    RAISE EXCEPTION 'injection % belongs to an exported batch_version and is frozen', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.batch_version_id IS DISTINCT FROM OLD.batch_version_id)
     AND EXISTS (SELECT 1 FROM admin.batch_version WHERE id = NEW.batch_version_id AND exported_at IS NOT NULL) THEN
    RAISE EXCEPTION 'batch_version % is exported and frozen; create a new version', NEW.batch_version_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END $$;

-- p_injections: JSON array, in order, of {seq, sample_type, sample_name, sample_id, plate, vial}; seq runs 1..n;
-- sample_id is required for Unknown and must be absent for Blank / Quality Control; an Unknown's sample_name is its
-- sample's code (ORD041-S037). Samples of an archived order or client are refused.
-- p_name: null or blank = the next free B<yyyy>-<nnn> of the current year; otherwise it must match the table's rule.
CREATE FUNCTION admin.create_batch(p_name text, p_panel_id uuid, p_rules jsonb, p_injections jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  pn admin.panel;
  v_name text := nullif(btrim(p_name), '');
  e jsonb;
  pos int;
  sid uuid;
  smp admin.sample;
  ali uuid;
  bid uuid;
  vid uuid;
  clash text;
  order_ids uuid[];
  ord_id uuid;
  o admin."order";
  c admin.client;
BEGIN
  PERFORM admin.require_lab_writer('build batches');
  IF p_panel_id IS NULL THEN
    RAISE EXCEPTION 'a panel is required to build a batch' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO pn FROM admin.panel WHERE id = p_panel_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'panel % not found', p_panel_id USING ERRCODE = 'no_data_found';
  END IF;
  IF pn.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'panel % is archived; choose an active panel', pn.name USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF jsonb_typeof(p_rules) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'rules must be a JSON object' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_typeof(p_injections) IS DISTINCT FROM 'array' OR jsonb_array_length(p_injections) = 0 THEN
    RAISE EXCEPTION 'p_injections must be a non-empty JSON array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR e, pos IN SELECT x, t.n::int FROM jsonb_array_elements(p_injections) WITH ORDINALITY AS t(x, n) ORDER BY t.n LOOP
    IF jsonb_typeof(e) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'injection % must be a JSON object', pos USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF (e ->> 'seq') IS DISTINCT FROM pos::text THEN
      RAISE EXCEPTION 'the injection sequence must run 1..n in order (injection % has seq %)', pos, coalesce(e ->> 'seq', 'null')
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF (e ->> 'sample_type') IS NULL OR (e ->> 'sample_type') NOT IN ('Unknown', 'Blank', 'Quality Control') THEN
      RAISE EXCEPTION 'injection % has an invalid sample_type (Unknown, Blank or Quality Control)', pos USING ERRCODE = 'check_violation';
    END IF;
    IF coalesce(btrim(e ->> 'sample_name'), '') = '' THEN
      RAISE EXCEPTION 'injection % needs a sample_name', pos USING ERRCODE = 'not_null_violation';
    END IF;
    IF e ->> 'sample_type' = 'Unknown' AND (e ->> 'sample_id') IS NULL THEN
      RAISE EXCEPTION 'injection % is an Unknown injection and needs a sample_id', pos USING ERRCODE = 'not_null_violation';
    END IF;
    IF e ->> 'sample_type' <> 'Unknown' AND (e ->> 'sample_id') IS NOT NULL THEN
      RAISE EXCEPTION 'injection % is a control injection and takes no sample_id', pos USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  SELECT string_agg(nm, ', ' ORDER BY nm) INTO clash
    FROM (SELECT x ->> 'sample_name' AS nm FROM jsonb_array_elements(p_injections) x GROUP BY 1 HAVING count(*) > 1) d;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'sample_name appears more than once in the batch: %', clash USING ERRCODE = 'unique_violation';
  END IF;
  SELECT string_agg(sid_text, ', ' ORDER BY sid_text) INTO clash
    FROM (SELECT x ->> 'sample_id' AS sid_text FROM jsonb_array_elements(p_injections) x
           WHERE x ->> 'sample_id' IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'sample appears more than once in the batch: %', clash USING ERRCODE = 'unique_violation';
  END IF;

  -- Lock the samples' orders in one order (no deadlocks between two batches), then check every sample against them.
  SELECT array_agg(DISTINCT s.order_id ORDER BY s.order_id) INTO order_ids
    FROM admin.sample s
   WHERE s.id IN (SELECT (x ->> 'sample_id')::uuid FROM jsonb_array_elements(p_injections) x WHERE x ->> 'sample_id' IS NOT NULL)
     AND s.archived_at IS NULL;
  FOREACH ord_id IN ARRAY coalesce(order_ids, '{}') LOOP
    SELECT * INTO o FROM admin."order" WHERE id = ord_id FOR UPDATE;
    IF o.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'order % is archived', o.code USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    -- FOR SHARE, as in create_order: a concurrent archive_client waits for this batch and then sees the order moved.
    SELECT * INTO c FROM admin.client WHERE id = o.client_id FOR SHARE;
    IF c.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'client % is archived; its samples cannot be batched', c.name USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF o.stage NOT IN ('registered', 'extracted', 'in_batch', 'sequence_exported', 'acquired') THEN
      RAISE EXCEPTION 'order % is at %; samples can be batched from Registered to Acquired', o.code, o.stage
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END LOOP;

  -- One batch name at a time: the same lock accept_result_file takes for the numbering.
  PERFORM pg_advisory_xact_lock(hashtext('admin.batch.name'));
  IF v_name IS NOT NULL THEN
    IF v_name !~ '^B[0-9]{4}-[0-9]{3,}$' THEN
      RAISE EXCEPTION 'batch name must look like B2026-031 (B, four-digit year, dash, at least three digits)' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM admin.batch WHERE name = v_name) THEN
      RAISE EXCEPTION 'batch name % is already used', v_name USING ERRCODE = 'unique_violation';
    END IF;
  ELSE
    SELECT 'B' || to_char(now(), 'YYYY') || '-' || admin.pad3(coalesce(max(substr(name, 7)::bigint), 0) + 1) INTO v_name
      FROM admin.batch WHERE name LIKE 'B' || to_char(now(), 'YYYY') || '-%';
  END IF;

  INSERT INTO admin.batch (name, instrument_id, panel_id, status) VALUES (v_name, pn.instrument_id, pn.id, 'planned')
  RETURNING id INTO bid;
  INSERT INTO admin.batch_version (batch_id, version, rules) VALUES (bid, 1, p_rules) RETURNING id INTO vid;

  FOR e IN SELECT x FROM jsonb_array_elements(p_injections) WITH ORDINALITY AS t(x, n) ORDER BY t.n LOOP
    ali := NULL;
    smp := NULL;
    IF e ->> 'sample_type' = 'Unknown' THEN
      sid := (e ->> 'sample_id')::uuid;
      SELECT * INTO smp FROM admin.sample WHERE id = sid AND archived_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'sample % not found or archived', sid USING ERRCODE = 'no_data_found';
      END IF;
      -- Names come from the lab's code, never from client-written text (the FullName stays on the bench sheet).
      IF e ->> 'sample_name' IS DISTINCT FROM smp.sample_code THEN
        RAISE EXCEPTION 'injection % must be named by its sample code %', e ->> 'seq', smp.sample_code USING ERRCODE = 'check_violation';
      END IF;
      SELECT string_agg(DISTINCT b.name, ', ' ORDER BY b.name) INTO clash
        FROM admin.injection i
        JOIN admin.aliquot a ON a.id = i.aliquot_id
        JOIN admin.batch_version v ON v.id = i.batch_version_id
        JOIN admin.batch b ON b.id = v.batch_id
       WHERE a.sample_id = smp.id AND i.archived_at IS NULL AND v.archived_at IS NULL
         AND b.archived_at IS NULL AND b.status = 'planned' AND b.id <> bid;
      IF clash IS NOT NULL THEN
        RAISE EXCEPTION 'sample % is already in a planned batch (%)', smp.full_name, clash USING ERRCODE = 'object_not_in_prerequisite_state';
      END IF;
      SELECT a.id INTO ali FROM admin.aliquot a WHERE a.sample_id = smp.id AND a.archived_at IS NULL ORDER BY a.created_at, a.id LIMIT 1;
      IF ali IS NULL THEN
        INSERT INTO admin.aliquot (client_id, sample_id, volume_ul, extracted_at, extracted_by)
        VALUES (smp.client_id, smp.id, NULL, now(), auth.uid()) RETURNING id INTO ali;
      END IF;
    END IF;
    INSERT INTO admin.injection (batch_version_id, seq, sample_type, sample_name, client_id, aliquot_id, plate, vial)
    VALUES (vid, (e ->> 'seq')::int, e ->> 'sample_type', e ->> 'sample_name', smp.client_id, ali,
            nullif(btrim(e ->> 'plate'), ''), nullif(btrim(e ->> 'vial'), ''));
  END LOOP;

  FOREACH ord_id IN ARRAY coalesce(order_ids, '{}') LOOP
    PERFORM admin.advance_stage(ord_id, 'in_batch');
  END LOOP;
  RETURN bid;
END $$;

-- Lock and return a live batch, or fail clearly.
CREATE FUNCTION admin.lock_batch(p_batch uuid) RETURNS admin.batch
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE b admin.batch;
BEGIN
  SELECT * INTO b FROM admin.batch WHERE id = p_batch AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch % not found or archived', p_batch USING ERRCODE = 'no_data_found';
  END IF;
  RETURN b;
END $$;
REVOKE EXECUTE ON FUNCTION admin.lock_batch(uuid) FROM PUBLIC;

-- Moves every order that has a live injection in one batch version (the exported one) forward (never back) to a stage.
CREATE FUNCTION admin.advance_batch_orders(p_version uuid, target text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE ord_id uuid;
BEGIN
  FOR ord_id IN
    SELECT DISTINCT s.order_id
      FROM admin.injection i
      JOIN admin.aliquot a ON a.id = i.aliquot_id
      JOIN admin.sample s ON s.id = a.sample_id
     WHERE i.batch_version_id = p_version AND i.archived_at IS NULL
     ORDER BY s.order_id
  LOOP
    PERFORM admin.advance_stage(ord_id, target);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION admin.advance_batch_orders(uuid, text) FROM PUBLIC;

-- Freezes the batch's current version with the SHA-256 of the sequence file the lab downloaded (the existing
-- freeze_batch_version / freeze_injection triggers hold it from then on) and moves its orders to Sequence exported.
-- The app hashes rows it read before this call, so it also sends those rows (p_injections: in seq order, the sequence
-- file's columns {seq, sample_type, sample_name, client_id, aliquot_id, plate, vial}, plate and vial '' when unset).
-- The version and its injections are locked and compared with them: if anything changed after the read, the hash
-- would not be the file's, so the call is refused with PT409, HTTP 409 (read the batch again and retry; not 40001, which PostgREST retries forever) and nothing is frozen.
CREATE FUNCTION admin.mark_batch_exported(p_batch_id uuid, p_sequence_sha256 text, p_injections jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  b admin.batch;
  vid uuid;
  current_rows jsonb;
BEGIN
  PERFORM admin.require_lab_writer('mark a batch exported');
  b := admin.lock_batch(p_batch_id);
  IF b.status <> 'planned' THEN
    RAISE EXCEPTION 'batch % is already %; only a planned batch can be exported', b.name, b.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_sequence_sha256 IS NULL OR p_sequence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'the sequence hash must be 64 lowercase hex characters' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- FOR UPDATE on the version blocks new injections (their foreign key check) until this commits; then the trigger refuses them.
  SELECT id INTO vid FROM admin.batch_version WHERE batch_id = b.id AND archived_at IS NULL ORDER BY version DESC LIMIT 1 FOR UPDATE;
  IF vid IS NULL THEN
    RAISE EXCEPTION 'batch % has no version to export', b.name USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM 1 FROM admin.injection WHERE batch_version_id = vid FOR UPDATE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'sample_type', sample_type, 'sample_name', sample_name, 'client_id', client_id,
                                               'aliquot_id', aliquot_id, 'plate', coalesce(plate, ''), 'vial', coalesce(vial, '')) ORDER BY seq), '[]')
    INTO current_rows FROM admin.injection WHERE batch_version_id = vid AND archived_at IS NULL;
  IF p_injections IS DISTINCT FROM current_rows THEN
    RAISE EXCEPTION 'the sequence of batch % changed after it was read; download it again and mark it exported again', b.name
      USING ERRCODE = 'PT409';
  END IF;
  UPDATE admin.batch_version SET exported_at = now(), exported_by = auth.uid(), sequence_sha256 = p_sequence_sha256 WHERE id = vid;
  UPDATE admin.batch SET status = 'sequence_exported' WHERE id = b.id;
  PERFORM admin.advance_batch_orders(vid, 'sequence_exported');
END $$;

-- Records that the instrument ran the exported sequence: the latest version's injections and the batch become
-- acquired, and that version's orders Acquired. Other live versions (never exported) are left as they are.
CREATE FUNCTION admin.mark_batch_acquired(p_batch_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  b admin.batch;
  v admin.batch_version;
BEGIN
  PERFORM admin.require_lab_writer('mark a batch acquired');
  b := admin.lock_batch(p_batch_id);
  IF b.status = 'planned' THEN
    RAISE EXCEPTION 'batch % is planned; export its sequence first', b.name USING ERRCODE = 'object_not_in_prerequisite_state';
  ELSIF b.status <> 'sequence_exported' THEN
    RAISE EXCEPTION 'batch % is already %; only an exported sequence can be marked acquired', b.name, b.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v FROM admin.batch_version WHERE batch_id = b.id AND archived_at IS NULL ORDER BY version DESC LIMIT 1;
  IF v.exported_at IS NULL THEN
    RAISE EXCEPTION 'the latest version of batch % was not exported; export its sequence first', b.name
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE admin.injection SET status = 'acquired' WHERE batch_version_id = v.id AND archived_at IS NULL AND status = 'planned';
  UPDATE admin.batch SET status = 'acquired' WHERE id = b.id;
  PERFORM admin.advance_batch_orders(v.id, 'acquired');
END $$;

REVOKE EXECUTE ON FUNCTION admin.create_batch(text, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin.mark_batch_exported(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin.mark_batch_acquired(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.create_batch(text, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.mark_batch_exported(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.mark_batch_acquired(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
