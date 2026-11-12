-- Phase 4 as cut: a version is a row pointing at a checkpoint R already stores (no blob table, no GC).
CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('named', 'autosave', 'before-restore')),
  name TEXT,
  checkpoint_id TEXT NOT NULL,
  actor TEXT,
  display_name TEXT,
  revision INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX versions_project ON versions (project);
