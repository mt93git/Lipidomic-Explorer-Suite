suppressPackageStartupMessages(library(bslib))

find_assignment <- function(node, target) {
  if (is.call(node) && identical(node[[1]], as.name("<-")) &&
      identical(node[[2]], as.name(target))) return(node)
  if (is.recursive(node)) {
    for (i in seq_along(node)) {
      child <- tryCatch(node[[i]], error = function(e) NULL)
      if (is.null(child)) next
      found <- tryCatch(find_assignment(child, target), error = function(e) NULL)
      if (!is.null(found)) return(found)
    }
  }
  NULL
}

assignment <- find_assignment(parse("R/modules/1_shared_data_module.R"), "update_input_generic")
stopifnot(!is.null(assignment))
env <- new.env(parent = globalenv())
eval(assignment, envir = env)

messages <- list()
session <- list(
  onFlush = function(callback, once = TRUE) callback(),
  sendInputMessage = function(id, message) {
    messages[[length(messages) + 1L]] <<- list(id = id, message = message)
  }
)

# Restore the same open panels that bslib serializes as an input value.
env$update_input_generic(session, "structural_tab-prop_stacked_accordion",
                         c("0. Scope & Grouping", "1. Proportion Settings"))
stopifnot(length(messages) == 1L,
          identical(messages[[1L]]$id, "structural_tab-prop_stacked_accordion"),
          identical(messages[[1L]]$message$method, "set"),
          identical(unlist(messages[[1L]]$message$values, use.names = FALSE),
                    c("0. Scope & Grouping", "1. Proportion Settings")),
          is.null(messages[[1L]]$message[["value", exact = TRUE]]))

env$update_input_generic(session, "structural_tab-prop_bottom_matrix_accordion",
                         "2. Structural Filter Matrix")
stopifnot(length(messages) == 2L,
          identical(messages[[2L]]$message$method, "set"),
          identical(unlist(messages[[2L]]$message$values, use.names = FALSE),
                    "2. Structural Filter Matrix"))

env$update_input_generic(session, "structural_tab-prop_diff_accordion", character(0))
stopifnot(length(messages) == 3L,
          identical(messages[[3L]]$message$method, "close"),
          identical(messages[[3L]]$message$values, TRUE))

cat("PASS: accordion hydration uses bslib panel-set messages\n")
