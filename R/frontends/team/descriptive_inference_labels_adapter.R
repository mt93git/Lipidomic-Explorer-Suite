# Team exports must distinguish an unavailable test from a nonsignificant result.
# Limit this transformation to the two violin CSV writers; plot filtering and
# the shared analysis data remain unchanged.
team_violin_export_labels <- function(df, session, shared_data) {
  missing_test <- is.na(df$P_Value) & !is.na(df$Is_Baseline) & !df$Is_Baseline
  df$Significance[missing_test] <- "Not tested"
  df
}

team_violin_export_labels_adapter <- function(original) {
  stopifnot(is.function(original))
  count <- 0L
  rewrite <- function(node) {
    if (is.call(node) && identical(node[[1]], as.name('write_spreadsheet_csv')) &&
        length(node) >= 3L && identical(node[[2]], as.name('export_df')) &&
        identical(node[[3]], as.name('file'))) {
      node[[2]] <- quote(team_violin_export_labels(export_df, session, shared_data))
      count <<- count + 1L
      return(node)
    }
    if (is.recursive(node)) for (i in seq_along(node))
      if (!is.null(node[[i]])) node[[i]] <- rewrite(node[[i]])
    node
  }
  adapted <- original
  body(adapted) <- rewrite(body(original))
  if (count != 2L) stop('Team violin export labels require review: expected two CSV writers')
  adapted
}
