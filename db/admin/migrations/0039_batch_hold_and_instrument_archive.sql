-- Batch hold and instrument archive (2026-11-14 fixes). 0001-0038 are never edited.
--
-- * create_batch (0016) refused a sample only while it sat in another *planned* batch, so a sample whose batch was
--   exported or acquired could be batched a second time. A sample is now held by any live batch whatever its status
--   (planned, sequence exported, acquired, processed, QC checked): an injection of a live version of a live batch on the
--   sample's live aliquot. Archiving the batch or its version frees it (there is no cancelled status). This is the rule
--   Batch builder already uses to list samples (frontends/admin/src/lib/data/batches.ts, listBuilderSamples). Same
--   signature, grants, SECURITY DEFINER and pinned search_path; everything else is unchanged.
-- * archive_instrument (0026) refused only while an active panel used the instrument; a live (not archived)
--   instrument profile (0035) could be left pointing at an archived instrument. It now refuses that too. Profiles take
--   the instrument FOR SHARE when they are created or moved (active_instrument_for_panel), and this takes it FOR
--   UPDATE first, so the check cannot race a profile being pointed at the instrument.

CREATE OR REPLACE FUNCTION admin.create_batch(p_name text, p_panel_id uuid, p_rules jsonb, p_injections jsonb) RETURNS uuid
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
  -- Every sample belongs to one order, so two calls for the same sample queue here; the second one checks after the
  -- first commits (read committed: each statement below sees the batch the first one wrote) and is refused.
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
      SELECT string_agg(DISTINCT format('%s (%s)', b.name, replace(b.status, '_', ' ')), ', ') INTO clash
        FROM admin.injection i
        JOIN admin.aliquot a ON a.id = i.aliquot_id
        JOIN admin.batch_version v ON v.id = i.batch_version_id
        JOIN admin.batch b ON b.id = v.batch_id
       WHERE a.sample_id = smp.id AND a.archived_at IS NULL AND i.archived_at IS NULL AND v.archived_at IS NULL
         AND b.archived_at IS NULL AND b.id <> bid;
      IF clash IS NOT NULL THEN
        RAISE EXCEPTION 'sample % is already in batch %; archive that batch to batch the sample again', smp.full_name, clash
          USING ERRCODE = 'object_not_in_prerequisite_state';
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

REVOKE ALL ON FUNCTION admin.create_batch(text, uuid, jsonb, jsonb), admin.archive_instrument(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.create_batch(text, uuid, jsonb, jsonb), admin.archive_instrument(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
