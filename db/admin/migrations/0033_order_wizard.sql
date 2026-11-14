-- New order wizard (Gerardo, 2026-11-13): the lab's rate sheet, for the wizard's estimate, and order drafts the lab can
-- resume. 0001-0031 are never edited; this migration does not depend on 0032.
--
-- 1. admin.panel_rate: at most one line per panel: the price per sample in a currency, and the minutes one injection
--    takes on that panel's method. Each part may be unset (null): the estimate then says "not set" for the money and
--    uses the batch builder's default minutes for the run time. A price always has its currency. Lab staff read it
--    (clients never: the quote is sent from the order once approved); lab Owner or Admin set it through
--    set_panel_rate, like the rest of the catalog (0026). Audited; rows are never deleted (clearing sets nulls).
-- 2. admin.order_draft: a New order the lab started and saved before placing it: the step it was on, the client and
--    title when known (to list it), and everything typed as a JSON object of text (data). It is not an order: it has
--    no ORD code, is not on the pipeline and no client sees it. Lab staff read every draft; lab writers (Owner, Admin,
--    Operator) save, discard and place them through the functions below. Placing calls admin.create_order (0013) in
--    the same transaction, so the order and the draft's link to it are written together or not at all.

-- ---------------------------------------------------------------- rate sheet

CREATE TABLE admin.panel_rate (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  panel_id              uuid NOT NULL UNIQUE REFERENCES admin.panel,
  rate_per_sample       numeric(12, 2) CHECK (rate_per_sample >= 0),
  currency              text CHECK (currency ~ '^[A-Z]{3}$'),
  minutes_per_injection numeric(6, 2) CHECK (minutes_per_injection > 0 AND minutes_per_injection <= 600),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES auth.users,
  CHECK ((rate_per_sample IS NULL) = (currency IS NULL))
);

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.panel_rate FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.panel_rate FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.panel_rate FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

ALTER TABLE admin.panel_rate ENABLE ROW LEVEL SECURITY;
CREATE POLICY panel_rate_read ON admin.panel_rate FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()));
REVOKE ALL ON admin.panel_rate FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON admin.panel_rate TO authenticated;

-- Sets one panel's line; nulls clear a part. The currency is upper-cased; a price without a currency (or the other
-- way round) is refused. An archived panel keeps its line but cannot be changed.
CREATE FUNCTION admin.set_panel_rate(p_panel_id uuid, p_rate_per_sample numeric, p_currency text, p_minutes_per_injection numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE p admin.panel; v_currency text := upper(nullif(btrim(p_currency), ''));
BEGIN
  PERFORM admin.require_lab_manager_for_catalog();
  SELECT * INTO p FROM admin.panel WHERE id = p_panel_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Panel not found' USING ERRCODE = 'P0002'; END IF;
  IF p.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Panel "%" is archived; its rate cannot change', p.name USING ERRCODE = '55000'; END IF;
  IF p_rate_per_sample IS NOT NULL AND p_rate_per_sample < 0 THEN
    RAISE EXCEPTION 'A rate per sample is 0 or more' USING ERRCODE = '22023';
  END IF;
  IF (p_rate_per_sample IS NULL) <> (v_currency IS NULL) THEN
    RAISE EXCEPTION 'A rate needs its currency, and a currency needs a rate' USING ERRCODE = '22023';
  END IF;
  IF v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Write the currency as its three-letter code (USD, EUR, GBP…)' USING ERRCODE = '22023';
  END IF;
  IF p_minutes_per_injection IS NOT NULL AND (p_minutes_per_injection <= 0 OR p_minutes_per_injection > 600) THEN
    RAISE EXCEPTION 'Minutes per injection are more than 0 and at most 600' USING ERRCODE = '22023';
  END IF;
  INSERT INTO admin.panel_rate (panel_id, rate_per_sample, currency, minutes_per_injection, updated_by)
    VALUES (p.id, p_rate_per_sample, v_currency, p_minutes_per_injection, auth.uid())
  ON CONFLICT (panel_id) DO UPDATE SET rate_per_sample = EXCLUDED.rate_per_sample, currency = EXCLUDED.currency,
    minutes_per_injection = EXCLUDED.minutes_per_injection, updated_at = now(), updated_by = EXCLUDED.updated_by;
END $$;

REVOKE EXECUTE ON FUNCTION admin.set_panel_rate(uuid, numeric, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.set_panel_rate(uuid, numeric, text, numeric) TO authenticated;

-- ---------------------------------------------------------------- order drafts

CREATE TABLE admin.order_draft (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES auth.users,
  step         int NOT NULL CHECK (step BETWEEN 1 AND 4),
  client_id    uuid REFERENCES admin.client,
  title        text CHECK (length(title) <= 300),
  data         jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 300000),
  -- Closed: placed (the order it became) or discarded (with when and by whom). A closed draft never changes again.
  order_id     uuid UNIQUE REFERENCES admin."order",
  discarded_at timestamptz,
  discarded_by uuid REFERENCES auth.users,
  CHECK (order_id IS NULL OR discarded_at IS NULL),
  CHECK ((discarded_at IS NULL) = (discarded_by IS NULL))
);
CREATE INDEX order_draft_open ON admin.order_draft (updated_at DESC) WHERE order_id IS NULL AND discarded_at IS NULL;

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.order_draft FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.order_draft FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.order_draft FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

ALTER TABLE admin.order_draft ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_draft_read ON admin.order_draft FOR SELECT TO authenticated USING (admin.is_lab_staff(auth.uid()));
REVOKE ALL ON admin.order_draft FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON admin.order_draft TO authenticated;

-- Lock and return an open draft, or fail clearly (placed and discarded drafts are closed).
CREATE FUNCTION admin.lock_open_order_draft(p_id uuid) RETURNS admin.order_draft
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE d admin.order_draft;
BEGIN
  SELECT * INTO d FROM admin.order_draft WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found' USING ERRCODE = 'P0002'; END IF;
  IF d.order_id IS NOT NULL THEN RAISE EXCEPTION 'This draft was already placed as an order' USING ERRCODE = '55000'; END IF;
  IF d.discarded_at IS NOT NULL THEN RAISE EXCEPTION 'This draft was discarded' USING ERRCODE = '55000'; END IF;
  RETURN d;
END $$;
REVOKE EXECUTE ON FUNCTION admin.lock_open_order_draft(uuid) FROM PUBLIC;

-- Saves a draft: a new one when p_id is null (returns its id), else the same open draft. The client, when given, must
-- exist and be active; the title is trimmed (blank: null).
CREATE FUNCTION admin.save_order_draft(p_id uuid, p_step int, p_client_id uuid, p_title text, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_id uuid; v_title text := nullif(btrim(p_title), ''); c admin.client;
BEGIN
  PERFORM admin.require_lab_writer('save order drafts');
  IF p_step IS NULL OR p_step NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'A draft is on step 1 to 4' USING ERRCODE = '22023'; END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'A draft keeps its fields as an object' USING ERRCODE = '22023'; END IF;
  IF octet_length(p_data::text) > 300000 THEN RAISE EXCEPTION 'This draft is too large to keep; shorten the pasted sample list' USING ERRCODE = '22023'; END IF;
  IF length(v_title) > 300 THEN RAISE EXCEPTION 'Keep the title under 300 characters' USING ERRCODE = '22023'; END IF;
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO c FROM admin.client WHERE id = p_client_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'client % not found', p_client_id USING ERRCODE = 'no_data_found'; END IF;
    IF c.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'client % is archived; it cannot receive new orders', c.name USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO admin.order_draft (created_by, updated_by, step, client_id, title, data)
      VALUES (auth.uid(), auth.uid(), p_step, p_client_id, v_title, p_data) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  PERFORM admin.lock_open_order_draft(p_id);
  UPDATE admin.order_draft SET step = p_step, client_id = p_client_id, title = v_title, data = p_data,
    updated_at = now(), updated_by = auth.uid() WHERE id = p_id;
  RETURN p_id;
END $$;

CREATE FUNCTION admin.discard_order_draft(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  PERFORM admin.require_lab_writer('discard order drafts');
  PERFORM admin.lock_open_order_draft(p_id);
  UPDATE admin.order_draft SET discarded_at = now(), discarded_by = auth.uid(), updated_at = now(), updated_by = auth.uid() WHERE id = p_id;
END $$;

-- Places the draft as an order: admin.create_order with the final fields (it checks the writer, client, panel, title
-- and samples again), then closes the draft with the order it became. Returns the order's id.
CREATE FUNCTION admin.place_order_draft(p_id uuid, p_client_id uuid, p_panel_id uuid, p_title text, p_matrix text,
                                        p_expected_samples int, p_billing_ref text, p_notes text, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v_order uuid;
BEGIN
  PERFORM admin.require_lab_writer('place orders');
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'A draft keeps its fields as an object' USING ERRCODE = '22023'; END IF;
  PERFORM admin.lock_open_order_draft(p_id);
  v_order := admin.create_order(p_client_id, p_panel_id, p_title, p_matrix, p_expected_samples, p_billing_ref, p_notes);
  UPDATE admin.order_draft SET step = 4, client_id = p_client_id, title = nullif(btrim(p_title), ''), data = p_data,
    order_id = v_order, updated_at = now(), updated_by = auth.uid() WHERE id = p_id;
  RETURN v_order;
END $$;

REVOKE EXECUTE ON FUNCTION admin.save_order_draft(uuid, int, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin.discard_order_draft(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin.place_order_draft(uuid, uuid, uuid, text, text, int, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.save_order_draft(uuid, int, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.discard_order_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.place_order_draft(uuid, uuid, uuid, text, text, int, text, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
