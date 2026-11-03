# Every fixed output in the shipped Team UI must bind to its shared module server.
ui_expr <- parse('R/frontends/team/modules-ui.R', keep.source = TRUE)
modules <- c(
  heatmap_ui = '4_heatmap', barchart_ui = '5_barchart',
  volcano_ui = '6_volcano', lsea_ui = '7_lsea',
  structural_ui = '8_structural', structural_proportions_ui = '8_structural',
  logratio_ui = '9_logratio', fla_ui = '10_fla',
  longitudinal_ui = '11_longitudinal', pathway_ui = '13_pathway',
  cellular_org_ui = '14_cellular_org', math_proof_ui = '15_math_proof',
  export_studio_ui = '99_export_studio'
)
ui_functions <- list()
for (expr in ui_expr) {
  if (is.call(expr) && identical(expr[[1]], as.name('<-')) &&
      is.symbol(expr[[2]]) && as.character(expr[[2]]) %in% names(modules)) {
    ui_functions[[as.character(expr[[2]])]] <- expr
  }
}
stopifnot(setequal(names(ui_functions), names(modules)))
output_pattern <- '(?:plotOutput|plotlyOutput|uiOutput|tableOutput|DTOutput|verbatimTextOutput|textOutput|imageOutput)\\s*\\(\\s*ns\\s*\\(\\s*["\']([^"\']+)["\']'
server_pattern <- 'output\\$([[:alnum:]_.]+)\\s*<-'
for (ui_name in names(modules)) {
  module <- modules[[ui_name]]
  ui_text <- paste(deparse(ui_functions[[ui_name]], width.cutoff = 500L), collapse = '\n')
  matches <- regmatches(ui_text, gregexpr(output_pattern, ui_text, perl = TRUE))[[1]]
  requested <- if (length(matches)) unique(sub(output_pattern, '\\1', matches, perl = TRUE)) else character()
  server_text <- paste(readLines(file.path('R/modules', paste0(module, '_module.R')),
                                 warn = FALSE), collapse = '\n')
  matches <- regmatches(server_text, gregexpr(server_pattern, server_text, perl = TRUE))[[1]]
  provided <- if (length(matches)) unique(sub(server_pattern, '\\1', matches, perl = TRUE)) else character()
  missing <- setdiff(requested, provided)
  if (length(missing)) stop(ui_name, ': missing server outputs: ', paste(missing, collapse = ', '))
}
cat('PASS: 13 shipped Team module UIs bind to shared server outputs\n')
