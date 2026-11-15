-- Receive shipment, tube by tube: the lab checks each tube of a received shipment against the order's manifest (its
-- registered samples), records the tube's condition and, optionally, the box and position it went into, then confirms
-- the receipt. Missing or damaged tubes need a discrepancy note, which the client reads on their order.
-- 0001-0031 are never edited; everything here is additive. The whole-shipment record (receive_shipment) is unchanged.
--
-- 1. admin.shipment_tube: one live row per checked-in tube (sample). Written only by check_in_tube (lab writers,
--    SECURITY DEFINER, pinned search_path); checking a tube in again archives the old row ('checked in again') and
--    inserts the new one, so the history stays. Read: lab staff, and a client member for their own client (like
--    box_position). Delete/truncate refused and every insert/update audited (zz_audit), like every admin table.
-- 2. admin.shipment gains the receipt: receipt_confirmed_at/_by, receipt_note (the discrepancy note), receipt_missing,
--    receipt_damaged and storage_temperature. Only confirm_shipment_receipt writes them (a direct update by a signed-in
--    user is refused, 42501); a confirmed receipt with missing or damaged tubes always has a note (CHECK).
-- 3. The manifest of a shipment: the order's live samples registered with that shipment or with no shipment, less the
--    ones checked in on another shipment. admin.shipment_checkin(p_shipment_id) reads it with each tube's check-in
--    (lab staff only).
--
-- admin.check_in_tube(p_shipment_id uuid, p_label text, p_condition text, p_box text, p_position text, p_note text) RETURNS uuid
--   p_label: the sample code on the tube (ORD044-S037, any case) or the client's own sample id (client_sample_id).
--   p_condition: intact | hemolyzed | thawed | other (other needs p_note). Box and position: both or neither.
--   Refused: an unknown label (P0002, "… is not on the manifest of ORD…"), a tube of another order or shipment
--   (P0002), a shipment not received yet or already confirmed (55000), a slot another live tube holds (PT409).
-- admin.confirm_shipment_receipt(p_shipment_id uuid, p_note text, p_storage_temperature text) RETURNS jsonb
--   {expected, checked_in, missing, damaged}. Refused: nothing on the manifest (55000), missing or damaged tubes
--   without a note (22023), already confirmed (55000).

-- ---------------------------------------------------------------- 1. the tubes

CREATE TABLE admin.shipment_tube (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid NOT NULL REFERENCES admin.client,
  shipment_id     uuid NOT NULL,
  sample_id       uuid NOT NULL,
  condition       text NOT NULL CHECK (condition IN ('intact', 'hemolyzed', 'thawed', 'other')),
  condition_note  text CHECK (condition_note IS NULL OR (btrim(condition_note) <> '' AND length(condition_note) <= 500)),
  box             text CHECK (box IS NULL OR btrim(box) <> ''),
  "position"      text CHECK ("position" IS NULL OR btrim("position") <> ''),
  checked_in_by   uuid REFERENCES auth.users,
  FOREIGN KEY (shipment_id, client_id) REFERENCES admin.shipment (id, client_id),
  FOREIGN KEY (sample_id, client_id) REFERENCES admin.sample (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL)),
  CHECK ((box IS NULL) = ("position" IS NULL)),
  CHECK (condition <> 'other' OR condition_note IS NOT NULL)
);
-- A tube is checked in once (on one shipment); a slot holds one live tube.
CREATE UNIQUE INDEX shipment_tube_live_sample ON admin.shipment_tube (sample_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX shipment_tube_live_slot ON admin.shipment_tube (box, "position") WHERE archived_at IS NULL AND box IS NOT NULL;
CREATE INDEX shipment_tube_shipment ON admin.shipment_tube (shipment_id) WHERE archived_at IS NULL;

ALTER TABLE admin.shipment_tube ENABLE ROW LEVEL SECURITY;
CREATE POLICY shipment_tube_read ON admin.shipment_tube FOR SELECT TO authenticated USING (admin.can_read_client(client_id));
REVOKE ALL ON admin.shipment_tube FROM PUBLIC, anon, authenticated;
GRANT SELECT ON admin.shipment_tube TO authenticated;

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.shipment_tube FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.shipment_tube FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.shipment_tube FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

-- ---------------------------------------------------------------- 2. the receipt on the shipment

ALTER TABLE admin.shipment
  ADD COLUMN receipt_confirmed_at timestamptz,
  ADD COLUMN receipt_confirmed_by uuid REFERENCES auth.users,
  ADD COLUMN receipt_note         text CHECK (receipt_note IS NULL OR (btrim(receipt_note) <> '' AND length(receipt_note) <= 2000)),
  ADD COLUMN receipt_missing      int CHECK (receipt_missing >= 0),
  ADD COLUMN receipt_damaged      int CHECK (receipt_damaged >= 0),
  ADD COLUMN storage_temperature  text CHECK (storage_temperature IS NULL OR length(storage_temperature) <= 40),
  ADD CONSTRAINT shipment_receipt_note_needed
    CHECK (receipt_confirmed_at IS NULL OR coalesce(receipt_missing, 0) + coalesce(receipt_damaged, 0) = 0 OR receipt_note IS NOT NULL);

-- Lab writers may still update a shipment row directly (0018), but not its receipt: only confirm_shipment_receipt,
-- which runs as the function owner, writes those columns. Not SECURITY DEFINER on purpose: current_user is the caller.
CREATE FUNCTION admin.guard_shipment_receipt() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.receipt_confirmed_at, NEW.receipt_confirmed_by, NEW.receipt_note, NEW.receipt_missing, NEW.receipt_damaged, NEW.storage_temperature)
         IS DISTINCT FROM (OLD.receipt_confirmed_at, OLD.receipt_confirmed_by, OLD.receipt_note, OLD.receipt_missing, OLD.receipt_damaged, OLD.storage_temperature) THEN
    RAISE EXCEPTION 'the receipt of a shipment is recorded only by confirm_shipment_receipt' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_receipt BEFORE UPDATE ON admin.shipment FOR EACH ROW EXECUTE FUNCTION admin.guard_shipment_receipt();

-- ---------------------------------------------------------------- 3. the manifest

-- Lock a live shipment; a missing one fails clearly.
CREATE FUNCTION admin.lock_shipment(p_shipment_id uuid) RETURNS admin.shipment
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
DECLARE s admin.shipment;
BEGIN
  SELECT * INTO s FROM admin.shipment WHERE id = p_shipment_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'shipment % not found or archived', p_shipment_id USING ERRCODE = 'P0002'; END IF;
  RETURN s;
END $$;

CREATE FUNCTION admin.shipment_manifest(p_shipment_id uuid) RETURNS SETOF admin.sample
  LANGUAGE sql STABLE SET search_path = pg_catalog, admin AS $$
  SELECT smp.* FROM admin.sample smp
    JOIN admin.shipment s ON s.id = p_shipment_id AND s.order_id = smp.order_id
   WHERE smp.archived_at IS NULL
     AND (smp.shipment_id = s.id OR smp.shipment_id IS NULL)
     AND NOT EXISTS (SELECT 1 FROM admin.shipment_tube t
                      WHERE t.sample_id = smp.id AND t.archived_at IS NULL AND t.shipment_id <> s.id)
   ORDER BY smp.sample_number $$;

-- The check-in screen: every tube on the manifest with its live check-in, if any. Lab staff only.
CREATE FUNCTION admin.shipment_checkin(p_shipment_id uuid)
  RETURNS TABLE (sample_id uuid, sample_code text, client_sample_id text, tube_id uuid, condition text, condition_note text,
                 box text, "position" text, checked_in_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF NOT admin.is_lab_staff(auth.uid()) THEN
    RAISE EXCEPTION 'only lab staff (owner, admin, operator) may read the check-in of a shipment' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT m.id, m.sample_code, m.client_sample_id, t.id, t.condition, t.condition_note, t.box, t."position", t.created_at
    FROM admin.shipment_manifest(p_shipment_id) m
    LEFT JOIN admin.shipment_tube t ON t.sample_id = m.id AND t.shipment_id = p_shipment_id AND t.archived_at IS NULL
   ORDER BY m.sample_number;
END $$;

-- ---------------------------------------------------------------- 4. checking a tube in

CREATE FUNCTION admin.check_in_tube(p_shipment_id uuid, p_label text, p_condition text, p_box text, p_position text, p_note text)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  s admin.shipment;
  o admin."order";
  smp admin.sample;
  other_order text;
  v_label text := btrim(coalesce(p_label, ''));
  v_condition text := lower(btrim(coalesce(p_condition, '')));
  v_box text := nullif(btrim(p_box), '');
  v_position text := upper(nullif(btrim(p_position), ''));
  v_note text := nullif(btrim(p_note), '');
  holder text;
  n int;
  v_id uuid;
BEGIN
  PERFORM admin.require_lab_writer('check tubes in');
  s := admin.lock_shipment(p_shipment_id);
  SELECT * INTO o FROM admin."order" WHERE id = s.order_id;
  IF s.received_at IS NULL THEN
    RAISE EXCEPTION 'this shipment of % has not arrived; record its arrival first', o.code USING ERRCODE = '55000';
  END IF;
  IF s.receipt_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'the receipt of this shipment of % is already confirmed; its tubes cannot change', o.code USING ERRCODE = '55000';
  END IF;
  IF v_label = '' THEN RAISE EXCEPTION 'Scan or type a tube label' USING ERRCODE = '22023'; END IF;
  IF v_condition NOT IN ('intact', 'hemolyzed', 'thawed', 'other') THEN
    RAISE EXCEPTION 'condition "%" is not one of intact, hemolyzed, thawed, other', v_condition USING ERRCODE = '22023';
  END IF;
  IF v_condition = 'other' AND v_note IS NULL THEN
    RAISE EXCEPTION 'describe the condition of tube % (other)', v_label USING ERRCODE = '22023';
  END IF;
  IF (v_box IS NULL) <> (v_position IS NULL) THEN
    RAISE EXCEPTION 'enter both a box and a position, or neither' USING ERRCODE = '22023';
  END IF;

  -- The label: a sample code of this manifest, or else one client sample id of it (case-insensitive).
  SELECT * INTO smp FROM admin.shipment_manifest(s.id) m WHERE m.sample_code = upper(v_label);
  IF NOT FOUND THEN
    SELECT count(*) INTO n FROM admin.shipment_manifest(s.id) m WHERE lower(m.client_sample_id) = lower(v_label);
    IF n > 1 THEN
      RAISE EXCEPTION 'client ID % is on % tubes of %; scan the ORD label instead', v_label, n, o.code USING ERRCODE = '22023';
    END IF;
    SELECT * INTO smp FROM admin.shipment_manifest(s.id) m WHERE lower(m.client_sample_id) = lower(v_label);
  END IF;
  IF smp.id IS NULL THEN
    SELECT od.code INTO other_order FROM admin.sample x JOIN admin."order" od ON od.id = x.order_id
     WHERE x.sample_code = upper(v_label) AND x.archived_at IS NULL;
    IF other_order IS NOT NULL AND other_order <> o.code THEN
      RAISE EXCEPTION 'tube % belongs to order %, not to %', upper(v_label), other_order, o.code USING ERRCODE = 'P0002';
    ELSIF other_order IS NOT NULL THEN
      RAISE EXCEPTION 'tube % of % is not on the manifest of this shipment (it was checked in on another one)', upper(v_label), o.code USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'unknown tube label %: it is not on the manifest of %', v_label, o.code USING ERRCODE = 'P0002';
  END IF;

  IF v_box IS NOT NULL THEN
    SELECT x.sample_code INTO holder FROM admin.shipment_tube t JOIN admin.sample x ON x.id = t.sample_id
     WHERE t.box = v_box AND t."position" = v_position AND t.archived_at IS NULL AND t.sample_id <> smp.id;
    IF FOUND THEN
      RAISE EXCEPTION 'box % position % already holds tube %', v_box, v_position, holder USING ERRCODE = 'PT409';
    END IF;
  END IF;

  UPDATE admin.shipment_tube SET archived_at = now(), archived_reason = 'checked in again'
   WHERE sample_id = smp.id AND shipment_id = s.id AND archived_at IS NULL;
  BEGIN
    INSERT INTO admin.shipment_tube (client_id, shipment_id, sample_id, condition, condition_note, box, "position", checked_in_by)
    VALUES (s.client_id, s.id, smp.id, v_condition, v_note, v_box, v_position, auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN -- another tube took the slot (or this tube was checked in) at the same moment
    RAISE EXCEPTION 'box % position % or tube % was just taken by another check-in', v_box, v_position, smp.sample_code USING ERRCODE = 'PT409';
  END;
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------- 5. confirming the receipt

CREATE FUNCTION admin.confirm_shipment_receipt(p_shipment_id uuid, p_note text, p_storage_temperature text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  s admin.shipment;
  o admin."order";
  v_note text := nullif(btrim(p_note), '');
  v_expected int;
  v_checked int;
  v_damaged int;
  v_missing int;
BEGIN
  PERFORM admin.require_lab_writer('confirm receipts');
  s := admin.lock_shipment(p_shipment_id);
  SELECT * INTO o FROM admin."order" WHERE id = s.order_id;
  IF s.received_at IS NULL THEN
    RAISE EXCEPTION 'this shipment of % has not arrived; record its arrival first', o.code USING ERRCODE = '55000';
  END IF;
  IF s.receipt_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'the receipt of this shipment of % is already confirmed', o.code USING ERRCODE = '55000';
  END IF;
  SELECT count(*) INTO v_expected FROM admin.shipment_manifest(s.id);
  IF v_expected = 0 THEN
    RAISE EXCEPTION 'order % has no registered samples on this shipment; register them before confirming the receipt tube by tube', o.code
      USING ERRCODE = '55000';
  END IF;
  -- Only tubes still on the manifest count: a tube whose sample was archived or moved to another shipment after its
  -- check-in would otherwise make missing negative (and the CHECK fail).
  SELECT count(*), count(*) FILTER (WHERE t.condition <> 'intact') INTO v_checked, v_damaged
    FROM admin.shipment_tube t JOIN admin.shipment_manifest(s.id) m ON m.id = t.sample_id
   WHERE t.shipment_id = s.id AND t.archived_at IS NULL;
  v_missing := v_expected - v_checked;
  IF (v_missing > 0 OR v_damaged > 0) AND v_note IS NULL THEN
    RAISE EXCEPTION '% missing and % damaged: write a discrepancy note; the client reads it on their order',
      v_missing || CASE WHEN v_missing = 1 THEN ' tube' ELSE ' tubes' END, v_damaged USING ERRCODE = '22023';
  END IF;
  IF length(v_note) > 2000 THEN RAISE EXCEPTION 'the discrepancy note is longer than 2000 characters' USING ERRCODE = '22023'; END IF;
  UPDATE admin.shipment
     SET receipt_confirmed_at = now(), receipt_confirmed_by = auth.uid(), receipt_note = v_note,
         receipt_missing = v_missing, receipt_damaged = v_damaged, storage_temperature = nullif(btrim(p_storage_temperature), '')
   WHERE id = s.id;
  RETURN jsonb_build_object('expected', v_expected, 'checked_in', v_checked, 'missing', v_missing, 'damaged', v_damaged);
END $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.guard_shipment_receipt(), admin.lock_shipment(uuid), admin.shipment_manifest(uuid),
  admin.shipment_checkin(uuid), admin.check_in_tube(uuid, text, text, text, text, text), admin.confirm_shipment_receipt(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.shipment_checkin(uuid), admin.check_in_tube(uuid, text, text, text, text, text),
  admin.confirm_shipment_receipt(uuid, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
