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
# The acyl-chain selection matrix and its status badge sit in the same hidden Proportions view;
# both read available_prop_chains_info(), so rendering either while hidden ran the chain
# extraction (about 1 s) during Review open. They hold no selection state (the selection is a
# server-side reactiveVal; the matrix only reports clicks), the plot and its CSV read
# isTRUE(input$prop_renormalize_subset), which is FALSE both before the matrix exists and at
# its default, and a Canvas copy renders the matrix in its own namespace. They render when the
# Proportions view is shown, as the plot above does.
team_hidden_classic_outputs <- c("structural_tab-propPlotPlot", "structural_tab-diffAcylPlot", "structural_tab-diffAcylTable",
                                 "structural_tab-prop_chain_matrix_ui", "structural_tab-prop_matrix_status_badge")
team_suspend_hidden_classic_outputs <- function(output) {
  ids <- c(team_hidden_classic_outputs, team_hidden_metadata_previews)
  for (id in ids) shiny::outputOptions(output, id, suspendWhenHidden = TRUE)
  invisible(ids)
}
team_frontend_server <- function(input, output, session, shared_data) {
  team_plot_instance_arm_prewarm() # once per process: Canvas copy allow-lists (plot_instances.R)
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
  # SCIEX results exports (.txt) are converted to a wide .csv here before they reach the shared data module.
  team_sciex_server(input, session)
  # .txt/.tsv uploads are converted to .csv here before they reach the shared data module.
  team_upload_formats_server(input, session)
  # Excel workbooks: size cap and sheet choice before the shared data module sees them.
  team_sheet_picker_server(input, session)
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
  # Review "Edit groups": edited labels go through the metadata upload confirmation path.
  if (team_workspace_enabled() && !is.null(session)) team_group_editor_server(input, session, view_data, guide_workflow$step)
  team_pending_changes_bar_server(output, shared_data)
  invisible(guide_workflow)
}
