# Chart audit b07 (structural summaryPlot): Shiny's updateNumericInput sends its value formatted as text
# (formatNoSci), and the browser's numeric binding reads it back as a number. The engine echoed the text, so after
# Text Size 14 the module computed input$textSize / 3 on "14" and the render failed with a generic 500
# ("non-numeric argument to binary operator"). An echo to an input that already holds a number stays a number.
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_echo_numeric: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_echo_numeric")
source("frontends/nexo-api/engine.R")

# 1. The bus: a text echo to a numeric input is set as a number; a text input stays text.
mock <- shiny::MockShinySession$new()
mock$setInputs(size = 10, label = "a")
bus <- api_bus()
bus$echo("size", list(value = "14")); bus$echo("label", list(value = "14"))
bus$drain_echo(mock)
got <- shiny::isolate(list(size = mock$input$size, label = mock$input$label))
if (!identical(got$size, 14)) stop("echoed numeric input became: ", deparse(got$size))
if (!identical(got$label, "14")) stop("echoed text input became: ", deparse(got$label))
cat("PASS an echo to a numeric input stays numeric\n")
mock$close()

# 2. The card: structural summaryPlot keeps its two Text Size inputs in sync with updateNumericInput.
s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
card <- api_card_create(s, "structural_tab-summaryPlot")
updated <- api_card_update(s, card$instanceId, list(textSize = 14))
for (id in c("textSize", "bottom_textSize"))
  if (!identical(updated$inputs[[id]], 14)) stop("summaryPlot ", id, " after Text Size 14: ", deparse(updated$inputs[[id]]))
cat("PASS summaryPlot Text Size stays numeric through the module's own sync\n")
cat("PASS test_api_echo_numeric\n")
