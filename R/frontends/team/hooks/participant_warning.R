# Team-only participant warning for Differential analysis results
# (production R/frontends/team/da_participant_warning.R, adapters #11, #12, #14).
#
# The shared engine (R/modules/1_shared_data_module.R allLipidDEOutput) fits
# unpaired comparisons. Under a confirmed independent design whose participant
# IDs repeat across the prepared samples (the rule of Group comparison, the
# log-ratio card and the heatmap's Significant only:
# team_group_comparison_participants), its p-values treat repeated samples as
# independent. This file only adds a visible warning next to the results; it
# changes no number, filter or download.
#
# Hooks registered here: "de_banner" (#11), "volcano_caption" (#12) and the second
# "export_artifacts" registration (#14; export.R sorts first, as in production).
# The structural banner (#13) reuses team_da_participant_warning_prepend and
# team_de_banner_without_warning from this file.

# From production R/frontends/team/group_comparison.R (same text); Group
# comparison (R/frontends/team/group_comparison.R) reuses this definition.
if (!exists("team_pseudoreplication_recommendation", inherits = TRUE))
  team_pseudoreplication_recommendation <- "Recommendation: analyse these samples as paired or repeated measures (set the study design to Matched or repeated and use a paired comparison), so each participant's samples are compared within that participant."

# The participant reason, or NULL. shared_data$team_da_participant_reason is set
# in R/server.R and reports only when the design allows independent inference.
team_da_participant_status <- function(shared_data) {
  f <- if (is.list(shared_data)) shared_data$team_da_participant_reason else NULL
  if (!is.function(f)) return(NULL)
  reason <- tryCatch(f(), error = function(e) NULL)
  if (is.character(reason) && length(reason) == 1L && !is.na(reason) && nzchar(reason)) reason else NULL
}

# The existing reason text, with its closing "no p-values were computed" (true
# for the views that withhold them) replaced by what is true here.
team_da_participant_warning_text <- function(reason) {
  text <- sub(" No p-values were computed\\.$", "", reason)
  text <- sub(" and no p-values were computed\\.$", ".", text)
  paste(text, "Differential analysis p-values here were computed as if these samples were independent; interpret them with caution.",
    team_pseudoreplication_recommendation)
}
# Plain-text note for exports (ZIP NOTES.txt, R script comment).
team_da_participant_note <- function(reason) paste0(team_da_participant_warning_title, ". ", team_da_participant_warning_text(reason))
team_da_participant_warning_title <- "Pseudoreplication warning"
team_da_participant_warning <- function(reason) {
  shiny::div(class = "team-da-participant-warning alert alert-warning mb-3 shadow-sm", role = "status",
    style = "border-left: 5px solid #d97706; background: #fffdf5; border-radius: 10px; padding: 14px 18px;",
    shiny::tags$strong(paste0(team_da_participant_warning_title, ". ")), team_da_participant_warning_text(reason))
}

# The warning above whatever a Differential analysis banner slot showed, when
# there is a result and a participant reason; otherwise the slot is unchanged.
team_da_participant_warning_prepend <- function(shown, shared_data) {
  reason <- team_da_participant_status(shared_data)
  if (is.null(reason) || is.null(tryCatch(shared_data$de_results(), error = function(e) NULL))) return(shown)
  shiny::tagList(team_da_participant_warning(reason), shown)
}

# Every Differential analysis view with a "not run" banner slot (volcano, LSEA,
# filtered heatmaps and barcharts, structural grid and pathway views) shows the
# warning above whatever it showed before (production adapter #11).
lipidomic_hook_register("de_banner", function(banner, shared_data, ...) {
  team_da_participant_warning_prepend(banner, shared_data)
})
# The banner without the warning (the structural view adds it itself). Production
# read the unwrapped function from an attribute; with hooks it is the module's base.
team_de_banner_without_warning <- function(shared_data) render_de_not_run_banner_base(shared_data)

# Figures carry a short form of the warning (the full text is in the banners,
# NOTES.txt and the R script), so it fits small export pages.
team_da_participant_caption_text <- function(reason, compact = FALSE) {
  if (isTRUE(compact)) return(paste0(team_da_participant_warning_title, ": p-values assume independent samples."))
  n <- regmatches(reason, regexpr("^[0-9]+(?= participant IDs? contributes? more than one sample)", reason, perl = TRUE))
  what <- if (length(n) == 1L) sprintf("%s participant ID%s repeat%s across the compared samples", n, if (n == "1") "" else "s", if (n == "1") "s" else "")
    else "participant independence could not be verified"
  paste0(team_da_participant_warning_title, ": ", what, "; p-values assume independent samples. Consider a paired analysis.")
}

# A reactive read inside a reactive context (so the figure is rebuilt when the
# width changes), an isolated one elsewhere (downloads, tests).
team_da_reactive_value <- function(get) {
  tryCatch(get(), error = function(e) tryCatch(shiny::isolate(get()), error = function(e2) NULL))
}

# The volcano figure (main view, Canvas copies and its PDF) carries the warning
# as a caption wrapped to the rendered width; its points, axes and labels are
# unchanged.
team_volcano_warning_caption <- function(plot, shared_data, width_px = NULL, size = 10) {
  reason <- team_da_participant_status(shared_data)
  if (is.null(reason) || !inherits(plot, "ggplot") || is.null(tryCatch(shared_data$de_results(), error = function(e) NULL))) return(plot)
  width_px <- suppressWarnings(as.numeric(width_px)[1])
  if (length(width_px) != 1L || !is.finite(width_px) || width_px <= 0) width_px <- 800
  # Bold text at 72 px per inch averages about 0.6 em per character; keep a margin.
  chars <- max(14L, as.integer(floor((width_px - 40) / (size * 0.68))))
  caption <- paste(strwrap(team_da_participant_caption_text(reason, compact = chars < 45L), width = chars), collapse = "\n")
  plot + ggplot2::labs(caption = caption) +
    ggplot2::theme(plot.caption = ggplot2::element_text(colour = "#b45309", hjust = 0, size = size, face = "bold"),
                   plot.caption.position = "plot")
}

# The Export Studio page width, read reactively so its preview and downloads
# are rebuilt with a matching caption when the width changes.
team_da_export_width_mm <- function(default = 89) {
  domain <- tryCatch(shiny::getDefaultReactiveDomain(), error = function(e) NULL)
  if (is.null(domain) || is.null(domain$input)) return(default)
  for (field in c("width_mm", "export_studio-width_mm")) {
    value <- suppressWarnings(as.numeric(team_da_reactive_value(function() domain$input[[field]]))[1])
    if (length(value) == 1L && is.finite(value) && value > 0) return(value)
  }
  default
}

# Publication Export Studio, volcano only (production adapter #14): the figure (PDF,
# SVG, PNG, TIFF, preview and ZIP copies) carries the short warning as a caption,
# the reproduction script starts with it as comments, and the Team ZIP writer adds
# NOTES.txt (art$team_notes). The data table (art$data, the CSV) is never touched.
team_export_participant_warning_artifacts <- function(art, figure_key, shared_data, ...) {
  if (!identical(figure_key, "volcano") || !is.list(art)) return(art)
  reason <- team_da_participant_status(shared_data)
  if (is.null(reason) || is.null(tryCatch(shared_data$de_results(), error = function(e) NULL))) return(art)
  args <- list(...)
  size <- suppressWarnings(as.numeric(args$base_pt %||% 7.5)[1]); if (!is.finite(size) || size <= 0) size <- 7.5
  width_mm <- team_da_export_width_mm()
  art$plot <- team_volcano_warning_caption(art$plot, shared_data, width_px = width_mm / 25.4 * 72 + 40, size = size)
  note <- team_da_participant_note(reason)
  if (is.character(art$r_script) && length(art$r_script) == 1L)
    art$r_script <- paste0(paste0("# ", strwrap(note, width = 76), collapse = "\n"), "\n\n", art$r_script)
  art$team_notes <- note
  art
}
lipidomic_hook_register("export_artifacts", team_export_participant_warning_artifacts)

# The volcano figure (main view, Canvas copies and its PDF) carries the warning as a
# caption wrapped to the rendered width (production adapter #12). width_px is the
# module's function reading input$volcanoPlot_size$width or the output's client width.
lipidomic_hook_register("volcano_caption", function(plot, shared_data, width_px = NULL, ...) {
  team_width <- if (is.function(width_px)) team_da_reactive_value(width_px) else width_px
  team_volcano_warning_caption(plot, shared_data, team_width)
})
