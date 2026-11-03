options(shiny.autoreload=FALSE)
suppressPackageStartupMessages(library(shiny));suppressPackageStartupMessages(library(plotly))
`%||%` <- function(a,b)if(is.null(a))b else a
lipidomic_plotly_event <- function(...)NULL
source('R/sample_metadata_import.R');source('R/results_dashboard.R');source('R/frontends/team/violin_statistics.R');source('R/frontends/team/plot_instances.R');source('R/frontends/team/canvas.R');source('R/frontends/team/canvas_state.R')
df <- data.frame(Lipid=c('PC(34:1)','PE(36:2)'),S1=c(10,50),S2=c(12,55),S3=c(15,0),S4=c(11,60),S5=c(20,70),S6=c(25,75),S7=c(22,80),S8=c(30,66),check.names=FALSE)
meta <- data.frame(FullName=names(df)[-1],Group1=rep(c('A','B'),each=4),Group2='X',PatientNumber=paste0('P',1:8))
qa_path<-Sys.getenv('TEAM_STATISTICS_QA_RDS')
if(nzchar(qa_path)){qa<-readRDS(qa_path);df<-qa$matrix;meta<-qa$metadata}
value <- function(x){force(x);function(...)x}
addResourcePath('team',normalizePath('www/team'))
ui <- fluidPage(tags$head(tags$link(rel='stylesheet',href='team/css/dashboard.css'),tags$link(rel='stylesheet',href='team/css/canvas_viewport.css'),tags$link(rel='stylesheet',href='team/css/canvas.css'),tags$link(rel='stylesheet',href='team/css/canvas_catalog.css'),tags$link(rel='stylesheet',href='team/css/canvas_inspector.css'),
  tags$script(src='team/js/canvas_catalog.js'),tags$script(src='team/js/canvas_statistics.js'),tags$script(src='team/js/canvas.js'),tags$script(src='team/js/canvas_inspector.js'),tags$script(src='team/js/canvas_viewport.js')),if(nzchar(qa_path))tags$p(class='alert alert-info','QA · real prepared data · single-observation subset: 33 samples. Not the final clinical analysis.'),team_canvas_ui(),tags$div(style='display:none',results_dashboard_ui()))
server <- function(input,output,session){
 allowed <- reactiveVal(TRUE)
 observeEvent(input$test_design_allowed,allowed(isTRUE(input$test_design_allowed)),ignoreInit=TRUE)
 hub <- list(data_processed=value(df),all_metadata=value(meta),preparation_audit=value(if(nzchar(qa_path))list(normalization='Median normalization',imputation='QRILC') else list(normalization='PQN',imputation='No imputation')),preparation_dirty=value(FALSE),color_maps=value(if(nzchar(qa_path))qa$color_maps %||% list() else list()),
   inference_allowed=function(paired=FALSE)!isTRUE(paired)&&isTRUE(allowed()))
 team_canvas_server(input,output,session,hub);results_dashboard_server(input,output,session,hub);team_plot_instances_server(input,output,session,hub,hub)
}
runApp(shinyApp(ui,server),host='127.0.0.1',port=as.integer(Sys.getenv('TEAM_STATISTICS_QA_PORT','44011')),launch.browser=FALSE)
