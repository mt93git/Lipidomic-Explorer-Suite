# Compatibility entry point for scripts that previously sourced engine.R.
api_dir <- Sys.getenv("LIPIDOMIC_API_DIR", "")
if (!nzchar(api_dir)) api_dir <- tryCatch(dirname(normalizePath(sys.frame(1)$ofile)), error = function(e) "")
if (!nzchar(api_dir) || !file.exists(file.path(api_dir, "session.R"))) api_dir <- file.path(getwd(), "R", "frontends", "api")
for (file in c("session.R", "schema.R", "catalog.R", "cards.R", "storage_files.R", "storage.R", "export.R", "analysis.R", "palette.R", "cohort.R", "nexo_store.R", "render_disk.R"))
  source(file.path(api_dir, file), local = globalenv())
