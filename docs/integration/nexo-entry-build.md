# Nexo entry: build contracts (2026-11-10)

What every NEXO-ENTRY task builds against. The design is `docs/integration/nexo-entry-proposal/` (prototype.html,
nexo-entry-proposal.md; the product owner's answers are in its section 7). Tasks run in parallel against these shapes; do not
change a shape without saying so in your report. KEEP IT SIMPLE: the smallest code that makes the prototype real.
Science stays Team's: every count, flag and preparation is computed by Team's R code, the client only draws.

## Flow (client, `frontends/nexo/src/main.tsx`)

One screen at a time before the board: `signin` → `start` → `prepare` → `check` → `board`.

- Signed in to Admin already (today's `GET /admin/api/session-token` answers 200): skip `signin`.
- A `?dataset=` link whose project exists (FIX-G12) goes straight to `board` with the join card ("Prepared by X ·
  settings") while it loads. A `?project=` link likewise.
- A dataset with no project: `prepare`, then `check`, then the project is created (sidecar `POST /collab/projects`)
  when the person presses "Open the Canvas", with the settings and the outlier decisions.
- The quality check WARNS and never blocks (product owner): an undecided flagged sample shows a strong amber warning on the
  check and a banner on the board until someone keeps or excludes it.

## C1 · Admin sign-in for Nexo (Admin app, same origin)

Admin's URL prefix is no longer fixed (Admin 87db556b, `src/lib/base-path.ts`): production Admin is `/admin`, staging
Admin is `/admin-staging` on the same host, with cookies scoped per prefix. Nexo therefore reads one build variable,
`VITE_ADMIN_BASE` (default `/admin`; the staging build sets `/admin-staging`), and derives every Admin URL from it:
`<base>/api/session-token` (the existing `VITE_ADMIN_TOKEN_URL` stays as an override), `<base>/api/sign-in`,
`<base>/api/sign-out`, `<base>/sign-in?next=…`, `<base>/forgot-password?next=…`. Admin builds its routes and
redirects with `withBasePath` and never hardcodes `/admin`. Below, `<base>` is that prefix.


- `POST <base>/api/sign-in` JSON `{email, password, code?}`. Same-origin only (the session-token route's rule).
  Runs Admin's existing sign-in (`authenticate` in `frontends/admin/src/app/actions.ts`) and sets the same session
  cookie as the sign-in page, so one sign-in serves Admin and Nexo.
  - `200 {"ok": true}`.
  - `401 {"error": "invalid_credentials"}` · `401 {"error": "code_required"}` (two-step on, no code) ·
    `401 {"error": "invalid_code"}` · `400 {"error": "missing_fields"}` · `503 {"error": "unavailable"}`.
  - Never logs or echoes the password or the code. `Cache-Control: no-store`.
- `POST <base>/api/sign-out` → `204`, clears the session exactly like Admin's own sign-out.
- Admin's sign-in, forgot-password and invitation pages accept `next=` a same-origin Nexo path (`/nexo/…` or `/nexo-staging/…`)
  and return there when done; nothing else new is followed.

## C2 · Datasets released to the caller (Admin migration, then Nexo API)

- Admin: `admin.client.members_prepare boolean NOT NULL DEFAULT false` (lab staff toggle it per client, next to the
  existing Nexo switch `nexo_access`, 0021/0022). Off = only lab staff prepare and upload for that client.
- Admin RPC `admin.nexo_datasets_for_caller()` → rows `(dataset_id uuid, order_code text, version int, client_id uuid,
  client_name text, released_at timestamptz, members_prepare boolean)`: every released, non-archived dataset for lab
  staff; for a client member, those of their clients with `nexo_access` on. Never e-mails.
- `admin.nexo_dataset_for_caller` and `admin.nexo_caller` gain a last column `members_prepare boolean` (same rows,
  same grants; return type changes need DROP + CREATE in the new migration).
- Nexo API `GET /api/v1/datasets` (user's Admin token, as dataset opens) → `{"datasets": [{"adminDatasetId",
  "orderCode", "version", "clientId", "clientName", "releasedAt", "membersPrepare"}]}`; 401 `admin_auth_required`
  without a valid token.

## C3 · Preparation answers (Nexo API, `frontends/nexo-api/datasets.R`)

- The 422 `preparation_choices_required` keeps every field it has and adds `sampleGroups: {"<sample>": "<group>"}`
  from the Metadata sheet (Team's condition column; absent → no key).
- `teamControlDefault` follows Team's published guided workspace: `dropNonDetected` TRUE, `imputeZerosPerFile` TRUE,
  `imputeRemainingNAtoZero` FALSE (Team source `R/guided_preparation_controls.R:5,23-24`, `R/utils_preparation.R:8`).
- `POST /api/v1/datasets/preview` `{adminDatasetId, samples, minDetectionPct, detectionScope, dropNonDetected}` →
  `{"kept", "total", "leftOut": ["<lipid>", …], "histogram": [{"detectedIn", "kept", "leftOut"}], "samples": n,
  "missing": {"values", "cells"}}`, with Team's detection rule; no session opened; same auth as an open.
- `GET /api/v1/sessions/<id>/quality` (after a dataset session opened) → `{"pca": [{"sample", "group", "pc1",
  "pc2", "distance", "flagged"}], "limit", "variance": [pc1, pc2], "spread": [{"sample", "group", "median", "q1",
  "q3"}], "missing": [{"sample", "missing", "of"}]}` with Team's outlier rule (distance to the PC1/PC2 centroid,
  flagged when (distance − median)/MAD > 2.5) on the prepared data.
- Exclude = a new preparation with Team's sample decision `settings.outlierTreatments: {"<sample>": "remove"}`;
  `samples` stays as chosen (changed by ENTRY-8 and ENTRY-INT-2, 2026-11-10; it was a shorter `samples`). The reason and
  the decision travel in the project's settings, one row per sample: `settings.outlierDecisions: [{"sample", "choice":
  "keep"|"exclude"|"undecided", "reason"?, "by"?, "displayName"?, "at"?}]` (a row from the quality check has `by` only;
  a board decision, sidecar `PUT /collab/projects/<id>/decisions {sample, choice, reason?}`, writes all of them).

## C4 · The caller's projects (sidecar, `frontends/nexo-collab/src/projects.mjs`)

- `GET /collab/projects` (no query) → `{"projects": [{"projectId", "workspace", "origin": {"kind", "id"},
  "createdBy": {"userId", "displayName"}, "createdAt", "updatedAt", "online": [{"userId", "displayName"}]}]}`, only
  rows the caller may open (`auth.allow`), newest `updatedAt` first. Names from `admin.nexo_people`; `online` from the
  connected awareness states of that document. `?dataset=` keeps today's answer.

## C5 · Excel upload (wave 2)

- `POST /api/v1/datasets/upload` (multipart workbook): Team's import (formats and checks of
  `R/frontends/team/upload_formats.R`, `sheet_picker.R`, `sample_metadata_import_module.R`, called read-only, never
  edited) → a dataset Nexo opens like a released one (`adminDatasetId` = `upload-<uuid>`). Lab staff always; a client
  member only when their client has `members_prepare` on. A client member may prepare a released dataset (create its
  project) only when `members_prepare` is on; otherwise `403 lab_prepares` and Start shows the dataset as "Waiting
  for the lab".

## C6 · Client files, so the client tasks run in parallel

Each screen lives in its own file under `frontends/nexo/src/ui/entry/` with its own CSS file next to it. The owner of
`main.tsx` (task ENTRY-1) builds the screen switch and creates a minimal STUB for every screen it does not own, with
exactly this interface; the owning task replaces the stub's body (keep the export and props).

| File | Export and props | Owner |
|---|---|---|
| `ui/entry/PrepareScreen.tsx` | `PrepareScreen({ dataset, choices, onPrepared(settings, sessionId), onCancel })` | ENTRY-1 |
| `ui/entry/StartScreen.tsx` | `StartScreen({ view, onOpenProject(projectId), onPrepareDataset(adminDatasetId), onImportCheckpoint() })` | ENTRY-4 |
| `ui/entry/CheckScreen.tsx` | `CheckScreen({ sessionId, settings, onOpenCanvas(outlierDecisions), onBack })` | ENTRY-4 |
| `ui/entry/BoardNotice.tsx` | `BoardNotice({ settings, preparedBy, projectId?, canDecide?, save? })` (the last three added by ENTRY-8 / ENTRY-INT-2): the "Prepared by X · settings" chip and the undecided-sample banner on the board | ENTRY-4 |
| `ui/entry/SignInScreen.tsx` | `SignInScreen({ onSignedIn, signedOutFrom? })` | ENTRY-5 |

Shared look: ENTRY-1 adds the entry tokens to `tokens.css` (`--field: #7d8a99`, `--field-h: 40px` / 44 px on touch,
`--h1: 24px`, `--h2: 18px`) and puts the illustrations and the lab logo in `frontends/nexo/public/entry/` (copied from
the proposal folder). Other tasks use those names with a fallback (`var(--field, #7d8a99)`) and the same file paths.
Copy goes in each screen's file or a `ui/entry/strings.ts` per owner (`signInStrings`, `startStrings`, …), not in the
shared `ui/strings.ts`, to avoid merge conflicts.
