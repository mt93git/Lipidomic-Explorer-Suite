# UI-only source replay. No global.R evaluation, installs, app start, or analysis.
suppressPackageStartupMessages({library(shiny);library(bslib);library(colourpicker);library(shinyjqui);library(plotly);library(DT);library(sortable);library(visNetwork)})
extract_functions<-function(path){for(expr in parse(path))if(is.call(expr)&&as.character(expr[[1]])%in%c('<-','=')&&length(expr)==3L&&is.call(expr[[3]])&&identical(expr[[3]][[1]],as.name('function')))eval(expr,envir=.GlobalEnv)}
extract_functions('R/global.R');extract_functions('R/modules/utils_stats.R')
for(expr in parse('R/modules/13_pathway_module.R'))if(is.call(expr)&&identical(expr[[1]],as.name('<-'))&&identical(expr[[2]],as.name('DEFAULT_PATHWAY_CLASSES')))eval(expr)
files<-c('2_qc_boxplot','4_heatmap','5_barchart','6_volcano','7_lsea','8_structural','9_logratio','10_fla','11_longitudinal','12_structural_grid','13_pathway','14_cellular_org','99_export_studio')
for(f in files)extract_functions(paste0('R/modules/',f,'_module.R'))
extract_functions(Sys.getenv('TEAM_UI_SOURCE','R/frontends/team/modules-ui.R'));extract_functions('R/guided_workflow.R');extract_functions('R/guided_preparation_controls.R')
cases<-list(guided_quality='guide_quality_ui',qc_pca_tab='qc_boxplot_ui',barchart='barchart_ui',volcano_tab='volcano_ui',lsea_tab='lsea_ui',heatmap_barchart_tab='heatmap_ui',structural_tab='structural_ui',structural_proportions='structural_proportions_ui',structural_grid_tab='structural_grid_ui',logratio_tab='logratio_ui',fla_tab='fla_ui',longitudinal_tab='longitudinal_ui',pathway_tab='pathway_ui',cellular_org_tab='cellular_org_ui',export_studio='export_studio_ui')
out<-Sys.getenv('PRIVATE_PAYLOAD_DIR');stopifnot(nzchar(out));dir.create(out,recursive=TRUE,showWarnings=FALSE)
results<-list()
for(id in names(cases))tryCatch({nsid<-if(id=='structural_proportions')'structural_tab'else id;html<-as.character(if(id=='guided_quality')get(cases[[id]])()else get(cases[[id]])(nsid));writeLines(html,file.path(out,paste0('source-ui-',id,'.html')));results[[id]]<-list(status='PASS',bytes=nchar(html),function_name=cases[[id]])},error=function(e)results[[id]]<<-list(status='FAIL',error=conditionMessage(e)))
jsonlite::write_json(results,file.path(out,'source-ui-report.json'),auto_unbox=TRUE,pretty=TRUE)
print(results)
adapter<-Sys.getenv('TEAM_HEATMAP_ADAPTER');if(nzchar(adapter)){source(adapter);heatmap_server<-team_heatmap_canvas_boundaries_adapter(heatmap_server)}
# These UI callbacks depend only on display controls, not scientific data.
find_node<-function(x,p){if(p(x))return(x);if(is.recursive(x))for(i in seq_along(x)){a<-tryCatch(find_node(x[[i]],p),error=function(e)NULL);if(!is.null(a))return(a)};NULL}
dynamic<-list()
callbacks<-list(c('heatmap_barchart_tab','heatmap_server','unfiltered_heatmap_container'),c('heatmap_barchart_tab','heatmap_server','filtered_heatmap_container'),c('fla_tab','fla_server','volcanoPlotUI'),c('fla_tab','fla_server','circos_zoom_ui'))
if(nzchar(adapter))for(parent in c('unfiltered_heatmap_container','filtered_heatmap_container'))for(kind in c('_average','_sd'))callbacks[[length(callbacks)+1L]]<-c('heatmap_barchart_tab','heatmap_server',paste0(parent,kind))
for(case in callbacks){
 ns<-NS(case[1]);session<-list(ns=ns);input<-list(condenseRows=TRUE,condenseRowsSD=TRUE)
 ast<-find_node(body(get(case[2])),function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],substitute(output$NAME,list(NAME=as.name(case[3])))))
 stopifnot(!is.null(ast));fn<-eval(call('function',pairlist(),ast[[3]][[2]]));html<-as.character(fn());dynamic[[ns(case[3])]]<-html
}
jsonlite::write_json(dynamic,file.path(out,'dynamic-source-ui.json'),auto_unbox=TRUE,pretty=TRUE)
