`%||%` <- function(a, b) if (is.null(a) || (length(a) == 1L && is.na(a))) b else a
# Resolve this script before switching to a separate production application tree.
# LIPIDOMIC_API_DIR wins (tests and callr children); otherwise the sourced file's
# own directory, then the --file= argument, then R/frontends/api under the cwd.
api_run_candidates <- c(Sys.getenv("LIPIDOMIC_API_DIR", ""),
  dirname(tryCatch(sys.frame(1)$ofile, error = function(e) "") %||% ""),
  dirname(sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE)[1] %||% "")),
  file.path(getwd(), "R", "frontends", "api"))
api_run_candidates <- api_run_candidates[nzchar(api_run_candidates) & !is.na(api_run_candidates)]
api_run_dir <- Filter(function(d) file.exists(file.path(d, "session.R")), api_run_candidates)
if (!length(api_run_dir)) stop("Cannot locate the Nexo API directory (set LIPIDOMIC_API_DIR).")
api_run_dir <- normalizePath(api_run_dir[[1L]], mustWork = TRUE)
api_root <- Sys.getenv("LIPIDOMIC_API_ROOT", ".")
if (nzchar(api_root) && api_root != ".") setwd(api_root)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
source("R/global.R", local = globalenv())
source(file.path(api_run_dir, "requirements.R"), local = globalenv())
api_missing <- api_missing_team_symbols()
if (length(api_missing)) stop("Nexo API requires these Team symbols: ", paste(api_missing, collapse = ", "))
# export.R: schema.R lists a card's file inputs from it (b11 F3), so it loads with the engine, not only in plumber.R.
api_engine_files <- c("health.R", "session.R", "schema.R", "catalog.R", "cards.R", "export.R", "storage_files.R", "storage.R", "analysis.R", "palette.R", "cohort.R", "nexo_store.R", "render_disk.R", "pool.R")
for (file in api_engine_files) source(file.path(api_run_dir, file), local = globalenv())
# Warm the catalog cache before serving (parses every family UI once, ~7 s).
invisible(api_catalog())
# Render workers boot in the background (LIPIDOMIC_API_WORKERS, default 0 = off).
api_pool_start(api_pool_size(), api_engine_files, getwd(), api_run_dir)
# plumber switches the working directory to the plumber.R folder while running;
# Team functions and the catalog read module files relative to the app root.
api_app_root <- normalizePath(getwd())
api_router <- plumber::pr_set_serializer(plumber::plumb(file.path(api_run_dir, "plumber.R")),
  plumber::serializer_unboxed_json(null = "null", na = "null", digits = NA))
api_router <- plumber::pr_hook(api_router, "preroute", function() {
  if (!identical(normalizePath(getwd()), api_app_root)) setwd(api_app_root)
})
api_idle_tick <- function() {
  # Reactive flushes can dispatch later callbacks; never evict a session mid-request.
  if (!isTRUE(get0("api_busy_global", envir = globalenv(), inherits = FALSE))) api_sessions_evict_idle()
  later::later(api_idle_tick, 60)
}
later::later(api_idle_tick, 60)
plumber::pr_run(api_router, host = "127.0.0.1",
  port = as.integer(Sys.getenv("LIPIDOMIC_API_PORT", "3960")))
