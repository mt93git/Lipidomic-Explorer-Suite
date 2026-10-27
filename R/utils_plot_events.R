# Read a Plotly event only after the browser has actually emitted it.
# Hidden Shiny outputs have not registered their event sources at startup;
# event_data() schedules a warning even for an absent input in that state.
# Real events still use Plotly's parser and registration validation.
lipidomic_plotly_event <- function(event = "plotly_click", source = "A",
                                   session = shiny::getDefaultReactiveDomain()) {
  if (is.null(session)) stop("A Shiny session is required.")
  event_id <- paste(event, source, sep = "-")
  if (is.null(session$rootScope()$input[[event_id]])) return(NULL)
  plotly::event_data(event, source = source, session = session, priority = "event")
}
