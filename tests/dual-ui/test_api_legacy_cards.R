# Legacy dashboard nodes (a Team canvas node with no instance, its id results_dashboard-plot_<output>) draw
# through the v0 route, which may answer from the render disk cache without creating tcinstance_v0_<output>.
# The inspector then asks that id for its controls (schema) and patches it: the API must answer it on demand
# instead of 404 (pilot checkpoint: the Data tab of the dashboard PCA and violin failed to load).
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_legacy_cards: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_legacy_cards")
source("frontends/nexo-api/engine.R")

s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
stopifnot(!exists("tcinstance_v0_violin", envir = s$cards, inherits = FALSE))

# 1. The schema of a dashboard output's v0 instance answers before anything drew it.
schema <- tryCatch(api_card_schema(s, "tcinstance_v0_violin"), error = identity)
if (inherits(schema, "error")) stop("schema of tcinstance_v0_violin before a render: ", conditionMessage(schema))
stopifnot("violin_lipid" %in% vapply(schema$controls, function(c) c$id, ""))
cat("PASS the v0 dashboard instance answers its schema on demand\n")

# 2. Created on demand as the v0 route creates it: from the session's dashboard values, without dirtying.
stopifnot(exists("tcinstance_v0_violin", envir = s$cards, inherits = FALSE), !isTRUE(s$dirty))
updated <- api_card_update(s, "tcinstance_v0_pca", list())
stopifnot(is.list(updated))
cat("PASS a v0 dashboard instance is patchable on demand and the session stays clean\n")

# 3. Anything else is still unknown.
unknown <- tryCatch(api_card_schema(s, "tcinstance_v0_nothing"), error = identity)
stopifnot(inherits(unknown, "api_not_found"))
cat("PASS other ids stay unknown\n")
cat("PASS test_api_legacy_cards\n")
