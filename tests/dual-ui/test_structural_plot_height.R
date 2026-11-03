suppressPackageStartupMessages(library(shiny))

find_assignment <- function(node, target) {
  if (is.call(node) && identical(node[[1]], as.name("<-")) &&
      identical(node[[2]], as.name(target))) return(node)
  if (is.recursive(node)) {
    for (i in seq_along(node)) {
      part <- tryCatch(node[[i]], error = function(e) NULL)
      if (is.null(part)) next
      found <- tryCatch(find_assignment(part, target), error = function(e) NULL)
      if (!is.null(found)) return(found)
    }
  }
  NULL
}

assignment <- find_assignment(parse("R/modules/8_structural_module.R"), "get_prop_plot_height")
stopifnot(!is.null(assignment))
diff_assignment <- find_assignment(parse("R/modules/8_structural_module.R"), "get_diff_plot_height")
stopifnot(!is.null(diff_assignment))

env <- new.env(parent = globalenv())
env$buildPropPlotData <- function() list(multiclass_mode = "merged", n_classes = 1)
env$input <- list(prop_enable_donut = FALSE)
env$debounced_prop_container_size <- function() shiny::req(FALSE)
eval(assignment, envir = env)

# A missing first resize event must not suppress a valid analytical plot.
stopifnot(identical(env$get_prop_plot_height(), 400))
env$buildPropPlotData <- function() list(multiclass_mode = "stacked", n_classes = 3)
stopifnot(identical(env$get_prop_plot_height(), 720))
env$debounced_prop_container_size <- function() list(height = 900)
stopifnot(identical(env$get_prop_plot_height(), 884))
env$debounced_prop_container_size <- function() stop("real resize error")
stopifnot(inherits(try(env$get_prop_plot_height(), silent = TRUE), "try-error"))

env$diff_acyl_data <- function() list(results = data.frame(AcylChain = rep("18:1", 8)), plot_style = "forest")
env$debounced_diff_container_size <- function() shiny::req(FALSE)
eval(diff_assignment, envir = env)
stopifnot(identical(env$get_diff_plot_height(), 420))
env$debounced_diff_container_size <- function() list(height = 600)
stopifnot(identical(env$get_diff_plot_height(), 584))

cat("PASS: structural plot heights fall back while resize inputs are pending\n")
