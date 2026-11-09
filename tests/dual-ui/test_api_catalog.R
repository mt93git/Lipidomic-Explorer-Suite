for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_catalog")
source("R/frontends/api/engine.R")
fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
local({
  entries <- api_catalog()
  ids <- unlist(lapply(names(team_plot_instance_families), function(family)
    paste0(family, "-", team_plot_instance_families[[family]]$outputs)), use.names = FALSE)
  if (exists("team_cell_instance_outputs")) ids <- c(ids, team_cell_instance_outputs)
  actual <- vapply(entries, `[[`, character(1), "id")
  stopifnot(length(entries) == length(ids), !anyDuplicated(actual), setequal(actual, ids),
    !"export_studio-studio_preview_plot" %in% actual)
  for (entry in entries) {
    stopifnot(entry$render %in% c("plotly", "png", "visnetwork", "html"),
      all(names(entry$defaults) %in% entry$allowedInputs), nzchar(entry$label), nzchar(entry$description),
      nzchar(entry$group), !is.null(team_plot_instance_source(entry$id)))
    if (entry$family == "results_dashboard") stopifnot(entry$render == "plotly")
  }
  stopifnot(api_catalog_entry("heatmap_barchart_tab-heatmapPlot")$render == "png",
    api_catalog_entry("pathway_tab-pathwayVisNetwork")$render == "visnetwork",
    api_catalog_entry("group_comparison_tab-comparisonPlot")$render == "html")
  cat(sprintf("PASS catalog %d\n", length(entries)))
  # Chart audit b09-fla: the FLA volcano (p-values) and circos (inferential_network_adapter.R) draw only a placeholder
  # until an independent design is confirmed, so the Library gates them like the differential rows.
  stopifnot(identical(api_catalog_entry("fla_tab-plotVolcano")$needs, "de"),
    identical(api_catalog_entry("fla_tab-plotCircos")$needs, "de"), is.null(api_catalog_entry("fla_tab-logratioPlot")$needs))
  cat("PASS FLA volcano and circos need a confirmed design\n")
  # b07 audit: Team gates these renderers on a confirmed independent design (team_inferential_network_adapter,
  # guided_local_inference_allowed); without the same gate the Library adds them with no "Confirm study design…"
  # step and the card can only draw Team's "requires a confirmed independent study design" message.
  for (id in c("structural_tab-networkPlot", "fla_tab-plotCircos"))
    if (!identical(api_catalog_entry(id)$needs, "de")) stop(id, ": needs ", deparse(api_catalog_entry(id)$needs), ", expected \"de\" (Team's independent-design gate)")
  cat("PASS catalog network gates: networkPlot and plotCircos need a confirmed independent design\n")
  # H8 live stress: the catalog's own defaults must pass the API's input validator (Team's
  # colourInput accepts colour names such as "black"; range sliders carry two numbers).
  rejected <- character()
  for (entry in entries) {
    defaults <- entry$defaults[intersect(names(entry$defaults), entry$allowedInputs)]
    msg <- tryCatch({ api_validate_inputs(entry$inputs %||% list(), defaults); "" }, error = function(e) conditionMessage(e))
    if (nzchar(msg)) rejected <- c(rejected, paste(entry$id, msg))
  }
  if (length(rejected)) stop("catalog defaults rejected by the validator:\n", paste(rejected, collapse = "\n"))
  bad <- function(expr) inherits(tryCatch({ expr; NULL }, error = function(e) e), "api_bad_request")
  colour <- list(list(id = "c", type = "color")); range <- list(list(id = "r", type = "range", default = list(16, 18), min = 0, max = 60))
  stopifnot(!bad(api_validate_inputs(colour, list(c = "black"))), !bad(api_validate_inputs(colour, list(c = "#1a2B3c"))),
    bad(api_validate_inputs(colour, list(c = "not-a-colour"))), !bad(api_validate_inputs(range, list(r = list(14, 20)))),
    bad(api_validate_inputs(range, list(r = 14))), bad(api_validate_inputs(range, list(r = list(14, 99)))))
  cat(sprintf("PASS catalog defaults of %d entries pass the validator; colour names and two-value ranges accepted\n", length(entries)))
})
