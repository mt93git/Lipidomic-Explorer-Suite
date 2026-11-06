# Fixture for test_team_canvas_lazy_restore_browser.cjs: the plot-instance fixture
# plus a server-side checkpoint import and a report of the created instances.
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
 # A dropped connection reconnects to a new server session (as on Shiny Server/Connect).
 session$allowReconnect('force')
 team_canvas_server(input,output,session,hub);results_dashboard_server(input,output,session,hub)
 create <- team_plot_instances_server(input,output,session,hub,hub)
 # The restore path of project_library.R: a validated checkpoint state is imported.
 observeEvent(input$test_import_state,session$userData$team_canvas_import(team_canvas_validate(input$test_import_state)),ignoreInit=TRUE)
 observeEvent(input$test_report_instances,{
  active <- environment(create)$active
  ids <- sort(ls(active))
  session$sendCustomMessage('test-instances',list(ids=as.list(ids),inputs=lapply(setNames(ids,ids),function(id)
    list(violin_lipid=input[[paste0(id,'-violin_lipid')]],color_by=input[[paste0(id,'-color_by')]]))))
 },ignoreInit=TRUE)
 # A server error for a copy, with the given request token (or none).
 observeEvent(input$test_instance_error,{e <- input$test_instance_error;session$sendCustomMessage('team-canvas-instance-error',c(list(id=e$id,message='Test analysis error.'),if(!is.null(e$request))list(request=e$request)))},ignoreInit=TRUE)
 # Registers n placeholder copies (parked) so the session is near its 160-instance limit.
 observeEvent(input$test_fill_instances,{active <- environment(create)$active;for(i in seq_len(input$test_fill_instances))assign(sprintf('tcinstance_fill%03d',i),list(source='results_dashboard-plot_violin',dashboard=NULL,result=NULL,parked=TRUE,rearm=NULL,request_token=NULL),active);session$sendCustomMessage('test-filled',list(count=length(ls(active))))},ignoreInit=TRUE)
 observeEvent(input$test_session,session$sendCustomMessage('test-session',list(token=session$token)),ignoreInit=TRUE)
 # What the server would persist now (an autosave, or the session ending).
 observeEvent(input$test_report_export,{
  state <- session$userData$team_canvas_export()
  session$sendCustomMessage('test-export',list(nodes=if(is.null(state))list() else lapply(state$nodes,function(n)list(id=n$id,label=n$label,x=n$x,y=n$y,width=n$width,height=n$height,instance=n$instance))))
 },ignoreInit=TRUE)
}
runApp(shinyApp(ui,server),host='127.0.0.1',port=as.integer(Sys.getenv('TEAM_LAZY_PORT','44021')),launch.browser=FALSE)
