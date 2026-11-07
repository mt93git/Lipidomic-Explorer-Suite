# The Canvas allow-list prewarm is armed only when the Team server starts a session,
# once per process: sourcing the app (Team or Classic) or plot_instances.R alone
# leaves the later loop empty and memoizes nothing; Classic never schedules it. Each case
# runs in its own R process. From a source tree root:
#   R --vanilla --file=tests/dual-ui/test_team_canvas_prewarm_scheduler.R
args <- commandArgs(trailingOnly = TRUE)
if (!length(args)) {
  run <- function(mode) {
    out <- system2(file.path(R.home('bin'), 'R'), c('--no-echo', '--no-restore', '--vanilla',
      '--file=tests/dual-ui/test_team_canvas_prewarm_scheduler.R', '--args', mode), stdout = TRUE, stderr = TRUE)
    status <- attr(out, 'status'); cat(grep('^(ok|FAIL)', out, value = TRUE), sep = '\n')
    if (!is.null(status) && status != 0L) { cat(tail(out, 15), sep = '\n'); stop('case failed: ', mode, call. = FALSE) }
    sum(startsWith(out, 'ok'))
  }
  n <- sum(vapply(c('team', 'classic', 'direct'), run, integer(1)))
  cat(sprintf('PASS %d checks\n', n)); quit(save = 'no')
}
mode <- args[[1L]]
Sys.unsetenv('LIPIDOMIC_TEAM_PREWARM')
Sys.setenv(LIPIDOMIC_INTERFACE = if (mode == 'classic') 'classic' else 'team', LIPIDOMIC_TEAM_WORKSPACE = '1')
check <- function(label, cond) { if (!isTRUE(cond)) { cat('FAIL -', mode, label, '\n'); quit(save = 'no', status = 1L) }; cat('ok -', mode, label, '\n') }
memo_size <- function() if (exists('team_plot_instance_input_ids', mode = 'function')) length(ls(environment(team_plot_instance_input_ids)$cache)) else 0L
drain <- function(seconds = 3) { end <- Sys.time() + seconds; while (Sys.time() < end && !later::loop_empty()) later::run_now(0.1) }
# Record every arming that schedules, and the memo after each sourced file.
armed <- 0L; memo_seen <- 0L
source <- function(file, local = FALSE, ...) {
  env <- if (is.environment(local)) local else if (isTRUE(local)) parent.frame() else globalenv()
  result <- base::source(file, local = env, ...)
  if (identical(file, 'R/frontends/team/plot_instances.R') && exists('team_plot_instance_arm_prewarm', mode = 'function')) {
    real_arm <- team_plot_instance_arm_prewarm
    team_plot_instance_arm_prewarm <<- function(...) { scheduled <- real_arm(...); if (isTRUE(scheduled)) armed <<- armed + 1L; scheduled }
  }
  memo_seen <<- max(memo_seen, memo_size())
  invisible(result)
}
if (mode == 'direct') {
  suppressPackageStartupMessages(library(shiny))
  source('R/frontends/interface.R'); source('R/frontends/team/plot_instances.R')
  check('sourcing plot_instances.R directly leaves the later loop empty', later::loop_empty() && armed == 0L)
  drain(1.5); check('no memo after a direct source', memo_size() == 0L)
  quit(save = 'no')
}
suppressPackageStartupMessages({ source('R/global.R'); source('R/frontends/team/server.R') })
# The W13 worker-pool boot timer (parallel_pool.R) is the one callback sourcing leaves; it does
# nothing unless the app is running. Cancelling it must leave the loop empty. Classic does not
# source the Team files, so it has no such timer.
check('sourcing the app schedules only the worker-pool boot timer (none in Classic)',
  if (mode == 'classic') !exists('team_parallel_boot_timer') else is.function(team_parallel_boot_timer) && isTRUE(team_parallel_boot_timer()))
check('sourcing the app leaves the later loop empty and arms nothing', later::loop_empty() && armed == 0L)
check('nothing memoized while the app is sourced', memo_seen == 0L && memo_size() == 0L)
if (mode == 'classic') {
  # On integration Classic does not source the Team files at all (Blocks C/D), so there is no
  # prewarm to arm; where it is defined, arming it from Classic must still schedule nothing.
  check('Classic: arming at session start schedules nothing',
    (!exists('team_plot_instance_arm_prewarm', mode = 'function') || !isTRUE(team_plot_instance_arm_prewarm())) && later::loop_empty())
  drain(2); check('Classic memoizes nothing', memo_size() == 0L)
  quit(save = 'no')
}
first <- body(team_frontend_server)[[2L]]
check('the Team server arms the prewarm first thing in each session start', identical(first, quote(team_plot_instance_arm_prewarm())))
# First and second session starts: only the first schedules (once per process).
check('first session start arms it', isTRUE(team_plot_instance_arm_prewarm()) && !later::loop_empty())
check('later session starts do not arm it again', !isTRUE(team_plot_instance_arm_prewarm()) && armed == 1L)
later::run_now(0); check('the armed prewarm waits for the event loop', memo_size() == 0L)
drain(15)
check('the prewarm filled every family once the loop ran', later::loop_empty() && memo_size() == length(team_plot_instance_prewarm_sources()))
sources <- team_plot_instance_prewarm_sources()
warm <- lapply(sources, team_plot_instance_input_ids)
warm_defaults <- lapply(setdiff(names(sources), c('team_cell', 'results_dashboard')), team_plot_instance_input_defaults)
Sys.setenv(LIPIDOMIC_TEAM_PREWARM = '0'); base::source('R/frontends/team/plot_instances.R')  # cold memo, final definitions
check('scheduled prewarm equals a cold build on the final Team definitions',
  identical(warm, lapply(sources, team_plot_instance_input_ids)) &&
  identical(warm_defaults, lapply(setdiff(names(sources), c('team_cell', 'results_dashboard')), team_plot_instance_input_defaults)))
