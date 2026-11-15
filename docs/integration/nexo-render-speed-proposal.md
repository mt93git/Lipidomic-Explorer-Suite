# Nexo render speed: research and proposal

Status: research only (no code changed). Branch `router/20261106-212606-4242d1`, 2026-11-06.
Scope: how Nexo could draw a whole canvas much faster than today, without changing any science.

## 1. The problem, as measured

Measured once, cold API, real browser, 1440×900, the real 24-card checkpoint saved by Team (the
only measurements in this document; recorded in `docs/integration/nexo-phase1.md`, section
"Reopening a checkpoint saved by Team"):

| Step | Time |
|---|---|
| Server opens the checkpoint (`POST /sessions`) | 7.3 s |
| Visible cards drawn | ≈ 10 s |
| Each further card, serial | median 1.1–1.4 s, worst 12.5 s (PCA loadings 2D, ggrepel labels on 2000 points) |
| Whole canvas (24 cards) after zooming out and panning | ≈ 50–54 s |

The whole-canvas figure is the sum of serial renders: the API draws one card at a time. Everything
else in this document is an estimate or a cited claim, labelled as such.

## 2. How it works today (confirmed in the code)

### 2.1 One R process, one request at a time

- `R/frontends/api/plumber.R:22-35` — `api_exclusive()` keeps a single `api_busy` flag. A second
  request while busy gets `503` with `Retry-After: 1`. Nothing in the process renders concurrently.
- `R/frontends/api/run.R:38-39` — one `plumber::pr_run()` on port 3960; `OS/Linux/lipidomic-api.service`
  runs a single `Rscript` with `MemoryMax=3G`, `OMP_NUM_THREADS=2`, `OPENBLAS_NUM_THREADS=2` and
  `R_ENABLE_JIT=0`.
- `R/frontends/api/run.R:22-23` — the catalog is parsed at start-up (comment: ~7 s), so a process
  restart is not free.
- `frontends/nexo/src/api.ts:26-42` — the client serialises every request through one promise queue
  and retries a 503 every 500 ms up to 60 times. The browser never has two renders in flight.

### 2.2 A checkpoint is a live headless Shiny session

- `R/frontends/api/session.R:219-314` — `api_session_open()` builds a `shiny::MockShinySession`,
  runs Team's real `shared_data_server`, `team_canvas_server`, `results_dashboard_server` and
  `team_plot_instances_server` (lines 240-264), imports the archive, re-runs the preparation
  (`runAnalysis`, line 277) and checks the receipt (lines 279-289). This is the 7.3 s.
- `R/frontends/api/session.R:356-378` — sessions are reused by checkpoint sha256 when not dirty; at
  most 2 live sessions, LRU eviction (line 368).
- `R/frontends/api/session.R:113-119` — every flush runs on a private `later` loop, because a flush
  inside an httpuv handler would re-enter the server loop. This is why a request cannot simply hand
  the reactive graph to another thread: the graph, the inputs and the module state live in this
  process and are reached only through `s$mock`.
- `R/frontends/api/session.R:172-207` — lazy outputs: plot-type outputs of a card wait behind a
  gate until requested (`api_output_want`), so a card create does not compute the whole family.

### 2.3 Rendering a card

- `R/frontends/api/cards.R:210-260` — `api_card_render()`: cache lookup (line 225-227); then
  `api_output_want` + `api_size` + `api_flush` (228-230); then `mock$getOutput(nodeId)` (237);
  Plotly/visNetwork JSON is parsed back from the widget's JSON string (243), a PNG is base64-decoded
  from `renderPlot`'s `data:image/png;base64,` URL (248).
- `R/frontends/api/cards.R:9-17, 23-45` — a saved card is **re-created on its first request**
  (`api_card_get` → `api_card_saved` → `api_card_restore` → `api_card_create`). `api_card_create`
  (99-153) sets every default input, calls Team's `team_canvas_instances_create`, flushes until the
  instance reports "settled" (144) and seeds the rendered inputs in up to two rounds
  (`api_seed_rendered_inputs`, 287-309). So the first render of a restored card pays module
  construction + first plot. The 1.1–1.4 s median is "restore + render", not "render".
- `R/frontends/api/session.R:405-449` — render cache: **per session, in memory**, key
  `instance|width|height|format|epoch` (424-425), 64 MB per session (418), LRU (442-447). The epoch
  bumps on any non-card input change (409-415). It dies with the session (eviction, restart, memory
  guard at 454-469 clears it). Width and height enter the key exactly as sent; the client sends
  `Math.round(node.width/height)` (`cards.ts:296`), while its own image cache rounds to 8 px
  (`imageCache.ts:53-56`).
- The worst card: `R/modules/2_qc_boxplot_module.R:2626` (`output$load2dPlot <- renderPlot(...)`)
  with `geom_text_repel(..., max.overlaps = Inf)` at `2_qc_boxplot_module.R:2384` (and `2300` for
  the PCA scores). ggrepel's layout runs at draw time, inside the device, for the current size.

### 2.4 The client

- `frontends/nexo/src/tiers.ts:5-27` — tiers `live | frozen | culled`: culled outside a 200 px
  margin; frozen below 50 % zoom or during a gesture; at most 4 live Plotly plots (`maxLive = 4`),
  selected first, then nearest to the viewport centre.
- `frontends/nexo/src/canvas.ts:222-258` — `draw()` assigns tiers each frame and calls
  `card.setTier(tier, snapshots)`.
- `frontends/nexo/src/cards.ts:37-38, 416-428` — Plotly cards frozen without an image draw one
  off-screen snapshot each through `Plotly.toImage`, queued one at a time (`snapshotQueue`); the
  figure JSON comes from `renderCard(..., 'json')` (382).
- `frontends/nexo/src/cards.ts:292-316` — image cards call `renderCard(..., 'png')` through the
  shared LRU (`imageCache.ts`, 48 MB / 64 entries) keyed by instance, inputs hash, size rounded to
  8 px and preparation revision (`imageCache.ts:55-57`).
- `frontends/nexo/src/cards.ts:264` — a **finished** card draws `node.finished.url` directly: no
  server round trip at all. Team saves these snapshots (PNG/SVG data URLs) only for finished cards,
  validated by `R/frontends/team/canvas_state.R:578-589` with limits `snapshot = 4 MiB`, canvas
  `24 MiB`, `40` nodes (`canvas_state.R:2`). Team's own browser also keeps a `Plotly.toImage`
  bitmap per live plot for gestures (`www/team/js/canvas_viewport.js:277-310`) but never persists it.
- Placeholders today: the text "Loading figure…" or "Restoring <label>…" (`cards.ts:297, 321`).

### 2.5 Where the 50 s goes (reasoned from the code, not profiled)

1. **Serial queue** (`api_exclusive` + client queue): 24 cards × (restore + render) one after another.
2. **Restore on first request** inside that queue: module creation, settle flush, input seeding.
3. **Plot cost** itself: ggplot build + ggrepel + cairo PNG, or Plotly JSON build; one outlier at
   12.5 s dominated by ggrepel on 2000 labels.
4. **Client-side**: one off-screen `Plotly.toImage` at a time for frozen Plotly cards.

Any proposal must attack (1) and (2) to change the whole-canvas number; (3) only moves the outlier;
(4) only moves the on-screen latency after the data has arrived.

## 3. What the literature and the tools say

Each bullet names the source and what it actually shows. Nothing here was measured on our host.

### 3.1 Parallelism for stateful Shiny/plumber workloads

- [plumber: execution model](https://www.rplumber.io/articles/execution-model.html) — R is
  single-threaded; requests are handled in arrival order; the recommended way to scale is several
  R processes behind a load balancer.
- [plumber: hosting](https://www.rplumber.io/articles/hosting.html) — behind a load balancer "it's
  no longer guaranteed that subsequent requests will land on the same process"; sticky sessions
  (HAProxy, cookies) or external state are the options. [Posit forum on nginx `ip_hash`](https://forum.posit.co/t/nginx-load-balancing-shiny-server-is-ip-hash-really-needed/84964)
  quotes Posit: `ip_hash` is necessary for Shiny or "applications will break in unexpected ways".
- [Shiny Server admin guide](https://docs.posit.co/shiny-server/) and [Posit Connect scaling](https://support.posit.co/hc/en-us/articles/231874748)
  — Posit scales an app by *processes × connections per process*; a heavy computation by one user
  blocks the other users on the same process. [Shiny scoping](https://shiny.posit.co/r/articles/improve/scoping/):
  "between the R processes, no objects are shared". A live session is bound to its process.
- [plumber 1.1.0 blog](https://posit.co/blog/plumber-v1-1-0) and [example 14-future](https://raw.githubusercontent.com/rstudio/plumber/main/inst/plumber/14-future/plumber.R)
  — an endpoint may return `promises::future_promise()`; with `plan("multisession")` the body runs
  in *another* R process, so it cannot touch objects of the API process (our `MockShinySession`).
- [mirai + plumber](https://mirai.r-lib.org/articles/plumber.html) — endpoints return `mirai()`
  promises; only N requests in flight with N daemons; bodies must be read in the router process.
  [mirai daemons](https://mirai.r-lib.org/articles/mirai.html) — with the default `cleanup = TRUE`
  a daemon's environment is cleared between tasks (a persistent session inside a daemon needs
  `cleanup = FALSE`).
- [callr::r_session](https://callr.r-lib.org/articles/r-session.html) — a permanent background R
  session that keeps state between calls; bare R start-up ≈ 0.1–0.3 s in their example (package
  load not included).
- [valve](https://github.com/JosiahParry/valve) — a Rust proxy that spawns a pool of plumber
  processes; "each background plumber API will hold their own copy of their R objects"; no sticky
  routing documented. Not usable for a stateful session without a routing layer.
- **Forking.** [mcfork](https://stat.ethz.ch/R-manual/R-devel/library/parallel/html/mcfork.html):
  the child shares the parent's state copy-on-write, "child processes should never use on-screen
  graphics devices", files opened by graphics devices and pre-fork connections "can also cause
  problems", forking a multi-threaded process "can lead to deadlocks or crashes".
  [parallel vignette](https://svn.r-project.org/R/trunk/src/library/parallel/vignettes/parallel.Rnw):
  forked workers inherit open graphics devices and file handles; OpenMP/BLAS threads are a known
  hazard. [OpenBLAS #294](https://github.com/xianyi/OpenBLAS/issues/294) and [R-help 2023](https://stat.ethz.ch/pipermail/r-help/2023-June/477539.html):
  OpenMP-built OpenBLAS deadlocks in forked children. Our unit sets `OMP_NUM_THREADS=2` and
  `OPENBLAS_NUM_THREADS=2`, so threads exist. [Radford Neal, R-devel 2015](https://stat.ethz.ch/pipermail/r-devel/2015-July/071554.html):
  R's GC writes to every object, so copy-on-write pages get duplicated anyway.
  [R-SIG-Mac 2012](https://stat.ethz.ch/pipermail/r-sig-mac/2012-May/009231.html): `png()` crashed
  in forked children; the Cairo package was "known to work". [mcparallel](https://stat.ethz.ch/R-manual/R-devel/library/parallel/html/mcparallel.html):
  results come back serialised; raw vectors cannot be returned directly.
- **Headless sessions.** [MockShinySession](https://shiny.posit.co/r/reference/shiny/latest/mockshinysession.html)
  and [mock-session.R](https://raw.githubusercontent.com/rstudio/shiny/main/R/mock-session.R):
  `getOutput()` is "an internal method which shouldn't be used by others"; `flushReact()` ends with
  `later::run_now()` (which is why `session.R:113-119` uses a private loop). No production
  precedent of rendering through `MockShinySession` was found; the API is already past the
  documented use.

### 3.2 Caching

- [shiny::bindCache](https://shiny.posit.co/r/reference/shiny/latest/bindcache.html) and
  [renderCachedPlot](https://shiny.posit.co/r/reference/shiny/latest/rendercachedplot.html) — the
  key is `rlang::hash()` of the key expression plus a code hint; for plots the key adds the fitted
  size and pixel ratio; `sizePolicy = sizeGrowthRatio(400, 400, 1.2)` rounds the requested size up
  to the next bucket so the app does not cache "images of every possible pixel dimension"; the
  image is returned scalable and CSS fits it. A `cachem::cache_disk()` "can be shared among
  multiple concurrent R processes, and persists on disk across reboots".
- [Using caching in Shiny](https://shiny.posit.co/r/articles/improve/caching/) — "when you update
  your application, R packages, or R itself, you should remove or clear the cache directory".
- [cachem::cache_disk](https://cachem.r-lib.org/reference/cache_disk.html) — one `.rds` per key,
  `max_size` default 1 GB, LRU by file mtime, pruning every 20 sets or 5 s, several processes may
  share a directory (no locking; read with `is.key_missing()`); network file systems discouraged.
- [rlang::hash](https://rlang.r-lib.org/reference/hash.html) — XXH128, stable across sessions and
  R versions with the same endianness; may change across rlang versions.
- [nbformat](https://nbformat.readthedocs.io/en/latest/format_description.html) — Jupyter stores
  every output (base64 `image/png`, JSON) inside the notebook file: the document itself is the
  preview cache. [tldraw assets](https://tldraw.dev/docs/assets) — assets are stored as data URLs
  inside the document by default; `resolveAssetUrl` receives `steppedScreenScale` and `dpr` so a
  store can serve resolution tiers. [Observable Framework data loaders](https://gordonsmith.github.io/framework/loaders)
  — results are cached on disk and reused while fresher than the loader.
- [Grafana `[rendering]`](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/)
  — image rendering runs in a separate service with `concurrent_render_request_limit` (default
  30) because "rendering many images at the same time can overload the server";
  [image renderer docs](https://grafana.com/docs/grafana/latest/setup-grafana/image-rendering/)
  recommend 16 GiB / 4 cores for it.
- [Voilà preheated kernels](https://voila.readthedocs.io/en/stable/customize.html) — a pool of
  kernels that already executed the notebook, HTML cached; the nearest precedent of a "warm
  replica".
- HTTP: [MDN ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag) (`If-None-Match`
  → `304` without body), [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
  (`max-age=31536000, immutable` for content-hashed URLs), [MDN Cache Storage](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
  (entries never expire unless deleted; per-origin quota). [plumber rendering output](https://www.rplumber.io/articles/rendering-output.html)
  documents `res$setHeader()`; request headers arrive as `req$HTTP_*` ([routing](https://www.rplumber.io/articles/routing-and-input.html)).
  A plumber ETag example was not found; [RestRserve ETagMiddleware](https://search.r-project.org/CRAN/refmans/RestRserve/html/ETagMiddleware.html)
  shows the pattern in R.
- Plotly: [WebGL vs SVG](https://plotly.com/javascript/webgl-vs-svg/) — browsers allow "between 8
  and 16 WebGL contexts per page", so 24 live WebGL plots are impossible anyway (Nexo's live cap
  of 4 is consistent with this). [plotly.js #1535](https://github.com/plotly/plotly.js/issues/1535)
  — SVG rendering of thousands of traces takes seconds.

### 3.3 Perceived speed

- [Grafana lazy loading](https://grafana.com/blog/a-closer-look-at-lazy-loading-grafana-dashboards/)
  — since v6.2 off-screen panels are not queried until scrolled into view; panel query
  concurrency is a hard-coded limit ([#81212](https://github.com/grafana/grafana/issues/81212)).
- [Leaflet GridLayer](https://raw.githubusercontent.com/Leaflet/Leaflet/main/src/layer/tile/GridLayer.js)
  — tiles are queued "in order of their distance to center"; `keepBuffer = 2` keeps a ring of
  off-screen tiles. [MapLibre setPrefetchZoomDelta](https://maplibre.org/maplibre-native/android/api/-map-libre%20-native%20-android/org.maplibre.android.maps/-map-libre-map/set-prefetch-zoom-delta.html)
  — low-zoom (low-res) tiles are fetched first so something shows while sharp tiles load.
  [mapbox-gl-js #10069](https://github.com/mapbox/mapbox-gl-js/issues/10069) — maintainers rejected
  neighbour preloading as a net loss; prefetch is not free.
- [Figma incremental frame loading](https://www.figma.com/blog/incremental-frame-loading/) — load
  the first screen plus one-interaction neighbours, prefetch on navigation, background-load the
  rest on desktop. [Figma page-at-a-time loading](https://www.figma.com/blog/speeding-up-file-load-times-one-page-at-a-time/)
  — loading only the selected page cut the slowest loads by 33 %.
- [Miro: Fighting for bytes](https://medium.com/miro-engineering/fighting-for-bytes-in-the-frontend-419c48103ef8)
  (seen only through a search extract; the page returned 403) — level-of-detail: pre-rendered
  images at halving sizes replace widget content at zoom thresholds.
- [tldraw performance](https://tldraw.dev/sdk-features/performance) — off-screen shapes get
  `display:none`; LOD below 0.35 zoom; image shapes request a smaller asset by
  `steppedScreenScale`, "debounced so images don't thrash".
- [Observable runtime](https://github.com/observablehq/runtime) — observers receive `pending()`
  before compute, then `fulfilled`; only displayed cells compute.
- [NN/g Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) — skeletons for
  full-page loads; for a single module a spinner is "typically better"; neither under 1 s.
  [Viget](https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens) (secondary extract)
  — in their test skeletons were perceived *longest*. Evidence for skeletons is mixed; a real
  previous image (LQIP / [ThumbHash](https://evanw.github.io/thumbhash/) / [Mux on blurry placeholders](https://www.mux.com/blog/blurry-image-placeholders-on-the-web))
  is better supported than a blank skeleton.
- Browser primitives: [fetch `priority`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit)
  and [Fetch Priority API](https://web.dev/fetch-priority), [requestIdleCallback](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
  (not in Safari), [IntersectionObserver `rootMargin`](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API),
  [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController). Note that
  aborting a fetch does not stop the R render already in progress.

### 3.4 Faster single renders (and which ones change pixels)

- [ragg performance](https://ragg.r-lib.org/articles/ragg_performance.html) and [ragg home](https://ragg.r-lib.org/)
  — vendor benchmark: ragg "consistently the fastest" anti-aliased device, "up to 40 % faster than
  anti-aliased cairo". [ragg quality](https://ragg.r-lib.org/articles/ragg_quality.html) and
  [ragg #103](https://github.com/r-lib/ragg/issues/103) — ragg anti-aliases fills and uses system
  fonts; cairo does not anti-alias fills: **the pixels differ**.
- [shiny NEWS](https://raw.githubusercontent.com/rstudio/shiny/main/NEWS.md) and [imageutils.R](https://raw.githubusercontent.com/rstudio/shiny/main/R/imageutils.R)
  — since shiny 1.7.2 `renderPlot()` uses `ragg::agg_png()` automatically when ragg is installed
  (`options(shiny.useragg = FALSE)` disables it); otherwise `Cairo::CairoPNG`, then
  `grDevices::png`. **Consequence for parity:** whichever environment has ragg installed draws
  different pixels. Whether the RTX `nexo-api` environment and Team's own environment agree on
  this must be checked (`requireNamespace("ragg")` in both); the test-suite `sessionInfo.txt` in
  `docs/integration/evidence` does not list ragg.
- [geom_text_repel](https://ggrepel.slowkow.com/reference/geom_text_repel.html) and
  [geom-text-repel.R](https://raw.githubusercontent.com/slowkow/ggrepel/master/R/geom-text-repel.R)
  — `max.time = 0.5` s, `max.iter = 10000`, `max.overlaps = 10` (Team sets `Inf`), `seed = NA`:
  **a new random seed is drawn at every draw**, and the layout runs in `makeContent` at draw time
  for the current device size ([June Choe](https://yjunechoe.github.io/microblog/posts/ggrepel-recover-position.html)).
  Two consequences: Team's own PCA/loadings PNGs are not byte-reproducible between two renders,
  and any `max.time`/`max.iter`/subset change moves labels, i.e. changes the plot. The repel loop
  is capped at 0.5 s by default, so the 12.5 s of the loadings card is **not** explained by the
  repulsion loop alone; it has to be profiled (`profvis`, `ggplot2::benchplot`) before anyone
  touches it — and touching it is a Team change.
- [renderPlot](https://shiny.posit.co/r/reference/shiny/latest/renderplot.html) and
  [render-plot.R](https://raw.githubusercontent.com/rstudio/shiny/main/R/render-plot.R) — device
  size is `width*pixelratio × height*pixelratio` at `res*pixelratio`; the mock reports pixel ratio
  1, so the API already renders at 1×. `execOnResize = FALSE` replays the recorded plot on resize
  instead of re-running the expression — but ggrepel re-lays out on replay anyway, and the API's
  headless path does not use this.
- [plotly-r performance](https://plotly-r.com/performance.html) — distinguishes build time (R →
  JSON) from browser time; `toWebGL()` and `partial_bundle()` are plot-level changes (Team code).
- [thomasp85/plotting_benchmark](https://github.com/thomasp85/plotting_benchmark) — for 10 000
  points `ggplot_gtable()` dominates, `ggplot_build()` is cheap, device cost scales with the number
  of drawn elements. Reusing a grob across sizes would need `renderPlot` changes inside modules:
  out of scope.
- [R 3.4.0 release](https://stat.ethz.ch/pipermail/r-announce/2017/000612.html) — byte-code JIT is
  on by default; the unit already runs `R_ENABLE_JIT=0` on purpose (service file comment).

## 4. Options

Legend: **faster** = changes the measured whole-canvas time; **feels faster** = changes what the
user sees while waiting. All gains are estimates reasoned from the measured numbers, not
measurements. All options keep every plot on Team's own render path (`api_card_render` →
`mock$getOutput`), so none changes science; parity flags are listed where relevant.

### Option 1 — Client prefetch with a priority queue (feels faster, S)

**What changes.** `frontends/nexo/src/api.ts` (queue) and `cards.ts`/`canvas.ts`: after the
visible cards are requested, the client enqueues renders for frozen and culled cards ordered by
distance to the viewport centre (Leaflet's rule), at low priority, re-sorted on every camera
change, and dropped before send if the card became visible-and-fetched or was removed
(`AbortController` only for the not-yet-sent). The server is unchanged: it already serialises
(`api_exclusive`) and the client already queues (`api.ts:26-42`). Optionally allow 2 in-flight
requests so download + decode + `Plotly.toImage` of card *n* overlaps the R render of card *n+1*
(the server still answers 503 to the second; the retry loop must then wait on the first instead
of spinning every 500 ms).

**Expected gain.** Whole-canvas server time unchanged (≈ 50 s of serial renders). The sweep
starts at ≈ 10 s instead of at the first pan, so by the time a user pans at, say, 30 s, roughly
half the cards are already cached in the browser (estimate: 20 s ÷ 1.1–1.4 s per card). Visible
cards keep priority; a visible request waits at most one in-flight render (worst case the 12.5 s
card). Live Plotly cards still draw one off-screen snapshot at a time (`snapshotQueue`).

**Risk.** Wasted renders for cards the user never visits (mapbox rejected neighbour prefetch for
this reason); CPU on the API while the user edits. Mitigation: prefetch only when the client is
idle and stop while an edit or save is pending. **Memory/CPU on host:** none beyond today's
single process; browser image cache stays 48 MB.

**Verify.** Playwright `tests/dual-ui/test_nexo_perf.cjs`: open the 24-card checkpoint, do not
pan for 30 s, then zoom to fit and measure "cards drawn after fit" (expected: most immediate) and
"visible-card latency during prefetch" (expected ≤ one render). Re-run the table of §1.

### Option 2 — Persistent content-addressed render cache (faster on re-open, S/M)

**What changes.** `R/frontends/api/session.R:405-449`: keep the in-memory epoch cache as the
first level; add a second level `cachem::cache_disk()` under the checkpoint store (e.g.
`$LIPIDOMIC_API_CHECKPOINT_DIR/render-cache`, `max_size` ≈ 1–2 GB, LRU) keyed by **content**, not
by session: `api_commit` + checkpoint sha256 + instance source + canonical JSON of the card's
current inputs (`api_card_current_inputs`) + design state (`api_design_state`) + preparation
revision + width + height + format. A hit is valid for any session whose card has those inputs
— in particular every non-dirty reopen of the same checkpoint and every restored card whose
saved inputs are unchanged. `cards.R:210-260`: consult the disk cache after the memory miss and
before the flush; write after a render. Optional: `plumber.R:189-203` adds an `ETag` (the content
key) and honours `If-None-Match` → 304, and the client sends the key it already computes
(`imageKey`) so a browser-cached PNG costs one header round trip.

**Expected gain.** First open of a never-seen checkpoint: unchanged. Second open (after restart,
eviction, memory guard, or by another user of the same checkpoint): every card is a disk read
(the phase-1 log records a memory-cache hit at 0.013 s in `test_api_cache.R`; a disk hit adds an
`.rds` read of a few hundred KB — estimate tens of ms). Whole-canvas sweep ≈ 24 × client round
trip, estimated low single-digit seconds instead of ≈ 50 s. Also removes the "7.3 s open + 50 s
sweep" penalty after the unit's own restarts (`Restart=on-failure`, hard memory guard).

**Risk.** Staleness after a code change: `api_commit` in the key and a clear-on-deploy step
(Posit's advice). ggrepel's `seed = NA` means a cached PNG differs in label positions from a
fresh render, exactly as two Team renders differ; the cache must not be sold as "identical
bytes". Disk growth bounded by `max_size`. **Parity:** none; the cache stores Team's own output
outside the checkpoint. **Memory/CPU:** disk only; `cache_disk` LRU bookkeeping is cheap.

**Verify.** Extend `tests/dual-ui/test_api_cache.R`: render, kill and restart the API process,
render again → hit; a card with a changed input → miss; a different `api_commit` → miss; PNG
structurally equal (same dimensions, same image for non-ggrepel cards; for ggrepel cards compare
the Plotly/JSON outputs and accept label-position drift). Re-measure §1 on a *second* open.

### Option 3 — Replica worker processes for read-only renders (faster, L)

**What changes.** A pool of N extra R processes (`callr::r_session`, or `mirai` daemons with
`cleanup = FALSE`), each bootstrapped like `run.R` (without `pr_run` and without the ~7 s catalog
warm-up, which workers do not need) and each opening the **same checkpoint** with
`api_session_open()` — a non-dirty session is equivalent to its checkpoint
(`session.R:353-366`). The primary stays the only process that mutates state (edits, saves,
design confirmation). On open, the primary enqueues every saved card at its saved size from
`s$canvas$nodes` (visible ones first, if the client reports them); workers restore and render
them through the ordinary `api_card_render()` and write to the **Option 2 disk cache**. A render
request on the primary first checks the disk cache; a card still being rendered by a worker is
awaited rather than rendered twice. A dirty session (any edit) routes its changed cards to the
primary only; unchanged cards keep hitting the cache. Forking a warmed-up session
(`mcparallel`) was considered and rejected: OpenMP/BLAS threads are present
(`OMP_NUM_THREADS=2`), the process holds httpuv sockets and `later` loops, graphics devices in
forked children are documented as unsafe, and R's GC defeats copy-on-write (§3.1). Separate
processes cost more memory but are the documented, supported model (Posit, plumber, mirai).

**Expected gain.** Server-side work for the sweep parallelises N+1 ways. With N = 3 (4 renderers):
24 cards × 1.1–1.4 s ≈ 26–34 s of work ÷ 4 ≈ 7–9 s, but bounded below by the 12.5 s outlier →
whole canvas rendered ≈ 13–15 s after the workers are warm (estimate). Workers warm in parallel
with the primary's open (package load + 7.3 s restore each; estimate 10–20 s after the API
receives the open), so the whole canvas would be in the cache about 25–35 s after `POST
/sessions` with **no user action**, and the user's sweep would then be cache hits. Combined with
Option 2, the second open is immediate.

**Risk.** Memory: each worker holds one session; the task statement gives 0.6–2.4 GB per API
process, so 3 workers ≈ 2–7 GB (estimate). Host has ≈ 16 GB free, so it fits, but
`MemoryMax=3G` in `lipidomic-api.service` covers every child in the unit's cgroup → raise it, or
run the pool as its own unit. CPU: 4 processes × 2 BLAS threads ≤ 8 of 32 hardware threads.
Correctness: workers must produce what the primary would — same code, same inputs, same size;
ggrepel's random seed makes PNG bytes differ, as between two Team renders. Failure modes: a worker
dies (restart it; the primary still renders), a worker is slower than a direct render for a card
the user is looking at (the primary renders visible cards itself when the cache misses). Echoed
input updates during a worker's render (`cards.R:257` comment) stay inside the worker; they are
part of the card's own state and would also happen in the primary on first render — but if a
restore in a worker leaves the instance un-created in the primary, the primary still pays the
restore when the user *edits* that card (not when it only views it). **Parity:** none; the
checkpoint file is untouched.

**Effort.** L: a pool manager, job queue, health, the memory budget, the unit file, and tests.

**Verify.** `tests/dual-ui/test_api_stress.R` variant: open the synthetic checkpoint with N = 3,
assert every saved card lands in the disk cache within a budget and that a direct render of the
same card returns the same Plotly JSON / same PNG dimensions; memory: RSS of the unit's cgroup
with 4 processes under the raised `MemoryMax`. Then re-measure §1 (expected: "whole canvas drawn"
collapses toward the open time + worker warm-up).

### Option 4 — Last-session previews inside the checkpoint (feels faster on re-open, M; parity-sensitive)

**What changes.** At save (`R/frontends/api/storage.R:90-115`), append a ZIP member such as
`nexo-previews-v1/<instanceId>.png` (small, e.g. ≤ 400 px wide) for every card the client has an
image for, like Team's `team-project-records-v1.json` ride-along (`api_project_records_append`).
On open, serve them with the canvas; the client (`cards.ts:264` already draws `node.finished.url`
without a round trip) shows the preview with a visible "previous session · updating" badge until
the live render replaces it. The node itself cannot carry the preview: Team's validator rejects
unknown node fields (`R/frontends/team/canvas_state.R:14-17`, field list at `:548`).

**Expected gain.** On re-open, all 24 cards show a (stale, blurry) image at ≈ 8.8 s (the measured
"cards on screen" time) instead of text placeholders until each live render lands. Nothing gets
faster; with Option 2 in place most of this benefit arrives anyway with sharp, current images,
which is why this option ranks last.

**Risk / parity.** `read_session_archive` (`R/utils_session_archive.R:51-70`) only checks path
safety and total size, so Team should open such a checkpoint, but this must be **tested in Team**,
not assumed; Team drops the member on its next save (harmless). Confusion between a preview and
a finished figure is the real risk; the badge and the `stale` semantics must be explicit. Size:
Team's canvas budget is 24 MiB (`canvas_state.R:2`); previews live outside it but inflate the ZIP.

**Verify.** Round-trip test: Nexo save → Team open (and the reverse) with the member present;
Playwright: time to "every card shows an image" on re-open.

### Option 5 — Faster single renders (flagged, not recommended without Team)

| Idea | Pixels change? | Where it would live | Verdict |
|---|---|---|---|
| ragg device instead of cairo | **Yes** (anti-aliased fills, system fonts) | environment of the API, via shiny's automatic choice | Vendor claims up to 40 % faster. Only acceptable if Team's environment uses the same device; otherwise it breaks parity silently. Check `requireNamespace("ragg")` on both hosts first. |
| `type="cairo-png"` | not documented as identical; faster only on device open/close | — | No measurable value for whole plots. |
| ggrepel `max.time`/`max.iter`/label subset | **Yes** (label placement) | `R/modules/2_qc_boxplot_module.R:2300, 2384` | Team change; out of scope. Also, the 0.5 s default cap says the 12.5 s is mostly elsewhere: profile before proposing anything. |
| Size buckets (`sizeGrowthRatio`) + CSS scaling | **Yes** (plot drawn at another size; ggrepel re-lays out) | API + client | Fewer cache misses on resize, but a card no longer matches Team's pixel-exact size. Flag; do not hide. |
| Lower `res` / lower resolution | **Yes** | API | Same objection. |
| Grob reuse across sizes | No for most geoms, but `renderPlot` bodies live in modules | `R/modules/*` | Team change; out of scope. |

### 4.1 Summary table

| # | Option | Kind | Expected effect on §1 numbers (estimate) | Risk | Host cost | Effort |
|---|---|---|---|---|---|---|
| 1 | Client prefetch + priority queue | feels faster | sweep work starts at ≈ 10 s instead of at first pan; whole-canvas server time still ≈ 50 s | wasted renders; visible request waits ≤ 1 render | none | S |
| 2 | Persistent content-addressed disk cache (+ ETag) | faster on re-open | second open: sweep from ≈ 50 s to low single-digit seconds; first open unchanged | stale after deploy (key on commit; clear on deploy) | disk 1–2 GB | S/M |
| 3 | Replica worker processes → disk cache | faster | whole canvas rendered ≈ 13–15 s after workers warm, ≈ 25–35 s after open with no user action; user sweep = cache hits | memory (2–7 GB for 3 workers), `MemoryMax`, pool management | 3 × one session; ≤ 8 threads | L |
| 4 | Previews inside the checkpoint | feels faster on re-open | all cards show a stale image at ≈ 8.8 s | parity must be tested in Team; preview vs finished confusion | ZIP size | M |
| 5 | ragg / ggrepel limits / size buckets | faster per card | per-card speedup (vendor: ≤ 40 % for ragg) | **changes pixels → breaks parity** | none | S |

## 5. Recommendation and order

1. **Option 2 first (disk cache keyed by content).** Smallest change for the largest certain win:
   every re-open of a checkpoint, every restart of the unit and every second user stop paying the
   ≈ 50 s sweep. It is also the medium through which Option 3 pays off, so it is a prerequisite.
2. **Option 1 next (client prefetch with priority).** Server untouched; the first open *feels*
   finished long before 50 s because the sweep starts without the user, and visible cards keep
   precedence. Cheap to test with the existing Playwright perf suite.
3. **Option 3 when 1 + 2 are not enough for the first open.** It is the only option that actually
   divides the ≈ 50 s of the first open, and it needs the budget decision on `MemoryMax` and a
   pool manager. Do it as separate processes, not forks.
4. **Option 4 only if re-open latency still matters after 2**, because Option 2 already gives
   sharp current images on re-open and Option 4 carries the only parity risk of the list.
5. **Option 5: do not do silently.** Verify which PNG device Team and the API actually use (parity
   may already be broken if only one has ragg), profile the 12.5 s loadings card to know where the
   time goes, and bring any pixel-changing idea to Team as an explicit change.

**What this does not fix.** The 7.3 s open and the 12.5 s outlier are Team's own code running
once; no option here shortens them without a Team change. Options 2 and 3 hide them from the
user on every open but the first.

## 6. Parity checklist for whoever implements this

- Nothing under `R/modules`, `R/server.R`, `R/global.R`, `R/ui.R`, `R/frontends/team`, `www`
  changes in Options 1–4.
- Every cached or worker-produced render comes from `api_card_render()` with the same inputs and
  size the primary would use; the key includes `api_commit`.
- A checkpoint saved by Nexo with Option 4 must open in Team (test it); nodes gain no new fields.
- ggrepel's `seed = NA` already makes Team's PNGs non-reproducible; tests compare structure, not
  bytes, and the documentation does not claim byte identity.
- Any device, resolution, size-bucket or ggrepel-limit change is written down as a pixel change.
