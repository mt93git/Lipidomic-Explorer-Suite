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

team_qc_vector_adapter <- function(original) {
  stopifnot(is.function(original))
  targets <- list(pca2dPlot='buildPCA2D_ggplot',load2dPlot='buildLoad2D_ggplot')
  counts <- setNames(integer(length(targets)),names(targets))
  rewrite <- function(node) {
    for (id in names(targets)) {
      expected <- substitute(output$ID <- renderPlot({ BUILDER() }),
        list(ID=as.name(id),BUILDER=as.name(targets[[id]])))
      if (identical(node,expected)) {
        counts[[id]] <<- counts[[id]]+1L
        return(substitute({ ORIGINAL; output$VECTOR <- plotly::renderPlotly({
          shiny::req(isTRUE(input$TOGGLE)); team_qc_editable_vector(BUILDER())
        }) },list(ORIGINAL=node,VECTOR=as.name(sub('Plot$','VectorPlot',id)),
          TOGGLE=as.name(paste0('team_',id,'_vector')),BUILDER=as.name(targets[[id]]))))
      }
    }
    if (is.call(node)) for(i in seq_along(node)) if(!is.null(node[[i]])) node[[i]] <- rewrite(node[[i]])
    node
  }
  adapted <- original; body(adapted) <- rewrite(body(original))
  if (!all(counts==1L)) stop('Team QC vector adapter requires review: source output structure changed')
  bindings <- new.env(parent=environment(original));bindings$team_qc_editable_vector <- team_qc_editable_vector
  environment(adapted) <- bindings;adapted
}
