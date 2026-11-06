Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/engine.R")
fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
local({
  loaded <- api_load_session(fixture)
  hub <- loaded$hub
  old_client <- getS3method("[[", "mockclientdata")
  assignInNamespace("[[.mockclientdata", function(x, name) {
    if (grepl("plot_(dist|comp|heat)_width$", name)) return(900)
    old_client(x, name)
  }, ns = "shiny")
  on.exit(assignInNamespace("[[.mockclientdata", old_client, ns = "shiny"))
  reference <- list()
  server <- function(input, output, session) results_dashboard_module_server(input, output, session, hub)
  shiny::testServer(server, {
    do.call(session$setInputs, loaded$inputs); session$flushReact()
    for (id in c("pca", "violin", "dist", "comp", "heat"))
      reference[[id]] <<- jsonlite::fromJSON(output[[paste0("plot_", id)]], simplifyVector = FALSE)$x
  })
  traces <- function(fig) lapply(fig$data, function(trace) trace[c("type", "name", "x", "y")])
  for (id in names(reference)) stopifnot(identical(traces(reference[[id]]),
    traces(api_render_plot(hub, id, loaded$inputs, width = 900))))
  cat("PASS parity 5/5\n")
})
