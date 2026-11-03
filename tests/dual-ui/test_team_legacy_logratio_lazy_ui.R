library(shiny)
`%||%` <- function(x,y) if (is.null(x)) y else x

expressions <- parse('R/modules/9_logratio_module.R')
find_team_output <- function(x) {
  if (is.call(x) && identical(x[[1]], as.name('<-')) &&
      identical(paste(deparse(x[[2]]), collapse=''), 'output$scrollable_plot_ui')) return(x)
  if (is.recursive(x)) for (i in seq_along(x)) { found <- tryCatch(find_team_output(x[[i]]), error=function(e) NULL); if (!is.null(found)) return(found) }
  NULL
}
assignment <- find_team_output(expressions)
stopifnot(!is.null(assignment))
server <- function(input, output, session) {
  unifiedSelectedFeatures <- shiny::reactive({ shiny::req(input$featureLevel); input$selectedFeatures_flat })
  eval(assignment)
}
shiny::testServer(server, {
  session$flushReact()
  stopifnot(grepl('logratioPlot', output$scrollable_plot_ui$html, fixed=TRUE))
  session$setInputs(featureLevel='class', selectedFeatures_flat=c('A','B'), selectedBaseline='Control', panelColumns=2, panelHeight=520)
  stopifnot(grepl('520', output$scrollable_plot_ui$html, fixed=TRUE))
})
cat('PASS actual Team renderUI mounts plot boundary before lazy input and preserves normal sizing after input\n')
