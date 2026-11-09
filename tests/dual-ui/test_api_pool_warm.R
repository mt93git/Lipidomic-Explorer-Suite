# Nexo Phase 1 close, speed (warm worker). A new card used to be paid twice: the main process creates it
# (POST /cards) and the first render's worker creates its own copy before drawing (worker "open" phase,
# 1.6-1.9 s on the production checkpoint). Now the create sends an idle worker a "warm" job that creates the same
# worker card (same id, same explicit inputs, same session state alignment) without drawing, and the first render
# goes to that worker (affinity), so it only flushes and draws. A warm job never changes what is drawn (worker PNG
# bytes == main PNG bytes, Plotly traces to 1e-9, as tests/dual-ui/test_api_pool.R section 3) and never delays the
# create's answer. Goal 2 (LIPIDOMIC_API_WORKER_REUSE=1, off by default): a Data-tab input change updates the
# worker's card for that instance (api_card_update) instead of creating a new one. Goal 3: the create route answers
# a Server-Timing header with its phases (other = total - the rest).
for (pkg in c("shiny", "jsonlite", "callr", "promises", "later")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_pool_warm: package", pkg, "not installed\n"); quit(status = 0)
}
fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
if (!file.exists(fixture)) { cat("SKIP test_api_pool_warm: fixture missing\n"); quit(status = 0) }
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0", LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV",
  "LIPIDOMIC_API_WORKERS", "LIPIDOMIC_API_WORKER_REUSE"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_pool_warm")
source("R/frontends/api/engine.R"); source("R/frontends/api/pool.R")
api_dir <- normalizePath("R/frontends/api")
files <- c("health.R", "session.R", "schema.R", "catalog.R", "cards.R", "storage_files.R", "storage.R",
  "analysis.R", "palette.R", "cohort.R", "nexo_store.R", "render_disk.R", "pool.R")
wait_for <- function(ok, timeout = 240) {
  deadline <- Sys.time() + timeout
  while (!isTRUE(ok()) && Sys.time() < deadline) later::run_now(0.1)
  isTRUE(ok())
}
await <- function(p, timeout = 240) {
  done <- FALSE; value <- NULL
  promises::then(p, function(v) { value <<- v; done <<- TRUE }, function(e) { value <<- e; done <<- TRUE })
  if (!wait_for(function() done, timeout)) stop("promise did not settle")
  if (inherits(value, "error")) stop(value)
  value
}
traces <- function(r) lapply(r$figure$data, function(t) t[intersect(names(t), c("type", "name", "x", "y"))])
same_render <- function(a, b) if (!is.null(a$png)) identical(a$png, b$png) else isTRUE(all.equal(traces(a), traces(b), tolerance = 1e-9))
pid_of <- function(w) w$proc$get_pid()
idle_all <- function() wait_for(function() api_pool_status()$idle == 2L && !length(api_pool$queue) &&
  !length(api_pool$warm_queue %||% list()))
# A worker render of a card, then the main process's own render of the same card at the same size (caches cleared).
worker_vs_main <- function(id, width, height) {
  job <- api_pool_job(s, id, width, height, "auto")
  if (!inherits(job, "api_pool_job")) stop("card ", id, " was not sent to the pool")
  out <- await(api_pool_submit(job))
  if (!isTRUE(out$ok)) stop("worker render failed: ", out$message %||% "fallback")
  result <- api_pool_finish(job, out, function() stop("unexpected fallback"))
  api_render_cache_clear(s)
  list(job = job, out = out, same = same_render(result, api_card_render(s, id, width, height, "auto")))
}

api_pool_start(2L, files, getwd(), api_dir)
on.exit(api_pool_stop(), add = TRUE)
s <- api_session_for_checkpoint(fixture)
on.exit(api_session_close(s), add = TRUE)
if (!wait_for(function() api_pool_status()$idle == 2L)) stop("workers not ready: ", paste(unlist(api_pool_status()), collapse = " "))

# 1. A create sends an idle worker a warm job and answers without waiting for it.
pca <- api_card_create(s, "results_dashboard-plot_pca")
warming <- Filter(function(w) identical(w$state, "busy") && isTRUE(w$job$warm) && identical(w$job$instanceId, pca$instanceId),
  api_pool$workers)
# Workers change state only in the pool's tick (later): busy right after the create = the create did not wait for it.
if (length(warming) != 1L) stop("no worker is warming the new card right after the create answered")
if (!is.numeric(api_pool$warm_submit_ms) || api_pool$warm_submit_ms > 500)
  stop(sprintf("submitting the warm job took %s ms", format(api_pool$warm_submit_ms)))
cat(sprintf("PASS the create answered while a worker warms its card (warm submission %.1f ms)\n", api_pool$warm_submit_ms))
if (!wait_for(function() !is.null(api_pool_holder(s, pca$instanceId)))) stop("no worker holds the warm card")
holder <- api_pool_holder(s, pca$instanceId)
stopifnot(identical(holder$index, warming[[1L]]$index), api_pool_card_ids(api_pool_job(s, pca$instanceId, 620, 680, "auto"))[["card"]] %in% holder$cards)
last <- api_pool$warm_log[[length(api_pool$warm_log)]]
stopifnot(identical(last$instanceId, pca$instanceId), isTRUE(last$ok), identical(last$card, "open"), is.numeric(last$timing$open))
cat(sprintf("PASS worker %d holds the warm card before any render (warm open %.0f ms)\n", holder$index, last$timing$open))

# 2. The first render goes to that worker and has no "open" phase; it draws what the main process draws.
first <- worker_vs_main(pca$instanceId, 620, 680)
if (!is.null(first$out$timing$open)) stop("the first render after a warm still opened the card: ", paste(names(first$out$timing), collapse = ","))
stopifnot(identical(first$out$card, "held"), as.integer(first$out$pid) == as.integer(pid_of(holder)))
if (!first$same) stop("worker render after a warm differs from the main render (plotly)")
png <- api_card_create(s, "qc_pca_tab-boxplotAfterNorm")
if (!wait_for(function() !is.null(api_pool_holder(s, png$instanceId)))) stop("no worker holds the warm PNG card")
second <- worker_vs_main(png$instanceId, 620, 680)
stopifnot(is.null(second$out$timing$open), identical(second$out$card, "held"))
if (!second$same) stop("worker PNG after a warm differs from the main PNG")
cat(sprintf("PASS first renders skip the worker open (phases: %s); PNG bytes and Plotly traces equal the main render\n",
  paste(names(second$out$timing), collapse = " ")))

# 2b. A render that arrives while its card is still warming waits for that worker instead of opening it elsewhere.
idle_all()
violin <- api_card_create(s, "results_dashboard-plot_violin")
warm_w <- Filter(function(w) isTRUE(w$job$warm) && identical(w$job$instanceId, violin$instanceId), api_pool$workers)
stopifnot(length(warm_w) == 1L)
early <- worker_vs_main(violin$instanceId, 640, 680)
stopifnot(is.null(early$out$timing$open), as.integer(early$out$pid) == as.integer(pid_of(warm_w[[1L]])))
if (!early$same) stop("worker render after waiting for the warm differs from the main render")
cat("PASS a render sent while its card warms waits for that worker (no second open)\n")

# 3. A card with explicit computed controls gets no warm job (it stays on the main process: pool.R api_pool_job).
idle_all()
# Pilot F1: per-group pickers are offered where they reach the plot on a copy (the cellular polar map; QC's are dead
# and no longer offered, test_api_session_palette.R).
coloured <- api_card_create(s, "cellular_org_tab-polarPlot")$instanceId
api_card_update(s, coloured, list(useCustomColors = TRUE))
cols <- vapply(Filter(function(x) startsWith(x$id, "customCol_"), api_card_schema(s, coloured)$controls), `[[`, "", "id")
if (!length(cols)) stop("no customCol_ control after useCustomColors = TRUE")
api_card_update(s, coloured, setNames(list("#123456"), cols[[1L]]))
idle_all()
logged <- length(api_pool$warm_log)
stopifnot(is.null(api_pool_warm_job(s, coloured)), isFALSE(api_pool_warm(s, coloured)))
stopifnot(!length(api_pool$warm_queue), !any(vapply(api_pool$workers, function(w) isTRUE(w$job$warm), logical(1))))
idle_all(); stopifnot(identical(length(api_pool$warm_log), logged))
cat("PASS a card with explicit computed controls gets no warm job\n")

# 4. Goal 2 (LIPIDOMIC_API_WORKER_REUSE=1): an input change updates the worker's card of that instance (no new card),
# and the worker's render equals the main render. Off by default; this section is the parity gate to turn it on.
Sys.setenv(LIPIDOMIC_API_WORKER_REUSE = "1")
idle_all()
reuse_card <- function(source, initial, change) {
  # Initial inputs no earlier card used: no worker already holds this content, so the warm creates the instance's card.
  id <- api_card_create(s, source, initial)$instanceId
  if (!wait_for(function() !is.null(api_pool_holder(s, id)))) stop("no worker holds ", source)
  w <- api_pool_holder(s, id); held <- length(w$cards)
  stopifnot(identical(api_pool$warm_log[[length(api_pool$warm_log)]]$card, "open"))
  base <- worker_vs_main(id, 620, 680); if (!base$same) stop("baseline worker render differs: ", source)
  for (step in seq_along(change)) {
    inputs <- change[[step]](id)
    # As the PATCH route: the warm job leaves before the main process applies the change (they run in parallel).
    api_card_update(s, id, inputs, warm = TRUE)
    stopifnot(any(vapply(api_pool$workers, function(x) isTRUE(x$job$warm) && identical(x$job$instanceId, id), logical(1))))
    if (!wait_for(function() !is.null(api_pool_holder(s, id)))) stop("no worker holds the updated ", source)
    last <- api_pool$warm_log[[length(api_pool$warm_log)]]
    if (!identical(last$card, "update")) stop(source, " input change: the warm job did ", last$card, ", not an update")
    stopifnot(identical(api_pool_holder(s, id)$index, w$index), identical(length(w$cards), held))
    r <- worker_vs_main(id, 620, 680)
    if (!is.null(r$out$timing$open)) stop(source, ": render after the reused update opened a card")
    if (!r$same) stop(source, " after ", paste(names(inputs), collapse = ","), ": the reused worker card draws differently from the main process")
  }
  id
}
option_other <- function(id, control) {
  x <- Filter(function(c) identical(c$id, control), api_card_schema(s, id)$controls)[[1L]]
  values <- vapply(x$options, function(o) as.character(o$value), character(1))
  setNames(list(setdiff(values, as.character(unlist(x$value)))[[1L]]), control)
}
reuse_card("results_dashboard-plot_violin", list(top_n = 15), list(function(id) list(top_n = 10), function(id) option_other(id, "color_by")))
reuse_card("results_dashboard-plot_heat", list(), list(function(id) list(top_n = 20)))
cat("PASS reuse: input changes update the worker's card in place; renders equal the main render\n")
# Keys removed from the explicit inputs cannot be "unset" on a worker card: that job creates a fresh card instead.
Sys.unsetenv("LIPIDOMIC_API_WORKER_REUSE")

# 5. The per-worker card cap (100) still recycles the worker's session, and the main process forgets its cards.
idle_all()
for (w in api_pool$workers) w$proc$run(function() assign("api_worker_cards", 100L, envir = globalenv()))
fresh <- api_card_create(s, "qc_pca_tab-outlierPlot")$instanceId
if (!wait_for(function() !is.null(api_pool_holder(s, fresh)))) stop("no worker holds the card after a recycle")
w <- api_pool_holder(s, fresh)
stopifnot(identical(length(w$cards), 1L), identical(w$proc$run(function() get("api_worker_cards", envir = globalenv())), 1L))
if (identical(api_pool_holder(s, pca$instanceId)$index, w$index)) stop("the main process still thinks a recycled worker holds old cards")
cat("PASS the 100-card cap recycles a worker; the main process forgets the cards it no longer holds\n")

# 6. Goal 3: the create route answers Server-Timing with its phases; other = total - the rest. The PATCH route warms.
if (requireNamespace("plumber", quietly = TRUE)) {
  idle_all()
  root <- getwd()
  api_run_dir <- api_dir # plumber.R sources its siblings from api_run_dir (plumb() runs with the file's folder as wd)
  router <- plumber::pr_set_serializer(plumber::plumb(file.path(api_dir, "plumber.R")),
    plumber::serializer_unboxed_json(null = "null", na = "null", digits = NA))
  setwd(root)
  router <- plumber::pr_hook(router, "preroute", function() setwd(root))
  call <- function(method, path, x) {
    req <- new.env(); body <- charToRaw(jsonlite::toJSON(x, auto_unbox = TRUE))
    req$REQUEST_METHOD <- method; req$PATH_INFO <- path; req$QUERY_STRING <- ""
    req$HTTP_CONTENT_TYPE <- "application/json"
    req$rook.input <- list(read = function(l = -1L) body, rewind = function() invisible(0L))
    router$call(req)
  }
  out <- call("POST", paste0("/api/v1/sessions/", s$sessionId, "/cards"), list(source = "results_dashboard-plot_dist"))
  stopifnot(identical(as.integer(out$status), 200L))
  header <- out$headers[["Server-Timing"]]
  if (!is.character(header) || !nzchar(header)) stop("create route: no Server-Timing header")
  parts <- regmatches(header, gregexpr("([a-z]+);dur=([0-9.]+)", header))[[1L]]
  phases <- stats::setNames(as.numeric(sub("^[a-z]+;dur=", "", parts)), sub(";dur=.*$", "", parts))
  need <- c("request", "validate", "defaults", "inputs", "instance", "flush", "seed", "card", "warm", "guard", "other", "total")
  if (!all(need %in% names(phases))) stop("create Server-Timing lacks ", paste(setdiff(need, names(phases)), collapse = ", "), ": ", header)
  named <- sum(phases[setdiff(names(phases), c("other", "total"))])
  if (abs(named + phases[["other"]] - phases[["total"]]) > max(1, 0.01 * phases[["total"]])) stop("create: other is not total - the rest: ", header)
  if (named < 0.9 * phases[["total"]]) stop(sprintf("create: phases cover %.1f of %.1f ms: %s", named, phases[["total"]], header))
  created <- jsonlite::fromJSON(rawToChar(if (is.raw(out$body)) out$body else charToRaw(out$body)))$instanceId
  stopifnot(any(vapply(api_pool$workers, function(w) isTRUE(w$job$warm) && identical(w$job$instanceId, created), logical(1))))
  cat("PASS create route Server-Timing ", header, "\n", sep = "")
  idle_all()
  patched <- call("PATCH", paste0("/api/v1/sessions/", s$sessionId, "/cards/", pca$instanceId), list(inputs = list(top_n = 12)))
  stopifnot(identical(as.integer(patched$status), 200L))
  stopifnot(any(vapply(api_pool$workers, function(w) isTRUE(w$job$warm) && identical(w$job$instanceId, pca$instanceId), logical(1))))
  cat("PASS an input change through the PATCH route warms the card's new worker copy\n")
} else cat("SKIP section 6: plumber not installed\n")
cat("PASS test_api_pool_warm\n")
