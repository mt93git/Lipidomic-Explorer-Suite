# Controls Team's modules build at run time (renderUI per group or per sample:
# customCol_<group>, customShape_<group>, bqcSamples) are not in a card's static
# allowedInputs, so Team's canvas never saves them. Nexo offers them in the Inspector
# (Gerardo, 2026-11-06) and keeps them in its own checkpoint member: the schema must
# carry them, marked computed, and a PATCH must accept them. Selectize controls with
# Team's drag_drop plugin ("Order matters") must say so, so the Inspector keeps order.
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_computed_controls: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_computed_controls")
source("frontends/nexo-api/engine.R")

stopifnot(api_is_computed_id(c("customCol_Control", "customShape_Case_A", "bqcSamples", "gridLog2fcThresh", "colorGrouping", "customCol_", "gridLog2fcThreshX")) ==
  c(TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE))
cat("PASS computed ids are customCol_<g>, customShape_<g>, bqcSamples and gridLog2fcThresh only\n")

s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
fails <- function(expr) inherits(tryCatch({ force(expr); NULL }, error = function(e) e), "error")
by_id <- function(controls) stats::setNames(controls, vapply(controls, function(x) x$id, character(1)))

# 1. Ordered selectize: Team's groupingMetadata uses options = list(plugins = list('drag_drop')).
card <- api_card_create(s, "logratio_tab-logratioPlot")
grouping <- by_id(api_card_schema(s, card$instanceId)$controls)$groupingMetadata
stopifnot(!is.null(grouping), "drag_drop" %in% unlist(grouping$selectize$plugins))
cat("PASS ordered selectize carries selectize.plugins = drag_drop\n")

# 2. Per-group colours appear when Team's own toggle is on (the fixture may already have it), marked computed.
# Pilot F1: on the card family whose pickers reach its plot on a canvas copy (the cellular organization polar map,
# 14_cellular_org_module.R polar_active_color_map). A QC copy's pickers never reach its PCA and are not offered.
qc <- api_card_create(s, "qc_pca_tab-pca2dPlot")
api_card_update(s, qc$instanceId, list(useCustomColors = TRUE, useShapes = TRUE))
qc_ids <- vapply(api_card_schema(s, qc$instanceId)$controls, `[[`, character(1), "id")
if (any(grepl("^(customCol|customShape)_", qc_ids))) stop("a QC copy offers per-group pickers that never reach its PCA")
cat("PASS a QC copy offers no customCol_/customShape_ (its colours follow the session palette)\n")
source <- "cellular_org_tab-polarPlot"
stopifnot("useCustomColors" %in% team_plot_instance_input_ids(source))
card <- api_card_create(s, source)
id <- card$instanceId
api_card_update(s, id, list(useCustomColors = TRUE))
controls <- by_id(api_card_schema(s, id)$controls)
cols <- names(controls)[startsWith(names(controls), "customCol_")]
if (!length(cols)) stop("no customCol_ control after useCustomColors = TRUE")
stopifnot(all(vapply(controls[cols], function(x) isTRUE(x$computed) && identical(x$type, "color"), logical(1))))
cat(sprintf("PASS %d per-group colour controls are offered, marked computed\n", length(cols)))

# 3. A PATCH accepts them, records them as explicit (render cache key) and sets the live input.
api_card_update(s, id, setNames(list("#123456"), cols[[1L]]))
stopifnot(identical(s$explicit[[id]][[cols[[1L]]]], "#123456"))
stopifnot(identical(api_read(s, s$mock$input[[paste0(id, "-", cols[[1L]])]]), "#123456"))
cat("PASS a computed colour is accepted, live and part of the explicit inputs\n")

# 4. Still validated: a bad colour and a computed-looking id the module never built are refused.
stopifnot(fails(api_card_update(s, id, setNames(list("not-a-colour"), cols[[1L]]))))
stopifnot(fails(api_card_update(s, id, list(customCol_NoSuchGroup = "#123456"))))
stopifnot(fails(api_card_update(s, id, list(somethingElse = 1))))
cat("PASS computed values are typed-checked; unknown ids are still refused\n")

# 5. Shapes: Team's selectInput choices (pch numbers with names) come through as options.
api_card_update(s, id, list(useShapes = TRUE))
controls <- by_id(api_card_schema(s, id)$controls)
shapes <- names(controls)[startsWith(names(controls), "customShape_")]
if (length(shapes)) {
  shape <- controls[[shapes[[1L]]]]
  stopifnot(isTRUE(shape$computed), length(shape$options) > 1L)
  api_card_update(s, id, setNames(list(shape$options[[2L]]$value), shapes[[1L]]))
  cat(sprintf("PASS %d per-group shape controls, options %s\n", length(shapes),
    paste(vapply(shape$options, function(o) paste0(o$label, "=", o$value), character(1)), collapse = ", ")))
} else cat("NOTE no customShape_ control on this fixture (useShapes needs a shape grouping)\n")

# 6. BQC samples: the renderUI checkbox list, marked computed when the fixture has samples.
card <- api_card_create(s, "qc_pca_tab-bqcPlot")
bqc <- by_id(api_card_schema(s, card$instanceId)$controls)$bqcSamples
if (!is.null(bqc)) {
  stopifnot(isTRUE(bqc$computed), length(bqc$options) > 1L)
  pick <- vapply(bqc$options[1:2], function(o) o$value, character(1))
  api_card_update(s, card$instanceId, list(bqcSamples = pick))
  stopifnot(identical(as.character(unlist(s$explicit[[card$instanceId]]$bqcSamples)), pick))
  cat(sprintf("PASS bqcSamples offered (%d samples), marked computed and accepted\n", length(bqc$options)))
} else cat("NOTE no bqcSamples control on this fixture\n")
# 7. Structural grid (chart audit b08): Team's drawer builds "Log2FC Threshold (abs):" in renderUI
# (12_structural_grid_module.R gridLog2fcThreshUI), outside allowedInputs; it filters all four grid plots.
for (source in paste0("structural_grid_tab-", c("heatmapPlot", "dotplotPlot", "mergedPlot", "diffAllPlot")))
  stopifnot(!"gridLog2fcThresh" %in% team_plot_instance_input_ids(source))
stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
card <- api_card_create(s, "structural_grid_tab-heatmapPlot")
lfc <- by_id(api_card_schema(s, card$instanceId)$controls)$gridLog2fcThresh
if (is.null(lfc)) stop("structural grid: no gridLog2fcThresh control in the card schema")
stopifnot(isTRUE(lfc$computed), identical(lfc$type, "number"), isTRUE(all.equal(as.numeric(lfc$min), 0)))
api_card_update(s, card$instanceId, list(gridLog2fcThresh = 0.5))
stopifnot(isTRUE(all.equal(as.numeric(s$explicit[[card$instanceId]]$gridLog2fcThresh), 0.5)))
stopifnot(isTRUE(all.equal(as.numeric(api_read(s, s$mock$input[[paste0(card$instanceId, "-gridLog2fcThresh")]])), 0.5)))
stopifnot(fails(api_card_update(s, card$instanceId, list(gridLog2fcThresh = -1))))
cat("PASS gridLog2fcThresh offered on the structural grid, marked computed, accepted, below 0 refused\n")
cat("PASS test_api_computed_controls\n")
