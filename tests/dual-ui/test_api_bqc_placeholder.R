# FIX-PROD-C 1: with fewer than 2 BQC replicate samples (a dataset without BQC columns), Team's three "Batch …" views
# (R/modules/2_qc_boxplot_module.R output$bqcPlot, bqcDeviationPlot, bqcAbundancePlot) draw only a small grey
# sentence on an empty plot. On a Nexo board that image reads as a blank white card. The render answers that sentence
# instead (422, as Team's validate()/req() refusals), so the card says it; with 2 or more BQC samples it still draws.
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_bqc_placeholder: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_bqc_placeholder")
source("frontends/nexo-api/engine.R")

team <- paste(readLines("R/modules/2_qc_boxplot_module.R", warn = FALSE), collapse = "\n")
expected <- c(bqcPlot = "Please configure at least 2 BQC replicate samples to view plot.",
  bqcDeviationPlot = "Please configure at least 2 BQC replicate samples.",
  bqcAbundancePlot = "Please configure at least 2 BQC replicate samples.")
for (m in expected) if (!grepl(paste0('label = "', m, '"'), team, fixed = TRUE)) stop("Team's module no longer says: ", m)

# The synthetic checkpoint's samples carry no "BQC" in their names: Team selects no BQC replicate.
s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
render <- function(id) tryCatch(list(ok = TRUE, value = api_card_render(s, id, 620, 380)),
  error = function(e) list(ok = FALSE, class = class(e), message = conditionMessage(e)))

for (output in names(expected)) {
  card <- api_card_create(s, paste0("qc_pca_tab-", output))
  got <- render(card$instanceId)
  if (isTRUE(got$ok)) stop(output, " with no BQC samples answered a ", got$value$render, " image, not Team's message")
  if (!"api_unprocessable" %in% got$class || !identical(got$message, unname(expected[[output]])))
    stop(output, " answered ", paste(got$class, collapse = "/"), ": ", got$message)
  cat("PASS", output, "with no BQC samples answers Team's message:", got$message, "\n")
}

# Two samples chosen as BQC replicates: Team draws the plot, the card shows it.
card <- api_card_create(s, "qc_pca_tab-bqcAbundancePlot")
samples <- head(setdiff(api_read(s, names(s$shared$data_processed())), "Lipid_Name"), 2L)
api_card_update(s, card$instanceId, list(bqcSamples = samples))
got <- render(card$instanceId)
if (!isTRUE(got$ok) || !identical(got$value$render, "png") || length(got$value$png) < 4000L)
  stop("bqcAbundancePlot with 2 BQC samples did not draw: ", got$message %||% length(got$value$png))
cat("PASS bqcAbundancePlot with 2 BQC samples draws Team's plot (", length(got$value$png), "bytes )\n")
cat("PASS test_api_bqc_placeholder\n")
