# Read-only structural contract for the two presentation shells.
# This is intentionally fast and does not start Shiny, read user data, or call services.
source("R/frontends/interface.R")
source("R/frontends/classic/server.R")
source("R/frontends/team/server.R")

check_selectors <- function() {
  old <- Sys.getenv("LIPIDOMIC_INTERFACE", unset = NA_character_)
  on.exit({
    if (is.na(old)) Sys.unsetenv("LIPIDOMIC_INTERFACE") else Sys.setenv(LIPIDOMIC_INTERFACE = old)
  }, add = TRUE)
  Sys.setenv(LIPIDOMIC_INTERFACE = "classic")
  stopifnot(identical(lipidomic_interface(), "classic"))
  Sys.setenv(LIPIDOMIC_INTERFACE = "team")
  stopifnot(identical(lipidomic_interface(), "team"))
  Sys.setenv(LIPIDOMIC_INTERFACE = "guided")
  stopifnot(identical(lipidomic_interface(), "team"))
  Sys.setenv(LIPIDOMIC_INTERFACE = "bad-value")
  stopifnot(inherits(try(lipidomic_interface(), silent = TRUE), "try-error"))
}
check_selectors()
stopifnot(identical(frontend_server_hooks("classic"), classic_frontend_server))
stopifnot(identical(frontend_server_hooks("team"), team_frontend_server))

# Parse the production server rather than grepping text: both UI choices must
# converge on one shared hub constructor and one graph of analytical servers.
server_file <- parse("R/server.R")
walk_calls <- function(node) {
  if (is.call(node)) c(list(node), unlist(lapply(as.list(node), walk_calls), recursive = FALSE))
  else if (is.expression(node) || is.pairlist(node) || is.list(node))
    unlist(lapply(as.list(node), walk_calls), recursive = FALSE)
  else list()
}
calls <- walk_calls(server_file)
call_name <- function(x) if (is.call(x) && is.symbol(x[[1L]])) as.character(x[[1L]]) else ""
names <- vapply(calls, call_name, character(1))
stopifnot(sum(names == "shared_data_server") == 1L)
stopifnot(which(names == "shared_data_server") < which(names == "frontend_server_hooks"))

# Each scientific module is registered once in the common server. Presentation
# hooks may differ, while the module function references remain shared.
scientific_modules <- c("targeted_lipids_server", "qc_boxplot_server", "heatmap_server",
  "barchart_server", "volcano_server", "lsea_server", "structural_server",
  "structural_grid_server", "logratio_server", "fla_server", "pathway_server",
  "cellular_org_server", "longitudinal_server", "math_proof_server")
for (module in scientific_modules) {
  stopifnot(sum(names == module) == 1L)
}

# Exercise the Team hook with stubs and a sentinel backend. This verifies that
# its presentation modules receive shallow adapters over the common backend,
# without initializing Shiny modules or external services.
hook_calls <- list()
record_hook <- function(name, result = NULL) {
  force(name); force(result)
  function(...) {
    hook_calls[[name]] <<- list(args = list(...))
    result
  }
}
ux_comparison_server <- record_hook("comparison")
guide_sentinel <- structure(list(), class = "guide-sentinel")
guided_workflow_server <- record_hook("workflow", guide_sentinel)
results_dashboard_server <- record_hook("dashboard")
cell_show_server <- record_hook("cell")
companion_assistant_server <- record_hook("companion")
sentinel_hub <- structure(list(data_processed = function() "strict matrix",
  data_processed_allow_missing = function() "targeted prepared matrix",
  data_processed_unfiltered = function() "full applied matrix",
  marker = function() "shared metadata"),
  class = "shared-hub-sentinel")
guide <- team_frontend_server(input = list(), output = list(), session = NULL, shared_data = sentinel_hub)
stopifnot(identical(guide, guide_sentinel))
for (name in c("workflow", "dashboard", "companion")) {
  adapter <- hook_calls[[name]]$args[[4L]]
  stopifnot(is.list(adapter), !identical(adapter, sentinel_hub),
    identical(adapter$data_processed, sentinel_hub$data_processed_allow_missing),
    identical(adapter$marker, sentinel_hub$marker))
}
stopifnot(identical(hook_calls$companion$args[[5L]], guide))
cell_adapter <- hook_calls$cell$args[[4L]]
stopifnot(is.list(cell_adapter), !identical(cell_adapter, sentinel_hub),
  identical(cell_adapter$data_processed, sentinel_hub$data_processed_unfiltered))
stopifnot(identical(classic_frontend_server(NULL, NULL, NULL, sentinel_hub), sentinel_hub))

cat("PASS: interface selectors converge on one shared hub and scientific module graph\n")
