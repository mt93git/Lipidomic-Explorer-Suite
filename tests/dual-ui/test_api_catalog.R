for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_catalog")
source("frontends/nexo-api/engine.R")
fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
# Unit, no app: Team may define an output outside its family's module file (Max's hooks tree defines
# qc_pca_tab-guided_qc_plot in R/frontends/team/qc-server.R). The classifier reads the family file
# first, then the files under the Team frontend directory. Synthetic files only.
local({
  root <- tempfile("catalog-classify-"); team <- file.path(root, "team")
  dir.create(file.path(team, "hooks"), recursive = TRUE)
  family_file <- file.path(root, "family_module.R")
  writeLines(c("server <- function(input, output, session) {",
    "  output$inFamily <- renderPlot({ plot(1) })",
    "  output$both <- shiny::renderImage({ list(src = 'x') })", "}"), family_file)
  writeLines(c("qc_extra <- function(input, output) {",
    "  output$elsewhere <- plotly::renderPlotly({ NULL })",
    "  output$both <- renderPlotly({ NULL })", "}"), file.path(team, "qc-server.R"))
  writeLines("hook <- function(output) output$inHook <- renderVisNetwork({ NULL })", file.path(team, "hooks", "net.R"))
  writeLines("conflict <- function(output) output$twice <- renderPlot({ NULL })", file.path(team, "a.R"))
  writeLines("conflict <- function(output) output$twice <- renderPlotly({ NULL })", file.path(team, "b.R"))
  kind <- function(output) api_catalog_render_kind(output, family_file, team)
  stopifnot(identical(kind("inFamily"), "png"), identical(kind("elsewhere"), "plotly"),
    identical(kind("both"), "png"), identical(kind("inHook"), "visnetwork"),
    is.null(kind("nowhere")), is.null(kind("twice")))
  # The editable vector PCA views are plotly whichever Team file adds them (legacy_vector_adapter.R or a hook).
  stopifnot(identical(api_catalog_render("qc_pca_tab-pca2dVectorPlot", "qc_pca_tab", "pca2dVectorPlot"), "plotly"),
    identical(api_catalog_render("qc_pca_tab-load2dVectorPlot", "qc_pca_tab", "load2dVectorPlot"), "plotly"))
  unlink(root, recursive = TRUE)
  cat("PASS catalog classifier: family file first, then other Team files; conflicting or missing definitions are unclassified\n")
})
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
    api_catalog_entry("group_comparison_tab-comparisonPlot")$render == "html",
    api_catalog_entry("qc_pca_tab-guided_qc_plot")$render == "plotly")
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
