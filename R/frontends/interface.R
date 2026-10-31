# Select one presentation for this R process. Both use the same loaded R/modules.
lipidomic_interface <- function(value = Sys.getenv("LIPIDOMIC_INTERFACE", "classic")) {
  value <- tolower(trimws(value))
  if (identical(value, "guided")) value <- "team" # migration alias
  if (!value %in% c("classic", "team")) {
    stop("LIPIDOMIC_INTERFACE must be classic or team (guided is an alias)", call. = FALSE)
  }
  value
}

frontend_server_hooks <- function(interface = lipidomic_interface()) {
  switch(interface, classic = classic_frontend_server, team = team_frontend_server,
    stop("Unknown frontend", call. = FALSE))
}

# Runtime policy is dependency-free so app.R can apply it before package setup.
lipidomic_env_flag <- function(name) {
  value <- tolower(trimws(Sys.getenv(name, unset = "")))
  if (!nzchar(value)) return(NULL)
  if (value %in% c("1", "true", "yes", "on")) return(TRUE)
  if (value %in% c("0", "false", "no", "off")) return(FALSE)
  stop(sprintf("%s must be 1/true/yes/on or 0/false/no/off", name), call. = FALSE)
}

lipidomic_validate_runtime_flags <- function() {
  # Validate even inactive overrides before installs, package loading, or analysis.
  for (name in c("LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL",
                 "LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL", "LIPIDOMIC_UI_TRACE_DEBUG")) {
    lipidomic_env_flag(name)
  }
  invisible(TRUE)
}

lipidomic_restricted_runtime <- function() {
  enabled <- function(name) {
    value <- tolower(trimws(Sys.getenv(name, unset = "")))
    nzchar(value) && !value %in% c("0", "false", "no", "off")
  }
  any(vapply(c("CI", "CONTINUOUS_INTEGRATION", "GITHUB_ACTIONS",
    "LIPIDOMIC_HOSTED", "SHINY_SERVER", "SHINY_SERVER_VERSION",
    "RSCONNECT", "RSCONNECT_SERVER", "CONNECT_SERVER", "SHINYAPPS_INSTANCE_ID"),
    enabled, logical(1))) ||
    nzchar(Sys.getenv("SHINY_SERVER_LICENSE", unset = ""))
}

lipidomic_allow_dependency_install <- function() {
  # An explicit disable always wins, including when both flags are supplied.
  if (isTRUE(lipidomic_env_flag("LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL"))) return(FALSE)
  override <- lipidomic_env_flag("LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL")
  if (!is.null(override)) return(override)
  identical(lipidomic_interface(), "classic") && !lipidomic_restricted_runtime()
}

lipidomic_full_diagnostics <- function() {
  # Never emit browser/study payloads to service or CI logs, even with debug=1.
  if (lipidomic_restricted_runtime()) return(FALSE)
  override <- lipidomic_env_flag("LIPIDOMIC_UI_TRACE_DEBUG")
  if (!is.null(override)) return(override)
  identical(lipidomic_interface(), "classic")
}

lipidomic_ui_trace_suffix <- function(evt) {
  if (!lipidomic_full_diagnostics()) return("")
  # Browser input is untrusted; retain useful local fields without unbounded logs.
  lines <- capture.output(str(evt$payload, max.level = 3L, list.len = 20L,
    vec.len = 20L, nchar.max = 300L, give.attr = FALSE,
    strict.width = "cut", width = 120L))
  text <- paste(head(lines, 100L), collapse = " ")
  paste0(" | ", substr(text, 1L, 12000L))
}
