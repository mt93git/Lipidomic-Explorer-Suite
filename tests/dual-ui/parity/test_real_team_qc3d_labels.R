# Real Paula67 3D score/loading label off/on regression, with before/after modes.
suppressPackageStartupMessages({library(shiny);library(ggplot2);library(plotly)})
`%||%`<-function(x,y)if(is.null(x))y else x
source('R/frontends/team/qc_3d_labels_adapter.R')
hub<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'))$team;stopifnot(ncol(hub$matrix)==68L)
original_env<-new.env(parent=globalenv());sys.source('R/modules/2_qc_boxplot_module.R',original_env)
original<-original_env$qc_boxplot_server;before<-serialize(body(original),NULL)
adapted<-team_qc_3d_labels_adapter(original);stopifnot(identical(before,serialize(body(original),NULL)))
drift<-original;body(drift)<-quote(NULL);stopifnot(inherits(try(team_qc_3d_labels_adapter(drift),silent=TRUE),'try-error'))
find_ast<-function(node,p){if(p(node))return(node);if(is.recursive(node))for(i in seq_along(node)){x<-tryCatch(find_ast(node[[i]],p),error=function(e)NULL);if(!is.null(x))return(x)};NULL}
results<-list()
for(stage in c('original','team')){
 ast<-body(if(stage=='original')original else adapted);e<-new.env(parent=globalenv())
 e$input<-shiny::reactiveValues(main_tabs='PCA Score Plots',showLabels3D=FALSE,colorGrouping='Group1',scoreMarkerSize3D=3,loadMarkerSize3D=2,useShapes=FALSE)
 scores<-hub$pca$score_df;scores$Label<-scores$FullName;loads<-hub$pca$load_df;loads$Label<-loads$Lipid_Name
 e$plot_data<-function()list(scores=scores,loadings=loads,var_pc=hub$pca$var_PC)
 e$global_color_map<-function()hub$color_maps;e$local_class_colors<-function()hub$class_colors
 for(pair in list(c('pca3dPlot','buildPCA3D_plotly','PCA Score Plots'),c('load3dPlot','buildLoad3D_plotly','PCA Loading Plots'))){
  expr<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(pair[2])));eval(expr,e);e$input$main_tabs<-pair[3]
  for(enabled in c(FALSE,TRUE)){
   e$input$showLabels3D<-enabled;plot<-shiny::isolate(e[[pair[2]]]());built<-suppressWarnings(plotly::plotly_build(plot))
   modes<-unique(vapply(built$x$data,function(t)t$mode,character(1)));has_text<-all(grepl('text',modes,fixed=TRUE));has_markers<-all(grepl('markers',modes,fixed=TRUE))
   stopifnot(has_markers)
   if(stage=='team')stopifnot(identical(has_text,enabled))else if(!enabled)stopifnot(has_text)
   values<-lapply(built$x$data,function(t)t[c('x','y','z')]);id<-paste(pair[1],stage,if(enabled)'on'else'off',sep=':')
   results[[id]]<-list(labels_requested=enabled,modes=modes,trace_count=length(built$x$data),point_count=sum(vapply(built$x$data,function(t)length(t$x),integer(1))),coordinates_sha256=digest::digest(values,algo='sha256'))
  }
 }
}
for(id in c('pca3dPlot','load3dPlot'))for(enabled in c('off','on'))stopifnot(identical(results[[paste(id,'original',enabled,sep=':')]]$coordinates_sha256,results[[paste(id,'team',enabled,sep=':')]]$coordinates_sha256))
out<-Sys.getenv('QC3D_LABELS_JSON');if(nzchar(out))jsonlite::write_json(results,out,auto_unbox=TRUE,pretty=TRUE)
cat('PASS: actual 3D score/load builders preserve real coordinates; Team labels off=markers, on=markers+text; original defective off behavior recorded; Classic body byte-identical; structural drift rejected\n')
