# Every fixed output in the shipped Team UI must bind to its shared module server.
ui_expr <- c(parse('R/frontends/team/modules-ui.R', keep.source = TRUE),parse('R/frontends/team/qc-ui.R',keep.source=TRUE))
modules <- c(
  qc_boxplot_ui = '2_qc_boxplot',
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
  if (identical(ui_name,'qc_boxplot_ui')) {
    parsed <- parse('R/modules/2_qc_boxplot_module.R')
    definition <- Filter(function(e)is.call(e)&&identical(e[[1]],as.name('<-'))&&identical(e[[2]],as.name('qc_boxplot_server')),as.list(parsed))
    stopifnot(length(definition)==1L)
    scope<-new.env(parent=globalenv());eval(definition[[1]],scope)
    source('R/frontends/team/legacy_vector_adapter.R',local=scope)
    adapted<-scope$team_qc_vector_adapter(scope$qc_boxplot_server)
    server_text<-paste(deparse(body(adapted),width.cutoff=500L),collapse='\n')
    stopifnot(all(c('pca2dPlot','load2dPlot','pca2dVectorPlot','load2dVectorPlot') %in% requested))
  }
  if (identical(ui_name, 'heatmap_ui')) {
    # The shared Classic module keeps its two original outputs; Team's strict
    # adapter transforms its actual function body into four additional outputs.
    original_matches <- regmatches(server_text, gregexpr(server_pattern, server_text, perl = TRUE))[[1]]
    original_provided <- unique(sub(server_pattern, '\\1', original_matches, perl = TRUE))
    stopifnot(all(c('unfiltered_heatmap_container','filtered_heatmap_container') %in% original_provided))
    parsed <- parse(file.path('R/modules','4_heatmap_module.R'))
    definition <- Filter(function(e) is.call(e) && identical(e[[1]],as.name('<-')) && identical(e[[2]],as.name('heatmap_server')), as.list(parsed))
    stopifnot(length(definition)==1L)
    scope <- new.env(parent=globalenv());eval(definition[[1]],scope)
    source('R/frontends/team/heatmap_canvas_boundaries_adapter.R',local=scope)
    adapted <- scope$team_heatmap_canvas_boundaries_adapter(scope$heatmap_server)
    server_text <- paste(deparse(body(adapted),width.cutoff=500L),collapse='\n')
    # UI has three sibling outputs per tab: controls, average and SD.
    sibling_groups <- list()
    walk <- function(x) {
      if(is.call(x) && identical(x[[1]],as.name('tagList'))) {
        children <- vapply(as.list(x)[-1L],function(y) {
          if(is.call(y) && identical(y[[1]],as.name('uiOutput')) && length(y)>=2L && is.call(y[[2]]) && identical(y[[2]][[1]],as.name('ns')) && is.character(y[[2]][[2]])) y[[2]][[2]] else ''
        },character(1))
        sibling_groups[[length(sibling_groups)+1L]] <<- children
      }
      if(is.recursive(x)) for(i in seq_along(x)) if(!is.null(x[[i]])) walk(x[[i]])
    }
    walk(ui_functions[[ui_name]])
    for(prefix in c('unfiltered_heatmap_container','filtered_heatmap_container'))
      stopifnot(any(vapply(sibling_groups,function(g) identical(g,c(prefix,paste0(prefix,'_average'),paste0(prefix,'_sd'))),logical(1))))
  }
  matches <- regmatches(server_text, gregexpr(server_pattern, server_text, perl = TRUE))[[1]]
  provided <- if (length(matches)) unique(sub(server_pattern, '\\1', matches, perl = TRUE)) else character()
  missing <- setdiff(requested, provided)
  if (length(missing)) stop(ui_name, ': missing server outputs: ', paste(missing, collapse = ', '))
}
cat('PASS: 14 shipped Team module UIs bind to shared server outputs\n')
