# Phase 1 close, speed: stop paying a card's creation twice (warm worker)

Branch `router/20261108-122109-0f74c1`, base `nexo/phase1` 7a13c528. Red 7cda7502 (test), green 7df89c1f + ac4f5546 (API + perf
script). **The R tests are unrun**: the M1 has no R. The coordinator runs them on the production server and measures the
real checkpoint again with `tests/dual-ui/perf/render_timing.cjs`.

## Problem (coordinator's measurement, production server, large real checkpoint)
Session open 6.0 s; `POST /sessions/<id>/cards` 1.6-3.6 s per card (main process); first render 1.6-2.3 s, of which the
worker's `open` phase (the worker creates its own copy of the card, id `tcinstance_pool<digest(source, explicit)>`) is
1.6-1.9 s; redraw at another size 54 ms; retina 114 ms; cache hit 1-3 ms. A new card cost ~4-6 s.

## Goal 1: warm jobs (implemented, `R/frontends/api/pool.R`, `cards.R`, `plumber.R`)
- **When.** `api_card_create` (create route and any caller except the v0 dashboard copies, which the v0 route draws on
  the main process) sends the warm job **before its own flush**, right after validating the source and the inputs: the
  worker creates its copy *in parallel* with the main process's create. `api_card_restore` warms from the saved
  descriptor before re-creating the card. The PATCH route (`api_card_update(..., warm = TRUE)`) warms the new content
  right after recording the changed explicit inputs and before applying them on the main process (never for actions:
  an acted card has no descriptor).
- **Which cards.** Exactly the poolable ones (`api_pool_poolable`, factored out of `api_pool_job` without change):
  `render_disk.R` descriptor non-NULL (not acted, no replayed member actions), not fixed, render plotly/png, no
  computed controls in the explicit inputs. The early descriptor of a card being created is
  `list(source, render = catalog entry, fixed = FALSE, explicit = validated inputs)`: exactly what `api_card_create`
  records in `s$explicit` at its end (same object), so the worker id is the one the render job will ask for.
- **What the worker does.** `api_pool_worker_warm` = `api_pool_worker_session` (sha check, 100-card recycle, state
  alignment: the code moved unchanged out of `api_pool_worker_render`) + `api_pool_worker_card` (the same create code
  as the render's `open`, same id, same explicit inputs, computed handling unchanged) and nothing else: no
  `api_card_render`. `api_pool_worker_render` calls the same two functions, then draws. A warm can therefore only
  produce the card a render would have produced itself; parity is checked anyway (test sections 2, 2b).
- **Never blocks the create.** `api_pool_warm` builds the job (descriptor + session state reads), queues it and, if a
  worker is idle, hands it over with `callr`'s asynchronous `$call()`; nothing waits for the answer
  (`api_pool_warm_done` only logs it). Errors are caught (`api_card_warm` never fails the caller). The submission time is
  kept in `api_pool$warm_submit_ms` and is the create's `warm` phase.
- **Scheduling.** Renders always go first: `api_pool_pump` places every waiting render, and only with an empty render
  queue does `api_pool_pump_warm` hand warm jobs to idle workers (the idle worker holding the fewest cards). A queued
  warm job is rebuilt at dispatch (inputs or session state may have changed; a card no longer poolable or a closed
  session drops it), skipped if a worker already holds or is creating that content, dropped when a render for the same
  card arrives (the render creates it), one per card, at most 32.
- **Affinity.** Each worker answer carries `cards` (the `tcinstance_pool*` cards it holds, valued by the content each
  shows); the main process keeps it in `w$cards` (emptied on open/restart, replaced after a 100-card recycle). A render
  goes to (1) an idle worker holding the content, else (2) **waits for the worker warming it right now** (an open on
  another worker would cost the same and start later), else (3) the instance's own card (reuse, below), else (4) any
  idle worker as before. Busy holders are not waited for: (4) applies, as the task asked.
- **Visibility.** Render Server-Timing gains a note `workercard;desc="held|open|update"`; one stderr line per warm:
  `warm <instance> worker <i> ok held|open|update open=..ms total=..ms`; `/health` workers gain `warming`, `warmQueued`.

Expected phases for a new card (to be confirmed by the coordinator's run): the create answers in about the same time
as before (+ the `warm` submission, a few ms); the worker's copy (~1.6-1.9 s) is built during that create (1.6-3.6 s),
so the first render is `queue` (0, or the rest of the warm if the create was faster) + `input` + `flush` + `output` +
`encode` (tens of ms to ~0.1 s, like the measured 54 ms redraw), **no `open`**, `where=worker`, `workercard=held`.
A new card: ~1.6-3.6 s + ~0.1 s instead of ~4-6 s.

## Goal 2: reuse the instance's worker card (implemented behind `LIPIDOMIC_API_WORKER_REUSE=1`, **off by default**)
- With the flag, jobs carry `reuseId = tcinstance_poolr<digest(source, instanceId)>`. The worker keeps, per card, the
  explicit inputs it was built with. A job whose content differs updates that card with only the changed inputs through
  `api_card_update` (what the main process does for a Data-tab change), so the main process's path (create X, then
  PATCH Y) and the worker's (create X at warm, then update Y at the PATCH's warm) are the same sequence. Inputs the card
  had and the job lacks cannot be unset: then a fresh content-keyed card is created as today. A refused update marks
  the card unusable and creates a fresh one. Content-keyed (`tcinstance_pool<digest>`) cards are never mutated.
- **Decision: off by default** because the rule is "implement it only if parity holds" and parity can only be shown by
  running R, which the M1 cannot. `tests/dual-ui/test_api_pool_warm.R` section 4 is the gate: violin (top_n, then
  color_by) and heatmap (top_n), each change compared worker vs main (Plotly traces to 1e-9 / PNG bytes). If it is
  green on the server, set `LIPIDOMIC_API_WORKER_REUSE=1` in the unit. Known risk if it is red: Team modules with
  path-dependent state (e.g. the dashboard's `observeEvent(base(), updateSelectInput(color_by))` on init, renderUI
  inputs seeded only on create, not on update: `api_card_update` seeds only after actions). Note that the disk cache
  already assumes path independence (it keys a card by its explicit inputs only).
- Without the flag, the PATCH warm still helps: the new content's card is created on a worker while the main process
  applies the change, so the render after a PATCH waits only for the rest of that warm.
- Per-worker cap: unchanged (`api_worker_cards >= 100` reopens the worker's session before the job). Warm and reuse
  creations count; updates do not. After a recycle the worker reports only the cards it created since, and the main
  process's affinity follows (test section 5).

## Goal 3: why does create take 1.6-3.6 s on the main process? (diagnosis only, no change)
`POST /sessions/<id>/cards` now answers `Server-Timing` with: `request` (session lookup, body), `validate` (source,
id, catalog entry, input validation, 160-card check), `warm` (warm submission), `defaults` (Team's defaults, archived
family inputs; the results dashboard reads its first lipid from `data_processed_allow_missing()` here), `inputs`
(output wanted, 800x600 size, `setInputs` of every default on the mock session), `instance`
(`team_canvas_instances_create`: the module's server starts), `flush` (until the card settles), `seed`
(`api_seed_rendered_inputs`: reads every non-download UI output of the card, up to 2 rounds with a flush each),
`card` (errors, current inputs, plot height, records), `guard`, `other` = total - the rest, `total`; plus one stderr
line `create <instance> <source> phase=ms ... total=ms`. `render_timing.cjs` prints them per card.

Top suspects, in the order I expect them to show (to be confirmed by the coordinator's run):
1. **`flush` draws the plot on the main process at 800x600.** `api_card_create` marks the card's output wanted
   (`api_output_want`, lazy gate open) and sized before the flush, so the whole plot pipeline (data reactives + the
   draw) runs at create, although with workers on the first render is drawn by a worker at the real size. The worker's
   `open` (1.6-1.9 s) is the same work, which matches the create's lower bound (1.6 s). Candidate lever (not applied:
   it changes which outputs a create computes, and the seed/schema paths may depend on it): with workers, do not want
   a poolable card's plot output at create.
2. **`inputs`**: MockShinySession's `setInputs` flushes the reactive graph (as far as I know from shiny's mock
   session; to confirm with the numbers), so the defaults trigger a first round of the module's reactives before the
   module even exists for some families.
3. **`seed`**: one `getOutput` per rendered UI output (downloads already skipped since H8) and a flush per round; cards
   with many renderUI outputs pay it twice.
4. **`instance`**: module server start; families with heavy `reactive()` setup on init.
5. **`guard`**: past `LIPIDOMIC_API_RSS_SOFT_MB` (2400) every request clears all render caches and runs `gc()`; on a
   large checkpoint this alone can be hundreds of ms and also explains spread between equal creates (1.6 vs 3.6 s).
6. `defaults` for results-dashboard cards (`data_processed_allow_missing()` if invalidated).

## Tests
- `tests/dual-ui/test_api_pool_warm.R` (new; nexo-complete-synthetic.zip, two workers as test_api_pool.R). **Unrun.**
  1 the create answers while a worker is still warming its card (busy right after it: workers change state only in
  the pool's tick), warm submission <= 500 ms; a worker holds the warm card before any render, warm log `open`.
  2 the first render has no worker `open` phase, `workercard` held, runs on the holder, Plotly (pca) and PNG
  (boxplotAfterNorm) equal the main render. 2b a render sent while its card is warming waits for that worker.
  3 a card with explicit computed controls (pca2dPlot customCol_) gets no warm job. 4 reuse parity (flag on).
  5 the 100-card cap recycles a worker and the main process forgets its cards. 6 create route Server-Timing has every
  phase above, other = total - the rest, named phases >= 90 % of total; the create route and the PATCH route warm.
- `tests/dual-ui/test_api_pool.R`, `tests/dual-ui/test_api_retina_timing.R`: unchanged, **unrun**. Reviewed against the
  change: section 3 of test_api_pool still sees two worker pids and overlapping renders (renders wait for their warming
  workers or go to the idle one; renders 3 and 4 open on both workers); section 8 waits for `idle == 2` after the warms;
  retina section 5 only builds a job (`api_pool_job` unchanged apart from two new fields).
- `tests/dual-ui/perf/render_timing.cjs`: `node --check` OK; smoke run against a local fake API
  (`smoke-render-timing.txt`, fixed fake values, not measurements). Fixed on the way: the table's label column was
  named `card`, and the render route's `card` phase overwrote it (rows now use `label`; also in `NEXO_TIMING_JSON`).
- No client change: no vitest/tsc/mock suites run.

### Red (static, R unrun)
At 7cda7502 the test calls symbols that do not exist in `R/frontends/api`:
```
api_pool_warm <- function        red(7cda7502)=0  working tree=1
api_pool_warm_job <- function    red(7cda7502)=0  working tree=1
api_pool_holder <- function      red(7cda7502)=0  working tree=1
api_pool_card_ids <- function    red(7cda7502)=0  working tree=1
warm_log                         red(7cda7502)=0  working tree=3
warm_submit_ms                   red(7cda7502)=0  working tree=2
warm = FALSE                     red(7cda7502)=0  working tree=3
api_timing_create_log            red(7cda7502)=0  working tree=3
api_pool_worker_warm             red(7cda7502)=0  working tree=2
```
### Green
Not executed (no R on the M1). To run on the server, from `<repo>`:
`Rscript tests/dual-ui/test_api_pool_warm.R`, `Rscript tests/dual-ui/test_api_pool.R`,
`Rscript tests/dual-ui/test_api_retina_timing.R`, then `render_timing.cjs` against the real checkpoint (with and
without `LIPIDOMIC_API_WORKER_REUSE=1` only if section 4 is green).

## Still open
- Everything R above is unverified until the server run (syntax included: no R parser on the M1).
- Canvas open (saved cards): renders reach the pool directly without a create, so warm jobs do not help there; each
  worker still opens the saved cards it draws. Prewarming saved canvas cards at session open would compete with
  those renders; not done.
- A warm job holds its worker ~1.7 s; a render arriving for another card meanwhile waits or takes another worker.
- Workers hold more cards (warm copies that may be drawn elsewhere): RSS limit (1500 MB) and the 100-card recycle bound it.
- Goal 3 lever (suspect 1) not applied until the numbers confirm it.
