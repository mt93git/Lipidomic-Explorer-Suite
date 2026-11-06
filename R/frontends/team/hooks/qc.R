# Team implementations of the QC hooks called by R/modules/2_qc_boxplot_module.R.

# Plotly adds text to a trace's mode whenever textfont is present, so Team
# passes it only when the analyst explicitly enables 3D labels.
team_qc_3d_textfont <- function(textfont, input, ...) {
  if (isTRUE(input$showLabels3D)) textfont else NULL
}

# Optional presentation-only view of the original QC ggplot. Original rendering,
# downloads and scientific builders remain available and unchanged.
team_qc_editable_vector <- function(plot) {
  unavailable <- function(detail) shiny::validate(shiny::need(FALSE, paste0(
    'Editable vector view unavailable: ', detail,
    ' Switch off Editable vector view to use the original plot and downloads.')))
  if (!inherits(plot, 'ggplot')) unavailable('the source is not a ggplot.')
  allowed <- c('GeomPoint', 'GeomHline', 'GeomVline', 'GeomText')
  geoms <- vapply(plot$layers, function(layer) class(layer$geom)[1L], character(1))
  if ('GeomTextRepel' %in% geoms) unavailable('smart repelled labels are preserved only in the original view; disable smart labels to edit this view.')
  if (any(!geoms %in% allowed) || !inherits(plot$coordinates, 'CoordCartesian') ||
      !inherits(plot$facet, 'FacetNull')) unavailable('this layer or coordinate layout is not supported.')
  if (any(vapply(plot$labels, function(label) is.expression(label) || is.language(label), logical(1))))
    unavailable('mathematical expression labels require the original view.')
  built <- ggplot2::ggplot_build(plot)
  scales <- c(built$layout$panel_scales_x, built$layout$panel_scales_y)
  if (any(vapply(scales, function(s) !identical(s$trans$name, 'identity'), logical(1))))
    unavailable('transformed axes require the original view.')
  converted <- tryCatch(withCallingHandlers(plotly::ggplotly(plot),
    warning=function(w) stop(conditionMessage(w), call.=FALSE)), error=function(e) NULL)
  if (is.null(converted)) unavailable('the renderer could not preserve all source layers.')
  pairs <- function(x,y,label=NULL) {
    if (!length(x)) return(character())
    if (is.null(label)) label <- rep('',length(x))
    sort(paste(sprintf("%.17g",as.numeric(x)),sprintf("%.17g",as.numeric(y)),label,sep='|'))
  }
  colour <- function(value) {
    if (!is.character(value) || anyNA(value)) unavailable('source colors could not be verified.')
    vapply(value,function(v) {
      if(grepl('^rgba?\\(',v)) {
        numbers<-as.numeric(strsplit(gsub('^rgba?\\(|\\)$','',v),',')[[1]])
        if(length(numbers)<3L || anyNA(numbers)) unavailable('source colors could not be verified.')
        paste(c(numbers[1:3],if(length(numbers)==4L)numbers[4]else 1),collapse=',')
      } else {rgb<-grDevices::col2rgb(v,alpha=TRUE)[,1];paste(c(rgb[1:3],rgb[4]/255),collapse=',')}
    },character(1),USE.NAMES=FALSE)
  }
  expected_colors <- actual_colors <- character()
  expected_points <- expected_text <- character()
  for (i in seq_along(geoms)) {
    d <- built$data[[i]]
    if (geoms[i]=='GeomPoint') {expected_points <- c(expected_points,pairs(d$x,d$y));expected_colors<-c(expected_colors,pairs(d$x,d$y,colour(d$colour)))}
    if (geoms[i]=='GeomText') expected_text <- c(expected_text,pairs(d$x,d$y,as.character(d$label)))
  }
  actual_points <- actual_text <- character()
  for (trace in converted$x$data) {
    if (grepl('markers',trace$mode %||% '',fixed=TRUE)) {actual_points <- c(actual_points,pairs(trace$x,trace$y));actual_colors<-c(actual_colors,pairs(trace$x,trace$y,rep(colour(trace$marker$color),length.out=length(trace$x))))}
    if (grepl('text',trace$mode %||% '',fixed=TRUE)) actual_text <- c(actual_text,pairs(trace$x,trace$y,trace$text))
  }
  if (!identical(sort(expected_colors),sort(actual_colors))) unavailable('source point colors did not match.')
  if (!identical(sort(expected_points),sort(actual_points)) ||
      !identical(sort(expected_text),sort(actual_text))) unavailable('source point or label coordinates did not match.')
  converted
}

# Adds output$<id without "Plot">VectorPlot next to each original 2D plot, shown
# only while input team_<id>_vector is on (e.g. pca2dVectorPlot, team_pca2dPlot_vector).
team_qc_plot_outputs <- function(output, input, builders, ...) {
  for (id in names(builders)) local({
    builder <- builders[[id]]
    toggle <- paste0('team_', id, '_vector')
    output[[sub('Plot$', 'VectorPlot', id)]] <- plotly::renderPlotly({
      shiny::req(isTRUE(input[[toggle]])); team_qc_editable_vector(builder())
    })
  })
  invisible(output)
}

lipidomic_hook_register("qc_3d_textfont", team_qc_3d_textfont)
lipidomic_hook_register("qc_plot_outputs", team_qc_plot_outputs)
