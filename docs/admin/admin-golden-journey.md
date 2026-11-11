# Admin golden journey

One repeatable Playwright spec walks the lab platform's whole cycle through the screens with synthetic personas and
captures every step at desktop width and at 390 px, plus a video. Its screenshots feed the help manual, so each step
ends on a clean screen (no error banner, nothing pending). It is modelled on the pilot
(`docs/admin/admin-pilot-simulation.md`) and shares its personas, but where the pilot starts from a seeded client, the
journey starts from nothing: **the client lab, its people and the order are made by the screens**.

## The story (one run = one fictional client lab)

Run id `<UTC yyyymmdd-hhmm>-<4 hex>` (e.g. `20261110-2244-3fa9`), chosen by the seed. Everything derives from it:

| What | Value |
|---|---|
| Client lab | `Northwind Lipid Lab (synthetic) <run id>` |
| Contact | `Dana Reyes (simulated)`, `dana.sim+<run id>@admin-staging.test` |
| Colleague | `Lee Park (simulated)`, `lee.sim+<run id>@admin-staging.test` |
| Order title | `Northwind lipid screen (synthetic) <run id>` |
| Lab staff | Paula (simulated) Admin, Stephania (simulated) Owner: the pilot's two accounts, new password each run, no TOTP (two-step sign-in is off) |

| Instrument | `Journey LC-MS (synthetic) <run id>` (made on Instruments & panels) |
| Panel | `Journey panel (synthetic) <run id>` (made on Instruments & panels, on that instrument; the order is accepted on it) |
| Storage box | `JNY-<run id>` (made by the first placement on Storage; positions A1–A3) |

No real name, no Paula or SCD-lab data. The seed no longer creates a panel: the run makes its own through the screen.

## Files

- `frontends/admin/e2e/live/journey-seed.mjs`: staff personas (Paula, Stephania), the run id and Dana's and
  Lee's passwords, in `ADMIN_JOURNEY_CREDENTIALS` (mode 600, git-ignored). Creates **no** client, person or order. Refuses
  to run while the file still holds a run id (a run whose cleanup failed). Helpers in `seed-kit.mjs`; names and
  constants in `journey-run.mjs`. The pilot seed and teardown are untouched (tested and verified on staging).
- `frontends/admin/e2e/live/journey.spec.ts`: 18 serial tests (1–17 and 13b), one per persona and stage, by role and accessible name.
  Skipped unless `ADMIN_E2E_JOURNEY=1`.
- `frontends/admin/e2e/live/journey-nexo.ts`: every Nexo selector of tests 15-17 (the Prepare and Quality check screens,
  board, plot library, refusal text, toasts and console errors), taken from Nexo at commit 0a6748c8 (`frontends/nexo/src`,
  and its own browser tests `tests/dual-ui/test_nexo_dataset.cjs`, `test_nexo_entry_start_check.cjs`,
  `test_nexo_collab_real.cjs`). When Nexo's screens change again, this file is the only change.
- `frontends/admin/e2e/live/journey-setup.mjs` / `journey-teardown.mjs`: Playwright global setup and teardown.
- `frontends/admin/playwright.config.ts`: with `ADMIN_E2E_JOURNEY=1` only the journey spec, against
  `ADMIN_PILOT_BASE_URL`, no dev server, one worker, viewport 1440×900, `video: "on"`
  (`tests/playwright-config.test.ts`). Teardown and setup are covered by `tests/journey-teardown.test.ts`, the seed by
  `tests/journey-seed.test.ts` (against a stand-in GoTrue/PostgREST).

## How to run it (coordinator)

```sh
cd frontends/admin
export ADMIN_JOURNEY_CREDENTIALS=e2e/live/.journey-credentials.local.json   # git-ignored; or a path outside the repo
export NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=…           # anon key: factor enrolment, setup, teardown
SUPABASE_SERVICE_ROLE_KEY=… node e2e/live/journey-seed.mjs
ADMIN_E2E_JOURNEY=1 ADMIN_PILOT_BASE_URL=https://… ADMIN_JOURNEY_BASE_PATH=/admin-staging npx playwright test
```

- `ADMIN_JOURNEY_BASE_PATH` is Admin's base path (`src/lib/base-path.ts`); default `/admin`, staging `/admin-staging`.
  The spec never hard-codes it; `ADMIN_PILOT_BASE_URL` is the origin only.
- `ADMIN_JOURNEY_NEXO_PATH` is Nexo's path on the same origin as Admin; default `/nexo-staging`. Nexo is opened
  through Admin's Open in Nexo links (`NEXT_PUBLIC_NEXO_URL` of the Admin build), and the spec checks they lead to
  `<nexo path>/?dataset=<id>`. If the nginx password in front of Nexo is on, tests 16-17 need its credentials (the
  pilot's `ADMIN_PILOT_NEXO_USER` is not wired here yet). Admin staging needs `NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1`.
- `ADMIN_JOURNEY_COLLAB_ORIGIN` is the origin the Nexo build hard-codes for its collaboration service (e.g.
  `https://lipidomics.experimentalhidalgolab.com`; the endpoint is `<origin><nexo path>/collab`, `wss://` for the live
  channel and the same address over `https://` for REST). When the run goes through a local proxy as `ADMIN_PILOT_BASE_URL`
  (e.g. `http://127.0.0.1:3990`), those calls would leave it, reach the public host and fail ("Failed to fetch"
  once Open the Canvas creates the board's project). With this set, tests 16-17 route them back to the run's origin: REST is fetched there and
  answered with CORS headers for the page (preflights answered directly), and the WebSocket is bridged to the same path
  and query on the run's origin. Unset = no routing, for runs on the real origin.
- Without GoTrue/PostgREST behind one gateway set `ADMIN_E2E_AUTH_URL` / `ADMIN_E2E_REST_URL`, as for the pilot.
- The service key needs `USAGE` on schema `admin`, `SELECT, INSERT` on `lab_staff`. It is used only by the
  seed. Setup and teardown use Stephania's token, never the service key.
- Seed again before every run. A second run right after the first passes: the first run's teardown archived its client
  lab (new run id, new names, no collision). Request access allows 5 sends an hour per address and 3 a day per email,
  and the journey sends one, so more than 5 runs within an hour from one machine is refused by the form.
- Start it from `frontends/admin`. The evidence folder is `e2e/live/journey-evidence/` (git-ignored; override with
  `ADMIN_JOURNEY_EVIDENCE`).

## Captures

`shot(page, slug, …)` makes one step: `journey-evidence/desktop/<nn>-<slug>.png` (1440×900 viewport, full page) and
`journey-evidence/mobile/<nn>-<slug>.png` (the same page resized to 390×844, captured, resized back). Before a capture
the spec checks the screen is finished: no `role=alert` other than Next's route announcer (on Nexo pages only visible, non-empty alerts count, and only those inside an open modal; a failure lists their text), no `aria-busy`, network idle,
fonts loaded. Invitation links, password fields and two-step code fields are masked in screenshots (Playwright `mask`),
and an invitation link or code is drawn as dots in the video. `journey-evidence/steps.json` lists
`[{ n, slug, title, actor, area, url_path }]` for the manual (`area`: `client` = the client's own screens,
`lab` = the lab's back office, `analysis` = batch, results and release; `url_path` has no base path, no query, and
`/invite/<token>` instead of a link). `journey-evidence/files/` keeps the batch CSVs and results TXT the run used.
Videos: one per test in `journey-evidence/videos/<test>/video.webm`, in story order (Playwright clears that folder
at the start of each run). Screenshots and `steps.json` are cleared by the setup at the start of each run.

## Steps

| Test | Who | Screenshots (`<nn>-<slug>`) | What happens |
|---|---|---|---|
| 1 | Dana, signed out | 01 request-access-form, 02 request-access-sent | The public `/request-access` form for the new lab; "Request received." with the reference |
| 2 | Paula | 03 access-request-listed, 04 invitation-link-shown | People → Access requests: the request is listed; Review shows "A new client", the client name from the form, role Client admin (the first person's role); Approve shows the 7-day link once, read from the page |
| 3 | Dana | 05 dana-invitation, 06 dana-account-ready, 07 dana-sign-in, 08 dana-client-home | Opens the link, sets a password, signs in (no two-step code for a client), lands on Your orders |
| 4 | Paula | 09 invite-lee | People → Invite: Lee as Requester of the new client (the lab invites; a client portal screen to invite does not exist); the link is shown once and listed under Pending invitations |
| 5 | Lee | 10 lee-invitation, 11 lee-account-ready, 12 lee-sign-in, 13 lee-client-home | Accepts, signs in, sees the same client lab |
| 6 | Dana | 14 request-order-form, 15 request-sent | Request an order (panel: let the lab advise); "Request ORDnnn sent", shown as waiting for the lab |
| 7 | Paula | 16 instruments-panels, 17 panel-created, 18 shipping-instructions, 19 request-review, 20 request-accepted | Instruments & panels: adds the run's instrument, then the run's panel on it ("Instrument added.", "Panel added."); Shipping instructions (writes a synthetic text only if the lab has none); the order's "Accept this request?" with that panel agreed; Accept |
| 8 | Dana | 21 client-home-accepted, 22 client-order-accepted | The accepted order: step 2 "Send your samples" with the shipping instructions |
| 9 | Paula | 23 receive-shipment, 24 sample-registry, 25 batch-preview, 26 batch-saved, 27 storage, 28 storage-placed, 29 batch-exported, 30 batch-acquired, 31 ingest-parsed, 32 ingest-accepted, 33 qc-review, 34 qc-reviewed, 35 dataset-built | As the pilot's step 2: receive the shipment, register S1–S3 (`ORDnnn-S001…003`), Batch builder preview and save on the run's panel; **Storage**: the three aliquots (they exist once the batch is saved) are found by the search `ORDnnn-S`, each "Not in a box" (they also wait under "Waiting for a box", which lists the whole lab's, so the steps use the search table), then each is placed in box `JNY-<run id>`, positions A1–A3; back on the batch, download both CSVs, Mark exported, Mark acquired, Ingest results (the synthetic SCIEX export renamed to the batch, `pilot-results.mjs`); **QC review** `?order=ORDnnn`: three samples, all included, 0 excluded, then the optional "Mark QC reviewed" (no exclusions); Build dataset v1 (from QC reviewed) |
| 10 | Stephania | 36 release-policy | Release policy: Paula and Stephania, 2 signatures |
| 11 | Paula | 37 signed-prepared | Signs Prepared: 1 of 2, cannot release |
| 12 | Stephania | 38 signed-approved, 39 released, 40 order-released | Signs Approved (2 of 2) and Releases; the order reads Release complete |
| 13 | Paula | 41 deliverable-form, 42 deliverable-added | Adds a small synthetic CSV on the order's Deliverables and shows it to the client |
| 13b | Paula | 43 notifications | Notifications → Recent sends (lab Owner/Admin see it): one row per recipient for the run's events (Someone requests access, A client requests an order, My order request is answered, A dataset is released to Dana and to Lee), each Skipped with the error "Not on ADMIN_NOTIFY_ALLOW" (staging allows only `libreros-lab.invalid`, so nothing is sent). Only rows for the run's synthetic people are asserted; no switch is changed |
| 14 | Dana | 44 client-home-released, 45 client-order-released | The portal shows the released dataset v1 and the file to download |
| 15 | Paula | 46 nexo-switch-on | Clients → the run's client → Nexo access: "Turn Nexo access on"; the state reads On and "members prepare" stays Off (the lab prepares) |
| 16 | Paula | 47 nexo-prepare, 48 nexo-quality-check, 49 nexo-board, 50 nexo-plot | Datasets → Open in Nexo (new tab, `<nexo path>/?dataset=<id>`); as first opener Nexo opens its Prepare screen directly (no Start screen on a dataset link): "Prepare the data", S1–S3 ticked, "3 of 3 selected", "All settings are Team’s defaults.", Team's preview "… of N lipids kept"; "Prepare and check" ("Preparing with Team…", up to 180 s) → "Quality check": "Prepared by Team with your choices: N lipids, 3 samples.", each flagged sample kept ("Keep <sample>") until "Ready for the Canvas"; "Open the Canvas" → the board `<ORDER> · v1`: the band's "N lipids · 3 samples", the chip "Prepared by <name> · settings", "from Admin" in the top bar, no undecided-sample banner; "+ Add plot" → PCA scores · 2D, waited until it draws; no error toast or console error (expected, by URL: the first open's 422 on `/api/v1/datasets/sessions` and the 404 of the collab lookup `…/collab/projects?dataset=` before the project exists; any other is printed with its URL) |
| 17 | Dana | 51 client-open-in-nexo, 52 client-nexo-board | Her home shows Open in Nexo on the released dataset; it opens the shared board with no Prepare or Quality check screen on the way (the page's headings are recorded from the start): the band "N lipids · 3 samples" then "You can comment", the "Prepared by <name> · settings" chip, "from Admin", Paula's PCA plot drawn as an image; no "This dataset is not available to Nexo", no error toast |

Phase B (Instruments & panels, Storage, QC review, Notifications) and phase C (tests 15-17) are built. Test numbers
are unchanged (the new work sits inside tests 7 and 9, and test 13b); screenshots are numbered in story order.
Screenshots of Nexo use the same `shot`: Nexo's pages are captured at desktop and 390 px like Admin's. Masks are
painted in a neutral grey (`#c9ced6`), not Playwright's default magenta.

## Side effects on staging

- **Release policy.** Test 10 replaces the lab's current release policy (as the pilot does). Setup records the
  policy in force (`previousPolicy`: signers and count, or none) in the credential file before the run changes
  anything; the teardown puts it back, but only if the policy then in force is still the journey's (Paula and
  Stephania, 2). With no policy before, it sets "any Owner or Admin, 2 signatures", which is the same rule. Staging
  is shared with other runs that archive their throw-away staff, and `set_release_policy` refuses a signer who is no
  longer lab staff, so the teardown first reads the recorded signers' live `lab_staff` rows (owner, admin or operator,
  not archived) and keeps only those, with the recorded count capped to their number (it logs that). If fewer than 2
  remain (a policy needs at least 2 signatures), it leaves the journey's policy in force, logs "the previous policy's
  signers are no longer lab staff", and counts the part as done. The old policy rows stay in the history either way.
- **Shipping instructions.** Test 7 writes a synthetic text only when the lab has none (`previousShipping` null); the
  teardown clears it only if it is still exactly that text. A text the lab wrote is never touched.
- **Instruments & panels.** Test 7 adds the run's instrument and panel (`create_instrument`, `create_panel`; names carry
  the run id). The teardown archives the panel, then the instrument (`archive_panel`, `archive_instrument` with the
  reason "E2E golden journey finished"; an instrument with an active panel is refused, so the panel goes first). The
  rows stay, archived; orders and batches that used the panel keep it.
- **Storage.** Test 9 places the order's three aliquots in box `JNY-<run id>` (`place_aliquot`). The teardown removes
  the live placements (`remove_aliquot`, which archives the placement with the reason and keeps it in the history)
  before it archives the aliquots. No placement is deleted. Aliquots also gain their code (`ORDnnn-Snnn-An`, 0025).
- **QC review.** Test 9 marks the order QC reviewed (`mark_qc_reviewed`, a stage that does not move back); no
  exclusion is recorded. It sits under the archived order afterwards.
- **Notifications.** The app writes `notification_log` rows for the run's events (0028); nothing is sent while
  `ADMIN_NOTIFY_ALLOW` excludes the synthetic addresses. The spec only reads the Notifications screen and never changes
  a notification setting; the rows stay in the log.
- **Nexo switch.** Test 15 turns the run's client Nexo access on (0021 `set_client_nexo_access`). The RPC refuses an
  archived client ("Client is archived"), so the teardown turns it off **before** `archive_client`, if it is on. The
  switch is a stored flag on the client only; the Team project and Nexo's own store for the dataset stay (Nexo keeps
  the board Paula prepared and the PCA plot; withdrawing the dataset revokes access to it).
- **Teardown** (global, after success or failure, with Stephania's token): for the run's client lab, found by its
  name: its released dataset withdrawn; the batch (injections, versions, batch), the aliquots' storage placements
  removed and the aliquots and order archived (the pilot's walk, a batch shared with another order is refused); its client memberships archived (`archive_member`);
  pending invitations revoked (`revoke_invitation`); the client's Nexo switch turned off (`set_client_nexo_access`); the client archived (`archive_client`, last, as it refuses open
  orders); the run's panel and instrument archived (found by name); the run's access requests still pending (found with `list_access_requests`, the run id in the email or
  organisation) declined with the internal reason "E2E journey run finished" (`decline_access_request`, as the People
  screen does), so a run stopped after test 1 leaves nothing waiting for the next run's People screenshots; shipping
  text and release policy restored as above. Nothing is deleted. The run id in the credential file is
  the retry marker, removed only when every part succeeded; otherwise the teardown throws and the marker stays:
  `ADMIN_E2E_JOURNEY=1 ADMIN_JOURNEY_RUN_ID=<runId from the file> node -e 'import("./e2e/live/journey-teardown.mjs").then(m => m.default())'`
  from `frontends/admin` with the same environment. Do not reseed over a failed cleanup (the seed refuses).
- **Stays:** an approved access request (history; a declined one is erased after 90 days), the order's samples, shipment, results file and dataset records
  under the archived order, the Team project and files (withdrawal revokes Nexo access), the audit history, the
  uploaded deliverable, Dana's and Lee's sign-in accounts (their memberships are archived, so they see nothing), the
  year's batch name and order code, the personas, the evidence.
- Each seed resets Paula's and Stephania's passwords and removes any old TOTP factor (two-step sign-in is off).

## Email

The journey sends no email. Request access, approval and invitations create links shown on screen (the spec reads
them); accepting an invitation creates the account with the email already confirmed (`email_confirm: true`). The app's
own notifications (0028: access requested, order requested, request answered, dataset released) are logged per
recipient; on staging `ADMIN_NOTIFY_ALLOW` is `libreros-lab.invalid`, so the synthetic addresses are logged as
Skipped, "Not on ADMIN_NOTIFY_ALLOW", and test 13b asserts exactly that. The journey never changes notification
settings. If a row for a synthetic address ever reads Sent, stop and report. Forgot password (GoTrue SMTP) is never opened.

## Not covered

- **Tests 15-17 not run.** Written against Admin's real pages (`clients/[id]`, `datasets`, `client/home`) and, for
  Nexo, against the names in Nexo's code at 0a6748c8 (Prepare `ui/entry/PrepareScreen.tsx` and `ui/entry/strings.ts`,
  Quality check `ui/entry/CheckScreen.tsx`, the chip `ui/entry/BoardNotice.tsx`, the band `ui/StatusBand.tsx`, "from
  Admin" `ui/TopBar.tsx`, the flow `main.tsx`). An earlier run stopped at the old "Prepare dataset" dialog, which
  0a6748c8 no longer has. Points most likely to differ on staging: a quality check that is not "Ready for the Canvas"
  with Team's defaults, and the later opener's role (the band's "You can comment" assumes a client member joins as a
  commenter, as Nexo's `test_nexo_collab_real.cjs` shows); all live in `journey-nexo.ts`. Dana needs Nexo access on for her client and `NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1` in the build.
- **Not run (tests 1-14).** Written against the real pages (labels from `src/`), checked with `tsc`, lint, the unit suite, the demo
  Playwright suite and a throwaway run of steps 1, 2, 4 and 7's selectors against the demo app. The spec itself has
  not run on staging (this sandbox cannot reach it); the coordinator runs it. Most likely first failures: a label that
  differs live (the client list in Invite; the demo shows fixed clients), and
  Team project creation on release (step 12 asserts only the release notice and the order's
  Release complete).
- Lab sign-ins after the first reuse the session cookies of the first (no second code, no second wait); the sign-in
  screen is captured only for Dana and Lee.
- "members prepare" on (and a client member preparing), Nexo's sign-in and Start screens (a dataset link from Admin does not show Start; Paula and Dana are already signed in to Admin), the board's settings card and Keep / Exclude / Undo on the board, Nexo's "Live" pill (may show offline here, not asserted), a second plot or board edits, sharing between Dana and Lee; withdraw and supersede; the `/two-step-setup`
  screen; forgot-password; a declined request or access request; real batch sizes or SCIEX output.
- Human judgement on wording, order and what the lab would check; this is a functional run with synthetic people.
- The video shows the screens as they are: the lab's own People and Pipeline lists on staging can show other clients'
  names.
