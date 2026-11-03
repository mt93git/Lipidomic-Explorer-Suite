# Scientific/Canvas handlers are registered after authentication, while the
# browser can already have supplied its first presentation-state payload.
source("R/frontends/team/canvas_state.R")
messages <- list()
host <- function(input, output, session) {
  session$sendCustomMessage <- function(type, message)
    messages[[length(messages) + 1L]] <<- list(type = type, message = message)
  shiny::observeEvent(input$login, {
    team_canvas_server(input, output, session, list())
  }, once = TRUE)
}
state <- list(version = "1", libraryHidden = FALSE, nodes = list())
shiny::testServer(host, {
  session$flushReact()
  session$setInputs(team_canvas_state = list(token = "first-before-login", state = state))
  stopifnot(!is.function(session$userData$team_canvas_acked_token), !length(messages))
  session$setInputs(login = 1L)
  session$flushReact()
  stopifnot(identical(session$userData$team_canvas_acked_token(), "first-before-login"),
    length(messages) == 1L, identical(messages[[1]]$type, "team-canvas-state-ack"),
    isTRUE(messages[[1]]$message$ok))
  session$setInputs(team_canvas_state = list(token = "next-after-login", state = state))
  stopifnot(identical(session$userData$team_canvas_acked_token(), "next-after-login"),
    length(messages) == 2L, isTRUE(messages[[2]]$message$ok))
  session$setInputs(team_canvas_state = list(token = "rejected-envelope", state = state, unexpected = TRUE))
  stopifnot(is.null(session$userData$team_canvas_acked_token()),
    length(messages) == 3L, identical(messages[[3]]$message$ok, FALSE),
    identical(messages[[3]]$message$token, "rejected-envelope"),
    identical(team_canvas_json(session$userData$team_canvas_export()), team_canvas_json(team_canvas_validate(state))))
})
cat("PASS: authenticated Canvas startup acknowledges its first already-present state and subsequent updates\n")
