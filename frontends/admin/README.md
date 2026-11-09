# Lipidomic Explorer Admin

Next.js App Router scaffold under `/admin`. All fixtures are invented; there are no lab measurements,
real people, or credentials in this app. The server renders the authenticated pages; interactive
navigation, filters, and form feedback use small client components.

## Run

Use Node.js 22 or later and npm:

```sh
cd frontends/admin
npm ci
npm run dev
# Open http://localhost:3000/admin
```

No environment file or Supabase instance is needed. Missing either Supabase setting, or `ADMIN_MOCK=1`,
enables **Example data** and an in-memory demo identity. Use **Lab staff | Client** in the top bar to
review both views. The client choice and demo view are app-scoped cookies; example records reset with
the app and are never written to a database. Sign-out leaves the demo signed out until you choose
**Enter example workspace** on the sign-in page.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start
npm run e2e        # Playwright, see "End-to-end" below
```

Cormorant Garamond, Nunito Sans, and IBM Plex Mono are configured through `next/font/google`.
The dev/build launcher probes Google Fonts; when unavailable it prints a notice and uses system font
fallbacks, making offline review possible. `ADMIN_FONT_MODE=google` requires the brand fonts;
`ADMIN_FONT_MODE=system` explicitly uses fallbacks. Font files are self-hosted by Next.js after an online
build. No runtime requests to Google Fonts are needed.

## Live sign-in

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Remove `ADMIN_MOCK=1`. Password sign-in and an already-enrolled TOTP
factor use Supabase Auth. Yale SSO is visibly disabled pending institutional configuration. MFA
enrollment is a later phase.

The server-only client uses the public key plus the current user's cookies and targets the `admin`
schema. Future data queries must use this client so RLS applies. Node-runtime middleware refreshes the verified
session and forwards refreshed cookies to both the request and response. App routes also verify the
user and MFA state; middleware alone is not the authorization boundary.

Admin uses the dedicated `le-admin-auth` cookie with path `/admin`, HttpOnly, SameSite=Lax, and Secure
in production. `signOut({ scope: "local" })` ends this app's session, with no global sign-out. Client
selection is checked against verified memberships before writing its cookie. Live mode never exposes
the demo view switch, and no example records are returned in live mode.

The live identity comes from the database, read with the user's own token (wave 2b): the lab role from
`admin.lab_staff` (`owner`, `admin`, `operator` = staff, shown as `Owner`, `Admin`, `Operator`; a lab
`member` is not staff) and the client memberships from `admin.client_member` with the client's name
(`client_admin`, `requester`, `viewer` = `Client admin`, `Requester`, `Viewer`). These are the rows RLS uses, so
the screens and the database agree (`src/lib/supabase/memberships.ts`). Archived memberships and archived
clients are ignored. The user chip shows `lab_staff.display_name`, else the account email. `app_metadata` and
`user_metadata` no longer grant anything. Accounts without memberships have no client access.

Sign-in is email + password against GoTrue, then the six-digit code when the account has a verified TOTP
factor (assurance level `aal2` required); a missing or wrong code ends the partial session. Lab staff land on
the global pipeline; a client user lands on the client home and may open only their clients' orders.

## Screens and routes

- `/sign-in`, `/choose-client`: password/TOTP sign-in, demo entry, and validated client selection.
- `/pipeline`: the lab's home. A global, all-clients overview: six attention tiles that act as filters
  (blocked, ready, awaiting checks, on the instrument, waiting for results, released this week), a
  per-client strip (open and blocked counts, multi-select), stage/panel/owner menus, free-text search
  (order code, description, batch or sample code), removable filter chips, the ten-column kanban or
  per-client swimlanes, and the released list. Every filter lives in the URL query
  (`client`, `stage`, `focus`, `panel`, `owner`, `q`, `group`), so a view can be shared and survives
  reload. The top-bar scope control (`All clients ▾`) mirrors the client filter. Lab staff never have
  to choose a client; `/choose-client` is only for client users with several memberships.
  Multi-value params use repeated keys (`panel=a&panel=b`, commas allowed inside values); `q` is kept
  exactly as typed. A client audience goes through `scopeToAudience` first and never receives other
  clients' records. See `docs/admin/global-overview-design.md`.
- `scripts/browser-check.mjs`: optional Playwright check of the overview (back/forward/reload, typing,
  menus at 390 px) that writes the captures in `verification/`. Needs a running `npm start`, a
  `playwright-core` install (`PLAYWRIGHT_CORE`) and a Chromium executable (`CHROME`); see the file header.
- `scripts/samples-screens.mjs`: screenshots of the samples flow (receive shipment, registry with errors
  and with codes, order detail, pipeline) at 1440 and 390 px into `verification/samples/`, plus a sideways
  overflow check. Needs a server at `BASE` (default `http://127.0.0.1:3110/admin`) and the Playwright
  Chromium. `verification/samples/RESULTS.md` lists the wave 2 commands and outcomes.
- `/orders/ORD041`: example detail, ten-step progress, gate checklist, facts, and dated history. In demo
  mode it reflects the shipments and samples recorded in this browser (stage, gates, history).
- `/receive-shipment` (wave 2): pick an order at **Request**, record carrier, tracking number, condition on
  arrival (`ok`, `thawed`, `damaged`, `partial`), box count and notes. The order moves to **Received** and
  the page continues to its sample registry. A condition other than `ok` shows up as a blocked gate on the
  board. `?order=ORD042` preselects an order; the form mirrors its choice into the URL so the facts follow.
- `/sample-registry` (wave 2): pick an order whose registry is open (**Received**, or **Registered** with more
  to add). A grid with the six Metadata columns (`FullName`, `Group1Term`, `Group2Term`, `ReplicateTerm`,
  `PatientTerm`, `TimePointTerm`) plus client sample ID, matrix and volume. **Paste from Excel**: tab-separated
  rows; a header row with the column names is recognised and mapped by name (any order, spelling variants such
  as `Full name`), otherwise columns are read in the grid's order; unknown header columns are reported and
  dropped. Inline checks before saving: `FullName` required, duplicates within the list and against the
  order's registered samples, numeric volume (`12,5` accepted). Saving is all-or-nothing; the page then
  shows the generated codes (`ORD042-S001`…), assigned by the database (or the demo store), never typed, and
  the order reads **Registered** on the board. `?received=` and `?saved=` only choose the banner.
- All sidebar entries have routes. The placeholder route registry in `src/lib/navigation.ts` names
  the planned phase for each future screen, including `/client/home` and `/client/order`.

The brief names eleven lifecycle states while requesting ten stages. The UI preserves ten working
stages, **Request** through **Excel built**, and displays **Released** as the terminal outcome. Released
orders have their own counter and remain available in order detail. Gate actions link to the relevant
workflow or clearly preview an action; this scaffold does not mutate lab records or grant release.

At 390 px the sidebar becomes a horizontal strip. The kanban and stepper have their own scroll regions;
the page layout uses shrinkable grid columns. Keyboard focus, status words, and progress labels do not
depend on color alone.

## Dependencies and checks

Every direct dependency is pinned exactly and `package-lock.json` belongs only to this app. Next.js
15.5.28 was released on October 14, 2026, more than two weeks before this scaffold's November 7 run;
see the [Next.js release notice](https://nextjs.org/blog/nextjs-security-update-october-14-2026).
The auth implementation follows the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
and [local sign-out semantics](https://supabase.com/docs/guides/auth/signout).

This sandbox's installation was restored from cached npm archives on macOS ARM64. Next.js reports
missing optional SWC entries for other platforms; its automatic lockfile repair needs registry access.
On a network-enabled machine, run `npm install --package-lock-only --include=optional` in this folder
and review the resulting lockfile before Linux/Windows deployment. The verified local build passes
despite that warning.

Vitest + Testing Library cover the shell and scope control, card states, the pure filter model
(`src/lib/pipeline-filters.ts`: combination, URL round trip, counts, chips, mixed batches), the
overview's tiles-as-filters, chip removal, swimlanes and URL sync, the example-data coverage, the
stepper, configuration, and authentication boundaries. The security test forbids service credentials throughout application
source and checks the server-only Supabase boundary. See `verification/RESULTS.md` for the real red/green
commands, build output, and sandbox limitations.

Wave 2 (samples) adds, test first: `tests/samples-paste.test.ts` (tab-separated paste, header mapping,
Excel quoting), `tests/samples-validation.test.ts` (row checks, contract conversion, shipment form),
`tests/samples-demo.test.ts` (the pure demo state: stage moves, gates, codes, all-or-nothing),
`tests/data-seam.test.ts` (live mode calls `admin.receive_shipment` / `admin.register_samples` with the
contract's exact argument names and maps rows and refusals; demo mode is keyed by the browser cookie),
`tests/sample-registry.test.tsx` and `tests/receive-shipment.test.tsx` (the two client components).

## Data seam (wave 2)

`src/lib/data/` holds one small module per area, exporting async functions named after the database
contract in `docs/admin/admin-wave2-brief.md`. Each function is a plain `if (live)`: live mode calls
`supabase.schema('admin').rpc(...)` through the cookie-backed client (RLS and the function's own permission
checks apply); demo mode works on in-memory records.

| Module | Functions | Live | Demo |
|---|---|---|---|
| `data/samples.ts` | `receiveShipment` | `rpc('receive_shipment', { p_order_id, p_carrier, p_tracking_number, p_condition, p_box_count, p_notes })` → uuid | `recordShipment` on the browser's demo state |
| | `registerSamples` | `rpc('register_samples', { p_order_id, p_shipment_id, p_samples })` → `setof admin.sample`, mapped to `{ id, code, sampleNumber, …metadata }` | `recordSamples`: sequential `ORDnnn-Snnn`, duplicate `FullName` refused |
| | `listReceivableOrders`, `listRegistryOrders`, `getRegistryOrder` | PostgREST reads of `order`, `shipment`, `sample` (`client:client(name)` embedded); the arrival shown and registered against is the newest shipment with `received_at` set (a client-submitted shipment that never arrived is not an arrival) | example orders with the demo state applied |
| `data/orders.ts` | `listOrders`, `listClients`, `getOrder` | one PostgREST read of `order` with `panel`, `sample`, `shipment`, `result_file` (+ `batch`), `dataset` (+ `signature`) embedded, plus `lab_staff` names and `client`, through the user's token: RLS decides (staff: every client; a client member: their clients; results files staff-only; datasets visible to clients once released). Rows map to the existing `Order` view model: stage, sample counts, arrival day (lab time zone), batch, gates for the current stage, history newest first. Withdrawn and superseded versions stay in the history with their status and reason (a build archived before release is left out); when the order reached Released but no version is current, `Order.retired` carries the last retirement (version, status, reason, instant), `releasedAt` is unset, the last gate fails, the order page says **Released, then withdrawn** (staff and client) and the pipeline's Released list adds "then withdrawn". The schema has no target date or assignee yet (shown as not set / Unassigned) | example orders with the demo state applied; used by `/pipeline` and `/orders/[code]` |
| `data/demo-store.ts` | `readDemoState`, `writeDemoState` | — | one record set per browser (shipments, samples, accepted results files), keyed by the HttpOnly `/admin` cookie `le-admin-demo-store`, kept on `globalThis` for the life of the process (at most 50 browsers; nothing is written anywhere). Receive, registry, results picker, acceptance, pipeline and order detail all read this one record, so a demo order carries its progress across them |

Pure logic lives next to it: `src/lib/samples.ts` (columns and aliases, `parsePaste`, `validateSamples`,
`toSampleInput`, `parseShipmentForm`, the `DataError` whose message may be shown to the operator) and
`src/lib/samples-demo.ts` (`recordShipment`, `recordSamples`, `applyDemoState`). The server actions in
`src/app/(workspace)/receive-shipment/actions.ts` and `sample-registry/actions.ts` re-check what the browser
sent, call the seam and redirect; a `DataError` comes back as a message, anything else is a real failure.
A registry grid left open while the order moved past Registered is refused with the same message in demo
and live (`registryClosedProblem`): by the action's fresh read, and by `admin.register_samples` itself
(`0006_wave2_fixes.sql`) if the order moves during the save.

## End-to-end

`playwright.config.ts` runs `e2e/` against `npm run dev -- --port 3110` in demo mode (no Supabase env
vars), one `chromium` project, `baseURL` `http://127.0.0.1:3110/admin`, reusing a server that is already
listening. `e2e/samples.spec.ts` is the one happy path of the samples flow: enter the demo as lab staff,
receive the shipment of an order at Request, register three samples by pasting a Metadata sheet, see the
three codes, and find the order in the **Registered** column. Install the browser once with
`npx playwright install chromium`, then `npm run e2e`.

`e2e/live/live.spec.ts` runs the same flow against a real stack (staging) and is **skipped** unless
`ADMIN_E2E_LIVE=1`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the test users'
credentials (`ADMIN_E2E_OPERATOR_EMAIL`/`_PASSWORD`, `ADMIN_E2E_CLIENT_EMAIL`/`_PASSWORD`) are set (see
`.env.example`; never commit values). An Operator signs in with password + TOTP, lands on the pipeline, receives
the seeded order's shipment, registers three samples and finds the order at **Registered** on the real pipeline
and in its detail; a client user (member of another client) lands on the client home, opens their own order,
and gets *Page not found* for the Operator's order. `e2e/live/seed.mjs` (service key from
`SUPABASE_SERVICE_ROLE_KEY`, used only by the seed) creates or refreshes the two users (reserved test domains
only), the `E2E Live Client A/B` clients, the memberships, a verified TOTP factor for the Operator and two fresh
orders, and writes the order codes and the TOTP secret to the git-ignored `e2e/live/.seed.local.json` (mode 600;
nothing secret is printed). It needs the service role to have `USAGE` on schema `admin` and `SELECT, INSERT` on
`client`, `client_member`, `lab_staff` and `"order"`. Run the seed before every live run, then run the live spec
alone so Playwright starts the dev server with the live variables (no demo server on port 3110):

```sh
node e2e/live/seed.mjs
ADMIN_E2E_LIVE=1 npx playwright test e2e/live
```

## Remaining integration

Memberships and order reads are connected (wave 2b); implement the phase-labelled workflows. The live reads
(order with embedded children, `lab_staff`, `client`, `client_member`) have not been run against staging from
this sandbox: `e2e/live/live.spec.ts` is the check. A client area listing a client's orders (`/client/home`,
`/client/order`) is still a placeholder; clients reach an order by its URL. The wave 2 samples seam codes against
`admin.receive_shipment` and `admin.register_samples` as written in the brief; its live reads
(`order`, `shipment`, `sample` through PostgREST, `admin` schema exposed) and the two RPCs have not been run
against staging from this sandbox: the coordinator extends `db/admin/test/staging.integration.mjs` and runs
it. If the DB task changes a function's shape, `src/lib/data/samples.ts` is the one place to follow. Production release must enforce two
signatures by different people and append-only audit in the database. Real Supabase credentials, MFA,
gateway routing, and a visual browser check at 390 px still need integration verification. These cannot
be validated against the backend in this scaffold run.

### Wave 2: results and name dictionary

Staff routes `/admin/ingest-results` and `/admin/name-dictionary` parse SCIEX OS TXT
on the server with the local `@lipidomic/admin-ingest` package. Uploads are limited
to 5 MB. Review shows injection types, retained analytes, IS rows, explicit duplicate
exclusions, N/A share (Unknown injections only), and the package's checks. A stop
requires a nonempty operator reason; the server enforces the same gate. Acceptance
hashes the original bytes on the server, uploads to private `admin-files` under
`<client_id>/<order_code>/...`, and calls `admin.accept_result_file` with the brief's
parameter names, including the summary and override reason. No registry is supplied
to the parser checks: SCIEX injection-to-registry matching remains unchecked and is
shown as such in the check message.

The existing environment switch selects live Supabase or cookie-scoped in-memory
demo data. Pending uploads and the last file's analyte list are session-local,
expire after one hour, and disappear on server restart; parse and accept must reach
the same server process. Accepted live files and the lab-wide name dictionary are
persisted in Supabase. Dictionary changes preserve exact export names and never
rewrite peak areas. One live lab-wide entry per export name (database index
`name_map_lab_wide_export_name`): adding a name that already exists, or renaming an
entry onto another, is refused in demo and live alike ("… is already in the
dictionary. Edit its entry instead"). In demo mode an accepted file moves the order
to Processed in the shared demo store (`recordResultFile`), so the pipeline shows it.
Bucket `admin-files` and its staff-only policies are created by
`db/admin/migrations/0006_wave2_fixes.sql`. Failed live RPC calls can leave an unaccepted storage object;
a retry uses a new path without overwriting any accepted file.

### Wave 2b: release side

Staff routes `/admin/release`, `/admin/release/<dataset id>`, `/admin/datasets` and `/admin/release-policy`
(new route; the coordinator adds it to `src/lib/navigation.ts`). The seam is `src/lib/data/release.ts`, the
rules it shares with the screens are in `src/lib/release.ts`, the server-side build in `src/lib/release-build.ts`,
the demo records in `src/lib/release-demo.ts` (kept in the shared demo state, so the pipeline and the order
detail show **Excel built** and **Released**).

- **Release** (`/release`): orders with an accepted results file (Processed or later), each with its versions and a
  **Build dataset v*n*** button; built versions waiting for signatures. **Release / dataset** (`/release/<id>`):
  the manifest (the dataset v1 workbook, the analysis file = `Abundance` + `Metadata`, the companion =
  `Internal_Standards` + `QC_Injections` + `Provenance`, each with sheets, SHA-256 and size), provenance (source
  TXT digest, SCIEX OS version, processing method, how the Abundance headers were chosen), who signed and when,
  **Sign** (role `prepared` / `reviewed` / `approved` and a note; eligible people who have not signed yet),
  **Release dataset** (enabled only when the policy count is met by distinct eligible people), then the Team project
  (id, name, **Open Team** from `NEXT_PUBLIC_TEAM_URL`, **Open in Nexo** → `<NEXT_PUBLIC_NEXO_URL>/?dataset=<dataset id>` while the version is released and current),
  **Withdraw** with a reason, and **Mark as superseded** when a newer released version exists.
- **Datasets** (`/datasets`, `?order=ORD048` to filter): every version with status, built/released instants, signers,
  provenance digests, the Team project id and **Open in Nexo** on the released, current version.
- **Release policy** (`/release-policy`): the current policy (required count, eligible signers, who set it). The lab
  Owner ticks eligible signers among lab staff and sets the count (≥ 2, ≤ the people ticked; nobody ticked = any
  lab Owner or Admin); everyone else reads it.

**The build (server only).** `buildDataset` reads the accepted TXT from `admin-files`, checks it against the digest
recorded at acceptance, builds the dataset v1 workbook with `@lipidomic/admin-ingest`, splits it with ExcelJS into
the analysis file and the companion (cells copied, never transformed; `tests/release-build.test.ts` compares every
cell), hashes the exact bytes it stores, uploads each file to `admin-files` under its own digest,
`<client_id>/<order_code>/datasets/<sha256 of that file>/{dataset-v1,analysis,companion}.xlsx` (0008 binds the
combined workbook's path to the order and its digest; the other two paths follow from the recorded manifest), and
calls `admin.build_dataset` with the manifest. Rules of the build (wave 2b review findings 4, 6, 7 and 8):

- **Only this order's samples.** SCIEX `Unknown` injections are matched to the order's registry by sample code,
  `FullName`, or an injection name ending in `_<code>` (`B2026-031_017_ORD041-S037`). Every `Unknown` injection must
  match, or nothing is built and nothing is uploaded (`1 Unknown injection is not a registered sample of ORD041: …`):
  a shared batch exported whole carries other clients' samples, and the analysis file goes to this client. Blanks
  and QC are not `Unknown`; they stay in the companion's `QC_Injections`. So the Abundance headers are always the
  `FullName`s. A column named exactly like one of this order's `FullName`s is taken as that sample; sample codes are
  the authoritative, globally unique link (prefer injection names that end in them).
- **Existing objects are compared, never trusted.** Uploads never overwrite (`upsert: false`). If the path is
  taken, the object is read back and accepted only with the same sha256 and size; other bytes, or an object that
  cannot be read back, fail the build before anything is recorded.
- **One version.** The version written into `Provenance` (`dataset_version`) is passed as `p_expected_version`;
  `build_dataset` refuses it under the order lock when another build took it (SQLSTATE 40001), and the app builds
  the files again for the next version (up to 3 attempts). So a workbook's version always equals `admin.dataset.version`.
- **The accepted bytes.** The TXT is decoded strictly as UTF-8 with a leading BOM kept, and the build checks that the
  text re-encodes to the accepted digest, so `source_txt_sha256` in `Provenance` is the digest of the accepted bytes.

**The release** downloads the analysis file, checks its digest and size against the manifest, uploads it to Team's bucket
`case-files` at `<project_id>/<analysis_sha256>` **with the signed-in signer's own token** (migration 0007 allows
that for a built dataset's recorded digest; no service role exists in this app, see `tests/security.test.ts`) and
calls `admin.release_dataset`. A failed call leaves the staged object behind; the retry uses a new project id.

| Module | Functions | Live | Demo |
|---|---|---|---|
| `data/release.ts` | `listReleaseOrders`, `getDataset`, `listDatasets`, `getReleasePolicy` | PostgREST reads of `order`, `client`, `result_file`, `sample`, `dataset`, `signature`, `lab_staff`, `release_policy` (and `audit_event` for who built a version) | the browser's demo datasets over the example orders |
| | `buildDataset` | Storage download/uploads + `rpc('build_dataset', { p_order_id, p_result_file_id, p_expected_version, p_storage_path, p_sha256, p_analysis_sha256, p_analysis_size_bytes, p_companion_sha256, p_companion_size_bytes })` → uuid (retried on 40001) | the same build on a synthetic SCIEX export (`demoSourceText`); an order without samples registered in this browser stands for its example registry (`Sample_001`, …) |
| | `signDataset` | `rpc('sign_dataset', { p_dataset_id, p_role, p_note })` | `recordSignature` |
| | `releaseDataset` | upload to `case-files` + `rpc('release_dataset', { p_dataset_id, p_analysis_object_path, p_analysis_sha256, p_analysis_size_bytes, p_analysis_name, p_companion_path })` → project id | `recordRelease` with a random project id |
| | `withdrawDataset`, `supersedeDataset` | `rpc('withdraw_dataset', { p_dataset_id, p_reason })`, `rpc('supersede_dataset', { p_dataset_id, p_new_dataset_id })` | `recordWithdrawal`, `recordSupersede` |
| | `setReleasePolicy` | `rpc('set_release_policy', { p_eligible_signers, p_required_signatures })` | `setDemoPolicy` |

**Demo signers.** Live mode acts as the signed-in person. The example workspace has four demo lab people (Demo
Lab Owner, Demo Reviewer A and B as Admins, Demo Operator, the session user) and a default policy naming the two
reviewers; every release form carries an **acting as** choice (`Sign as`, `Release as`, `Withdraw as`, `Set as`) so
the whole flow runs without Supabase: build as the operator, sign as A, sign as B, release as B. The refusals are
worded like the database functions (`not an eligible release signer`, `already signed`, `needs 2 signatures by
different eligible people (has 1)`).

**Open in Nexo** (`docs/integration/admin-nexo-open.md`). The link is `<NEXT_PUBLIC_NEXO_URL>/?dataset=<admin.dataset.id>`;
Nexo reads that dataset itself from the same database and storage (`admin.nexo_dataset` and the `admin-files` read policy
for the `nexo_reader` role, `db/admin/migrations/0009_nexo_reader.sql`) and checks the workbook's SHA-256. The rule is
`nexoDatasetLink` in `src/lib/release.ts`, for whom `mayOpenInNexo` allows: lab staff always, client members only when
`NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1` (`docs/integration/admin-identity.md`; unset in production until Nexo's own store is
scoped per client), on a released, unarchived dataset only; built, withdrawn and superseded versions get no link. It
appears on the release page and the Datasets list (staff only) and on the order detail (`Order.currentDatasetId`, set by
both data seams when a released version is current; a client member sees it there with the switch on). `NEXT_PUBLIC_NEXO_URL` and `NEXT_PUBLIC_TEAM_URL` are optional and public; without them the links are not shown.
`playwright.config.ts` sets a placeholder `NEXT_PUBLIC_NEXO_URL` (Nexo is not started) so `e2e/release.spec.ts` can assert
the link after release and its absence after withdrawal.

**Session token for Nexo** (`docs/integration/admin-identity.md`). `GET /admin/api/session-token`
(`src/app/api/session-token/route.ts`, rules in `src/lib/session-token.ts`) hands the signed-in user's GoTrue access
token to Nexo, which is served from the same origin but cannot read the `/admin`-scoped cookie. Answers, all with
exactly `Cache-Control: no-store` (the middleware keeps that value for this route; pages keep `private, no-store`):
`200 {"accessToken", "expiresAt" (unix s), "userId", "view": "staff" | "client"}`; `401 {"error": "signed_out"}` when
nobody is signed in, the second factor is enrolled but not passed, or the stored token's subject is not the verified user;
`403 {"error": "cross_origin"}` decided before the session is read (`Sec-Fetch-Site` other than `same-origin`, or, when
that header is absent, an `Origin` whose host is not the request's `X-Forwarded-Host`/`Host`); `503 {"error":
"unavailable"}` when the session cannot be read (not reported as signed out). The middleware refreshes the session first,
as on any page. Demo mode has no GoTrue session, so the endpoint answers `signed_out` there. Nexo sends the token to its
API, which calls `admin.nexo_dataset_for_caller` (`db/admin/migrations/0010_nexo_caller.sql`). Tests:
`tests/session-token.test.ts`, `tests/server-client.test.ts` (the header through the middleware),
`e2e/session-token.spec.ts` (demo: same-origin 401, cross-origin 403), `tests/nexo-access.test.tsx` (the client switch).

Tests, test first: `tests/release.test.ts` (eligibility, progress, policy checks, paths, links, registry
matching), `tests/release-build.test.ts` (sheet names, every cell, digests), `tests/release-demo.test.ts` (the demo
records and what the order shows), `tests/release-seam.test.ts` (the demo flow end to end, and the live adapter
with a fake PostgREST and Storage: argument names of all six RPCs, the three uploads and their digests, the staged
analysis file; a two-client shared batch refused and the own-samples batch built with no foreign column; an
existing object with other bytes or unreadable; two concurrent builds whose `Provenance` versions equal the recorded
versions; a BOM TXT whose `source_txt_sha256` is the accepted digest), `tests/orders-live.test.ts` and
`tests/order-detail.test.tsx` (withdrawn and superseded versions in the record; released then withdrawn vs current). `e2e/release.spec.ts` is the one happy path: build ORD048, sign as two demo people, release, see
the Team project id, find ORD048 in the pipeline's Released list and in Datasets. `npx playwright test` runs it
with the two earlier specs.

Not done here: the live adapters, 0007 and 0008 have not run against staging (the coordinator runs
`db/admin/test/staging.integration.mjs`); a withdrawn dataset leaves its order at Released (stages never move back
by themselves; the order page says it was withdrawn); demo builds use a synthetic export, not the TXT accepted in
the browser; the companion's `Provenance` sheet lists no signatures (they live in `admin.signature`, after the build).

Known limits (wave 2b review):

- **Abandoned uploads (finding 9).** Files are uploaded before the database records them, with no durable attempt
  record and no cleanup: a refused or failed `build_dataset` (including the 40001 rebuild) leaves its three files in
  `admin-files`, and a refused or failed `release_dataset` leaves the analysis file in `case-files` under a project id
  nobody owns; the retry uses a new project id. Users have no delete right in either bucket (by design), so these
  objects stay until a maintenance path (a dataset-bound reservation reused on retry, or a narrowly authorized
  collector) is built. They are never published: Team lists only files with a `pilot_files` row. The project-creation
  race the review describes (a pending upload checked against a project id another transaction is creating) is
  also open until such a reservation exists.
- **Team library compatibility (finding 5), pending a decision with Team's owner.** Team's library opens a selected
  `pilot_files` entry as a saved session archive (`state.json`); the released two-sheet XLSX is not one, so opening it
  from Team's library is refused. Not changed here.
- **No retirement signal in Team.** Withdrawing or superseding leaves the Team project and its file in place (Admin
  never updates or deletes Team rows); Admin's order page and Datasets show the retirement, Team does not yet.
- **Digests are computed by the app server.** The database checks that a manifest is complete, well-formed, bound to
  the order and fixed after the build, but cannot hash the stored objects itself; the server hashes what it uploads
  and compares existing objects byte for byte.

### Audit log

Staff route `/admin/audit-log` (brief: `docs/admin/admin-audit-log-brief.md`) reads `admin.audit_event`, which the
audit trigger writes on every INSERT/UPDATE of the admin tables (0003; `release_policy` in 0005) and only lab staff may
read (`audit_event_read`, 0004). No migration. A client user gets the staff screens' redirect to the client side.

- Newest first, 50 per page, **Older** / **Newest** links; keyset on `id` (`?before=<id>`), no offset.
- Each row: when (lab time, like every Admin screen), who, and one line built from `entity`, `action`, `before` and
  `after` (`Dataset ORD080 v1 released`, `Signature added to ORD080 v1 (Approved)`, `Order ORD080 moved to Registered`,
  `Release policy changed: 2 of Paula (simulated), Stephania (simulated)`, `Shipment received for ORD080`,
  `Sample ORD080-S001 registered`, `Results file accepted for ORD080`; anything else `<Entity> inserted|updated`).
  The summary expands (`<details>`) to the changed fields only: an update's fields whose value changed, before → after;
  an insert's non-empty fields except `id` and `created_at`. People and orders are shown by name, instants in lab
  time, nested objects as `{n fields}` / `[n items]`, long text cut at 120 characters.
- Who: the lab staff `display_name` (archived staff included), else for the signed-in user their own name or email
  (the session's), else `User <first 8 of the id>…`, and `System` when `actor` is null (service role, migrations).
  Other users' emails live in `auth.users`, which the app's token cannot read; showing them would need a
  SECURITY DEFINER function (a migration), not done.
- Filters in the URL: `?entity=<table>` and `?order=ORD080` (normalized to upper case by a redirect). The order filter
  matches the order's own events and, through `after->>order_id`, its shipments, samples, result files and datasets,
  and through `after->>dataset_id` the signatures of its datasets (one PostgREST `or=(…)`; the ids in it come from the
  database, the code from the URL is only used in `eq`). An unknown code says so.

| Module | Function | Live | Demo |
|---|---|---|---|
| `data/audit.ts` | `listAuditEvents(filters)` | `audit_event` (`select … order(id desc) limit 51`, `eq entity`, `lt id`, `or` for the order), then `lab_staff`, `dataset`, `order` for the names | events of the same shape derived from the demo store: the demo release policy (always), shipments, samples, accepted results, builds, signatures, releases, withdrawals and supersedes |

`src/lib/audit.ts` holds the pure summary, diff, actor and URL functions. Tests, test first: `tests/audit.test.ts`,
`tests/audit-seam.test.ts` (exact live query shape with a recording client, keyset, order scope, names; the demo
events), `e2e/audit.spec.ts` (demo: release ORD048, find it by entity and order, expand the changed fields, client
refusal). The pilot's step 7 (`e2e/live/pilot.spec.ts`) checks the release on staging.

Install/build the local library before installing the frontend:

```sh
npm ci --prefix ../../packages/admin-ingest
npm run build --prefix ../../packages/admin-ingest
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run e2e -- --list
npm run e2e
```

`tests/results.test.ts` covers the summary and stop override;
`tests/results-integration.test.ts` exercises the actual demo parse/accept boundary,
dictionary and cookie isolation. `e2e/results.spec.ts` is the single results journey,
using only the copied synthetic parser fixture with a sample-like blank variant.
Run E2E without Supabase variables (or with `ADMIN_MOCK=1`). No navigation changes
are included. Live RPC/storage/RLS verification must be run by the coordinator
against staging; this sandbox cannot reach it. See `verification/results-wave2.txt`
for local verification output and dependency limitations.
