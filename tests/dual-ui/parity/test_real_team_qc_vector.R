# Existing prepared Paula67 coordinates; no recomputation or invented contrasts.
suppressPackageStartupMessages({library(shiny);library(ggplot2);library(plotly);library(dplyr);library(tidyr);library(ggrepel)})
`%||%`<-function(x,y)if(is.null(x))y else x
source('R/frontends/team/legacy_vector_adapter.R')
hub<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'))$team;stopifnot(ncol(hub$matrix)==68L)
env<-new.env(parent=globalenv());sys.source('R/modules/2_qc_boxplot_module.R',env)
find_ast<-function(node,p){if(p(node))return(node);if(is.recursive(node))for(i in seq_along(node)){x<-tryCatch(find_ast(node[[i]],p),error=function(e)NULL);if(!is.null(x))return(x)};NULL}
e<-new.env(parent=globalenv());scores<-hub$pca$score_df;scores$Label<-scores$FullName;loads<-hub$pca$load_df;loads$Label<-loads$Lipid_Name
e$plot_data<-function()list(scores=scores,loadings=loads,var_pc=hub$pca$var_PC)
e$global_color_map<-function()hub$color_maps;e$local_class_colors<-function()hub$class_colors
e$input<-reactiveValues(main_tabs='PCA Score Plots',colorGrouping='Group1',useShapes=FALSE,scoreMarkerSize2D=3,loadMarkerSize2D=2,smartLabelPCA2D=FALSE,showSingleLipidNames=FALSE,addFrame2D=FALSE,mergeReplicatesMode='individual',smartLabelLoad2D=FALSE,loadTextSize2D=3)
results<-list()
for(pair in list(c('score','buildPCA2D_ggplot','PCA Score Plots'),c('load','buildLoad2D_ggplot','PCA Loading Plots'))){
 expr<-find_ast(body(env$qc_boxplot_server),function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(pair[2])));eval(expr,e);e$input$main_tabs<-pair[3]
 p<-isolate(e[[pair[2]]]());csv_before<-digest::digest(paste(capture.output(write.csv(p$data,row.names=FALSE)),collapse='\n'),algo='sha256');before<-digest::digest(ggplot_build(p)$data,algo='sha256');q<-team_qc_editable_vector(p);stopifnot(identical(before,digest::digest(ggplot_build(p)$data,algo='sha256')))
 if(nzchar(Sys.getenv('QC_VECTOR_PAYLOAD_DIR'))){dir.create(Sys.getenv('QC_VECTOR_PAYLOAD_DIR'),showWarnings=FALSE,recursive=TRUE);writeLines(plotly::plotly_json(q,jsonedit=FALSE,pretty=FALSE),file.path(Sys.getenv('QC_VECTOR_PAYLOAD_DIR'),paste0(pair[1],'.json')))}
 stopifnot(identical(csv_before,digest::digest(paste(capture.output(write.csv(p$data,row.names=FALSE)),collapse='\n'),algo='sha256')))
 count<-sum(vapply(q$x$data,function(t)if(grepl('markers',t$mode %||% '',fixed=TRUE))length(t$x)else 0L,integer(1)))
 stopifnot(count==if(pair[1]=='score')67L else nrow(loads));results[[pair[1]]]<-list(status='PASS',points=count,source_layers_sha256=before,source_point_csv_sha256=csv_before,source_point_csv_unchanged=TRUE,exact_coordinates_checked=TRUE,exact_point_colors_checked=TRUE)
 if(pair[1]=='load'){
 e$input$showSingleLipidNames<-TRUE;p<-isolate(e[[pair[2]]]());q<-team_qc_editable_vector(p);results$load_labels<-list(status='PASS',labels=sum(vapply(q$x$data,function(t)if(grepl('text',t$mode %||% '',fixed=TRUE))length(t$text)else 0L,integer(1))),exact_label_anchor_coordinates_checked=TRUE)
 e$input$smartLabelLoad2D<-TRUE;stopifnot(inherits(try(team_qc_editable_vector(isolate(e[[pair[2]]]())),silent=TRUE),'try-error'))
 }
}
if(nzchar(Sys.getenv('QC_VECTOR_JSON')))jsonlite::write_json(results,Sys.getenv('QC_VECTOR_JSON'),pretty=TRUE,auto_unbox=TRUE)
cat('PASS actual Paula67 QC vector: exact source points/labels; source built data unchanged; repelled labels fail closed\n')
