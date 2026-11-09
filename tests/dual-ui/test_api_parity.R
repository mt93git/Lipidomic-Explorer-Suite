for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_parity")
source("frontends/nexo-api/engine.R")
fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
local({
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  # Snapshot values from the LIVE shared hub, while retaining the session for cards.
  value <- function(x) { force(x); function(...) x }
  hub <- api_read(s, {
    hub <- list(data_processed = value(s$shared$data_processed_allow_missing()))
    for (key in c("all_metadata", "preparation_audit", "color_maps", "class_color_map", "palette_settings"))
      hub[[key]] <- value(s$shared[[key]]())
    hub$preparation_dirty <- shiny::reactiveVal(FALSE)
    hub$team_compact_distribution <- TRUE
    allowed <- c(unpaired = isTRUE(s$shared$inference_allowed(FALSE)), paired = isTRUE(s$shared$inference_allowed(TRUE)))
    hub$inference_allowed <- function(paired = FALSE) allowed[[if (isTRUE(paired)) "paired" else "unpaired"]]
    hub
  })
  reference <- list()
  server <- function(input, output, session) results_dashboard_module_server(input, output, session, hub)
  for (id in c("pca", "violin", "dist", "comp", "heat")) api_size(s, paste0("plot_", id), 900, 600)
  shiny::testServer(server, {
    do.call(session$setInputs, s$inputs); session$flushReact()
    for (id in c("pca", "violin", "dist", "comp", "heat"))
      reference[[id]] <<- jsonlite::fromJSON(output[[paste0("plot_", id)]], simplifyVector = FALSE)$x
  })
  traces <- function(fig) lapply(fig$data, function(trace) trace[c("type", "name", "x", "y")])
  for (id in names(reference)) {
    card <- api_card_create(s, paste0("results_dashboard-plot_", id), s$inputs)
    rendered <- api_card_render(s, card$instanceId, 900, 600)
    stopifnot(length(rendered$figure$data) > 0L, identical(traces(reference[[id]]), traces(rendered$figure)))
  }
  cat("PASS parity 5/5\n")
})
