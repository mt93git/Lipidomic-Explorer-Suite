# shiny::runApp(".") sources every top-level R/*.R file into its own environment
# before app.R (Shiny's R/ autoload). The hook registry must not be one of those
# files: a second, empty registry there made the autoloaded R/server.R skip every
# Team server hook, including the workspace sign-in gate.
stopifnot(file.exists("R/core/hooks.R"), !file.exists("R/hooks.R"))
top_level <- list.files("R", pattern = "\\.R$", full.names = TRUE)
defines_registry <- vapply(top_level, function(f) any(grepl("^\\.lipidomic_hooks\\s*<-", readLines(f, warn = FALSE))), logical(1))
stopifnot(!any(defines_registry))

autoloaded_server <- function(env_vars) {
  old <- Sys.getenv(names(env_vars), unset = NA_character_)
  on.exit({
    for (n in names(old)) if (is.na(old[[n]])) Sys.unsetenv(n) else do.call(Sys.setenv, as.list(old[n]))
  }, add = TRUE)
  do.call(Sys.setenv, as.list(env_vars))
  e <- new.env(parent = globalenv())
  suppressMessages(suppressWarnings(utils::capture.output(
    shiny::loadSupport(".", renv = e, globalrenv = globalenv()), type = "output")))
  get("server", envir = e, inherits = FALSE)
}

team <- autoloaded_server(c(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_TEAM_WORKSPACE = "1",
  LIPIDOMIC_PROJECT_LIBRARY = "1", LIPIDOMIC_STORAGE = "database",
  LIPIDOMIC_AUTH_URL = "http://127.0.0.1:9/auth", LIPIDOMIC_REST_URL = "http://127.0.0.1:9/rest",
  LIPIDOMIC_STORAGE_URL = "http://127.0.0.1:9/storage", LIPIDOMIC_COMPANION_AI = "0"))
stopifnot("team_library_server" %in% all.names(body(team)))
stopifnot(all(c("server_entry", "shared_data", "export_studio_server", "structural_server_started") %in%
  lipidomic_hook_registered()))

lipidomic_hook_reset()
classic <- autoloaded_server(c(LIPIDOMIC_INTERFACE = "classic", LIPIDOMIC_TEAM_WORKSPACE = "",
  LIPIDOMIC_PROJECT_LIBRARY = "", LIPIDOMIC_STORAGE = ""))
stopifnot(!"team_library_server" %in% all.names(body(classic)), length(lipidomic_hook_registered()) == 0L)

cat("PASS Shiny R/ autoload keeps one hook registry; Team server is gated, Classic unchanged\n")
