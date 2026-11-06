# Guided Team flow: one persistent "Changes pending" bar replaces the toasts fired by a
# scheduled sample exclusion or restore (www/team/js/pending_changes_bar.js never shows them). It only reads the shared preparation state; its
# buttons forward to the existing controls (data_hub-runAnalysis and the Quality Undo
# buttons) from www/team/js/pending_changes_bar.js. The Team workspace applies review
# decisions immediately and keeps its own status, so the bar is not used there.
team_pending_changes_bar_ui <- function() {
  if (team_workspace_enabled()) return(NULL)
  div(id = "tw-pending-bar", role = "status", `aria-live` = "polite",
    uiOutput("team_pending_changes_bar"))
}

team_pending_changes_ids <- function(ids) {
  if (length(ids) <= 3L) return(paste(ids, collapse = ", "))
  paste0(paste(ids[1:3], collapse = ", "), " and ", length(ids) - 3L, " more")
}

# Readable names for the settings the bar can say are pending (keys of preparation_settings()).
team_pending_setting_labels <- c(minDetectionPct = "detection threshold", dropNonDetected = "non-detected lipid removal",
  detectionScope = "detection scope", useImputation = "imputation", normalizationMethod = "normalization",
  imputeZerosPerFile = "per-file zero imputation", imputeRemainingNAtoZero = "remaining missing values",
  imputationSeed = "imputation seed", selected = "sample selection", use_average = "replicate averaging",
  metadata_id = "metadata")

# Applied versus pending preparation: which samples change and whether other settings do.
# Shown whenever the pending request differs from the applied run on the same matrix, also
# after a failed update (status "error"), so the failure reason stays beside the change.
team_pending_changes_summary <- function(state) {
  if (!is.list(state) || !isTRUE(state$dirty) || is.null(state$applied) || is.null(state$pending)) return(NULL)
  old <- state$applied$spec; new <- state$pending
  # A different matrix is a new preparation, not a pending change to the applied one.
  if (!identical(old$data_id, new$data_id)) return(NULL)
  # "keep" is the same as no decision; any other treatment than remove counts as a setting.
  treated <- function(tx, kind) {
    tx <- if (is.list(tx)) tx else list()
    # A malformed treatment (NULL, NA, not a single string) counts as neither.
    hit <- vapply(tx, function(x) is.character(x) && length(x) == 1L && !is.na(x) &&
      if (identical(kind, "remove")) identical(x, "remove") else !x %in% c("keep", "remove"), logical(1))
    ids <- as.character(names(tx))[hit]
    if (identical(kind, "remove")) ids else unlist(tx[hit])[order(ids)]
  }
  old_tx <- old$settings$outlierTreatments; new_tx <- new$settings$outlierTreatments
  excluded <- setdiff(treated(new_tx, "remove"), treated(old_tx, "remove"))
  restored <- setdiff(treated(old_tx, "remove"), treated(new_tx, "remove"))
  keys <- setdiff(union(names(old$settings), names(new$settings)), "outlierTreatments")
  changed <- c(keys[!vapply(keys, function(k) identical(old$settings[[k]], new$settings[[k]]), logical(1))],
    Filter(function(k) !identical(old[[k]], new[[k]]), c("selected", "use_average", "metadata_id")))
  labels <- unname(ifelse(changed %in% names(team_pending_setting_labels), team_pending_setting_labels[changed], "other preparation settings"))
  if (!identical(treated(old_tx, "other"), treated(new_tx, "other"))) labels <- c(labels, "averaged samples")
  labels <- unique(labels)
  parts <- c(if (length(excluded)) paste(team_pending_changes_ids(excluded), "excluded"),
    if (length(restored)) paste(team_pending_changes_ids(restored), "restored"),
    if (length(labels)) paste(paste(labels, collapse = ", "), "changed"),
    if (!length(excluded) && !length(restored) && !length(labels)) "preparation settings changed")
  # state$error holds the failed Update (status "error") or the unbuildable request ("invalid").
  failure <- if (isTRUE(state$status %in% c("error", "invalid")) && is.character(state$error) && length(state$error) == 1L && nzchar(state$error))
    paste0(" The last update did not apply: ", state$error)
  list(excluded = excluded, restored = restored, failed = !is.null(failure),
    text = paste0(paste(parts, collapse = "; "), " — results shown are from the previous run.", failure))
}

team_pending_changes_bar_server <- function(output, shared_data) {
  if (team_workspace_enabled() || !is.function(shared_data$preparation_state)) return(invisible(NULL))
  output$team_pending_changes_bar <- renderUI({
    s <- team_pending_changes_summary(tryCatch(shared_data$preparation_state(), error = function(e) NULL))
    if (is.null(s)) return(NULL)
    single <- length(s$excluded) == 1L
    # Undo forwards to the Quality Undo, which only reverts a "remove"; no existing control
    # reverts a pending restoration or settings change, so those get Update alone.
    div(class = "tw-pending-bar", `data-tw-pending` = "true", `data-tw-pending-failed` = if (isTRUE(s$failed)) "true",
      p(class = "tw-pending-text", strong("Changes pending: "), s$text),
      div(class = "tw-pending-actions",
        tags$button(type = "button", class = "btn btn-sm tw-pending-update",
          `data-tw-pending-update` = "data_hub-runAnalysis", "Update prepared data"),
        lapply(s$excluded, function(id) tags$button(type = "button", class = "btn btn-sm tw-pending-undo",
          `data-tw-pending-undo` = id, `aria-label` = if (single) paste("Undo exclusion of", id),
          if (single) "Undo" else paste("Undo", id)))))
  })
  outputOptions(output, "team_pending_changes_bar", suspendWhenHidden = FALSE)
  invisible(NULL)
}
