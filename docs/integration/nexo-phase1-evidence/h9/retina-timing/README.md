# Phase 1 close: retina-timing (sharp PNG cards on Retina, per-phase render timing)

## 1. Retina PNG cards
- Client (`frontends/nexo/src/retina.ts` `renderDpr`): a PNG card asks for `dpr = min(2, round(devicePixelRatio))`
  only when it is **live and the zoom is >= 100 %**; frozen, culled, zoomed-out (< 100 %) cards and prefetches ask
  for 1. Fractional ratios round (1.25 -> 1, 1.5 -> 2) because the API accepts 1 or 2 only. The `<img>` keeps its
  CSS size (`.body img {width:100%;height:100%}`), so a 2x image is drawn at the card's logical size.
  `imageKey` (shared image LRU) gets a `@2x` part; 1x keys are unchanged.
- API (`R/frontends/api/cards.R` `api_card_render(..., dpr)`, render route body `dpr`): `api_render_dpr` accepts
  1 or 2 (default 1), anything else 400. For renderPlot cards the output's own pixel ratio is set
  (`session.R` `api_pixelratio`): the mock's `clientData$pixelratio` is patched to read a per-output reactive
  value for the output being drawn (`shiny::getCurrentOutputInfo()`), 1 for every other output. Shiny's renderPlot
  then opens its device at `width*dpr x height*dpr` at `res*dpr` (render-plot.R), exactly what Team does for a
  Retina browser: same science, more pixels. Plotly / visNetwork / html cards ignore dpr.
- Caches: the format part of the memory and disk keys is `png@2x` for a 2x render (`api_render_format_key`);
  1x keys are byte-identical to before (the existing disk cache keeps hitting). The pool job carries `dpr` and
  its key format; the worker renders with the same dpr.
- Finished snapshots and exports are unchanged (exports keep their own dpi).

## 2. FLA sel_ choices and the worker pool
Cards with explicit computed inputs (schema.R `api_is_computed_id`, e.g. FLA logratio `sel_<category>`) **stay on
the main process**: `api_pool_job` returns NULL for them (restored in b7357e99). Setting the computed ids on a worker
after create was tried here and a worker drew a per-group colour PCA card differently from the main process
(`tests/dual-ui/test_api_pool.R` 7b), so the guard stays until that difference is understood. The main process
draws such a card at the requested dpr (a 2x PNG is twice the 1x pixel size) and stores it in the memory and disk
caches under the `png@2x` key; a second call is a cache hit. Test section 5 checks exactly that: with a ready worker
a plain heatmap card gets a pool job and the FLA card with an explicit `sel_` choice gets NULL.

## 3. Timing
- Render route answers `Server-Timing` with every step between the route's start and its answer (ms; only the
  phases that ran): `request` (session lookup, body, dpr, size), `pool` (`api_pool_job`, with workers only), `queue`
  (waiting for a worker; 0 on the main process), `args`, `descriptor` (`api_card_descriptor`), `memory` (memory-cache
  lookups), `cache` (disk key digest + disk read), `open` (restoring a saved card) or `card` (live card lookup),
  `input` (output wanted, size, pixel ratio), `flush` (Team's reactive graph settling, most of the drawing),
  `output` (`getOutput`), `encode` (PNG/JSON decode), `revision` (preparation revision read), `store` (memory-cache
  put), `rekey` (descriptor + disk key re-read after the render), `disk` (disk-cache write), `guard`
  (`api_exclusive`'s memory guard: past the soft RSS limit it clears every render cache and runs `gc()`), `other`
  (= total - the sum of the others, so an unmeasured gap is always visible) and `total`; notes `where` (`main` |
  `worker` | `main-fallback`) and `hit` (`memory` | `disk`). The first version measured ~50 ms of a 68 s route call
  on the RTX: the steps above were outside every phase.
- Cache order: `api_card_render` looks up the memory cache before the disk cache. It used to look at the disk first,
  so every repeat of a disk-cacheable card was answered from disk (digest + `readRDS`) and never said
  `hit;desc="memory"`. A repeat now says `memory`; `disk` only when the memory entry is gone (epoch bump, LRU, or the
  memory guard above).
  One stderr line per render: `render <instance> <w>x<h>@<dpr>x where=... queue=..ms ... other=..ms total=..ms`.
- `tests/dual-ui/perf/render_timing.cjs`: `NEXO_API_BASE`, `NEXO_CHECKPOINT_ID`, optional `NEXO_API_USER` /
  `NEXO_API_PASS` (environment only, never printed). Opens a session, adds PCA (plotly), FLA logratio (png),
  heatmap, longitudinal macroclass (after `submit_longitudinal_btn`), structural summary (after `runAnalysis`) and
  prints per card: first/cold, steady (redrawn at +40 px), retina (dpr 2) and cached rows with every phase, plus
  first-card and median totals. Smoke-tested only against a local fake server (no real API on the M1).

## Tests
- vitest `src/retina.test.ts` (4 tests); full suite green after the change.
- R `tests/dual-ui/test_api_retina_timing.R`: **unrun** (no R on the M1); run on the RTX.
- Browser `tests/dual-ui/test_nexo_retina.cjs` (mock, deviceScaleFactor 2, Chromium + WebKit): 40 % -> dpr 1,
  image = logical width; 100 % live -> dpr 2, natural 880 px for a 438 px CSS image; 80 % -> no 2x request.
  Screenshots: `chromium-1440-dpr2-zoomed-out-1x.png`, `chromium-1440-dpr2-live-100.png`.
