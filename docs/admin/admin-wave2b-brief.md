# Admin, phase 1, wave 2b: shared brief for agents

Read `docs/admin/admin-wave1-brief.md`, `docs/admin/admin-wave2-brief.md` and `docs/admin/wave2-review.md`
first. Wave 2 is merged: the six admin RPCs, the signer policy, the connected release into Team's library,
`0006_wave2_fixes.sql` (signing only through `sign_dataset`, dataset release state not writable by the app
role, analysis/companion sha256+size recorded on `admin.dataset` and checked at release, bucket
`admin-files`), Receive shipment, Sample registry, Ingest results, Name dictionary. The real staging stack
passes `db/admin/test/staging.integration.mjs` 29/29.

Wave 2b makes the app work for real end to end, and adds the release side.

## Two tasks, separate files

| Task | Owns |
|---|---|
| **Live** | `src/lib/data/orders.ts`, `src/lib/session.ts`, `src/lib/auth-service.ts`, `src/lib/supabase/`, `src/middleware.ts`, `pipeline/page.tsx`, `orders/[code]/page.tsx`, `pipeline-overview.tsx`, `order-detail.tsx`, `e2e/live/`, `.env.example` |
| **Release** | `db/admin/migrations/0007_*.sql` + `db/admin/test/`, `src/app/(workspace)/release/`, `datasets/`, `release-policy/` (new route), `src/lib/data/release.ts`, `src/lib/release*`, `e2e/release.spec.ts` |

Neither edits `navigation.ts` (the coordinator does) nor the other's files. If you truly need a one-line hook
in a shared file, keep it to one line and say so in your report.

## Live task: real mode end to end

- Finding 8 of the review: `listOrders` and the order detail read the real database in live mode (orders
  with client name, stage, gates, samples count, shipment, result file, dataset status), through the
  user's own token so RLS decides what each person sees. Pipeline and order detail pages drop their
  live-mode placeholders. Keep demo behaviour unchanged.
- Real sign-in against GoTrue: email + password, then TOTP when the account has a verified factor (the
  stack enables TOTP). Lab staff land on the global pipeline; a client member sees only their client.
- E2E against staging, skipped unless `ADMIN_E2E_LIVE=1` plus `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the test users' credentials come from env (never committed). One
  spec `e2e/live/live.spec.ts`: an Operator signs in, receives a shipment, registers samples, sees the order
  at Registered on the real pipeline; a client user signs in and does not see another client's order. Add
  a tiny seed script (`e2e/live/seed.mjs`, service key from env) that creates those users and one order.
  The coordinator runs it against staging; you cannot reach staging.

## Release task: datasets, signatures, policy, release

- `0007`: `withdraw_dataset(p_dataset_id uuid, p_reason text)` and `supersede_dataset(p_dataset_id uuid,
  p_new_dataset_id uuid)` for eligible signers (the app role can no longer write `dataset.status`), and
  `build_dataset(p_order_id uuid, p_result_file_id uuid, p_storage_path text, p_sha256 text,
  p_analysis_sha256 text, p_analysis_size_bytes bigint, p_companion_sha256 text, p_companion_size_bytes
  bigint) returns uuid` for Operator+ (next version number, order stage → `excel_built`). New migration
  only; never edit 0005/0006. PGlite tests first.
- Build step (server only): from the accepted results TXT build with `@lipidomic/admin-ingest` (a) the
  full dataset v1 workbook, (b) the **analysis file** = only `Abundance` + `Metadata` sheets, (c) the
  **companion** = `Internal_Standards` + `QC_Injections` + `Provenance`. Compute sha256 and size on the
  server; upload (b) to `case-files` only at release time at `<project_id>/<sha256>`, and (a)/(c) to
  `admin-files` under `<client_id>/<order_code>/`. Unit-test the split (sheet names, cell values kept).
- Screens: **Release** (one dataset: its manifest, who signed and when, Sign button for eligible people,
  Release button enabled only when the policy count is met, Withdraw with a reason); **Datasets** (list of
  versions per order with status and provenance); **Release policy** (Owner only: choose eligible signers
  from lab staff and the required count >= 2; everyone else sees it read-only). After release show the
  Team project and an **Open in Nexo** link built from `NEXT_PUBLIC_NEXO_URL` and the project id (read
  `docs/integration/admin-dataset-session.md`; if Nexo cannot open a library project by id yet, link to the
  Team project and write the gap in your README, do not edit R code).
- Demo mode must support the whole flow with two demo signers so the E2E runs without Supabase:
  `e2e/release.spec.ts` builds a dataset for an order at Processed, signs as two different demo people,
  releases, sees the Team project id and the order at Released.
- Extend `db/admin/test/staging.integration.mjs` with build → sign ×2 → release → withdraw through the
  real RPCs (do not run it).

## Practice (unchanged)

TDD (red first, then green), one integration test at the real boundary, one E2E per flow, Pareto, no
speculative abstractions. Paste the output of every command: db tests, app `npm test`, typecheck, lint,
build (build `packages/admin-ingest` first with `npm run build`), `npx playwright test`. Small commits, no
push, no `gh`, no secrets, no lab data, English in code and docs, update the README you touched.
