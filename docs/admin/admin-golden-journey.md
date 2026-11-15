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
| Lab staff | Paula (simulated) Admin, Stephania (simulated) Owner: the pilot's two accounts, new password and TOTP each run |

No real name, no Paula or SCD-lab data. The lab also needs the pilot's panel `Pilot Simulation Panel (synthetic)`
(the seed creates it; there is no Instruments & panels screen yet).

## Files

- `frontends/admin/e2e/live/journey-seed.mjs`: staff personas (Paula, Stephania), the panel, the run id and Dana's and
  Lee's passwords, in `ADMIN_JOURNEY_CREDENTIALS` (mode 600, git-ignored). Creates **no** client, person or order. Refuses
  to run while the file still holds a run id (a run whose cleanup failed). Helpers in `seed-kit.mjs`; names and
  constants in `journey-run.mjs`. The pilot seed and teardown are untouched (tested and verified on staging).
- `frontends/admin/e2e/live/journey.spec.ts`: 14 serial tests, one per persona and stage, by role and accessible name.
  Skipped unless `ADMIN_E2E_JOURNEY=1`.
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
- Without GoTrue/PostgREST behind one gateway set `ADMIN_E2E_AUTH_URL` / `ADMIN_E2E_REST_URL`, as for the pilot.
- The service key needs `USAGE` on schema `admin`, `SELECT, INSERT` on `lab_staff` and `panel`. It is used only by the
  seed. Setup and teardown use Stephania's token, never the service key.
- Seed again before every run. A second run right after the first passes: the first run's teardown archived its client
  lab (new run id, new names, no collision). Request access allows 5 sends an hour per address and 3 a day per email,
  and the journey sends one, so more than 5 runs within an hour from one machine is refused by the form.
- Start it from `frontends/admin`. The evidence folder is `e2e/live/journey-evidence/` (git-ignored; override with
  `ADMIN_JOURNEY_EVIDENCE`).

## Captures

`shot(page, slug, …)` makes one step: `journey-evidence/desktop/<nn>-<slug>.png` (1440×900 viewport, full page) and
`journey-evidence/mobile/<nn>-<slug>.png` (the same page resized to 390×844, captured, resized back). Before a capture
the spec checks the screen is finished: no `role=alert` other than Next's route announcer, no `aria-busy`, network idle,
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
| 7 | Paula | 16 shipping-instructions, 17 request-review, 18 request-accepted | Shipping instructions (writes a synthetic text only if the lab has none); the order's "Accept this request?" with the panel agreed; Accept |
| 8 | Dana | 19 client-home-accepted, 20 client-order-accepted | The accepted order: step 2 "Send your samples" with the shipping instructions |
| 9 | Paula | 21 receive-shipment, 22 sample-registry, 23 batch-preview, 24 batch-saved, 25 batch-exported, 26 batch-acquired, 27 ingest-parsed, 28 ingest-accepted, 29 dataset-built | As the pilot's step 2: receive the shipment, register S1–S3 (`ORDnnn-S001…003`), Batch builder preview and save, download both CSVs, Mark exported, Mark acquired, Ingest results (the synthetic SCIEX export renamed to the batch, `pilot-results.mjs`), Build dataset v1 |
| 10 | Stephania | 30 release-policy | Release policy: Paula and Stephania, 2 signatures |
| 11 | Paula | 31 signed-prepared | Signs Prepared: 1 of 2, cannot release |
| 12 | Stephania | 32 signed-approved, 33 released, 34 order-released | Signs Approved (2 of 2) and Releases; the order reads Release complete |
| 13 | Paula | 35 deliverable-form, 36 deliverable-added | Adds a small synthetic CSV on the order's Deliverables and shows it to the client |
| 14 | Dana | 37 client-home-released, 38 client-order-released | The portal shows the released dataset v1 and the file to download |

`// PHASE B` markers in the spec: Storage placement (after the samples are registered) and QC review (after ingest).
`// PHASE C` after test 14: the lab turns Nexo on for the client, Dana opens the dataset in Nexo. None is built yet;
the step numbers will shift when they are added.

## Side effects on staging

- **Release policy.** Test 10 replaces the lab's current release policy (as the pilot does). Setup records the
  policy in force (`previousPolicy`: signers and count, or none) in the credential file before the run changes
  anything; the teardown puts it back, but only if the policy then in force is still the journey's (Paula and
  Stephania, 2). With no policy before, it sets "any Owner or Admin, 2 signatures", which is the same rule. The old
  policy rows stay in the history either way.
- **Shipping instructions.** Test 7 writes a synthetic text only when the lab has none (`previousShipping` null); the
  teardown clears it only if it is still exactly that text. A text the lab wrote is never touched.
- **Teardown** (global, after success or failure, with Stephania's token): for the run's client lab, found by its
  name: its released dataset withdrawn; the batch (injections, versions, batch), aliquots and order archived (the
  pilot's walk, a batch shared with another order is refused); its client memberships archived (`archive_member`);
  pending invitations revoked (`revoke_invitation`); the client archived (`archive_client`, last, as it refuses open
  orders); shipping text and release policy restored as above. Nothing is deleted. The run id in the credential file is
  the retry marker, removed only when every part succeeded; otherwise the teardown throws and the marker stays:
  `ADMIN_E2E_JOURNEY=1 ADMIN_JOURNEY_RUN_ID=<runId from the file> node -e 'import("./e2e/live/journey-teardown.mjs").then(m => m.default())'`
  from `frontends/admin` with the same environment. Do not reseed over a failed cleanup (the seed refuses).
- **Stays:** the access request (approved history), the order's samples, shipment, results file and dataset records
  under the archived order, the Team project and files (withdrawal revokes Nexo access), the audit history, the
  uploaded deliverable, Dana's and Lee's sign-in accounts (their memberships are archived, so they see nothing), the
  year's batch name and order code, the pilot panel and personas, the evidence.
- Each seed resets Paula's and Stephania's passwords and replaces their TOTP factors.

## Email

The journey sends no email. Request access, approval and invitations create links shown on screen (the spec reads
them); accepting an invitation creates the account with the email already confirmed (`email_confirm: true`). The only
screen that sends email is Forgot password (GoTrue SMTP), which the spec never opens. If a step ever starts sending
email, stop and report; do not enable notifications.

## Not covered

- **Not run.** Written against the real pages (labels from `src/`), checked with `tsc`, lint, the unit suite, the demo
  Playwright suite and a throwaway run of steps 1, 2, 4 and 7's selectors against the demo app. The spec itself has
  not run on staging (this sandbox cannot reach it); the coordinator runs it. Most likely first failures: a label that
  differs live (the client list in Invite; the demo shows fixed clients), the 30 s TOTP wait on the first sign-in of each
  lab persona, and Team project creation on release (step 12 asserts only the release notice and the order's
  Release complete).
- Lab sign-ins after the first reuse the session cookies of the first (no second code, no second wait); the sign-in
  screen is captured only for Dana and Lee.
- Phases B and C (see above); Open in Nexo (neither lab nor client side); withdraw and supersede; the `/two-step-setup`
  screen; forgot-password; a declined request or access request; real batch sizes or SCIEX output.
- Human judgement on wording, order and what the lab would check; this is a functional run with synthetic people.
- The video shows the screens as they are: the lab's own People and Pipeline lists on staging can show other clients'
  names.
