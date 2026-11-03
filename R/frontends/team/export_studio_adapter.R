# Team-only Publication Export Studio hardening.
# Keep the shared Classic module unchanged; Team installs this adapter from
# global.R only when LIPIDOMIC_INTERFACE=team.

team_export_studio_current_width_mm <- function(default = 89) {
  domain <- tryCatch(shiny::getDefaultReactiveDomain(), error = function(e) NULL)
  if (is.null(domain) || is.null(domain$input)) return(default)
  candidates <- c("width_mm", "export_studio-width_mm")
  for (field in candidates) {
    value <- tryCatch(shiny::isolate(domain$input[[field]]), error = function(e) NULL)
    value <- suppressWarnings(as.numeric(value)[1])
    if (length(value) == 1L && is.finite(value) && value > 0) return(value)
  }
  default
}

team_export_studio_title_width <- function(width_mm, base_pt) {
  width_mm <- suppressWarnings(as.numeric(width_mm)[1])
  base_pt <- suppressWarnings(as.numeric(base_pt)[1])
  if (length(width_mm) != 1L || !is.finite(width_mm) || width_mm <= 0) width_mm <- 89
  if (length(base_pt) != 1L || !is.finite(base_pt) || base_pt <= 0) base_pt <- 7.5
  usable_width_pt <- width_mm / 25.4 * 72 * 0.78
  title_char_width_pt <- (base_pt + 2) * 0.55
  max(12L, as.integer(floor(usable_width_pt / title_char_width_pt)))
}

team_export_studio_wrap_title <- function(title, width_chars) {
  if (!is.character(title) || length(title) != 1L || is.na(title) || !nzchar(title)) return(title)
  if (length(width_chars) != 1L || is.na(width_chars) || width_chars < 1) width_chars <- 30L
  paste(strwrap(title, width = as.integer(width_chars)), collapse = "\n")
}

team_export_studio_format_inches <- function(mm) {
  mm <- suppressWarnings(as.numeric(mm)[1])
  if (length(mm) != 1L || !is.finite(mm) || mm <= 0) {
    stop("Team Export Studio could not apply the requested reproduction dimensions.", call. = FALSE)
  }
  formatC(mm / 25.4, format = "f", digits = 6)
}

team_export_studio_fix_script <- function(script, csv_filename, title,
                                          width_mm = NULL, height_mm = NULL,
                                          heatmap = FALSE) {
  if (!is.character(script) || length(script) != 1L || !nzchar(script)) return(script)

  csv_match <- regexpr("read\\.csv\\([\"'][^\"']+[\"']", script, perl = TRUE)
  if (csv_match[1] < 0L) {
    stop("Team Export Studio could not bind the reproduction script to its bundled CSV.", call. = FALSE)
  }
  csv_call <- regmatches(script, csv_match)
  quote_at <- nchar("read.csv(") + 1L
  quote <- substr(csv_call, quote_at, quote_at)
  csv_call_new <- paste0("read.csv(", quote, basename(csv_filename), quote)
  regmatches(script, csv_match) <- csv_call_new

  title_match <- regexpr("labs\\(\\s*title\\s*=\\s*'[^']*'", script, perl = TRUE)
  if (title_match[1] > 0L && is.character(title) && length(title) == 1L && !is.na(title)) {
    title_call <- regmatches(script, title_match)
    quote_at <- regexpr("'", title_call, fixed = TRUE)[1]
    # `title` may already contain intentional line breaks from the plot adapter.
    # Preserve those breaks as escaped R string newlines instead of passing the
    # text through strwrap again (which collapses whitespace).
    encoded <- encodeString(title, quote = "'")
    replacement <- paste0(substr(title_call, 1L, quote_at - 1L), encoded)
    regmatches(script, title_match) <- replacement
  }

  if (isTRUE(heatmap)) {
    # Keep long heatmap axis labels inside the page at single-column sizes.
    ggsave_match <- regexpr("(?m)^ggsave\\(", script, perl = TRUE)
    if (ggsave_match[1] < 0L) {
      stop("Team Export Studio could not apply the heatmap page layout to its reproduction script.", call. = FALSE)
    }
    margin <- paste0(
      "p <- p + theme(plot.margin = margin(t = 6, r = 8, b = 6, l = 30, unit = 'pt'), ",
      "plot.title.position = 'plot')\n\n"
    )
    regmatches(script, ggsave_match) <- paste0(margin, regmatches(script, ggsave_match))
  }

  if (!is.null(width_mm) || !is.null(height_mm)) {
    if (is.null(width_mm) || is.null(height_mm)) {
      stop("Team Export Studio needs both dimensions to update the reproduction script.", call. = FALSE)
    }
    geometry_match <- regexpr(
      "width\\s*=\\s*[0-9.]+\\s*,\\s*height\\s*=\\s*[0-9.]+\\s*,\\s*units\\s*=\\s*['\"][^'\"]+['\"]",
      script, perl = TRUE
    )
    if (geometry_match[1] < 0L) {
      stop("Team Export Studio could not bind the reproduction script to the selected page dimensions.", call. = FALSE)
    }
    geometry <- paste0(
      "width = ", team_export_studio_format_inches(width_mm),
      ", height = ", team_export_studio_format_inches(height_mm),
      ", units = 'in'"
    )
    regmatches(script, geometry_match) <- geometry
  }

  script
}

team_export_studio_adapt_artifacts <- function(art, width_mm = 89, base_pt = 7.5) {
  if (!is.list(art) || is.null(art$plot) || !inherits(art$plot, "ggplot")) return(art)
  raw_title <- art$plot$labels$title
  title_width <- team_export_studio_title_width(width_mm, base_pt)
  wrapped_title <- team_export_studio_wrap_title(raw_title, title_width)
  if (is.character(wrapped_title) && length(wrapped_title) == 1L && !identical(raw_title, wrapped_title)) {
    art$plot <- art$plot + ggplot2::labs(title = wrapped_title)
  }
  if (isTRUE(art$is_heatmap)) {
    # Presentation-only padding; the heatmap data and mappings are untouched.
    art$plot <- art$plot + ggplot2::theme(
      plot.margin = grid::unit(c(6, 8, 6, 30), "pt"),
      plot.title.position = "plot"
    )
  }
  if (is.character(art$r_script) && length(art$r_script) == 1L &&
      is.character(art$filename_base) && length(art$filename_base) == 1L) {
    art$r_script <- team_export_studio_fix_script(
      art$r_script,
      paste0(art$filename_base, "_data.csv"),
      wrapped_title
    )
  }
  art
}

team_export_studio_artifacts_adapter <- function(original) {
  stopifnot(is.function(original))
  function(figure_key, shared_data, base_pt = 7.5, font_family = "sans", hybrid_mode = TRUE) {
    art <- original(
      figure_key = figure_key,
      shared_data = shared_data,
      base_pt = base_pt,
      font_family = font_family,
      hybrid_mode = hybrid_mode
    )
    team_export_studio_adapt_artifacts(
      art,
      width_mm = team_export_studio_current_width_mm(),
      base_pt = base_pt
    )
  }
}

team_export_studio_validate_formats <- function(formats, svg_available = requireNamespace("svglite", quietly = TRUE)) {
  if (isTRUE(formats$svg) && !isTRUE(svg_available)) {
    stop("The SVG format is selected, but the Team SVG export dependency is unavailable. No bundle was created.", call. = FALSE)
  }
  invisible(TRUE)
}

team_export_studio_input_value <- function(input, ns, id, name, default = NULL) {
  value <- input[[ns(paste0(id, "-", name))]]
  if (is.null(value)) default else value
}

team_export_studio_requested_formats <- function(input, ns, id) {
  value <- function(name, default = TRUE) {
    isTRUE(team_export_studio_input_value(input, ns, id, name, default))
  }
  list(
    pdf = value("inc_pdf"),
    svg = value("inc_svg"),
    png = value("inc_png"),
    tiff = value("inc_tiff"),
    # The UI promises that the CSV accompanies a reproduction script, even if
    # the standalone CSV checkbox is cleared.
    csv = value("inc_csv") || value("inc_rscript"),
    rscript = value("inc_rscript")
  )
}

team_export_studio_write_bundle <- function(file, art, formats, width_mm, height_mm, dpi,
                                             base_pt, preset, font_family, hybrid_mode) {
  team_export_studio_validate_formats(formats)
  stopifnot(is.list(art), inherits(art$plot, "ggplot"), is.data.frame(art$data))

  width_mm <- as.numeric(width_mm)
  height_mm <- as.numeric(height_mm)
  dpi <- as.integer(dpi)
  base_pt <- as.numeric(base_pt)
  if (length(width_mm) != 1L || !is.finite(width_mm) || width_mm <= 0 ||
      length(height_mm) != 1L || !is.finite(height_mm) || height_mm <= 0 ||
      length(dpi) != 1L || is.na(dpi) || dpi <= 0) {
    stop("Export dimensions and resolution must be positive numeric values.", call. = FALSE)
  }

  tmp_dir <- tempfile(pattern = "team_pub_bundle_")
  if (!dir.create(tmp_dir, recursive = TRUE)) stop("Could not create a temporary export folder.", call. = FALSE)
  on.exit(unlink(tmp_dir, recursive = TRUE, force = TRUE), add = TRUE)
  expected <- character()
  base_name <- art$filename_base
  w_in <- width_mm / 25.4
  h_in <- height_mm / 25.4

  write_asset <- function(filename, label, writer) {
    path <- file.path(tmp_dir, filename)
    tryCatch(writer(path), error = function(e) {
      stop(sprintf("The %s file could not be created; no incomplete bundle was delivered: %s", label, conditionMessage(e)), call. = FALSE)
    })
    if (!file.exists(path) || is.na(file.info(path)$size) || file.info(path)$size <= 0) {
      stop(sprintf("The %s file is missing or empty; no incomplete bundle was delivered.", label), call. = FALSE)
    }
    expected <<- c(expected, filename)
  }

  if (isTRUE(formats$pdf)) write_asset(paste0(base_name, ".pdf"), "PDF", function(path) {
    ggplot2::ggsave(path, plot = art$plot, device = grDevices::cairo_pdf, width = w_in, height = h_in, units = "in")
  })
  if (isTRUE(formats$svg)) write_asset(paste0(base_name, ".svg"), "SVG", function(path) {
    ggplot2::ggsave(path, plot = art$plot, device = svglite::svglite, width = w_in, height = h_in, units = "in")
  })
  if (isTRUE(formats$png)) write_asset(paste0(base_name, ".png"), "PNG", function(path) {
    ggplot2::ggsave(path, plot = art$plot, device = "png", dpi = dpi, width = w_in, height = h_in, units = "in")
  })
  if (isTRUE(formats$tiff)) write_asset(paste0(base_name, ".tiff"), "TIFF", function(path) {
    ggplot2::ggsave(path, plot = art$plot, device = "tiff", dpi = dpi, width = w_in, height = h_in, units = "in", compression = "lzw")
  })
  if (isTRUE(formats$csv) || isTRUE(formats$rscript)) write_asset(paste0(base_name, "_data.csv"), "CSV", function(path) {
    write_spreadsheet_csv(art$data, path, row.names = FALSE)
  })
  if (isTRUE(formats$rscript)) write_asset(paste0("reproduce_", tolower(gsub("[^a-zA-Z0-9]+", "_", base_name)), ".R"), "R reproduction script", function(path) {
    script <- team_export_studio_fix_script(
      art$r_script,
      paste0(base_name, "_data.csv"),
      art$plot$labels$title,
      width_mm = width_mm,
      height_mm = height_mm,
      heatmap = isTRUE(art$is_heatmap)
    )
    parse(text = script)
    writeLines(script, path)
  })

  # Team warnings about the figure (for example pseudoreplication) travel as a
  # separate notes file, so the data CSV stays exactly as before.
  if (is.character(art$team_notes) && length(art$team_notes) == 1L && nzchar(art$team_notes))
    write_asset("NOTES.txt", "notes", function(path) writeLines(strwrap(art$team_notes, width = 78), path))

  spec <- EXPORT_JOURNAL_PRESETS[[preset]]
  if (is.null(spec)) spec <- EXPORT_JOURNAL_PRESETS$nature
  manifest <- list(
    app = "Global Lipidomic Explorer",
    version = "2026.09",
    timestamp = format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z"),
    figure = art$title,
    journal_preset = spec$name,
    publisher = spec$publisher,
    dimensions = list(width_mm = width_mm, height_mm = height_mm,
      width_in = round(w_in, 3), height_in = round(h_in, 3)),
    resolution_dpi = dpi,
    typography = list(target_font_pt = base_pt, font_family = font_family,
      is_compliant = base_pt >= 6.5 && base_pt <= 8.5),
    hybrid_vector_raster = isTRUE(hybrid_mode),
    included_files = expected,
    system_info = list(r_version = R.version.string, platform = R.version$platform)
  )
  write_asset("figure_provenance.json", "provenance manifest", function(path) {
    writeLines(jsonlite::toJSON(manifest, pretty = TRUE, auto_unbox = TRUE), path)
  })

  if (length(expected) != length(unique(expected))) stop("The bundle contains duplicate output names.", call. = FALSE)
  paths <- file.path(tmp_dir, expected)
  if (!all(file.exists(paths))) stop("A requested bundle output is missing.", call. = FALSE)
  zip::zipr(file, files = paths, root = tmp_dir)
  if (!file.exists(file) || is.na(file.info(file)$size) || file.info(file)$size <= 0) {
    stop("The ZIP file could not be created.", call. = FALSE)
  }
  invisible(expected)
}

team_export_studio_server <- function(input, output, session, shared_data, id = "export_studio") {
  export_studio_server(id, shared_data = shared_data)
  ns <- session$ns
  input_value <- function(name, default = NULL) {
    team_export_studio_input_value(input, ns, id, name, default)
  }
  artifacts <- shiny::reactive({
    generate_export_artifacts(
      figure_key = input_value("target_figure", "pca_2d"),
      shared_data = shared_data,
      base_pt = input_value("base_font_pt", 7.5),
      font_family = input_value("font_family", "sans"),
      hybrid_mode = isTRUE(input_value("hybrid_mode", TRUE))
    )
  })
  bundle_id <- ns(paste0(id, "-download_bundle_zip"))
  output[[bundle_id]] <- shiny::downloadHandler(
    filename = function() {
      art <- artifacts()
      paste0(art$filename_base, "_Publication_Bundle_", format(Sys.time(), "%Y%m%d_%H%M"), ".zip")
    },
    content = function(file) {
      art <- artifacts()
      preset <- input_value("journal_preset", "nature")
      team_export_studio_write_bundle(
        file = file,
        art = art,
        formats = team_export_studio_requested_formats(input, ns, id),
        width_mm = input_value("width_mm", 89),
        height_mm = input_value("height_mm", 89),
        dpi = input_value("dpi_setting", 600),
        base_pt = input_value("base_font_pt", 7.5),
        preset = preset,
        font_family = input_value("font_family", "sans"),
        hybrid_mode = isTRUE(input_value("hybrid_mode", TRUE))
      )
    },
    contentType = "application/zip"
  )
  invisible(NULL)
}
