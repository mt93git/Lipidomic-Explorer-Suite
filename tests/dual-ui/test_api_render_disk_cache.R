# Render cache on disk, keyed by content (speed proposal, option 2). A reopened checkpoint,
# a restarted API or a second user must not pay Team's renders again when nothing that
# feeds the plot changed: code commit, checkpoint, card source and its explicit inputs,
# shared analysis settings, targeted cohort, study design, size and format.
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_render_disk_cache: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_render_disk_cache")
source("R/frontends/api/engine.R")
root <- tempfile(); cache_dir <- file.path(root, "render-cache")
Sys.setenv(LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_API_WORKSPACE = "disk-cache", LIPIDOMIC_API_RENDER_CACHE_DIR = cache_dir)
on.exit(unlink(root, recursive = TRUE), add = TRUE)
if (is.na(api_commit)) { cat("SKIP test_api_render_disk_cache: no git commit for the cache key\n"); quit(status = 0) }
files <- function() list.files(cache_dir, pattern = "\\.rds$", recursive = TRUE)
source <- "qc_pca_tab-pca2dPlot"

s <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
card <- api_card_create(s, source)
first <- api_card_render(s, card$instanceId, 620, 600)
if (isTRUE(first$cached)) stop("first render cannot be cached")
if (length(files()) != 1L) stop("a render must be written to the disk cache, found ", length(files()))
if (!startsWith(files()[[1L]], substr(api_commit, 1L, 12L))) stop("cache entries live under the code commit")
nodes <- list(list(kind = "plot", id = paste0(card$instanceId, "-pca2dPlot"), label = "PCA scores", x = 0, y = 0,
  width = 620, height = 720, visual = list(background = "#ffffff"),
  instance = list(id = card$instanceId, source = source, inputs = card$inputs)))
record <- api_checkpoint_save(s, "disk-cache", list(token = "disk-cache", state = list(version = "1", libraryHidden = FALSE, nodes = nodes)))
path <- api_checkpoint_path(record$id); id <- card$instanceId
api_session_close(s)
cat("PASS a render is written to the disk cache under the code commit\n")

open <- function() api_session_open(path)
s2 <- open(); miss <- api_card_render(s2, id, 620, 600); api_session_close(s2)
if (isTRUE(miss$cached)) stop("a saved card with new explicit inputs is a new key")
s3 <- open()
t0 <- Sys.time(); hit <- api_card_render(s3, id, 620, 600); elapsed <- as.numeric(Sys.time() - t0, units = "secs")
if (!isTRUE(hit$cached) || !isTRUE(hit$disk)) stop("reopened checkpoint must hit the disk cache")
if (!identical(hit$png, miss$png)) stop("disk hit must return the stored render")
if (exists(id, envir = s3$cards, inherits = FALSE)) stop("a disk hit must not re-create the card")
cat(sprintf("PASS a reopened checkpoint draws its saved card from disk without re-creating it (%.3f s)\n", elapsed))

entry <- api_catalog_entry(source)
pick <- Filter(function(c) identical(c$type, "select") && length(c$options) >= 2L && as.character(c$id) %in% entry$allowedInputs, entry$inputs)[[1L]]
values <- vapply(pick$options, function(o) as.character(o$value %||% o), character(1))
current <- as.character(api_card_get(s3, id)$inputs[[pick$id]] %||% "")
api_card_update(s3, id, stats::setNames(list(setdiff(values, current)[[1L]]), pick$id))
if (isTRUE(api_card_render(s3, id, 620, 600)$cached)) stop("a changed card input must miss")
if (isTRUE(api_card_render(s3, id, 640, 600)$cached)) stop("another size must miss")
api_session_close(s3)
cat("PASS a changed input or size misses\n")

s4 <- open()
api_analysis_update(s4, list(log2fcThreshold = 2))
if (isTRUE(api_card_render(s4, id, 620, 600)$cached)) stop("a changed analysis setting must miss")
lipids <- vapply(api_cohort_get(s4)$available, `[[`, character(1), "lipid")
api_cohort_set(s4, lipids[1:12])
if (isTRUE(api_card_render(s4, id, 620, 600)$cached)) stop("a changed cohort must miss")
api_session_close(s4)
cat("PASS a changed analysis setting or cohort misses\n")

s5 <- open(); saved_commit <- api_commit; api_commit <<- "0000000000000000000000000000000000000000"
other <- api_card_render(s5, id, 620, 600); api_commit <<- saved_commit; api_session_close(s5)
if (isTRUE(other$cached)) stop("another code commit must miss")
cat("PASS another code commit misses\n")

# Dashboard copies (results_dashboard-plot_*) come through the v0 route; a reopened checkpoint must
# draw them from disk without creating the module instance again.
d1 <- open(); a <- api_dashboard_v0_render(d1, "violin", list(), 620, 600); api_session_close(d1)
if (isTRUE(a$cached)) stop("first dashboard render cannot be cached")
d2 <- open()
t0 <- Sys.time(); b <- api_dashboard_v0_render(d2, "violin", list(), 620, 600); elapsed <- as.numeric(Sys.time() - t0, units = "secs")
if (!isTRUE(b$cached) || !isTRUE(b$disk)) stop("a reopened dashboard copy must hit the disk cache")
if (exists("tcinstance_v0_violin", envir = d2$cards, inherits = FALSE)) stop("a disk hit must not create the module instance")
if (!identical(b$figure, a$figure)) stop("the disk hit must equal the first render")
c2 <- api_dashboard_v0_render(d2, "violin", list(top_n = 10L), 620, 600)
if (isTRUE(c2$cached)) stop("changed dashboard inputs must miss")
api_session_close(d2)
cat(sprintf("PASS a reopened dashboard copy draws from disk without re-creating it (%.3f s)\n", elapsed))

# Nexo asks for Plotly cards with format "json" (frontends/nexo/src/cards.ts): the disk cache must
# treat it as the card's native JSON, or no Plotly card is ever stored.
src3 <- "qc_pca_tab-pca3dPlot"
p1 <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
pc <- api_card_create(p1, src3)
pnodes <- list(list(kind = "plot", id = paste0(pc$instanceId, "-pca3dPlot"), label = "PCA 3D", x = 0, y = 0,
  width = 620, height = 720, visual = list(background = "#ffffff"),
  instance = list(id = pc$instanceId, source = src3, inputs = pc$inputs)))
prec <- api_checkpoint_save(p1, "disk-cache-json", list(token = "disk-cache-json", state = list(version = "1", libraryHidden = FALSE, nodes = pnodes)))
ppath <- api_checkpoint_path(prec$id); pid <- pc$instanceId; api_session_close(p1)
# The first reopen records the saved inputs (a new key, as above); the next ones must hit.
for (i in 1:2) { q <- api_session_open(ppath); invisible(api_card_render(q, pid, 620, 600, "json")); api_session_close(q) }
q <- api_session_open(ppath)
t0 <- Sys.time(); jhit <- api_card_render(q, pid, 620, 600, "json"); elapsed <- as.numeric(Sys.time() - t0, units = "secs")
api_session_close(q)
if (!isTRUE(jhit$cached) || !isTRUE(jhit$disk)) stop("a Plotly card asked as json must hit the disk cache on reopen")
if (!identical(jhit$render, "plotly") || is.null(jhit$figure)) stop("the json disk hit returns the Plotly figure")
cat(sprintf("PASS a Plotly card asked as json is drawn from disk on reopen (%.3f s)\n", elapsed))
