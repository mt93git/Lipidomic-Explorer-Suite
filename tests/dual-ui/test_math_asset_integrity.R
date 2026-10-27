# The actual app tags, matrix modal, and generated standalone report must all
# carry the pinned executable assets and integrity metadata. No network access
# is needed to run this regression.
suppressPackageStartupMessages({
  library(shiny)
  library(bslib)
})
source("R/modules/15_math_proof_module.R")

assets <- c(
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" =
    "sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV",
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" =
    "sha384-XjKyOOlGwcjNTAIQHIpgOno0Hl1YQqzUOEleOLALmuqehneUG+vnGctmUb0ZY0l8",
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" =
    "sha384-+VBxd3r6XgURycqtZ117nYw44OOcIax56Z4dCRWbxyPt0Koah1uHoK0o4+/RRE05",
  "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js" =
    "sha384-Wuix6BuhrWbjDBs24bXrjf4ZQ5aFeFWBuKkFekO2t8xFU0iNaLQfp2K6/1Nxveei"
)
app_assets <- c(assets[1:3],
  "https://cdn.jsdelivr.net/npm/mathjax@2.7.9/MathJax.js?config=TeX-AMS-MML_HTMLorMML" =
    "sha384-vi9R4hb1goLJPJDHY+dOmXxcY3HGv6tJIwHxy5JunOTxJGHbsSuubPgl++SNxYYi")

assert_assets <- function(markup, expected) {
  tags <- regmatches(markup, gregexpr("<(?:script|link)\\b[^>]*>", markup, perl = TRUE))[[1L]]
  remote <- tags[grepl("https://cdn.jsdelivr.net/npm/(?:katex|mathjax)", tags, perl = TRUE)]
  stopifnot(length(remote) == length(expected))
  for (url in names(expected)) {
    tag <- remote[grepl(url, remote, fixed = TRUE)]
    hash <- expected[[url]]
    stopifnot(length(tag) == 1L,
      grepl(paste0('integrity="', hash, '"'), tag, fixed = TRUE) ||
        grepl(paste0("integrity='", hash, "'"), tag, fixed = TRUE),
      grepl("crossorigin=['\"]anonymous['\"]", tag, perl = TRUE))
  }
  stopifnot(!grepl("mathjax@3/es5", markup, fixed = TRUE),
    !grepl("mathjax.rstudio.com/latest", markup, fixed = TRUE))
}

app_head <- htmltools::renderTags(math_proof_ui("proof"))$head
assert_assets(app_head, app_assets)

# Team ships its own math_proof_ui assignment; execute that exact expression.
team_expr <- parse("R/frontends/team/modules-ui.R")
team_assignment <- Filter(function(expr) is.call(expr) &&
  identical(expr[[1L]], as.name("<-")) &&
  identical(expr[[2L]], as.name("math_proof_ui")), as.list(team_expr))
stopifnot(length(team_assignment) == 1L)
eval(team_assignment[[1L]], envir = .GlobalEnv)
team_head <- htmltools::renderTags(math_proof_ui("proof"))$head
assert_assets(team_head, app_assets)

mat <- matrix(c(100, 120, 200, 240), nrow = 2,
  dimnames = list(c("PC(34:1)", "PE(36:2)"), c("S1", "S2")))
trace <- list(mat_raw = mat, mat_log = log2(mat), mat_log_imputed = log2(mat),
  mat_final_log = log2(mat), mat_final_linear = mat,
  norm_offsets = setNames(c(0, 0), colnames(mat)),
  scaling_factors = setNames(c(1, 1), colnames(mat)),
  sample_lods = setNames(c(1, 1), colnames(mat)))
report_path <- tempfile(fileext = ".html")
testServer(math_proof_server, args = list(shared_data = list(
  audit_trace = function() trace,
  data_processed = function() NULL,
  rawData = function() NULL
)), {
  modal <- htmltools::renderTags(render_export_matrix_modal(session$ns))$html
  assert_assets(modal, assets[1:3])
  generate_demonstration_report_html(trace, "PC(34:1)", report_path,
    target_samples = "S1")
})
report <- paste(readLines(report_path, warn = FALSE), collapse = "\n")
assert_assets(report, assets)
stopifnot(grepl("PC(34:1)", report, fixed = TRUE),
  grepl("renderMathInElement(document.body", report, fixed = TRUE),
  grepl("<math", report, fixed = TRUE))

# A changed CDN response hash must be rejected by the contract check.
bad <- sub(assets[[2L]], "sha384-invalid", report, fixed = TRUE)
stopifnot(inherits(try(assert_assets(bad, assets), silent = TRUE), "try-error"))
unlink(report_path)
cat("PASS: Classic/Team math UI, matrix modal, and generated HTML use pinned SRI assets\n")
