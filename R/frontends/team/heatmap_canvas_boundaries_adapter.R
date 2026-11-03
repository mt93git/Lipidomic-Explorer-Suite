# Team presentation only: one bound renderUI ancestor per movable heatmap.
# The shared renderer bodies, scientific reactives and CSV handlers stay intact.
team_heatmap_canvas_boundaries_adapter <- function(original) {
  stopifnot(is.function(original))
  targets <- c(unfiltered_heatmap_container='unfiltered',filtered_heatmap_container='filtered')
  seen <- setNames(integer(length(targets)),names(targets))
  fail <- function()stop('Team heatmap Canvas adapter requires review: shared UI structure changed')
  assignment <- function(x,name)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name))
  split_ui <- function(node,name) {
    renderer <- node[[3]]
    if(!is.call(renderer)||!identical(renderer[[1]],as.name('renderUI'))||length(renderer)!=2L)fail()
    arg_names<-names(renderer)
    if(!is.null(arg_names)&&!arg_names[2]%in%c('','expr'))fail()
    expr<-renderer[[2]]
    if(!is.call(expr)||!identical(expr[[1]],as.name('{')))fail()
    statements<-as.list(expr)[-1L]
    locate<-function(key){which(vapply(statements,assignment,logical(1),name=key))}
    avg<-locate('show_avg');sd<-locate('show_sd');cards<-locate('cards');quick<-locate('quick_access')
    if(any(lengths(list(avg,sd,cards,quick))!=1L)||!identical(statements[[cards]][[3]],quote(list()))||
       !identical(tail(statements,1)[[1]],if(targets[[name]]=='unfiltered')quote(tagList(quick_access,cards))else quote(tagList(quick_access,cards,script_tag)))||
       !identical(statements[[avg]][[3]],quote(isTRUE(input$condenseRows)||(!isTRUE(input$condenseRows)&&!isTRUE(input$condenseRowsSD))))||
       !identical(statements[[sd]][[3]],quote(isTRUE(input$condenseRowsSD))))fail()
    branches<-lapply(c('show_avg','show_sd'),function(key)which(vapply(statements,function(x)is.call(x)&&identical(x[[1]],as.name('if'))&&length(x)==3L&&identical(x[[2]],as.name(key)),logical(1))))
    if(any(lengths(branches)!=1L))fail()
    # Disabling a card branch must not change controls, scripts or earlier logic.
    order<-c(avg,sd,cards,branches[[1]],branches[[2]],quick)
    if(any(diff(order)<=0L))fail()
    mentions_flag<-function(x){if(is.symbol(x)&&as.character(x)%in%c('show_avg','show_sd'))return(TRUE);if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]])&&mentions_flag(x[[i]]))return(TRUE);FALSE}
    independent<-setdiff(seq_along(statements),c(avg,sd,branches[[1]],branches[[2]]))
    if(any(vapply(statements[independent],mentions_flag,logical(1))))fail()
    expected_ids<-if(targets[[name]]=='unfiltered')c('heatmapPlot','heatmapSDPlot')else c('filteredHeatmapPlot','filteredHeatmapSDPlot')
    plot_ids<-character()
    collect<-function(x){if(is.call(x)&&identical(x[[1]],as.name('plotOutput'))){if(length(x)<2L||!is.call(x[[2]])||!identical(x[[2]][[1]],as.name('ns'))||length(x[[2]])!=2L||!is.character(x[[2]][[2]]))fail();plot_ids<<-c(plot_ids,x[[2]][[2]])};if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]]))collect(x[[i]])}
    collect(expr);if(!identical(plot_ids,expected_ids))fail()
    # The existing handler chooses XLSX when its writer is available, CSV otherwise.
    # A format-neutral Team label stays accurate without changing download behavior.
    download_ids<-if(targets[[name]]=='unfiltered')c('downloadHeatmapCSV','downloadHeatmapSDCSV')else c('downloadFilteredHeatmapCSV','downloadFilteredHeatmapSDCSV')
    renamed<-character()
    label_data<-function(x){
      if(is.call(x)&&identical(x[[1]],as.name('downloadButton'))&&length(x)>=3L&&is.call(x[[2]])&&identical(x[[2]][[1]],as.name('ns'))&&length(x[[2]])==2L&&is.character(x[[2]][[2]])&&x[[2]][[2]]%in%download_ids){
        if(!identical(x[[3]],'CSV'))fail()
        renamed<<-c(renamed,x[[2]][[2]]);x[[3]]<-'Data'
      }
      if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]]))x[[i]]<-label_data(x[[i]])
      x
    }
    expr<-label_data(expr);if(!identical(renamed,download_ids))fail()
    variant<-function(kind){
      result<-expr
      if(kind!='average')result[[avg+1L]][[3]]<-FALSE
      if(kind!='sd')result[[sd+1L]][[3]]<-FALSE
      if(kind!='controls')result[[length(result)]]<-quote(tagList(cards))
      result
    }
    make<-function(id,kind){new<-node;new[[2]]<-substitute(output$ID,list(ID=as.name(id)));new[[3]][[2]]<-variant(kind);new}
    seen[[name]]<<-seen[[name]]+1L
    as.call(c(list(as.name('{')),list(make(name,'controls'),make(paste0(name,'_average'),'average'),make(paste0(name,'_sd'),'sd'))))
  }
  rewrite<-function(node){
    for(name in names(targets))if(is.call(node)&&identical(node[[1]],as.name('<-'))&&identical(node[[2]],substitute(output$ID,list(ID=as.name(name)))))return(split_ui(node,name))
    if(is.recursive(node))for(i in seq_along(node))if(!is.null(node[[i]]))node[[i]]<-rewrite(node[[i]])
    node
  }
  adapted<-original;body(adapted)<-rewrite(body(original))
  if(!identical(unname(seen),c(1L,1L)))fail()
  adapted
}
