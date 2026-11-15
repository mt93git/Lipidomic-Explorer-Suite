# Sweep: every catalog card's "More downloads" on the synthetic checkpoint.
log <- tempfile("dl-all-", fileext = ".log"); sink(log)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/engine.R")
s <- api_session_for_checkpoint("tests/dual-ui/fixtures/classic-seed7-synthetic.zip")
api_design(s, "Animal", "independent", TRUE)
say <- function(...) { sink(); cat(..., "\n", sep = ""); sink(log, append = TRUE) }
tot <- c(ok = 0L, err = 0L)
for (entry in api_catalog()) {
  card <- tryCatch(api_card_create(s, entry$id), error = function(e) NULL)
  if (is.null(card)) { say("NOCARD ", entry$id); next }
  if (entry$id %in% c("structural_tab-summaryPlot", "structural_tab-speciesPlotPlot")) try(api_card_update(s, card$instanceId, actions = "runAnalysis"))
  drawn <- tryCatch({ api_card_render(s, card$instanceId, 800, 600); "drawn" }, error = function(e) "gated")
  listed <- tryCatch(api_card_downloads(s, card$instanceId)$downloads, error = function(e) { say("LISTERR ", entry$id, " ", conditionMessage(e)); list() })
  parts <- vapply(listed, function(d) {
    r <- tryCatch(api_card_download(s, card$instanceId, d$id), error = function(e) e)
    if (inherits(r, "error")) { tot[["err"]] <<- tot[["err"]] + 1L; sprintf("%s[%s]=ERR(%s)", d$id, d$label, substr(gsub("[\r\n]+", " ", conditionMessage(r)), 1, 60)) }
    else { tot[["ok"]] <<- tot[["ok"]] + 1L; sprintf("%s[%s]=%s %dB", d$id, d$label, r$name, length(r$bytes)) }
  }, "")
  say(sprintf("%-42s %-6s n=%d %s", entry$id, drawn, length(listed), paste(parts, collapse = " | ")))
}
say(sprintf("SUMMARY ok=%d err=%d", tot[["ok"]], tot[["err"]]))
api_session_close(s)
