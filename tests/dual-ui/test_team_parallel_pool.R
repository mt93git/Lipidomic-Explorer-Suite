# W13: Team background R workers return values identical() to serial compute,
# never block or touch the main process (no global future plan, no socket reads,
# launch returns at once), size themselves from host and unit memory, carry
# mandatory thread limits, and leave the main process unchanged when a worker
# fails, hangs or cannot start.
Sys.setenv(LIPIDOMIC_INTERFACE='team', LIPIDOMIC_COMPANION_AI='0', OPENBLAS_NUM_THREADS='2', OMP_NUM_THREADS='2')
suppressMessages(suppressWarnings(source('R/global.R')))
stopifnot(exists("team_parallel_prepare_cards", mode="function"))
check <- function(ok, label) { if (!isTRUE(ok)) stop('FAIL: ', label, call.=FALSE); cat('ok -', label, '\n') }
wait_for <- function(p, timeout = 600) {
  done <- FALSE; value <- NULL; err <- NULL
  promises::then(p, function(v) { value <<- v; done <<- TRUE }, function(e) { err <<- e; done <<- TRUE })
  t0 <- Sys.time()
  while (!done && difftime(Sys.time(), t0, units='secs') < timeout) later::run_now(0.05)
  if (!done) stop('timed out', call.=FALSE)
  if (!is.null(err)) stop(err)
  value
}
logged <- function(expr) { log <- character(); withCallingHandlers(expr, message=function(m) { log <<- c(log, conditionMessage(m)); invokeRestart('muffleMessage') }); log }
reset <- function() { suppressMessages(team_parallel_stop('test reset')); rm(list=ls(team_parallel_state), envir=team_parallel_state) }
run_until <- function(cond, timeout = 600) { t0 <- Sys.time(); while (!cond() && difftime(Sys.time(), t0, units='secs') < timeout) later::run_now(0.1); cond() }
idle <- function() !length(team_parallel_state$jobs)
fill_snapshot <- function() lapply(stats::setNames(nm=unlist(team_parallel_card_functions, use.names=FALSE)), function(fn) { env <- team_parallel_cache_env(fn); mget(sort(ls(env)), envir=env) })
clear_caches <- function() for (fn in unlist(team_parallel_card_functions, use.names=FALSE)) { env <- team_parallel_cache_env(fn); rm(list=ls(env), envir=env) }
alive_pid <- function(p) { st <- tryCatch(readLines(file.path('/proc', p, 'stat'), warn=FALSE), error=function(e) ''); nzchar(st) && !grepl('^[0-9]+ \\(.*\\) Z', st) }

# ---- sizing --------------------------------------------------------------------
Sys.unsetenv(c('LIPIDOMIC_TEAM_R_WORKERS','LIPIDOMIC_TEAM_R_MAX_WORKERS'))
check(identical(team_parallel_workers(available_gb=19, cores=32L, cgroup_gb=NA), 8L), 'default request is 8 workers')
check(identical(team_parallel_workers(available_gb=9, cores=32L, cgroup_gb=NA), 3L), 'host: keeps 6 GB free: (9-6)/0.9 -> 3')
check(identical(team_parallel_workers(available_gb=5, cores=32L, cgroup_gb=NA), 0L), 'host: no workers under the 6 GB reserve')
check(identical(team_parallel_workers(available_gb=19, cores=32L, cgroup_gb=0.8), 0L), 'unit: MemoryMax=3G headroom (0.8 GB) gives no workers')
check(identical(team_parallel_workers(available_gb=19, cores=32L, cgroup_gb=4), 4L), 'unit: 4 GB headroom fits 4 workers')
Sys.setenv(LIPIDOMIC_TEAM_R_WORKERS='12')
check(identical(team_parallel_workers(available_gb=19, cores=32L, cgroup_gb=NA), 12L), 'explicit request of 12 fits (19-6)/0.9 -> 14')
check(identical(team_parallel_workers(available_gb=19, cores=32L, cgroup_gb=2), 2L), 'explicit request is still bounded by the unit memory limit')
check(identical(team_parallel_workers(available_gb=8, cores=32L, cgroup_gb=NA), 2L), 'explicit request is still bounded by host free memory')
Sys.setenv(LIPIDOMIC_TEAM_R_WORKERS='64'); check(identical(team_parallel_workers(200, 32L, NA), 31L), 'explicit request is bounded by cores - 1')
Sys.setenv(LIPIDOMIC_TEAM_R_WORKERS='0'); check(identical(team_parallel_workers(19, 32L, NA), 0L), 'LIPIDOMIC_TEAM_R_WORKERS=0 disables the pool')
check(identical(team_parallel_threads(8L, 32L, main=2L), 2L), 'workers use the main process BLAS thread count by default')
check(identical(team_parallel_threads(31L, 32L, main=2L), 1L), 'workers x threads <= cores')
Sys.setenv(LIPIDOMIC_TEAM_R_WORKER_THREADS='8'); check(identical(team_parallel_threads(8L, 32L, main=2L), 4L), 'explicit threads are capped so workers x threads <= cores')
Sys.unsetenv('LIPIDOMIC_TEAM_R_WORKER_THREADS')
# cgroup v2 reading: the tightest of memory.max / memory.high along the path, minus 1 GB.
fake <- file.path(tempdir(), 'cg'); dir.create(file.path(fake, 'user.slice', 'app.service'), recursive=TRUE)
writeLines('0::/user.slice/app.service', file.path(fake, 'self'))
gb <- 1024^3; put <- function(path, value) writeLines(format(value, scientific=FALSE), file.path(fake, path))
put('user.slice/memory.max', 8*gb); put('user.slice/memory.current', 2*gb)
put('user.slice/app.service/memory.max', 3*gb); writeLines('max', file.path(fake, 'user.slice/app.service/memory.high')); put('user.slice/app.service/memory.current', 1.2*gb)
check(isTRUE(all.equal(team_parallel_cgroup_available_gb(root=fake, self=file.path(fake,'self'), unit_limit_bytes=NA), 3-1.2-1)), 'cgroup headroom: MemoryMax 3G, 1.2 GB used -> 0.8 GB')
put('user.slice/app.service/memory.high', 2.5*gb)
check(isTRUE(all.equal(team_parallel_cgroup_available_gb(root=fake, self=file.path(fake,'self'), unit_limit_bytes=NA), 2.5-1.2-1)), 'cgroup headroom: memory.high below memory.max wins')
# cgroup v1 (RTX: WSL2, v1 memory controller at the user manager): limit_in_bytes, unlimited = 2^63.
dir.create(file.path(fake, 'memory', 'user.slice', 'u.service'), recursive=TRUE)
writeLines(c('5:memory:/user.slice/u.service','0::/'), file.path(fake, 'self1'))
put('memory/memory.limit_in_bytes', 9223372036854771712); put('memory/memory.usage_in_bytes', 20*gb)
put('memory/user.slice/memory.limit_in_bytes', 9223372036854771712); put('memory/user.slice/memory.usage_in_bytes', 10*gb)
put('memory/user.slice/u.service/memory.limit_in_bytes', 4*gb); put('memory/user.slice/u.service/memory.usage_in_bytes', 1*gb)
check(isTRUE(all.equal(team_parallel_cgroup_available_gb(root=fake, self=file.path(fake,'self1'), unit_limit_bytes=NA), 4-1-1)), 'cgroup v1: limit_in_bytes 4G, 1 GB used -> 2 GB')
# Configured but unenforced systemd MemoryMax=6G (RTX today): sized as if enforced.
writeLines('0::/', file.path(fake, 'self2'))
h <- team_parallel_cgroup_available_gb(root=fake, self=file.path(fake,'self2'), unit_limit_bytes=6*gb)
check(h <= 6-1.2-1+1e-9 && h > 3, sprintf('unit MemoryMax=6G: headroom %.2f GB', h))
Sys.unsetenv('LIPIDOMIC_TEAM_R_WORKERS')
check(team_parallel_workers(available_gb=13, cores=32L, cgroup_gb=h) %in% 3:4, sprintf('unit MemoryMax=6G gives %d workers (3-4 expected)', team_parallel_workers(available_gb=13, cores=32L, cgroup_gb=h)))
check(identical(team_parallel_unit_limit_bytes('6G'), 6*gb) && identical(team_parallel_unit_limit_bytes('512m'), 512*1024^2) &&
  identical(team_parallel_unit_limit_bytes('6442450944'), 6442450944) && is.na(team_parallel_unit_limit_bytes('')) && is.na(team_parallel_unit_limit_bytes('lots')),
  'LIPIDOMIC_TEAM_R_MEMORY_MAX parses systemd sizes (no systemctl call)')
check(!any(grepl('systemctl|system2|system\\(', deparse(team_parallel_prepare_cards))) && !any(grepl('systemctl', readLines('R/frontends/team/parallel_pool.R'))), 'no systemctl or shell probe on the main process')
check(is.na(team_parallel_cgroup_available_gb(root=fake, self=file.path(fake,'missing'), unit_limit_bytes=NA)), 'no cgroup information: no limit')

# ---- zero workers: serial, no error, one log line --------------------------------
plan_before <- future::plan()
Sys.setenv(LIPIDOMIC_TEAM_R_WORKERS='0'); reset()
log <- logged(started <- team_parallel_prepare_cards())
check(identical(started, FALSE) && idle(), '0 workers: nothing launched, no error')
check(length(log)==1L && grepl('off, computing serially', log), '0 workers: chosen size logged once')
check(length(logged(team_parallel_prepare_cards()))==0L, 'start is idempotent (no second log line)')

# ---- serial reference: every family -------------------------------------------------
families <- team_parallel_card_families()
t_serial <- system.time(serial <- lapply(stats::setNames(families, families), team_parallel_card_prepare))[['elapsed']]
reference <- fill_snapshot()
n_values <- sum(vapply(serial, function(x) sum(vapply(c(x$family_values, unlist(x$source_values, recursive=FALSE)), function(e) isTRUE(e$ok), logical(1))), integer(1)))

# ---- isolation: a hostile parent environment and Renviron do not reach the workers ----
renv <- tempfile(); writeLines(c('LIPIDOMIC_COMPANION_AI=1', 'LIPIDOMIC_COMPANION_ENV=/tmp/w13-companion.env', 'W13_RENVIRON_TOKEN=leak'), renv)
Sys.setenv(R_ENVIRON_USER=renv, W13_TEST_API_KEY='secret-value')
probe <- function() as.list(Sys.getenv(c('LIPIDOMIC_COMPANION_AI','LIPIDOMIC_COMPANION_ENV','W13_RENVIRON_TOKEN','W13_TEST_API_KEY'), unset='<unset>'))
seen <- do.call(callr::r, c(list(probe, libpath=.libPaths(), env=team_parallel_child_env(2L)), team_parallel_callr_options()))
check(identical(seen$LIPIDOMIC_COMPANION_AI, '0') && identical(seen$LIPIDOMIC_COMPANION_ENV, '') && identical(seen$W13_RENVIRON_TOKEN, '<unset>') && identical(seen$W13_TEST_API_KEY, ''),
  'worker start: user Renviron not read, Companion off, credential variables blank')
fake <- function(res) list(families='barchart', process=list(get_result=function() res))
team_parallel_state$threads <- 2L
good <- list(pid=-1L, blas=2L, env='2', isolated=TRUE, values=list(barchart=serial0 <- list()))
check(is.null(suppressMessages(team_parallel_collect(fake(modifyList(good, list(isolated=FALSE)))))), 'a worker whose isolation check failed is ignored')

# ---- 4 workers requested: launch returns at once; caches identical() to serial ---------
# The pool is bounded by cores - 1 and free memory, so the size and BLAS threads it logs are
# the ones its own rule gives on this host (4 x 2 on RTX; 3 x 1 on a 4-core CI runner).
Sys.setenv(LIPIDOMIC_TEAM_R_WORKERS='4'); reset(); clear_caches()
n_workers <- min(team_parallel_workers(), length(families)); n_threads <- team_parallel_threads(max(1L, n_workers))
check(n_workers >= 2L, sprintf('this host fits at least 2 workers (%d)', n_workers))
t_launch <- system.time(log <- logged(started <- team_parallel_prepare_cards()))[['elapsed']]
check(isTRUE(started) && t_launch < 2, sprintf('launching %d workers returns at once (%.2f s)', n_workers, t_launch))
check(length(log)==1L && grepl(sprintf('%d workers x %d BLAS thread', n_workers, n_threads), log), sprintf('%d workers x %d BLAS thread(s): size and threads logged once', n_workers, n_threads))
pids <- vapply(team_parallel_state$jobs, function(j) j$process$get_pid(), integer(1))
check(length(pids)==n_workers && !any(pids==Sys.getpid()), 'workers are separate processes')
t0 <- Sys.time(); log <- logged(check(run_until(idle), 'all workers finished'))
cat(sprintf('timing: %d families serial %.1f s on the main process; %d background workers %.1f s wall, 0 s main-process compute\n', length(families), t_serial, n_workers, as.numeric(difftime(Sys.time(), t0, units='secs'))+t_launch))
check(any(grepl(sprintf('%d values stored', n_values), log)), sprintf('%d values stored from workers', n_values))
check(n_values > 150L, sprintf('compared %d card preparation values over %d families', n_values, length(families)))
check(identical(fill_snapshot(), reference), 'caches filled from workers are identical() to serial caches (every family)')
check(!any(vapply(pids, alive_pid, logical(1))), 'workers exited')
check(identical(future::plan(), plan_before), 'global future plan untouched (Companion / Scientific Insight keep their backend)')
check(identical(Sys.getenv('OPENBLAS_NUM_THREADS'), '2') && identical(Sys.getenv('LIPIDOMIC_COMPANION_AI'), '0'), 'main process environment untouched')

# ---- a worker that cannot do its work: ignored, main process unchanged ----------------
Sys.setenv(LIPIDOMIC_TEAM_R_WORKERS='2'); reset(); clear_caches()
log <- logged({ team_parallel_prepare_cards(app_dir=file.path(tempdir(), 'no-such-app')); run_until(idle) })
check(any(grepl('failed', log)) && identical(sum(lengths(fill_snapshot())), 0L), 'failed workers store nothing; the main process computes lazily as before')

# ---- a hung worker: killed at the deadline, nothing stored ---------------------------
Sys.setenv(LIPIDOMIC_TEAM_R_WORKERS='2', LIPIDOMIC_TEAM_R_PREFILL_TIMEOUT='2'); reset(); clear_caches()
team_parallel_prepare_cards()
pids <- vapply(team_parallel_state$jobs, function(j) j$process$get_pid(), integer(1))
tools::pskill(pids[[1L]], tools::SIGSTOP)
t0 <- Sys.time(); log <- logged(run_until(idle, 60))
check(idle() && as.numeric(difftime(Sys.time(), t0, units='secs')) < 30 && any(grepl('killed after the deadline', log)), 'stopped (SIGSTOP) worker is killed at the deadline; the main loop never blocked')
Sys.sleep(1); check(!any(vapply(pids, alive_pid, logical(1))), 'no worker process left behind')
Sys.unsetenv('LIPIDOMIC_TEAM_R_PREFILL_TIMEOUT')

# ---- app stop kills running workers -------------------------------------------------
Sys.setenv(LIPIDOMIC_TEAM_R_WORKERS='2'); reset()
team_parallel_prepare_cards(); pids <- vapply(team_parallel_state$jobs, function(j) j$process$get_pid(), integer(1))
check(identical(suppressMessages(team_parallel_stop('test')), 2L), 'stop kills running workers')
Sys.sleep(1); check(!any(vapply(pids, alive_pid, logical(1))), 'killed workers are gone')

# ---- LAPACK identity at the worker thread count ------------------------------------
set.seed(7); m <- matrix(rlnorm(2000*96), 2000)
pc_main <- stats::prcomp(t(log2(m+1)), scale.=TRUE)
pc_child <- callr::r(function(m) stats::prcomp(t(log2(m+1)), scale.=TRUE), args=list(m), libpath=.libPaths(), env=team_parallel_child_env(n_threads))
check(identical(pc_child, pc_main), sprintf('prcomp in a worker environment (%d BLAS threads) is identical() to the main process', n_threads))
Sys.unsetenv(c('R_ENVIRON_USER','W13_TEST_API_KEY'))
check(identical(future::plan(), plan_before), 'global future plan still untouched')
cat('PASS test_team_parallel_pool\n')
