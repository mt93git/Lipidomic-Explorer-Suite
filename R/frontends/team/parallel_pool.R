# Team R worker processes (W13). The Shiny process runs every reactive on one
# core. The work Team ships elsewhere is *pure* -- plain data in, plain data out
# -- and runs in separate background Rscript processes (callr::r_bg). Reactive
# state never leaves the main process.
#
# Robustness contract: the main process never waits on a worker. Launching a
# background R process returns at once. The main process polls it with later(),
# asking only whether it is still alive. It reads a worker's result, a complete
# file written by callr once the process has exited, only after the process has
# finished. A worker that fails, hangs past its deadline or cannot be launched
# is killed or ignored. Nothing then changes on the main process, which computes
# lazily as before. The global future plan is never touched.
#
# Each worker sources the same R/global.R as the main process, with installs,
# the Companion and every credential variable disabled. The functions it runs
# are therefore the main process's own, and its values are identical() to
# serial compute (tests/dual-ui/test_team_parallel_pool.R).
#
# Environment:
#   LIPIDOMIC_TEAM_R_WORKERS         requested workers; 0 disables them;
#                                    unset = LIPIDOMIC_TEAM_R_MAX_WORKERS (8).
#                                    Always bounded by memory and cores (below).
#   LIPIDOMIC_TEAM_R_WORKER_GB       measured RSS budget per worker (default 0.9).
#   LIPIDOMIC_TEAM_R_RESERVE_GB      host memory kept free (default 6).
#   LIPIDOMIC_TEAM_R_MAX_WORKERS     default request (default 8).
#   LIPIDOMIC_TEAM_R_WORKER_THREADS  BLAS/OpenMP threads per worker (default:
#                                    the main process's BLAS threads, so LAPACK
#                                    results match it); capped at cores/workers.
#   LIPIDOMIC_TEAM_R_MEMORY_MAX      the unit's configured memory limit (e.g. 6G),
#                                    for hosts where the cgroup does not show it.
#   LIPIDOMIC_TEAM_R_PREFILL_TIMEOUT seconds before unfinished workers are killed
#                                    (default 300).
team_parallel_state <- new.env(parent=emptyenv())

team_parallel_int_env <- function(name, default) {
  value <- suppressWarnings(as.integer(Sys.getenv(name, "")))
  if (length(value)!=1L || is.na(value)) default else value
}
team_parallel_num_env <- function(name, default) {
  value <- suppressWarnings(as.numeric(Sys.getenv(name, "")))
  if (length(value)!=1L || is.na(value) || value<0) default else value
}
team_parallel_mem_available_gb <- function() {
  info <- tryCatch(readLines('/proc/meminfo',warn=FALSE),error=function(e)character())
  line <- grep('^MemAvailable:',info,value=TRUE)
  if (!length(line)) return(NA_real_)
  as.numeric(gsub('[^0-9]','',line[[1L]]))/1024^2
}
# Headroom under the unit's memory limit, minus 1 GB for the main process to
# grow; NA when no limit applies. Three sources, the tightest wins:
#  - cgroup v2: memory.max / memory.high of this cgroup and its ancestors, less
#    memory.current;
#  - cgroup v1 (RTX is WSL2 with a v1 memory controller): memory.limit_in_bytes
#    of the memory-controller path and its ancestors, less memory.usage_in_bytes;
#  - the unit's configured limit, given as LIPIDOMIC_TEAM_R_MEMORY_MAX (the
#    drop-in sets it next to MemoryMax), less this process's RSS (at least 1.2 GB,
#    a loaded project). On RTX the user units have no memory cgroup of their own,
#    so MemoryMax is configured but not enforced; the workers still size
#    themselves to it, as the operator intended. Only files and the environment
#    are read here: nothing that could block the main process.
team_parallel_cgroup_available_gb <- function(root = '/sys/fs/cgroup', self = '/proc/self/cgroup', unit_limit_bytes = team_parallel_unit_limit_bytes()) {
  lines <- tryCatch(readLines(self,warn=FALSE),error=function(e)character())
  num <- function(d, f) { v <- tryCatch(readLines(file.path(d,f),warn=FALSE)[[1L]],error=function(e)NA_character_); v <- if (is.na(v) || identical(v,'max')) NA_real_ else suppressWarnings(as.numeric(v)); if (!is.na(v) && v >= 2^60) NA_real_ else v }
  ancestors <- function(base, path) { parts <- Filter(nzchar, strsplit(path,'/',fixed=TRUE)[[1L]]); c(base, vapply(seq_along(parts), function(i) paste(c(base, parts[seq_len(i)]), collapse='/'), character(1))) }
  headroom <- function(dirs, limit_files, usage_file) vapply(dirs, function(d) {
    limits <- vapply(limit_files, function(f) num(d,f), numeric(1)); cur <- num(d, usage_file)
    if (all(is.na(limits)) || is.na(cur)) NA_real_ else (min(limits, na.rm=TRUE)-cur)/1024^3
  }, numeric(1))
  out <- numeric()
  v2 <- sub('^0::','',grep('^0::',lines,value=TRUE))
  if (length(v2)==1L) out <- c(out, headroom(ancestors(root, v2), c('memory.max','memory.high'), 'memory.current'))
  v1 <- sub('^[0-9]+:([^:]*,)?memory(,[^:]*)?:','',grep('^[0-9]+:([^:]*,)?memory(,[^:]*)?:',lines,value=TRUE))
  if (length(v1)==1L) out <- c(out, headroom(ancestors(file.path(root,'memory'), v1), 'memory.limit_in_bytes', 'memory.usage_in_bytes'))
  if (length(unit_limit_bytes)==1L && !is.na(unit_limit_bytes)) {
    rss <- tryCatch(as.numeric(sub('[^0-9]*([0-9]+).*','\\1',grep('^VmRSS:',readLines('/proc/self/status'),value=TRUE)))*1024, error=function(e) NA_real_)
    out <- c(out, (unit_limit_bytes-max(rss, 1.2*1024^3, na.rm=TRUE))/1024^3)
  }
  out <- out[!is.na(out)]
  if (!length(out)) NA_real_ else min(out)-1
}
# LIPIDOMIC_TEAM_R_MEMORY_MAX: bytes, or a number with a K/M/G/T suffix
# (systemd style, base 1024). NA when unset or invalid.
team_parallel_unit_limit_bytes <- function(value = Sys.getenv('LIPIDOMIC_TEAM_R_MEMORY_MAX', '')) {
  value <- toupper(value)
  m <- regmatches(value, regexec('^\\s*([0-9]+(\\.[0-9]+)?)\\s*([KMGT]?)B?\\s*$', value))[[1L]]
  if (!length(m)) return(NA_real_)
  as.numeric(m[[2L]]) * 1024^(match(m[[4L]], c('', 'K', 'M', 'G', 'T'))-1L)
}
team_parallel_cores <- function() {
  n <- tryCatch(parallel::detectCores(), error=function(e) NA_integer_)
  if (length(n)!=1L || is.na(n) || n<1L) 1L else as.integer(n)
}
# Pool size: the request (LIPIDOMIC_TEAM_R_WORKERS, else the default maximum),
# bounded by what fits at the per-worker RSS budget both in host free memory
# above the reserve and in the unit's own memory limit, by cores - 1, and by
# cores / BLAS threads per worker, so every worker keeps the main process's
# thread count (see team_parallel_threads: LAPACK results depend on it).
team_parallel_workers <- function(available_gb = team_parallel_mem_available_gb(), cores = team_parallel_cores(), cgroup_gb = team_parallel_cgroup_available_gb(), main = team_parallel_main_blas_threads()) {
  requested <- team_parallel_int_env('LIPIDOMIC_TEAM_R_WORKERS', team_parallel_int_env('LIPIDOMIC_TEAM_R_MAX_WORKERS', 8L))
  if (requested<=0L || is.na(available_gb)) return(0L)
  per <- team_parallel_num_env('LIPIDOMIC_TEAM_R_WORKER_GB', 0.9)
  if (per<=0) return(0L)
  fit <- floor((available_gb-team_parallel_num_env('LIPIDOMIC_TEAM_R_RESERVE_GB', 6))/per)
  if (!is.na(cgroup_gb)) fit <- min(fit, floor(cgroup_gb/per))
  per_threads <- max(1L, team_parallel_int_env('LIPIDOMIC_TEAM_R_WORKER_THREADS', main))
  as.integer(max(0L, min(requested, fit, cores-1L, max(1L, cores %/% per_threads))))
}
# BLAS threads per worker. LAPACK results such as prcomp() change in their last
# bits with the thread count (measured on RTX: 2000x96 at 8 threads, 8000x400
# already at 2), so by default a worker uses the main process's count (the Team
# service sets OPENBLAS_NUM_THREADS=2). More BLAS threads gave no speed-up on
# these sizes; the pool adds processes, not threads.
team_parallel_main_blas_threads <- function() {
  n <- if (requireNamespace('RhpcBLASctl', quietly=TRUE)) tryCatch(RhpcBLASctl::blas_get_num_procs(), error=function(e) NA_integer_) else NA_integer_
  if (length(n)!=1L || is.na(n) || n<1L) n <- suppressWarnings(as.integer(Sys.getenv('OPENBLAS_NUM_THREADS', '1')))
  if (length(n)!=1L || is.na(n) || n<1L) 1L else as.integer(n)
}
team_parallel_threads <- function(workers, cores = team_parallel_cores(), main = team_parallel_main_blas_threads()) {
  wanted <- max(1L, team_parallel_int_env('LIPIDOMIC_TEAM_R_WORKER_THREADS', main))
  as.integer(max(1L, min(wanted, floor(cores/max(1L, workers)))))
}
# ---- worker side -------------------------------------------------------------
# Runs in a fresh background Rscript (callr::r_bg): the function is shipped
# without its environment and finds the application in its own global env.
# Thread limits are set in the process environment before R starts (OpenBLAS
# and OpenMP read them at load) and again here; the worker reports the result.
team_parallel_prefill_child <- function(app_dir, families, threads, parent_pid) {
  if (Sys.getpid()==parent_pid) stop('worker code reached the main process')
  secret <- grep('KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL', names(Sys.getenv()), value=TRUE, ignore.case=TRUE)
  if (length(secret)) Sys.unsetenv(secret)
  Sys.setenv(LIPIDOMIC_TEAM_R_WORKER='1', LIPIDOMIC_COMPANION_AI='0', LIPIDOMIC_COMPANION_ENV='', LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL='0')
  if (requireNamespace('RhpcBLASctl', quietly=TRUE)) { RhpcBLASctl::blas_set_num_threads(threads); RhpcBLASctl::omp_set_num_threads(threads) }
  setwd(app_dir)
  utils::capture.output(suppressMessages(suppressWarnings(source('R/global.R', local=globalenv()))))
  # Asserted after the application loaded: no credential variable has a value,
  # and the Companion is off (global.R must not have re-read its environment).
  named <- grep('KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL', names(Sys.getenv()), value=TRUE, ignore.case=TRUE)
  values <- if (length(named)) Sys.getenv(named) else character()  # Sys.getenv(character()) would return everything
  available <- get0('companion_ai_available', envir=globalenv(), mode='function')
  isolated <- !any(nzchar(values)) && identical(Sys.getenv('LIPIDOMIC_COMPANION_AI'), '0') && !nzchar(Sys.getenv('LIPIDOMIC_COMPANION_ENV')) &&
    !isTRUE(tryCatch(if (is.function(available)) available() else FALSE, error=function(e) FALSE))
  if (!isolated) stop('worker isolation check failed: a credential variable is set or the Companion is on')
  if (requireNamespace('data.table', quietly=TRUE)) data.table::setDTthreads(threads)
  blas <- if (requireNamespace('RhpcBLASctl', quietly=TRUE)) as.integer(RhpcBLASctl::blas_get_num_procs()) else NA_integer_
  prepare <- get('team_parallel_card_prepare', envir=globalenv(), mode='function')
  list(pid=Sys.getpid(), blas=blas, env=Sys.getenv('OPENBLAS_NUM_THREADS'), isolated=isolated, values=lapply(stats::setNames(families, families), prepare))
}

# ---- main side ---------------------------------------------------------------
team_parallel_log <- function(...) message('[TEAM] R workers: ', sprintf(...))
# The environment a worker starts with: thread limits, the Companion and
# dependency installs off, and every credential variable blanked.
team_parallel_child_env <- function(threads) {
  secret <- grep('KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL', names(Sys.getenv()), value=TRUE, ignore.case=TRUE)
  c(stats::setNames(rep('', length(secret)), secret),
    OPENBLAS_NUM_THREADS=as.character(threads), OMP_NUM_THREADS=as.character(threads), MKL_NUM_THREADS=as.character(threads),
    LIPIDOMIC_TEAM_R_WORKER='1', LIPIDOMIC_COMPANION_AI='0', LIPIDOMIC_COMPANION_ENV='', LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL='0',
    # No environment file may put anything back: callr would otherwise copy the
    # site and user Renviron into the worker (callr setup_context).
    R_ENVIRON='/dev/null', R_ENVIRON_USER='/dev/null')
}
# callr options for a worker: --no-environ, and neither the site nor the user
# R profile (callr then starts R with only its own generated profile, which sets
# the library path and its result handling).
team_parallel_callr_options <- function() list(cmdargs=c('--slave','--no-save','--no-restore','--no-environ'), user_profile=FALSE, system_profile=FALSE)

# Compute every card family's preparation in background workers and store it in
# the main process's caches when each worker finishes. Returns at once.
team_parallel_prepare_cards <- function(app_dir = getwd()) {
  st <- team_parallel_state
  if (!is.null(st$started)) return(invisible(isTRUE(st$started)))
  st$started <- FALSE
  if (nzchar(Sys.getenv('LIPIDOMIC_TEAM_R_WORKER',''))) return(invisible(FALSE))
  families <- team_parallel_card_families()
  requested <- team_parallel_int_env('LIPIDOMIC_TEAM_R_WORKERS', team_parallel_int_env('LIPIDOMIC_TEAM_R_MAX_WORKERS', 8L))
  if (requested<=0L) { team_parallel_log('off, computing serially (LIPIDOMIC_TEAM_R_WORKERS=0)'); return(invisible(FALSE)) }
  # Probed once; the same values size the workers and go to the log.
  mem <- team_parallel_mem_available_gb(); cg <- team_parallel_cgroup_available_gb(); cores <- team_parallel_cores()
  workers <- min(team_parallel_workers(mem, cores, cg), length(families))
  threads <- team_parallel_threads(max(1L, workers), cores)
  why <- sprintf('requested=%d, MemAvailable=%.1f GB, unit headroom=%s GB, cores=%d', requested, mem, format(round(cg,1)), cores)
  if (workers<1L || !requireNamespace('callr',quietly=TRUE) || !requireNamespace('later',quietly=TRUE)) {
    team_parallel_log('off, computing serially (%s)', why); return(invisible(FALSE))
  }
  groups <- unname(split(families, rep_len(seq_len(workers), length(families))))
  env <- team_parallel_child_env(threads)
  args <- function(g) list(normalizePath(app_dir), g, threads, Sys.getpid())
  st$jobs <- lapply(groups, function(g) list(families=g, process=tryCatch(
    do.call(callr::r_bg, c(list(team_parallel_prefill_child, args=args(g), libpath=.libPaths(), env=env, stdout=NULL, stderr=NULL, supervise=TRUE), team_parallel_callr_options())),
    error=function(e) { team_parallel_log('a worker could not be launched (%s); its cards compute serially', conditionMessage(e)); NULL })))
  launched <- sum(!vapply(st$jobs, function(j) is.null(j$process), logical(1)))
  if (!launched) { team_parallel_log('off, computing serially (no worker could be launched; %s)', why); return(invisible(FALSE)) }
  st$started <- TRUE; st$threads <- threads; st$t0 <- Sys.time(); st$stored <- 0L
  st$deadline <- st$t0 + team_parallel_num_env('LIPIDOMIC_TEAM_R_PREFILL_TIMEOUT', 300)
  if (isTRUE(tryCatch(shiny::isRunning(),error=function(e)FALSE))) tryCatch(shiny::onStop(function() team_parallel_stop('app stopped')), error=function(e) NULL)
  team_parallel_log('%d workers x %d BLAS thread(s) for %d card families (%s)', launched, threads, length(families), why)
  later::later(team_parallel_poll, 0.25)
  invisible(TRUE)
}
# A finished worker's result, checked; NULL when it must not be used.
team_parallel_collect <- function(job) {
  res <- tryCatch(job$process$get_result(), error=function(e) e)
  if (inherits(res,'error')) { team_parallel_log('worker for %s failed (%s)', paste(job$families, collapse=','), conditionMessage(res)); return(NULL) }
  ok <- is.list(res) && !identical(res$pid, Sys.getpid()) && is.list(res$values) && identical(sort(names(res$values)), sort(job$families)) &&
    (is.na(res$blas) || identical(res$blas, as.integer(team_parallel_state$threads))) && identical(res$env, as.character(team_parallel_state$threads)) && isTRUE(res$isolated)
  if (!ok) { team_parallel_log('worker for %s ignored (process or thread check failed)', paste(job$families, collapse=',')); return(NULL) }
  res
}
team_parallel_poll <- function() {
  st <- team_parallel_state
  if (!length(st$jobs)) return(invisible())
  late <- Sys.time() > st$deadline
  for (i in seq_along(st$jobs)) {
    job <- st$jobs[[i]]
    if (is.null(job$process) || isTRUE(job$done)) next
    alive <- tryCatch(job$process$is_alive(), error=function(e) FALSE)
    if (alive && !late) next
    if (alive) { tryCatch(job$process$kill(), error=function(e) NULL); team_parallel_log('worker for %s killed after the deadline', paste(job$families, collapse=',')) }
    else { res <- team_parallel_collect(job); if (!is.null(res)) for (v in res$values) st$stored <- st$stored + team_parallel_card_store(v) }
    st$jobs[[i]]$done <- TRUE
  }
  if (all(vapply(st$jobs, function(j) is.null(j$process) || isTRUE(j$done), logical(1)))) {
    team_parallel_log('card preparation: %d values stored in %.1f s; workers exited', st$stored, as.numeric(difftime(Sys.time(), st$t0, units='secs')))
    st$jobs <- list()
  } else later::later(team_parallel_poll, 0.25)
  invisible()
}
# Kill any worker still running (app stop). Nothing is stored afterwards.
team_parallel_stop <- function(reason = 'stopped') {
  st <- team_parallel_state
  running <- Filter(function(j) !is.null(j$process) && !isTRUE(j$done), st$jobs)
  for (j in running) tryCatch(j$process$kill(), error=function(e) NULL)
  st$jobs <- list()
  if (length(running)) team_parallel_log('killed %d running worker(s) (%s)', length(running), reason)
  invisible(length(running))
}

# ---- Canvas card preparation -------------------------------------------------
# Creating a canvas card first reads its module's source and UI markup
# (plot_instances.R: layout, input providers, input ids, defaults, unhosted ids,
# renderUI wrappers). These are pure functions of the card's family and source
# files, memoised per process, and cost 0.2-2 s each on first use -- about 12 s
# of the main process when a 16-card canvas opens on a fresh process. Workers
# compute every family in parallel as soon as the app starts; the main process
# stores each value only where its own cache has none (the value is the same:
# tests/dual-ui/test_team_parallel_pool.R compares every family).
# Cache keys: input ids are memoised per family although asked for by source.
team_parallel_card_functions <- list(
  family = c('team_plot_instance_input_defaults','team_plot_instance_unhosted_ids','team_plot_instance_wrappers'),
  source = c('team_plot_instance_layout','team_plot_instance_input_providers'),
  family_by_source = 'team_plot_instance_input_ids'
)
team_parallel_card_sources <- function(family) {
  if (identical(family,'team_cell')) return(team_cell_instance_outputs)
  paste0(family,'-',team_plot_instance_families[[family]]$outputs)
}
team_parallel_card_families <- function() c(names(team_plot_instance_families),'team_cell')
# Worker side: every value of one family that computes without error.
team_parallel_card_prepare <- function(family) {
  value_of <- function(fn, key) tryCatch(list(ok=TRUE, value=get(fn, mode='function')(key)), error=function(e) list(ok=FALSE))
  sources <- team_parallel_card_sources(family)
  fam <- if (identical(family,'team_cell')) list() else
    stats::setNames(lapply(team_parallel_card_functions$family, value_of, key=family), team_parallel_card_functions$family)
  for (fn in team_parallel_card_functions$family_by_source) fam[[fn]] <- value_of(fn, sources[[1L]])
  src <- stats::setNames(lapply(sources, function(s) stats::setNames(lapply(team_parallel_card_functions$source, value_of, key=s), team_parallel_card_functions$source)), sources)
  list(family=family, family_values=fam, source_values=src)
}
team_parallel_cache_env <- function(fn) {
  f <- get0(fn, envir=globalenv(), mode='function')
  env <- if (is.function(f)) environment(f)$cache else NULL
  if (is.environment(env)) env else NULL
}
team_parallel_card_store <- function(prepared) {
  stored <- 0L
  put <- function(fn, key, entry) {
    env <- team_parallel_cache_env(fn)
    if (is.null(env) || !isTRUE(entry$ok) || exists(key, env, inherits=FALSE)) return()
    assign(key, entry$value, env); stored <<- stored+1L
  }
  for (fn in names(prepared$family_values)) put(fn, prepared$family, prepared$family_values[[fn]])
  for (s in names(prepared$source_values)) for (fn in names(prepared$source_values[[s]])) put(fn, s, prepared$source_values[[s]][[fn]])
  invisible(stored)
}
# Start once the app is running (later() callbacks run only inside the event
# loop), and only for the Team interface. This is the one callback that sourcing
# the app leaves on the later loop; team_parallel_boot_timer holds its cancel
# function (NULL when nothing was scheduled), so scripts that source the app
# without running it can cancel it.
team_parallel_boot_timer <- if (!nzchar(Sys.getenv('LIPIDOMIC_TEAM_R_WORKER','')) && requireNamespace('later', quietly=TRUE))
  later::later(function() {
    if (!isTRUE(tryCatch(shiny::isRunning(),error=function(e)FALSE))) return()
    if (!identical(tryCatch(lipidomic_interface(),error=function(e)''),'team')) return()
    tryCatch(team_parallel_prepare_cards(), error=function(e) message('[TEAM] card preparation not started: ',conditionMessage(e)))
  }, 0.5)
