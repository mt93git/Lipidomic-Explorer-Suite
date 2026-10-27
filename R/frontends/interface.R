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
