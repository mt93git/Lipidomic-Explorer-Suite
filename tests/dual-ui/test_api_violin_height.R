# Chart audit b05 F5: the violin view (heatmap_barchart_tab-violin_plot_render) reports the module's own plot
# height as plotHeight: the settled instance value of violin_zoom_pct, which the module's renderUI seeds from
# its own formula. Nexo sizes the card from it. Never recomputed here: compared with the instance input.
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_violin_height: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_violin_height")
source("R/frontends/api/engine.R")
fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
if (!file.exists(fixture)) { cat("SKIP test_api_violin_height: fixture missing\n"); quit(status = 0) }
source_id <- "heatmap_barchart_tab-violin_plot_render"

# 1. The catalog names the height input for this card only.
entry <- api_catalog_entry(source_id)
if (!identical(entry$heightInput, "violin_zoom_pct")) stop("catalog heightInput: ", deparse(entry$heightInput))
others <- Filter(function(x) !identical(x$id, source_id) && !is.null(x$heightInput), api_catalog())
if (length(others)) stop("other cards carry heightInput: ", others[[1L]]$id)
cat("PASS catalog names violin_zoom_pct for the violin view only\n")

s <- api_session_open(fixture)
on.exit(api_session_close(s), add = TRUE)

# 2. Create: plotHeight is the settled instance value of violin_zoom_pct (the module seeded it).
card <- api_card_create(s, source_id)
live <- api_read(s, s$mock$input[[paste0(card$instanceId, "-violin_zoom_pct")]])
if (is.null(card$plotHeight)) stop("create returned no plotHeight")
if (length(live) != 1L || !is.finite(suppressWarnings(as.numeric(live)))) stop("violin_zoom_pct not seeded: ", deparse(live))
if (!identical(as.numeric(card$plotHeight), as.numeric(live))) stop("plotHeight ", card$plotHeight, " != violin_zoom_pct ", live)
if (card$plotHeight < 400) stop("plotHeight below the module's floor: ", card$plotHeight)
if (!identical(as.numeric(card$inputs$violin_zoom_pct), as.numeric(card$plotHeight))) stop("card inputs disagree with plotHeight")
cat("PASS create plotHeight", card$plotHeight, "= violin_zoom_pct\n")

# 3. PATCH: plotHeight follows the input.
updated <- api_card_update(s, card$instanceId, list(violin_zoom_pct = 1200))
if (!identical(as.numeric(updated$plotHeight), 1200)) stop("PATCH plotHeight: ", deparse(updated$plotHeight))
if (!identical(as.numeric(updated$inputs$violin_zoom_pct), 1200)) stop("PATCH violin_zoom_pct: ", deparse(updated$inputs$violin_zoom_pct))
cat("PASS PATCH violin_zoom_pct 1200 -> plotHeight 1200\n")

# 4. The render at that height is a PNG of that height (read from the IHDR chunk).
render <- api_card_render(s, card$instanceId, 620, updated$plotHeight)
if (!identical(render$render, "png") || !is.raw(render$png)) stop("violin render is not a PNG")
png_height <- sum(as.integer(render$png[21:24]) * 256^(3:0))
if (png_height != 1200) stop("PNG height ", png_height, " (expected 1200)")
cat("PASS render at plotHeight returns a PNG 1200 px tall\n")

# 5. A card that names no height input reports none.
other <- api_card_create(s, "heatmap_barchart_tab-heatmapPlot")
if (!is.null(other$plotHeight)) stop("heatmapPlot reports a plotHeight")
cat("PASS other cards carry no plotHeight\n")
cat("PASS test_api_violin_height\n")
