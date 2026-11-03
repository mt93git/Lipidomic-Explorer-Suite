suppressPackageStartupMessages(library(shiny))

find_output <- function(node) {
  if (is.call(node) && identical(node[[1]], as.name("<-")) &&
      is.call(node[[2]]) && identical(node[[2]][[1]], as.name("$")) &&
      identical(node[[2]][[2]], as.name("output")) &&
      identical(node[[2]][[3]], as.name("topClassesCountUI"))) return(node)
  if (is.recursive(node)) {
    for (i in seq_along(node)) {
      found <- tryCatch(find_output(node[[i]]), error = function(e) NULL)
      if (!is.null(found)) return(found)
    }
  }
  NULL
}

assignment <- find_output(parse("R/modules/8_structural_module.R"))
stopifnot(!is.null(assignment))
render_count <- 0L

testServer(function(input, output, session) {
  structuralData <- function() NULL
  auditResults <- function() NULL
  shared_data <- list(
    de_contrast_info = function() NULL,
    de_settings = function() list(),
    is_restoring = function() FALSE,
    get_restored_input = function(id, default) default
  )
  last_struct_grouping <- reactiveVal(NULL)
  last_struct_no_sig <- reactiveVal(NULL)
  last_struct_contrast <- reactiveVal(NULL)
  last_struct_max_count <- reactiveVal(NULL)
  last_struct_sig_settings <- reactiveVal(NULL)
  last_struct_run_count <- reactiveVal(0)
  sliderInput <- function(...) {
    render_count <<- render_count + 1L
    shiny::sliderInput(...)
  }
  eval(assignment, envir = environment())
}, {
  session$setInputs(structuralGrouping = "subclass", noSigThreshold = FALSE,
                    runAnalysis = 0)
  first <- output$topClassesCountUI
  stopifnot(grepl("Number of Lipid Main Classes", first$html, fixed = TRUE),
            identical(render_count, 1L))
  session$flushReact()
  stopifnot(identical(render_count, 1L))

  session$setInputs(structuralGrouping = "hyperclass")
  second <- output$topClassesCountUI
  stopifnot(grepl("Number of Lipid Categories", second$html, fixed = TRUE),
            identical(render_count, 2L))
})

cat("PASS: structural top-class UI renders once per real input change\n")
