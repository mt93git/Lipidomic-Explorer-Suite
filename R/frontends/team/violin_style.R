# R/frontends/team/violin_style.R
# Shared by the Feature distributions card (results_dashboard.R) and the Cohort comparison card (cell_show.R).
`%||%` <- get0('%||%', ifnotfound = function(a, b) if (is.null(a)) b else a)

# Team violin style (presentation only), the look of "Selected-feature distributions"
# (R/utils_vis.R plot_logratio_violin): the group colour at 0.8 opacity with a thin
# black outline, a narrow white box (median and quartiles) inside, every sample a
# white dot with a black outline, a light grey dotted horizontal grid, group names at
# 45 degrees, black axis lines left and bottom only and a bold centred title. Box
# traces (too few samples for a violin) take the same colours. Values, samples and
# hover data are untouched; the Nexo editor and presets still override it.
team_violin_style <- function(p, colors, title = NULL) {
  attr(p, 'team_violin_colors') <- colors
  attr(p, 'team_violin_title') <- title
  class(p) <- c('team_violin_style', setdiff(class(p), 'team_violin_style'))
  p
}
rd_rgba <- function(col, a) { m <- grDevices::col2rgb(col)[, 1]; sprintf('rgba(%d,%d,%d,%s)', m[1], m[2], m[3], format(a)) }
plotly_build.team_violin_style <- function(p, ...) {
  colors <- attr(p, 'team_violin_colors'); title <- attr(p, 'team_violin_title')
  class(p) <- setdiff(class(p), 'team_violin_style')
  p <- plotly::plotly_build(p, ...)
  p$x$data <- lapply(p$x$data, function(trace) {
    col <- if (trace$type %in% c('violin', 'box')) unname(colors[as.character(trace$name)]) else NA
    if (length(col) != 1L || is.na(col) || !grepl('^#[0-9A-Fa-f]{6}$', col)) return(trace)
    trace$fillcolor <- rd_rgba(col, 0.8)
    trace$line <- list(color = '#000000', width = 0.5)
    trace$marker <- list(color = '#ffffff', size = 6, opacity = 1, line = list(color = '#000000', width = 1))
    if (identical(trace$type, 'violin')) {
      trace$box <- list(visible = TRUE, width = 0.2, fillcolor = '#ffffff', line = list(color = '#000000', width = 1))
      trace$meanline <- list(visible = FALSE)
    }
    trace
  })
  axis <- list(showline = TRUE, mirror = FALSE, linecolor = '#000000', linewidth = 1, ticks = 'outside', zeroline = FALSE)
  p$x$layout$xaxis <- utils::modifyList(if (is.list(p$x$layout$xaxis)) p$x$layout$xaxis else list(), c(axis, list(showgrid = FALSE, tickangle = -45)))
  p$x$layout$yaxis <- utils::modifyList(if (is.list(p$x$layout$yaxis)) p$x$layout$yaxis else list(), c(axis, list(showgrid = TRUE, gridcolor = '#cccccc', griddash = 'dot')))
  p$x$layout$paper_bgcolor <- '#ffffff'; p$x$layout$plot_bgcolor <- '#ffffff'
  if (is.character(title) && length(title) == 1L && nzchar(title)) {
    p$x$layout$title <- list(text = paste0('<b>', htmltools::htmlEscape(title), '</b>'), x = 0.5, xanchor = 'center', font = list(size = 14, color = '#000000'))
    m <- p$x$layout$margin; if (is.list(m)) { m$t <- max(as.numeric(m$t %||% 0), 36); p$x$layout$margin <- m }
  }
  p
}
