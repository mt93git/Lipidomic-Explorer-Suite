# Team symbols the Nexo API binds to. Production Team (adapter architecture) has them;
# a tree without them (e.g. before the production port, PRs 8 and 9) cannot run the API.
api_required_functions <- c("read_session_archive", "team_metadata_sidecar_decode", "preparation_settings",
  "shared_data_server", "guide_allows_inference", "team_canvas_server", "team_missingness_data_adapter",
  "results_dashboard_server", "team_plot_instances_server", "team_plot_instance_source",
  "team_dashboard_input_defaults", "team_plot_instance_input_defaults", "team_plot_instance_input_ids",
  "team_plot_instance_layout")
api_required_objects <- c("team_plot_instance_families", "team_plot_instance_family_files", "team_plot_instance_shown_by")
api_missing_team_symbols <- function() c(
  api_required_functions[!vapply(api_required_functions, exists, logical(1), mode = "function")],
  api_required_objects[!vapply(api_required_objects, exists, logical(1))])
# Tests call this right after sourcing R/global.R: skip (exit 0) rather than fail on such a tree.
api_skip_unless_team_ready <- function(test) {
  missing <- api_missing_team_symbols()
  if (!length(missing)) return(invisible(TRUE))
  while (sink.number() > 0L) sink()
  cat(sprintf("SKIP %s: needs the production Team port (PRs 8 and 9); missing %s\n", test, paste(missing, collapse = ", ")))
  quit(save = "no", status = 0)
}
# zip < 3.0.0: zip_append() (nexo_store.R, cohort.R) duplicates a member, so read_session_archive rejects the checkpoint.
api_min_packages <- c(zip = "3.0.0")
# "zip 2.3.3 (needs >= 3.0.0)" for each package below its minimum; a missing package counts too.
api_old_packages <- function(min = api_min_packages) {
  old <- vapply(names(min), function(pkg) {
    have <- tryCatch(as.character(utils::packageVersion(pkg)), error = function(e) NA_character_)
    if (is.na(have)) return(sprintf("%s not installed (needs >= %s)", pkg, min[[pkg]]))
    if (package_version(have) < package_version(min[[pkg]])) sprintf("%s %s (needs >= %s)", pkg, have, min[[pkg]]) else NA_character_
  }, character(1), USE.NAMES = FALSE)
  old[!is.na(old)]
}
