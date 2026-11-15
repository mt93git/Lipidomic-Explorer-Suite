# Astra review 2026-11-08 (chart audits b07 F5 and b06 row 7): "More downloads from this analysis" must list the
# downloads that belong to the card's own plot, and all of them.
#  - b07 F5: the structural networkPlot card listed the proportions panel's CSV/PDF (downloadPropCSV/downloadPropPDF):
#    api_nearest_download_links climbed to the first ancestor holding any download link. Team has no download for
#    the network, so its list is empty.
#  - b06 row 7: the violin distributions card (logratio_tab-logratioPlot) did not offer Team's four "Batch Exports"
#    (downloadAllMacroZip/Csv, downloadAllSubclassZip/Csv, R/modules/9_logratio_module.R l.86-92): the walk stopped at
#    the card body that holds "Export PDF"/"Export Data", and the batch buttons sit in the module's sidebar.
# Rule: a download belongs to the plot(s) nearest to it — the smallest container around the button that holds a plot
# output. The card lists, nearest first, every button (outside other tab panes) whose smallest such container holds
# the card's plot.
#   Rscript tests/dual-ui/test_api_download_ownership.R
# Part 1 (synthetic markup) needs only xml2; part 2 (a live Team session) is skipped when Team cannot run.
if (!requireNamespace("xml2", quietly = TRUE)) { cat("SKIP test_api_download_ownership: xml2 not installed\n"); quit(status = 0) }
local({
  source("frontends/nexo-api/export.R", local = TRUE)
  ids <- function(links) vapply(links, `[[`, "", "id")
  at <- function(doc, id) xml2::xml_find_first(doc, sprintf("//*[@id='%s']", id))
  # b07 F5 shape: summary and network in two tab panes (navset_card_tab), the proportions card beside them with its
  # download block built by a renderUI (prop_subtab_download_buttons_ui, a carrier).
  doc <- xml2::read_html(paste0(
    '<div id="p-root"><div class="tab-content">',
    '<div class="tab-pane" id="t1"><a id="p-downloadSummaryCSV" class="shiny-download-link">CSV</a>',
    '<div id="p-summaryPlot" class="shiny-plot-output"></div></div>',
    '<div class="tab-pane active" id="t2"><div class="row"><div class="card"><select id="p-networkLevel"></select></div>',
    '<div><div id="p-networkPlot" class="shiny-plot-output"></div><p>Methodology note</p></div></div></div></div>',
    '<div class="card"><div class="card-header"><span>Main Class Linkage</span>',
    '<div id="p-prop_subtab_download_buttons_ui" class="shiny-html-output"></div></div>',
    '<div class="card-body"><div class="tab-content"><div class="tab-pane active" id="t3">',
    '<div id="p-propPlotPlot" class="shiny-plot-output"></div></div>',
    '<div class="tab-pane" id="t4"><div id="p-diffAcylPlot" class="shiny-plot-output"></div></div></div></div></div></div>'))
  carriers <- list("p-prop_subtab_download_buttons_ui" = list(
    list(id = "downloadPropCSV", label = "CSV", section = ""), list(id = "downloadPropPDF", label = "PDF", section = "")))
  network <- api_nearest_download_links(at(doc, "p-networkPlot"), "p-", carriers)
  if (length(network)) stop("FAIL b07 F5: the network card lists another plot's downloads: ", paste(ids(network), collapse = ", "))
  prop <- api_nearest_download_links(at(doc, "p-propPlotPlot"), "p-", carriers)
  if (!identical(ids(prop), c("downloadPropCSV", "downloadPropPDF"))) stop("FAIL proportions card lost its downloads: ", paste(ids(prop), collapse = ", "))
  summary <- api_nearest_download_links(at(doc, "p-summaryPlot"), "p-", carriers)
  if (!identical(ids(summary), "downloadSummaryCSV")) stop("FAIL summary card: ", paste(ids(summary), collapse = ", "))
  cat("PASS b07 F5: the network lists no download of another plot; proportions and summary keep theirs\n")

  # A renderUI carrier that draws another plot together with its buttons (as the heatmap module does) belongs to
  # that plot, even when it sits next to this card's plot.
  doc <- xml2::read_html(paste0('<div id="p-root"><div id="p-mine" class="shiny-plot-output"></div>',
    '<div id="p-other_ui" class="shiny-html-output"></div></div>'))
  other <- list("p-other_ui" = list(list(id = "downloadOther", label = "CSV", section = "")))
  if (length(api_nearest_download_links(at(doc, "p-mine"), "p-", other, plots = "p-other_ui")))
    stop("FAIL a carrier that draws another plot must not give its downloads to this card")
  if (!identical(ids(api_nearest_download_links(at(doc, "p-mine"), "p-", other)), "downloadOther"))
    stop("FAIL a carrier with no plot beside a single plot belongs to that plot")
  cat("PASS a carrier that draws its own plot keeps its downloads\n")

  # b06 row 7 shape (logratio_ui): the batch exports in the sidebar, Export PDF/Data in the card body, the plot inside
  # a renderUI wrapper (scrollable_plot_ui) that is the card's anchor in the static markup.
  doc <- xml2::read_html(paste0(
    '<div id="p-root" class="bslib-sidebar-layout"><aside class="sidebar"><h5>Violin Plots</h5>',
    '<input id="p-showSignificantOnly" type="checkbox"><hr><hr>',
    '<h6>Batch Exports: Lipid Category</h6>',
    '<a id="p-downloadAllMacroZip" class="shiny-download-link">Download All PDFs (ZIP)</a>',
    '<a id="p-downloadAllMacroCsv" class="shiny-download-link">Download Dataset (CSV)</a>',
    '<h6>Batch Exports: Lipid Main Class</h6>',
    '<a id="p-downloadAllSubclassZip" class="shiny-download-link">Download All PDFs (ZIP)</a>',
    '<a id="p-downloadAllSubclassCsv" class="shiny-download-link">Download Dataset (CSV)</a><hr></aside>',
    '<div class="main"><div class="card"><div class="card-header"><div id="p-dynamicPlotTitle" class="shiny-html-output"></div></div>',
    '<div class="card-body"><div class="bg-light"><div><input id="p-plotHeight"></div><div class="d-flex gap-2">',
    '<a id="p-downloadPlot" class="shiny-download-link">Export PDF</a>',
    '<a id="p-downloadCSV" class="shiny-download-link">Export Data</a></div></div>',
    '<div><div id="p-scrollable_plot_ui" class="shiny-html-output"></div></div></div></div></div></div>'))
  links <- api_qualify_download_labels(api_nearest_download_links(at(doc, "p-scrollable_plot_ui"), "p-"))
  want <- c("downloadPlot", "downloadCSV", "downloadAllMacroZip", "downloadAllMacroCsv", "downloadAllSubclassZip", "downloadAllSubclassCsv")
  if (!identical(ids(links), want)) stop("FAIL b06 row 7: the violin card's downloads are ", paste(ids(links), collapse = ", "),
    "; expected ", paste(want, collapse = ", "))
  labels <- vapply(links, `[[`, "", "label")
  if (!identical(labels, c("Export PDF", "Export Data",
      "Download All PDFs (ZIP) \u00b7 Batch Exports: Lipid Category", "Download Dataset (CSV) \u00b7 Batch Exports: Lipid Category",
      "Download All PDFs (ZIP) \u00b7 Batch Exports: Lipid Main Class", "Download Dataset (CSV) \u00b7 Batch Exports: Lipid Main Class")))
    stop("FAIL b06 row 7 labels: ", paste(labels, collapse = " | "))
  cat("PASS b06 row 7: the violin card offers Export PDF/Data and the four batch exports, told apart by their heading\n")

  # Unchanged: a card whose buttons sit in its own card header keeps exactly those (bar chart / structural grid shape),
  # the buttons of a sibling card beside it are not added.
  doc <- xml2::read_html(paste0('<div id="p-root"><div class="card"><div class="card-header">',
    '<a id="p-downloadHeatmapCSV" class="shiny-download-link">CSV</a><a id="p-downloadHeatmapPDF" class="shiny-download-link">PDF</a></div>',
    '<div class="card-body"><div id="p-heatmapPlot" class="shiny-plot-output"></div></div></div>',
    '<div class="card"><div class="card-header"><a id="p-downloadDotplotCSV" class="shiny-download-link">CSV</a></div>',
    '<div class="card-body"><div id="p-dotplotPlot" class="shiny-plot-output"></div></div></div></div>'))
  if (!identical(ids(api_nearest_download_links(at(doc, "p-heatmapPlot"), "p-")), c("downloadHeatmapCSV", "downloadHeatmapPDF")))
    stop("FAIL sibling cards: the heatmap card must keep exactly its own two downloads")
  if (!identical(ids(api_nearest_download_links(at(doc, "p-dotplotPlot"), "p-")), "downloadDotplotCSV"))
    stop("FAIL sibling cards: the dotplot card must keep exactly its own download")
  cat("PASS sibling cards keep exactly their own downloads\n")
})

# Part 2: the same rule on Team's real module markup, in a live session (the coordinator runs this on a machine with R
# and Team's packages).
for (pkg in c("shiny", "jsonlite", "zip")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_download_ownership part 2: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_download_ownership")
source("frontends/nexo-api/engine.R")
Sys.setenv(LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
local({
  s <- api_session_for_checkpoint("tests/dual-ui/fixtures/classic-seed7-synthetic.zip")
  on.exit(api_session_close(s))
  stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
  listed <- function(source, width = 620, height = 680) {
    card <- api_card_create(s, source)
    tryCatch(api_card_render(s, card$instanceId, width, height), error = function(e) NULL)
    out <- api_card_downloads(s, card$instanceId)$downloads
    list(card = card, ids = vapply(out, `[[`, "", "id"), labels = vapply(out, `[[`, "", "label"))
  }
  network <- listed("structural_tab-networkPlot")
  if (length(network$ids)) stop("FAIL b07 F5: structural networkPlot lists ", paste(network$ids, collapse = ", "), " (Team has no download for the network)")
  prop <- listed("structural_tab-propPlotPlot")
  if (!identical(prop$ids, c("downloadPropCSV", "downloadPropPDF"))) stop("FAIL propPlotPlot downloads changed: ", paste(prop$ids, collapse = ", "))
  cat("PASS b07 F5 live: networkPlot lists nothing; propPlotPlot keeps downloadPropCSV/downloadPropPDF\n")

  violin <- listed("logratio_tab-logratioPlot")
  batch <- c("downloadAllMacroZip", "downloadAllMacroCsv", "downloadAllSubclassZip", "downloadAllSubclassCsv")
  # The module decides the order of its own two buttons (the production tree lists Export Data first); the batch four follow.
  if (length(violin$ids) != 6L || !setequal(violin$ids[1:2], c("downloadPlot", "downloadCSV")) || !identical(violin$ids[3:6], batch))
    stop("FAIL b06 row 7 live: logratioPlot lists ", paste(violin$ids, collapse = ", "))
  if (anyDuplicated(violin$labels) || !all(grepl("\u00b7 Batch Exports: Lipid (Category|Main Class)$", violin$labels[3:6])))
    stop("FAIL b06 row 7 live labels: ", paste(violin$labels, collapse = " | "))
  zip <- api_card_download(s, violin$card$instanceId, "downloadAllMacroCsv")
  if (!length(zip$bytes)) stop("FAIL the batch CSV download is empty")
  cat("PASS b06 row 7 live: logratioPlot offers Export PDF/Data and the four batch exports; one batch CSV serves\n")

  # Downloads that must not change.
  gc <- listed("group_comparison_tab-comparisonPlot")
  if (!all(batch %in% gc$ids)) stop("FAIL group comparison lost its batch exports: ", paste(gc$ids, collapse = ", "))
  dash <- listed("results_dashboard-plot_violin", 620, 600)
  if (!identical(dash$ids, "dl_violin")) stop("FAIL dashboard violin downloads changed: ", paste(dash$ids, collapse = ", "))
  bar <- listed("barchart-barPlotUnfiltered", 620, 380)
  if (!identical(bar$ids, c("downloadBarCSV_Unfiltered", "downloadBarPDF_Unfiltered")) || !identical(bar$labels, c("CSV", "PDF")))
    stop("FAIL bar chart downloads changed: ", paste(bar$ids, collapse = ", "))
  grid <- listed("structural_grid_tab-diffAllPlot", 620, 520)
  if (!identical(grid$ids, c("downloadDiffAllCSV", "downloadDiffAllPDF"))) stop("FAIL structural grid diffAll downloads changed: ", paste(grid$ids, collapse = ", "))
  cat("PASS unchanged: group comparison batch exports, dashboard violin, bar chart, structural grid diffAll\n")
})
cat("PASS test_api_download_ownership\n")
