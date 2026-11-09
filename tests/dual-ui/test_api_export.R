# H6a: publication export and per-card data through Team's own code.
for (pkg in c("shiny", "jsonlite", "zip")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_export: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_export")
source("R/frontends/api/engine.R")
source("R/frontends/api/statistics.R")
fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
local({
  presets <- api_export_presets()
  keys <- vapply(presets$presets, `[[`, "", "key")
  stopifnot(identical(keys, names(EXPORT_JOURNAL_PRESETS)), presets$presets[[1L]]$single_col_mm == 89,
    identical(vapply(presets$figures, `[[`, "", "key"), c("pca_2d", "volcano", "class_abundance", "heatmap")))
  cat("PASS export presets\n")

  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
  bad <- function(body) inherits(tryCatch(api_export_bundle(s, body), error = identity), "api_bad_request")
  stopifnot(bad(list(figureKey = "nope")), bad(list(preset = "lancet")), bad(list(dpi = 450)),
    bad(list(widthMm = 10)), bad(list(formats = list("gif"))), bad(list(fontFamily = "comic")))
  cat("PASS export 400\n")

  members <- function(bytes) { f <- tempfile(fileext = ".zip"); on.exit(unlink(f)); writeBin(bytes, f); sort(zip::zip_list(f)$filename) }
  member <- function(bytes, name) {
    f <- tempfile(fileext = ".zip"); d <- tempfile(); on.exit(unlink(c(f, d), recursive = TRUE))
    writeBin(bytes, f); zip::unzip(f, files = name, exdir = d); readBin(file.path(d, name), "raw", n = 1e8)
  }
  formats <- list("pdf", "png", "csv", "rscript")
  exported <- 0L
  for (key in c("pca_2d", "volcano", "class_abundance", "heatmap")) {
    result <- tryCatch(api_export_bundle(s, list(figureKey = key, preset = "nature", widthMm = 89,
      heightMm = 89, dpi = 300, formats = formats)), api_unprocessable = function(e) e)
    if (inherits(result, "api_unprocessable")) { cat("PASS export", key, "422:", conditionMessage(result), "\n"); next }
    # Reference: Team's own call, same session and settings.
    art <- api_read(s, generate_export_artifacts(key, s$shared, base_pt = 7.5, font_family = "sans", hybrid_mode = TRUE))
    file <- tempfile(fileext = ".zip")
    api_read(s, team_export_studio_write_bundle(file, art, list(pdf = TRUE, svg = FALSE, png = TRUE, tiff = FALSE,
      csv = TRUE, rscript = TRUE), 89, 89, 300, 7.5, "nature", "sans", TRUE))
    reference <- readBin(file, "raw", n = file.info(file)$size); unlink(file)
    stopifnot(identical(members(result$bytes), members(reference)),
      any(grepl("[.]csv$", members(result$bytes))), "figure_provenance.json" %in% members(result$bytes))
    csv <- grep("[.]csv$", members(result$bytes), value = TRUE)
    stopifnot(identical(member(result$bytes, csv), member(reference, csv)))
    strip <- function(x) { x <- jsonlite::fromJSON(rawToChar(x), simplifyVector = FALSE); x[!grepl("time|date|generated", names(x), ignore.case = TRUE)] }
    stopifnot(identical(strip(member(result$bytes, "figure_provenance.json")), strip(member(reference, "figure_provenance.json"))))
    exported <- exported + 1L
    cat("PASS export", key, "members+csv+provenance match Team\n")
  }
  stopifnot(exported >= 2L)

  # A finished legacy dashboard node never renders live, so its v0 instance does not
  # exist yet; its CSV still comes from the module, without dirtying the session.
  s$dirty <- FALSE  # the volcano export above confirmed the design; start clean
  stopifnot(!exists("tcinstance_v0_violin", envir = s$cards, inherits = FALSE))
  legacy <- api_card_csv(s, "tcinstance_v0_violin")
  stopifnot(grepl("^results_lipid_violin_.*[.]csv$", legacy$name), length(legacy$bytes) > 100L, !isTRUE(s$dirty))
  cat("PASS legacy dashboard data.csv without a live render\n")

  violin <- api_card_create(s, "results_dashboard-plot_violin")
  api_card_render(s, violin$instanceId, 620, 600)
  csv <- api_card_csv(s, violin$instanceId)
  text <- rawToChar(csv$bytes)
  header <- strsplit(strsplit(text, "\n", fixed = TRUE)[[1L]][1L], ",", fixed = TRUE)[[1L]]
  stopifnot(grepl("^results_lipid_violin_.*[.]csv$", csv$name), any(grepl("Normalization", header)),
    length(strsplit(text, "\n", fixed = TRUE)[[1L]]) > 2L)
  cat("PASS card data.csv from the module's download handler\n")

  # "More downloads from this analysis": the module's own download buttons next to the plot.
  listed <- api_card_downloads(s, violin$instanceId)$downloads
  stopifnot(identical(vapply(listed, `[[`, "", "id"), "dl_violin"), identical(listed[[1L]]$label, "Plot data (CSV)"))
  same <- api_card_download(s, violin$instanceId, "dl_violin")
  stopifnot(identical(same$bytes, csv$bytes), identical(same$name, csv$name), startsWith(same$type, "text/csv"))
  bar <- api_card_create(s, "barchart-barPlotUnfiltered")
  api_card_render(s, bar$instanceId, 620, 380)
  listed <- api_card_downloads(s, bar$instanceId)$downloads
  stopifnot(identical(vapply(listed, `[[`, "", "id"), c("downloadBarCSV_Unfiltered", "downloadBarPDF_Unfiltered")),
    identical(vapply(listed, `[[`, "", "label"), c("CSV", "PDF")))
  pdf <- api_card_download(s, bar$instanceId, "downloadBarPDF_Unfiltered")
  stopifnot(identical(rawToChar(pdf$bytes[1:4]), "%PDF"), grepl("[.]pdf$", pdf$name), identical(pdf$type, "application/pdf"))
  missing <- tryCatch(api_card_download(s, bar$instanceId, "dl_violin"), error = identity)
  stopifnot(inherits(missing, "api_not_found"))
  legacy <- api_card_downloads(s, "tcinstance_v0_pca")$downloads
  stopifnot(identical(vapply(legacy, `[[`, "", "id"), "dl_pca"))
  cat("PASS more downloads: list and serve the module's own download buttons\n")
  # Chart audit b03-qc-b round 2: a module handler that fails with a plain error (Team's BQC PDF with fewer than two
  # BQC replicates) reached the client as a bare 500 with no message. It is a 422 that carries the module's reason.
  boom <- tryCatch(api_run_download(s, list(filename = function() "BQC.pdf", content = function(file) stop("no BQC samples")), ".pdf"),
    error = identity)
  stopifnot(inherits(boom, "api_unprocessable"), grepl("Team's module could not make this file: no BQC samples", conditionMessage(boom), fixed = TRUE))
  lost <- tryCatch(api_run_download(s, list(filename = function() "x.pdf", content = function(file) api_abort("session_lost", "gone")), ".pdf"),
    error = identity)
  stopifnot(inherits(lost, "session_lost"))
  cat("PASS more downloads: a failing module handler is a 422 with its reason\n")
})
