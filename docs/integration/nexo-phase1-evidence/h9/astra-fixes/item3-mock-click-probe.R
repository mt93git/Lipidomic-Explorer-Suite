suppressPackageStartupMessages(library(shiny))
source("R/utils_plot_events.R")
mock <- MockShinySession$new()
hits <- list()
withReactiveDomain(mock, {
  moduleServer("tcinstance_x", function(input, output, session) {
    observeEvent(lipidomic_plotly_event('plotly_click', source = session$ns('cell_class_profile'), session = session), {
      hit <- lipidomic_plotly_event('plotly_click', source = session$ns('cell_class_profile'), session = session)
      hits[[length(hits) + 1L]] <<- hit
    }, ignoreInit = TRUE)
  })
})
mock$flushReact()
key <- "plotly_click-tcinstance_x-cell_class_profile"
value <- as.character(jsonlite::toJSON(list(list(curveNumber = 0L, pointNumber = 2L, x = 1.5, y = "PC")), auto_unbox = TRUE, null = "null", digits = NA))
cat("input value:", value, "\n")
do.call(mock$setInputs, setNames(list(value), key)); mock$flushReact()
cat("after click 1: hits =", length(hits), " y =", hits[[1]]$y, " class(hit) =", class(hits[[1]]), "\n")
do.call(mock$setInputs, setNames(list(value), key)); mock$flushReact()
cat("same value again without reset: hits =", length(hits), "\n")
do.call(mock$setInputs, setNames(list(NULL), key)); do.call(mock$setInputs, setNames(list(value), key)); mock$flushReact()
cat("same value after NULL reset: hits =", length(hits), "\n")
