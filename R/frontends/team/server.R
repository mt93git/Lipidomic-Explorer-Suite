# Team presentation hooks consume the one shared hub instantiated in R/server.R.
# Reference-cell comparisons always use the full applied matrix, even when the
# analyst has narrowed other plots to targeted lipids.
team_cell_data_adapter <- function(shared_data) {
  stopifnot(is.list(shared_data), is.function(shared_data$data_processed_unfiltered))
  cell_data <- shared_data
  cell_data$data_processed <- shared_data$data_processed_unfiltered
  cell_data
}
team_missingness_data_adapter <- function(shared_data) {
  stopifnot(is.list(shared_data), is.function(shared_data$data_processed_allow_missing))
  view_data <- shared_data
  view_data$data_processed <- shared_data$data_processed_allow_missing
  view_data
}
team_frontend_server <- function(input, output, session, shared_data) {
  ux_comparison_server(input, output, session)
  view_data <- team_missingness_data_adapter(shared_data)
  guide_workflow <- guided_workflow_server(input, output, session, view_data)
  results_dashboard_server(input, output, session, view_data)
  cell_show_server(input, output, session, team_cell_data_adapter(shared_data))
  companion_assistant_server(input, output, session, view_data, guide_workflow)
  invisible(guide_workflow)
}
