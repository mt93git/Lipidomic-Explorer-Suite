suppressPackageStartupMessages(library(shiny));suppressPackageStartupMessages(library(plotly))
`%||%` <- function(a,b)if(is.null(a))b else a
lipidomic_plotly_event <- function(...)NULL
source('R/sample_metadata_import.R');source('R/frontends/team/results_dashboard.R');source('R/frontends/team/plot_instances.R');source('R/frontends/team/canvas.R');source('R/frontends/team/canvas_state.R')
df <- data.frame(Lipid=c('PC(34:1)','PE(36:2)','TG(50:1)'),S1=c(10,50,100),S2=c(20,60,110),S3=c(30,70,120),S4=c(40,80,130),check.names=FALSE)
meta <- data.frame(FullName=names(df)[-1],Group1=c('A','A','B','B'),Group2='X')
value <- function(x){force(x);function(...)x}
hub <- list(data_processed=value(df),all_metadata=value(meta),preparation_audit=value(list(normalization='none',imputation='none')),preparation_dirty=value(FALSE),color_maps=value(list()))
addResourcePath('team',normalizePath('www/team'))
ui <- fluidPage(tags$head(tags$link(rel='stylesheet',href='team/css/canvas.css'),tags$link(rel='stylesheet',href='team/css/canvas_catalog.css'),tags$script(src='team/js/canvas_catalog.js'),tags$script(src='team/js/canvas.js')),team_canvas_ui(),results_dashboard_ui())
server <- function(input,output,session){
 prepared <- reactiveVal(if(Sys.getenv('TEAM_INSTANCE_DELAYED_DATA','0')=='1')NULL else df)
 session_hub <- hub;session_hub$data_processed <- prepared
 observeEvent(input$release_prepared_data,{prepared(df);session$onFlushed(function()session$sendCustomMessage('prepared-release-ack',TRUE),once=TRUE)},ignoreInit=TRUE)
 observeEvent(input$inspect_instance_options,{
  id <- input$inspect_instance_options
  session$sendCustomMessage('instance-output-options',list(selected=outputOptions(output,paste0(id,'-plot_violin')),sibling=outputOptions(output,paste0(id,'-plot_pca'))))
 },ignoreInit=TRUE)
 team_canvas_server(input,output,session,session_hub);results_dashboard_server(input,output,session,session_hub);team_plot_instances_server(input,output,session,session_hub,session_hub)
}
runApp(shinyApp(ui,server),host='127.0.0.1',port=43999,launch.browser=FALSE)
