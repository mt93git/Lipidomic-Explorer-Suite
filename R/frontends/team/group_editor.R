# Team Review: "Edit groups" (samples x Group1/Group2). Presentation and routing only.
# The edited labels are written into the metadata table an analyst would upload (the
# confirmed table, its identifier column and its design mappings) and sent through the
# same steps as "Confirm sample metadata" in sample_metadata_import_module.R:
# preview_sample_metadata_match -> merge probe -> shared_data$set_external_sample_metadata.
# The resulting metadata, groups and colours are therefore those of re-uploading that
# table. Exclusions, Canvas and checkpoints live elsewhere and are not touched here.
team_group_editor_fields <- c("Group1", "Group2")

# The table the analyst would upload: the confirmed metadata rows (one per matrix sample,
# in matrix order) with the identifier restored under its original column name. Values are
# text exactly as read_sample_metadata_file returns them from a CSV; an absent cell is "".
team_group_editor_base_table <- function(external, ids) {
  snapshot <- if (is.list(external)) external$team_snapshot else NULL
  ids <- as.character(ids)
  if (is.list(snapshot) && is.data.frame(snapshot$data) &&
      identical(as.character(snapshot$data$FullName), ids) &&
      is.character(snapshot$id_column) && length(snapshot$id_column) == 1L && nzchar(snapshot$id_column)) {
    data <- as.data.frame(snapshot$data, stringsAsFactors = FALSE, check.names = FALSE)
    rest <- data[setdiff(names(data), "FullName")]
    if (snapshot$id_column %in% names(rest)) stop("The confirmed metadata table cannot be rebuilt: its identifier column is ambiguous.")
    table <- data.frame(ids, check.names = FALSE, stringsAsFactors = FALSE)
    names(table) <- snapshot$id_column
    for (name in names(rest)) {
      values <- rest[[name]]
      if (is.list(values)) stop("The confirmed metadata table cannot be rebuilt: it has nested values.")
      values <- as.character(values); values[is.na(values)] <- ""
      table[[name]] <- values
    }
    mappings <- snapshot$mappings
    mappings <- if (length(mappings)) stats::setNames(as.character(unlist(mappings)), names(mappings)) else character()
    return(list(table = table, id_column = snapshot$id_column, mappings = mappings))
  }
  # No confirmed metadata file (labels came from the sample names): a new two-column-plus table.
  table <- data.frame(SampleID = ids, check.names = FALSE, stringsAsFactors = FALSE)
  list(table = table, id_column = "SampleID", mappings = character())
}

# Write edited Group1/Group2 values into the table. A mapped field changes its mapped
# column; an unmapped field that changed gets its own column (named after the field) and a
# mapping, exactly as the analyst would add a column and choose it in "Add sample labels".
team_group_editor_edit_table <- function(base, current, edited) {
  table <- base$table; mappings <- base$mappings
  for (field in team_group_editor_fields) {
    if (is.null(edited[[field]])) next
    values <- as.character(edited[[field]])
    if (length(values) != nrow(table) || anyNA(values)) stop(sprintf("%s values do not match the samples.", field))
    if (field %in% names(mappings)) {
      table[[mappings[[field]]]] <- values
    } else if (!identical(values, as.character(current[[field]]))) {
      column <- make.unique(c(names(table), field), sep = "_")[ncol(table) + 1L]
      table[[column]] <- values
      mappings <- c(mappings, stats::setNames(column, field))
    }
  }
  # Keep the field order used by the import panel's selectors.
  order <- c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint")
  mappings <- mappings[order[order %in% names(mappings)]]
  list(table = table, id_column = base$id_column, mappings = mappings)
}

# Exactly the "Confirm sample metadata" steps (sample_metadata_import_module.R), without the
# file read: the table is what read_sample_metadata_file returns for the same CSV.
team_group_editor_snapshot <- function(edit, ids) {
  p <- preview_sample_metadata_match(edit$table, edit$id_column, ids)
  if (!p$valid) stop("Resolve duplicate, blank, and unmatched sample identifiers before confirming.")
  mappings <- edit$mappings
  if (anyDuplicated(unname(mappings))) stop("A metadata column can map to only one design field.")
  snapshot <- list(data = p$matched, mappings = mappings, id_column = edit$id_column)
  probe <- data.frame(FullName = snapshot$data$FullName, stringsAsFactors = FALSE)
  merge_confirmed_sample_metadata(probe, snapshot$data, mappings)
  snapshot
}

# Limits for the browser request (it is untrusted input): one short label per sample.
team_group_editor_max_label <- 200L
team_group_editor_max_samples <- 100000L
team_group_editor_max_bytes <- 4L * 1024L^2   # whole edited request, well under the 20 MB upload limit
team_group_editor_request_members <- c("token", "version", "samples", "values")

# The browser's token is Date.now(): one finite whole number in [0, 2^53]. Anything else (missing,
# a vector, text, huge) is refused before any change, so every applied edit is acknowledged.
team_group_editor_token <- function(request) {
  token <- if (is.list(request)) request$token else NULL
  if (!is.numeric(token) || length(token) != 1L || !is.finite(token) || token < 0 ||
      token > 2^53 || token != floor(token)) stop("Invalid group request token. Nothing was applied.")
  token
}

# A digest of everything the edited table is built from. The browser sends back the version it
# edited; the server refuses an apply against any other version (metadata replaced, another
# project or checkpoint opened), so stale edits can never roll back newer labels.
team_group_editor_version <- function(meta, external) {
  snapshot <- if (is.list(external)) external$team_snapshot else NULL
  fields <- intersect(c("FullName", team_group_editor_fields), names(meta))
  rlang::hash(list(as.list(meta[fields]), snapshot))
}

# Current labels for the browser table; `source` names the uploaded column behind each field.
team_group_editor_payload <- function(meta, external) {
  if (!is.data.frame(meta) || !"FullName" %in% names(meta) || !nrow(meta)) return(NULL)
  mappings <- if (is.list(external) && is.list(external$team_snapshot)) unlist(external$team_snapshot$mappings) else NULL
  columns <- lapply(team_group_editor_fields, function(field) {
    values <- if (field %in% names(meta)) as.character(meta[[field]]) else rep("", nrow(meta))
    values[is.na(values)] <- ""
    list(field = field, label = if (field == "Group1") "Group 1" else "Group 2",
         source = if (!is.null(mappings) && field %in% names(mappings)) unname(mappings[[field]]) else "",
         values = as.list(values))
  })
  list(version = team_group_editor_version(meta, external), samples = as.list(as.character(meta$FullName)),
       columns = columns, max_label = team_group_editor_max_label)
}

# Validate the untrusted request shape: known fields only, one string per sample, bounded sizes.
team_group_editor_request_values <- function(request, ids) {
  scalar_strings <- function(x, what) {
    if (!is.list(x) && !is.character(x)) stop(sprintf("Invalid %s.", what))
    if (length(x) > team_group_editor_max_samples) stop(sprintf("Too many %s.", what))
    ok <- vapply(x, function(v) is.character(v) && length(v) == 1L && !is.na(v), logical(1))
    if (!all(ok)) stop(sprintf("Invalid %s: each entry must be one text value.", what))
    out <- as.character(unlist(x, use.names = FALSE))
    chars <- nchar(out, type = "chars", allowNA = TRUE)
    if (anyNA(chars) || any(chars > team_group_editor_max_label))
      stop(sprintf("Group labels are limited to %d characters.", team_group_editor_max_label))
    out
  }
  if (!is.list(request) || is.null(names(request)) || !all(names(request) %in% team_group_editor_request_members))
    stop("Invalid group request.")
  token <- team_group_editor_token(request)
  if (!is.character(request$version) || length(request$version) != 1L || is.na(request$version) ||
      nchar(request$version, type = "bytes") > 128L) stop("Invalid group request version.")
  samples <- if (is.null(request$samples)) character() else as.character(unlist(request$samples, use.names = FALSE))
  if ((!is.list(request$samples) && !is.character(request$samples)) || !identical(samples, ids))
    stop("The samples changed. Reopen Edit groups and try again.")
  values <- request$values
  if (!is.list(values) || !length(values) || is.null(names(values)) || !all(names(values) %in% team_group_editor_fields) || anyDuplicated(names(values)))
    stop("No group changes to apply.")
  edited <- list()
  for (field in names(values)) {
    v <- scalar_strings(values[[field]], "group values")
    if (length(v) != length(ids)) stop(sprintf("%s values do not match the samples.", field))
    edited[[field]] <- v
  }
  # The complete request: values, samples, version and token.
  total <- sum(nchar(unlist(edited, use.names = FALSE), type = "bytes")) + sum(nchar(samples, type = "bytes")) +
    nchar(request$version, type = "bytes") + nchar(format(token, scientific = FALSE), type = "bytes")
  if (total > team_group_editor_max_bytes)
    stop("The edited table is too large to apply.")
  edited
}

# `step` is the guided workflow's step (guided_workflow.R); Review is step 3. Apply and its Review
# update are accepted only there, the same gate as the Review-entry request.
team_group_editor_server <- function(input, session, shared_data, step) {
  on_review <- function() identical(suppressWarnings(as.integer(shiny::isolate(step()))), 3L)
  value <- function(f) tryCatch(if (is.function(f)) f() else NULL, error = function(e) NULL)
  matrix_ids <- function() {
    raw <- value(shared_data$rawData)
    if (is.null(raw) || is.null(raw$data)) character() else setdiff(names(raw$data), "Lipid_Name")
  }
  shiny::observe({
    payload <- team_group_editor_payload(value(shared_data$all_metadata), value(shared_data$external_sample_metadata))
    if (!is.null(payload)) session$sendCustomMessage("team-groups-table", payload)
  })
  shiny::observeEvent(input$team_groups_apply, {
    request <- input$team_groups_apply
    token <- tryCatch(team_group_editor_token(request), error = function(e) NULL)
    reply <- function(ok, message, prepared = NA) session$sendCustomMessage("team-groups-applied",
      list(token = token, ok = ok, message = message, prepared = prepared))
    tryCatch({
      if (is.null(token)) stop("Invalid group request token. Nothing was applied.")
      if (!on_review()) stop("Open Review to apply group changes. Nothing was applied.")
      ids <- matrix_ids()
      meta <- shiny::isolate(value(shared_data$all_metadata))
      external <- shiny::isolate(value(shared_data$external_sample_metadata))
      if (!length(ids) || !is.data.frame(meta) || !identical(as.character(meta$FullName), ids))
        stop("The samples changed. Reopen Edit groups and try again.")
      if (!is.character(request$version) || length(request$version) != 1L ||
          !identical(request$version, team_group_editor_version(meta, external)))
        stop("The sample labels changed since this table was loaded (metadata replaced, or another project or checkpoint opened). Nothing was applied.")
      edited <- team_group_editor_request_values(request, ids)
      edit <- team_group_editor_edit_table(team_group_editor_base_table(external, ids), meta, edited)
      snapshot <- team_group_editor_snapshot(edit, ids)
      shared_data$set_external_sample_metadata(snapshot)
      # Update Review in the same server operation (no browser round trip), with the request Next
      # from "Add sample labels" makes. It runs after this flush so the new labels are current; it
      # can still be refused (e.g. other preparation settings pending), which Review then shows.
      session$onFlushed(function() shiny::isolate({
        prepared <- on_review() &&
          tryCatch(isTRUE(shared_data$request_team_review_preparation(kind = "entry")), error = function(e) FALSE)
        reply(TRUE, if (prepared) "Groups applied. Review is updating with the new groups."
                    else "Groups applied. Review could not update yet; see the message in Review.", prepared)
      }), once = TRUE)
    }, error = function(e) reply(FALSE, conditionMessage(e)))
  }, ignoreInit = TRUE)
  invisible(NULL)
}
