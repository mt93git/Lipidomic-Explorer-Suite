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
  view_data$team_compact_distribution <- TRUE
  view_data
}
# In Team, a Classic tool's outputs sit in a hidden tab until the analyst opens that tool (or moves
# one of its plots onto the canvas), and Shiny resumes a suspended output as soon as it is shown.
# The Structural module keeps these three rendering while hidden for its Classic tab; in Team
# that re-rendered them, and sent the image to the hidden tab, on every window resize or
# pixel-ratio change. Their selector UIs keep rendering while hidden: a plot moved to the canvas
# still needs those inputs. Canvas copies have their own namespaces and are not affected.
team_hidden_classic_outputs <- c("structural_tab-propPlotPlot", "structural_tab-diffAcylPlot", "structural_tab-diffAcylTable")
team_suspend_hidden_classic_outputs <- function(output) {
  for (id in team_hidden_classic_outputs) shiny::outputOptions(output, id, suspendWhenHidden = TRUE)
  invisible(team_hidden_classic_outputs)
}
team_frontend_server <- function(input, output, session, shared_data) {
  # Production called these from R/server.R just before this function; same order.
  if (team_workspace_enabled()) session$userData$team_shared_data <- shared_data
  if (team_workspace_enabled()) team_canvas_server(input, output, session, shared_data)
  if (team_library_enabled() && !team_workspace_enabled()) team_library_server(input, output, session, shared_data)
  # A receipt belongs to this upload, never an unrelated background flush.
  for (upload_id in c("data_hub-files", "data_hub-import_session_file", "sample_metadata_import-file")) local({
    id <- upload_id
    observeEvent(input[[id]], {
      token <- isolate(input[[paste0("team_foreground_",id)]])
      if (is.character(token) && length(token)==1L && grepl("^foreground-[0-9]+$",token))
        session$onFlushed(function() session$sendCustomMessage("team-foreground-result",list(id=token,ok=TRUE)),once=TRUE)
    },ignoreInit=TRUE,priority=-1000)
  })
  view_data <- team_missingness_data_adapter(shared_data)
  if (team_workspace_enabled()) view_data <- team_review_foreground_adapter(input, session, view_data)
  guide_workflow <- if(team_workspace_enabled()) team_project_guided_server(input, output, session, view_data) else guided_workflow_server(input, output, session, view_data)
  dashboard <- results_dashboard_server(input, output, session, view_data)
  if (team_workspace_enabled()) team_plot_instances_server(input, output, session, shared_data, view_data)
  team_scientific_insight_server(input, output, session, view_data, dashboard)
  cell_show_server(input, output, session, team_cell_data_adapter(shared_data))
  assistant <- if(team_workspace_enabled()) team_project_companion_server(input, output, session, view_data, guide_workflow) else companion_assistant_server(input, output, session, view_data, guide_workflow)
  if(team_workspace_enabled()) team_project_records_server(input,output,session,view_data,guide_workflow,assistant)
  if (team_workspace_enabled()) team_companion_workspace_server(session, view_data)
  # Group colours for the PCA: workspace Review (review_shell.js) and guided Quality (qw_pca_groups.js).
  if (!is.null(session)) team_review_shell_server(session, view_data)
  team_pending_changes_bar_server(output, shared_data)
  invisible(guide_workflow)
}
