# Team-only participant warning for Differential analysis results.
#
# The shared engine (R/modules/1_shared_data_module.R allLipidDEOutput) fits
# unpaired comparisons. Under a confirmed independent design whose participant
# IDs repeat across the prepared samples (the rule of Group comparison, the
# log-ratio card and the heatmap's Significant only:
# team_group_comparison_participants), its p-values treat repeated samples as
# independent. This file only adds a visible warning next to the results; it
# changes no number, filter or download. The shared modules are never edited.

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
  paste(text, "Differential analysis p-values here were computed as if these samples were independent; interpret them with caution.")
}
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
# warning above whatever it showed before.
team_de_banner_participant_warning_adapter <- function(original) {
  stopifnot(is.function(original))
  adapted <- function(shared_data) team_da_participant_warning_prepend(original(shared_data), shared_data)
  attr(adapted, "team_unguarded") <- original
  adapted
}
# The banner without the warning (the structural adapter adds it itself).
team_de_banner_without_warning <- function(shared_data) {
  f <- attr(render_de_not_run_banner, "team_unguarded") %||% render_de_not_run_banner
  f(shared_data)
}

# The structural module shows its own "ready" banner and launch button only when
# the DA banner is NULL. Keep that: compute its banner from the unwarned DA
# banner, then add the warning above it. Fail closed if the module changes.
team_structural_participant_warning_adapter <- function(original) {
  stopifnot(is.function(original))
  defs <- 0L; calls <- 0L
  swap <- function(node) {
    if (is.call(node) && identical(node[[1L]], as.name("render_de_not_run_banner"))) { calls <<- calls + 1L; node[[1L]] <- as.name("team_de_banner_without_warning") }
    if (is.recursive(node)) for (i in seq_along(node)) if (!is.null(node[[i]])) node[[i]] <- swap(node[[i]])
    node
  }
  rewrite <- function(node) {
    if (is.call(node) && identical(node[[1L]], as.name("<-")) && identical(node[[2L]], as.name("render_structural_status_banner"))) {
      fn <- node[[3L]]
      if (!is.call(fn) || !identical(fn[[1L]], as.name("function")) || length(fn[[2L]]) != 0L ||
          !is.call(fn[[3L]]) || !identical(fn[[3L]][[1L]], as.name("{")))
        stop("Team structural participant warning requires review: render_structural_status_banner changed.", call. = FALSE)
      fn[[3L]] <- substitute({
        team_da_participant_warning_prepend((function() ORIGINAL)(), shared_data)
      }, list(ORIGINAL = swap(fn[[3L]])))
      node[[3L]] <- fn; defs <<- defs + 1L
      return(node)
    }
    if (is.recursive(node)) for (i in seq_along(node)) if (!is.null(node[[i]])) node[[i]] <- rewrite(node[[i]])
    node
  }
  adapted <- original
  body(adapted) <- rewrite(body(original))
  if (defs != 1L || calls != 1L) stop("Team structural participant warning requires review: expected one status banner with one DA banner.", call. = FALSE)
  adapted
}

# The volcano figure (main view, Canvas copies and its PDF) carries the warning
# as a caption wrapped to the rendered width; its points, axes and labels are
# unchanged.
team_volcano_warning_caption <- function(plot, shared_data, width_px = NULL) {
  reason <- team_da_participant_status(shared_data)
  if (is.null(reason) || !inherits(plot, "ggplot") || is.null(tryCatch(shared_data$de_results(), error = function(e) NULL))) return(plot)
  width_px <- suppressWarnings(as.numeric(width_px)[1])
  if (length(width_px) != 1L || !is.finite(width_px) || width_px <= 0) width_px <- 800
  # 10 pt bold at 72 px per inch averages about 6 px per character; keep a margin.
  chars <- max(28L, as.integer(floor((width_px - 40) / 6.8)))
  caption <- paste(strwrap(paste0(team_da_participant_warning_title, ". ", team_da_participant_warning_text(reason)), width = chars), collapse = "\n")
  plot + ggplot2::labs(caption = caption) +
    ggplot2::theme(plot.caption = ggplot2::element_text(colour = "#b45309", hjust = 0, size = 10, face = "bold"),
                   plot.caption.position = "plot")
}
team_volcano_participant_warning_adapter <- function(original) {
  stopifnot(is.function(original))
  count <- 0L
  rewrite <- function(node) {
    if (is.call(node) && identical(node[[1L]], as.name("<-")) && identical(node[[2L]], as.name("generateVolcanoPlot"))) {
      fn <- node[[3L]]
      if (!is.call(fn) || !identical(fn[[1L]], as.name("function")) || length(fn[[2L]]) != 0L ||
          !is.call(fn[[3L]]) || !identical(fn[[3L]][[1L]], as.name("{")))
        stop("Team volcano participant warning requires review: generateVolcanoPlot changed.", call. = FALSE)
      fn[[3L]] <- substitute({
        team_plot <- (function() ORIGINAL)()
        team_width <- tryCatch(shiny::isolate(input$volcanoPlot_size$width %||%
          session$clientData[[paste0("output_", session$ns("volcanoPlot"), "_width")]]), error = function(e) NULL)
        team_volcano_warning_caption(team_plot, shared_data, team_width)
      }, list(ORIGINAL = fn[[3L]]))
      node[[3L]] <- fn; count <<- count + 1L
      return(node)
    }
    if (is.recursive(node)) for (i in seq_along(node)) if (!is.null(node[[i]])) node[[i]] <- rewrite(node[[i]])
    node
  }
  adapted <- original
  body(adapted) <- rewrite(body(original))
  if (count != 1L) stop("Team volcano participant warning requires review: expected one generateVolcanoPlot.", call. = FALSE)
  adapted
}
