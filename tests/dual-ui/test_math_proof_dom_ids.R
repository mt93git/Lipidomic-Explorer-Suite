# The single-step and stacked overview cards coexist in the same DOM. Their
# tabsets and navigation controls must have distinct IDs and resolve to the
# intended step even when both directions are present.
suppressPackageStartupMessages({
  library(shiny)
  library(bslib)
})
source("R/modules/15_math_proof_module.R")

mat <- matrix(c(100, 120, 200, 240), nrow = 2,
  dimnames = list(c("PC(34:1)", "PE(36:2)"), c("S1", "S2")))
trace <- list(mat_raw = mat, mat_log = log2(mat), mat_log_imputed = log2(mat),
  mat_final_log = log2(mat), mat_final_linear = mat,
  norm_offsets = setNames(c(0, 0), colnames(mat)),
  scaling_factors = setNames(c(1, 1), colnames(mat)),
  sample_lods = setNames(c(1, 1), colnames(mat)),
  sample_medians = setNames(c(6.9, 7), colnames(mat)),
  grand_median = 6.95,
  qrilc_params = data.frame(Sample = colnames(mat), pNAs = c(0, 0),
    Mean_CDD = c(NA_real_, NA_real_), SD_CDD = c(NA_real_, NA_real_),
    Upper_Cutoff_Log2 = c(NA_real_, NA_real_),
    Upper_Cutoff_Linear = c(NA_real_, NA_real_)))

shared <- list(audit_trace = function() trace,
  data_processed = function() NULL, rawData = function() NULL)
updates <- list()
updateTabsetPanel <- function(session, inputId, selected) {
  updates[[length(updates) + 1L]] <<- list(inputId = inputId, selected = selected)
}

testServer(math_proof_server, args = list(shared_data = shared), {
  ns <- session$ns
  html <- htmltools::renderTags(render_stepper_proof(trace, "PC(34:1)", "S1", FALSE))$html
  # Match only an id attribute at an HTML whitespace boundary, not data-id.
  attributes <- regmatches(html, gregexpr("[[:space:]]id=\"[^\"]+\"", html,
    perl = TRUE))[[1L]]
  ids <- sub('^[[:space:]]id="([^"]+)"$', "\\1", attributes, perl = TRUE)
  duplicates <- names(which(table(ids) > 1L))
  stopifnot(length(duplicates) == 0L)

  stopifnot(all(ns(paste0("subtabs_step_", 1:5)) %in% ids),
    all(ns(paste0("overview_subtabs_step_", 1:5)) %in% ids),
    !any(grepl(paste0("^", ns("slider_step")), ids)))
  navigation <- c("goto_step1", "goto_step2", "goto_step2_from_step3",
    "goto_step3", "goto_step3_from_step4", "goto_step4",
    "goto_step4_from_step5", "goto_step5", "goto_overview")
  stopifnot(all(ns(navigation) %in% ids))

  targets <- c(goto_step1 = "step1", goto_step2 = "step2",
    goto_step2_from_step3 = "step2", goto_step3 = "step3",
    goto_step3_from_step4 = "step3", goto_step4 = "step4",
    goto_step4_from_step5 = "step4", goto_step5 = "step5",
    goto_overview = "overview")
  for (name in names(targets)) {
    do.call(session$setInputs, setNames(list(1L), name))
    stopifnot(length(updates) > 0L,
      identical(tail(updates, 1L)[[1L]],
        list(inputId = "stepper_tabs", selected = unname(targets[[name]]))))
  }
})
cat("PASS: math proof single/overview DOM IDs are unique and step buttons route correctly\n")
