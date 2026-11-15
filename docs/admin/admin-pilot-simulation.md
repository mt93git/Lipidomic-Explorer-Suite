# Admin pilot by simulation

Paula and Stephania cannot run the Admin pilot, so two synthetic personas run it for them, the way the Nexo pilot
was simulated (`tests/dual-ui/pilot/pilot_figure1.cjs`, `docs/integration/nexo-pilot-simulation.md`). The goal is
evidence that the whole release flow works **through the screens**, done by the roles the lab named, against the real
Admin staging stack and the Nexo staging API. Brief: `docs/admin/admin-pilot-simulation-brief.md`.

## What is simulated

| Persona | Account | Lab role |
|---|---|---|
| **Stephania (simulated)** | `steph.sim@admin-staging.test` | Owner |
| **Paula (simulated)** | `paula.sim@admin-staging.test` | Admin |

Everything is synthetic: the client **Pilot Simulation Client (synthetic)** and panel **Pilot Simulation Panel
(synthetic)**, a fresh order per run that Paula creates in New order (title `Admin pilot simulation <UTC minute> · run
<8 hex>`, chosen by the seed), three samples with FullNames `S1`, `S2`, `S3` in two groups (Control ×2, Treated ×1),
one batch (1 blank, the 3 samples, 1 pooled QC), and the results file
`packages/admin-ingest/test/fixtures/sciex-synthetic.txt` (one blank, one QC) with its Sample Name row renamed to
that batch's injections: `ORDnnn-S001…003` and the batch's `Blank_001` / `QC_001`, as SCIEX OS would name them after
running the exported sequence (`e2e/live/pilot-results.mjs`, `tests/pilot-results.test.ts`). No lab data, no real
person.

Files:

- `frontends/admin/e2e/live/pilot-seed.mjs`: creates what no screen can create yet (see the gaps). With the stack's
  service key it finds or creates the two GoTrue users (display names in `user_metadata`), their `admin.lab_staff`
  rows, the synthetic client and the synthetic panel (no Instruments & panels screen yet). It no longer inserts the
  order: it chooses this run's order title, the teardown's run marker. Each run sets a new generated password for both
  personas, removes their old TOTP factors and enrolls a fresh verified one (lab staff must pass two-step sign-in), and
  writes the passwords, TOTP secrets, names, client, panel and order title to the file named by
  `ADMIN_PILOT_CREDENTIALS` (mode 600). It prints no password, secret or key, archives nothing, deletes nothing but
  those factors, and changes no existing row: a persona whose `lab_staff` row is archived or has another role, or an
  archived client or panel, stops it with a message.
- `frontends/admin/e2e/live/pilot.spec.ts`: one serial Playwright spec, every step in the UI, by role and accessible
  name. Skipped unless `ADMIN_E2E_PILOT=1`.
- `frontends/admin/playwright.config.ts`: with `ADMIN_E2E_PILOT=1` it runs only the pilot spec, against
  `ADMIN_PILOT_BASE_URL`, and starts no dev server (`tests/playwright-config.test.ts`). Without it nothing changes.

## How to run it (coordinator)

The origin in `ADMIN_PILOT_BASE_URL` serves Admin at `/admin` (live mode, connected to the staging stack, with
`NEXT_PUBLIC_NEXO_URL` pointing at the Nexo staging app, e.g. `<origin>/nexo-staging`) and Nexo at `/nexo-staging`
(its API configured with `LIPIDOMIC_ADMIN_*` for the same stack, `docs/integration/admin-nexo-open.md`).

```sh
cd frontends/admin
export ADMIN_PILOT_CREDENTIALS=e2e/live/.pilot-credentials.local.json   # git-ignored; or a path outside the repo
export NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=…   # the anon key: factor enrolment and teardown
SUPABASE_SERVICE_ROLE_KEY=… node e2e/live/pilot-seed.mjs
ADMIN_E2E_PILOT=1 ADMIN_PILOT_BASE_URL=https://… npx playwright test   # sign-ins type the TOTP code from the file
# if nginx asks for a password in front of Nexo: ADMIN_PILOT_NEXO_USER=… ADMIN_PILOT_NEXO_PASSWORD=…
```

Run the seed before every run (each run needs its own order title). The service key needs `USAGE` on schema `admin`
and `SELECT, INSERT` on `client`, `lab_staff` and `panel` (`panel` is new with the batch steps; `"order"` is no longer
needed). The order, shipment, samples, batch, results and dataset are all written through the screens by the personas. Without
GoTrue/PostgREST behind one gateway, set `ADMIN_E2E_AUTH_URL` / `ADMIN_E2E_REST_URL` as for the live seed.

Screenshots (full page) land in `frontends/admin/e2e/live/pilot-evidence/` (git-ignored), one per step, numbered in
story order. The Playwright HTML report (`npx playwright show-report`) holds the trace of a failure.

## The story and what each step proves

| # | Step (who) | Evidence | What it proves |
|---|---|---|---|
| 1 | Stephania signs in; on **Release policy** unticks everyone, ticks Paula and herself, sets 2, saves | `01-policy.png` | Password and two-step (TOTP) sign-in of an Owner lands on the pipeline; the Owner can edit the policy through `admin.set_release_policy`; the saved policy reads back as exactly those two people |
| 2 | Paula signs in; **New order** for the synthetic client and panel with the run's title; **Receive shipment** from the created notice; **Sample registry** pastes three rows and registers them; **Batch builder**: "Select all of" the order, 1 blank, QC at the end, seed `pilot-<order>`, preview, save; **Batch run**: download the sequence and bench sheet CSVs, Mark exported, Mark acquired; **Ingest results** (from the acquired notice) uploads the TXT renamed to the batch's injections, parses, accepts; **Release → Build dataset v1** | `02-new-order.png`, `03-receive-shipment.png`, `04-sample-registry.png`, `05-batch-preview.png`, `06-batch-saved.png`, `07-batch-acquired.png`, `08-ingest-results.png`, `09-dataset-built.png`; `<batch>-sequence.csv`, `<batch>-bench-sheet.csv`, `<order>-results.txt` | An Admin can carry an order from creation to Excel built on the real RPCs and Storage: `create_order` (order at Request, code shown), codes `ORDnnn-S001…003` assigned by the database, `create_batch` (only this order's samples checked although staging may list others; 5 injections, Unknowns named by code with FullName only beside them), `mark_batch_exported` / `mark_batch_acquired` (order at Acquired; the sequence CSV holds each code once), the TXT accepted for the order's batch (order at Processed), and the build matched the code-named injections to the registry and recorded three files with their SHA-256 |
| 3 | Paula signs **Prepared** | `10-paula-signed.png` | 1 of 2 signatures; the page says one more signature by a different eligible person is needed; Paula can neither sign again nor release (button disabled) |
| 4 | Stephania signs **Approved** and **Releases** | `11-steph-signed.png`, `12-released.png`, `13-order-released.png` | Two different eligible people met the policy; the release uploaded the analysis file to Team's `case-files` with the signer's own token and created the Team project (its id is shown); the order detail reads **Release complete** |
| 5 | Stephania clicks **Open in Nexo** | `14-nexo-prepare.png`, `15-nexo-canvas.png`, `16-nexo-plot.png` | The link carries this dataset id; Nexo reads the released workbook from Admin's own record (first call 422 `preparation_choices_required`), the **Prepare dataset** dialog lists S1–S3 ticked (the build turned the code-named injections back into FullName headers) with Team's defaults (minimum detection 0, global, median, impute on); after confirming, the window title is `<ORDER> · v1` and the band shows the lipid count and 3 samples; **PCA scores · 2D** added from the library reaches *current* and draws; no error toast, and no console error other than the browser's report of the 422 |
| 6 | Stephania opens **Datasets** for the order | `17-datasets.png` | v1 is listed as Released with both signers (`Paula (simulated) · Prepared`, `Stephania (simulated) · Approved`) and the Open in Nexo link |
| 7 | Stephania opens the **Audit log** filtered by the order | `18-audit-log.png` | `admin.audit_event` read through the screen: the release (`Dataset <ORDER> v1 released`) has Stephania as actor, the signatures `(Prepared)` by Paula and `(Approved)` by Stephania; the release row expands to `Status built → released` (changed fields only, no JSON); `Order <ORDER> created` and `moved to Acquired` have Paula as actor (New order, the batch run) |

## Gaps found (screens that cannot do a step in live mode)

Not worked around in the spec; the seed creates only what the story needs to start.

1. ~~**Audit log**~~: closed. `/admin/audit-log` (brief `docs/admin/admin-audit-log-brief.md`) shows `admin.audit_event`
   with entity and order filters, and step 7 checks the release there. Left open: an actor who is not lab staff and is
   not the signed-in user shows as `User <id prefix>…`, not by email (`auth.users` is not readable with the app's token;
   a SECURITY DEFINER read would need a migration).
2. ~~**New order**~~: closed (wave 3). Paula creates the order in step 2; the seed only chooses its title.
3. **People / Clients** are not used by the pilot: lab staff rows, accounts and the synthetic client come from the seed.
   **Instruments & panels** has no screen (phase 2): the seed creates the synthetic panel.
4. **TOTP enrolment** through `/two-step-setup` is not exercised: the seed enrolls each persona's factor through
   GoTrue, and every pilot sign-in types the current code (as `e2e/live/live.spec.ts`).

## Side effects on staging

- Step 1 replaces the **current release policy of the staging lab** with "Paula and Stephania, 2 signatures"
  (`set_release_policy` archives the previous one, which stays in the history). Other staging releases then need
  these two personas; the Owner restores the policy on the Release policy screen after the run if needed.
- In `ADMIN_E2E_PILOT=1`, Playwright global teardown runs after success or failure. Global setup captures this run's
  order title from `ADMIN_PILOT_CREDENTIALS` (an older seed's `orderCode` still works); teardown signs in as Stephania
  with the anon key, finds the live order with that exact title (none: the run stopped before New order, nothing to
  do), withdraws its released dataset through `withdraw_dataset`, then archives, like the 0016 block of
  `db/admin/test/staging.integration.mjs`, the batch the order's aliquots were injected in (its injections, versions
  and the batch), then those aliquots, and last the order, all with `archived_reason = 'E2E pilot run finished'`. A
  batch that also holds another order's injections is refused and left alone. It never deletes rows or uses the
  service key for cleanup. The order is archived last, so a failed attempt leaves it live and a retry finds the rest
  again (the lookups do not filter on `archived_at`). The title is removed from the credential file only after
  cleanup succeeds; a refusal fails teardown and keeps it for retry (`ADMIN_E2E_PILOT=1
  ADMIN_PILOT_RUN_ORDER_TITLE="<orderTitle from the file>" node -e 'import("./e2e/live/pilot-teardown.mjs").then(m =>
  m.default())'` from `frontends/admin` with the same environment). Do not reseed over a failed cleanup's file.
- Samples, the shipment and the accepted results file stay under the archived order (as before). Each run uses one
  batch name `B<yyyy>-<nnn>` of the year's sequence; it stays taken after archiving.
- The fixed synthetic client, panel and both personas stay. The Team project, files, audit history and evidence screenshots
  stay; withdrawal revokes the dataset's Nexo access. Screenshots still capture the release before teardown.
- Each seed run resets both personas' passwords and replaces their TOTP factors.

## Not covered

- **Human judgement.** Whether these screens fit the lab's practice (wording, order of steps, what Paula and
  Stephania would check before signing, how a real shipment and registry are recorded) is not tested; only the lab
  can say. This is a functional simulation, not a usability study.
- **Real data.** One small synthetic export (3 samples, 33 analytes); real batch sizes, shared batches with other
  clients' samples, odd injection names and real SCIEX OS versions are not exercised.
- The client's side (a client member seeing the released order), withdraw and supersede on staging, opening the
  release from Team's library (wave 2b finding 5), the `/two-step-setup` screen, narrow screens (390 px).
- **Not run here.** The spec and the seed were written against the code and checked with `tsc`, lint and the existing
  suites; this sandbox cannot reach staging. The coordinator runs them. The batch steps (2026-11-10, New order →
  batch builder → batch run → code-named ingest, teardown of batch/aliquots) have not run on staging yet.
- The SCIEX OS sequence template (the generic CSV is used) and acquisition on a real instrument; the results TXT is
  the synthetic export renamed by the test, not produced by SCIEX OS from the downloaded sequence.

## Runs

- 2026-11-08, Admin staging + Nexo staging (API 27af8c47, frontend fddc335d), order ORD080: steps 1–6 passed
  (23.8 s), step 7 skipped (audit log screen is a placeholder). The first run (ORD079) passed steps 1–4 and failed
  step 5 on a test assumption (the dataset canvas already shows the plot library); fixed in 861e897d.
- 2026-11-08, same stacks, Admin 7cca953e with the audit log screen, order ORD082: **all 7 steps passed** (26.6 s);
  the order filter of `/audit-log` (PostgREST `or=(…)` on `after->>order_id`) works against staging.
- 2026-11-09, Admin e674a463 + Nexo staging API 97c431f4, with the new global setup/teardown: three runs. ORD135:
  **all 7 steps passed** (29.3 s); the teardown withdrew v1 and archived the order. ORD133 and ORD134 failed in step 2
  with a server action whose response never reached the browser (ORD133: still "Working…" after parsing; ORD134:
  `build_dataset` committed 1.4 s after the click, but the page stayed on "Building…" for 60 s); both orders were still
  archived by the teardown, which is what a failed run must do. ORD134's built (never released) v1 stays under its
  archived order.
- 2026-11-09, stall investigation (steps 1–2 only, straight to `/admin`, no proxy): the server answered each stalled
  action in ~0.2 s with its redirect and the browser received the whole response, but the client router never applied
  it (no request followed). With the side navigation prefetching (~20 RSC prefetches per page view, always some in
  flight at the click) 3 of 30 runs stalled; with `prefetch={false}` on the navigation links, 0 of 30. Strong but not
  conclusive evidence (p ≈ 0.04–0.12); the navigation no longer prefetches (`tests/nav-prefetch.test.tsx`).
- 2026-11-09, full pilot through the proxy after the navigation fix (9e672b18): 3 runs, 1 stalled in step 4 (sign →
  `?signed=1` never applied). Then next 15.5.29 / react 19.2.9 (433fe8a8, security and RSC-transport patches; the App
  Router uses Next's vendored React): 10 full runs, 9 passed all 7 steps, 1 stalled in step 2 (ORD209: the parse
  response arrived and the summary rendered, but the transition never settled, so "Accept" stayed disabled). The
  trace shows RSC prefetches of `/pipeline` and `/name-dictionary` from in-page links started 70 ms before the parse
  POST and still in flight when it left. Every traced stall so far overlaps an in-flight prefetch; the patch upgrade
  did not remove it. Remaining prefetchers: in-page `<Link>`s (brand, breadcrumbs, scope control, order cards, release
  version list, …). All runs' orders were archived by the teardown (staging dry run: nothing left to archive).
- 2026-11-09, no link prefetches anywhere (078a5077, `@/components/app-link`, lint ban on `next/link`): 10 full runs
  with traces kept, 0 prefetch requests in all 60 traces, and still 2 stalls (ORD213, ORD222: "Build dataset v1"
  answered 303 with `x-action-redirect`, the redirect was never applied). **Prefetching is not the cause.** Then a
  browser probe (an init script wrapping `fetch` that tees each action/RSC response and logs its chunks): 22 valid
  runs, **0 stalls** (5 more runs failed only because the SSH tunnels dropped). Without the probe the stall rate was
  about 4 in 23 full runs, so 0 of 22 by chance is ≈ 2 %. The probe only re-wraps the response and reads its body
  concurrently; Next hands the response unchanged to React's Flight client (`createFromFetch`), so the stall looks
  like a race in how the client consumes the action's response stream: Next/React, not Admin's code or the server.
  No error is logged on either side. The server action itself commits (a reload shows the new state), so the effect
  is a page that stays on "Working…" until reloaded, not lost or duplicated data.
- 2026-11-09, **Next 16 experiment** (branch `experiment/next16` = 58a49165, not for merge: next 16.4.5 built with
  `--webpack`, eslint-config-next left on 15.5.29 because the 16 config is flat-only; vitest 266/266, tsc clean). Run as
  a separate instance on the RTX (:3981, transient unit, stopped afterwards) against the same staging database:
  **20 full runs, 20 passed all 7 steps, 0 stalls**. On Next 15 the uninstrumented full runs stalled 4 of 23, so 0 of
  20 by chance is ≈ 2 %. Conclusion: the stall is fixed by Next 16's router. Upgrading is a deliberate task of its own
  (middleware → proxy convention, flat ESLint config, Turbopack vs the webpack font switch), not done here.
- 2026-11-09, **Admin moved to Next 16.4.5** (fc7cb3ce, deployed to staging `/admin`): `proxy.ts` instead of
  `middleware.ts`, Turbopack for dev and build (repository root as `turbopack.root`; the offline font switch is a
  `resolveAlias`), `allowedDevOrigins: ["127.0.0.1"]`, flat ESLint config. The 15.5 stall is the router regression
  vercel/next.js#86151 (from 15.5.1, fixed in 16.3); 15.4.x was not an option (30 open advisories, 3 critical). Checks:
  vitest 266/266, tsc, lint, demo Playwright 6/6 in parallel twice (Next 16 dev with webpack failed in parallel, with
  Turbopack it passes in half the time of 15.5), live E2E 2/2, and 5 full pilot runs on staging, all 7/7.
