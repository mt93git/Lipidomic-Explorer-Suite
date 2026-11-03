# Run with: Rscript tests/dual-ui/test_team_login_validation.R
# Pure sign-in feedback helpers; no Shiny session or identity service is started.
suppressPackageStartupMessages(library(shiny))
source("R/frontends/team/login-validation.R")

m <- team_login_messages
stopifnot(identical(team_login_field_errors("", ""), list(email = m$email_empty, password = m$password_empty)),
  identical(team_login_field_errors("   ", "x"), list(email = m$email_empty)),
  identical(team_login_field_errors(NULL, NULL), list(email = m$email_empty, password = m$password_empty)),
  identical(team_login_field_errors(NA_character_, "x")$email, m$email_empty),
  identical(team_login_field_errors("not-an-email", "x"), list(email = m$email_invalid)),
  identical(team_login_field_errors("a@b", "x")$email, m$email_invalid),
  identical(team_login_field_errors("a b@c.org", "x")$email, m$email_invalid),
  identical(team_login_field_errors(" user@example.org ", "x"), list()),
  # Passwords are never trimmed: only an empty value is refused.
  identical(team_login_field_errors("user@example.org", " "), list()),
  identical(team_login_field_errors("user@example.org", ""), list(password = m$password_empty)),
  identical(m$email_empty, "Enter the email on your invitation."),
  identical(m$email_invalid, "Enter a valid email address."),
  identical(m$password_empty, "Enter your password."),
  identical(team_login_rejected_message(),
    "We could not sign you in. Check your email and password, reset your password below, or try again later."))

# The visible disclosure (and its first-paint placeholder) starts with "Reset password".
library_src <- readLines("R/frontends/team/project_library.R", warn = FALSE)
summaries <- regmatches(library_src, regexpr('tags\\$summary\\([^)]*\\)', library_src))
stopifnot(length(summaries) == 2L, all(grepl('"Reset password or activate your invitation"', summaries, fixed = TRUE)),
  !any(grepl("Activate your invitation or reset your password", library_src, fixed = TRUE)))

# The form keeps its input/button ids and adds hidden error slots plus one alert strip
# placed before the Sign in button.
html <- as.character(team_login_form_ui())
pos <- function(pattern) regexpr(pattern, html, fixed = TRUE)[[1L]]
stopifnot(pos('id="team_library_email"') > 0, pos('id="team_library_password"') > 0,
  pos('id="team_library_email_error"') > pos('id="team_library_email"'),
  pos('id="team_library_password_error"') > pos('id="team_library_password"'),
  pos('id="team_library_login_alert"') > pos('id="team_library_password_error"'),
  pos('id="team_library_login"') > pos('id="team_library_login_alert"'),
  lengths(regmatches(html, gregexpr('role="alert"', html, fixed = TRUE))) == 1L,
  grepl('class="team-library-login"', html, fixed = TRUE))

# The guard: invalid fields never run the sign-in body; refusals go to the alert strip
# and leave an empty status message while still failing the foreground operation.
sent <- list()
session <- list(sendCustomMessage = function(type, message) sent[[length(sent) + 1L]] <<- list(type = type, message = message))
status <- "unchanged"
ok <- NA
guard <- function(action, code) {
  stopifnot(identical(action, "team_library_login"))
  ok <<- TRUE
  tryCatch(force(code), error = function(e) {ok <<- FALSE; status <<- conditionMessage(e); invisible(NULL)})
}
ran <- FALSE
team_login_guard(session, list(team_library_email = "bad", team_library_password = ""), guard, {ran <- TRUE})
stopifnot(!ran, isTRUE(ok), identical(status, "unchanged"), length(sent) == 1L,
  identical(sent[[1]]$type, "team-login-feedback"),
  identical(sent[[1]]$message, list(fields = list(email = m$email_invalid, password = m$password_empty))))

sent <- list()
team_login_guard(session, list(team_library_email = "user@example.org", team_library_password = "pw"), guard,
  stop(team_login_rejected_message(), call. = FALSE))
stopifnot(identical(ok, FALSE), identical(status, ""), length(sent) == 1L,
  identical(sent[[1]]$message, list(fields = list(), alert = team_login_rejected_message())))

# Unexpected errors before set_account() never put their own text on the sign-in page.
sent <- list()
team_login_guard(session, list(team_library_email = "user@example.org", team_library_password = "pw"), guard,
  stop("object 'internal_token' not found", call. = FALSE))
stopifnot(identical(ok, FALSE), identical(sent[[1]]$message$alert, team_login_rejected_message()))
sent <- list()
team_login_guard(session, list(team_library_email = "user@example.org", team_library_password = "pw"), guard,
  stop("Sign out before switching accounts.", call. = FALSE))
stopifnot(identical(sent[[1]]$message$alert, "Sign out before switching accounts."))

# The sign-in limiter's wait message reaches the alert strip as is.
sent <- list()
team_login_guard(session, list(team_library_email = "user@example.org", team_library_password = "pw"), guard,
  stop("Too many attempts. Try again in 4 s.", call. = FALSE))
stopifnot(identical(sent[[1]]$message$alert, "Too many attempts. Try again in 4 s."),
  identical(team_login_alert_text("Too many attempts. Try again in soon s."), team_login_rejected_message()))

# After set_account() the form is re-rendered: no inline alert, and the original
# message reaches the status line through the foreground guard.
sent <- list()
status <- "unchanged"
team_login_guard(session, list(team_library_email = "user@example.org", team_library_password = "pw"), guard,
  tryCatch(stop("Projects could not be loaded.", call. = FALSE), error = function(e) stop(team_login_after_form(e))))
stopifnot(identical(ok, FALSE), identical(status, "Projects could not be loaded."), length(sent) == 0L)

sent <- list()
team_login_guard(session, list(team_library_email = "user@example.org", team_library_password = "pw"), guard, {ran <- TRUE})
stopifnot(ran, isTRUE(ok), length(sent) == 0L)
cat("PASS: Team sign-in field checks, inline form structure and in-card refusal routing\n")
