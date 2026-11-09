# Nexo H9 review: wave 2 "beyond Team" and the render pool

Role: REVIEWER (read-only, no fixes). Base: nexo/phase1 at d35d458.
Ranges: A = 80c1814a..756a2611 (wave 2 and follow-ups), B = 756a2611..508abc8c (cold open, render pool).
Method: static reading only. R cannot run here (no R on the M1), and this worktree has no
`frontends/nexo/node_modules`, so vitest/tsc were **not** run. Every finding is static; "unverified" marks
claims that depend on runtime behaviour of Team, callr or later that I could not confirm from the code.

Verdict: **CHANGES_REQUIRED**. Two P1s in `pool.R`. With the pool on, both turn a working card into an
error (a 400, or a false 409 session_lost). Neither draws a wrong plot. I found no path where a worker's
result is stored in the main caches under a key it does not match: `api_pool_finish` re-checks both keys.
One possible wrong-plot path is listed as P2, unverified (state checked by record, not by live input).

## Findings

| # | Sev | File:line | One line |
|---|---|---|---|
| 1 | P1 | R/frontends/api/pool.R:85 (+ cards.R:117, 224) | A card with a computed control (customCol_/customShape_/bqcSamples) fails with **400** whenever a worker draws it: the worker's `api_card_create` validates `explicit` against `allowedInputs` only |
| 2 | P1 | R/frontends/api/pool.R:90, 237 | A worker-side `session_lost` (flush >120 s marks the **worker's** session broken) is forwarded as **409 session_lost** for a healthy main session, and the broken worker keeps returning 409 for every later job |
| 3 | P2 | R/frontends/api/pool.R:226 (+ prepare :128-135) | A worker that is **busy** when `api_pool_prepare` moves it to another checkpoint never reopens: it stays idle under the new sha, refuses every job ("holds another checkpoint") and only costs a round-trip |
| 4 | P2 | R/frontends/api/pool.R:193-229 | `api_pool_tick` has no error guard: an error (e.g. `callr::r_session$new` failing in `api_pool_restart` under memory pressure) leaves `ticking = FALSE` with no reschedule; promises of busy jobs hang until another render arrives |
| 5 | P2 | frontends/nexo/src/api.ts:38 + 71 | With capacity 1+K, 503 is now normal contention, but the retry budget is still 60 × 500 ms = 30 s; when workers are not serving this session (other checkpoint, all dead, many fallback cards) renders fail with "busy" after 30 s |
| 6 | P2 | OS/Linux/lipidomic-api.service:25-31; pool.R:211 | MemoryMax=8G is only covered by an after-the-job RSS check per worker; the main memory guard sees only its own RSS. 2.7 GB main + 3 workers peaking mid-job can hit the cgroup limit and OOM-kill the unit (all sessions lost). Unverified peak sizes |
| 7 | P2 | R/frontends/api/pool.R:54-71 | `same()` compares the API's **records** (`analysis_explicit`, design inputs, cohort), not the live Team inputs; `align()` applies cohort → analysis → design in a fixed order on a reused session. If a Team observer resets a data_hub input on a design change (or the order of the targeted list feeds a plot), a worker draws a different figure that passes the check and is stored on disk. Unverified |
| 8 | P3 | R/frontends/api/pool.R:55, 61 + 156 | The worker applies the cohort **sorted**; the main session holds it in the user's order (`api_cohort_set`). Same as the disk key, so only matters if Team uses list order (see 7). Unverified |
| 9 | P3 | R/frontends/api/pool.R:218-219 | An "opening" worker whose open fails clears `w$path/sha256`, dropping a newer `api_pool_prepare` target that arrived during the open |
| 10 | P3 | R/frontends/api/pool.R:198 | A "booting" worker never times out; a hung boot keeps the 20 ms tick loop running forever |
| 11 | P3 | R/frontends/api/pool.R:242-243 | `api_pool_finish` stamps the response with the session's **current** `revision`, not the one the worker drew with; a write between plan and finish mislabels provenance (the client's queue prevents this for one tab) |
| 12 | P3 | R/frontends/api/pool.R:202-205 | One message read per worker per 20 ms tick; a render that emits many callr progress/message events is slowed by 20 ms each. Unverified whether Team messages reach the parent as 301 events |

## Details

### 1 (P1) Computed controls make the worker reject the card with 400

- Path: wave 2 lets `api_card_update` accept `customCol_*`, `customShape_*`, `bqcSamples` when the module
  built them (cards.R:200-205), and records them in `s$explicit[[id]]` (cards.R:224-225). The client
  re-sends them after reopen (the "member resend" in wave 2), so a reopened card with a custom group colour
  has them in `explicit`.
- `api_pool_job` takes `descriptor$explicit` as is (pool.R:156-159). The worker calls
  `api_card_create(s, job$source, job$explicit, id)` (pool.R:85), which runs
  `api_card_inputs_validate(inputs, entry$allowedInputs)` (cards.R:117): computed ids are not in
  `allowedInputs`, so it aborts `api_bad_request` "Unknown input: customCol_…".
- The class is in `kinds` (pool.R:90), so `api_pool_finish` re-raises it (pool.R:237): **HTTP 400** for a
  card the main process draws fine. Every uncached render of such a card fails while the pool is on.
- Smallest fix: in `api_pool_job`, return NULL when `any(api_is_computed_id(names(descriptor$explicit)))`
  (main draws). Better later: create with the allowed subset and apply the computed rest with
  `api_card_update` in the worker. Add the computed journey to `test_api_pool.R`.

### 2 (P1) Worker-side session_lost reaches the client as 409

- A worker's own `api_flush`/`api_guard` sets `s$broken` and raises `session_lost` after 120 s
  (session.R:153-160, 202-207). The job timeout is 150 s, so a slow card ends in the worker's error handler
  first, with class `session_lost` (pool.R:88-92).
- `api_pool_finish` re-raises it (pool.R:237): the client gets **409 session_lost** for a main session that is
  alive, and reopens the checkpoint.
- The worker is not restarted (the call returned normally), and the reopen does not reach it:
  `api_pool_prepare` skips workers already on that sha (pool.R:132). Its session stays broken, so every later
  job routed to it fails in `api_alive`/`api_read` with `session_lost` again → repeated 409s until an RSS
  restart.
- Smallest fix: forward only `api_unprocessable` (and perhaps `api_bad_request`) from a worker, fall back to
  `render_here()` for everything else; in `api_pool_worker_render`, reopen when the worker session is
  `broken`/`closed` (or mark the result so the main restarts the worker).

### 3 (P2) Busy worker moved to another checkpoint never reopens

- `api_pool_prepare` sets `w$path/w$sha256` on a busy worker but only opens idle ones (pool.R:134).
  When the job ends, `api_pool_tick` reopens only after `booting` or a mismatched `opening` (pool.R:226),
  not after `busy`. The worker is now idle, labelled with the new sha, with the old checkpoint loaded.
- `api_pool_pump` gives it the new sha's jobs; the worker stops with "worker holds another checkpoint"
  (class NA → fallback). Results are correct (the sha check catches it), but that worker is lost to the
  pool until the next prepare to a third checkpoint or a restart, and every job sent to it pays a round-trip
  before the main draws it.
- Smallest fix: keep the sha the worker actually opened (`w$opened`) and, on `busy → idle`, call
  `api_pool_open(w)` when `!identical(w$opened, w$sha256)`.

### 4 (P2) Tick loop can stop

- `api_pool$ticking <- FALSE` is the first statement of the tick; any error after it (spawn in
  `api_pool_restart`, `w$proc$read()`, `poll_process`) ends the loop without rescheduling. Pending
  `job$resolve` calls for busy workers then wait for the next `api_pool_submit`/`prepare`; with the client's
  queue full of those renders, nothing else may arrive. Whether an error in a `later` callback also
  disturbs plumber's service loop: unverified.
- Smallest fix: `tryCatch` each worker's block inside the loop (restart or mark dead on error) and reschedule in
  `on.exit` when any worker is booting/opening/busy or the queue is not empty.

### 5 (P2) 503 budget under capacity > 1

- `useRenderWorkers` sets `capacity = 1 + renderWorkers` from `length(api_pool_alive())` at open
  (plumber.R:138; api.ts:71). That count includes workers serving another checkpoint, booting or about to be
  moved. Every request the main process answers synchronously (fallbacks, html/visNetwork/acted/fixed cards,
  dashboard copies, cohort reads, `render_here` after a refusal) holds `api_busy`, and up to K other
  requests poll at 500 ms. A request can lose 60 polls (30 s) in a row behind a few slow main-process renders
  (the README notes one at 11.5 s) and fails with "The engine is busy".
- Smallest fix: do not count 503 attempts toward the limit for shared jobs (or use a time budget ≥ the
  server's 120 s guard), and/or have the server report `renderWorkers` as the workers serving this sha.

### 6 (P2) Memory under MemoryMax=8G

- Budget: main hard limit 2.7 GB (session.R:504) + 3 × 1.5 GB worker limit = 7.2 GB, but the worker check
  runs only after a job (pool.R:211), so a heavy render can go above 1.5 GB mid-job; a worker holds up to 100
  card instances (pool.R:75) between restarts. `api_memory_guard` reads `/proc/self/status` of the main only.
  A cgroup OOM kills one process; with systemd's default OOMPolicy the whole unit stops and restarts.
- Smallest fix: lower the worker limit (e.g. 1200), restart workers at a lower card count, and let the guard
  read the cgroup total (`/sys/fs/cgroup/memory.current`) to drop workers before the main process.
  Unverified: real peak sizes per card.

### 7 (P2, unverified) State check by record, not by live input

- `state_of()` reads `s$analysis_explicit` (an API-side record), the three design inputs and the targeted list.
  `align()` reapplies them on a session that has served up to 100 earlier jobs with other states, in the order
  cohort → analysis → design. If a Team observer rewrites a data_hub input when the design (or cohort)
  changes, the worker's live input differs from the main's while the record matches; `same()` passes, and
  `api_pool_finish` stores the figure under the main's disk key. I did not find such an observer in
  `guided_workflow.R:569-574` (it only gates the statistical tool), but did not audit every module.
- Smallest fix: compare the live `data_hub-*` input values (`api_read(s, s$mock$input[[…]])`) for the keys in
  `analysis_explicit` inside `same()`, and apply design before analysis.

### 8-12 (P3)

- 8: send `targeted_lipids_list()` unsorted in `job$state$apply` and compare sorted.
- 9: in the failed-open branch keep `w$path/w$sha256` if they changed since the open began (reopen instead).
- 10: give booting a timeout (e.g. 120 s) → mark dead.
- 11: carry the revision from the worker (`result$provenance$revision`) or re-render when the session epoch
  changed since `job` was planned.
- 12: loop `read()` while `poll_process(0) == "ready"` within one tick.

## Checked and fine (static)

- Cache coherence: `api_pool_finish` writes the memory cache only if `api_render_key` (epoch) is unchanged
  and the disk cache only if the disk key recomputed now equals the planned one (pool.R:245-249).
- Session closed/evicted before the worker answers: `api_session_get(job$sessionId)` raises session_lost/404
  inside `api_exclusive`, so no write to a closed session.
- Checkpoint mismatch: the worker refuses a job whose sha differs from its session (pool.R:73); queued jobs
  with no serving worker fall back (pool.R:172).
- Workers run with `LIPIDOMIC_API_RENDER_DISK_CACHE=0`, `LIPIDOMIC_API_WORKERS=0`, remote URLs unset
  (pool.R:33-36): no new network surface, no worker writes to the disk cache; no new HTTP route
  (health only adds counts).
- Client ordering: exclusive jobs wait for in-flight shared work and later shared jobs do not overtake a
  waiting exclusive (prefetch.ts:47-48); `setCohort`, card writes, design, analysis stay exclusive.
- WebGL parking (gl.ts, cards.ts): parked plot is purged on dispose and when the new figure is not 3D.
- No pilot data in the diff: evidence files hold timings and counts only (checked file names and READMEs, not
  every line of the .txt logs).

## Not verified

- Anything at runtime: no R here, and vitest/tsc not run (no node_modules in this worktree).
- callr behaviour on crash/progress messages (12) and whether a `later` callback error stops plumber (4).
- Whether any Team observer makes the analysis/design/cohort order matter (7, 8).
- Memory peaks per card in a worker (6).
- Wave 2 client code (pickers, card chrome, library 2.1, exports) was read only at the R/API boundary
  (schema.R, cards.R computed controls); client UI logic was not reviewed in depth.

## Coordinator disposition (cross-checked against the code and the RTX)

| # | Finding | Disposition |
|---|---|---|
| 1 | P1 computed-control cards get 400 from a worker | Confirmed (computed ids reach `explicit` through `api_card_update`, cards.R:200/224; a worker's `api_card_create` validates against `allowedInputs`). Fixed: `api_pool_job` keeps such cards in the main process. Test: `test_api_pool.R` step 7b, red then green. |
| 2 | P1 worker `session_lost` forwarded as 409 | Confirmed. Fixed: `api_pool_finish` forwards only `api_unprocessable` (the module's own refusal); any other worker error is drawn by the main process, and the worker reopens the checkpoint. Test: step 7b. |
| 3 | P2 busy worker keeps the old checkpoint after a move | Confirmed. Fixed: the worker records the checkpoint it actually loaded (`w$loaded`); one that finishes with a different session checkpoint reopens; the pump only dispatches to a worker whose loaded checkpoint matches. |
| 4 | P2 tick has no error guard | Fixed: each worker's step is guarded (a failing worker resolves its job to the main process and restarts) and the tick always reschedules in `on.exit`. |
| 5 | P2 client 503 retry budget with capacity > 1 | Not changed: the API never answers 503 while a render waits on a worker (the engine lock is released); a sync request in progress queues the next one inside httpuv. Revisit only if a 503 is seen. |
| 6 | P2 MemoryMax vs mid-job peaks | Measured after the deployed browser runs: main 880 MB, workers 740-910 MB, 3.4 GB of 8G. Kept; the per-worker 1500 MB restart stays. |
| 7 | P2 order of applying cohort/analysis/design | Unverified either way; the comparison after aligning (`same()`) and the fallback to the main process stay the guard. |
| 8 | P3 cohort applied sorted | Fixed: applied in the session's order (`cohortOrder`); compared sorted, as the disk-cache key. |
| 9 | P3 a newer prepare lost when an open fails | Covered by 3: the worker reopens whenever its loaded checkpoint differs from the session's. |
| 10 | P3 booting never times out | Fixed: 300 s, then restart. |
| 11 | P3 provenance revision | Kept: the preparation revision cannot change in Nexo phase 1 (preparation stays in Team). |
| 12 | P3 one message per tick | Kept: a render job sends one message. |
