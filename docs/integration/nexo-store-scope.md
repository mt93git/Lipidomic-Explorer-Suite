# Nexo's store per client (identity step 2)

Read first: `docs/integration/admin-identity.md` (the Admin token in Nexo, `openedBy`, the REQUIRE_USER switch and its
staging run). That step let a client member open **only its own released datasets**. Nexo's own store is still one
shared workspace (`api_workspace()` = `LIPIDOMIC_API_WORKSPACE`, default `nexo-pilot`, in `R/frontends/api/storage.R`):
every checkpoint, autosave and uploaded ZIP is listed to everyone, and the staging run confirmed it (a client's refusal
page offers **Choose checkpoint**). This step scopes the store so client access can leave staging.

## Rule (only when `LIPIDOMIC_ADMIN_REQUIRE_USER=1`; unset, nothing changes)

- Every checkpoint route (`GET/POST /api/v1/checkpoints`, `GET .../<id>/download`, `DELETE .../<id>`,
  `POST /api/v1/sessions` with `checkpointId`, `POST /api/v1/sessions/<id>/checkpoints`) needs
  `Authorization: Bearer <Admin access token>`. Missing or refused token: `401 admin_auth_required`, as for datasets.
- The caller is resolved through PostgREST with `apikey: <anon>` and the user's token by
  `admin.nexo_caller()` (migration 0011, below). Cache the answer per token for at most 60 s, in memory only; never log
  or store the token.
- **Scope of a workspace**: lab staff use today's workspace (`nexo-pilot`, unchanged, legacy folder checkpoints
  included). A client member uses `nexo-client-<client uuid>` for each client it belongs to.
- **List**: staff see their workspace as today. A member sees the checkpoints of its clients' workspaces only, each
  record with `clientId`. No folder checkpoints.
- **Save** (`/sessions/<id>/checkpoints`, autosave included): into the session's scope. A session opened from an Admin
  dataset by a member has `dataset.openedBy.clientId`, so its workspace is that client's. A session restored from a
  checkpoint keeps the workspace it came from. The caller must be allowed on that scope (staff, or a member of that
  client), else `403 forbidden_scope`.
- **Restore, download, delete**: an id outside the caller's scope answers `404` (same as unknown), never 403.
- **Staff-only when the switch is on**: ZIP upload (`POST /api/v1/checkpoints`) and the multipart dataset upload
  (`POST /api/v1/datasets/sessions` without `adminDatasetId`) answer `403 staff_only` to members.
- Out of scope, write it down: session ids (`/sessions/<id>/...` card routes) stay unguessable capabilities without a
  per-call token check; no migration of existing checkpoints (they stay in the staff workspace).

## Database: migration `0011_nexo_caller_scope.sql` (Admin line; needs Gerardo's OK before staging)

`admin.nexo_caller() RETURNS TABLE (caller uuid, caller_view text, client_id uuid)`: `SECURITY DEFINER`, pinned
`search_path`, `EXECUTE` to `authenticated` only, written like 0010. Lab staff: one row, `caller_view = 'staff'`,
`client_id` null. A client member: one row per active membership of an unarchived client, `caller_view = 'client'`.
Anyone else (no staff row, no membership, archived): no rows. Prove it in PGlite and add rows to
`db/admin/test/staging.integration.mjs` (staff one row; member of two clients two rows; archived membership none;
anon refused).

## UI (frontends/nexo)

Send the Admin token (`api/adminToken.ts`) on the checkpoint calls too, with the same 401 handling ("Sign in to Admin").
For a member: the start and refusal pages hide **Upload ZIP** and the multipart upload; **Choose checkpoint** lists
only what the API returns. Staff see what they see today.

## Done means

R tests (dual-ui, REQUIRE_USER on and off, a fake RPC like `test_api_dataset_route.R`): member A lists, restores,
saves, downloads and deletes only in A's workspace; A cannot reach B's or the staff's ids (404); staff unchanged;
member upload 403; switch off keeps every existing test green. UI vitest for the token on checkpoint calls and the
hidden actions. The coordinator runs the staging E2E (two members, staff) after Gerardo's OK on 0011.

## Staging run (2026-11-08)

0011 applied to Admin staging; `staging.integration.mjs` 61/61. Nexo staging API and UI on nexo/phase1 97c431f4 with
`LIPIDOMIC_ADMIN_REQUIRE_USER=1`. With real GoTrue tokens for two synthetic client members (ORD078, ORD082) and lab
staff, 24/24: each saves a checkpoint into its own workspace (members' records carry their `clientId`); each list shows
its own and none of the others'; a member gets 404 downloading, deleting or restoring another client's or the staff's
checkpoint and restores its own; member ZIP and workbook uploads are 403 `staff_only`; no token is 401; every test
checkpoint was deleted at the end. The identity browser run (9/9) still passes, and a member's refusal page no longer
offers Upload ZIP.
