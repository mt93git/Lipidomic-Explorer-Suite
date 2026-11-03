# Team implementation of the "export_artifacts" hook (production adapter #1,
# R/frontends/team/export_studio_adapter.R: team_export_studio_artifacts_adapter).
# Publication Export Studio hardening: the figure title is wrapped to the page
# width, heatmaps get presentation-only padding, and the reproduction script reads
# its bundled CSV and carries the wrapped title. Data (art$data, the CSV) untouched.
# Only the helpers this hook needs are here; the Team Export Studio server and its
# ZIP writer (team_export_studio_server, team_export_studio_write_bundle, which also
# writes NOTES.txt from art$team_notes) belong to a later block.
# This file sorts before participant_warning.R, so this registration runs first,
# matching production's team_export_participant_warning_adapter(team_export_studio_artifacts_adapter(orig)).

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

lipidomic_hook_register("export_artifacts", function(art, figure_key, shared_data, base_pt = 7.5, ...) {
  team_export_studio_adapt_artifacts(
    art,
    width_mm = team_export_studio_current_width_mm(),
    base_pt = base_pt
  )
})
