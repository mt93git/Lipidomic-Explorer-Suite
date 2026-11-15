ALTER TABLE projects ADD COLUMN origin_kind TEXT CHECK (origin_kind IN ('checkpoint', 'dataset'));
ALTER TABLE projects ADD COLUMN origin_id TEXT;
CREATE UNIQUE INDEX projects_dataset_origin ON projects (workspace, origin_id) WHERE origin_kind = 'dataset';
