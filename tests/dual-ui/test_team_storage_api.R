# Team storage API: backend selection, startup validation and identifier rules.
# No network: nothing here builds a request.
for (f in c('storage.R','storage_files.R','storage_database.R')) source(file.path('R/frontends/team/storage',f))
expect_error <- function(expr, pattern) {
  msg <- tryCatch({force(expr); NULL}, error=conditionMessage)
  if (is.null(msg) || !grepl(pattern, msg, fixed=TRUE)) stop('Expected error containing: ', pattern, ' got: ', format(msg))
}
with_env <- function(values, code) {
  old <- Sys.getenv(names(values), unset=NA, names=TRUE)
  on.exit(for (n in names(old)) if (is.na(old[[n]])) Sys.unsetenv(n) else do.call(Sys.setenv, as.list(old[n])), add=TRUE)
  for (n in names(values)) if (is.na(values[[n]])) Sys.unsetenv(n) else do.call(Sys.setenv, as.list(values[n]))
  force(code)
}
urls <- c(LIPIDOMIC_AUTH_URL=NA, LIPIDOMIC_REST_URL=NA, LIPIDOMIC_STORAGE_URL=NA)

with_env(c(LIPIDOMIC_STORAGE=NA), stopifnot(identical(team_storage_backend(), 'files')))
with_env(c(LIPIDOMIC_STORAGE=''), stopifnot(identical(team_storage_backend(), 'files')))
with_env(c(LIPIDOMIC_STORAGE=' Files '), stopifnot(identical(team_storage_backend(), 'files')))
with_env(c(LIPIDOMIC_STORAGE='DATABASE'), stopifnot(identical(team_storage_backend(), 'database')))
with_env(c(LIPIDOMIC_STORAGE=' DB '), stopifnot(identical(team_storage_backend(), 'database')))
with_env(c(LIPIDOMIC_STORAGE='s3'), expect_error(team_storage_backend(), "LIPIDOMIC_STORAGE must be 'files' (default) or 'database' (alias 'db'); got 's3'"))
expect_error(team_storage_backend(c('files','database')), 'LIPIDOMIC_STORAGE must be')

# Startup validation: invalid value or incomplete database configuration fails.
with_env(c(LIPIDOMIC_STORAGE='postgres'), expect_error(team_storage_validate_config(), 'LIPIDOMIC_STORAGE must be'))
with_env(c(LIPIDOMIC_STORAGE='database', urls), expect_error(team_storage_validate_config(),
  'requires LIPIDOMIC_AUTH_URL, LIPIDOMIC_REST_URL, LIPIDOMIC_STORAGE_URL'))
with_env(c(LIPIDOMIC_STORAGE='database', LIPIDOMIC_AUTH_URL='http://auth.invalid', LIPIDOMIC_REST_URL='http://rest.invalid', LIPIDOMIC_STORAGE_URL=NA),
  expect_error(team_storage_validate_config(), 'requires LIPIDOMIC_STORAGE_URL'))
with_env(c(LIPIDOMIC_STORAGE='database', LIPIDOMIC_AUTH_URL='http://auth.invalid', LIPIDOMIC_REST_URL='http://rest.invalid', LIPIDOMIC_STORAGE_URL='http://storage.invalid'),
  stopifnot(identical(team_storage_validate_config(), 'database')))
# database/db without httr stops at startup (fake requireNamespace).
configured <- c(LIPIDOMIC_AUTH_URL='http://auth.invalid', LIPIDOMIC_REST_URL='http://rest.invalid', LIPIDOMIC_STORAGE_URL='http://storage.invalid')
asked <- character()
no_httr <- function(pkg) { asked <<- c(asked, pkg); !identical(pkg, 'httr') }
for (v in c('database', 'db')) with_env(c(LIPIDOMIC_STORAGE=v, configured),
  expect_error(team_storage_validate_config(has_package=no_httr),
    'LIPIDOMIC_STORAGE=database needs the httr package. Install it or use LIPIDOMIC_STORAGE=files.'))
stopifnot(identical(asked, c('httr','httr')))
with_env(c(LIPIDOMIC_STORAGE='db', configured), stopifnot(identical(team_storage_validate_config(has_package=function(pkg) TRUE), 'database')))
# files never needs httr.
with_env(c(LIPIDOMIC_STORAGE='files', urls, LIPIDOMIC_STORAGE_DIR=tempfile(), LIPIDOMIC_UPLOAD_QUEUE=NA), stopifnot(identical(team_storage_validate_config(has_package=function(pkg) stop('not consulted')), 'files')))
# The durable queue (LIPIDOMIC_UPLOAD_QUEUE, either backend) needs filelock.
no_filelock <- function(pkg) !identical(pkg, 'filelock')
for (v in c('files', 'database')) with_env(c(LIPIDOMIC_STORAGE=v, if (v == 'files') urls else configured, LIPIDOMIC_UPLOAD_QUEUE=tempfile(), LIPIDOMIC_STORAGE_DIR=tempfile()),
  expect_error(team_storage_validate_config(has_package=no_filelock),
    'The Team checkpoint queue (LIPIDOMIC_UPLOAD_QUEUE) needs the filelock package. Install it or unset LIPIDOMIC_UPLOAD_QUEUE.'))
with_env(c(LIPIDOMIC_STORAGE='files', urls, LIPIDOMIC_UPLOAD_QUEUE=NA, LIPIDOMIC_STORAGE_DIR=tempfile()),
  stopifnot(identical(team_storage_validate_config(has_package=no_filelock), 'files')))
with_env(c(LIPIDOMIC_STORAGE='files', urls, LIPIDOMIC_UPLOAD_QUEUE=tempfile(), LIPIDOMIC_STORAGE_DIR=tempfile()),
  stopifnot(identical(team_storage_validate_config(has_package=function(pkg) TRUE), 'files')))
not_dir <- tempfile(); writeLines('x', not_dir)
with_env(c(LIPIDOMIC_STORAGE=NA, LIPIDOMIC_STORAGE_DIR=not_dir), expect_error(team_storage_validate_config(), 'must name a directory'))
missing_dir <- tempfile()
with_env(c(LIPIDOMIC_STORAGE='files', urls, LIPIDOMIC_STORAGE_DIR=missing_dir), {
  stopifnot(identical(team_storage_validate_config(), 'files'), !file.exists(missing_dir)) # no side effects at startup
  stopifnot(identical(team_storage_files_root(), missing_dir))
})
with_env(c(LIPIDOMIC_STORAGE_DIR=NA), stopifnot(grepl('team-projects$', team_storage_files_root())))

# Dispatch: both backends expose the identical four-operation contract.
root <- tempfile('team-storage-api-')
files <- team_storage_open('files', root=root)
db <- team_storage_open('database', token='synthetic-token', call=function(...) stop('no network in tests'))
for (s in list(files, db)) stopifnot(inherits(s, 'team_storage'),
  identical(sort(setdiff(names(s), 'kind')), c('delete','list','load','save')))
stopifnot(identical(files$kind, 'files'), identical(db$kind, 'database'))
expect_error(team_storage_open('ftp'), 'LIPIDOMIC_STORAGE must be')
expect_error(team_storage_database(token=NULL), 'needs a signed-in session')

# Session store: kept in session$userData, never a global.
session <- list(userData=new.env())
s <- team_storage_session(session, backend='files', root=root)
stopifnot(identical(session$userData$team_storage, s), !exists('team_storage', envir=globalenv()))

# Identifiers are validated before any path or URL is built.
bad_projects <- list('../etc', '..', '.', 'a/b', 'a\\b', '', NA_character_, c('a','b'), 1, '-lead', paste(rep('a',65),collapse=''), 'a b', 'proj%2F..')
for (p in bad_projects) {
  expect_error(files$list(p), 'Invalid project')
  expect_error(db$list(p), 'Invalid project')
}
expect_error(db$list('not-a-uuid-but-36-characters-long-xx'), 'Invalid project')
expect_error(db$list('10000000-0000-4000-8000-00000000000G'), 'Invalid project')
for (id in list('../x', 'ABC', paste(rep('g',64),collapse=''), '', NA_character_)) {
  expect_error(files$load('p1', id), 'Invalid checkpoint')
  expect_error(files$delete('p1', id), 'Invalid checkpoint')
  expect_error(db$load('10000000-0000-4000-8000-000000000001', id), 'Invalid checkpoint')
}
zipfile <- tempfile(fileext='.zip'); writeBin(charToRaw('payload'), zipfile)
for (label in list('', '   ', paste(rep('x',81),collapse=''), 'line\nbreak', NA_character_, 3))
  expect_error(files$save('p1', zipfile, label), 'checkpoint name between 1 and 80')
empty <- tempfile(); invisible(file.create(empty))
expect_error(files$save('p1', empty, 'ok'), 'missing or empty')
expect_error(files$save('p1', tempfile(), 'ok'), 'missing or empty')
expect_error(files$save('p1', tempdir(), 'ok'), 'missing or empty')
stopifnot(!dir.exists(root)) # rejected calls created nothing
unlink(c(not_dir, zipfile, empty))
cat('PASS: LIPIDOMIC_STORAGE selection (files default, database/db, httr required for database, filelock required for the queue, invalid fails at startup), identical 4-op contract, session-scoped store, identifier/label validation before I/O\n')
# files (no sign-in) refuses to start when any shared project-library URL is set.
for (u in names(configured)) with_env(c(LIPIDOMIC_STORAGE=NA, urls[names(urls) != u], configured[u], LIPIDOMIC_STORAGE_DIR=tempfile(), LIPIDOMIC_UPLOAD_QUEUE=NA),
  expect_error(team_storage_validate_config(has_package=function(pkg) TRUE),
    paste0('LIPIDOMIC_STORAGE is files (the default, a single local user without sign-in) but the shared project library is configured (', u,
      '). Set LIPIDOMIC_STORAGE=database.')))
with_env(c(LIPIDOMIC_STORAGE='files', configured, LIPIDOMIC_UPLOAD_QUEUE=NA),
  expect_error(team_storage_validate_config(), 'Set LIPIDOMIC_STORAGE=database.'))
cat('PASS files mode refuses shared project-library URLs\n')
