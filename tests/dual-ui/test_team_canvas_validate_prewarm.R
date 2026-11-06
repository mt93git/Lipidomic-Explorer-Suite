# Canvas restore validation gives identical results with the per-process input
# allow-list cold (built inside the restore, as before) or prewarmed at app start, and
# no session data can change what the memo holds. Run from a source tree root:
#   LIPIDOMIC_INTERFACE=team Rscript tests/dual-ui/test_team_canvas_validate_prewarm.R
Sys.setenv(LIPIDOMIC_INTERFACE = 'team', LIPIDOMIC_TEAM_WORKSPACE = '1', LIPIDOMIC_TEAM_PREWARM = '0')
suppressPackageStartupMessages({ source('R/global.R'); source('R/frontends/team/server.R') })
ok <- 0L
check <- function(label, cond) { if (!isTRUE(cond)) stop('FAIL: ', label, call. = FALSE); ok <<- ok + 1L; cat('ok -', label, '\n') }
stopifnot(identical(later::loop_empty(), TRUE))  # nothing scheduled with PREWARM=0
# Re-sourcing the file gives fresh (cold) memo environments; the Team module UIs that
# global.R defined stay in place, exactly as in a fresh app process.
cold <- function() source('R/frontends/team/plot_instances.R')
prewarm <- function() {
  n <- team_plot_instance_prewarm(delay = 0)
  for (i in seq_len(n * 4L)) { if (later::loop_empty()) break; later::run_now(0.01) }
  stopifnot(later::loop_empty())
}
sources <- team_plot_instance_prewarm_sources()
families <- names(sources)
outcome <- function(f) tryCatch(list(ok = TRUE, value = f()), error = function(e) list(ok = FALSE, message = conditionMessage(e)))

# 1. Every family's allow-list and copy defaults: cold in a session vs prewarmed outside one.
cold()
cold_ids <- shiny::withReactiveDomain(shiny::MockShinySession$new(), lapply(sources, team_plot_instance_input_ids))
cold_defaults <- lapply(setdiff(families, c('team_cell', 'results_dashboard')), function(f) outcome(function() team_plot_instance_input_defaults(f)))
cold(); prewarm()
warm_env <- environment(team_plot_instance_input_ids)$cache
check('prewarm filled the allow-list memo for every family', setequal(ls(warm_env), families))
warm_ids <- lapply(sources, team_plot_instance_input_ids)
warm_defaults <- lapply(setdiff(families, c('team_cell', 'results_dashboard')), function(f) outcome(function() team_plot_instance_input_defaults(f)))
check('allow-lists identical cold (in session) vs prewarmed', identical(cold_ids, warm_ids))
check('copy defaults identical cold vs prewarmed', identical(cold_defaults, warm_defaults))
check('every allow-list is non-empty', all(lengths(warm_ids) > 0L))
check('validator warm-up runs on its constant canvas without error', is.null(tryCatch(team_plot_instance_prewarm_validator(), error = function(e) e)))

# 2. Canvas validation: accept and reject cases, cold vs warm, compared with identical().
node <- function(i, source, inputs) {
  id <- sprintf('tcinstance_case%d', i); out <- team_plot_instance_source(source)$output
  list(id = paste0(id, '-', out), label = 'Copy', x = 0, y = 0, width = 600, height = 400, visual = list(),
    instance = list(id = id, source = source, inputs = inputs))
}
state <- function(nodes) list(version = '1', libraryHidden = FALSE, nodes = nodes)
first_input <- function(s) { ids <- warm_ids[[match(s, sources)]]; stats::setNames(list('x'), ids[[1L]]) }
accept_all <- state(lapply(seq_along(sources), function(i) node(i, sources[[i]], first_input(sources[[i]]))))
every_input <- state(lapply(seq_along(sources), function(i) node(i, sources[[i]], stats::setNames(as.list(rep('x', length(warm_ids[[i]]))), warm_ids[[i]]))))
forged_input <- state(list(node(1, 'results_dashboard-plot_violin', list(violin_lipid = 'PE(36:2)', tcinstance_forged = 'x'))))
forged_late <- state(c(accept_all$nodes, list(node(99, 'qc_pca_tab-pca2dPlot', list(`__proto__` = 'x')))))
forged_ns <- state(list(node(1, 'results_dashboard-plot_violin', list(`results_dashboard-violin_lipid` = 'x'))))
file_input <- state(list(node(1, 'results_dashboard-plot_violin', list(dl_violin = 1))))
forged_source <- accept_all; forged_source$nodes[[1L]]$instance$source <- 'results_dashboard-not_a_plot'
other_family <- accept_all; other_family$nodes[[2L]]$instance$inputs <- first_input(sources[[3L]])
cases <- list(accept_all = accept_all, every_input = every_input, forged_input = forged_input, forged_late = forged_late,
  forged_ns = forged_ns, file_input = file_input, forged_source = forged_source, other_family = other_family)
expect_ok <- c(accept_all = TRUE, every_input = TRUE, forged_input = FALSE, forged_late = FALSE, forged_ns = FALSE,
  file_input = FALSE, forged_source = FALSE, other_family = all(names(first_input(sources[[3L]])) %in% warm_ids[[2L]]))
for (name in names(cases)) {
  cold(); cold_result <- outcome(function() team_canvas_validate(cases[[name]]))
  cold(); prewarm(); warm_result <- outcome(function() team_canvas_validate(cases[[name]]))
  check(sprintf('%s: validation identical cold vs warm', name), identical(cold_result, warm_result))
  check(sprintf('%s: %s as expected', name, if (expect_ok[[name]]) 'accepted' else 'rejected'), identical(warm_result$ok, expect_ok[[name]]))
}
check('forged input id is rejected as unknown', identical(outcome(function() team_canvas_validate(forged_input))$message, 'Unknown or unsafe restored plot input.'))

# 3. The memo cannot be poisoned by session data: run every case (forged ones included)
# against a cold memo, then the allow-lists are those of a clean prewarm.
cold()
for (x in cases) outcome(function() team_canvas_validate(x))
for (s in c('results_dashboard-__proto__', 'exists', 'team_cell', '', 'qc_pca_tab-', 'cell_lipid_plot ')) outcome(function() team_plot_instance_input_ids(s))
memo <- environment(team_plot_instance_input_ids)$cache
check('memo keys are only family ids from the code', all(ls(memo, all.names = TRUE) %in% families))
after_ids <- lapply(sources, team_plot_instance_input_ids)
check('allow-lists after forged session data identical to prewarmed ones', identical(after_ids, warm_ids))
check('a forged id never enters an allow-list', !any(c('tcinstance_forged', '__proto__', 'results_dashboard-violin_lipid') %in% unlist(after_ids)))
cat(sprintf('PASS %d checks\n', ok))
