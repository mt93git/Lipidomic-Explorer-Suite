# Chart audit b06 (group comparison card): Team's drawer has two "Download All PDFs (ZIP)" and two "Download Dataset
# (CSV)" buttons, told apart only by the h6 heading above each pair ("Batch Exports: Lipid Category" / "… Lipid Main
# Class", R/modules/9_logratio_module.R l.86-91). Nexo listed four buttons with two identical names. A label shared by
# several downloads of one card now carries the heading it sits under; a unique label is unchanged.
#   Rscript tests/dual-ui/test_api_download_labels.R
if (!requireNamespace("xml2", quietly = TRUE)) { cat("SKIP test_api_download_labels: xml2 not installed\n"); quit(status = 0) }
source("R/frontends/api/export.R")
doc <- xml2::read_html(paste0(
  '<div id="p-wrap"><div id="p-logratioPlot"></div>',
  '<a id="p-downloadCsv" class="shiny-download-link">CSV</a>',
  '<h6>Batch Exports: Lipid Category</h6>',
  '<a id="p-downloadAllMacroZip" class="shiny-download-link">Download All PDFs (ZIP)</a>',
  '<a id="p-downloadAllMacroCsv" class="shiny-download-link">Download Dataset (CSV)</a>',
  '<h6>Batch Exports: Lipid Main Class</h6>',
  '<a id="p-downloadAllSubclassZip" class="shiny-download-link">Download All PDFs (ZIP)</a>',
  '<a id="p-downloadAllSubclassCsv" class="shiny-download-link">Download Dataset (CSV)</a></div>'))
anchor <- xml2::xml_find_first(doc, "//*[@id='p-logratioPlot']")
links <- api_qualify_download_labels(api_nearest_download_links(anchor, "p-"))
labels <- vapply(links, `[[`, "", "label")
stopifnot(identical(vapply(links, `[[`, "", "id"),
  c("downloadCsv", "downloadAllMacroZip", "downloadAllMacroCsv", "downloadAllSubclassZip", "downloadAllSubclassCsv")))
stopifnot(!anyDuplicated(labels))
stopifnot(identical(labels, c("CSV",
  "Download All PDFs (ZIP) \u00b7 Batch Exports: Lipid Category", "Download Dataset (CSV) \u00b7 Batch Exports: Lipid Category",
  "Download All PDFs (ZIP) \u00b7 Batch Exports: Lipid Main Class", "Download Dataset (CSV) \u00b7 Batch Exports: Lipid Main Class")))
stopifnot(all(vapply(links, function(x) identical(sort(names(x)), c("id", "label")), logical(1))))
cat("PASS duplicate download labels carry their section heading\n")
