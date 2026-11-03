# Team implementation of the "persistent_inputs" hook (production
# R/modules/1_shared_data_module.R: session_persistent_inputs).
# The Team figure library and canvas controls are saved in their own
# team-canvas-v1.json checkpoint, so their transient inputs are dropped from
# saved and restored session inputs.
team_canvas_persistent_filter <- function(filtered, ...) {
  if (!is.list(filtered)) return(filtered)
  filtered[!grepl("^team_library_|(^|-)team_canvas_", names(filtered))]
}
lipidomic_hook_register("persistent_inputs", team_canvas_persistent_filter)
