# W3B: a checkpoint restore loads its files first and the canvas last. Tell the
# browser, just before each autosave context message (same flush, same order),
# whether a restore is running, so it does not autosave a half-restored
# workspace and mistake the restored files for a new dataset (autosave.js).
# Kept in its own file so project_library.R carries a single call line.
team_autosave_restore_gate <- function(session, shared_data) {
  # Not isolated: the context observer that calls this must re-run when a restore ends
  # (including a restore that stops with an error), so the browser hears restoring=FALSE.
  restoring <- tryCatch(isTRUE(shared_data$is_restoring()), error = function(e) FALSE)
  session$sendCustomMessage("team-autosave-restoring", list(restoring = restoring))
  invisible(restoring)
}
