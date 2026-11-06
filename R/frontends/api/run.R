Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
source("R/global.R"); source("R/frontends/api/engine.R")
api_router <- plumber::pr_set_serializer(plumber::plumb("R/frontends/api/plumber.R"),
  plumber::serializer_unboxed_json(null = "null", na = "null", digits = NA))
plumber::pr_run(api_router, host = "127.0.0.1",
                port = as.integer(Sys.getenv("LIPIDOMIC_API_PORT", "3960")))
