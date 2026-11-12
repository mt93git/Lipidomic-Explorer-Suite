# Only key paths leave this comparator: no all.equal list formatter or values.
api_checkpoint_differences <- function(before, after, path = "") {
  if (identical(before, after)) return(character())
  # Values can themselves be named by samples or uploaded files. Stop at the
  # archived input ID or state key; never expose those nested value-derived names.
  if (grepl("^state[.]inputs[.]", path) ||
      grepl("^state[.](?!inputs$)[^.]+$", path, perl = TRUE) ||
      path %in% c("cohort", "cards", "analysis.metadata", "analysis.applied.filter") ||
      grepl("^analysis[.]applied[.]spec[.]settings[.]", path)) return(path)
  if (!is.list(before) || !is.list(after) ||
      !identical(unname(as.list(attributes(before)[setdiff(names(attributes(before)), "names")])),
        unname(as.list(attributes(after)[setdiff(names(attributes(after)), "names")])))) return(path)
  keys <- union(names(before), names(after))
  if (is.null(keys)) {
    if (length(before) != length(after)) return(path)
    keys <- seq_along(before)
  }
  differences <- character()
  for (key in keys) {
    child <- paste0(if (nzchar(path)) paste0(path, ".") else "", key)
    if (is.character(key) && (!key %in% names(before) || !key %in% names(after)))
      differences <- c(differences, child)
    else differences <- c(differences, api_checkpoint_differences(before[[key]], after[[key]], child))
  }
  unique(differences)
}

api_checkpoint_comparison <- function(before, after) {
  differences <- api_checkpoint_differences(before, after)
  list(equal = if (length(differences)) "no" else "yes",
    differences = paste(differences, collapse = ";"))
}
