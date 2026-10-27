# Execute the production SD title expressions with the browser-reported cutoffs.
exprs <- parse('R/modules/4_heatmap_module.R')
find_named_assignment <- function(node, target) {
  if (is.call(node) && identical(node[[1]], as.name('<-')) &&
      is.symbol(node[[2]]) && identical(as.character(node[[2]]), target)) return(node)
  if (is.recursive(node)) {
    for (i in seq_along(node)) {
      child <- tryCatch(node[[i]], error = function(e) NULL)
      if (is.null(child)) next
      found <- tryCatch(find_named_assignment(child, target), error = function(e) NULL)
      if (!is.null(found)) return(found)
    }
  }
  NULL
}
reactive_definition <- find_named_assignment(exprs, 'filteredHeatmapSDObj')
stopifnot(!is.null(reactive_definition),
          identical(reactive_definition[[3]][[1]], as.name('reactive')))
statements <- as.list(reactive_definition[[3]][[2]])[-1]
assignment_name <- function(expr) {
  if (is.call(expr) && identical(expr[[1]], as.name('<-')) && is.symbol(expr[[2]]))
    as.character(expr[[2]]) else NA_character_
}
names <- vapply(statements, assignment_name, character(1))
needed <- c('curr_settings', 'curr_l2fc', 'curr_pval', 'condense_lbl', 'title_text')
stopifnot(all(needed %in% names))
render_title <- function(settings) {
  env <- new.env(parent = globalenv())
  env$shared_data <- list(de_settings = function() settings)
  env$input <- list(staircaseGroup = 'subclass')
  env$mat_display <- matrix(1, nrow = 9, ncol = 3)
  env$`%||%` <- function(a, b) if (is.null(a)) b else a
  for (name in needed) eval(statements[[which(names == name)[1]]], envir = env)
  env$title_text
}
actual <- render_title(list(log2fc_threshold = 0, p_threshold = 1))
stopifnot(grepl('Filtered Heatmap - Class Standard Deviation', actual, fixed = TRUE),
          grepl('9 Classes', actual, fixed = TRUE),
          grepl('|L2FC| ≥ 0, P < 1', actual, fixed = TRUE))
stopifnot(grepl('|L2FC| ≥ 1, P < 0.05', render_title(list()), fixed = TRUE))
cat('PASS: filtered SD title resolves active and default DE cutoffs\n')
