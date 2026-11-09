# Abundance heatmap "Show: Significant only" (results_dashboard-plot_heat): the card schema carries Team's own
# status note for the heat_significance control, read from the rendered output heat_significance_status
# (R/results_dashboard.R: data-allowed and its text). Nexo never recomputes the guard or the criterion.
# Before the design is confirmed the option is unavailable and the note says why; after an independent design is
# confirmed it is available, and with Significant only chosen the note says how many lipids it shows.
# ASCII only: R on the RTX has no UTF-8 locale.
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_heat_significance: package", pkg, "not installed\n"); quit(status = 0)
}
fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
if (!file.exists(fixture)) { cat("SKIP test_api_heat_significance: fixture missing\n"); quit(status = 0) }
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_heat_significance")
source("frontends/nexo-api/engine.R")

s <- api_session_open(fixture)
on.exit(api_session_close(s), add = TRUE)
card <- api_card_create(s, "results_dashboard-plot_heat")
status_of <- function(schema) {
  controls <- Filter(function(x) identical(x$id, "heat_significance"), schema$controls)
  if (length(controls) != 1L) stop("heat_significance control missing from the heat card schema")
  st <- controls[[1L]]$status
  if (is.null(st)) stop("heat_significance carries no status: ", paste(names(controls[[1L]]), collapse = ", "))
  st
}

# 1. Not confirmed: unavailable, with Team's reason.
st <- status_of(api_card_schema(s, card$instanceId))
if (!identical(st$allowed, FALSE)) stop("before confirmation allowed should be FALSE, got ", deparse(st$allowed))
if (!is.character(st$text) || !startsWith(st$text, "Significant only is unavailable."))
  stop("before confirmation the note should say why, got ", deparse(st$text))
if (!identical(st$option, "significant")) stop("the status should name the option it gates, got ", deparse(st$option))
# It is JSON-serialisable as the route answers it (scalars, not vectors).
json <- jsonlite::toJSON(api_card_schema(s, card$instanceId), auto_unbox = TRUE, null = "null")
if (!grepl('"status":{"allowed":false', json, fixed = TRUE)) stop("the schema JSON does not carry status.allowed=false")
cat("PASS before confirmation: Significant only unavailable, Team's reason in the note\n")

# 2. Independent design confirmed: available; Significant only says how many lipids it shows.
api_design(s, "animal", "independent", TRUE)
st <- status_of(api_card_schema(s, card$instanceId))
if (!identical(st$allowed, TRUE)) stop("after confirmation allowed should be TRUE, got ", deparse(st$allowed), " text ", deparse(st$text))
api_card_update(s, card$instanceId, list(heat_significance = "significant"))
st <- status_of(api_card_schema(s, card$instanceId))
if (!identical(st$allowed, TRUE)) stop("Significant only chosen: allowed should stay TRUE, got ", deparse(st$allowed))
if (!is.character(st$text) || !grepl("^Showing [0-9]+ significant lipid", st$text))
  stop("Significant only chosen: the note should read Showing N significant lipids, got ", deparse(st$text))
cat("PASS after confirmation: Significant only available; note:", st$text, "\n")
cat("PASS test_api_heat_significance\n")
