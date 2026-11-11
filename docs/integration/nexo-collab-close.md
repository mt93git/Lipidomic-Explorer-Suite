# Nexo Phase 1B: closing note (2026-11-11)

Phase 1B added real-time collaboration and the entry screens to Nexo. This note says what shipped, which tests
prove it, what we checked in production on 2026-11-11, what is still open and how to roll back. The plan was
`nexo-collab-plan.md` (revision 2; decisions D1–D14 approved 2026-11-09; phases as cut in its section 5). The
entry contracts are in `nexo-entry-build.md`. Team's R code still computes every plot, statistic and export
(zero science change).

## 1. What shipped

| Item | What a person sees | Proving test (browser journey · unit) |
|---|---|---|
| F0 Spike | Two browsers move one card on one shared board | `test_nexo_collab_spike.cjs` · `nexo-collab/test/server.test.mjs`, `auth.test.mjs` |
| F1 Secure sessions in R | Every session route checks the caller; ids cannot be guessed or reused | `test_api_collab_auth.R`, `test_api_collab_session.R`, `test_api_revision.R`, `test_api_unknown_session.R` |
| F2 Shared board | Several people edit layout, labels, tabs and style live; each undoes only their own edits; flag off is unchanged | `test_nexo_collab_presence.cjs`, `test_nexo_collab_leave.cjs`, `test_nexo_collab_flagoff.cjs` · `collab/export.test.ts`, `history.test.ts`, `admission.test.mjs`, `expiry.test.mjs` |
| F3 Science changes in order | An input change runs once in R and shows "Updated by X" for the others | `test_nexo_collab_inputs.cjs` (real R) · `commits.test.mjs`, `collab/intents.test.ts` |
| F4 Versions | Named versions and autosaves; restore keeps a "Before restore" version; Undo brings it back | `test_nexo_collab_versions.cjs` (real R) · `versions.test.mjs`, `collab/versions.test.ts`, `backup.test.mjs` |
| F5 Roles and sharing | Owner, Editor, Commenter, Viewer; Share dialog; a client's project lives in the client's workspace | `test_nexo_collab_real.cjs` (real R) · `roles.test.mjs`, `collab/roles.test.ts`, `ui/Dialogs/Share.test.tsx` |
| F6 Comments, follow, summon | Pins on cards, threads, mentions; follow a presenter and bring everyone here | `test_nexo_collab_follow.cjs` · `collab/comments.test.ts`, `collab/follow.test.ts` |
| F7 Offline and phones | Edits made offline merge back; phones see avatars and follow, read-only unless the role allows edit | `test_nexo_collab_offline.cjs` · `collab/providerOffline.test.ts` |
| Entry screens | Start → Prepare → Check → board; the quality check warns and never blocks; the board banner until a flagged sample is decided | `test_nexo_entry_flow.cjs`, `test_nexo_entry_start_check.cjs` · `ui/entry/*.test.tsx`, `test_api_dataset_entry.R`, `test_api_dataset_quality.R`, `test_api_dataset_upload.R`, `projects.test.mjs`, `decisions.test.mjs` |
| Admin sign-in | Nexo signs in with the Admin account (two-step code when on); one sign-in serves Admin and Nexo | `test_nexo_entry_flow.cjs` (signed out → sign in) · `api/adminSignIn.test.ts`, `ui/entry/SignInScreen.test.tsx` |

Browser journeys and R tests live in `tests/dual-ui/`; `collab/`, `ui/` and `api/` are under `frontends/nexo/src/`; the
`*.test.mjs` files are the sidecar's (`frontends/nexo-collab/test/`). The Admin sign-in route is in the Admin app (contract
C1); this repository tests the Nexo side against Admin's answers.

## 2. Contracts kept

| Contract (plan section) | What it promises | Tests that pin it |
|---|---|---|
| Authorization (2.1) | Only two identities: a person with an Admin token, or the sidecar's scoped service token (one workspace, one project, loopback only). No route takes a session id alone. Roles are enforced by the sidecar, not the page | `test_api_collab_auth.R` (raw HTTP, two identities, previous generation → 409), `auth.test.mjs`, `admission.test.mjs` (Viewer and protected-path updates refused whole), `expiry.test.mjs` (4401/4403 closes, Admin outage keeps the socket), `roles.test.mjs` |
| Science commits (2.2, as cut) | Changes to inputs, actions, settings, statistics and Finish go to R one at a time per project, with an intent id; the settled values land in the document in one server transaction; a stale render is never shown as current | `commits.test.mjs` (order, refusals, R not called when refused, retry with the same intent id), `test_api_revision.R` (revision headers, stale worker drawn on main), `test_api_collab_session.R` (leases, capacity), `test_nexo_collab_inputs.cjs` |
| Bridge and exporter (2.3) | The shared board exports the same Team JSON in every browser; each person's undo is their own; with the flag off, Nexo behaves as before and loads no collaboration code | `collab/export.test.ts` (round trip on real fixtures, limits, repairs), `collab/history.test.ts`, `test_nexo_collab_presence.cjs` (both exports equal, `savedActive` included), `test_nexo_collab_flagoff.cjs` |
| Versions (2.4, as cut) | Versions are sidecar rows that point at checkpoints R stores; restore saves "Before restore" first, reopens R from the version and replaces the board; the version opens in Team | `versions.test.mjs`, `collab/versions.test.ts`, `test_nexo_collab_versions.cjs` (opens in Team via R), `test_api_checkpoint_scope.R`, `test_api_import_checkpoints.R` |

## 3. Evidence on this host (2026-11-11)

Run on base `05952885` (the integration tip before FIX-PROD-F) with `LIPIDOMIC_ADMIN_REQUIRE_USER` unset.
FIX-PROD-F (`a4981ec5`, one merge later) was checked separately: the full vitest suite on that commit is in the
last row.

| Suite | Command | Result |
|---|---|---|
| Client unit (vitest) | `cd frontends/nexo && npx vitest run` | 190 files, **1187 passed**, 0 failed |
| Sidecar unit (node:test) | `cd frontends/nexo-collab && npm test` | **238 passed**, 0 failed, 0 skipped |
| R API | `Rscript --vanilla tests/dual-ui/test_api_<name>.R`, all 63 files, one after the other | **61 PASS** (486 PASS lines), **2 SKIP**, **0 FAIL**; every file exited 0 |
| Collab browser journeys | `node tests/dual-ui/test_nexo_collab_<name>.cjs`, all 10, Chromium then WebKit | **10/10 green in both engines**, 0 FAIL lines (table below) |
| FIX-PROD-F (`a4981ec5`) client unit | full vitest on that commit | 190 files, **1188 passed**, 0 failed |

R skips, all by design: `test_api_stress` and the 50-render budget case of `test_api_cache` (timing budgets run only
with `NEXO_API_PERF=1`), `test_api_violin_speed` (package png is not installed on this host). `test_api_dataset_http`,
the known load flake, passed on its first run this time, with the browser journeys running at the same time.
`test_api_render_disk_cache` skipped in the first run only because that copy of the tree had no git history (its
cache key is the code commit); run again in the git checkout it gave 7 PASS.

| Browser journey | Chromium | WebKit |
|---|---|---|
| `test_nexo_collab_spike.cjs` (F0, and flag off loads no collaboration) | 6 PASS | 6 PASS |
| `test_nexo_collab_flagoff.cjs` (F2, flag off) | 2 PASS | 2 PASS |
| `test_nexo_collab_presence.cjs` (F2) | 17 PASS | 17 PASS |
| `test_nexo_collab_leave.cjs` (F2) | 3 PASS | 3 PASS |
| `test_nexo_collab_inputs.cjs` (F3, real R) | 13 PASS | 13 PASS |
| `test_nexo_collab_versions.cjs` (F4, real R) | 6 PASS | 6 PASS |
| `test_nexo_collab_real.cjs` (F5, real R) | 15 PASS | 15 PASS |
| `test_nexo_collab_follow.cjs` (F6) | 11 PASS | 11 PASS |
| `test_nexo_collab_offline.cjs` (F7) | 13 PASS | 13 PASS |
| `test_nexo_collab_harness.cjs` (the real-path harness itself, no browser) | 2 PASS | — |

The whole browser run took 13 minutes. `test_nexo_collab_real.cjs` prints one sidecar line at teardown,
`{"engine":"R answered 502", …}`: the harness stops R before the sidecar, so this is expected and not a failure.

## 4. Production verification (2026-11-11)

Checked today by the person running the release; facts only.

- **What runs.** Production serves Nexo with collaboration: the client, the R API with sign-in required, and the
  collaboration sidecar, behind nginx. Team is retired: the site root and `/team` redirect to `/nexo/`. Team's pilot
  database was stopped after a final encrypted backup, and that backup was restore-tested.
- **Golden journey on staging, through the real host: 18/18.** Admin request → release → Nexo prepare → the client opens
  the shared board. It was run again after every fix below. (The journey script is kept with the staging tools, not in
  this repository.)
- **On production**, with a lab staff account and a synthetic test project: comments with pins; versions saved and
  restored (a restore keeps a "Before restore" version); the Share dialog; a live board with presence. The lab's
  19 existing checkpoints were imported and each one opens (counted, not named).
- **Fixes found in production and shipped the same day:**

| Fix | What changed | Test |
|---|---|---|
| FIX-PROD-A | Avatar uses the Admin display name; opening and Fit frame every card | `api/adminToken.test.ts`, `ui/Presence/Avatars.test.tsx`, `canvas/overview.test.ts`, `test_nexo_canvas_open.cjs`, `test_nexo_collab_presence.cjs` |
| FIX-PROD-B | Prepare's title names its dataset; a client's empty Start names their group; the sidecar handles an empty R answer | `main.test.tsx`, `ui/entry/StartScreen.test.tsx`, `engine.test.mjs`, `test_api_dataset_route.R` |
| FIX-PROD-C | Batch (BQC) cards show Team's message; the records-limit pill text; an old exclusion can be included again | `bqcPlaceholder.test.ts`, `test_api_bqc_placeholder.R`, `ui/topBarWarning.test.ts`, `test_api_record_warning.R`, `test_api_dataset_include_again.R`, `decisions.test.mjs`, `ui/entry/BoardNotice.test.tsx` |
| FIX-PROD-D | A live project made from a folder checkpoint opens its R session | `test_api_collab_auth.R` |
| FIX-PROD-E | Others see the person's Admin name (card tag and comments); Share says "Lab staff can open this project." when there is no client; Copy link says "Link copied" | `admission.test.mjs`, `projects.test.mjs`, `roles.test.mjs`, `ui/Dialogs/Share.test.tsx`, `test_nexo_collab_presence.cjs` |
| FIX-PROD-F | Start names a checkpoint project after its checkpoint | `ui/entry/StartScreen.test.tsx`, `test_nexo_entry_start_check.cjs` |

## 5. Known limits and open items

| Item | Status |
|---|---|
| `test_api_dataset_http.R` fails under CPU load ("written > 0 is not TRUE") and passes alone | Known test flake, base tree too; not a product fault |
| Saved versions also appeared as checkpoints on Start | Fixed (FIX-PROD-G): a record created by a collab save is marked `version` and Start leaves it out (`test_api_storage.R`, `ui/entry/StartScreen.test.tsx`, `test_nexo_entry_start_check.cjs`). Versions saved before the fix carry no mark and still show |
| Sharing with a second person was not exercised in production | Covered on staging by the golden journey with synthetic people; do it on production with the first real share |
| Backup is not taken with saves paused | Plan section 6 asks for a loopback pause route so version rows and checkpoint files always agree; the sidecar has none. `backup.mjs` copies SQLite safely (WAL) and then the store; a save during that copy can leave a row whose checkpoint file is missing from the copy. Backups run at a quiet hour (03:40, see the next row) until this exists |
| Scheduled backup | Fixed: backups now run daily. `OS/Linux/nexo-collab-backup.timer` (03:40) starts `nexo-collab-backup.service` (`backup.mjs backup`, then `prune <backup-dir> 14`); `deploy-nexo.sh` installs and enables both with `NEXO_COLLAB=1`. A restore drill was run on 2026-11-11: 7 projects, 7 documents and 7 versions restored |
| No restore-drill write-up | The plan put the drill in `frontends/nexo-collab/README.md`; that file does not exist. Section 6 below is the short version |
| Deploy kit assumed Team and a site password | Fixed: `OS/Linux/deploy-nexo.sh` no longer checks Team. Through nginx, without an Admin session, it requires `/nexo/` 200, `/api/v1/health` 404 (blocked publicly) and `POST /api/v1/sessions` 401 (`OS/Linux/test-deploy-auth-check.sh`) |
| The deploy script's `/collab` check did not match the snippet | Fixed: the script now looks for `location /collab {`, as the snippet ships it; `location /collab/ {` fails the check (`OS/Linux/test-deploy-auth-check.sh`) |
| The deploy script did not restart the sidecar | Fixed: with `NEXO_COLLAB=1` it restarts the sidecar once the API is healthy. Units with placeholders (sidecar, backup) are copied only when none is installed, and the deploy stops while an installed unit still holds a placeholder |
| Phase 3 as cut: no commit log, no crash re-drive | By the plan's cut, a change pending when the sidecar restarts is refused with "please redo"; retries rely on R's intent ids |
| Plan section 9 single-user bugs B1–B7 | All seven fixed, each with a test: B1 `test_api_revision.R`, B2 `test_api_session.R` and `test_api_unknown_session.R`, B3 `test_api_collab_auth.R`, B4 `ui/sessionRecovery.test.ts`, B5 `test_api_storage.R`, B6 `test_api_pool.R`, B7 `api/open.test.ts` (Retry-After, 180 s deadline); nothing open |
| Not built on purpose | Fork / "Save as" (D3), votes (D5) |

## 6. Rollback and operations

The deploy kit is not part of this pull request; it lives on the Nexo deploy branch, in `OS/Linux/`: `deploy-nexo.sh` (run from the deploy checkout with `NEXO_RSCRIPT` set; builds the
client, installs the API unit, and with `NEXO_COLLAB=1` the sidecar and backup units, restarts the sidecar; checks
health, the nginx `/collab` WebSocket block and the public statuses), `lipidomic-api.service`, `nexo-collab.service`,
`nexo-collab-backup.service`, `nexo-collab-backup.timer`, `nexo-collab.env.example` and `nginx-nexo-locations.conf`.
Secrets live only in the units' environment files (mode 600) on the server, never in git. The site-root and `/team` redirects are in the server's nginx
config, not in the snippet.

**Backup the sidecar.** `frontends/nexo-collab/scripts/backup.mjs` (tested by `backup.test.mjs`):

```sh
node <server-home>/<repo>/frontends/nexo-collab/scripts/backup.mjs backup <collab.sqlite> <checkpoint-store> <backup-dir>
node <server-home>/<repo>/frontends/nexo-collab/scripts/backup.mjs prune <backup-dir> 14
```

`<collab.sqlite>` is the sidecar's `COLLAB_DB`; `<checkpoint-store>` is the R API's checkpoint store
(`LIPIDOMIC_STORAGE_DIR`). Each backup is a time-stamped folder with `collab.sqlite` and `store/`.

**Restore.**

1. Stop the sidecar unit (and the API unit, so nothing writes to the store).
2. `node …/backup.mjs restore <backup-dir>/<timestamp> <scratch-dir>`: it copies into an empty scratch directory and
   refuses to overwrite.
3. Check the copy (start a scratch sidecar and API on it, list a project's versions, open one).
4. Move the live `collab.sqlite` and store aside, put the scratch copies in their place, start the API, then the sidecar.

**Roll back the code.** Check out the last good commit in the deploy checkout and run `deploy-nexo.sh` again (with
`NEXO_COLLAB=1`; it restarts the sidecar). Rolling back the sidecar's SQLite schema means restoring a backup, never
editing the file by hand. **Turn collaboration off** without a rollback: build the client without `VITE_COLLAB_URL`;
Nexo then runs single-user, as before Phase 1B (`test_nexo_collab_flagoff.cjs`); shared boards and their versions stay
in the sidecar's database until it is turned on again. **Bring Team back** (not planned): remove the two
redirects from the server's nginx config, start Team again and restore its pilot database from the final encrypted
backup (that restore was tested).
