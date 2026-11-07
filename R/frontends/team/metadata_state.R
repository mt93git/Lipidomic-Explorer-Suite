# A Team snapshot may explicitly map only some design fields. Its remaining
# canonical fields came from the confirmed sample-label review, not defaults.
# Preserve those saved facts while recomputing every explicit mapping normally.
team_metadata_sidecar_decode <- function(metadata) {
  value <- metadata_sidecar_decode(metadata)
  if (is.null(value)) return(NULL)
  saved <- metadata$scientific_metadata
  ids <- value$scientific_metadata$FullName
  if (!is.data.frame(saved) || !is.character(saved$FullName) ||
      !identical(saved$FullName, ids) || anyDuplicated(saved$FullName))
    stop("Saved Team scientific metadata identifiers are invalid.")
  fields <- c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint")
  if (!all(fields %in% names(saved))) stop("Saved Team scientific metadata is incomplete.")
  for (field in fields) {
    values <- saved[[field]]
    # Empty legacy labels represent absence and must remain empty, rather than
    # being converted into a newly invented category during restoration.
    if (!is.character(values) || length(values) != length(ids) || anyNA(values))
      stop(sprintf("Saved Team design field %s is invalid.", field))
    if (!field %in% names(value$mappings)) value$scientific_metadata[[field]] <- values
  }
  value$scientific_metadata$TimePoint_Group1 <- value$scientific_metadata$Group1
  value$scientific_metadata$Cluster <- match(value$scientific_metadata$Group1,
    unique(value$scientific_metadata$Group1))
  value
}

team_metadata_validate_ids <- function(metadata, matrix_ids) {
  if (is.null(metadata)) return(invisible(NULL))
  saved <- metadata$scientific_metadata
  if (!is.data.frame(saved) || !is.character(saved$FullName) ||
      !is.character(matrix_ids) || !identical(saved$FullName, matrix_ids) ||
      anyNA(matrix_ids) || anyDuplicated(matrix_ids))
    stop("Saved Team scientific metadata does not match the active abundance matrix.")
  invisible(TRUE)
}
