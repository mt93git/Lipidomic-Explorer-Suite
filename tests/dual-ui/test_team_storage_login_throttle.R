# Sign-in throttle: on by default, non-blocking, per account, retry-after
# 1, 2, 4 ... s capped at 60 s, no lockout, success resets, off disables.
for (f in c('storage/storage.R','storage/storage_database.R','project_library.R')) source(file.path('R/frontends/team', f))
expect_error <- function(expr, pattern) {
  msg <- tryCatch({force(expr); NULL}, error=conditionMessage)
  if (is.null(msg) || !grepl(pattern, msg, fixed=TRUE)) stop('Expected error containing: ', pattern, ' got: ', format(msg))
}
Sys.unsetenv('LIPIDOMIC_LOGIN_THROTTLE')
clock <- 1000
make <- function(state=new.env()) team_library_login_limiter(now=function() clock, state=state)
wait <- function(attempt, email) { r <- attempt(email); if (isTRUE(r$allowed)) 0L else r$retry_after_seconds }
allowed <- list(allowed=TRUE)

# Never blocks: no sleeping anywhere in the limiter.
for (fn in list(team_library_login_limiter, make(), team_library_sign_in))
  stopifnot(!grepl('sleep', paste(deparse(fn), collapse='\n'), ignore.case=TRUE))
stopifnot(!'sleep' %in% names(formals(team_library_login_limiter)))

# On by default (unset), and for any value other than off/0/false/no.
stopifnot(team_library_login_throttle_enabled(''), team_library_login_throttle_enabled('on'))
for (v in c('off','OFF',' off ','0','false','no')) stopifnot(!team_library_login_throttle_enabled(v))

# Retry-after: 0 through 5 failures, then 1, 2, 4 ... s capped at 60, never a lockout.
attempt <- make()
observed <- integer()
for (i in 1:15) { observed <- c(observed, wait(attempt, 'Person@Example.org')); attempt('Person@Example.org', 'failure') }
stopifnot(identical(observed, c(0L,0L,0L,0L,0L, 1L,2L,4L,8L,16L,32L, 60L,60L,60L,60L)))
r <- attempt('person@example.org')
stopifnot(identical(r, list(allowed=FALSE, retry_after_seconds=60L)))
# Whole seconds rounded up, counted from the last failure.
clock <- clock + 44.2; stopifnot(identical(attempt('person@example.org')$retry_after_seconds, 16L))
clock <- clock + 15.8; stopifnot(identical(attempt('person@example.org'), allowed))
stopifnot(identical(team_library_login_wait_message(list(allowed=FALSE, retry_after_seconds=16L)),
  'Too many attempts. Try again in 16 s.'))
# Email normalized and only hashed.
env <- environment(attempt)$state
stopifnot(length(ls(env)) == 1L, !grepl('example', ls(env)))

# Success resets; accounts are independent.
attempt('person@example.org', 'success'); stopifnot(length(ls(env)) == 0L)
for (i in 1:5) { stopifnot(wait(attempt, 'person@example.org') == 0L); attempt('person@example.org', 'failure') }
stopifnot(wait(attempt, 'person@example.org') == 1L, wait(attempt, 'other@example.org') == 0L)
for (i in 1:7) attempt('other@example.org', 'failure')
stopifnot(wait(attempt, 'other@example.org') == 4L, wait(attempt, 'person@example.org') == 1L)

# Shared by sessions in the process; forgotten after 24 h without failures.
shared <- new.env(); a1 <- make(shared); a2 <- make(shared)
for (i in 1:6) a1('shared@example.org', 'failure')
stopifnot(wait(a2, 'shared@example.org') == 2L)
clock <- clock + 24 * 3600 + 1; stopifnot(wait(a2, 'shared@example.org') == 0L, length(ls(shared)) == 0L)
stopifnot(identical(environment(team_library_login_limiter())$state, team_library_login_state))
stopifnot(identical(attempt(), allowed), identical(attempt(NULL), allowed))

# Guarded sign-in: a refused attempt makes zero transport calls.
calls <- 0L; good <- FALSE
fake <- function(service, path, token=NULL, body=NULL, method='GET', raw=FALSE) {
  calls <<- calls + 1L
  stopifnot(identical(service, 'auth'), grepl('grant_type=password', path, fixed=TRUE))
  if (good) list(access_token='synthetic-token', user=list(id='u', email='x')) else stop('invalid credentials')
}
gate <- make()
for (i in 1:5) expect_error(team_library_sign_in('who@example.org', 'wrong', gate, call=fake), 'We could not sign you in')
stopifnot(calls == 5L)
expect_error(team_library_sign_in('who@example.org', 'wrong', gate, call=fake), 'Too many attempts. Try again in 1 s.')
stopifnot(calls == 5L)
clock <- clock + 1; good <- TRUE
stopifnot(identical(team_library_sign_in('who@example.org', 'right', gate, call=fake)$access_token, 'synthetic-token'), calls == 6L)
stopifnot(length(ls(environment(gate)$state)) == 0L) # success reset

# Real clock: a burst of 50 calls inside a 60 s penalty window returns at once.
real <- team_library_login_limiter(state=new.env())
for (i in 1:11) real('burst@example.org', 'failure')
elapsed <- system.time(results <- lapply(1:50, function(i) real('burst@example.org')))[['elapsed']]
stopifnot(elapsed < 0.5, all(vapply(results, function(r) isFALSE(r$allowed) && r$retry_after_seconds %in% 59:60, logical(1))))

# LIPIDOMIC_LOGIN_THROTTLE=off: immediate retries, nothing recorded.
Sys.setenv(LIPIDOMIC_LOGIN_THROTTLE='off')
off <- make()
for (i in 1:20) { stopifnot(identical(off('person@example.org'), allowed)); off('person@example.org', 'failure') }
stopifnot(length(ls(environment(off)$state)) == 0L)
Sys.unsetenv('LIPIDOMIC_LOGIN_THROTTLE')
cat(sprintf('PASS: non-blocking sign-in throttle (50-call burst %.3fs): on by default, 5 free failures then retry_after 1,2,4..60 s rounded up, refused attempts never reach the transport, exact wait message, success resets, accounts independent, shared per process, 24 h forget, off disables\n', elapsed))
