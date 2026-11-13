# Admin showcase seed (staging)

One script fills Admin staging with synthetic clients and orders parked at every point of the pipeline, so Gerardo and
the lab can open every screen and see data. It lives next to the other seeds: `frontends/admin/e2e/live/demo-seed.mjs`,
with its plan (names, samples, which order stops where, the synthetic files) in `demo-plan.mjs`, covered by
`frontends/admin/tests/demo-seed.test.ts`. Everything is synthetic and ends in ` (demo)`; accounts are on
`admin-staging.test`.

## What it makes

| Who / what | How |
|---|---|
| Demo Staff (demo), `demo.staff@admin-staging.test`, lab Admin | service key (GoTrue user, `lab_staff` row): does every lab step |
| Demo Approver (demo), `demo.approver@admin-staging.test`, lab Owner | service key: the second signer |
| Demo Lipid Panel (demo) | `create_panel` (Demo Staff) |
| Harbor Lipid Lab (demo), Cedar Cardio Group (demo), Atlas Nutrition Core (demo) | `submit_access_request` (service key, as the public Request access page), `approve_access_request` (Demo Staff, new client), `accept_my_invitation` (the member) |
| One requester per client, `<harbor\|cedar\|atlas>.demo@admin-staging.test` | named after the access request (0023) |

| # | Order | Parked at | Steps (all admin RPCs, each with the actor's own token) |
|---|---|---|---|
| 1 | Plasma lipid screen, spring cohort (demo) | Request, pending review | `request_order` (member) |
| 2 | Serum ceramide panel, pilot (demo) | Request, accepted | + `accept_order` |
| 3 | Liver tissue lipidome, diet study (demo) | Received | + `receive_shipment` |
| 4 | Plasma fasting vs fed (demo) | Registered | + `register_samples` |
| 5 | Serum statin follow-up (demo) | **Registered** (asked: Extracted) | as 4. No RPC moves an order to Extracted: `create_batch` records the extraction (it creates the aliquots) and moves the order straight to In batch |
| 6 | Liver tissue time course (demo) | In batch | + `create_batch`, `place_aliquot` |
| 7 | Plasma omega-3 supplementation (demo) | Acquired | + `mark_batch_exported`, `mark_batch_acquired` |
| 8 | Serum lipoprotein fractions (demo) | Dataset built, 1 of 2 signatures | + upload, `accept_result_file`, uploads, `build_dataset`, `sign_dataset` (Demo Staff) |
| 9 | Liver tissue knockout comparison (demo) | Released, CSV deliverable visible to the client | + `sign_dataset` (Demo Approver), `release_dataset`, upload, `add_deliverable` |
| 10 | Plasma oxylipin screen (demo) | Declined | `request_order`, `decline_order` |

Storage: the 32 aliquots of orders 6 to 9 sit in `Demo freezer box 1 (demo)`, fixed slots from A1. The results file is
`frontends/admin/e2e/fixtures/sciex-synthetic.txt` renamed to the batch (one column per injection, Unknowns by sample
code); the dataset is built with `@lipidomic/admin-ingest` exactly as `src/lib/release-build.ts` builds it, so
`packages/admin-ingest` must be built first (`npm ci && npm run build` there, `npm ci` in `frontends/admin`).

**Release policy.** If the current policy does not let Demo Staff and Demo Approver sign and release, Demo Approver
widens it for the run (the two added, 2 signatures) and puts the recorded policy back at the end. Until it is back,
the policy to restore stays in the credentials file and the next run (or `--reset`) restores it first.

## Run it

From `frontends/admin`, with the staging environment (never committed): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `ADMIN_E2E_AUTH_URL` / `ADMIN_E2E_REST_URL` /
`ADMIN_E2E_STORAGE_URL`.

```sh
node e2e/live/demo-seed.mjs --dry-run                                                   # the plan; no env, no network
ADMIN_DEMO_CREDENTIALS=e2e/live/.demo-credentials.local.json node e2e/live/demo-seed.mjs  # create or complete
ADMIN_DEMO_CREDENTIALS=e2e/live/.demo-credentials.local.json node e2e/live/demo-seed.mjs --reset
```

- **Idempotent.** An order is found by its client and title; a run takes only the steps it still lacks, so a second
  run adds nothing and an interrupted run resumes.
- **Passwords.** Each run gives the five demo accounts new generated passwords (and removes any TOTP factor: two-step
  sign-in is off) and writes them only to `ADMIN_DEMO_CREDENTIALS` (mode 600, git-ignored `e2e/live/.demo-credentials*.json`).
  Nothing secret is printed. Sign in to Admin as any of them with the file's password.
- **`--reset`** archives, never deletes: withdraws the released dataset, retires the deliverable, takes the aliquots out
  of the box, archives batches, aliquots, orders and memberships, renames each demo client
  `… (demo, archived <UTC>)` (client names are unique) and archives it. The accounts, the panel and the policy stay.
  The next run creates everything again with new order codes.
