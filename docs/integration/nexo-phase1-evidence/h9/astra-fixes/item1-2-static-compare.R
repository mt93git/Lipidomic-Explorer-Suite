# Ran in an r-base container (R 4.6, shiny 1.13.0, bslib, plotly 4.12.1, xml2) from the repo root.
source("docs/integration/nexo-phase1-evidence/h9/astra-fixes/item1-2-static-compare-load.R")  # stubs jqui_resizable etc.; sources Team UI files
old <- new.env(); sys.source(Sys.getenv("OLD_EXPORT_R"), envir = old)  # git show 14cd4ad5:R/frontends/api/export.R > file
new <- new.env(); sys.source("R/frontends/api/export.R", envir = new)
sp <- "tcinstance_schema-"
lk <- function(id, label) list(id = id, label = label, section = "")
sim_carriers <- list(structural_tab = list("tcinstance_schema-prop_subtab_download_buttons_ui" = list(lk("downloadPropCSV", "CSV"), lk("downloadPropPDF", "PDF"))))
fams <- c(names(team_plot_instance_families), "team_cell")
changed <- 0L; total <- 0L
for (fam in fams) {
  doc <- team_plot_instance_schema_doc(fam)
  sources <- new$api_family_plot_sources(fam)
  plots <- paste0(sp, unique(unlist(lapply(sources, function(src) c(team_plot_instance_source(src)$output, team_plot_instance_layout(src)$wrappers)))))
  carriers <- sim_carriers[[fam]] %||% list()
  for (src in sources) {
    r <- team_plot_instance_source(src); w <- team_plot_instance_layout(src)$wrappers
    hit <- NULL
    for (key in c(r$output, w)) { h <- xml2::xml_find_first(doc, sprintf("//*[@id='%s%s']", sp, key)); if (!inherits(h, "xml_missing")) { hit <- h; break } }
    if (is.null(hit)) { cat(sprintf("%-45s NO STATIC ANCHOR (wrappers: %s)\n", src, paste(w, collapse = ","))); next }
    a <- vapply(old$api_nearest_download_links(hit, sp, carriers), `[[`, "", "id")
    b <- vapply(new$api_nearest_download_links(hit, sp, carriers, plots), `[[`, "", "id")
    total <- total + 1L
    if (!identical(a, b)) { changed <- changed + 1L; cat(sprintf("CHANGED %-45s\n   old: %s\n   new: %s\n", src, paste(a, collapse = ", "), paste(b, collapse = ", "))) }
    else cat(sprintf("same    %-45s %s\n", src, paste(a, collapse = ", ")))
  }
}
cat("static anchors compared:", total, " changed:", changed, "\n")
