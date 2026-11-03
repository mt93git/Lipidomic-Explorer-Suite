# Review-only receipts: success means the requested preparation calculation was
# accepted and a subsequent Shiny flush completed, not that every plot rendered.
team_review_foreground_adapter <- function(input, session, shared_data) {
  stopifnot(is.list(shared_data), is.function(shared_data$request_team_review_preparation),
            is.function(shared_data$run_analysis_trigger), is.function(shared_data$preparation_state))
  original <- shared_data$request_team_review_preparation
  pending <- shiny::reactiveVal(list())
  key_for <- function(request) {
    if (!is.list(request) || !identical(request$source,'human') ||
        !isTRUE(request$kind %in% c('entry','detection')) ||
        !is.numeric(request$token) || length(request$token)!=1L ||
        !is.finite(request$token) || request$token<0 || request$token!=floor(request$token)) return(NULL)
    paste0(request$kind,':',format(request$token,scientific=FALSE,trim=TRUE))
  }
  receipt <- function(key, status) {
    current <- shiny::isolate(pending()); if (is.null(current[[key]])) return(invisible(NULL))
    current[[key]] <- NULL; pending(current)
    session$sendCustomMessage('team-review-foreground-result',list(key=key,status=status))
  }
  shiny::observeEvent(input$team_review_prepare, {
    request <- input$team_review_prepare; key <- key_for(request); if(is.null(key)) return()
    current <- shiny::isolate(pending()); current[[key]] <- list(start=Sys.time(),phase='received');pending(current)
    session$sendCustomMessage('team-review-foreground-start',list(key=key))
  },ignoreInit=TRUE,priority=1000)
  shiny::observe({
    current <- pending(); if (!length(current)) return()
    shiny::invalidateLater(500,session)
    for (key in names(current)) {
      item <- current[[key]]; elapsed <- as.numeric(difftime(Sys.time(),item$start,units='secs'))
      if (identical(item$phase,'received') && elapsed>2) {receipt(key,'rejected');next}
      if (elapsed>120) {receipt(key,'timeout');next}
      if (!identical(item$phase,'running')) next
      state <- tryCatch(shared_data$preparation_state(),error=function(e)NULL)
      if (!is.list(state)) next
      applied <- state$applied
      if (identical(state$status,'error') || identical(state$status,'invalid')) {receipt(key,'failed');next}
      if (identical(state$status,'ready') && !is.null(applied) && identical(applied$request_id,item$request_id) &&
          is.numeric(state$revision) && state$revision>item$revision) {
        current2 <- shiny::isolate(pending()); if(is.null(current2[[key]]) || identical(current2[[key]]$phase,'flushing')) next
        current2[[key]]$phase <- 'flushing';pending(current2)
        local({receipt_key <- key; session$onFlushed(function() receipt(receipt_key,'complete'),once=TRUE)})
      }
    }
  })
  shared_data$request_team_review_preparation <- function(kind='entry', expected_threshold=NULL, expected_id=NULL) {
    request <- shiny::isolate(input$team_review_prepare); key <- key_for(request)
    track <- !is.null(key) && identical(request$kind,kind) && !is.null(shiny::isolate(pending())[[key]])
    before <- shiny::isolate(shared_data$run_analysis_trigger())
    before_state <- shiny::isolate(shared_data$preparation_state())
    result <- tryCatch(original(kind=kind,expected_threshold=expected_threshold,expected_id=expected_id), error=function(e) { if (track) receipt(key,'failed'); stop(e) })
    if (track) {
      after <- shiny::isolate(shared_data$run_analysis_trigger())
      if (!isTRUE(result)) receipt(key,'rejected')
      else if (identical(before,after)) receipt(key,'noop')
      else {
        current <- shiny::isolate(pending());current[[key]]$phase <- 'running'
        current[[key]]$revision <- before_state$revision
        current[[key]]$request_id <- before_state$pending_id
        pending(current)
      }
    }
    result
  }
  shared_data
}
