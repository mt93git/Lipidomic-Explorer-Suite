-- Phase 5 (cut): per-project roles. No row means the default role (src/roles.mjs effectiveRole).
CREATE TABLE members (
  project TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
  PRIMARY KEY (project, user_id)
);
