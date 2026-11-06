# Ported project_library.R / project_records.R on top of the storage API:
# checkpoint save/resume/recovery, records sidecar, durable queue, and the
# production sign-in policies kept unchanged. No network.
suppressWarnings(suppressPackageStartupMessages(library(shiny)))
for (f in c('storage/storage.R','storage/storage_files.R','storage/storage_database.R','project_records.R','project_library.R'))
  source(file.path('R/frontends/team', f))
expect_error <- function(expr, pattern) {
  msg <- tryCatch({force(expr); NULL}, error=conditionMessage)
  if (is.null(msg) || !grepl(pattern, msg, fixed=TRUE)) stop('Expected error containing: ', pattern, ' got: ', format(msg))
}
Sys.setenv(LIPIDOMIC_PROJECT_LIBRARY='0'); stopifnot(!team_library_enabled())
Sys.setenv(LIPIDOMIC_PROJECT_LIBRARY='1'); stopifnot(team_library_enabled())

# Sign-in throttling is covered by test_team_storage_login_throttle.R.

# Activation keeps verify -> set password -> always revoke, with no secret leakage.
calls <- character()
stub <- function(service, path, token=NULL, body=NULL, method='GET', ...) {
  calls <<- c(calls, path)
  if (path == '/verify') return(list(access_token='temporary-secret', user=list(email='person@example.org')))
  if (path == '/user') stop('SECRET update error')
  invisible(NULL)
}
msg <- tryCatch({team_library_activate(' Person@Example.org ', strrep('a', 64), 'invite', 'long password 123', 'long password 123', call=stub); NULL}, error=conditionMessage)
stopifnot(!is.null(msg), !grepl('SECRET|temporary-secret', msg), identical(calls, c('/verify','/user','/logout?scope=local')))

# Session ZIP + archived records sidecar, saved and resumed through the files backend.
root <- tempfile('team-ckpt-'); store <- team_storage_files(root)
export <- function(path) { d <- tempfile(); dir.create(d); writeLines('{"inputs":{"imputationSeed":42}}', file.path(d,'state.json'))
  zip::zipr(path, 'state.json', root=d); unlink(d, recursive=TRUE) }
run <- list(run=1L,time='2026-10-31 UTC',experiment='QA records fixture',retained=3L,sample_count=4L,threshold=0,scope='cohort',imputation='None',normalization='None',seed=123L)
record <- list(version='1', kind='archived-project-records', created_at='2026-11-03 UTC',
  design=list(unit='Animal', relationship='independent', notes='Synthetic QA design note'), question='overview',
  run_history=list(run), companion_actions=list(list(Time='t',Action='confirm',Parameter='detection',Previous='5',Proposed='0',Status='sent')),
  methods=list(status='not_prepared', lines=list('No preparation has been applied.')), applied_preparation=list(audit=NULL, provenance=NULL), quality_decisions=NULL)
session <- list(userData=new.env())
session$userData$team_project_records_export <- function() record
saved <- team_library_save_checkpoint(store, 'demo-project', 'Reviewed analysis', export,
  attach_records=function(path) team_project_records_attach(path, session))
stopifnot(identical(store$list('demo-project')[[1]]$id, saved$id), identical(saved$name, 'Reviewed analysis.zip'))
imported <- NULL
records <- team_library_resume_checkpoint(store, 'demo-project', saved$id,
  import=function(path) imported <<- sort(zip::zip_list(path)$filename), read_records=TRUE)
stopifnot(identical(imported, sort(c('state.json', team_project_records_member))),
  identical(team_project_records_json(records), team_project_records_json(record)))
# Older checkpoints without the sidecar remain readable.
old <- team_library_save_checkpoint(store, 'demo-project', 'Old style', function(p) { d <- tempfile(); dir.create(d); writeLines('{"legacy":true}', file.path(d,'state.json')); zip::zipr(p, 'state.json', root=d) })
stopifnot(is.null(team_library_resume_checkpoint(store, 'demo-project', old$id, import=function(path) NULL, read_records=TRUE)))
# Invalid records never reach storage.
bad <- record; bad$pending <- list(token='forbidden'); session$userData$team_project_records_export <- function() bad
n <- length(store$list('demo-project'))
expect_error(team_library_save_checkpoint(store, 'demo-project', 'Bad', export, attach_records=function(p) team_project_records_attach(p, session)), 'Invalid project methods/decisions record')
stopifnot(length(store$list('demo-project')) == n)
# Label and size limits.
expect_error(team_library_save_checkpoint(store, 'demo-project', '', export), 'checkpoint name between 1 and 80')
real_limit <- team_library_checkpoint_limit; team_library_checkpoint_limit <- 10
expect_error(team_library_save_checkpoint(store, 'demo-project', 'Too big', export), "exceeds the pilot's 100 MiB limit")
team_library_checkpoint_limit <- real_limit; stopifnot(length(store$list('demo-project')) == n)
expect_error(team_library_save_checkpoint(list(), 'demo-project', 'x', export), 'storage is not ready')

# Durable queue: an interrupted store save stays pending and is recovered later.
queue_root <- tempfile('team-queue-'); Sys.setenv(LIPIDOMIC_UPLOAD_QUEUE=queue_root)
user <- '20000000-0000-4000-8000-000000000001'
failing <- store; failing$save <- function(...) stop('Injected lost connection')
expect_error(team_library_save_checkpoint(failing, 'demo-project', 'Interrupted', function(p) writeBin(charToRaw('interrupted checkpoint bytes'), p), user=user), 'Injected lost connection')
pending <- team_library_queue(user); stopifnot(!is.null(pending), identical(pending$label, 'Interrupted'))
expect_error(team_library_save_checkpoint(store, 'demo-project', 'Blocked', export, user=user), 'A saved checkpoint is pending')
expect_error(team_library_recover_pending(store, user, 'other-project'), 'belongs to another project')
recovered <- team_library_recover_pending(store, user, 'demo-project')
stopifnot(identical(recovered$sha256, pending$sha256), is.null(team_library_queue(user)),
  identical(recovered$name, 'Interrupted.zip'), is.null(team_library_recover_pending(store, user, 'demo-project')))
ok <- team_library_save_checkpoint(store, 'demo-project', 'Queued ok', export, user=user)
stopifnot(is.null(team_library_queue(user)), ok$id %in% vapply(store$list('demo-project'), `[[`, '', 'id'))
# Queue tamper rejection and identity isolation (production test_durable_queue.R).
p <- tempfile(); writeBin(charToRaw('durable test bytes'), p)
x <- team_library_queue(user, list(path=p, project='demo-project', label='Test'))
stopifnot(is.null(team_library_queue('20000000-0000-4000-8000-000000000002')))
expect_error(team_library_queue(user, clear=TRUE, expected='wrong'), 'pending checkpoint changed')
writeBin(charToRaw('changed'), x$path); expect_error(team_library_queue(user), 'integrity check failed')
unlink(c(root, queue_root, p), recursive=TRUE)
cat('PASS: checkpoint save/resume over the storage API with records sidecar, legacy checkpoints, invalid records/labels/size rejected before storage, durable-queue recovery, activation revocation preserved\n')
