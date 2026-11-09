# Phase 1 close (retina-timing). 1. A PNG card may be drawn at pixel ratio 2 (Retina): the render route accepts
# an optional "dpr" (1 or 2, default 1), renderPlot draws width*dpr x height*dpr (Team's own renderPlot for a
# Retina browser: same science, more pixels), and the memory and disk caches keep 1x and 2x apart.
# 2. The render route answers a Server-Timing header with its phases (they cover the route's total; "other" is the
# rest) and a repeat says hit. 3. A card with explicit computed inputs (FLA logratio sel_<category>) stays on the
# main process (not pooled) and is drawn there at 2x.
for (pkg in c("shiny", "jsonlite", "digest", "plumber")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_retina_timing: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV", "LIPIDOMIC_API_WORKERS"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_retina_timing")
cache_dir <- tempfile("retina-render-cache-"); dir.create(cache_dir)
Sys.setenv(LIPIDOMIC_API_RENDER_CACHE_DIR = cache_dir, LIPIDOMIC_API_RENDER_DISK_CACHE = "1")
source("frontends/nexo-api/engine.R")
fails <- function(expr, class = "api_bad_request") tryCatch({ force(expr); FALSE }, error = function(e) inherits(e, class))
png_dims <- function(raw) {
  stopifnot(is.raw(raw), length(raw) > 24L, identical(raw[2:4], charToRaw("PNG")))
  c(width = sum(as.integer(raw[17:20]) * 256^(3:0)), height = sum(as.integer(raw[21:24]) * 256^(3:0)))
}

# 1. dpr is 1 or 2; anything else is a 400.
stopifnot(identical(api_render_dpr(NULL), 1L), identical(api_render_dpr(1), 1L), identical(api_render_dpr(2L), 2L))
for (bad in list(0, 3, 1.5, -1, "2", NA_real_, c(1, 2), TRUE)) if (!fails(api_render_dpr(bad))) stop("dpr accepted: ", deparse(bad))
cat("PASS dpr accepts 1 or 2 only (0, 3, 1.5, \"2\", NA, a vector -> 400)\n")

s <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip") # registered: the route below looks it up
on.exit(api_session_close(s), add = TRUE)
heat <- api_card_create(s, "heatmap_barchart_tab-heatmapPlot")
stopifnot(identical(heat$render, "png"))

# 2. A dpr 2 render is a PNG twice the pixel size of the 1x render; width/height stay logical.
one <- api_card_render(s, heat$instanceId, 620, 680)
two <- api_card_render(s, heat$instanceId, 620, 680, dpr = 2L)
d1 <- png_dims(one$png); d2 <- png_dims(two$png)
if (!identical(unname(d2), unname(2 * d1))) stop(sprintf("dpr 2 PNG %dx%d, 1x PNG %dx%d", d2[[1]], d2[[2]], d1[[1]], d1[[2]]))
stopifnot(identical(two$width, one$width), identical(two$height, one$height), identical(two$dpr, 2L), is.null(one$dpr))
cat(sprintf("PASS heatmap at dpr 2 is %dx%d px (1x: %dx%d); logical size unchanged\n", d2[[1]], d2[[2]], d1[[1]], d1[[2]]))

# 3. The caches keep 1x and 2x apart: asking 1x again returns the 1x image, from the memory cache.
again <- api_card_render(s, heat$instanceId, 620, 680)
stopifnot(isTRUE(again$cached), identical(unname(png_dims(again$png)), unname(d1)))
again2 <- api_card_render(s, heat$instanceId, 620, 680, dpr = 2L)
stopifnot(isTRUE(again2$cached), identical(unname(png_dims(again2$png)), unname(d2)))
stopifnot(!identical(api_render_key(s, heat$instanceId, 620, 680, api_render_format_key("png", 1L)),
  api_render_key(s, heat$instanceId, 620, 680, api_render_format_key("png", 2L))))
descriptor <- api_card_descriptor(s, heat$instanceId)
k1 <- api_render_disk_key(s, descriptor, 620, 680, api_render_format_key("png", 1L))
k2 <- api_render_disk_key(s, descriptor, 620, 680, api_render_format_key("png", 2L))
stopifnot(!is.null(k1), !is.null(k2), !identical(k1, k2), identical(api_render_format_key("png", 1L), "png"))
on_disk <- function(k) file.exists(file.path(api_render_disk_dir(), paste0(k, ".rds")))
if (!is.null(api_render_disk_dir())) {
  stopifnot(on_disk(k1), on_disk(k2))
  stopifnot(identical(unname(png_dims(api_render_disk_get(k1)$png)), unname(d1)),
    identical(unname(png_dims(api_render_disk_get(k2)$png)), unname(d2)))
  cat("PASS disk cache holds the 1x and the 2x render under different keys\n")
} else cat("NOTE disk cache off (no commit id): disk keys checked only\n")
# A Plotly card ignores dpr (only renderPlot reads the pixel ratio) and shares the 1x cache entry.
pca <- api_card_create(s, "results_dashboard-plot_pca")
p1 <- api_card_render(s, pca$instanceId, 620, 680)
p2 <- api_card_render(s, pca$instanceId, 620, 680, dpr = 2L)
stopifnot(isTRUE(p2$cached), is.null(p2$dpr), identical(p2$render, "plotly"))
cat("PASS memory cache keeps 1x and 2x apart; a Plotly card ignores dpr\n")

# 4. The route: dpr 3 or 0 -> 400; a dpr 2 render answers a PNG with a Server-Timing header.
api_run_dir <- normalizePath("frontends/nexo-api"); root <- getwd()
router <- plumber::pr_set_serializer(plumber::plumb(file.path(api_run_dir, "plumber.R")),
  plumber::serializer_unboxed_json(null = "null", na = "null", digits = NA))
setwd(root)
router <- plumber::pr_hook(router, "preroute", function() setwd(root))
call <- function(path, x) {
  req <- new.env(); body <- charToRaw(jsonlite::toJSON(x, auto_unbox = TRUE))
  req$REQUEST_METHOD <- "POST"; req$PATH_INFO <- path; req$QUERY_STRING <- ""
  req$HTTP_CONTENT_TYPE <- "application/json"
  req$rook.input <- list(read = function(l = -1L) body, rewind = function() invisible(0L))
  router$call(req)
}
route <- paste0("/api/v1/sessions/", s$sessionId, "/cards/", heat$instanceId, "/render")
for (bad in list(3, 0)) {
  out <- call(route, list(width = 600, height = 400, dpr = bad))
  if (!identical(as.integer(out$status), 400L)) stop("route dpr ", bad, " answered ", out$status)
}
cat("PASS route: dpr 3 or 0 -> 400\n")
out <- call(route, list(width = 600, height = 400, dpr = 2))
stopifnot(identical(as.integer(out$status), 200L))
header <- out$headers[["Server-Timing"]]
if (!is.character(header) || !nzchar(header)) stop("no Server-Timing header: ", paste(names(out$headers), collapse = ", "))
for (phase in c("queue", "input", "flush", "output", "encode", "total"))
  if (!grepl(paste0("(^|, )", phase, ";dur=[0-9.]+"), header)) stop("Server-Timing lacks ", phase, ": ", header)
stopifnot(grepl('where;desc="main"', header, fixed = TRUE))
# Every step of the route is a phase: on a fresh render the named phases (all but "other") cover at least 90 % of
# total, and "other" (total - their sum) is always present so a gap stays visible.
timing_parts <- function(header) {
  parts <- regmatches(header, gregexpr("([a-z]+);dur=([0-9.]+)", header))[[1L]]
  stats::setNames(as.numeric(sub("^[a-z]+;dur=", "", parts)), sub(";dur=.*$", "", parts))
}
phases <- timing_parts(header)
stopifnot(all(c("request", "descriptor", "memory", "cache", "card", "revision", "store", "guard", "other", "total") %in% names(phases)))
named <- sum(phases[setdiff(names(phases), c("other", "total"))])
if (named < 0.9 * phases[["total"]]) stop(sprintf("phases cover %.1f of %.1f ms: %s", named, phases[["total"]], header))
if (abs(named + phases[["other"]] - phases[["total"]]) > max(1, 0.01 * phases[["total"]]))
  stop("other is not total - the named phases: ", header)
cat(sprintf("PASS route: named phases cover %.1f of %.1f ms (other %.1f)\n", named, phases[["total"]], phases[["other"]]))
# The same call again, right away (nothing that feeds the plot changed): answered from the memory cache.
cached <- call(route, list(width = 600, height = 400, dpr = 2))
again_header <- cached$headers[["Server-Timing"]]
stopifnot(identical(as.integer(cached$status), 200L), identical(cached$body, out$body))
rss <- api_rss_mb()
if (!is.na(rss) && rss > api_rss_soft_mb()) {
  # Past the soft RSS limit api_exclusive's memory guard clears every render cache after each request: the disk answers.
  if (!grepl('hit;desc="disk"', again_header, fixed = TRUE)) stop("cached call (RSS ", round(rss), " MB > soft) not a disk hit: ", again_header)
  cat("NOTE RSS above the soft limit: the memory guard cleared the memory cache; the disk cache answered\n")
} else if (!grepl('hit;desc="memory"', again_header, fixed = TRUE)) stop("cached call is not a memory hit: ", again_header)
stopifnot(!grepl("(^|, )flush;dur=", again_header), grepl("(^|, )other;dur=", again_header))
again_phases <- timing_parts(again_header)
if (sum(again_phases[setdiff(names(again_phases), c("other", "total"))]) < 0.9 * again_phases[["total"]] &&
    again_phases[["total"]] > 50) stop("cached call: phases miss the time: ", again_header)
stopifnot(identical(unname(png_dims(out$body)), unname(2 * png_dims(api_card_render(s, heat$instanceId, 600, 400)$png))))
cat("PASS route: dpr 2 PNG twice the 1x pixel size, with Server-Timing ", header, "\n", sep = "")
cat("PASS route: a cached render says so in Server-Timing ", again_header, "\n", sep = "")

# 5. A FLA logratio card with explicit sel_<category> choices stays on the main process (pool.R api_pool_job: cards
# with computed controls are not pooled, a worker drew a per-group colour card differently; test_api_pool.R 7b),
# even with a ready worker: the main process draws it at 2x, and a second call is a cache hit.
if (all(vapply(c("callr", "promises", "later"), requireNamespace, logical(1), quietly = TRUE))) {
  source("frontends/nexo-api/pool.R")
  files <- c("health.R", "session.R", "schema.R", "catalog.R", "cards.R", "storage_files.R", "storage.R",
    "analysis.R", "palette.R", "cohort.R", "nexo_store.R", "render_disk.R", "pool.R")
  api_pool_start(1L, files, getwd(), api_run_dir)
  on.exit(api_pool_stop(), add = TRUE)
  api_pool_prepare(normalizePath("tests/dual-ui/fixtures/nexo-complete-synthetic.zip"), s$sha256)
  wait_for <- function(ok, timeout = 300) {
    deadline <- Sys.time() + timeout
    while (!isTRUE(ok()) && Sys.time() < deadline) later::run_now(0.1)
    isTRUE(ok())
  }
  if (!wait_for(function() api_pool_status()$idle == 1L && identical(api_pool$workers[[1L]]$loaded, s$sha256)))
    stop("worker not ready: ", paste(unlist(api_pool_status()), collapse = " "))
  fla <- api_card_create(s, "fla_tab-logratioPlot")
  controls <- api_card_schema(s, fla$instanceId)$controls
  sel <- Filter(function(x) isTRUE(x$computed) && startsWith(x$id, "sel_"), controls)
  if (!length(sel)) stop("no sel_<category> control on the FLA logratio card")
  x <- sel[[1L]]; offered <- vapply(x$options, function(o) as.character(o$value), character(1))
  now <- as.character(unlist(x$value)); choice <- if (length(setdiff(offered, now))) union(now, setdiff(offered, now)) else head(now, 1L)
  api_card_update(s, fla$instanceId, stats::setNames(list(as.list(choice)), x$id))
  stopifnot(x$id %in% names(api_card_descriptor(s, fla$instanceId)$explicit))
  # A plain card on the same session is pooled (the worker is ready), so the NULL below is the computed-control guard.
  plain <- api_card_create(s, "heatmap_barchart_tab-heatmapPlot")
  plain_job <- api_pool_job(s, plain$instanceId, 700, 500, "auto", 2L)
  stopifnot(inherits(plain_job, "api_pool_job"), identical(plain_job$dpr, 2L))
  if (!is.null(api_pool_job(s, fla$instanceId, 700, 500, "auto", 2L)))
    stop("a card with explicit computed sel_ inputs was sent to the worker pool")
  two_x <- api_card_render(s, fla$instanceId, 700, 500, dpr = 2L)
  stopifnot(identical(two_x$render, "png"), isFALSE(two_x$cached), identical(two_x$dpr, 2L))
  one_x <- api_card_render(s, fla$instanceId, 700, 500)
  stopifnot(identical(unname(png_dims(two_x$png)), unname(2 * png_dims(one_x$png))))
  # Stored by the main process under the 2x key: asking again is a cache hit.
  here <- api_card_render(s, fla$instanceId, 700, 500, dpr = 2L)
  stopifnot(isTRUE(here$cached), identical(here$png, two_x$png))
  cat(sprintf("PASS FLA logratio with explicit %s stays off the pool; the main process draws it at 2x and caches it\n", x$id))
} else cat("SKIP pool section: callr/promises/later not installed\n")
cat("PASS test_api_retina_timing\n")
