# Database backend over an injected in-memory fake of the production Supabase
# endpoints. No network: team_library_call is never reached.
for (f in c('storage.R','storage_database.R')) source(file.path('R/frontends/team/storage',f))
expect_error <- function(expr, pattern) {
  msg <- tryCatch({force(expr); NULL}, error=conditionMessage)
  if (is.null(msg) || !grepl(pattern, msg, fixed=TRUE)) stop('Expected error containing: ', pattern, ' got: ', format(msg))
}
project <- '10000000-0000-4000-8000-000000000001'
other <- '10000000-0000-4000-8000-000000000002'

fake_supabase <- function(valid_tokens) {
  db <- new.env(); db$rows <- list(); db$objects <- list(); db$log <- list(); db$n <- 0L; db$faults <- character()
  parse_query <- function(path) {
    q <- sub('^[^?]*\\??', '', path); if (!nzchar(q)) return(list())
    parts <- strsplit(strsplit(q, '&', fixed=TRUE)[[1]], '=', fixed=TRUE)
    setNames(lapply(parts, function(x) paste(x[-1], collapse='=')), vapply(parts, `[[`, '', 1L))
  }
  match_rows <- function(q) Filter(function(r) all(vapply(setdiff(names(q), 'order'), function(k)
    identical(paste0('eq.', r[[k]]), q[[k]]), logical(1))), db$rows)
  fire <- function(name) if (name %in% db$faults) { db$faults <- setdiff(db$faults, name); TRUE } else FALSE
  db$call <- function(service, path, token=NULL, body=NULL, method='GET', raw=FALSE) {
    db$log[[length(db$log)+1L]] <- list(service=service, path=path, token=token, method=method)
    if (is.null(token) || !token %in% valid_tokens) stop('Request denied or service unavailable.')
    if (service == 'rest' && startsWith(path, '/pilot_files')) {
      q <- parse_query(path)
      if (method == 'GET') {
        rows <- match_rows(q)
        if (identical(q$order, 'created_at.desc') && length(rows))
          rows <- rows[order(vapply(rows, `[[`, '', 'created_at'), decreasing=TRUE)]
        return(rows)
      }
      if (method == 'POST') {
        if (fire('before_catalog')) stop('Injected lost connection')
        if (length(match_rows(list(project_id=paste0('eq.',body$project_id), sha256=paste0('eq.',body$sha256))))) stop('duplicate')
        db$n <- db$n + 1L
        row <- c(list(id=sprintf('30000000-0000-4000-8000-%012d', db$n)), body,
          list(created_at=sprintf('2026-11-03T10:00:%02dZ', db$n)))
        db$rows[[length(db$rows)+1L]] <- row
        if (fire('after_catalog')) stop('Injected lost response')
        return(NULL)
      }
      if (method == 'DELETE') {
        if ('deny_delete' %in% db$faults) stop('Request denied or service unavailable.')
        doomed <- match_rows(q)
        db$rows <- Filter(function(r) !any(vapply(doomed, identical, logical(1), r)), db$rows); return(NULL)
      }
    }
    if (service == 'storage') {
      if (method == 'GET' && startsWith(path, '/object/authenticated/case-files/')) {
        key <- sub('^/object/authenticated/case-files/', '', path)
        if (is.null(db$objects[[key]])) stop('not found'); stopifnot(isTRUE(raw)); return(db$objects[[key]])
      }
      key <- sub('^/object/case-files/', '', path)
      if (method == 'POST') {
        if (fire('before_upload')) stop('Injected lost connection')
        if (!is.null(db$objects[[key]])) stop('exists')
        stopifnot(is.raw(body)); db$objects[[key]] <- body
        if (fire('after_upload')) stop('Injected lost response')
        return(NULL)
      }
      if (method == 'DELETE') { db$objects[[key]] <- NULL; return(NULL) }
    }
    stop('Unexpected fake request: ', service, ' ', method, ' ', path)
  }
  db
}
make_zip <- function(text) { p <- tempfile(fileext='.zip'); writeBin(charToRaw(text), p); p }

# Tokens are read per operation from the session-owned function (refresh-aware).
fake <- fake_supabase(c('token-v1','token-v2'))
current <- 'token-v1'
store <- team_storage_database(token=function() current, call=fake$call)
a <- make_zip('checkpoint A bytes'); b <- make_zip('checkpoint B bytes')
stopifnot(identical(store$list(project), list()))
r1 <- store$save(project, a, 'First')
hash <- digest::digest(file=a, algo='sha256')
stopifnot(identical(r1$sha256, hash), identical(r1$name, 'First.zip'), identical(r1$project, project),
  grepl(team_storage_uuid_pattern, r1$id), identical(fake$objects[[paste0(project,'/',hash)]], readBin(a,'raw',n=1e6)))
current <- 'token-v2'
r2 <- store$save(project, b, 'Second')
stopifnot(identical(fake$log[[length(fake$log)]]$token, 'token-v2'))
# Idempotent commit: same bytes produce no second row or upload.
uploads <- function() sum(vapply(fake$log, function(x) x$service=='storage' && x$method=='POST', logical(1)))
before <- uploads(); again <- store$save(project, a, 'Duplicate')
stopifnot(identical(again$id, r1$id), length(fake$rows) == 2L, uploads() == before)
listed <- store$list(project)
stopifnot(length(listed) == 2L, identical(listed[[1]]$id, r2$id), identical(listed[[2]]$id, r1$id))

# Load: verified copy; integrity failure when stored bytes differ.
out <- store$load(project, r1$id)
stopifnot(identical(digest::digest(file=out, algo='sha256'), hash))
fake$objects[[paste0(project,'/',hash)]] <- charToRaw('corrupted')
target <- tempfile(fileext='.zip')
expect_error(store$load(project, r1$id, target), 'Checkpoint integrity check failed'); stopifnot(!file.exists(target))
expect_error(store$save(project, a, 'Retry'), 'Stored checkpoint integrity check failed')
fake$objects[[paste0(project,'/',hash)]] <- readBin(a, 'raw', n=1e6)
# Project isolation and malformed rows.
expect_error(store$load(other, r1$id), 'Checkpoint not found')
fake$rows[[1]]$object_path <- paste0(other, '/', hash)
expect_error(store$load(project, r1$id), 'Invalid checkpoint path')
stopifnot(length(store$list(project)) == 1L)
fake$rows[[1]]$object_path <- paste0(project, '/', hash)

# Production interruption scenarios (pilot/supabase/test_interrupted.R) with injected faults.
for (stage in c('before_upload','after_upload','before_catalog','after_catalog')) {
  p <- make_zip(paste('fault', stage)); fake$faults <- stage
  first <- tryCatch({store$save(project, p, paste('Fault', stage)); TRUE}, error=function(e) FALSE)
  stopifnot(identical(first, startsWith(stage, 'after')), !stage %in% fake$faults)
  rec <- store$save(project, p, paste('Fault', stage)); store$save(project, p, paste('Fault', stage))
  h <- digest::digest(file=p, algo='sha256')
  stopifnot(identical(rec$sha256, h), sum(vapply(fake$rows, function(r) identical(r$sha256, h), logical(1))) == 1L)
  unlink(p)
}

# Delete: row first, then object; denied deletes (production schema) surface clearly.
n <- length(fake$rows)
fake$faults <- 'deny_delete'
expect_error(store$delete(project, r2$id), 'Request denied'); stopifnot(length(fake$rows) == n)
fake$faults <- character()
store$delete(project, r2$id)
stopifnot(length(fake$rows) == n - 1L, is.null(fake$objects[[paste0(project,'/',r2$sha256)]]))
expect_error(store$load(project, r2$id), 'Checkpoint not found')
expect_error(store$delete(project, r2$id), 'Checkpoint not found')
# Re-saving deleted bytes works again (orphan-safe commit).
stopifnot(identical(store$save(project, b, 'Back')$sha256, r2$sha256))

# A server whose reads ignore the id filter (as the test mock library does)
# still resolves exactly the requested checkpoint for load and delete.
loose_call <- function(service, path, token=NULL, body=NULL, method='GET', raw=FALSE)
  fake$call(service, if (method == 'GET') sub('&id=eq\\.[^&]*', '', path) else path, token, body, method, raw)
loose <- team_storage_database(token=function() 'token-v1', call=loose_call)
stopifnot(length(fake$rows) > 1L)
first <- fake$rows[[1]]
stopifnot(identical(digest::digest(file=loose$load(project, first$id), algo='sha256'), first$sha256))
expect_error(loose$load(project, '30000000-0000-4000-8000-999999999999'), 'Checkpoint not found')
n <- length(fake$rows); loose$delete(project, first$id); stopifnot(length(fake$rows) == n - 1L)

# Tokens: never global, never shared between session stores, required per call.
fake2 <- fake_supabase('other-session-token')
s1 <- team_storage_database(token=function() 'token-v1', call=fake$call)
s2 <- team_storage_database(token=function() 'other-session-token', call=fake2$call)
invisible(s1$list(project)); invisible(s2$list(project))
stopifnot(all(vapply(fake2$log, function(x) identical(x$token, 'other-session-token'), logical(1))))
expect_error(team_storage_database(token=function() 'other-session-token', call=fake$call)$list(project), 'Request denied')
expect_error(team_storage_database(token=function() NULL, call=fake$call)$list(project), 'Sign in first')
expect_error(team_storage_database(token=function() '', call=fake$call)$list(project), 'Sign in first')
globals <- unlist(eapply(globalenv(), function(x) if (is.character(x)) x else NULL))
stopifnot(!any(c('token-v1','token-v2','other-session-token') %in% globals[!names(globals) %in% 'current']))
for (s in list(store, s1, s2)) stopifnot(!any(vapply(s, is.character, logical(1)) & names(s) != 'kind'))

# Production transport refuses to run unconfigured (fails before any request).
old <- Sys.getenv('LIPIDOMIC_REST_URL', unset=NA); Sys.unsetenv('LIPIDOMIC_REST_URL')
expect_error(team_library_call('rest', '/pilot_files', 'x'), 'Project library is not configured')
if (!is.na(old)) Sys.setenv(LIPIDOMIC_REST_URL=old)
text <- paste(readLines('R/frontends/team/storage/storage_database.R'), collapse='\n')
stopifnot(!grepl('SERVICE_KEY|JWT_SECRET|service_role', text))
unlink(c(a, b, out))
cat('PASS: database backend over injected fake: list/save/load/delete, idempotent commit, 4 interruption recoveries, sha256 integrity, project isolation, per-session refresh-aware tokens, no globals, denied delete surfaced, id filter enforced client-side\n')
