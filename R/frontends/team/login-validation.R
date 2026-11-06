# Team sign-in feedback: inline field errors and one alert strip inside the card.
# These checks mirror www/team/js/login_validation.js so a bypassed browser check
# still yields the same messages. Authentication itself stays in project_library.R.
team_login_messages <- list(
  email_empty = "Enter the email on your invitation.",
  email_invalid = "Enter a valid email address.",
  password_empty = "Enter your password.",
  # Identical for unknown accounts and wrong passwords: never reveal account existence.
  rejected = "We could not sign you in. Check your email and password, reset your password below, or try again later."
)
team_login_rejected_message <- function() team_login_messages$rejected
# Messages a visitor may read in the alert strip. Any other failure (an unexpected R error)
# shows the neutral rejection, so internal text never reaches an unauthenticated page.
team_login_alert_text <- function(message) {
  shown <- c(team_login_messages$rejected, "Sign out before switching accounts.")
  ok <- is.character(message) && length(message) == 1L && !is.na(message)
  # The sign-in limiter's wait message (team_library_login_wait_message) is shown as is.
  if (ok && (message %in% shown || grepl("^Too many attempts\\. Try again in [0-9]+ s\\.$", message))) message
  else team_login_messages$rejected
}

# Named list of field id suffix -> message; empty when the form may be submitted.
team_login_field_errors <- function(email, password) {
  scalar <- function(x) is.character(x) && length(x) == 1L && !is.na(x)
  email <- if (scalar(email)) trimws(email) else ""
  errors <- list()
  if (!nzchar(email)) errors$email <- team_login_messages$email_empty
  else if (!grepl("^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$", email))
    errors$email <- team_login_messages$email_invalid
  if (!scalar(password) || !nzchar(password)) errors$password <- team_login_messages$password_empty
  errors
}

# The message slot sits below its input; the script links it with aria-describedby when shown.
team_login_field_error_ui <- function(id) div(id = paste0(id, "_error"), class = "team-login-field-error", hidden = NA)

# Same inputs and button ids as before, plus error slots and the alert strip above Sign in.
team_login_form_ui <- function() {
  div(class = "team-library-login",
    tagAppendChild(textInput("team_library_email", "Email"), team_login_field_error_ui("team_library_email")),
    tagAppendChild(passwordInput("team_library_password", "Password"), team_login_field_error_ui("team_library_password")),
    div(id = "team_library_login_alert", class = "team-login-alert", role = "alert", hidden = NA),
    actionButton("team_library_login", "Sign in"))
}

team_login_feedback <- function(session, fields = list(), alert = NULL) {
  message <- list(fields = fields)
  if (is.character(alert) && length(alert) == 1L && nzchar(alert)) message$alert <- alert
  session$sendCustomMessage("team-login-feedback", message)
}

# Marks a failure raised after set_account(): the form is re-rendered by then, so an
# inline alert would be wiped and the original message must reach the status line.
team_login_after_form <- function(e) structure(e, class = c("team_login_after_form", class(e)))

# Wraps the sign-in observer body. Invalid fields never reach the identity service
# or the attempt limiter. A refusal while the form is still shown (rejection, limiter)
# goes to the card's alert strip; the rethrown condition has an empty message so the
# status line below the card does not repeat it, and the operation still reports
# failure to its foreground owner. Failures marked by team_login_after_form() are
# rethrown unchanged so the foreground guard shows their message.
# Server-side trace of why a sign-in failed (no secrets: addresses, tokens and URLs are masked).
team_login_log <- function(stage, e) {
  m <- substr(gsub("[\r\n]+", " ", conditionMessage(e)), 1L, 300L)
  m <- gsub("[^[:space:]@]+@[^[:space:]@]+", "<email>", m)
  m <- gsub("(eyJ|sb_|Bearer )[A-Za-z0-9._-]+", "<redacted>", m)
  m <- gsub("https?://[^[:space:]]+", "<url>", m)
  message(sprintf("[TEAM] sign-in failed at %s: %s (%s)", stage, m, paste(class(e), collapse = "/")))
}
team_login_guard <- function(session, input, guard, code) guard("team_library_login", {
  errors <- team_login_field_errors(isolate(input$team_library_email), isolate(input$team_library_password))
  if (length(errors)) team_login_feedback(session, fields = errors)
  else tryCatch(code, error = function(e) {
    if (inherits(e, c("shiny.silent.error", "team_login_after_form"))) stop(e)
    team_login_log("handler", e)
    team_login_feedback(session, alert = team_login_alert_text(conditionMessage(e)))
    stop(structure(class = c("team_login_shown", "error", "condition"), list(message = "", call = NULL)))
  })
})
