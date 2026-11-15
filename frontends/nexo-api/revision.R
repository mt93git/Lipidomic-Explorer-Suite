# Save at a revision boundary; storage.R also works without the session engine.
api_checkpoint_save_revision <- function(s, req, res, label, canvas, nexo = s$nexo,
                                         caller = NULL, collab = FALSE, handle = NULL) {
  api_mutation(s, req, res, {
    previous <- s$sha256
    answer <- api_checkpoint_save(s, label, canvas, nexo, caller, collab = collab)
    if (!identical(previous, s$sha256)) {
      api_session_dirty(s)
      s$dirty <- FALSE
    }
    answer
  }, body_revision = FALSE, handle = handle)
}
