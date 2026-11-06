suppressPackageStartupMessages(library(shiny))
source('R/frontends/team/canvas_state.R')
server <- function(input,output,session) {
 output[['logratio_tab-scrollable_plot_ui']] <- renderUI(plotOutput('logratio_tab-logratioPlot'))
 team_canvas_server(input,output,session,list())
}
legacy <- list(version='1',libraryHidden=FALSE,nodes=list(list(id='logratio_tab-logratioPlot',label='Violin Plots · Logratio',x=30,y=40,width=620,height=720,visual=list())))
empty <- list(version='1',libraryHidden=FALSE,nodes=list())
testServer(server, {
 session$flushReact()
 ids <- paste0('logratio_tab-',c('scrollable_plot_ui','logratioPlot','featureLevelUI','featurePickerUI'))
 opts <- setNames(rep(list(list(suspendWhenHidden=TRUE)),length(ids)),ids)
 session$outputOptions <- function(name,...) { stopifnot(name %in% ids); values<-list(...);if(length(values))opts[[name]] <<- modifyList(opts[[name]],values);opts[[name]] }
 stopifnot(isTRUE(outputOptions(output,'logratio_tab-scrollable_plot_ui')$suspendWhenHidden))
 session$userData$team_canvas_import(legacy);session$flushReact()
 stopifnot(all(vapply(ids,function(id) identical(outputOptions(output,id)$suspendWhenHidden,FALSE),logical(1))))
 stopifnot(grepl('logratio_tab-logratioPlot',paste(unlist(output[['logratio_tab-scrollable_plot_ui']]),collapse=''),fixed=TRUE))
 # The guard is not released merely because the parent was forced to mount.
 session$setInputs(team_canvas_state=list(token='before',state=empty));session$flushReact()
 stopifnot(is.null(session$userData$team_canvas_acked_token()))
 session$setInputs(team_canvas_restore_complete=list(ok=TRUE,token='restore-1'));session$flushReact()
 session$setInputs(team_canvas_state=list(token='after',state=empty));session$flushReact()
 stopifnot(identical(session$userData$team_canvas_acked_token(),'after'))
 stopifnot(all(vapply(ids,function(id) isTRUE(outputOptions(output,id)$suspendWhenHidden),logical(1))))
})
cat('PASS hidden legacy logratio parent is mounted on restore; acknowledgement guard retained; original suspension restored after card removal\n')
