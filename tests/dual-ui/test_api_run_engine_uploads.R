# Chart audit b11 round 2 (pathwayPlot / pathwayVisNetwork, F3): on the live audit API (96b8742d) the Data tab had no
# "Upload Layout JSON (.json):" field. api_card_schema (schema.R) lists a card's file inputs only if
# api_card_upload_controls (export.R) exists in its environment; run.R sources its engine files into globalenv but not
# export.R, which only plumber.R sources (local = TRUE, the router's own environment). So the served schema said
# uploads = [] while test_api_pathway_layout_json.R, which loads engine.R (with export.R), passed. This test loads the
# engine the way run.R does (its own api_engine_files list) and asks for the pathway card's uploads.
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_run_engine_uploads: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_run_engine_uploads")
# run.R's list of engine files, read from run.R itself (not engine.R, which tests use).
run <- parse("frontends/nexo-api/run.R")
def <- Filter(function(e) is.call(e) && identical(e[[1L]], as.name("<-")) && identical(e[[2L]], as.name("api_engine_files")), as.list(run))
if (length(def) != 1L) stop("run.R: api_engine_files not found")
api_engine_files <- eval(def[[1L]][[3L]], globalenv())
api_run_dir <- "frontends/nexo-api"
for (file in api_engine_files) source(file.path(api_run_dir, file), local = globalenv())

s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
for (source in c("pathway_tab-pathwayPlot", "pathway_tab-pathwayVisNetwork")) {
  card <- api_card_create(s, source)
  uploads <- api_card_schema(s, card$instanceId)$uploads
  ids <- vapply(uploads, function(u) u$id, "")
  if (!identical(ids, "upload_config"))
    stop(source, ": the schema served by run.R's engine lists uploads [", paste(ids, collapse = ", "), "], not upload_config")
  if (!identical(uploads[[1L]]$label, "Upload Layout JSON (.json):")) stop(source, ": upload label ", deparse(uploads[[1L]]$label))
  cat("PASS", source, "schema lists Team's \"Upload Layout JSON (.json):\" when the engine is loaded as run.R loads it\n")
}
cat("PASS test_api_run_engine_uploads\n")
