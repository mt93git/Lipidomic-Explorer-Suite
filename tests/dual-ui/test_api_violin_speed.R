# The slowest card ("Selected-feature distributions", heatmap_barchart_tab-violin_plot_render) on the complete
# synthetic fixture: Team's module draws 60 violins with t-tests at ~11 s a draw. A create must draw the card's plot
# once, after the card's inputs settle (seeded instance inputs, echoed module updates, renderUI-built inputs), never
# once per settling round. Counted with a tracer on shiny's drawPlot, not with wall-clock.
# Parity: the image a card draws this way equals the one drawn in the eager order (plot output wanted before the
# module starts, every round redrawn), for the same inputs and size; each draw starts from the same RNG seed (the
# violins overlay jittered points), and the decoded PNGs are compared by sha256.
for (pkg in c("shiny", "jsonlite", "digest", "xml2", "png")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_violin_speed: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV",
  "LIPIDOMIC_API_WORKERS", "LIPIDOMIC_API_LAZY_OUTPUTS"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_violin_speed")
source("frontends/nexo-api/engine.R")
fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
if (!file.exists(fixture)) { cat("SKIP test_api_violin_speed: fixture missing\n"); quit(status = 0) }
source_id <- "heatmap_barchart_tab-violin_plot_render"
invisible(api_catalog()) # built once, outside the timed create

draws <- new.env(parent = emptyenv())
suppressMessages(trace("drawPlot", where = asNamespace("shiny"), print = FALSE, tracer = quote({
  draws[[name]] <- (draws[[name]] %||% 0L) + 1L
  set.seed(20261109L)
})))
on.exit(suppressMessages(untrace("drawPlot", where = asNamespace("shiny"))), add = TRUE)
drawn <- function(nodeId) draws[[nodeId]] %||% 0L
decoded_sha <- function(raw) digest::digest(png::readPNG(raw), algo = "sha256")

s <- api_session_open(fixture)
on.exit(api_session_close(s), add = TRUE)

# 1. One draw per create.
started <- Sys.time()
card <- api_card_create(s, source_id)
seconds <- as.numeric(difftime(Sys.time(), started, units = "secs"))
if (!isTRUE(card$settled)) stop("violin card did not settle")
if (drawn(card$nodeId) != 1L) stop(sprintf("FAIL create drew the violin %d times (expected 1)", drawn(card$nodeId)))
cat(sprintf("PASS create draws the violin once (%.1f s)\n", seconds))

# 2. The render at the card's plot height replays that draw: no new draw.
render <- api_card_render(s, card$instanceId, 620, card$plotHeight)
if (drawn(card$nodeId) != 1L) stop(sprintf("render redrew the violin (%d draws)", drawn(card$nodeId)))
cat("PASS render at 620 x plotHeight", card$plotHeight, "replays the create's draw\n")

# 3. Parity with the eager order: the reference card's plot output is wanted before its module starts.
reference_id <- "tcinstance_violinspeedeager"
reference_node <- paste0(reference_id, "-violin_plot_render")
s$lazy$wanted[[reference_node]] <- TRUE
reference <- api_card_create(s, source_id, instanceId = reference_id)
cat(sprintf("NOTE eager order drew the reference %d times\n", drawn(reference_node)))
if (!identical(reference$plotHeight, card$plotHeight)) stop("plotHeight ", card$plotHeight, " != eager ", reference$plotHeight)
if (!identical(api_canonical_json(reference$inputs), api_canonical_json(card$inputs))) stop("settled inputs differ from the eager order")
eager <- api_card_render(s, reference_id, 620, reference$plotHeight)
if (!identical(decoded_sha(render$png), decoded_sha(eager$png)))
  stop("decoded PNG differs from the eager order: ", decoded_sha(render$png), " != ", decoded_sha(eager$png))
cat(sprintf("PASS parity: decoded PNG at 620x%d identical to the eager order (sha256 %s); plotHeight %d unchanged\n",
  card$plotHeight, substr(decoded_sha(render$png), 1, 16), card$plotHeight))

# 4. Machine-dependent wall-clock budget: opt in with NEXO_API_PERF=1.
if (identical(Sys.getenv("NEXO_API_PERF"), "1")) {
  budget <- as.numeric(Sys.getenv("NEXO_VIOLIN_CREATE_BUDGET_S", "20"))
  if (seconds > budget) stop(sprintf("violin create took %.1f s (budget %.0f s)", seconds, budget))
  cat(sprintf("PASS violin create %.1f s within %.0f s\n", seconds, budget))
} else cat("SKIP test_api_violin_speed wall-clock budget: set NEXO_API_PERF=1 to run timing budgets\n")
cat("PASS test_api_violin_speed\n")
