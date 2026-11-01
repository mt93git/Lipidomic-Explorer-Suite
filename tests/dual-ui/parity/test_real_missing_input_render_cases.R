# Exercise actual output renderer bodies with Paula67 prepared data and honest
# absent prerequisites. These are informative-state checks, never analysis passes.
source('R/global.R')
hubs<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'));stopifnot(ncol(hubs$team$matrix)==68L,is.null(hubs$team$de))
find_ast<-function(node,p){if(p(node))return(node);if(is.recursive(node))for(i in seq_along(node)){x<-tryCatch(find_ast(node[[i]],p),error=function(e)NULL);if(!is.null(x))return(x)};NULL}
value<-function(x){force(x);function(...)x}
cases<-list(
 c('5_barchart_module.R','barchart','barPlotFiltered','missing differential result'),c('5_barchart_module.R','barchart','donutPlotFiltered','missing differential result'),
 c('6_volcano_module.R','volcano_tab','volcanoPlot','missing differential result'),
 c('13_pathway_module.R','pathway_tab','pathwayPlot','missing differential contrast'),
 c('7_lsea_module.R','lsea_tab','lseaPlot','missing differential result'),
 c('4_heatmap_module.R','heatmap_barchart_tab','filteredHeatmapPlot','missing differential result'),c('4_heatmap_module.R','heatmap_barchart_tab','filteredHeatmapSDPlot','missing differential result'),
 c('8_structural_module.R','structural_tab','summaryPlot','missing differential result'),c('8_structural_module.R','structural_tab','speciesPlotPlot','missing differential result'),
 c('12_structural_grid_module.R','structural_grid_tab','heatmapPlot','missing differential result'),c('12_structural_grid_module.R','structural_grid_tab','dotplotPlot','missing differential result'),c('12_structural_grid_module.R','structural_grid_tab','mergedPlot','missing differential result'),c('12_structural_grid_module.R','structural_grid_tab','diffAllPlot','missing differential result'),
 c('9_logratio_module.R','logratio_tab','logratioPlot','no baseline selected'),c('10_fla_module.R','fla_tab','logratioPlot','no baseline selected'),c('10_fla_module.R','fla_tab','plotVolcano','no baseline selected'),
 c('14_cellular_org_module.R','cellular_org_tab','stressPlot','no baseline selected'),c('14_cellular_org_module.R','cellular_org_tab','cpiPlot','no baseline selected'),
 c('2_qc_boxplot_module.R','qc_pca_tab','bqcPlot','no BQC replicate identities'),c('2_qc_boxplot_module.R','qc_pca_tab','bqcDeviationPlot','no BQC replicate identities'),c('2_qc_boxplot_module.R','qc_pca_tab','bqcAbundancePlot','no BQC replicate identities'))
results<-list()
for(case in cases){
 id<-paste0(case[2],'-',case[3]);ast<-parse(file.path('R/modules',case[1]));expr<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],substitute(output$NAME,list(NAME=as.name(case[3])))));stopifnot(!is.null(expr))
 for(policy in c('classic','team')){
  e<-new.env(parent=globalenv());d<-hubs[[policy]];e$input<-list();e$shared_data<-list(data_processed=value(d$matrix),de_results=value(NULL),de_contrast_info=value(NULL));e$bqcStats<-value(NULL)
  if(case[2]%in%c('volcano_tab','pathway_tab')){helper_name<-if(case[2]=='volcano_tab')'generateVolcanoPlot'else'buildPathwayPlot';helper<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(helper_name)));eval(helper,e)}
  fn<-eval(call('function',pairlist(),expr[[3]][[2]]),e);plot<-shiny::isolate(fn())
  if(inherits(plot,'plotly')){built<-plotly::plotly_build(plot);labels<-built$x$layout$title$text;stopifnot(grepl('Please select comparison',labels));results[[id]][[policy]]<-list(status='INFORMATIVE_MISSING_INPUT',prerequisite=case[4],message=labels,sha256=digest::digest(built$x$layout,algo='sha256'));next}
  built<-ggplot2::ggplot_build(plot)
  labels<-unlist(lapply(built$data,function(layer)if('label'%in%names(layer))as.character(layer$label)else NULL));stopifnot(length(labels)>0L,any(grepl('Please|select|configure',labels,ignore.case=TRUE)))
  tmp<-tempfile(fileext='.png');grDevices::png(tmp,width=900,height=700);tryCatch(print(plot),finally=grDevices::dev.off());stopifnot(file.info(tmp)$size>0);unlink(tmp)
  results[[id]][[policy]]<-list(status='INFORMATIVE_MISSING_INPUT',prerequisite=case[4],message=labels,sha256=digest::digest(built$data,algo='sha256'))
 }
 stopifnot(identical(results[[id]]$classic,results[[id]]$team))
}
out<-Sys.getenv('MISSING_CASES_JSON');if(nzchar(out))jsonlite::write_json(results,out,pretty=TRUE,auto_unbox=TRUE)
cat(sprintf('PASS: %d shared output renderer bodies display matching informative missing-input plots (20 PNG bodies, one Plotly title) in both policies; no inferential result was generated\n',length(results)))
