# Every Team/Nexo violin card defaults to the look of "Selected-feature distributions"
# (R/utils_vis.R plot_logratio_violin): group-coloured semi-opaque violin with a thin
# black outline, a narrow white box (median and IQR) inside, every sample a white dot
# with a black outline, a light grey dotted y grid, group names at 45 degrees, black
# axis lines left and bottom only and a bold centred title. Presentation only: the
# drawn values, the number of points and the group colours stay the same.
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R'); source('R/frontends/team/results_dashboard.R')
value <- function(x) { force(x); function(...) x }
set.seed(7)
samples <- paste0('S', 1:18)
df <- data.frame(Lipid_Name = c('PC 34:1', 'PE 36:2', 'SM 42:1'), matrix(round(runif(3 * 18, 1, 500), 3), nrow = 3), check.names = FALSE)
names(df)[-1] <- samples
df[1, 'S4'] <- 0  # a nonpositive value stays excluded, as before
meta <- data.frame(FullName = samples, Group1 = rep(c('Alpha', 'Beta', 'Gamma'), each = 6), Group2 = 'X')
palette <- list(useCustomColors = TRUE, custom_colors = list(Alpha = '#1b9e77', Beta = '#d95f02', Gamma = '#7570b3'))
violin_payload <- function(compact) {
  hub <- list(data_processed = value(df), all_metadata = value(meta), preparation_audit = value(list()), preparation_dirty = value(FALSE),
    color_maps = value(list(Group1 = c(Alpha = '#1b9e77', Beta = '#d95f02', Gamma = '#7570b3'))), class_color_map = value(list()),
    palette_settings = value(palette), team_compact_distribution = compact)
  out <- NULL
  testServer(function(input, output, session) results_dashboard_module_server(input, output, session, hub), {
    session$setInputs(color_by = 'Group1', violin_lipid = 'PC 34:1'); session$flushReact()
    out <<- jsonlite::fromJSON(output$plot_violin, simplifyVector = FALSE)$x
  })
  out
}
unpack_y <- function(y) if (is.list(y) && !is.null(y$teamFloat64)) { r <- jsonlite::base64_dec(y$teamFloat64); readBin(r, 'double', length(r) / 8L, size = 8L, endian = 'little') } else unlist(y)
rgba_of <- function(hex, a) { m <- grDevices::col2rgb(hex)[, 1]; sprintf('rgba(%d,%d,%d,%s)', m[1], m[2], m[3], format(a)) }

check_reference_look <- function(traces, layout, colors, what) {
  for (t in traces) {
    col <- colors[[t$name]]
    if (!identical(t$fillcolor, rgba_of(col, 0.8))) stop(what, ': fill of ', t$name, ' is ', t$fillcolor, ', not its group colour at 0.8')
    if (!identical(t$line$color, '#000000') || !isTRUE(abs(t$line$width - 0.5) < 1e-9)) stop(what, ': outline is not thin black')
    if (!identical(t$marker$color, '#ffffff') || !identical(t$marker$line$color, '#000000') || !identical(t$marker$line$width, 1L) && !identical(t$marker$line$width, 1))
      stop(what, ': points are not white with a black outline')
    if (identical(t$type, 'violin')) {
      if (!isTRUE(t$box$visible) || !identical(t$box$fillcolor, '#ffffff') || !identical(t$box$line$color, '#000000') || !isTRUE(t$box$width <= 0.25))
        stop(what, ': the narrow white box is not drawn inside the violin')
      if (!identical(t$points, 'all') || isTRUE(t$meanline$visible)) stop(what, ': every sample must show, without a mean line')
    } else if (!identical(t$boxpoints, 'all')) stop(what, ': every sample must show on the box')
  }
  x <- layout$xaxis; y <- layout$yaxis
  if (!isTRUE(x$showline) || !isTRUE(y$showline) || isTRUE(x$mirror) || isTRUE(y$mirror) || !identical(x$linecolor, '#000000') || !identical(y$linecolor, '#000000'))
    stop(what, ': axes must be black lines on the left and bottom only (no top/right frame)')
  if (!identical(as.numeric(x$tickangle), -45)) stop(what, ': group names are not at 45 degrees')
  if (!isTRUE(y$showgrid) || !identical(y$griddash, 'dot') || !identical(y$gridcolor, '#cccccc') || isTRUE(x$showgrid))
    stop(what, ': only a light grey dotted horizontal grid is drawn')
  if (!identical(layout$paper_bgcolor, '#ffffff') || !identical(layout$plot_bgcolor, '#ffffff')) stop(what, ': background is not white')
}

# 1. Dashboard "Feature distributions" (results_dashboard-plot_violin).
styled <- violin_payload(TRUE); plain <- violin_payload(FALSE)
violins <- function(p) Filter(function(t) identical(t$type, 'violin'), p$data)
colors <- rd_team_resolved_condition_colors(c('Alpha', 'Beta', 'Gamma'), palette, 'Group1')
stopifnot(identical(unname(colors), c('#1b9e77', '#d95f02', '#7570b3')))
check_reference_look(violins(styled), styled$layout, as.list(colors), 'Feature distributions')
title <- styled$layout$title; title_text <- if (is.list(title)) title$text else title
if (!identical(title_text, '<b>PC 34:1</b>') || !identical(as.numeric(title$x), 0.5)) stop('Feature distributions: the lipid is not a bold centred title')
ytitle <- styled$layout$yaxis$title; if (!identical(if (is.list(ytitle)) ytitle$text else ytitle, 'log10 prepared abundance')) stop('Feature distributions: y title changed')
# Values: the same samples and y per group as the undecorated figure.
values <- function(p) { v <- lapply(violins(p), function(t) sort(unpack_y(t$y))); names(v) <- vapply(violins(p), `[[`, '', 'name'); v[order(names(v))] }
stopifnot(identical(values(styled), values(plain)), sum(lengths(values(styled))) == 17L)
stopifnot(identical(unlist(lapply(violins(styled), `[[`, 'customdata')), unlist(lapply(violins(plain), `[[`, 'customdata'))))
cat('PASS Feature distributions: reference violin look; group colours, values and 17 points unchanged\n')

# 2. Cell "Cohort comparison" (cell_comparison_plot): its violin (n >= 8) and box (n < 8)
# draw through the same Team style; its fixed Reference/Comparison colours stay.
src <- paste(readLines('R/frontends/team/cell_show.R', warn = FALSE), collapse = '\n')
line <- regmatches(src, regexpr('output\\$cell_comparison_plot<-[^\n]*', src))
stopifnot(length(line) == 1L, grepl("team_violin_style", line, fixed = TRUE))
cell_colors <- c(Reference = '#176b73', Comparison = '#c55432')
for (n in c(10L, 5L)) {
  v <- data.frame(Plot_group = factor(rep(c('Reference', 'Comparison'), each = n), levels = c('Reference', 'Comparison')), Prepared_signal = c(rnorm(n, 10), rnorm(n, 12)))
  kind <- if (n >= 8L) 'violin' else 'box'
  args <- list(data = v, x = ~Plot_group, y = ~Prepared_signal, type = kind, jitter = .18, pointpos = 0, color = ~Plot_group, colors = unname(cell_colors))
  if (kind == 'violin') { args$points <- 'all'; args$box <- list(visible = TRUE); args$meanline <- list(visible = TRUE) } else args$boxpoints <- 'all'
  p <- do.call(plotly::plot_ly, args)
  before <- plotly::plotly_build(p)$x
  styled_p <- team_violin_style(p, cell_colors) |> plotly::layout(yaxis = list(title = 'Prepared abundance signal'), xaxis = list(title = ''), showlegend = FALSE) |> plotly::event_register('plotly_click') |> htmlwidgets::onRender('function(el) {}')
  after <- plotly::plotly_build(styled_p)$x
  check_reference_look(after$data, after$layout, as.list(cell_colors), paste('Cohort comparison', kind))
  stopifnot(identical(lapply(after$data, `[[`, 'y'), lapply(before$data, `[[`, 'y')), identical(lapply(after$data, `[[`, 'x'), lapply(before$data, `[[`, 'x')))
  cat('PASS Cohort comparison', kind, ': reference look; values and', 2L * n, 'points unchanged\n')
}
