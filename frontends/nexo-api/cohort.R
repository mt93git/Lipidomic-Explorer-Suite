# Team's targeted lipid cohort ("Single Lipid Analysis Mode", R/modules/utils_targeted_lipids.R).
# Its modal lists the imported lipids and, on Apply, calls shared_data$set_targeted_lipids()
# and set_targeted_mode(); every module then isolates those lipids. The API does the same.
# Team keeps the cohort in memory only; Nexo also writes it to its own checkpoint member,
# which Team's archive reader ignores, and reapplies it when the checkpoint is reopened.
api_cohort_member <- "nexo-targeted-cohort-v1.json"

# The modal's list (master_lipids_data): rawData()$data, else data_processed_unfiltered();
# the Lipid_Name column or the first one; unique non-empty names; class as the modal parses it.
api_cohort_lipids <- function(s) api_read(s, {
  df <- tryCatch(s$shared$rawData()$data, error = function(e) NULL)
  if (is.null(df) || !nrow(df)) df <- tryCatch(s$shared$data_processed_unfiltered(), error = function(e) NULL)
  if (is.null(df) || !nrow(df)) character() else {
    col <- if ("Lipid_Name" %in% names(df)) "Lipid_Name" else names(df)[1L]
    x <- unique(as.character(df[[col]])); x[!is.na(x) & nzchar(x)]
  }
})

api_cohort_get <- function(s) {
  lipids <- api_cohort_lipids(s)
  summary <- fast_parse_lipids_summary(lipids)
  list(active = isTRUE(api_read(s, s$shared$targeted_mode_active())),
    lipids = as.character(api_read(s, s$shared$targeted_lipids_list())),
    available = unname(Map(function(l, c) list(lipid = l, class = c), summary$Lipid_Name, summary$Class)))
}

api_cohort_apply <- function(s, lipids) api_guard(s, api_with_loop(s, shiny::isolate({
  s$shared$set_targeted_lipids(lipids)
  s$shared$set_targeted_mode(length(lipids) > 0L)
})))

api_cohort_set <- function(s, lipids) {
  api_mutation(s, NULL, NULL, (function() {
  if (is.list(lipids)) {
    if (!all(vapply(lipids, function(x) is.character(x) && length(x) == 1L, logical(1))))
      api_abort("api_bad_request", "Expected a list of lipid names.")
    lipids <- unlist(lipids, use.names = FALSE)
  }
  if (is.null(lipids)) lipids <- character()
  if (!is.character(lipids) || anyNA(lipids)) api_abort("api_bad_request", "Expected a list of lipid names.")
  lipids <- unique(lipids[nzchar(lipids)])
  unknown <- setdiff(lipids, api_cohort_lipids(s))
  if (length(unknown)) api_abort("api_bad_request", paste0("Unknown lipid: ", paste(head(unknown, 5L), collapse = ", ")))
  api_session_dirty(s)
  api_cohort_apply(s, lipids)
  api_render_epoch_bump(s)
  api_flush(s)
  api_cohort_get(s)
  })())
}

api_cohort_append <- function(path, s) {
  lipids <- as.character(api_read(s, s$shared$targeted_lipids_list()))
  if (!length(lipids) || !isTRUE(api_read(s, s$shared$targeted_mode_active()))) return(invisible(FALSE))
  stage <- tempfile("nexo-cohort-"); dir.create(stage); on.exit(unlink(stage, recursive = TRUE))
  writeLines(as.character(jsonlite::toJSON(list(version = 1L, lipids = I(lipids)), auto_unbox = TRUE)),
    file.path(stage, api_cohort_member), useBytes = TRUE)
  zip::zip_append(path, files = api_cohort_member, root = stage)
  invisible(TRUE)
}

api_cohort_read <- function(zip) {
  entries <- tryCatch(zip::zip_list(zip), error = function(e) NULL)
  if (is.null(entries) || !api_cohort_member %in% entries$filename) return(character())
  size <- entries$uncompressed_size[match(api_cohort_member, entries$filename)]
  if (!is.finite(size) || size > 4 * 1024^2) return(character())
  con <- unz(zip, api_cohort_member); on.exit(close(con))
  value <- tryCatch(jsonlite::fromJSON(paste(readLines(con, warn = FALSE), collapse = "\n")), error = function(e) NULL)
  lipids <- value$lipids
  if (!is.character(lipids)) character() else unique(lipids[!is.na(lipids) & nzchar(lipids)])
}

# Reapply a saved cohort after a session opens; names no longer imported are dropped.
api_cohort_restore <- function(s, zip) {
  lipids <- intersect(api_cohort_read(zip), api_cohort_lipids(s))
  if (length(lipids)) { api_cohort_apply(s, lipids); api_render_epoch_bump(s); api_flush(s) }
  invisible(lipids)
}
