library(shiny)
`%||%` <- function(x, y) if (is.null(x)) y else x
source('R/frontends/team/companion_workspace.R')

restoring <- reactiveVal(TRUE)
server <- function(input, output, session) {
  data <- data.frame(sample = 'synthetic')
  shared <- list(
    rawData = reactive(data),
    loaded_files = reactive(NULL),
    data_processed = reactive(data),
    preparation_state = reactive(list(data_available = TRUE, status = 'ready', dirty = FALSE, revision = 4L)),
    preparation_dirty = reactive(FALSE),
    is_restoring = restoring
  )
  team_companion_workspace_server(session, shared)
}

testServer(server, {
  messages <- list()
  session$sendCustomMessage <- function(type, message) {
    messages[[length(messages) + 1L]] <<- list(type = type, message = message)
  }
  session$flushReact()
  state <- tail(Filter(function(x) identical(x$type, 'team-preparation-state'), messages), 1L)[[1L]]$message
  stopifnot(identical(state$restoring, TRUE), identical(state$ready, FALSE),
            identical(state$revision, 4L))

  restoring(FALSE)
  session$flushReact()
  state <- tail(Filter(function(x) identical(x$type, 'team-preparation-state'), messages), 1L)[[1L]]$message
  stopifnot(identical(state$restoring, FALSE), identical(state$ready, TRUE),
            identical(state$revision, 4L))
})

cat('PASS: Team preparation readiness stays false during restore and becomes ready after restore clears\n')
