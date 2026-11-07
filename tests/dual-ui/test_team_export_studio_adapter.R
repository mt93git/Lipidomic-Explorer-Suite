# Team-only Export Studio tests: real requested formats are required in the
# ZIP, and the bundled script must open the CSV that the ZIP actually contains.
suppressPackageStartupMessages({
  source("R/utils_csv_export.R")
  source("R/modules/99_export_studio_module.R")
  source("R/core/hooks.R")
  source("R/frontends/team/hooks/export.R")
  source("R/frontends/team/hooks/server_wiring.R")
  source("R/frontends/team/export_studio.R")
  source("R/frontends/team/modules-ui.R")
})

rejects <- function(expr) stopifnot(inherits(try(expr, silent = TRUE), "try-error"))

script <- paste(
  "library(ggplot2)",
  "library(tidyr)",
  "data <- read.csv('figure_heatmap_data.csv')",
  "df_long <- pivot_longer(data, cols = -Lipid_Name, names_to = 'Sample', values_to = 'ZScore')",
  "p <- ggplot(df_long, aes(x = Sample, y = Lipid_Name, fill = ZScore)) + geom_tile() +",
  "  labs(title = 'Lipid Abundance Heatmap (Top Variable Species)') +",
  "  theme_bw(base_size = 7.5) + theme(axis.text.x = element_text(angle = 45, hjust = 1))",
  "ggsave('figure_heatmap_reproduced.pdf', plot = p, width = 3.50, height = 4.50, units = 'in')",
  sep = "\n"
)
sample_names <- paste0("CCS_Control_Long_Sample_", sprintf("%03d", 1:8))
wide_data <- data.frame(Lipid_Name = paste0("Lipid Species ", 1:20), check.names = FALSE)
for (i in seq_along(sample_names)) wide_data[[sample_names[[i]]]] <- seq_len(nrow(wide_data)) + i
long_data <- tidyr::pivot_longer(wide_data, cols = -Lipid_Name,
  names_to = "sample", values_to = "z")
long_data$lipid <- long_data$Lipid_Name
plot <- ggplot2::ggplot(
  long_data,
  ggplot2::aes(sample, lipid, fill = z)
) + ggplot2::geom_tile() + ggplot2::labs(title = "Lipid Abundance Heatmap (Top Variable Species)")
source_art <- list(
  plot = plot,
  data = wide_data,
  r_script = script,
  filename_base = "Figure_Lipid_Heatmap",
  is_heatmap = TRUE,
  title = "Hierarchical Heatmap"
)

adapted <- team_export_studio_adapt_artifacts(source_art, width_mm = 89, base_pt = 7.5)
stopifnot(
  identical(adapted$data, source_art$data),
  identical(adapted$plot$data, source_art$plot$data),
  identical(adapted$plot$mapping, source_art$plot$mapping),
  grepl("\n", adapted$plot$labels$title, fixed = TRUE),
  identical(adapted$plot$theme$plot.title.position, "plot"),
  isTRUE(all.equal(as.numeric(grid::convertUnit(adapted$plot$theme$plot.margin, "pt", valueOnly = TRUE)),
    c(6, 8, 6, 30))),
  grepl("Figure_Lipid_Heatmap_data.csv", adapted$r_script, fixed = TRUE),
  grepl("\\n", adapted$r_script, fixed = TRUE),
  grepl("Lipid Abundance Heatmap \\(Top\\\\nVariable Species\\)", adapted$r_script)
)
invisible(parse(text = adapted$r_script))

# Mirror the real root-session namespace used by the Team module and verify
# every selected control plus width/height/DPI reaches the writer as intended.
root_ns <- function(x) x
control_input <- list(
  `export_studio-inc_pdf` = FALSE,
  `export_studio-inc_svg` = TRUE,
  `export_studio-inc_png` = FALSE,
  `export_studio-inc_tiff` = TRUE,
  `export_studio-inc_csv` = FALSE,
  `export_studio-inc_rscript` = TRUE,
  `export_studio-width_mm` = 120,
  `export_studio-height_mm` = 75,
  `export_studio-dpi_setting` = 300
)
requested <- team_export_studio_requested_formats(control_input, root_ns, "export_studio")
stopifnot(identical(requested, list(pdf = FALSE, svg = TRUE, png = FALSE,
  tiff = TRUE, csv = TRUE, rscript = TRUE)))
stopifnot(
  identical(team_export_studio_input_value(control_input, root_ns, "export_studio", "width_mm"), 120),
  identical(team_export_studio_input_value(control_input, root_ns, "export_studio", "height_mm"), 75),
  identical(team_export_studio_input_value(control_input, root_ns, "export_studio", "dpi_setting"), 300)
)
team_ui_html <- htmltools::renderTags(export_studio_ui("export_studio"))$html
stopifnot(
  grepl('id="export_studio-inc_csv"', team_ui_html, fixed = TRUE),
  grepl("Data (CSV; included with R Script)", team_ui_html, fixed = TRUE),
  grepl('id="export_studio-inc_rscript"', team_ui_html, fixed = TRUE),
  grepl('id="export_studio-width_mm"', team_ui_html, fixed = TRUE),
  grepl('id="export_studio-height_mm"', team_ui_html, fixed = TRUE),
  grepl('id="export_studio-dpi_setting"', team_ui_html, fixed = TRUE)
)

# The actual UI defaults SVG on. Missing svglite must reject, never quietly
# remove the requested SVG and return an apparently complete archive.
rejects(team_export_studio_validate_formats(list(svg = TRUE), svg_available = FALSE))
stopifnot(isTRUE(team_export_studio_validate_formats(list(svg = FALSE), svg_available = FALSE)))

if (requireNamespace("svglite", quietly = TRUE)) {
  bundle <- tempfile(fileext = ".zip")
  included <- team_export_studio_write_bundle(
    file = bundle,
    art = adapted,
    # PDF remains on Cairo in production. This test keeps the portable formats
    # enabled so it also runs on macOS hosts without the optional X11/Cairo DLL.
    # Team UI says the CSV accompanies the reproduction script. This exercises
    # the important csv=FALSE, rscript=TRUE combination.
    formats = list(pdf = FALSE, svg = TRUE, png = TRUE, tiff = TRUE, csv = FALSE, rscript = TRUE),
    width_mm = 89,
    height_mm = 89,
    dpi = 300,
    base_pt = 7.5,
    preset = "nature",
    font_family = "sans",
    hybrid_mode = TRUE
  )
  members <- utils::unzip(bundle, list = TRUE)$Name
  expected <- c(
    "Figure_Lipid_Heatmap.svg",
    "Figure_Lipid_Heatmap.png", "Figure_Lipid_Heatmap.tiff",
    "Figure_Lipid_Heatmap_data.csv", "reproduce_figure_lipid_heatmap.R",
    "figure_provenance.json"
  )
  stopifnot(all(expected %in% members), all(expected %in% included))

  extracted <- tempfile("team_export_bundle_")
  dir.create(extracted)
  utils::unzip(bundle, exdir = extracted)
  script_file <- file.path(extracted, "reproduce_figure_lipid_heatmap.R")
  script_text <- paste(readLines(script_file, warn = FALSE), collapse = "\n")
  invisible(parse(text = script_text))
  stopifnot(
    grepl("width = 3.503937, height = 3.503937, units = 'in'", script_text, fixed = TRUE),
    grepl("plot.margin = margin(t = 6, r = 8, b = 6, l = 30, unit = 'pt')", script_text, fixed = TRUE),
    grepl("plot.title.position = 'plot'", script_text, fixed = TRUE)
  )
  csv_match <- regmatches(script_text, regexpr("read\\.csv\\([\"'][^\"']+[\"']", script_text, perl = TRUE))
  quote_at <- nchar("read.csv(") + 1L
  csv_name <- substr(csv_match, quote_at + 1L, nchar(csv_match) - 1L)
  stopifnot(file.exists(file.path(extracted, csv_name)))

  old_wd <- getwd()
  setwd(extracted)
  script_output <- tryCatch(
    system2(file.path(R.home("bin"), "Rscript"), c("--vanilla", basename(script_file)), stdout = TRUE, stderr = TRUE),
    finally = setwd(old_wd)
  )
  stopifnot(is.null(attr(script_output, "status")) || identical(attr(script_output, "status"), 0L))
  stopifnot(file.exists(file.path(extracted, "figure_heatmap_reproduced.pdf")))
  if (nzchar(Sys.which("pdfinfo"))) {
    pdf_info <- system2("pdfinfo", file.path(extracted, "figure_heatmap_reproduced.pdf"), stdout = TRUE)
    page_size <- grep("^Page size:", pdf_info, value = TRUE)
    stopifnot(length(page_size) == 1L)
    size_text <- sub("^Page size:\\s*", "", page_size)
    size_text <- sub(" pts.*$", "", size_text)
    dimensions <- as.numeric(strsplit(size_text, " x ")[[1]][1:2])
    cat("Reproduction PDF page:", paste(dimensions, collapse = " x "), "pt\n")
    stopifnot(all(is.finite(dimensions)), all(abs(dimensions - (89 / 25.4 * 72)) < 0.5))
  }

  # Exercise the bundle PDF writer itself wherever Cairo is available. The
  # reproduction-script check above remains portable to hosts without Cairo.
  cairo_ready <- local({
    probe <- tempfile(fileext = ".pdf")
    opened <- FALSE
    ready <- tryCatch({
      suppressWarnings(grDevices::cairo_pdf(probe))
      opened <- TRUE
      grDevices::dev.off()
      opened <- FALSE
      file.exists(probe) && file.info(probe)$size > 0
    }, error = function(e) FALSE, finally = {
      if (opened && grDevices::dev.cur() > 1L) grDevices::dev.off()
    })
    unlink(probe)
    isTRUE(ready)
  })
  if (cairo_ready) {
    pdf_bundle <- tempfile(fileext = ".zip")
    pdf_files <- team_export_studio_write_bundle(
      file = pdf_bundle,
      art = adapted,
      formats = list(pdf = TRUE, svg = FALSE, png = FALSE, tiff = FALSE, csv = FALSE, rscript = FALSE),
      width_mm = 89,
      height_mm = 89,
      dpi = 300,
      base_pt = 7.5,
      preset = "nature",
      font_family = "sans",
      hybrid_mode = TRUE
    )
    stopifnot("Figure_Lipid_Heatmap.pdf" %in% pdf_files)
    pdf_extracted <- tempfile("team_export_pdf_")
    dir.create(pdf_extracted)
    utils::unzip(pdf_bundle, exdir = pdf_extracted)
    pdf_path <- file.path(pdf_extracted, "Figure_Lipid_Heatmap.pdf")
    stopifnot(file.exists(pdf_path), file.info(pdf_path)$size > 0)
    if (nzchar(Sys.which("pdfinfo"))) {
      pdf_info <- system2("pdfinfo", pdf_path, stdout = TRUE)
      page_size <- grep("^Page size:", pdf_info, value = TRUE)
      size_text <- sub("^Page size:\\s*", "", page_size)
      size_text <- sub(" pts.*$", "", size_text)
      dimensions <- as.numeric(strsplit(size_text, " x ")[[1]][1:2])
      stopifnot(length(page_size) == 1L, all(is.finite(dimensions)),
        all(abs(dimensions - (89 / 25.4 * 72)) < 0.5))
    }
    unlink(pdf_bundle)
    unlink(pdf_extracted, recursive = TRUE)
  }

  manifest <- jsonlite::fromJSON(file.path(extracted, "figure_provenance.json"))
  stopifnot(all(expected[1:5] %in% manifest$included_files),
    "Figure_Lipid_Heatmap_data.csv" %in% manifest$included_files)
}

# The common module source is left intact; Team selects its server through the
# "export_studio_server" hook, registered only by the Team bootstrap.
server_text <- paste(readLines("R/server.R", warn = FALSE), collapse = "\n")
bootstrap_text <- paste(readLines("R/frontends/team/bootstrap.R", warn = FALSE), collapse = "\n")
stopifnot(
  grepl('lipidomic_hook("export_studio_server"', server_text, fixed = TRUE),
  grepl("export_studio_server(id, shared_data = shared_data)", server_text, fixed = TRUE),
  grepl('source("R/frontends/team/export_studio.R")', bootstrap_text, fixed = TRUE),
  "export_studio_server" %in% lipidomic_hook_registered()
)

if (exists("bundle", inherits = FALSE)) unlink(bundle)
if (exists("extracted", inherits = FALSE)) unlink(extracted, recursive = TRUE)

cat("PASS: Team bundle honors namespaced controls, pairs the R script with its CSV, preserves wrapped titles, executes the bundled script, and fails closed for unavailable SVG.\n")
