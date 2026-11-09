# Render workers (H9). With LIPIDOMIC_API_WORKERS = K, K callr workers open the session's
# checkpoint and draw cacheable cards (render_disk.R descriptor) in parallel with the
# main process. Each worker aligns the session-level state (cohort, design, analysis
# settings) first; the main process stores the answer in its caches. Science unchanged:
# the same engine runs Team's own code; Plotly coordinates may differ in the last bit.
for (pkg in c("shiny", "jsonlite", "callr", "promises", "later")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_pool: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0", LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV", "LIPIDOMIC_API_WORKERS"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_pool")
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

# 1. Off unless asked for.
stopifnot(identical(api_pool_size(), 0L))
cat("PASS the pool is off by default (LIPIDOMIC_API_WORKERS unset)\n")

# 2. Two workers boot, then open the checkpoint the session opens.
api_pool_start(2L, files, getwd(), api_dir)
on.exit(api_pool_stop(), add = TRUE)
s <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
if (!wait_for(function() api_pool_status()$idle == 2L)) stop("workers not ready: ", paste(unlist(api_pool_status()), collapse = " "))
cat("PASS two workers open the session's checkpoint\n")

# 3. Cards drawn on the workers, two at once, equal to the main process's own render.
sources <- c("results_dashboard-plot_pca", "results_dashboard-plot_violin", "qc_pca_tab-boxplotAfterNorm", "qc_pca_tab-outlierPlot")
ids <- vapply(sources, function(src) api_card_create(s, src)$instanceId, "")
jobs <- lapply(ids, function(id) api_pool_job(s, id, 620, 680, "auto"))
if (!all(vapply(jobs, inherits, logical(1), "api_pool_job"))) stop("a cacheable card was not sent to the pool")
outs <- await(promises::promise_all(.list = lapply(jobs, api_pool_submit)))
if (!all(vapply(outs, function(o) isTRUE(o$ok), logical(1))))
  stop("worker render failed: ", paste(vapply(outs, function(o) o$message %||% "", ""), collapse = " | "))
pids <- vapply(outs, `[[`, numeric(1), "pid")
stopifnot(length(unique(pids)) == 2L, !Sys.getpid() %in% pids)
overlap <- any(outer(seq_along(outs), seq_along(outs), Vectorize(function(i, j) i < j && pids[i] != pids[j] &&
  outs[[i]]$started < outs[[j]]$finished && outs[[j]]$started < outs[[i]]$finished)))
stopifnot(overlap)
results <- Map(function(j, o) api_pool_finish(j, o, function() stop("unexpected fallback")), jobs, outs)
stopifnot(all(vapply(results, function(r) identical(r$provenance$checkpointSha256, s$sha256), logical(1))))
# Stored in the main caches: asking again is answered by the main process at once.
stopifnot(all(vapply(ids, function(id) is.null(api_pool_job(s, id, 620, 680, "auto")), logical(1))))
api_render_cache_clear(s)
for (i in seq_along(ids)) if (!same_render(results[[i]], api_card_render(s, ids[[i]], 620, 680, "auto")))
  stop("worker render differs from the main render: ", sources[[i]])
cat("PASS workers draw cards in parallel (overlapping), equal to the main process's render (PNG bytes; Plotly traces to 1e-9)\n")

# 4. Session-level state follows the session: a targeted cohort set in the main process.
lipids <- head(api_cohort_lipids(s), 6L)
invisible(api_cohort_set(s, lipids))
job <- api_pool_job(s, ids[[1L]], 620, 680, "auto")
stopifnot(inherits(job, "api_pool_job"), identical(as.character(job$state$cohort), sort(lipids)))
out <- await(api_pool_submit(job)); stopifnot(isTRUE(out$ok))
api_render_cache_clear(s)
if (!same_render(out$value, api_card_render(s, ids[[1L]], 620, 680, "auto"))) stop("worker ignored the targeted cohort")
cat("PASS a worker applies the session's targeted cohort before drawing\n")
# 4b. Pilot F1: the session palette too (palette.R). The QC boxplot's groups take Team's session colours; the worker
# aligns through Team's own setter (restore) and draws what the main process draws.
groups <- sort(names(api_read(s, s$shared$color_maps()$Group1)))
invisible(api_palette_update(s, list(context = "Group1", colors = stats::setNames(list("#AA3300"), groups[[1L]]))))
job <- api_pool_job(s, ids[[3L]], 640, 680, "auto")
stopifnot(inherits(job, "api_pool_job"), identical(job$state$palette, api_palette_key(s)),
  identical(job$state$palette$customColors[[palette_context_key("Group1", groups[[1L]])]], "#AA3300"))
out <- await(api_pool_submit(job)); stopifnot(isTRUE(out$ok))
api_render_cache_clear(s)
if (!same_render(out$value, api_card_render(s, ids[[3L]], 640, 680, "auto"))) stop("worker ignored the session palette")
cat("PASS a worker applies the session palette before drawing\n")

# 5. A card changed by an action (no descriptor) and a format the card lacks stay in the main process.
api_render_cache_clear(s)
stopifnot(is.null(api_pool_job(s, ids[[3L]], 620, 680, "plotly")))
if (is.null(s$acted)) s$acted <- new.env(parent = emptyenv())
s$acted[[ids[[2L]]]] <- TRUE
stopifnot(is.null(api_pool_job(s, ids[[2L]], 620, 680, "auto")))
cat("PASS acted cards and foreign formats are drawn by the main process\n")

# 6. A worker that dies is replaced; the job is still answered.
api_pool$workers[[1L]]$proc$kill()
out <- await(api_pool_submit(api_pool_job(s, ids[[4L]], 640, 680, "auto")))
stopifnot(isTRUE(out$ok) || isTRUE(out$fallback))
if (!wait_for(function() api_pool_status()$idle == 2L)) stop("the dead worker was not replaced")
cat("PASS a dead worker is replaced and its checkpoint reopened\n")

# 7. No worker serves the job's checkpoint (the session moved meanwhile): the main process draws it.
bad <- api_pool_job(s, ids[[4L]], 660, 680, "auto"); bad$sha256 <- strrep("0", 64L)
out <- await(api_pool_submit(bad))
stopifnot(isTRUE(out$fallback), identical(api_pool_finish(bad, out, function() "drawn here"), "drawn here"))
cat("PASS a job no worker can take falls back to the main process\n")
# 7b. Computed controls (H9 review P1): a card whose explicit inputs carry a computed control (here a per-group
# colour, set the real way through api_card_update) stays on the main process. Sending it to a worker that sets the
# control after create was tried (retina-timing) and the worker's PNG differed from the main process's.
# Pilot F1: per-group pickers are offered where they reach the plot on a copy (the cellular polar map; QC's are dead
# and no longer offered, test_api_session_palette.R).
coloured <- api_card_create(s, "cellular_org_tab-polarPlot")$instanceId
api_card_update(s, coloured, list(useCustomColors = TRUE))
cols <- vapply(Filter(function(x) startsWith(x$id, "customCol_"), api_card_schema(s, coloured)$controls), `[[`, "", "id")
if (!length(cols)) stop("no customCol_ control after useCustomColors = TRUE")
api_card_update(s, coloured, setNames(list("#123456"), cols[[1L]]))
api_render_cache_clear(s)
stopifnot(is.null(api_pool_job(s, coloured, 700, 680, "auto")))
# Only the module's own refusal (422) is forwarded; any other worker error (400, 409 session_lost of the
# worker's session, 404) is the worker's problem: the main process draws the card.
job <- api_pool_job(s, ids[[3L]], 700, 680, "auto")
stopifnot(identical(api_pool_finish(job, list(ok = FALSE, class = "api_bad_request", message = "x"), function() "drawn here"), "drawn here"))
stopifnot(identical(api_pool_finish(job, list(ok = FALSE, class = "session_lost", message = "x"), function() "drawn here"), "drawn here"))
refused <- tryCatch(api_pool_finish(job, list(ok = FALSE, class = "api_unprocessable", message = "module says no"), function() "drawn here"), api_unprocessable = function(e) conditionMessage(e))
stopifnot(identical(refused, "module says no"))
cat("PASS computed-control cards stay in the main process; only the module's 422 is forwarded\n")

# 8. Over HTTP (run.R, two workers): the render route answers through a promise. Two renders
# sent together both come back, while a third request is served by the main process meanwhile.
api_pool_stop()
if (requireNamespace("plumber", quietly = TRUE) && requireNamespace("httr", quietly = TRUE) && requireNamespace("curl", quietly = TRUE)) local({
  directory <- tempfile(); dir.create(directory)
  stopifnot(file.copy("tests/dual-ui/fixtures/classic-seed7-synthetic.zip", file.path(directory, "synthetic.zip")))
  port <- httpuv::randomPort()
  child <- callr::r_bg(function(root, directory, port) {
    setwd(root)
    Sys.setenv(LIPIDOMIC_API_CHECKPOINT_DIR = directory, LIPIDOMIC_API_PORT = port, LIPIDOMIC_API_WORKERS = "2",
      LIPIDOMIC_STORAGE_DIR = file.path(directory, "store"), LIPIDOMIC_API_WORKSPACE = "pool-test")
    source("R/frontends/api/run.R")
  }, args = list(getwd(), directory, port), libpath = .libPaths(), cmdargs = "--vanilla")
  on.exit({ child$kill(); unlink(directory, recursive = TRUE) })
  base <- sprintf("http://127.0.0.1:%d/api/v1", port)
  get <- function(path) tryCatch(httr::content(httr::GET(paste0(base, path), httr::timeout(5))), error = function(e) NULL)
  deadline <- Sys.time() + 120
  while (is.null(get("/health")) && child$is_alive() && Sys.time() < deadline) Sys.sleep(0.3)
  if (is.null(get("/health"))) stop("API did not start: ", child$read_error())
  post <- function(path, body) httr::content(httr::POST(paste0(base, path), body = body, encode = "json", httr::timeout(300)))
  session <- post("/sessions", list(checkpointId = "synthetic"))
  stopifnot(identical(session$renderWorkers, 2L))
  cards <- vapply(c("results_dashboard-plot_pca", "qc_pca_tab-boxplotAfterNorm"), function(src)
    post(paste0("/sessions/", session$sessionId, "/cards"), list(source = src))$instanceId, "")
  deadline <- Sys.time() + 180
  while (!identical(get("/health")$workers$idle, 2L) && Sys.time() < deadline) Sys.sleep(0.5)
  stopifnot(identical(get("/health")$workers$idle, 2L))
  pool <- curl::new_pool(); answers <- list()
  for (card in cards) {
    h <- curl::new_handle(post = TRUE, postfields = '{"width":620,"height":680,"format":"auto"}')
    curl::handle_setheaders(h, "Content-Type" = "application/json")
    local({ id <- card; curl::curl_fetch_multi(sprintf("%s/sessions/%s/cards/%s/render", base, session$sessionId, id),
      done = function(r) answers[[id]] <<- list(status = r$status_code, type = r$type, size = length(r$content), at = Sys.time()),
      fail = function(e) answers[[id]] <<- list(status = 0L, error = e), handle = h, pool = pool) })
  }
  health <- curl::new_handle(); busy <- NA
  curl::curl_fetch_multi(paste0(base, "/health"), done = function(r) busy <<- jsonlite::fromJSON(rawToChar(r$content))$workers$busy,
    handle = health, pool = pool)
  curl::multi_run(timeout = 300, pool = pool)
  stopifnot(length(answers) == 2L, all(vapply(answers, function(a) identical(a$status, 200L), logical(1))))
  stopifnot(grepl("json", answers[[cards[[1L]]]]$type), identical(answers[[cards[[2L]]]]$type, "image/png"), answers[[cards[[2L]]]]$size > 1000L)
  # /health was answered while the workers drew: the main process was not held by the renders.
  stopifnot(isTRUE(busy >= 1L))
  again <- httr::POST(sprintf("%s/sessions/%s/cards/%s/render", base, session$sessionId, cards[[2L]]),
    body = list(width = 620, height = 680, format = "auto"), encode = "json")
  stopifnot(httr::status_code(again) == 200L, identical(httr::headers(again)[["content-type"]], "image/png"))
  cat(sprintf("PASS over HTTP two renders run on workers through promises; /health answered meanwhile (busy workers: %d)\n", busy))
}) else cat("SKIP part 8: plumber, httr or curl not installed\n")
cat("PASS test_api_pool\n")
