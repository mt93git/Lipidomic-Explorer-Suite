-- Instruments & panels screen: the lab's Owner or Admin create, edit and archive instruments and panels; everyone
-- else reads them as before (0004: instruments lab staff only, panels everyone signed in). The tables (0001), the
-- audit trigger and the no-delete rule (0003) already exist; nothing here changes a table. 0001-0025 are never edited.
--
-- * Text is trimmed; a blank name is refused; a name already taken (by an active or an archived row: archived rows
--   keep their name) is refused with a message naming it. Blank model, serial number and LC method are stored as null;
--   ISTD kits are trimmed, blanks dropped and repeats removed (first spelling kept, in the order given).
-- * The rows change only through these functions: the direct INSERT/UPDATE policies and grants of 0004 are removed.
-- * Archiving keeps history: orders and batches keep their panel and instrument. create_order, request_order,
--   accept_order (0013/0019) and create_batch (0016) already refuse an archived panel; create_panel and update_panel
--   refuse an archived instrument, and archive_instrument is refused while an active panel uses the instrument.
-- * A panel's dataset type decides how its results are read, so it cannot change once any order or batch (archived
--   ones included) uses the panel. update_panel locks the panel row FOR UPDATE, which waits for the FOR SHARE / FOR KEY
--   SHARE locks those writers take on it, so an order cannot slip in between the check and the change.

-- ---------------------------------------------------------------- helpers (not callable by the app)

-- Kits as stored: trimmed, no blanks, no repeats, in the order given.
CREATE FUNCTION admin.clean_istd_kits(p_kits text[]) RETURNS text[]
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
  AS $$ SELECT coalesce(array_agg(kit ORDER BY first), '{}')
          FROM (SELECT btrim(k) AS kit, min(n) AS first FROM unnest(p_kits) WITH ORDINALITY AS u(k, n)
                 WHERE nullif(btrim(k), '') IS NOT NULL GROUP BY btrim(k)) kits $$;

CREATE FUNCTION admin.require_lab_manager_for_catalog() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, admin AS $$
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to manage instruments and panels' USING ERRCODE = '42501';
  END IF;
END $$;

-- An instrument a panel may point at: exists and is active. Locked FOR SHARE so archive_instrument waits.
CREATE FUNCTION admin.active_instrument_for_panel(p_instrument_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE i admin.instrument;
BEGIN
  IF p_instrument_id IS NULL THEN RETURN; END IF;
  SELECT * INTO i FROM admin.instrument WHERE id = p_instrument_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found' USING ERRCODE = 'P0002'; END IF;
  IF i.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Instrument "%" is archived; choose an active instrument', i.name USING ERRCODE = '55000';
  END IF;
END $$;

-- The message for a name the unique index refused: an active row has it, or an archived one keeps it.
CREATE FUNCTION admin.refuse_taken_name(p_table text, p_name text) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_archived boolean;
BEGIN
  EXECUTE format('SELECT archived_at IS NOT NULL FROM admin.%I WHERE name = $1', p_table) INTO v_archived USING p_name;
  IF v_archived THEN
    RAISE EXCEPTION 'An archived % is already named "%"; archived %s keep their names, so choose another name', p_table, p_name, p_table
      USING ERRCODE = '23505';
  END IF;
  RAISE EXCEPTION 'A% % named "%" already exists', CASE WHEN p_table = 'instrument' THEN 'n' ELSE '' END, p_table, p_name
    USING ERRCODE = '23505';
END $$;

-- ---------------------------------------------------------------- instruments

CREATE FUNCTION admin.create_instrument(p_name text, p_model text, p_serial_number text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_name text := nullif(btrim(p_name), ''); v_id uuid;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  IF v_name IS NULL THEN RAISE EXCEPTION 'Instrument name is required' USING ERRCODE = '22023'; END IF;
  INSERT INTO admin.instrument (name, model, serial_number)
    VALUES (v_name, nullif(btrim(p_model), ''), nullif(btrim(p_serial_number), '')) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  PERFORM admin.refuse_taken_name('instrument', v_name);
END $$;

CREATE FUNCTION admin.update_instrument(p_id uuid, p_name text, p_model text, p_serial_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_name text := nullif(btrim(p_name), ''); i admin.instrument;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  SELECT * INTO i FROM admin.instrument WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found' USING ERRCODE = 'P0002'; END IF;
  IF i.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Instrument is archived' USING ERRCODE = '55000'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Instrument name is required' USING ERRCODE = '22023'; END IF;
  UPDATE admin.instrument SET name = v_name, model = nullif(btrim(p_model), ''), serial_number = nullif(btrim(p_serial_number), '')
   WHERE id = p_id;
EXCEPTION WHEN unique_violation THEN
  PERFORM admin.refuse_taken_name('instrument', v_name);
END $$;

CREATE FUNCTION admin.archive_instrument(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE i admin.instrument; v_panels text;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Archiving an instrument needs a reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM admin.instrument WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found' USING ERRCODE = 'P0002'; END IF;
  IF i.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Instrument is already archived' USING ERRCODE = '55000'; END IF;
  SELECT string_agg(format('"%s"', name), ', ' ORDER BY name) INTO v_panels
    FROM admin.panel WHERE instrument_id = p_id AND archived_at IS NULL;
  IF v_panels IS NOT NULL THEN
    RAISE EXCEPTION 'Instrument "%" is used by the active panel(s) %; archive them or move them to another instrument first', i.name, v_panels
      USING ERRCODE = '55000';
  END IF;
  UPDATE admin.instrument SET archived_at = now(), archived_reason = btrim(p_reason) WHERE id = p_id;
END $$;

-- ---------------------------------------------------------------- panels

CREATE FUNCTION admin.create_panel(p_instrument_id uuid, p_name text, p_lc_method text, p_istd_kits text[], p_dataset_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_name text := nullif(btrim(p_name), ''); v_id uuid;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  IF v_name IS NULL THEN RAISE EXCEPTION 'Panel name is required' USING ERRCODE = '22023'; END IF;
  IF p_dataset_type IS NULL OR p_dataset_type NOT IN ('global', 'mediators') THEN
    RAISE EXCEPTION 'Choose a valid dataset type (global or mediators)' USING ERRCODE = '22023';
  END IF;
  PERFORM admin.active_instrument_for_panel(p_instrument_id);
  INSERT INTO admin.panel (instrument_id, name, lc_method, istd_kits, dataset_type)
    VALUES (p_instrument_id, v_name, nullif(btrim(p_lc_method), ''), admin.clean_istd_kits(p_istd_kits), p_dataset_type)
    RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  PERFORM admin.refuse_taken_name('panel', v_name);
END $$;

CREATE FUNCTION admin.update_panel(p_id uuid, p_instrument_id uuid, p_name text, p_lc_method text, p_istd_kits text[], p_dataset_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_name text := nullif(btrim(p_name), ''); p admin.panel;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  SELECT * INTO p FROM admin.panel WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Panel not found' USING ERRCODE = 'P0002'; END IF;
  IF p.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Panel is archived' USING ERRCODE = '55000'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Panel name is required' USING ERRCODE = '22023'; END IF;
  IF p_dataset_type IS NULL OR p_dataset_type NOT IN ('global', 'mediators') THEN
    RAISE EXCEPTION 'Choose a valid dataset type (global or mediators)' USING ERRCODE = '22023';
  END IF;
  IF p_dataset_type <> p.dataset_type
     AND (EXISTS (SELECT 1 FROM admin."order" WHERE panel_id = p_id) OR EXISTS (SELECT 1 FROM admin.batch WHERE panel_id = p_id)) THEN
    RAISE EXCEPTION 'Panel "%" is already used by an order or a batch, so its dataset type stays %; create a new panel for %',
      p.name, p.dataset_type, p_dataset_type USING ERRCODE = '55000';
  END IF;
  IF p_instrument_id IS DISTINCT FROM p.instrument_id THEN PERFORM admin.active_instrument_for_panel(p_instrument_id); END IF;
  UPDATE admin.panel SET instrument_id = p_instrument_id, name = v_name, lc_method = nullif(btrim(p_lc_method), ''),
    istd_kits = admin.clean_istd_kits(p_istd_kits), dataset_type = p_dataset_type
   WHERE id = p_id;
EXCEPTION WHEN unique_violation THEN
  PERFORM admin.refuse_taken_name('panel', v_name);
END $$;

CREATE FUNCTION admin.archive_panel(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE p admin.panel;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Archiving a panel needs a reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM admin.panel WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Panel not found' USING ERRCODE = 'P0002'; END IF;
  IF p.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Panel is already archived' USING ERRCODE = '55000'; END IF;
  UPDATE admin.panel SET archived_at = now(), archived_reason = btrim(p_reason) WHERE id = p_id;
END $$;

-- ---------------------------------------------------------------- no direct writes

-- Like lab_staff and client_member (0015): the rows change only through the functions above, so the rules hold
-- whatever the path (an Owner or Admin cannot change a used panel's dataset type with a plain UPDATE). Reads are
-- unchanged (instrument_read, panel_read).
DROP POLICY instrument_insert ON admin.instrument;
DROP POLICY instrument_update ON admin.instrument;
DROP POLICY panel_insert ON admin.panel;
DROP POLICY panel_update ON admin.panel;
REVOKE INSERT, UPDATE ON admin.instrument, admin.panel FROM authenticated;

-- ---------------------------------------------------------------- grants

REVOKE ALL ON FUNCTION admin.clean_istd_kits(text[]), admin.require_lab_manager_for_catalog(),
  admin.active_instrument_for_panel(uuid), admin.refuse_taken_name(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin.create_instrument(text, text, text), admin.update_instrument(uuid, text, text, text),
  admin.archive_instrument(uuid, text), admin.create_panel(uuid, text, text, text[], text),
  admin.update_panel(uuid, uuid, text, text, text[], text), admin.archive_panel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.create_instrument(text, text, text), admin.update_instrument(uuid, text, text, text),
  admin.archive_instrument(uuid, text), admin.create_panel(uuid, text, text, text[], text),
  admin.update_panel(uuid, uuid, text, text, text[], text), admin.archive_panel(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
