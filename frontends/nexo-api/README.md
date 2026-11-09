# Nexo API (R Plumber) — dataset v1 sessions

The API is a separate process, not part of the Shiny app, so it lives in `frontends/nexo-api/` (next to
`frontends/nexo/`), outside Team's `R/` tree. It still runs from the repository root with Team's `R/` beside
it: `Rscript --vanilla frontends/nexo-api/run.R` (`LIPIDOMIC_API_ROOT` points it at another Team tree).
Machine-dependent wall-clock budgets (`test_api_stress.R`, the 50-render p95/RSS part of `test_api_cache.R`)
SKIP unless `NEXO_API_PERF=1`.

Admin wave 1 added one entry point: `POST /api/v1/datasets/sessions` opens a Nexo session straight
from an Admin dataset v1 workbook (multipart `file` + `settings` JSON, or JSON `datasetId` stored in
the `<workspace>-datasets` project of the storage layer). It runs Team's own steps (upload, confirmed
metadata snapshot, sample selection, Prepare, policy "team") with the explicit settings, returns the
same body as `POST /api/v1/sessions` with an empty canvas, and answers 422 `preparation_choices_required`
with the missing choices when the request does not carry them. Design and Team analysis:
`docs/integration/admin-dataset-session.md`.

Files: `datasets.R` (reader, choices, session, route handler), route in `plumber.R`.

Tests (from the repository root; on the RTX use `<home>/miniforge3/envs/nexo-api/bin/Rscript`):

    Rscript tests/dual-ui/fixtures/make_admin_dataset_v1_synthetic.R   # rebuilds the synthetic fixture
    Rscript tests/dual-ui/test_api_dataset_session.R                   # parity with Team's path
    Rscript tests/dual-ui/test_api_dataset_route.R                     # the route through plumber and checkpoint round trip
    Rscript tests/dual-ui/test_api_dataset_http.R                      # real httpuv transport limits (Unix fork)

JSON also accepts `{ "adminDatasetId": "<uuid>", "settings": {...} }` for a released,
current Admin dataset. Configure `LIPIDOMIC_ADMIN_SUPABASE_URL` (gateway base URL),
`LIPIDOMIC_ADMIN_ANON_KEY`, and `LIPIDOMIC_ADMIN_NEXO_TOKEN` (restricted `nexo_reader` JWT).
The API posts `{p_dataset_id: ...}` to `/rest/v1/rpc/nexo_dataset` with both
`Content-Profile: admin` and `Accept-Profile: admin`, then downloads
`/storage/v1/object/authenticated/admin-files/<storage_path>` and verifies the SHA256 of the raw
bytes before reading the workbook. Downloads stream to a temporary file with a hard 90 MiB
limit; RPC responses have a separate 64 KiB limit. libcurl rejects oversized Content-Length
headers early, and a streaming callback caps actual decoded bytes even for chunked and error
responses. Partial files are removed on failure; SHA256 is computed from the accepted file.
Every storage-path segment is encoded as literal data, including percent signs. Credentials and
upstream exception messages are never logged.
No verified-byte cache is added; each request rechecks release eligibility and downloads the workbook.

Without settings this returns the same 422 preparation dialog as multipart; with explicit settings
it uses the same Team preparation path. The 200 response additionally includes
`dataset.adminDatasetId`, `dataset.orderCode`, and `dataset.version`. Admin provenance is attached
per response, so session reuse by workbook/settings cannot leak another request's dataset identity.
No eligible RPC row returns 404 `dataset_not_found`; a digest mismatch returns 502
`dataset_integrity_failed`; missing configuration or upstream failures return 503
`admin_datasets_unavailable`. The existing SHA256 `datasetId` form remains supported.

The route test injects `options(lipidomic.admin.http_fetcher = function(method, url, headers, body)
...)`, returning `list(status = <HTTP status>, body = <raw bytes>)`; it runs entirely offline and
checks RPC headers/body, authenticated storage URL, preparation parity, and the Admin error responses.

## Store per client (`LIPIDOMIC_ADMIN_REQUIRE_USER=1`)

Contract: `docs/integration/nexo-store-scope.md`. Unset, nothing changes and the RPC below is never called.
On, every checkpoint route (`GET/POST /api/v1/checkpoints`, `GET .../<id>/download`, `DELETE .../<id>`,
`POST /api/v1/sessions` with `checkpointId`, `POST /api/v1/sessions/<id>/checkpoints`) and the dataset route without
`adminDatasetId` need `Authorization: Bearer <Admin access token>`:

- `api_admin_caller()` (`datasets.R`) posts `{}` to `/rest/v1/rpc/nexo_caller` (migration 0011) with `apikey: <anon>`
  and the user's `Authorization`; rows `caller, caller_view, client_id` become `list(staff, clients)`. Missing token or
  a PostgREST 401: `401 admin_auth_required`; Admin unreachable or a malformed answer: `503 admin_datasets_unavailable`.
  The answer is kept 60 s in memory, keyed by the token's SHA-256 (the token itself is never kept, logged or stored).
- Workspaces (`storage.R`): staff keep `LIPIDOMIC_API_WORKSPACE` (`nexo-pilot`) and the legacy folder; a client member
  reads `nexo-client-<client uuid>` for each of its clients, never the folder, and its list records carry `clientId`.
- Save goes into the session's workspace: `nexo-client-<openedBy.clientId>` for a dataset a member opened, the
  checkpoint's own workspace for a restored one, else the staff workspace. Staff may save anywhere; a member outside
  it gets `403 forbidden_scope`. Restore, download and delete outside the caller's workspaces: `404` (as unknown).
- Members get `403 staff_only` on ZIP upload and on `POST /api/v1/datasets/sessions` without `adminDatasetId`
  (multipart workbook or stored `datasetId`).
- A restored session is reused only within its workspace (a clean session of another workspace with the same bytes is
  left to its tab and a fresh one opens).

Not covered, on purpose: session ids (`/sessions/<id>/...` card routes) stay unguessable capabilities without a per-call
token check; staff do not list client workspaces; existing checkpoints are not migrated (they stay in `nexo-pilot`).

    Rscript tests/dual-ui/test_api_checkpoint_scope.R                  # switch off and on, fake RPC through the fetcher option

Left: factor the module wiring shared with `api_session_open()`; Team itself should read only the Abundance sheet of a v1
workbook (see the design doc, §2).
