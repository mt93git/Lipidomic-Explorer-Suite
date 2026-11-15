-- F4: client deliverables and the per-client Nexo switch (docs/admin/client-zone-decisions.md, decision 1).
-- 0001-0020 are never edited; everything here is additive.
--
-- 1. admin.deliverable: a file the lab gives a client for one order (a report, a figure, a table), optionally tied to
--    that order's released dataset. The file lives in bucket admin-files at
--    <client_id>/<order_code>/deliverables/<sha256>/<file_name> (0006's path rule); the row records its title, kind,
--    content type, size and sha256, whether the client may see it, who added it and when. Rows are never deleted: a
--    wrong file is retired (archived_at + archived_reason) and its object stays. Only PDF, PNG, JPEG, SVG, XLSX and
--    CSV, 50 MB at most. Written only by add_deliverable, set_deliverable_visibility and retire_deliverable (lab
--    writers; SECURITY DEFINER, pinned search_path, audited by zz_audit); nobody writes the table directly.
--    Lab staff read every row. A client member reads only the live, visible deliverables of their client's live
--    orders, and Storage gives them exactly those objects of admin-files (admin_files_client_deliverable_read).
--    0012's orphan cleanup never removes a deliverable's object, whatever its state.
-- 2. admin.client.nexo_access (default off): whether the client's people get Open in Nexo. Changed only by
--    set_client_nexo_access (lab Owner or Admin), audited by the client's zz_audit. The app shows Open in Nexo to a
--    client only when its environment gate is on and this is true.
-- Conflicts (answering a retired deliverable, the same file twice) are PT409 (HTTP 409), never 40001.

-- ---------------------------------------------------------------- 1. deliverables

-- The content type a file name's extension stands for; NULL for any other type.
CREATE FUNCTION admin.deliverable_type(p_file_name text) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
  AS $$ SELECT CASE lower(substring(p_file_name FROM '\.([A-Za-z0-9]+)$'))
                 WHEN 'pdf' THEN 'application/pdf' WHEN 'png' THEN 'image/png'
                 WHEN 'jpg' THEN 'image/jpeg' WHEN 'jpeg' THEN 'image/jpeg' WHEN 'svg' THEN 'image/svg+xml'
                 WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                 WHEN 'csv' THEN 'text/csv' END $$;

CREATE TABLE admin.deliverable (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz,
  archived_reason   text CHECK (length(archived_reason) <= 500),
  client_id         uuid NOT NULL REFERENCES admin.client,
  order_id          uuid NOT NULL,
  dataset_id        uuid,
  title             text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 200),
  kind              text NOT NULL CHECK (kind IN ('report', 'figure', 'table', 'other')),
  file_name         text NOT NULL CHECK (file_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  content_type      text NOT NULL CHECK (content_type = admin.deliverable_type(file_name)),
  size_bytes        bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  sha256            text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path      text NOT NULL,
  visible_to_client boolean NOT NULL DEFAULT false,
  added_by          uuid NOT NULL REFERENCES auth.users,
  added_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, client_id) REFERENCES admin."order" (id, client_id),
  FOREIGN KEY (dataset_id, client_id) REFERENCES admin.dataset (id, client_id),
  CHECK (storage_path = client_id::text || '/' || split_part(storage_path, '/', 2) || '/deliverables/' || sha256 || '/' || file_name),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);
-- The same file (same bytes, same name) is one live deliverable of its order.
CREATE UNIQUE INDEX deliverable_one_live_per_path ON admin.deliverable (storage_path) WHERE archived_at IS NULL;
CREATE INDEX deliverable_order ON admin.deliverable (order_id);

CREATE TRIGGER refuse_delete BEFORE DELETE ON admin.deliverable FOR EACH ROW EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER refuse_truncate BEFORE TRUNCATE ON admin.deliverable FOR EACH STATEMENT EXECUTE FUNCTION admin.refuse_delete();
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON admin.deliverable FOR EACH ROW EXECUTE FUNCTION admin.record_audit();

-- What the file is never changes; a retired row never changes at all. Only the visibility and the retirement move.
CREATE FUNCTION admin.guard_deliverable() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'deliverable % is retired; it does not change any more', OLD.id USING ERRCODE = 'PT409';
  END IF;
  IF NOT admin.only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['visible_to_client', 'archived_at', 'archived_reason']) THEN
    RAISE EXCEPTION 'a deliverable''s file, order and title never change; retire it and add the right one' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_deliverable BEFORE UPDATE ON admin.deliverable FOR EACH ROW EXECUTE FUNCTION admin.guard_deliverable();

-- The client side of the read rule, for the table and for Storage: a live, visible deliverable of a live order of a
-- client the caller is an active member of (is_client_member also requires the client to be live).
CREATE FUNCTION admin.client_sees_deliverable(d admin.deliverable) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT d.visible_to_client AND d.archived_at IS NULL AND admin.is_client_member(auth.uid(), d.client_id)
               AND EXISTS (SELECT 1 FROM admin."order" o WHERE o.id = d.order_id AND o.archived_at IS NULL) $$;
CREATE FUNCTION admin.is_client_deliverable_object(p_name text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT EXISTS (SELECT 1 FROM admin.deliverable d WHERE d.storage_path = p_name AND admin.client_sees_deliverable(d)) $$;

ALTER TABLE admin.deliverable ENABLE ROW LEVEL SECURITY;
CREATE POLICY deliverable_read ON admin.deliverable FOR SELECT TO authenticated
  USING (admin.is_lab_staff(auth.uid()) OR admin.client_sees_deliverable(deliverable));
REVOKE ALL ON admin.deliverable FROM PUBLIC, anon, authenticated;
GRANT SELECT ON admin.deliverable TO authenticated;

-- Storage: a client member reads exactly the objects of their visible, live deliverables; nothing else in admin-files.
CREATE POLICY admin_files_client_deliverable_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'admin-files' AND admin.is_client_deliverable_object(name));

-- 0012's cleanup: a deliverable's object (live or retired) is referenced, so no lab writer removes it.
CREATE OR REPLACE FUNCTION admin.is_referenced_admin_file(p_name text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, admin
  AS $$ SELECT p_name IS NULL OR NOT admin.is_lab_writer() -- answers only lab writers; anyone else learns nothing
            OR EXISTS (SELECT 1 FROM admin.result_file f WHERE f.storage_path = p_name)
            OR EXISTS (SELECT 1 FROM admin.deliverable d WHERE d.storage_path = p_name)
            OR EXISTS (SELECT 1 FROM admin.dataset d
                        WHERE d.storage_path = p_name OR d.companion_path = p_name
                           OR (split_part(p_name, '/', 3) = 'datasets'
                               AND split_part(p_name, '/', 4) IN (d.sha256, d.analysis_sha256, d.companion_sha256))) $$;

-- Lock a deliverable that is still live; a retired one is a conflict (someone retired it first).
CREATE FUNCTION admin.lock_live_deliverable(p_deliverable_id uuid) RETURNS admin.deliverable
  LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
DECLARE d admin.deliverable;
BEGIN
  SELECT * INTO d FROM admin.deliverable WHERE id = p_deliverable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deliverable not found' USING ERRCODE = 'P0002'; END IF;
  IF d.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Deliverable "%" was already retired', d.title USING ERRCODE = 'PT409';
  END IF;
  RETURN d;
END $$;

-- Record a file the app has just uploaded to the path this function names (it computes the path; the app uses the
-- same rule). Hidden from the client unless p_visible. p_dataset_id: optional, a released, current dataset of this order.
CREATE FUNCTION admin.add_deliverable(p_order_id uuid, p_dataset_id uuid, p_title text, p_kind text, p_file_name text,
                                      p_content_type text, p_size_bytes bigint, p_sha256 text, p_visible boolean)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  o admin."order";
  v_title text := nullif(btrim(p_title), '');
  v_path text;
  v_id uuid;
BEGIN
  PERFORM admin.require_lab_writer('add deliverables');
  IF v_title IS NULL OR length(v_title) > 200 THEN
    RAISE EXCEPTION 'A deliverable needs a title (200 characters at most)' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('report', 'figure', 'table', 'other') THEN
    RAISE EXCEPTION 'Choose a kind: report, figure, table or other' USING ERRCODE = '22023';
  END IF;
  IF p_file_name IS NULL OR p_file_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' THEN
    RAISE EXCEPTION 'The file name may use letters, digits, dot, dash and underscore (120 characters at most)' USING ERRCODE = '22023';
  END IF;
  IF admin.deliverable_type(p_file_name) IS NULL OR p_content_type IS DISTINCT FROM admin.deliverable_type(p_file_name) THEN
    RAISE EXCEPTION 'Deliverables are PDF, PNG, JPEG, SVG, XLSX or CSV files, and the type must match the file name' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 52428800 THEN
    RAISE EXCEPTION 'A deliverable is 50 MB at most (and not empty)' USING ERRCODE = '22023';
  END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'p_sha256 must be the file''s sha256 in lower-case hex' USING ERRCODE = '22023';
  END IF;
  IF p_visible IS NULL THEN RAISE EXCEPTION 'Say whether the client sees the deliverable' USING ERRCODE = '22023'; END IF;

  SELECT * INTO o FROM admin."order" WHERE id = p_order_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF;
  IF o.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Order % is archived', o.code USING ERRCODE = '55000'; END IF;
  IF o.review <> 'accepted' THEN
    RAISE EXCEPTION 'Order % is a request the lab has not accepted', o.code USING ERRCODE = '55000';
  END IF;
  IF p_dataset_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM admin.dataset d WHERE d.id = p_dataset_id AND d.order_id = o.id AND d.status = 'released' AND d.archived_at IS NULL) THEN
    RAISE EXCEPTION 'The dataset must be the current released version of order %', o.code USING ERRCODE = '55000';
  END IF;

  v_path := o.client_id::text || '/' || o.code || '/deliverables/' || p_sha256 || '/' || p_file_name;
  IF NOT admin.is_admin_files_path(v_path) THEN
    RAISE EXCEPTION 'Not a valid admin-files path: %', v_path USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM admin.deliverable WHERE storage_path = v_path AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'This file is already a deliverable of order %', o.code USING ERRCODE = 'PT409';
  END IF;
  BEGIN
    INSERT INTO admin.deliverable (client_id, order_id, dataset_id, title, kind, file_name, content_type, size_bytes, sha256,
                                   storage_path, visible_to_client, added_by)
    VALUES (o.client_id, o.id, p_dataset_id, v_title, p_kind, p_file_name, p_content_type, p_size_bytes, p_sha256,
            v_path, p_visible, auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN -- the same file added at the same moment
    RAISE EXCEPTION 'This file is already a deliverable of order %', o.code USING ERRCODE = 'PT409';
  END;
  RETURN v_id;
END $$;

-- Show or hide a live deliverable. Setting what is already set changes nothing (and writes no audit row).
CREATE FUNCTION admin.set_deliverable_visibility(p_deliverable_id uuid, p_visible boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE d admin.deliverable;
BEGIN
  PERFORM admin.require_lab_writer('change what a client sees');
  IF p_visible IS NULL THEN RAISE EXCEPTION 'Say whether the client sees the deliverable' USING ERRCODE = '22023'; END IF;
  d := admin.lock_live_deliverable(p_deliverable_id);
  IF d.visible_to_client = p_visible THEN RETURN; END IF;
  UPDATE admin.deliverable SET visible_to_client = p_visible WHERE id = d.id;
END $$;

-- Retire (never delete) a deliverable, with a reason. The client stops seeing it and its file; the object stays.
CREATE FUNCTION admin.retire_deliverable(p_deliverable_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE
  d admin.deliverable;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  PERFORM admin.require_lab_writer('retire deliverables');
  IF v_reason IS NULL OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Retiring a deliverable needs a reason (500 characters at most)' USING ERRCODE = '22023';
  END IF;
  d := admin.lock_live_deliverable(p_deliverable_id);
  UPDATE admin.deliverable SET archived_at = now(), archived_reason = v_reason WHERE id = d.id;
END $$;

-- ---------------------------------------------------------------- 2. the per-client Nexo switch

ALTER TABLE admin.client ADD COLUMN nexo_access boolean NOT NULL DEFAULT false;
-- The app role keeps its direct client writes (0004's policies, lab Owner or Admin) on every column but this one.
REVOKE INSERT, UPDATE ON admin.client FROM authenticated;
GRANT INSERT (id, name, kind, billing_method, notes),
      UPDATE (name, kind, billing_method, notes, archived_at, archived_reason) ON admin.client TO authenticated;

CREATE FUNCTION admin.set_client_nexo_access(p_client_id uuid, p_enabled boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE c admin.client;
BEGIN
  IF NOT admin.is_lab_manager() THEN
    RAISE EXCEPTION 'Lab Owner or Admin access is required to change a client''s Nexo access' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'Say whether the client gets Nexo' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM admin.client WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002'; END IF;
  IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Client is archived' USING ERRCODE = '55000'; END IF;
  IF c.nexo_access = p_enabled THEN RETURN; END IF;
  UPDATE admin.client SET nexo_access = p_enabled WHERE id = c.id;
END $$;

-- ---------------------------------------------------------------- grants

REVOKE EXECUTE ON FUNCTION admin.deliverable_type(text), admin.guard_deliverable(), admin.client_sees_deliverable(admin.deliverable),
  admin.is_client_deliverable_object(text), admin.lock_live_deliverable(uuid),
  admin.add_deliverable(uuid, uuid, text, text, text, text, bigint, text, boolean), admin.set_deliverable_visibility(uuid, boolean),
  admin.retire_deliverable(uuid, text), admin.set_client_nexo_access(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
-- The two read helpers are evaluated inside the policies above, as the caller.
GRANT EXECUTE ON FUNCTION admin.deliverable_type(text), admin.client_sees_deliverable(admin.deliverable),
  admin.is_client_deliverable_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.add_deliverable(uuid, uuid, text, text, text, text, bigint, text, boolean),
  admin.set_deliverable_visibility(uuid, boolean), admin.retire_deliverable(uuid, text), admin.set_client_nexo_access(uuid, boolean)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
