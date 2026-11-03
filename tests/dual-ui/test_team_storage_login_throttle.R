# Sign-in throttle: on by default, per account, progressive delay capped at 60 s,
# no lockout, success resets, LIPIDOMIC_LOGIN_THROTTLE=off disables it.
# Clock and sleep are injected, so this runs instantly.
for (f in c('storage/storage.R','storage/storage_database.R','project_library.R')) source(file.path('R/frontends/team', f))
Sys.unsetenv('LIPIDOMIC_LOGIN_THROTTLE')
clock <- 1000; slept <- numeric()
make <- function() team_library_login_limiter(now=function() clock, sleep=function(s) slept <<- c(slept, s), state=new.env())
waits_for <- function(attempt, email) { slept <<- numeric(); attempt(email); if (length(slept)) sum(slept) else 0 }

# On by default (unset), and for any value other than off.
stopifnot(team_library_login_throttle_enabled(''), team_library_login_throttle_enabled('on'))
for (v in c('off','OFF',' off ','0','false','no')) stopifnot(!team_library_login_throttle_enabled(v))

# No delay through 5 failures, then 1, 2, 4 ... s capped at 60, with no lockout.
attempt <- make()
observed <- numeric()
for (i in 1:15) { observed <- c(observed, waits_for(attempt, 'Person@Example.org')); attempt('Person@Example.org', 'failure') }
stopifnot(identical(observed, c(0,0,0,0,0, 1,2,4,8,16,32, 60,60,60,60)))
stopifnot(identical(vapply(0:12, team_library_login_delay, 0), c(0,0,0,0,0,1,2,4,8,16,32,60,60)))
# The delay counts from the last failure: time already waited is credited.
clock <- clock + 45; stopifnot(waits_for(attempt, 'person@example.org') == 15)
clock <- clock + 60; stopifnot(waits_for(attempt, 'person@example.org') == 0)
# Email is normalized (case, whitespace) and never stored in clear text.
stopifnot(waits_for(attempt, '  PERSON@example.ORG ') == 0)
env <- environment(attempt)$state
stopifnot(length(ls(env)) == 1L, !grepl('example', ls(env)))

# Success resets that account's counter.
attempt('person@example.org', 'success')
stopifnot(length(ls(env)) == 0L)
for (i in 1:5) { stopifnot(waits_for(attempt, 'person@example.org') == 0); attempt('person@example.org', 'failure') }
stopifnot(waits_for(attempt, 'person@example.org') == 1)

# Accounts are independent.
stopifnot(waits_for(attempt, 'other@example.org') == 0)
for (i in 1:7) attempt('other@example.org', 'failure')
stopifnot(waits_for(attempt, 'other@example.org') == 4, waits_for(attempt, 'person@example.org') == 1)

# State is shared by limiters (sessions) using the same store: a reload cannot reset it.
shared <- new.env()
a1 <- team_library_login_limiter(now=function() clock, sleep=function(s) slept <<- c(slept, s), state=shared)
a2 <- team_library_login_limiter(now=function() clock, sleep=function(s) slept <<- c(slept, s), state=shared)
for (i in 1:6) a1('shared@example.org', 'failure')
stopifnot(waits_for(a2, 'shared@example.org') == 2)
# Entries are forgotten after 24 h without failures.
clock <- clock + 24 * 3600 + 1; stopifnot(waits_for(a2, 'shared@example.org') == 0, length(ls(shared)) == 0L)

# Production call shape attempt() with no email stays a no-op.
stopifnot(waits_for(attempt, NULL) == 0, isTRUE(attempt()))

# LIPIDOMIC_LOGIN_THROTTLE=off: immediate retries, nothing recorded.
Sys.setenv(LIPIDOMIC_LOGIN_THROTTLE='off')
off <- make()
for (i in 1:20) { stopifnot(waits_for(off, 'person@example.org') == 0); off('person@example.org', 'failure') }
stopifnot(length(ls(environment(off)$state)) == 0L)
Sys.unsetenv('LIPIDOMIC_LOGIN_THROTTLE')
# The default limiter uses the process-wide store.
stopifnot(identical(environment(team_library_login_limiter())$state, team_library_login_state))
cat('PASS: sign-in throttle on by default; 5 free failures then 1,2,4..60 s per normalized account, no lockout, success resets, accounts independent, shared across sessions, off disables\n')
