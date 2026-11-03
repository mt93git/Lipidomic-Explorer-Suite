# Team checkpoint storage

Team-only. `R/frontends/team/bootstrap.R` sources this folder and validates the
configuration at startup; Classic never loads it.

## Selecting a backend

| `LIPIDOMIC_STORAGE` | Backend | Configuration |
|---|---|---|
| unset or `files` | Local directories | `LIPIDOMIC_STORAGE_DIR` (default: `tools::R_user_dir("LipidomicExplorer", "data")/team-projects`) |
| `database` (alias `db`) | Supabase project library | `LIPIDOMIC_AUTH_URL`, `LIPIDOMIC_REST_URL`, `LIPIDOMIC_STORAGE_URL`; needs the `httr` package (in Suggests) |

Any other value stops the Team process at startup with an error. So does
`database` without its three URLs or without `httr` installed.

**`files` is for a single local user.** It has no accounts and no access
control: anyone who can reach the app can list, load and delete every project.
A shared server must use `database`.

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

With `database`, the identity service and row-level security enforce access.
The schema lives in the production branch at `pilot/supabase/schema.sql`.

## Maintainer note: delete is denied on the database backend

The production schema grants no DELETE on `pilot_files` or on `case-files`
objects. `delete` on the database backend therefore fails with "Request denied"
today, by design; this code does not change the schema. Enabling it needs an
operator-reviewed RLS policy for owners/editors on both the table and the
bucket. The code deletes the catalog row first, so a partial failure can only
leave an invisible object that a later save of the same bytes reuses.

## Sign-in throttling

`team_library_login_limiter()` in `../project_library.R` is on by default: per
account, 5 failed sign-ins without delay, then 1, 2, 4 ... seconds (capped at
60) counted from the last failure, no lockout, reset on success.
`LIPIDOMIC_LOGIN_THROTTLE=off` gives immediate retries.
