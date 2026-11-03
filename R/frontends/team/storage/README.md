# Team checkpoint storage

Team-only. `R/frontends/team/bootstrap.R` sources this folder and validates the
configuration at startup; Classic never loads it.

## Selecting a backend

| `LIPIDOMIC_STORAGE` | Backend | Configuration |
|---|---|---|
| unset or `files` | Local directories | `LIPIDOMIC_STORAGE_DIR` (default: `tools::R_user_dir("LipidomicExplorer", "data")/team-projects`) |
| `database` | Supabase project library | `LIPIDOMIC_AUTH_URL`, `LIPIDOMIC_REST_URL`, `LIPIDOMIC_STORAGE_URL` |

Any other value stops the Team process at startup with an error. So does
`database` without its three URLs.

## Contract

`team_storage_session(session, token = access)` creates one store per Shiny
session (`token` is only used by `database` and should be a function that
returns the session's current access token). A store has four operations:

- `list(project)`: checkpoint records, newest first.
- `save(project, path, label)`: stores a ZIP and returns its record. Saving
  identical bytes again returns the existing checkpoint.
- `load(project, id, dest = NULL)`: writes a verified copy and returns its path.
  The sha256 is always checked before the bytes are returned.
- `delete(project, id)`: removes the checkpoint.

A record is `list(id, project, name, sha256, size_bytes, created_at)`. Project
and checkpoint identifiers are validated before any path or URL is built. In
`files` they are `[A-Za-z0-9][A-Za-z0-9_-]{0,63}` and the sha256. In `database`
both are UUIDs. Labels must be 1 to 80 characters.

| Operation | `files` | `database` |
|---|---|---|
| list | read `<project>/<sha256>.json` metadata | `GET rest /pilot_files?project_id=eq.P` |
| save | atomic write of `<sha256>.zip`, then its metadata | `team_library_commit` (idempotent upload + registration, verified) |
| load | read the ZIP, verify sha256, atomic write to `dest` | look up the row by id, download the object, verify sha256 |
| delete | remove metadata, then the ZIP | delete the `pilot_files` row, then the object |

Neither backend throttles sign-in or authenticates on its own: `files` has no
user accounts, and with `database` the identity service and row-level security
enforce access. The database schema lives in the production branch at
`pilot/supabase/schema.sql`. That schema grants no DELETE, so `delete` is denied
there until an operator adds delete policies.
