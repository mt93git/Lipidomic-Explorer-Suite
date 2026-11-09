# Classic never sources the Team storage API or the ported persistence files;
# Team loads them and fails at startup on an invalid LIPIDOMIC_STORAGE.
team_only <- c('R/frontends/team/storage/storage.R', 'R/frontends/team/storage/storage_files.R',
  'R/frontends/team/storage/storage_database.R', 'R/frontends/team/project_library.R', 'R/frontends/team/project_records.R')
stopifnot(all(file.exists(team_only)))

# Static: the only bootstrap path is the selected frontend's; no shared file names Team storage.
source('R/frontends/interface.R')
old <- Sys.getenv('LIPIDOMIC_INTERFACE', unset=NA); Sys.unsetenv('LIPIDOMIC_INTERFACE')
classic_bootstrap <- file.path('R', 'frontends', lipidomic_interface(), 'bootstrap.R')
if (!is.na(old)) Sys.setenv(LIPIDOMIC_INTERFACE=old)
stopifnot(identical(classic_bootstrap, 'R/frontends/classic/bootstrap.R'))
if (file.exists(classic_bootstrap)) stopifnot(!any(grepl('storage|project_library|project_records', readLines(classic_bootstrap))))
shared <- setdiff(list.files('R', pattern='[.]R$', recursive=TRUE, full.names=TRUE),
  list.files('R/frontends/team', pattern='[.]R$', recursive=TRUE, full.names=TRUE))
for (f in c(shared, 'app.R')) {
  text <- paste(readLines(f, warn=FALSE), collapse='\n')
  if (grepl('frontends/team/storage|project_library[.]R|project_records[.]R|team_storage_|LIPIDOMIC_STORAGE', text))
    stop('Shared/Classic file references Team storage: ', f)
}
team_boot <- readLines('R/frontends/team/bootstrap.R')
stopifnot(all(vapply(team_only, function(f) any(grepl(f, team_boot, fixed=TRUE)), logical(1))),
  any(grepl('^team_storage_validate_config\\(\\)', team_boot)))

# Dynamic: load the real global.R in fresh processes and record every sourced file.
probe <- tempfile(fileext='.R')
writeLines(c(
  'sourced <- character()',
  'source <- function(file, local = FALSE, ...) { sourced <<- c(sourced, file); if (isTRUE(local)) local <- parent.frame(); base::source(file, local = local, ...) }',
  'source("R/global.R")',
  'team_fns <- c("team_storage_open","team_storage_files","team_storage_database","team_library_commit","team_library_save_checkpoint","team_project_records_read")',
  'cat("TRACKED=", "R/modules/1_shared_data_module.R" %in% sourced, "\n", sep="")',
  'cat("SOURCED_STORAGE=", any(grepl("storage|project_library|project_records", sourced)), "\\n", sep="")',
  'cat("TEAM_FUNCTIONS=", paste(vapply(team_fns, exists, logical(1)), collapse=","), "\\n", sep="")',
  'cat("BACKEND=", if (exists("team_storage_backend")) team_storage_backend() else "none", "\\n", sep="")'), probe)
rscript <- file.path(R.home('bin'), 'Rscript')
run <- function(env) {
  out <- suppressWarnings(system2(rscript, c('--vanilla', shQuote(probe)), stdout=TRUE, stderr=TRUE,
    env=c('R_PROFILE_USER=/dev/null', 'LIPIDOMIC_COMPANION_AI=0', 'LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL=0', env)))
  list(out=out, status=attr(out, 'status'))
}
value <- function(r, key) sub(paste0('^', key, '='), '', grep(paste0('^', key, '='), r$out, value=TRUE))
classic <- run(c('LIPIDOMIC_INTERFACE=classic', 'LIPIDOMIC_STORAGE=database'))
if (!is.null(classic$status)) stop(paste(tail(classic$out, 20), collapse='\n'))
stopifnot(identical(value(classic, 'TRACKED'), 'TRUE'), identical(value(classic, 'SOURCED_STORAGE'), 'FALSE'),
  identical(value(classic, 'TEAM_FUNCTIONS'), paste(rep('FALSE', 6), collapse=',')),
  identical(value(classic, 'BACKEND'), 'none'))
# Classic ignores even an invalid LIPIDOMIC_STORAGE (it never reads it).
classic_bad <- run(c('LIPIDOMIC_INTERFACE=classic', 'LIPIDOMIC_STORAGE=bogus'))
stopifnot(is.null(classic_bad$status), identical(value(classic_bad, 'SOURCED_STORAGE'), 'FALSE'))
team <- run(c('LIPIDOMIC_INTERFACE=team', 'LIPIDOMIC_STORAGE='))
if (!is.null(team$status)) stop(paste(tail(team$out, 20), collapse='\n'))
stopifnot(identical(value(team, 'SOURCED_STORAGE'), 'TRUE'),
  identical(value(team, 'TEAM_FUNCTIONS'), paste(rep('TRUE', 6), collapse=',')),
  identical(value(team, 'BACKEND'), 'files'))
team_bad <- run(c('LIPIDOMIC_INTERFACE=team', 'LIPIDOMIC_STORAGE=bogus'))
stopifnot(!is.null(team_bad$status), team_bad$status != 0L,
  any(grepl("LIPIDOMIC_STORAGE must be 'files' (default) or 'database'", team_bad$out, fixed=TRUE)))
unlink(probe)
cat('PASS: Classic sources no Team storage file and ignores LIPIDOMIC_STORAGE; Team loads the storage API (files default) and stops at startup on an invalid backend\n')
