# W15b: Team defers the Structural acyl-chain matrix and its badge until the
# Proportions view is shown. Run from the repository root: Rscript tests/dual-ui/test_team_defer_chain_matrix.R
suppressPackageStartupMessages(library(shiny))
source('R/frontends/team/hidden_previews.R')
team_server_exprs <- parse('R/frontends/team/server.R', keep.source = FALSE)
for (e in team_server_exprs) if (is.call(e) && identical(e[[1L]], as.name('<-')) &&
  as.character(e[[2L]]) %in% c('team_hidden_classic_outputs', 'team_suspend_hidden_classic_outputs')) eval(e)
deferred <- c('structural_tab-prop_chain_matrix_ui', 'structural_tab-prop_matrix_status_badge')
stopifnot(all(deferred %in% team_hidden_classic_outputs))

# 1. Applied after Max's module registers its suspendWhenHidden = FALSE, the
#    Team override leaves both outputs suspended while hidden.
module <- readLines('R/modules/8_structural_module.R', warn = FALSE)
server <- readLines('R/server.R', warn = FALSE)
stopifnot(any(grepl('outputOptions(output, "prop_chain_matrix_ui", suspendWhenHidden = FALSE)', module, fixed = TRUE)),
          any(grepl('outputOptions(output, "prop_matrix_status_badge", suspendWhenHidden = FALSE)', module, fixed = TRUE)))
reg <- grep('structural_server("structural_tab"', server, fixed = TRUE)
ovr <- grep('team_suspend_hidden_classic_outputs(output)', server, fixed = TRUE)
stopifnot(length(reg) == 1L, length(ovr) == 1L, ovr > reg)
testServer(function(input, output, session) {
  for (id in c(deferred, team_hidden_classic_outputs, team_hidden_metadata_previews)) output[[id]] <- renderUI(NULL)
}, {
  opts <- list()
  session$outputOptions <- function(name, ...) { v <- list(...); if (length(v)) opts[[name]] <<- modifyList(opts[[name]] %||% list(), v); opts[[name]] }
  for (id in deferred) outputOptions(output, id, suspendWhenHidden = FALSE)  # Max's module
  team_suspend_hidden_classic_outputs(output)                                # Team, afterwards
  stopifnot(all(vapply(deferred, function(id) isTRUE(opts[[id]]$suspendWhenHidden), logical(1))))
})

# 2. Nothing outside the matrix depends on it having rendered while hidden.
#    It creates prop_renormalize_subset (default FALSE), cb_chain_* and
#    btn_prop_matrix_* controls and reports clicks as prop_matrix_selected_chains.
#    The selection itself is a server reactiveVal (NULL = all chains).
src <- paste(module, collapse = '\n')
readers <- regmatches(src, gregexpr('[A-Za-z_.]*\\(?input\\$prop_renormalize_subset\\)?', src))[[1]]
stopifnot(identical(unique(readers), 'isTRUE(input$prop_renormalize_subset)'))
stopifnot(grepl('checkboxInput(session$ns("prop_renormalize_subset")', src, fixed = TRUE),
          grepl('value = FALSE)', sub('.*checkboxInput\\(session\\$ns\\("prop_renormalize_subset"\\)', '', src)))
stopifnot(grepl('prop_selected_chains <- reactiveVal(NULL)', src, fixed = TRUE))
team_files <- c(list.files('R/frontends/team', '\\.R$', full.names = TRUE), list.files('www/team/js', '\\.js$', full.names = TRUE))
team_files <- setdiff(team_files, 'www/team/js/app.js')  # Classic matrix click handlers, unchanged
hits <- team_files[vapply(team_files, function(f) any(grepl('prop_renormalize_subset|cb_chain_|prop_matrix_selected_chains|prop_chain_matrix_ui|prop_matrix_status_badge',
  readLines(f, warn = FALSE))), logical(1))]
stopifnot(setequal(hits, c('R/frontends/team/server.R', 'R/frontends/team/modules-ui.R')))

# 3. A Canvas copy of the proportions plot keeps its own matrix running: it is one
#    of the copy's input providers, forced on in the copy's namespace.
plots <- readLines('R/frontends/team/plot_instances.R', warn = FALSE)
stopifnot(any(grepl("team_plot_instance_input_providers(value$source)", plots, fixed = TRUE)))
cat('PASS chain matrix and badge suspend while hidden in Team; no Team reader depends on them; Canvas copies keep their own matrix\n')
