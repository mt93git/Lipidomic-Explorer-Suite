# Open a released Admin dataset in Nexo: shared brief and contract

Admin (lab back office) releases a frozen dataset v1 workbook after two signatures. Nexo must open it
**from the same database and storage**, without keeping its own copy. One source of truth: the row in
`admin.dataset` (status, version, signatures, sha256) and the frozen workbook in the Supabase Storage
bucket `admin-files` at `admin.dataset.storage_path`.

Read first: `docs/integration/admin-dataset-session.md` (the existing endpoint
`POST /api/v1/datasets/sessions`, its 200 and 422 `preparation_choices_required` shapes). The values in
the workbook are never copied into tables; the workbook the two people signed is what Nexo opens.

## Flow

1. Admin, on a released and current dataset, shows **Open in Nexo** (lab staff only for now: Nexo has no
   user identity yet, only the nginx password). The link is `<NEXO_URL>/?dataset=<admin.dataset.id>`.
2. Nexo sees `?dataset=<uuid>` and calls `POST /api/v1/datasets/sessions` with
   `{ "adminDatasetId": "<uuid>" }` and no settings. The API answers 422 `preparation_choices_required`
   (prefilled with Team's control defaults and the available samples).
3. Nexo shows a **Prepare dataset** dialog: samples (all ticked by default), and every required setting
   with Team's defaults. The person confirms; Nexo sends the same body plus `settings`.
4. The API returns 200 (same shape as today plus `dataset.adminDatasetId`, `dataset.orderCode`,
   `dataset.version`); Nexo opens the session in the canvas exactly as it opens a checkpoint session, with
   the title `ORD041 · v1`. The person can save a normal checkpoint.

## Contract

### Database (Admin task, migration `db/admin/migrations/0009_nexo_reader.sql`)

- Role `nexo_reader` (NOLOGIN, granted to `authenticator`, no other grants) used by PostgREST/Storage when
  the Nexo API presents a JWT whose `role` claim is `nexo_reader` (signed with the stack's JWT secret at
  deploy time; never committed).
- `admin.nexo_dataset(p_dataset_id uuid) RETURNS TABLE (dataset_id uuid, order_code text, version int,
  storage_path text, sha256 text)` — `SECURITY DEFINER`, pinned `search_path`; returns the row only when
  the dataset is `released` and not archived (withdrawn or superseded → no row, the API answers 404).
  `EXECUTE` granted to `nexo_reader` only (not `authenticated`, not `anon`).
- Storage: `nexo_reader` may `SELECT` (download) an object in `admin-files` only when its name is the
  `storage_path` of a released, current dataset. Nothing else (no list of other objects, no write).
- Prove it in `db/admin/test/staging.integration.mjs` with a minted `nexo_reader` JWT: RPC works for a
  released dataset, 404/empty for built, withdrawn and unknown ids; download works for that path only;
  the same JWT cannot read `admin.order`, other objects, or call staff RPCs.

### Nexo API (R task, `R/frontends/api/datasets.R` + tests)

- New body form `{ "adminDatasetId": "<uuid>", "settings": {...}? }` beside the existing multipart and
  `datasetId` forms. Configuration from env: `LIPIDOMIC_ADMIN_SUPABASE_URL` (gateway with `/rest/v1` and
  `/storage/v1`), `LIPIDOMIC_ADMIN_ANON_KEY`, `LIPIDOMIC_ADMIN_NEXO_TOKEN` (the `nexo_reader` JWT). Missing
  configuration → 503 `admin_datasets_unavailable`.
- Steps: RPC `nexo_dataset` (header `Content-Profile: admin`); no row → 404 `dataset_not_found`; download
  `storage_path` from `admin-files`; **sha256 of the bytes must equal the row's sha256**, else 502
  `dataset_integrity_failed`; then exactly the existing path (Abundance only to Team's reader, Metadata
  mapping, Team preparation). Never log the token.
- Cache the verified bytes in the existing store under the sha256 so a second open does not download again
  (optional; only if it is a few lines).
- Tests (testthat, `tests/dual-ui/`): inject the HTTP fetcher so tests run offline with the synthetic
  fixture: 422 without settings, 200 with settings and parity with the multipart path, 404 no row, 502 bad
  digest, 503 not configured, and one route test through plumber.

### Nexo frontend (UI task, `frontends/nexo/` only)

- `?dataset=<uuid>` on load: call the API as above; render the **Prepare dataset** dialog from the 422
  body (`missing[]` with `kind`, `choices` or `min/max`, `teamControlDefault`; `availableSamples`), in
  Nexo's existing visual language; Cancel leaves an empty canvas. Show 404/502/503 as clear messages.
- On 200, load the session through the same code path a checkpoint open uses; window/project title
  `ORD041 · v1`.
- Tests: vitest for mapping 422 → form state → settings body (defaults kept exactly, integer slider stays
  integer); one Playwright spec with the mock API: open `?dataset=…`, see the dialog, untick one sample,
  confirm, see the canvas with the session's lipid count.

### Admin app (Admin task, `frontends/admin/`)

- Replace the current `?project=` link with **Open in Nexo** → `<NEXT_PUBLIC_NEXO_URL>/?dataset=<id>`, shown
  only on a released, current dataset (release page, datasets list, order detail) and only to lab staff.
  Withdrawn/superseded → no link. vitest for the visibility rule; extend `e2e/release.spec.ts` to assert
  the link after release (no new spec).

## Practice

TDD (red first), one integration test at the real boundary, one E2E per flow, Pareto, no speculative
abstractions. Paste every command's output. No push, no `gh`, no secrets, no lab data, English in code and
docs. Do not touch `R/modules`, `R/core`, `R/server.R`, `R/ui.R`, `www/` or Classic files.
