-- Storage and receiving fixes (2026-11-14). 0001-0040 are never edited; everything here is additive.
--
-- 1. Freezers and racks: the lab's catalog of freezers (name, temperature as text such as "−80 °C", an optional note)
--    and the racks in each one, and where each storage box sits (admin.storage_box_location: a box label, as
--    box_position writes it, with a freezer and optionally a rack of that freezer). Boxes without a row keep working.
--    Lab staff read the three tables; the Owner or Admin add and archive freezers and racks; a lab writer (Owner, Admin,
--    Operator, as for placing aliquots) sets or clears a box's place. Writes only through the SECURITY DEFINER functions
--    below (pinned search_path); every insert and update is audited (zz_audit); nothing is deleted. A freezer or rack
--    that still holds a box cannot be archived; archiving a freezer archives its racks with the same reason.
-- 2. admin.aliquot.kind: 'original' or 're_extraction'. Existing aliquots are originals. A new aliquot without a kind
--    (create_batch's INSERT, 0016) is the original when its sample has no other aliquot, else a re-extraction; set by
--    assign_aliquot_code, the BEFORE INSERT trigger that already numbers the sample's aliquots under its lock.
-- 3. One slot, one holder: a box and position (compared trimmed and in any case) is held either by a live placement in
--    Storage (box_position) or by a live checked-in tube (shipment_tube), never both. A trigger on each table refuses
--    the other one's slot (PT409), so place_aliquot, move_aliquot and check_in_tube all refuse it; an advisory lock on
--    the slot settles two writers at the same moment.

-- ---------------------------------------------------------------- 1. freezers, racks, box locations

CREATE TABLE admin.freezer (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  name            text NOT NULL UNIQUE CHECK (name = btrim(name) AND name <> '' AND length(name) <= 80),
  temperature     text CHECK (temperature = btrim(temperature) AND temperature <> '' AND length(temperature) <= 40),
  note            text CHECK (note = btrim(note) AND note <> '' AND length(note) <= 500),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

CREATE TABLE admin.freezer_rack (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  freezer_id      uuid NOT NULL REFERENCES admin.freezer,
  name            text NOT NULL CHECK (name = btrim(name) AND name <> '' AND length(name) <= 80),
  UNIQUE (freezer_id, name),
  UNIQUE (id, freezer_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

CREATE TABLE admin.storage_box_location (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users,
  box         text NOT NULL UNIQUE CHECK (box = btrim(box) AND box <> '' AND length(box) <= 120),
  freezer_id  uuid REFERENCES admin.freezer,
  rack_id     uuid,
  FOREIGN KEY (rack_id, freezer_id) REFERENCES admin.freezer_rack (id, freezer_id),
  CHECK (rack_id IS NULL OR freezer_id IS NOT NULL)
);
CREATE INDEX storage_box_location_freezer ON admin.storage_box_location (freezer_id);
CREATE INDEX storage_box_location_rack ON admin.storage_box_location (rack_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['freezer', 'freezer_rack', 'storage_box_location'] LOOP
    EXECUTE format('CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.%I FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete()', t);
    EXECUTE format('CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.%I FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete()', t);
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.%I FOR EACH ROW EXECUTE FUNCTION admin.record_audit()', t);
    EXECUTE format('ALTER TABLE admin.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON admin.%I FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()))', t || '_read', t);
    EXECUTE format('REVOKE ALL ON admin.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON admin.%I TO authenticated', t);
  END LOOP;
END $$;

-- The Owner or Admin (is_lab_manager, as for instruments and panels).
CREATE FUNCTION admin.require_freezer_manager() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, admin AS $$
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to manage freezers and racks' USING ERRCODE = '42501';
  END IF;
END $$;

-- Trimmed text, blank as null; longer than p_max refused.
CREATE FUNCTION admin.freezer_text(p_value text, p_label text, p_max int) RETURNS text
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v text := nullif(btrim(p_value), '');
BEGIN
  IF length(v) > p_max THEN RAISE EXCEPTION '% is longer than % characters', p_label, p_max USING ERRCODE = '22023'; END IF;
  RETURN v;
END $$;

CREATE FUNCTION admin.archive_reason_text(p_reason text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v text := nullif(btrim(p_reason), '');
BEGIN
  IF v IS NULL OR length(v) > 500 THEN RAISE EXCEPTION 'Say why it is archived (500 characters at most)' USING ERRCODE = '22023'; END IF;
  RETURN v;
END $$;

CREATE FUNCTION admin.create_freezer(p_name text, p_temperature text, p_note text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_name text := admin.freezer_text(p_name, 'The freezer name', 80); v_id uuid;
BEGIN
  PERFORM admin.require_freezer_manager();
  IF v_name IS NULL THEN RAISE EXCEPTION 'Enter the freezer''s name' USING ERRCODE = '22023'; END IF;
  INSERT INTO admin.freezer (name, temperature, note)
    VALUES (v_name, admin.freezer_text(p_temperature, 'The temperature', 40), admin.freezer_text(p_note, 'The note', 500))
    RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A freezer named "%" already exists (archived freezers keep their names)', v_name USING ERRCODE = '23505';
END $$;

CREATE FUNCTION admin.create_freezer_rack(p_freezer_id uuid, p_name text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_name text := admin.freezer_text(p_name, 'The rack name', 80); f admin.freezer; v_id uuid;
BEGIN
  PERFORM admin.require_freezer_manager();
  SELECT * INTO f FROM admin.freezer WHERE id = p_freezer_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Freezer not found' USING ERRCODE = 'P0002'; END IF;
  IF f.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Freezer % is archived', f.name USING ERRCODE = '55000'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Enter the rack''s name or number' USING ERRCODE = '22023'; END IF;
  INSERT INTO admin.freezer_rack (freezer_id, name) VALUES (f.id, v_name) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Freezer % already has a rack named "%"', f.name, v_name USING ERRCODE = '23505';
END $$;

CREATE FUNCTION admin.archive_freezer(p_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE f admin.freezer; v_reason text; held text;
BEGIN
  PERFORM admin.require_freezer_manager();
  v_reason := admin.archive_reason_text(p_reason);
  SELECT * INTO f FROM admin.freezer WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Freezer not found' USING ERRCODE = 'P0002'; END IF;
  IF f.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Freezer % is already archived', f.name USING ERRCODE = '55000'; END IF;
  SELECT string_agg(box, ', ' ORDER BY box) INTO held FROM admin.storage_box_location WHERE freezer_id = f.id;
  IF held IS NOT NULL THEN
    RAISE EXCEPTION 'Freezer % still holds box %; move the boxes to another freezer first', f.name, held USING ERRCODE = '55000';
  END IF;
  UPDATE admin.freezer_rack SET archived_at = now(), archived_reason = v_reason WHERE freezer_id = f.id AND archived_at IS NULL;
  UPDATE admin.freezer SET archived_at = now(), archived_reason = v_reason WHERE id = f.id;
END $$;

CREATE FUNCTION admin.archive_freezer_rack(p_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE r admin.freezer_rack; v_reason text; held text;
BEGIN
  PERFORM admin.require_freezer_manager();
  v_reason := admin.archive_reason_text(p_reason);
  SELECT * INTO r FROM admin.freezer_rack WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rack not found' USING ERRCODE = 'P0002'; END IF;
  IF r.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Rack % is already archived', r.name USING ERRCODE = '55000'; END IF;
  SELECT string_agg(box, ', ' ORDER BY box) INTO held FROM admin.storage_box_location WHERE rack_id = r.id;
  IF held IS NOT NULL THEN
    RAISE EXCEPTION 'Rack % still holds box %; move the boxes to another rack first', r.name, held USING ERRCODE = '55000';
  END IF;
  UPDATE admin.freezer_rack SET archived_at = now(), archived_reason = v_reason WHERE id = r.id;
END $$;

-- Where a box sits: a live freezer and optionally a live rack of it; both null clears it. The box label as Storage
-- writes it (trimmed).
CREATE FUNCTION admin.set_box_location(p_box text, p_freezer_id uuid, p_rack_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_box text := nullif(btrim(p_box), ''); f admin.freezer; r admin.freezer_rack;
BEGIN
  PERFORM admin.require_lab_writer('set where a storage box is');
  IF v_box IS NULL OR length(v_box) > 120 THEN RAISE EXCEPTION 'Enter a box' USING ERRCODE = '22023'; END IF;
  IF p_freezer_id IS NULL AND p_rack_id IS NOT NULL THEN
    RAISE EXCEPTION 'Choose the freezer the rack is in' USING ERRCODE = '22023';
  END IF;
  IF p_freezer_id IS NOT NULL THEN
    SELECT * INTO f FROM admin.freezer WHERE id = p_freezer_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Freezer not found' USING ERRCODE = 'P0002'; END IF;
    IF f.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Freezer % is archived; choose another one', f.name USING ERRCODE = '55000'; END IF;
  END IF;
  IF p_rack_id IS NOT NULL THEN
    SELECT * INTO r FROM admin.freezer_rack WHERE id = p_rack_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rack not found' USING ERRCODE = 'P0002'; END IF;
    IF r.freezer_id <> f.id THEN RAISE EXCEPTION 'Rack % is not in freezer %', r.name, f.name USING ERRCODE = '22023'; END IF;
    IF r.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Rack % is archived; choose another one', r.name USING ERRCODE = '55000'; END IF;
  END IF;
  INSERT INTO admin.storage_box_location (box, freezer_id, rack_id, updated_by) VALUES (v_box, p_freezer_id, p_rack_id, auth.uid())
  ON CONFLICT (box) DO UPDATE SET freezer_id = EXCLUDED.freezer_id, rack_id = EXCLUDED.rack_id, updated_at = now(), updated_by = EXCLUDED.updated_by;
END $$;

-- ---------------------------------------------------------------- 2. aliquot kind

ALTER TABLE admin.aliquot ADD COLUMN kind text NOT NULL DEFAULT 'original'
  CONSTRAINT aliquot_kind_known CHECK (kind IN ('original', 're_extraction'));
ALTER TABLE admin.aliquot ALTER COLUMN kind DROP DEFAULT;

CREATE OR REPLACE FUNCTION admin.assign_aliquot_code() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  smp_code text;
  earlier int;
BEGIN
  -- The sample's lock serialises two aliquots of one sample created at the same moment.
  SELECT sample_code INTO smp_code FROM admin.sample WHERE id = NEW.sample_id FOR UPDATE;
  IF smp_code IS NULL THEN
    RAISE EXCEPTION 'sample % not found', NEW.sample_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT count(*) INTO earlier FROM admin.aliquot WHERE sample_id = NEW.sample_id;
  NEW.aliquot_code := smp_code || '-A' || (earlier + 1);
  -- 0041: the sample's first aliquot is the original; any later one a re-extraction, unless the caller said otherwise.
  NEW.kind := coalesce(NEW.kind, CASE WHEN earlier = 0 THEN 'original' ELSE 're_extraction' END);
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------- 3. one slot, one holder

CREATE FUNCTION admin.refuse_shared_slot() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  v_box text;
  v_position text;
  holder text;
BEGIN
  IF NEW.archived_at IS NOT NULL OR NEW.box IS NULL OR NEW."position" IS NULL THEN RETURN NEW; END IF;
  v_box := upper(btrim(NEW.box));
  v_position := upper(btrim(NEW."position"));
  -- Both tables take the same lock for a slot, so the second writer sees the first one's row.
  PERFORM pg_advisory_xact_lock(hashtext('admin.slot:' || v_box || '|' || v_position));
  IF TG_TABLE_NAME = 'box_position' THEN
    SELECT x.sample_code INTO holder FROM admin.shipment_tube t JOIN admin.sample x ON x.id = t.sample_id
     WHERE upper(btrim(t.box)) = v_box AND upper(btrim(t."position")) = v_position AND t.archived_at IS NULL LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Box % position % holds tube % (checked in at Receive shipment); choose another position', NEW.box, NEW."position", holder
        USING ERRCODE = 'PT409';
    END IF;
  ELSE
    SELECT a.aliquot_code INTO holder FROM admin.box_position p JOIN admin.aliquot a ON a.id = p.aliquot_id
     WHERE upper(btrim(p.box)) = v_box AND upper(btrim(p.position)) = v_position AND p.archived_at IS NULL LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'box % position % already holds aliquot % in Storage; choose another position', NEW.box, NEW."position", holder
        USING ERRCODE = 'PT409';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER one_slot BEFORE INSERT OR UPDATE OF box, "position", archived_at ON admin.box_position
  FOR EACH ROW EXECUTE FUNCTION admin.refuse_shared_slot();
CREATE TRIGGER one_slot BEFORE INSERT OR UPDATE OF box, "position", archived_at ON admin.shipment_tube
  FOR EACH ROW EXECUTE FUNCTION admin.refuse_shared_slot();

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.require_freezer_manager(), admin.freezer_text(text, text, int), admin.archive_reason_text(text),
  admin.create_freezer(text, text, text), admin.create_freezer_rack(uuid, text), admin.archive_freezer(uuid, text),
  admin.archive_freezer_rack(uuid, text), admin.set_box_location(text, uuid, uuid), admin.refuse_shared_slot()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_freezer(text, text, text), admin.create_freezer_rack(uuid, text), admin.archive_freezer(uuid, text),
  admin.archive_freezer_rack(uuid, text), admin.set_box_location(text, uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
