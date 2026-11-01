# Plotly adds text to a trace's mode whenever textfont is present. In Team,
# only pass that object when the analyst explicitly enables 3D labels.
team_qc_3d_labels_adapter <- function(original) {
  stopifnot(is.function(original))
  targets <- c('buildPCA3D_plotly','buildLoad3D_plotly')
  counts <- stats::setNames(integer(length(targets)),targets)
  validate_textfont_routes <- function(node) {
    if(is.call(node)&&'textfont'%in%names(node)&&!identical(node[[1]],as.name('plot_ly')))stop('Team QC 3D adapter requires review: unsupported textfont trace')
    if(is.recursive(node))for(i in seq_along(node))validate_textfont_routes(node[[i]])
    invisible(NULL)
  }
  rewrite_plot <- function(node,target) {
    if(is.call(node)&&'textfont'%in%names(node)&&!identical(node[[1]],as.name('plot_ly')))stop('Team QC 3D adapter requires review: unsupported textfont trace')
    if(is.call(node) && identical(node[[1]],as.name('plot_ly')) && 'textfont'%in%names(node)) {
      if(!identical(node[['textfont']],quote(list(color='#000000',size=12))))
        stop('Team QC 3D adapter requires review: textfont structure changed')
      node[['textfont']] <- quote(if(isTRUE(input$showLabels3D)) list(color='#000000',size=12) else NULL)
      counts[[target]] <<- counts[[target]] + 1L
      return(node)
    }
    if(is.recursive(node))for(i in seq_along(node))if(!is.null(node[[i]]))node[[i]]<-rewrite_plot(node[[i]],target)
    node
  }
  rewrite <- function(node) {
    if(is.call(node)&&identical(node[[1]],as.name('<-'))&&is.symbol(node[[2]])&&as.character(node[[2]])%in%targets) {
      rhs<-node[[3]]
      if(!is.call(rhs)||!identical(rhs[[1]],as.name('reactive'))||length(rhs)<2L)stop('Team QC 3D adapter requires review: reactive structure changed')
      arg_name<-names(rhs)[2L];if(is.null(arg_name))arg_name<-''
      if(length(arg_name)!=1L||is.na(arg_name)||!arg_name%in%c('','expr')||!is.call(rhs[[2]])||!identical(rhs[[2]][[1]],as.name('{')))stop('Team QC 3D adapter requires review: first argument must be an expression body')
      validate_textfont_routes(rhs)
      node[[3]]<-rewrite_plot(rhs,as.character(node[[2]]));return(node)
    }
    if(is.recursive(node))for(i in seq_along(node))if(!is.null(node[[i]]))node[[i]]<-rewrite(node[[i]])
    node
  }
  adapted<-original;body(adapted)<-rewrite(body(original))
  if(!identical(unname(counts),c(1L,1L)))stop('Team QC 3D adapter requires review: shared module structure changed')
  adapted
}
