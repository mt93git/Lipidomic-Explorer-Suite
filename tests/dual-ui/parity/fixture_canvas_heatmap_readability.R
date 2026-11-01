# Retain the existing two independently validated Paula67 heatmap cases locally.
# Current 67-sample class-mean and within-class-SD heatmaps, one configuration.
# Uses actual production reactives and checks each underlying matrix independently.
suppressPackageStartupMessages({library(shiny);library(ggplot2);library(plotly);library(dplyr);library(tidyr);library(ggrepel);library(scales);library(stringr);library(tibble)})
`%||%`<-function(x,y)if(is.null(x))y else x
source('R/utils_data.R');source('R/utils_colors.R');source('R/utils_vis.R');source('R/utils_plot_events.R');source('R/modules/utils_stats.R')

for(expr in parse('R/global.R'))if(is.call(expr)&&identical(expr[[1]],as.name('<-'))&&as.character(expr[[2]])%in%c('get_short_class_name','get_full_class_name'))eval(expr)
library(pheatmap)

hubs<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'));stopifnot(ncol(hubs$team$matrix)==68L)
find_ast<-function(node,p){if(p(node))return(node);if(is.recursive(node))for(i in seq_along(node)){x<-tryCatch(find_ast(node[[i]],p),error=function(e)NULL);if(!is.null(x))return(x)};NULL}
value<-function(x){force(x);function(...)x}
ast<-parse('R/modules/4_heatmap_module.R');results<-list()
for(policy in 'team'){
 d<-hubs[[policy]];common<-hubs$classic;e<-new.env(parent=globalenv())
 e$shared_data<-list(data_processed=value(d$matrix),global_filtered_lipids=value(d$filtered_ids),targeted_mode_active=value(FALSE),annotationData=value(d$annotation),class_color_map=value(common$class_colors),origin_color_map=value(common$class_colors),species_color_map=value(common$class_colors))
 meta<-d$metadata;meta$Display_Name<-meta$FullName;e$dynamic_metadata<-value(meta)
 e$heatmap_fallback_active<-function(...)FALSE;e$rv_cols<-list(hidden=character());e$rv_ordering<-list(customize_row_enabled=FALSE,custom_row=NULL)
 e$input<-list(repMode='replicate',heatmapScaleMode='global_zscore',classLabelFormat='full',condenseRows=TRUE,condenseRowsSD=TRUE,staircaseGroup='subclass',customizeRowOrder=FALSE,activateCellAnnotation=FALSE,fineTuneColors=FALSE,hideHeatmapRowNames=FALSE)
 for(name in c('replicateMatrixData','unfilteredHeatmapObj','unfilteredHeatmapSDObj')){
  expr<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name)));stopifnot(!is.null(expr));eval(expr,e)
 }
 mat<-as.matrix(d$matrix[d$matrix$Lipid_Name%in%d$filtered_ids,-1]);rownames(mat)<-d$matrix$Lipid_Name[d$matrix$Lipid_Name%in%d$filtered_ids]
 classes<-get_full_class_name(d$annotation$subclass[match(rownames(mat),d$annotation$Lipid_Name)])
 for(kind in c('mean','sd')){
  obj<-shiny::isolate(e[[if(kind=='mean')'unfilteredHeatmapObj'else'unfilteredHeatmapSDObj']]());stopifnot(!is.null(obj$ht$gtable),ncol(obj$data)==67)
  expected<-do.call(rbind,lapply(rownames(obj$data),function(cls){sub<-mat[classes==cls&!is.na(classes),,drop=FALSE];if(kind=='mean')colMeans(sub)else if(nrow(sub)<=1)rep(0,ncol(sub))else apply(sub,2,sd)}));dimnames(expected)<-dimnames(obj$data)
  error<-max(abs(obj$data-expected)/pmax(1,abs(expected)));stopifnot(error<1e-12)
  id<-paste0('heatmap_barchart_tab-',if(kind=='mean')'heatmapPlot'else'heatmapSDPlot')
  for(size in list(list(name='small',width=545,height=408),list(name='readable',width=925,height=788))){
   file<-file.path(Sys.getenv('HEATMAP_READABILITY_DIR'),paste0(id,'-',size$name,'.png'));grDevices::png(file,width=size$width,height=size$height);grid::grid.newpage();grid::grid.draw(obj$ht$gtable);grDevices::dev.off();stopifnot(file.info(file)$size>0)
  }
  id<-paste0('heatmap_barchart_tab-',if(kind=='mean')'heatmapPlot'else'heatmapSDPlot')
  results[[id]][[policy]]<-list(status='PASS',kind=kind,rows=nrow(obj$data),samples=ncol(obj$data),independent_max_normalized_error=error,matrix_sha256=digest::digest(obj$data,algo='sha256'))
 }
}

out<-Sys.getenv('HEATMAP_CASES_JSON');if(nzchar(out))jsonlite::write_json(results,out,auto_unbox=TRUE,pretty=TRUE)
cat('PASS: same production full-label gtable at small545x408 and readable925x788;21classes x67real samples; mean/SD matrices independently match raw aggregates. Presentation comparison only.\n')
