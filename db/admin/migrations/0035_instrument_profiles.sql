-- Instrument profiles: everything instrument-specific (software, batch file, bench sheet, plates, sample name
-- pattern, results parser) and the blank and QC rules Batch builder starts from. A second instrument is a new profile.
-- Lab staff read the profiles; the lab's Owner or Admin create, edit, activate and archive them (the same check as
-- instruments and panels, 0026). 0001-0034 are never edited.
--
-- * One profile is active at most (a partial unique index). The first profile created is made active; activating
--   another one makes the previous one inactive in the same statement block. The active profile cannot be archived.
-- * A profile points at an active instrument (its panels are the instrument's panels, 0026).
-- * Text is trimmed and a blank value is stored as null; a blank name is refused; names are unique (archived rows keep
--   their names). Rule counts are whole numbers from 0 to 96 (one plate); "blanks between samples" is a pair: N blanks
--   after every M samples, both 0 for none. Batch builder pre-fills blanks at start and pooled QC every N from the
--   active profile; the lab can still change them per batch.
-- * Rows change only through the functions below; every insert and update leaves an audit row (zz_audit, 0003).

CREATE TABLE admin.instrument_profile (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz,
  archived_reason      text,
  instrument_id        uuid NOT NULL REFERENCES admin.instrument,
  name                 text NOT NULL UNIQUE,
  is_active            boolean NOT NULL DEFAULT false,
  software             text,
  batch_file           text,
  bench_sheet          text,
  plates               text,
  sample_name_pattern  text,
  results_parser       text,
  blanks_at_start      integer NOT NULL DEFAULT 1 CHECK (blanks_at_start BETWEEN 0 AND 96),
  start_blank_note     text,
  blanks_between       integer NOT NULL DEFAULT 0 CHECK (blanks_between BETWEEN 0 AND 96),
  blanks_between_every integer NOT NULL DEFAULT 0 CHECK (blanks_between_every BETWEEN 0 AND 96),
  pooled_qc_every      integer NOT NULL DEFAULT 6 CHECK (pooled_qc_every BETWEEN 0 AND 96),
  pooled_qc_note       text,
  qc_thresholds        text,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL)),
  CHECK (NOT (is_active AND archived_at IS NOT NULL)),
  CHECK ((blanks_between = 0) = (blanks_between_every = 0))
);
CREATE UNIQUE INDEX instrument_profile_one_active ON admin.instrument_profile ((true)) WHERE is_active;
CREATE INDEX instrument_profile_instrument ON admin.instrument_profile (instrument_id);

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.instrument_profile FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.instrument_profile FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.instrument_profile FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

ALTER TABLE admin.instrument_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY instrument_profile_read ON admin.instrument_profile FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()));
REVOKE ALL ON admin.instrument_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT ON admin.instrument_profile TO authenticated;

-- ---------------------------------------------------------------- helpers (not callable by the app)

CREATE FUNCTION admin.refuse_taken_profile_name(p_name text) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM admin.instrument_profile WHERE name = p_name AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'An archived profile is already named "%"; archived profiles keep their names, so choose another name', p_name
      USING ERRCODE = '23505';
  END IF;
  RAISE EXCEPTION 'A profile named "%" already exists', p_name USING ERRCODE = '23505';
END $$;

CREATE FUNCTION admin.check_profile_count(p_label text, p_value integer) RETURNS void
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF p_value IS NULL OR p_value < 0 OR p_value > 96 THEN
    RAISE EXCEPTION '% must be a whole number from 0 to 96', p_label USING ERRCODE = '22023';
  END IF;
END $$;

CREATE FUNCTION admin.lock_live_profile(p_id uuid) RETURNS admin.instrument_profile
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE p admin.instrument_profile;
BEGIN
  SELECT * INTO p FROM admin.instrument_profile WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002'; END IF;
  IF p.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Profile "%" is archived', p.name USING ERRCODE = '55000'; END IF;
  RETURN p;
END $$;

-- ---------------------------------------------------------------- profiles

CREATE FUNCTION admin.create_instrument_profile(p_instrument_id uuid, p_name text, p_software text, p_batch_file text,
  p_bench_sheet text, p_plates text, p_sample_name_pattern text, p_results_parser text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_name text := nullif(btrim(p_name), ''); v_id uuid; v_constraint text;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  IF v_name IS NULL THEN RAISE EXCEPTION 'Profile name is required' USING ERRCODE = '22023'; END IF;
  IF p_instrument_id IS NULL THEN RAISE EXCEPTION 'Choose the instrument this profile is for' USING ERRCODE = '22023'; END IF;
  PERFORM admin.active_instrument_for_panel(p_instrument_id);
  INSERT INTO admin.instrument_profile (instrument_id, name, is_active, software, batch_file, bench_sheet, plates,
      sample_name_pattern, results_parser)
    VALUES (p_instrument_id, v_name, NOT EXISTS (SELECT 1 FROM admin.instrument_profile WHERE is_active),
      nullif(btrim(p_software), ''), nullif(btrim(p_batch_file), ''), nullif(btrim(p_bench_sheet), ''),
      nullif(btrim(p_plates), ''), nullif(btrim(p_sample_name_pattern), ''), nullif(btrim(p_results_parser), ''))
    RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint = 'instrument_profile_one_active' THEN
    RAISE EXCEPTION 'Another profile was made active at the same time; reload and try again' USING ERRCODE = '40001';
  END IF;
  PERFORM admin.refuse_taken_profile_name(v_name);
END $$;

CREATE FUNCTION admin.update_instrument_profile(p_id uuid, p_instrument_id uuid, p_name text, p_software text,
  p_batch_file text, p_bench_sheet text, p_plates text, p_sample_name_pattern text, p_results_parser text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_name text := nullif(btrim(p_name), ''); p admin.instrument_profile;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  p := admin.lock_live_profile(p_id);
  IF v_name IS NULL THEN RAISE EXCEPTION 'Profile name is required' USING ERRCODE = '22023'; END IF;
  IF p_instrument_id IS NULL THEN RAISE EXCEPTION 'Choose the instrument this profile is for' USING ERRCODE = '22023'; END IF;
  IF p_instrument_id <> p.instrument_id THEN PERFORM admin.active_instrument_for_panel(p_instrument_id); END IF;
  UPDATE admin.instrument_profile SET instrument_id = p_instrument_id, name = v_name,
    software = nullif(btrim(p_software), ''), batch_file = nullif(btrim(p_batch_file), ''),
    bench_sheet = nullif(btrim(p_bench_sheet), ''), plates = nullif(btrim(p_plates), ''),
    sample_name_pattern = nullif(btrim(p_sample_name_pattern), ''), results_parser = nullif(btrim(p_results_parser), '')
   WHERE id = p_id;
EXCEPTION WHEN unique_violation THEN
  PERFORM admin.refuse_taken_profile_name(v_name);
END $$;

CREATE FUNCTION admin.set_instrument_profile_rules(p_id uuid, p_blanks_at_start integer, p_start_blank_note text,
  p_blanks_between integer, p_blanks_between_every integer, p_pooled_qc_every integer, p_pooled_qc_note text,
  p_qc_thresholds text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  PERFORM admin.lock_live_profile(p_id);
  PERFORM admin.check_profile_count('Blanks at the start', p_blanks_at_start);
  PERFORM admin.check_profile_count('Blanks between samples', p_blanks_between);
  PERFORM admin.check_profile_count('Samples between blanks', p_blanks_between_every);
  PERFORM admin.check_profile_count('Pooled QC every', p_pooled_qc_every);
  IF (p_blanks_between = 0) <> (p_blanks_between_every = 0) THEN
    RAISE EXCEPTION 'Blanks between samples needs both numbers (blanks and every how many samples), or 0 for both'
      USING ERRCODE = '22023';
  END IF;
  UPDATE admin.instrument_profile SET blanks_at_start = p_blanks_at_start, start_blank_note = nullif(btrim(p_start_blank_note), ''),
    blanks_between = p_blanks_between, blanks_between_every = p_blanks_between_every, pooled_qc_every = p_pooled_qc_every,
    pooled_qc_note = nullif(btrim(p_pooled_qc_note), ''), qc_thresholds = nullif(btrim(p_qc_thresholds), '')
   WHERE id = p_id;
END $$;

-- The previous active profile becomes inactive first, so the unique index holds at every row; two activations at the
-- same moment: the second one waits on the row the first one changed and then meets the index, with a clear message.
CREATE FUNCTION admin.activate_instrument_profile(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE p admin.instrument_profile;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  p := admin.lock_live_profile(p_id);
  IF p.is_active THEN RETURN; END IF;
  UPDATE admin.instrument_profile SET is_active = false WHERE is_active AND id <> p_id;
  UPDATE admin.instrument_profile SET is_active = true WHERE id = p_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Another profile was made active at the same time; reload and try again' USING ERRCODE = '40001';
END $$;

CREATE FUNCTION admin.archive_instrument_profile(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE p admin.instrument_profile;
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Archiving a profile needs a reason' USING ERRCODE = '22023'; END IF;
  p := admin.lock_live_profile(p_id);
  IF p.is_active THEN
    RAISE EXCEPTION 'Profile "%" is the active one; make another profile active first', p.name USING ERRCODE = '55000';
  END IF;
  UPDATE admin.instrument_profile SET archived_at = now(), archived_reason = btrim(p_reason) WHERE id = p_id;
END $$;

-- ---------------------------------------------------------------- grants

REVOKE ALL ON FUNCTION admin.refuse_taken_profile_name(text), admin.check_profile_count(text, integer),
  admin.lock_live_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin.create_instrument_profile(uuid, text, text, text, text, text, text, text),
  admin.update_instrument_profile(uuid, uuid, text, text, text, text, text, text, text),
  admin.set_instrument_profile_rules(uuid, integer, text, integer, integer, integer, text, text),
  admin.activate_instrument_profile(uuid), admin.archive_instrument_profile(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.create_instrument_profile(uuid, text, text, text, text, text, text, text),
  admin.update_instrument_profile(uuid, uuid, text, text, text, text, text, text, text),
  admin.set_instrument_profile_rules(uuid, integer, text, integer, integer, integer, text, text),
  admin.activate_instrument_profile(uuid), admin.archive_instrument_profile(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
