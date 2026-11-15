-- Storage: which freezer box and slot holds each aliquot. 0001-0024 are never edited; everything here is additive.
--
-- 1. admin.aliquot.aliquot_code: the code the lab writes on the tube, its sample's code plus -A and the aliquot's number
--    within the sample (ORD041-S001-A1), assigned by trigger like the sample code (callers cannot choose it) and never
--    changed. Existing aliquots are numbered in the order they were created.
-- 2. admin.box_position (0001: client_id, aliquot_id, box, position; one live aliquot per slot) is written only by
--    place_aliquot, move_aliquot and remove_aliquot (lab writers, the rule register_samples uses; SECURITY DEFINER,
--    pinned search_path, audited by zz_audit). Nobody signed in writes the table directly any more, so a move always
--    leaves its history: the old placement archived with reason 'moved', the new one inserted, in one transaction.
--    A placement is never deleted; removing an aliquot archives its placement with the lab's reason.
--    Reads are unchanged (0004's box_position_read: lab staff, and a client member for their own client).
-- 3. Two reads for the Storage screen, lab staff only: storage_boxes() (each box holding something, with how many slots
--    are taken) and storage_aliquots(p_box, p_search) (one box's slots, a search by sample or aliquot code, or the live
--    aliquots of received orders that are in no box yet).
-- Box and position are trimmed; blank is refused (22023). A slot taken by another aliquot is a conflict (PT409, HTTP 409).

-- ---------------------------------------------------------------- 1. aliquot codes

ALTER TABLE admin.aliquot ADD COLUMN aliquot_code text;
UPDATE admin.aliquot a SET aliquot_code = n.code
  FROM (SELECT x.id, s.sample_code || '-A' || row_number() OVER (PARTITION BY x.sample_id ORDER BY x.created_at, x.id) AS code
          FROM admin.aliquot x JOIN admin.sample s ON s.id = x.sample_id) n
 WHERE n.id = a.id;
ALTER TABLE admin.aliquot ALTER COLUMN aliquot_code SET NOT NULL,
  ADD CONSTRAINT aliquot_code_unique UNIQUE (aliquot_code),
  ADD CONSTRAINT aliquot_code_format CHECK (aliquot_code ~ '^ORD[0-9]{3,}-S[0-9]{3,}-A[0-9]+$');

CREATE FUNCTION admin.assign_aliquot_code() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  smp_code text;
BEGIN
  -- The sample's lock serialises two aliquots of one sample created at the same moment.
  SELECT sample_code INTO smp_code FROM admin.sample WHERE id = NEW.sample_id FOR UPDATE;
  IF smp_code IS NULL THEN
    RAISE EXCEPTION 'sample % not found', NEW.sample_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.aliquot_code := smp_code || '-A' || ((SELECT count(*) FROM admin.aliquot WHERE sample_id = NEW.sample_id) + 1);
  RETURN NEW;
END $$;
CREATE TRIGGER assign_code BEFORE INSERT ON admin.aliquot
  FOR EACH ROW EXECUTE FUNCTION admin.assign_aliquot_code();

CREATE FUNCTION admin.keep_aliquot_code() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
BEGIN
  IF NEW.aliquot_code IS DISTINCT FROM OLD.aliquot_code THEN
    RAISE EXCEPTION 'cannot change the aliquot_code of aliquot %', OLD.id USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER keep_code BEFORE UPDATE ON admin.aliquot
  FOR EACH ROW EXECUTE FUNCTION admin.keep_aliquot_code();

-- ---------------------------------------------------------------- 2. placing, moving, removing

REVOKE INSERT, UPDATE ON admin.box_position FROM authenticated;
CREATE INDEX box_position_live_aliquot ON admin.box_position (aliquot_id) WHERE archived_at IS NULL;

-- Box and position, trimmed; blank refused.
CREATE FUNCTION admin.storage_slot(p_box text, p_position text, OUT box text, OUT "position" text)
  LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  box := nullif(btrim(p_box), '');
  "position" := nullif(btrim(p_position), '');
  IF box IS NULL THEN RAISE EXCEPTION 'Enter a box' USING ERRCODE = '22023'; END IF;
  IF "position" IS NULL THEN RAISE EXCEPTION 'Enter a position in the box' USING ERRCODE = '22023'; END IF;
END $$;

-- Lock an aliquot; a missing one fails clearly.
CREATE FUNCTION admin.lock_aliquot(p_aliquot_id uuid) RETURNS admin.aliquot
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
DECLARE a admin.aliquot;
BEGIN
  SELECT * INTO a FROM admin.aliquot WHERE id = p_aliquot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aliquot not found' USING ERRCODE = 'P0002'; END IF;
  RETURN a;
END $$;

-- Refuse a slot another aliquot holds (the unique index box_position_live_slot settles a race the same way).
CREATE FUNCTION admin.require_free_slot(p_box text, p_position text) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
DECLARE holder text;
BEGIN
  SELECT a.aliquot_code INTO holder FROM admin.box_position p JOIN admin.aliquot a ON a.id = p.aliquot_id
   WHERE p.box = p_box AND p.position = p_position AND p.archived_at IS NULL FOR UPDATE OF p;
  IF FOUND THEN
    RAISE EXCEPTION 'Box % position % already holds %', p_box, p_position, holder USING ERRCODE = 'PT409';
  END IF;
END $$;

-- Put an aliquot that is in no box yet into a free slot. Returns the new placement's id.
CREATE FUNCTION admin.place_aliquot(p_aliquot_id uuid, p_box text, p_position text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  a admin.aliquot;
  slot record;
  cur admin.box_position;
  v_id uuid;
BEGIN
  PERFORM admin.require_lab_writer('place aliquots');
  slot := admin.storage_slot(p_box, p_position);
  a := admin.lock_aliquot(p_aliquot_id);
  IF a.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Aliquot % is archived (%); it cannot be placed', a.aliquot_code, a.archived_reason USING ERRCODE = '55000';
  END IF;
  SELECT * INTO cur FROM admin.box_position WHERE aliquot_id = a.id AND archived_at IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'Aliquot % is already in box % position %; move it instead', a.aliquot_code, cur.box, cur.position USING ERRCODE = '55000';
  END IF;
  PERFORM admin.require_free_slot(slot.box, slot.position);
  BEGIN
    INSERT INTO admin.box_position (client_id, aliquot_id, box, position) VALUES (a.client_id, a.id, slot.box, slot.position)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN -- another aliquot took the slot at the same moment
    RAISE EXCEPTION 'Box % position % was just taken by another aliquot', slot.box, slot.position USING ERRCODE = 'PT409';
  END;
  RETURN v_id;
END $$;

-- Move a placed aliquot to another free slot: the old placement is archived with reason 'moved' and the new one
-- inserted, together. Returns the new placement's id.
CREATE FUNCTION admin.move_aliquot(p_aliquot_id uuid, p_box text, p_position text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  a admin.aliquot;
  slot record;
  cur admin.box_position;
  v_id uuid;
BEGIN
  PERFORM admin.require_lab_writer('move aliquots');
  slot := admin.storage_slot(p_box, p_position);
  a := admin.lock_aliquot(p_aliquot_id);
  IF a.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Aliquot % is archived (%); remove it from its box instead', a.aliquot_code, a.archived_reason USING ERRCODE = '55000';
  END IF;
  SELECT * INTO cur FROM admin.box_position WHERE aliquot_id = a.id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aliquot % is not in a box; place it instead', a.aliquot_code USING ERRCODE = '55000';
  END IF;
  IF cur.box = slot.box AND cur.position = slot.position THEN
    RAISE EXCEPTION 'Aliquot % is already in box % position %', a.aliquot_code, cur.box, cur.position USING ERRCODE = '55000';
  END IF;
  PERFORM admin.require_free_slot(slot.box, slot.position);
  UPDATE admin.box_position SET archived_at = now(), archived_reason = 'moved' WHERE id = cur.id;
  BEGIN
    INSERT INTO admin.box_position (client_id, aliquot_id, box, position) VALUES (a.client_id, a.id, slot.box, slot.position)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Box % position % was just taken by another aliquot', slot.box, slot.position USING ERRCODE = 'PT409';
  END;
  RETURN v_id;
END $$;

-- Take an aliquot out of storage (used up, discarded, shipped back): its placement is archived with the reason.
CREATE FUNCTION admin.remove_aliquot(p_aliquot_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  a admin.aliquot;
  cur admin.box_position;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  PERFORM admin.require_lab_writer('remove aliquots from storage');
  IF v_reason IS NULL OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Say why the aliquot leaves its box (500 characters at most)' USING ERRCODE = '22023';
  END IF;
  a := admin.lock_aliquot(p_aliquot_id);
  SELECT * INTO cur FROM admin.box_position WHERE aliquot_id = a.id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aliquot % is not in a box', a.aliquot_code USING ERRCODE = '55000';
  END IF;
  UPDATE admin.box_position SET archived_at = now(), archived_reason = v_reason WHERE id = cur.id;
END $$;

-- ---------------------------------------------------------------- 3. the Storage screen's reads (lab staff)

CREATE FUNCTION admin.storage_boxes() RETURNS TABLE (box text, occupied int)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF NOT admin.is_lab_staff(auth.uid()) THEN
    RAISE EXCEPTION 'only lab staff (owner, admin, operator) may read storage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT p.box, count(*)::int FROM admin.box_position p WHERE p.archived_at IS NULL GROUP BY p.box ORDER BY p.box;
END $$;

-- p_box: that box's live slots. Else p_search: aliquots whose code contains it (a sample code finds its aliquots), live
-- ones and archived ones still in a box. Else: live aliquots of live, received orders that are in no box. 500 rows at most.
CREATE FUNCTION admin.storage_aliquots(p_box text, p_search text)
  RETURNS TABLE (aliquot_id uuid, aliquot_code text, sample_code text, client_id uuid, client_name text, order_code text,
                 archived_reason text, box text, "position" text, placed_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  v_box text := nullif(btrim(p_box), '');
  v_search text := upper(nullif(btrim(p_search), ''));
BEGIN
  IF NOT admin.is_lab_staff(auth.uid()) THEN
    RAISE EXCEPTION 'only lab staff (owner, admin, operator) may read storage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT a.id, a.aliquot_code, s.sample_code, a.client_id, c.name, o.code, a.archived_reason, p.box, p.position, p.created_at
    FROM admin.aliquot a
    JOIN admin.sample s ON s.id = a.sample_id
    JOIN admin."order" o ON o.id = s.order_id
    JOIN admin.client c ON c.id = a.client_id
    LEFT JOIN admin.box_position p ON p.aliquot_id = a.id AND p.archived_at IS NULL
   WHERE CASE
           WHEN v_box IS NOT NULL THEN p.box = v_box
           WHEN v_search IS NOT NULL THEN strpos(a.aliquot_code, v_search) > 0 AND (a.archived_at IS NULL OR p.id IS NOT NULL)
           ELSE p.id IS NULL AND a.archived_at IS NULL AND s.archived_at IS NULL AND o.archived_at IS NULL AND o.stage <> 'request'
         END
   ORDER BY p.box, p.position, a.aliquot_code
   LIMIT 500;
END $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.assign_aliquot_code(), admin.keep_aliquot_code(), admin.storage_slot(text, text),
  admin.lock_aliquot(uuid), admin.require_free_slot(text, text),
  admin.place_aliquot(uuid, text, text), admin.move_aliquot(uuid, text, text), admin.remove_aliquot(uuid, text),
  admin.storage_boxes(), admin.storage_aliquots(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.place_aliquot(uuid, text, text), admin.move_aliquot(uuid, text, text), admin.remove_aliquot(uuid, text),
  admin.storage_boxes(), admin.storage_aliquots(text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
