# Fixture for test_team_canvas_shell_restore_browser.cjs: the lazy-restore fixture
# inside the Team shell. window.LIPIDOMIC_TEAM_WORKSPACE is set, shell.js mounts
# the canvas shell (data-ts-shell), canvas tabs mount, and autosave.js runs with an
# authenticated, writable, loaded context. A Review panel sits outside the Canvas.
# card_frame.js and card_figure.js frame each card as the Team UI does (ui.R).
suppressPackageStartupMessages(library(shiny));suppressPackageStartupMessages(library(plotly))
`%||%` <- function(a,b)if(is.null(a))b else a
lipidomic_plotly_event <- function(...)NULL
source('R/sample_metadata_import.R');source('R/frontends/team/results_dashboard.R');source('R/frontends/team/plot_instances.R');source('R/frontends/team/canvas.R');source('R/frontends/team/canvas_state.R')
df <- data.frame(Lipid=c('PC(34:1)','PE(36:2)','TG(50:1)'),S1=c(10,50,100),S2=c(20,60,110),S3=c(30,70,120),S4=c(40,80,130),check.names=FALSE)
meta <- data.frame(FullName=names(df)[-1],Group1=c('A','A','B','B'),Group2='X')
value <- function(x){force(x);function(...)x}
hub <- list(data_processed=value(df),all_metadata=value(meta),preparation_audit=value(list(normalization='none',imputation='none')),preparation_dirty=value(FALSE),color_maps=value(list()))
addResourcePath('team',normalizePath('www/team'))
css <- c('canvas','canvas_catalog','canvas_viewport','canvas_inspector','shell','autosave','card_frame','card_figure')
js <- c('canvas_catalog','canvas_viewport','canvas','canvas_inspector','canvas_checkpoint','autosave','shell','card_frame','card_figure')
ui <- fluidPage(
 tags$head(tags$script(HTML("window.LIPIDOMIC_TEAM_WORKSPACE=true;document.addEventListener('DOMContentLoaded',function(){document.body.dataset.teamAuthenticated='true';});")),
  lapply(css,function(f)tags$link(rel='stylesheet',href=paste0('team/css/',f,'.css'))),lapply(js,function(f)tags$script(src=paste0('team/js/',f,'.js')))),
 tags$main(id='team-workspace',
  tags$section(id='review-panel',tags$h2('Review'),tags$button(id='review-action',type='button','Look at a review result'),tags$div(id='team-autosave-status')),
  team_canvas_ui(),results_dashboard_ui()))
server <- function(input,output,session){
 team_canvas_server(input,output,session,hub);results_dashboard_server(input,output,session,hub)
 create <- team_plot_instances_server(input,output,session,hub,hub)
 session$onFlushed(function()session$sendCustomMessage('team-autosave-context',list(loaded=TRUE,writable=TRUE,restoring=FALSE)),once=TRUE)
 observeEvent(input$test_import_state,session$userData$team_canvas_import(team_canvas_validate(input$test_import_state)),ignoreInit=TRUE)
 # project_library.R's autosave path (eed4451: the team_library_autosave_request
 # observer and handle_canvas_ack, lines ~370-420) without accounts or storage. The
 # canvas save handshake runs for real: the server asks canvas_checkpoint.js for the
 # canvas (team-canvas-save-request), TeamCanvas.checkpoint() sends team_canvas_state,
 # canvas_state.R acknowledges or refuses it, and the reply's token must equal
 # team_canvas_acked_token() before the checkpoint is "written": the validated server
 # canvas (team_canvas_export(), what export_session_path stores) is kept in `persisted`.
 autosave_request <- NULL; autosave_sequence <- 0L; persisted <- list(); refused <- 0L
 observeEvent(input$team_library_autosave_request,{
  payload <- input$team_library_autosave_request
  if (!is.null(autosave_request)) {
   session$sendCustomMessage('team-autosave-result',list(revision=payload$revision,ok=FALSE,message='A save is already in progress; retry after it finishes.'))
   return()
  }
  autosave_sequence <<- autosave_sequence + 1L
  autosave_request <<- list(id=paste0('autosave-',autosave_sequence),revision=payload$revision)
  session$sendCustomMessage('team-canvas-save-request',list(requestId=autosave_request$id,kind='autosave'))
 },ignoreInit=TRUE)
 observeEvent(input$team_canvas_save_ready,{
  reply <- input$team_canvas_save_ready; request <- autosave_request
  if (is.null(request) || !is.list(reply) || !identical(reply$requestId,request$id)) return()
  autosave_request <<- NULL
  ack <- session$userData$team_canvas_acked_token
  ok <- isTRUE(reply$ok) && is.function(ack) && is.character(reply$token) && length(reply$token)==1L && nzchar(reply$token) && identical(reply$token,ack())
  if (ok) persisted[[length(persisted)+1L]] <<- list(token=reply$token,state=session$userData$team_canvas_export()) else refused <<- refused + 1L
  session$sendCustomMessage('team-canvas-save-result',list(requestId=request$id,ok=ok))
  session$sendCustomMessage('team-autosave-result',list(requestId=request$id,revision=request$revision,ok=ok,message=if (ok) 'Saved' else 'The latest canvas changes have not been confirmed. Please try again.'))
 },ignoreInit=TRUE)
 # What the last written checkpoint holds.
 observeEvent(input$test_report_persisted,{
  last <- if (length(persisted)) persisted[[length(persisted)]] else NULL
  nodes <- if (is.null(last) || is.null(last$state)) list() else lapply(last$state$nodes,function(n)list(id=n$id,label=n$label,x=n$x,y=n$y,width=n$width,height=n$height))
  session$sendCustomMessage('test-persisted',list(count=length(persisted),refused=refused,token=if (is.null(last)) NULL else last$token,nodes=nodes,
   order=if (is.null(last) || is.null(last$state$tabs)) NULL else last$state$tabs$figure$order))
 },ignoreInit=TRUE)
}
runApp(shinyApp(ui,server),host='127.0.0.1',port=as.integer(Sys.getenv('TEAM_LAZY_PORT','44022')),launch.browser=FALSE)
