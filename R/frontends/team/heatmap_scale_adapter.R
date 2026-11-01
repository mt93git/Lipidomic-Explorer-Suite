# Team's shared hub exposes prepared LINEAR abundances. Keep the Classic module
# unchanged; adapt only its selected-feature violin and corresponding CSV path.
team_violin_log2_samples <- function(data, sample_cols) {
  for (column in sample_cols) {
    values <- as.numeric(data[[column]])
    valid <- is.finite(values) & values > 0
    transformed <- rep(NA_real_, length(values))
    transformed[valid] <- log2(values[valid])
    data[[column]] <- transformed
  }
  data
}

team_heatmap_scale_adapter <- function(original) {
  stopifnot(is.function(original))
  old_transform <- quote(if (isTRUE(input$violin_scale_mode == "linear")) {
    for (sc in sample_cols) {
      if (is.numeric(sub_df[[sc]])) {
        sub_df[[sc]] <- 2^(sub_df[[sc]])
      }
    }
  })
  replacements <- c(plot=0L,csv=0L)
  contains_csv_pivot <- function(node) {
    if (is.call(node) && "values_to" %in% names(node) &&
        identical(node[["values_to"]], "Log2_Abundance")) return(TRUE)
    if (is.recursive(node)) for (i in seq_along(node)) if(contains_csv_pivot(node[[i]])) return(TRUE)
    FALSE
  }
  rewrite <- function(node) {
    if (identical(node,old_transform)) {
      replacements[['plot']] <<- replacements[['plot']] + 1L
      return(quote(if (!isTRUE(input$violin_scale_mode == "linear")) {
        sub_df <- team_violin_log2_samples(sub_df,sample_cols)
      }))
    }
    if (is.call(node) && identical(node[[1]],as.name('<-')) &&
        identical(node[[2]],as.name('long_df')) && contains_csv_pivot(node[[3]])) {
      replacements[['csv']] <<- replacements[['csv']] + 1L
      return(substitute({ sub_df <- team_violin_log2_samples(sub_df,sample_cols); ORIGINAL },list(ORIGINAL=node)))
    }
    if (is.recursive(node)) for (i in seq_along(node)) if (!is.null(node[[i]])) node[[i]] <- rewrite(node[[i]])
    node
  }
  adapted <- original
  body(adapted) <- rewrite(body(original))
  if (!identical(unname(replacements),c(1L,1L))) {
    stop('Team violin scale adapter requires review: shared module structure changed')
  }
  bindings <- new.env(parent=environment(original))
  bindings$team_violin_log2_samples <- team_violin_log2_samples
  environment(adapted) <- bindings
  adapted
}
