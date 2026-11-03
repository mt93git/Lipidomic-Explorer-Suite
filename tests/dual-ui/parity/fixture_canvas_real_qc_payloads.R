# Focused retention of existing real QC cases, no new scientific settings.
# One descriptive configuration per tool on saved actual Paula67 hub state.
# No differential inference, chronology, exclusions, or clinical groups are invented.
suppressPackageStartupMessages({library(shiny);library(ggplot2);library(plotly);library(dplyr);library(tidyr);library(ggrepel);library(scales);library(stringr);library(tibble)})
`%||%`<-function(x,y)if(is.null(x))y else x
source('R/utils_data.R');source('R/utils_colors.R');source('R/utils_vis.R');source('R/utils_plot_events.R');source('R/modules/utils_stats.R')
source('R/sample_metadata_import.R');source('R/results_dashboard.R');source('R/frontends/team/qc_3d_labels_adapter.R')
path <- Sys.getenv('PRIVATE_HUB_RDS');stopifnot(nzchar(path))
hubs <- readRDS(path);stopifnot(ncol(hubs$team$matrix)==68L,is.null(hubs$team$de))
value <- function(x){force(x);function(...)x}
find_ast <- function(node,predicate){if(predicate(node))return(node);if(is.recursive(node))for(i in seq_along(node)){v<-tryCatch(find_ast(node[[i]],predicate),error=function(e)NULL);if(!is.null(v))return(v)};NULL}
named <- function(ast,name)find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name))&&is.call(x[[3]])&&identical(x[[3]][[1]],as.name('reactive')))
output_expr <- function(ast,name)find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],substitute(output$NAME,list(NAME=as.name(name)))))
for(expr in parse('R/global.R'))if(is.call(expr)&&identical(expr[[1]],as.name('<-'))&&identical(expr[[2]],as.name('get_short_class_name')))eval(expr)
results <- list()
payload_dir<-Sys.getenv('PRIVATE_PAYLOAD_DIR');stopifnot(nzchar(payload_dir))
current_id<-NULL
record <- function(id,policy,kind,fn){
 current_id<<-id
 tryCatch({payload<-fn();stopifnot(!is.null(payload));results[[id]][[policy]]<<-list(status='PASS',kind=kind,sha256=digest::digest(payload,algo='sha256'))},error=function(e){results[[id]][[policy]]<<-list(status='FAIL',kind=kind,error=conditionMessage(e));message(id,' ',policy,' failed: ',conditionMessage(e))})
}
plot_payload <- function(p){
 if(inherits(p,'ggplot')){
  built<-ggplot2::ggplot_build(p);tmp<-tempfile(fileext='.png');grDevices::png(tmp,width=900,height=700);tryCatch(print(p),finally=grDevices::dev.off());stopifnot(file.info(tmp)$size>0);file.copy(tmp,file.path(payload_dir,paste0(current_id,'.png')),overwrite=TRUE);unlink(tmp);built$data
 }else if(inherits(p,'plotly')) {payload<-plotly::plotly_build(p)$x;jsonlite::write_json(list(x=jsonlite::fromJSON(plotly::plotly_json(p,jsonedit=FALSE,pretty=FALSE),simplifyVector=FALSE)),file.path(payload_dir,paste0(current_id,'.json')),auto_unbox=TRUE);payload$data} else stop('Unsupported plot type')
}
qc_original_env<-new.env(parent=globalenv());sys.source('R/modules/2_qc_boxplot_module.R',qc_original_env)
qc_original<-qc_original_env$qc_boxplot_server
for(policy in 'team'){
 d<-hubs[[policy]]
 qc_ast<-body(if(policy=='team')team_qc_3d_labels_adapter(qc_original)else qc_original)
 # Explicitly use the same existing palette in both cases; session-generated
 # palettes are otherwise independent and are not scientific parity evidence.
 common<-hubs$classic
 h<-list(data_processed=value(d$matrix),all_metadata=value(d$metadata),pca_results=value(d$pca),
  global_filtered_lipids=value(d$filtered_ids),targeted_mode_active=value(d$targeted),
  annotationData=value(d$annotation),class_color_map=value(common$class_colors),
  species_color_map=value(common$class_colors),origin_color_map=value(common$class_colors),
  get_restored_input=function(id,default)default)
 e<-new.env(parent=globalenv());e$shared_data<-h;e$global_color_map<-value(common$color_maps)
 e$sample_corr_fallback_active<-function(...)FALSE
 e$input<-shiny::reactiveValues(main_tabs='PCA Score Plots',mergeReplicatesMode='individual',
  classLabelFormat='short',colorGrouping='Group1',scoreMarkerSize2D=3,scoreMarkerSize3D=3,
  loadMarkerSize2D=2,loadMarkerSize3D=2,useShapes=FALSE,labelParts=NULL,showLabels3D=FALSE,
  showSingleLipidNames=FALSE,smartLabelPCA2D=FALSE,outlierScope='global',outlierThreshold=3,
  outlierNumShow=30,corrMethod='pearson',corrCluster=FALSE,corrShowLabels=FALSE)
 for(helper_name in c('prepare_boxplot_data','build_merged_group_vector')){helper<-find_ast(qc_ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(helper_name)));eval(helper,e)}
 for(n in c('plot_data','local_class_colors','boxplotAfterPlotObj','buildPCA2D_ggplot','buildPCA3D_plotly','buildLoad2D_ggplot','buildLoad3D_plotly','buildSampleCorrMatrix','buildSampleCorrPlot','outlierScores','outlierScoresFiltered','outlierPlotObj'))eval(named(qc_ast,n),e)
 cases<-list(boxplotAfterNorm=c('Normalization Check','boxplotAfterPlotObj'),pca2dPlot=c('PCA Score Plots','buildPCA2D_ggplot'),pca3dPlot=c('PCA Score Plots','buildPCA3D_plotly'),load2dPlot=c('PCA Loading Plots','buildLoad2D_ggplot'),load3dPlot=c('PCA Loading Plots','buildLoad3D_plotly'),sampleCorrPlot=c('Sample Correlation','buildSampleCorrPlot'),outlierPlot=c('Outliers Detection','outlierPlotObj'))
 for(id in names(cases)){
  e$input$main_tabs<-cases[[id]][1]
  record(paste0('qc_pca_tab-',id),policy,'production reactive + built layers/traces + PNG for ggplot',function(){
   p<-shiny::isolate(e[[cases[[id]][2]]]())
   expected<-switch(id,boxplotAfterNorm=67L,pca2dPlot=67L,pca3dPlot=67L,load2dPlot=nrow(d$pca$load_df),load3dPlot=nrow(d$pca$load_df),sampleCorrPlot=67L*67L,outlierPlot=30L)
   observed<-if(inherits(p,'ggplot'))nrow(ggplot2::ggplot_build(p)$data[[1]])else sum(vapply(plotly::plotly_build(p)$x$data,function(trace)length(trace$x),integer(1)))
   stopifnot(observed==expected);payload<-plot_payload(p)
   if(id%in%c('pca3dPlot','load3dPlot')){if(policy=='team')stopifnot(all(vapply(payload,function(trace)identical(trace$mode,'markers'),logical(1))));payload<-lapply(payload,function(trace)trace[c('x','y','z','name')])}
   payload
  })
 }
 e$tempOutlierTreatments<-value(list())
 outlier_expr<-output_expr(qc_ast,'outlierPcaPlot');outlier_fn<-eval(call('function',pairlist(),outlier_expr[[3]][[2]]),e)
 record('qc_pca_tab-outlierPcaPlot',policy,'production output renderer body + PNG',function()plot_payload(shiny::isolate(outlier_fn())))

}
stopifnot(all(vapply(results,function(x)identical(x$team$status,"PASS"),logical(1))))
