# www/team/js/input_batch.js is served only by the Team shell: each interface's page,
# rendered in its own R process, is checked for the script's code.
# Rscript tests/dual-ui/test_input_batch_team_only.R
marker <- "window.TeamInputBatch"
stopifnot(any(grepl(marker, readLines("www/team/js/input_batch.js"), fixed = TRUE)))
page_has <- function(interface) {
  out <- tempfile(fileext = ".html")
  code <- sprintf(paste0('Sys.setenv(LIPIDOMIC_INTERFACE="%s",LIPIDOMIC_PROJECT_LIBRARY="0");',
    'suppressPackageStartupMessages(source("R/global.R"));source("R/ui.R");',
    'r<-htmltools::renderTags(ui);writeLines(c(as.character(r$head),as.character(r$html)),"%s",useBytes=TRUE)'), interface, out)
  status <- system2(file.path(R.home("bin"), "Rscript"), c("--vanilla", "-e", shQuote(code)), stdout = FALSE, stderr = FALSE)
  if (status != 0L || !file.exists(out)) stop("could not render the ", interface, " page")
  html <- paste(readLines(out, warn = FALSE), collapse = "\n")
  grepl(marker, html, fixed = TRUE)
}
team <- page_has("team"); classic <- page_has("classic")
if (!team) stop("the Team page does not include input_batch.js")
if (classic) stop("the Classic page includes input_batch.js")
cat("PASS: input_batch.js is served by Team only\n")
