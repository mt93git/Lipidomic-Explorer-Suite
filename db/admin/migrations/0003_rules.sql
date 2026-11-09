-- Database rules: no hard delete, append-only audit, frozen rows, two-signature release, codes.
-- Each per-table trigger function only reads columns its own table has. Generic functions only
-- read columns every table has (id) or go through to_jsonb().

-- ---------------------------------------------------------------- no hard delete, audit

CREATE FUNCTION admin.refuse_delete() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
BEGIN
  RAISE EXCEPTION 'hard delete is not allowed on admin.%; set archived_at and archived_reason instead', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE FUNCTION admin.refuse_audit_change() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
BEGIN
  RAISE EXCEPTION 'admin.audit_event is append-only (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

-- Runs as the schema owner so the app role never needs INSERT on audit_event.
CREATE FUNCTION admin.record_audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  after_row jsonb := to_jsonb(NEW);
BEGIN
  INSERT INTO admin.audit_event (actor, client_id, entity, entity_id, action, before, after)
  VALUES (auth.uid(),
          CASE WHEN TG_TABLE_NAME = 'client' THEN NEW.id ELSE (after_row ->> 'client_id')::uuid END,
          TG_TABLE_NAME, NEW.id, TG_OP,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END,
          after_row);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client', 'client_member', 'lab_staff', 'instrument', 'panel', 'order', 'shipment',
                           'sample', 'aliquot', 'box_position', 'exclusion', 'batch', 'batch_version', 'injection',
                           'result_file', 'name_map', 'dataset', 'signature', 'job'] LOOP
    EXECUTE format('CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.%I FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete()', t);
    EXECUTE format('CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.%I FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete()', t);
    -- "zz_" so it fires after every other AFTER trigger and records the final row.
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.%I FOR EACH ROW EXECUTE FUNCTION admin.record_audit()', t);
  END LOOP;
END $$;

CREATE TRIGGER refuse_change BEFORE UPDATE OR DELETE ON admin.audit_event
  FOR EACH ROW EXECUTE FUNCTION admin.refuse_audit_change();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_audit_change();

-- ---------------------------------------------------------------- frozen rows

-- True when old and new rows are equal apart from the listed columns.
CREATE FUNCTION admin.only_changed(old_row jsonb, new_row jsonb, allowed text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
  AS $$ SELECT (old_row - allowed) = (new_row - allowed) $$;

-- batch_version: exported => only archiving is allowed.
CREATE FUNCTION admin.freeze_batch_version() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
BEGIN
  IF OLD.exported_at IS NOT NULL
     AND NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['archived_at', 'archived_reason']) THEN
    RAISE EXCEPTION 'batch_version % is exported and frozen; create a new version', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER freeze_row BEFORE UPDATE ON admin.batch_version
  FOR EACH ROW EXECUTE FUNCTION admin.freeze_batch_version();

-- injection: the sequence of an exported version is frozen; only acquisition status and archiving move.
CREATE FUNCTION admin.freeze_injection() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND EXISTS (SELECT 1 FROM admin.batch_version WHERE id = OLD.batch_version_id AND exported_at IS NOT NULL)
     AND NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status', 'archived_at', 'archived_reason']) THEN
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
CREATE TRIGGER freeze_row BEFORE INSERT OR UPDATE ON admin.injection
  FOR EACH ROW EXECUTE FUNCTION admin.freeze_injection();

-- result_file: accepted => may only become superseded; superseded => only archiving.
CREATE FUNCTION admin.freeze_result_file() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
DECLARE
  allowed text[] := ARRAY['archived_at', 'archived_reason'];
BEGIN
  IF OLD.status IN ('accepted', 'superseded') THEN
    IF OLD.status = 'accepted' AND NEW.status = 'superseded' THEN
      allowed := allowed || 'status'::text;
    END IF;
    IF NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW), allowed) THEN
      RAISE EXCEPTION 'result_file % is % and frozen', OLD.id, OLD.status
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER freeze_row BEFORE UPDATE ON admin.result_file
  FOR EACH ROW EXECUTE FUNCTION admin.freeze_result_file();

-- dataset: born 'built'; release needs two live signatures by two different users; released =>
-- may only become superseded or withdrawn; once signed its content cannot change.
CREATE FUNCTION admin.guard_dataset() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  allowed text[] := ARRAY['archived_at', 'archived_reason'];
  signers int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'built' THEN
      RAISE EXCEPTION 'a dataset is created as built, not %', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    NEW.released_at := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('released', 'superseded', 'withdrawn') THEN
    IF OLD.status = 'released' AND NEW.status IN ('superseded', 'withdrawn') THEN
      allowed := allowed || 'status'::text;
    END IF;
    IF NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW), allowed) THEN
      RAISE EXCEPTION 'dataset % is % and frozen', OLD.id, OLD.status
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
  END IF;

  SELECT count(DISTINCT user_id) INTO signers
    FROM admin.signature WHERE dataset_id = OLD.id AND archived_at IS NULL;

  IF signers > 0 AND NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW),
                                            ARRAY['status', 'released_at', 'archived_at', 'archived_reason']) THEN
    RAISE EXCEPTION 'dataset % is signed; its content cannot change (build a new version)', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NEW.status = 'released' THEN
    IF signers < 2 THEN
      RAISE EXCEPTION 'release of dataset % needs two signatures by two different people (has %)', OLD.id, signers
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.released_at := now();
  ELSIF NEW.status <> 'built' THEN
    RAISE EXCEPTION 'dataset % is not released; it cannot become %', OLD.id, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard BEFORE INSERT OR UPDATE ON admin.dataset
  FOR EACH ROW EXECUTE FUNCTION admin.guard_dataset();

-- signature: you sign as yourself; signatures of a released dataset are frozen; otherwise a
-- signature can only be archived (retracted). The dataset row is locked so release and signing
-- serialise.
CREATE FUNCTION admin.guard_signature() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  ds_status text;
BEGIN
  SELECT status INTO ds_status FROM admin.dataset WHERE id = NEW.dataset_id FOR UPDATE;
  IF ds_status IN ('released', 'superseded', 'withdrawn') THEN
    RAISE EXCEPTION 'dataset % is %; its signatures are frozen', NEW.dataset_id, ds_status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NEW.user_id <> auth.uid() THEN
      RAISE EXCEPTION 'you can only sign as yourself' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.signed_at := now();
  ELSIF NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['archived_at', 'archived_reason']) THEN
    RAISE EXCEPTION 'signature % can only be archived', OLD.id USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard BEFORE INSERT OR UPDATE ON admin.signature
  FOR EACH ROW EXECUTE FUNCTION admin.guard_signature();

-- Release through this function or a plain UPDATE; the trigger above enforces the rule either way.
-- SECURITY INVOKER: the caller's RLS and role apply.
CREATE FUNCTION admin.release_dataset(did uuid) RETURNS void
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, admin AS $$
BEGIN
  UPDATE admin.dataset SET status = 'released' WHERE id = did;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dataset % not found or not writable by you', did USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;

-- ---------------------------------------------------------------- sample codes

-- ORD{nnn}-S{nnn}: order code + per-order number. Never contains a client name.
-- The order row is locked so concurrent inserts into one order get distinct numbers.
CREATE FUNCTION admin.assign_sample_code() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  ord_code text;
BEGIN
  SELECT code INTO ord_code FROM admin."order" WHERE id = NEW.order_id FOR UPDATE;
  IF ord_code IS NULL THEN
    RAISE EXCEPTION 'order % not found', NEW.order_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT coalesce(max(sample_number), 0) + 1 INTO NEW.sample_number FROM admin.sample WHERE order_id = NEW.order_id;
  NEW.sample_code := ord_code || '-S' || admin.pad3(NEW.sample_number);
  RETURN NEW;
END $$;
CREATE TRIGGER assign_code BEFORE INSERT ON admin.sample
  FOR EACH ROW EXECUTE FUNCTION admin.assign_sample_code();

CREATE FUNCTION admin.keep_sample_identity() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
BEGIN
  IF (NEW.sample_code, NEW.sample_number, NEW.order_id, NEW.client_id)
     IS DISTINCT FROM (OLD.sample_code, OLD.sample_number, OLD.order_id, OLD.client_id) THEN
    RAISE EXCEPTION 'cannot change sample_code, sample_number, order_id or client_id of sample %', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER keep_identity BEFORE UPDATE ON admin.sample
  FOR EACH ROW EXECUTE FUNCTION admin.keep_sample_identity();
