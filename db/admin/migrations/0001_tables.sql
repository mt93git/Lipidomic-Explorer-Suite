-- Lipidomic Explorer Admin: schema "admin", tables.
-- Every table: uuid id, created_at, and archived_at + archived_reason (rows are retired, never deleted;
-- see 0003_rules.sql). Every table holding client data carries client_id. Composite foreign keys
-- (x_id, client_id) make it impossible to attach a row to another client's parent.

CREATE SCHEMA admin;

-- 'ORD' || pad3(41) = 'ORD041'; numbers above 999 keep all digits (lpad alone would truncate).
CREATE FUNCTION admin.pad3(n bigint) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog
  AS $$ SELECT CASE WHEN n < 1000 THEN lpad(n::text, 3, '0') ELSE n::text END $$;

CREATE TABLE admin.client (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  name            text NOT NULL UNIQUE,
  kind            text NOT NULL CHECK (kind IN ('pi_lab', 'internal_group', 'company')),
  billing_method  text CHECK (billing_method IN ('charge_code', 'po', 'grant', 'quote')),
  notes           text,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

CREATE TABLE admin.client_member (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid NOT NULL REFERENCES admin.client,
  user_id         uuid NOT NULL REFERENCES auth.users,
  role            text NOT NULL CHECK (role IN ('client_admin', 'requester', 'viewer')),
  UNIQUE (client_id, user_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- One lab role per person. 'member' is a lab member, not staff: it does not see all clients.
CREATE TABLE admin.lab_staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users,
  role            text NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'member')),
  display_name    text,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

CREATE TABLE admin.instrument (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  name            text NOT NULL UNIQUE,
  model           text,
  serial_number   text,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

CREATE TABLE admin.panel (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  instrument_id   uuid REFERENCES admin.instrument,
  name            text NOT NULL UNIQUE,
  lc_method       text,
  istd_kits       text[] NOT NULL DEFAULT '{}',
  dataset_type    text NOT NULL CHECK (dataset_type IN ('global', 'mediators')),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- stage = the pipeline gate the order has reached.
CREATE TABLE admin."order" (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz,
  archived_reason  text,
  client_id        uuid NOT NULL REFERENCES admin.client,
  order_number     bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  code             text GENERATED ALWAYS AS ('ORD' || admin.pad3(order_number)) STORED UNIQUE,
  panel_id         uuid REFERENCES admin.panel,
  title            text,
  matrix           text,
  expected_samples int CHECK (expected_samples >= 0),
  stage            text NOT NULL DEFAULT 'request' CHECK (stage IN (
                     'request', 'received', 'registered', 'extracted', 'in_batch', 'sequence_exported',
                     'acquired', 'processed', 'qc_checked', 'excel_built', 'released')),
  billing_ref      text,
  requested_by     uuid REFERENCES auth.users,
  notes            text,
  UNIQUE (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

CREATE TABLE admin.shipment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid NOT NULL REFERENCES admin.client,
  order_id        uuid NOT NULL,
  carrier         text,
  tracking_number text,
  shipped_on      date,
  received_at     timestamptz,
  received_by     uuid REFERENCES auth.users,
  condition       text CHECK (condition IN ('ok', 'thawed', 'damaged', 'partial')),
  box_count       int CHECK (box_count >= 0),
  notes           text,
  UNIQUE (id, client_id),
  FOREIGN KEY (order_id, client_id) REFERENCES admin."order" (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- sample_number and sample_code are assigned by trigger (ORD041-S037); callers cannot choose them.
-- Metadata columns follow docs/01_input_data_specification.md (FullName, Group1Term, ...).
CREATE TABLE admin.sample (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz,
  archived_reason  text,
  client_id        uuid NOT NULL REFERENCES admin.client,
  order_id         uuid NOT NULL,
  shipment_id      uuid,
  sample_number    int NOT NULL,
  sample_code      text NOT NULL UNIQUE CHECK (sample_code ~ '^ORD[0-9]{3,}-S[0-9]{3,}$'),
  client_sample_id text,
  full_name        text NOT NULL,
  group1_term      text,
  group2_term      text,
  replicate_term   text,
  patient_term     text,
  time_point_term  text,
  matrix           text,
  volume_ul        numeric CHECK (volume_ul >= 0),
  UNIQUE (order_id, full_name),
  UNIQUE (order_id, sample_number),
  UNIQUE (id, client_id),
  FOREIGN KEY (order_id, client_id) REFERENCES admin."order" (id, client_id),
  FOREIGN KEY (shipment_id, client_id) REFERENCES admin.shipment (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

CREATE TABLE admin.aliquot (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid NOT NULL REFERENCES admin.client,
  sample_id       uuid NOT NULL,
  volume_ul       numeric CHECK (volume_ul >= 0),
  extracted_at    timestamptz,
  extracted_by    uuid REFERENCES auth.users,
  UNIQUE (id, client_id),
  FOREIGN KEY (sample_id, client_id) REFERENCES admin.sample (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

CREATE TABLE admin.box_position (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid NOT NULL REFERENCES admin.client,
  aliquot_id      uuid NOT NULL,
  box             text NOT NULL,
  position        text NOT NULL,
  FOREIGN KEY (aliquot_id, client_id) REFERENCES admin.aliquot (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);
-- A slot holds one live aliquot; archiving a placement frees the slot.
CREATE UNIQUE INDEX box_position_live_slot ON admin.box_position (box, position) WHERE archived_at IS NULL;

CREATE TABLE admin.exclusion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid NOT NULL REFERENCES admin.client,
  sample_id       uuid NOT NULL,
  reason          text NOT NULL,
  decided_by      uuid REFERENCES auth.users,
  FOREIGN KEY (sample_id, client_id) REFERENCES admin.sample (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- A batch may mix clients; it carries no client_id itself (its injections do).
CREATE TABLE admin.batch (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  name            text NOT NULL UNIQUE CHECK (name ~ '^B[0-9]{4}-[0-9]{3,}$'),
  instrument_id   uuid REFERENCES admin.instrument,
  panel_id        uuid REFERENCES admin.panel,
  status          text NOT NULL DEFAULT 'planned' CHECK (status IN (
                    'planned', 'sequence_exported', 'acquired', 'processed', 'qc_checked')),
  notes           text,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- Frozen once exported_at is set (only archiving is still possible).
CREATE TABLE admin.batch_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  batch_id        uuid NOT NULL REFERENCES admin.batch,
  version         int NOT NULL CHECK (version > 0),
  exported_at     timestamptz,
  exported_by     uuid REFERENCES auth.users,
  sequence_sha256 text CHECK (sequence_sha256 ~ '^[0-9a-f]{64}$'),
  note            text,
  UNIQUE (batch_id, version),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- client_id is NULL for blanks and pooled QC; otherwise it matches the aliquot's client.
-- sample_name is the SCIEX injection name, e.g. B2026-031_017_ORD041-S037.
CREATE TABLE admin.injection (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz,
  archived_reason  text,
  batch_version_id uuid NOT NULL REFERENCES admin.batch_version,
  seq              int NOT NULL CHECK (seq > 0),
  sample_type      text NOT NULL CHECK (sample_type IN ('Unknown', 'Blank', 'Quality Control')),
  sample_name      text NOT NULL,
  client_id        uuid REFERENCES admin.client,
  aliquot_id       uuid,
  plate            text,
  vial             text,
  status           text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'acquired', 'failed', 'skipped')),
  UNIQUE (batch_version_id, sample_name),
  UNIQUE (batch_version_id, seq),
  CHECK ((aliquot_id IS NULL) = (client_id IS NULL)),
  CHECK (sample_type <> 'Unknown' OR aliquot_id IS NOT NULL),
  FOREIGN KEY (aliquot_id, client_id) REFERENCES admin.aliquot (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- The SCIEX OS results TXT of a batch. Frozen once accepted (it may only become superseded).
-- Holds every client of the batch, so it is staff-only.
CREATE TABLE admin.result_file (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz,
  archived_reason   text,
  batch_id          uuid NOT NULL REFERENCES admin.batch,
  batch_version_id  uuid REFERENCES admin.batch_version,
  sha256            text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path      text NOT NULL,
  sciex_os_version  text,
  processing_method text,
  uploaded_by       uuid REFERENCES auth.users,
  status            text NOT NULL DEFAULT 'parsed' CHECK (status IN ('parsed', 'accepted', 'rejected', 'superseded')),
  accepted_at       timestamptz,
  accepted_by       uuid REFERENCES auth.users,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- Lipid name dictionary. client_id NULL = lab-wide entry (staff only).
CREATE TABLE admin.name_map (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid REFERENCES admin.client,
  export_name     text NOT NULL,
  clean_name      text NOT NULL,
  rule            text,
  approved_by     uuid REFERENCES auth.users,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- The dataset v1 Excel delivered to the client. Born 'built'; released needs two signers;
-- frozen once released (it may only be superseded or withdrawn).
CREATE TABLE admin.dataset (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid NOT NULL REFERENCES admin.client,
  order_id        uuid NOT NULL,
  result_file_id  uuid REFERENCES admin.result_file,
  version         int NOT NULL CHECK (version > 0),
  dataset_format  int NOT NULL DEFAULT 1,
  value_type      text NOT NULL DEFAULT 'raw peak area',
  storage_path    text NOT NULL,
  sha256          text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  status          text NOT NULL DEFAULT 'built' CHECK (status IN ('built', 'released', 'superseded', 'withdrawn')),
  released_at     timestamptz,
  UNIQUE (order_id, version),
  UNIQUE (id, client_id),
  FOREIGN KEY (order_id, client_id) REFERENCES admin."order" (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

CREATE TABLE admin.signature (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid NOT NULL REFERENCES admin.client,
  dataset_id      uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users,
  role            text NOT NULL CHECK (role IN ('prepared', 'reviewed', 'approved')),
  note            text,
  signed_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (dataset_id, client_id) REFERENCES admin.dataset (id, client_id),
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);

-- Append-only. client_id is copied from the audited row (client.id for the client table).
CREATE TABLE admin.audit_event (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor      uuid,
  client_id  uuid,
  entity     text NOT NULL,
  entity_id  uuid,
  action     text NOT NULL CHECK (action IN ('INSERT', 'UPDATE')),
  before     jsonb,
  after      jsonb
);
CREATE INDEX audit_event_entity ON admin.audit_event (entity, entity_id);
CREATE INDEX audit_event_client ON admin.audit_event (client_id);

-- Background work (parse, build). client_id NULL = lab-wide job (staff only).
CREATE TABLE admin.job (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  archived_reason text,
  client_id       uuid REFERENCES admin.client,
  kind            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts        int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  run_after       timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  error           text,
  CHECK ((archived_at IS NULL) = (archived_reason IS NULL))
);
