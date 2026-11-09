# Cold open (H9). Team's browser computes only the outputs on screen (suspendWhenHidden): on the canvas, the Data
# page's renderUI slots and the original dashboard outputs are hidden. MockShinySession ran them all at every flush of
# the open (the pilot checkpoint: 63 outputs, 6.5 s, one Data slot forcing the lipid PCA). The API never reads the
# original dashboard outputs (it draws dashboard copies) and reads Data slots only for analysis settings, so both now
# wait behind the lazy gate until asked. The same render functions compute them when asked: science is unchanged.
for (pkg in c("shiny", "jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_lazy_open: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_lazy_open")
source("frontends/nexo-api/engine.R")

s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
gated <- function(name) is.function(s$lazy$gates[[name]]) && !isTRUE(shiny::isolate(s$lazy$gates[[name]]()))

# 1. Hidden outputs wait: the original dashboard plots and the Data page's server-built selectors.
for (name in c("results_dashboard-plot_pca", "results_dashboard-plot_dist", "results_dashboard-select_heat",
  "data_hub-customColorClassUI", "data_hub-deReferenceGroupUI"))
  if (!gated(name)) stop("output computed eagerly at open: ", name)
cat("PASS the original dashboard outputs and the Data page slots wait behind the lazy gate at open\n")

# 2. The open is still complete: the receipt matches and a dashboard copy draws.
stopifnot(identical(s$receipt, "matches archived receipt"))
card <- api_card_create(s, "results_dashboard-plot_pca")
figure <- api_card_render(s, card$instanceId, width = 600, height = 400, format = "json")
stopifnot(!is.null(figure$figure))
cat("PASS the receipt matches and a dashboard copy still renders\n")

# 3. Asked for, a gated slot computes with Team's own function (analysis settings read Data slots this way).
api_output_want(s, "data_hub-deReferenceGroupUI")
stopifnot(!gated("data_hub-deReferenceGroupUI"))
value <- tryCatch(api_read(s, s$mock$getOutput("data_hub-deReferenceGroupUI")), error = function(e) e)
stopifnot(!inherits(value, "error") || inherits(value, "shiny.silent.error"))
cat("PASS a wanted Data slot opens its gate and computes on request\n")
cat("PASS test_api_lazy_open\n")
