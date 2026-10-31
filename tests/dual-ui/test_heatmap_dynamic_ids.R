suppressPackageStartupMessages({ library(shiny); library(bslib); library(htmltools) })

module_expr <- parse('R/modules/4_heatmap_module.R')
find_assignment <- function(node, target) {
  if (is.call(node) && identical(node[[1]], as.name('<-')) &&
      is.call(node[[2]]) && identical(node[[2]][[1]], as.name('$')) &&
      identical(as.character(node[[2]][[3]]), target)) return(node)
  if (is.recursive(node)) {
    for (index in seq_along(node)) {
      child <- tryCatch(node[[index]], error = function(e) NULL)
      if (is.null(child)) next
      found <- tryCatch(find_assignment(child, target), error = function(e) NULL)
      if (!is.null(found)) return(found)
    }
  }
  NULL
}
container_assignment <- find_assignment(module_expr, 'filtered_heatmap_container')
stopifnot(!is.null(container_assignment),
          identical(container_assignment[[3]][[1]], as.name('renderUI')))
container_body <- container_assignment[[3]][[2]]
render_container <- function(avg, sd) {
  env <- new.env(parent = globalenv())
  env$input <- list(condenseRows = avg, condenseRowsSD = sd)
  env$ns <- shiny::NS('heatmap')
  env$shared_data <- list(de_contrast_info = function() list(ref = 'control', comp = 'treated'))
  htmltools::renderTags(eval(container_body, envir = env))$html
}
for (frontend in c('R/modules/4_heatmap_module.R', 'R/frontends/team/modules-ui.R')) {
  ui_text <- paste(readLines(frontend, warn = FALSE), collapse = '\n')
  stopifnot(grepl('uiOutput(ns("filtered_heatmap_container"))', ui_text, fixed = TRUE))
  both <- render_container(TRUE, TRUE)
  ids <- sub('^id="([^"]+)"$', '\\1',
             regmatches(both, gregexpr('id="[^"]+"', both, perl = TRUE))[[1]])
  stopifnot(!anyDuplicated(ids))
  for (id in c('filtered_threshold_badge_avg', 'filtered_threshold_badge_sd',
               'active_contrast_badge_avg_ui', 'active_contrast_badge_sd_ui')) {
    stopifnot(sum(ids == paste0('heatmap-', id)) == 1L)
  }
  stopifnot(grepl('Filtered Heatmap - Class Average', both, fixed = TRUE),
            grepl('Filtered Heatmap - Class Standard Deviation', both, fixed = TRUE))
}
for (id in c('filtered_threshold_badge_avg', 'filtered_threshold_badge_sd',
             'active_contrast_badge_avg_ui', 'active_contrast_badge_sd_ui')) {
  stopifnot(!is.null(find_assignment(module_expr, id)))
}
cat('PASS: Classic and Team filtered heatmap cards render unique bound IDs\n')
