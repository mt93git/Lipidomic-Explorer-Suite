# Hidden views must not warn at startup; real clicks must still be parsed.
library(shiny)
source('R/utils_plot_events.R')
seen <- character()
withCallingHandlers(shiny::testServer(function(input, output, session) {
  clicks <- reactiveVal(NULL)
  observeEvent(lipidomic_plotly_event(source='lazy-plot', session=session), {
    clicks(lipidomic_plotly_event(source='lazy-plot', session=session))
  }, ignoreInit=TRUE)
  session$userData$plotlyShinyEventIDs <- character()
}, {
  session$flushReact()
  stopifnot(is.null(clicks()))
  # The plot has now rendered and registered, and the browser sends a click.
  session$userData$plotlyShinyEventIDs <- 'plotly_click-lazy-plot'
  session$setInputs(`plotly_click-lazy-plot`='[{"customdata":"S01","x":1,"y":2}]')
  session$flushReact()
  stopifnot(identical(clicks()$customdata, 'S01'))
  session$setInputs(`plotly_click-lazy-plot`='[{"customdata":"S02","x":3,"y":4}]')
  session$flushReact()
  stopifnot(identical(clicks()$customdata, 'S02'))
}), warning=function(w) { seen <<- c(seen, conditionMessage(w)); invokeRestart('muffleWarning') })
stopifnot(length(seen)==0L)
# Wiring guard: lazy observers use the helper, real charts retain registration.
for (file in c('R/results_dashboard.R','R/cell_show.R','R/modules/2_qc_boxplot_module.R')) {
  text <- paste(readLines(file),collapse='\n')
  stopifnot(grepl('lipidomic_plotly_event(',text,fixed=TRUE),
    !grepl('plotly::event_data("plotly_click"',text,fixed=TRUE),
    grepl('plotly::event_register("plotly_click")',text,fixed=TRUE))
}
cat('PASS: lazy Plotly views start without warnings and successive real events remain reactive\n')
