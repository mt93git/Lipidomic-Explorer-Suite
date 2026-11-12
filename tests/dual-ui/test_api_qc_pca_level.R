if (!requireNamespace("xml2", quietly = TRUE)) { cat("SKIP test_api_qc_pca_level: package xml2 not installed\n"); quit(status = 0) }
for (pkg in c("jsonlite", "zip")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_qc_pca_level")
source("frontends/nexo-api/engine.R")
# NEXO-P6 item 1. Team's QC PCA (shared_data pca_results) reads the QC module's settings: the restored
# qc_pca_tab-pcaMode ("class" = one loading per lipid class, Team's guided preparation default). Nexo has no QC
# module and drew every QC card with "omics" (one loading per species).
fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
with_inputs <- function(inputs) {
  dir <- tempfile("qc-pca-level-"); dir.create(dir)
  utils::unzip(fixture, exdir = dir)
  state <- jsonlite::read_json(file.path(dir, "state.json"))
  state$inputs <- utils::modifyList(state$inputs %||% list(), inputs)
  jsonlite::write_json(state, file.path(dir, "state.json"), auto_unbox = TRUE, null = "null", digits = NA)
  zip <- tempfile("qc-pca-level-", fileext = ".zip")
  zip::zipr(zip, list.files(dir, full.names = TRUE))
  zip
}
loading_points <- function(s) {
  card <- api_card_create(s, "qc_pca_tab-load2dVectorPlot")
  # Class mode turns on smart labels, which only the original (PNG) view draws: switch them off to read the points.
  api_card_update(s, card$instanceId, list(smartLabelLoad2D = FALSE))
  figure <- api_card_render(s, card$instanceId, 800, 600)$figure
  markers <- Filter(function(t) identical(t$mode, "markers"), figure$data)
  sum(vapply(markers, function(t) length(unlist(t$x)), integer(1)))
}
classes <- function(s) {
  anno <- api_read(s, s$shared$annotationData()); df <- api_read(s, s$shared$data_processed_allow_missing())
  length(unique(anno$subclass[anno$Lipid_Name %in% df$Lipid_Name & anno$subclass != "Misc"]))
}

local({
  s <- api_session_for_checkpoint(with_inputs(list(`qc_pca_tab-pcaMode` = "class")))
  on.exit(api_session_close(s))
  n <- loading_points(s)
  if (n != classes(s)) stop("loadings: ", n, " points, expected one per class (", classes(s), ")")
  stopifnot(identical(api_read(s, s$shared$pca_settings()$pcaMode), "class"))
  cat("PASS saved class level: one loading point per class\n")
})

local({
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  df <- api_read(s, s$shared$data_processed_allow_missing())
  stopifnot(identical(api_read(s, s$shared$pca_settings()$pcaMode), "omics"))
  n <- loading_points(s)
  if (n != nrow(df)) stop("loadings: ", n, " points, expected one per species (", nrow(df), ")")
  cat("PASS nothing saved: Classic default omics, one loading point per species\n")
})
