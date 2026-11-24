# Report export: the 40 most significant rows of a "Filtered average heatmap" card (frontends/nexo-api/report.R).
# Part 1 runs the route's logic on a synthetic session (208 significant lipids, 4 classes, 3 groups): it reads the
# card's matrix, Team's differential result and settings, picks the 40 smallest p values (ties by |log2FC|), groups
# them by class, and scales the colours as Team's heatmap does. Part 2 opens the complete synthetic fixture.
# Synthetic data only. ASCII only: R on the RTX has no UTF-8 locale.
`%||%` <- function(a, b) if (is.null(a)) b else a
source("R/utils_vis.R", local = TRUE)
source("frontends/nexo-api/report.R", local = TRUE)
fail <- function(...) stop(paste0(...), call. = FALSE)

# --- Part 1: synthetic session -------------------------------------------------------------------------------------
set.seed(7)
lipids <- sprintf("%s %d:%d synthetic-%03d", rep(c("PC", "PE", "TG", "SM"), length.out = 208), 30 + (1:208) %% 12, (1:208) %% 6, 1:208)
mat <- matrix(2^(rnorm(208 * 3, 10, 1)), nrow = 208, dimnames = list(lipids, c("Control", "TLR4_KLA", "Mix")))
p <- c(rep(1e-6, 5), seq(1e-5, 0.049, length.out = 203))
fc <- c(1.5, 3, 2, -4, 1.2, rep(c(1.1, -1.3, 2.2, -1.8), length.out = 203))
de <- data.frame(Lipid_Name = lipids, log2FC = fc, p_adj_bh = p, p_raw = p / 2, stringsAsFactors = FALSE)
anno <- data.frame(Lipid_Name = lipids, subclass = sub(" .*", "", lipids), stringsAsFactors = FALSE)
s <- list(inputs = list(`data_hub-pValueType` = "adjusted", `data_hub-pFilterThreshold` = 0.05, `data_hub-log2fcThreshold` = 1,
    `data_hub-deReferenceGroups` = "Control", `data_hub-deComparisonGroups` = "TLR4_KLA"),
  shared = list(de_results = function() de, annotationData = function() anno,
    class_color_map = function() c(PC = "#1b9e77", PE = "#d95f02", TG = "#7570b3", SM = "#e7298a")))
cards <- list(heat = list(source = "heatmap_barchart_tab-filteredHeatmapPlot", inputs = list(heatmapScaleMode = "global_zscore")),
  other = list(source = "volcano_tab-volcanoPlot", inputs = list()),
  condensed = list(source = "heatmap_barchart_tab-filteredHeatmapPlot", inputs = list(condenseRows = TRUE)))
api_card_get <- function(s, id) cards[[id]] %||% stop(structure(class = c("api_not_found", "error", "condition"), list(message = "Unknown card.", call = NULL)))
api_flush <- function(s, ...) invisible(NULL)
api_read <- function(s, expr) expr
api_report_card_matrix <- function(s, instanceId) mat

r <- api_report_top_heatmap(s, "heat")
if (!isTRUE(r$available)) fail("the heatmap card should be available, got ", r$reason)
if (r$total != 208L || r$shown != 40L || length(r$rows) != 40L) fail("expected 40 of 208 rows, got ", r$shown, " of ", r$total)
got <- vapply(r$rows, `[[`, "", "lipid")
want <- head(lipids[order(p, -abs(fc), lipids)], 40L)
if (!setequal(got, want)) fail("the rows are not the 40 smallest p values (ties by |log2FC|)")
cls <- vapply(r$rows, `[[`, "", "class")
if (!identical(cls, sort(cls))) fail("the rows are not grouped by class: ", paste(cls, collapse = " "))
for (k in unique(cls)) { pk <- vapply(r$rows[cls == k], `[[`, 0, "p"); if (is.unsorted(pk)) fail("within ", k, " rows are not by p") }
if (!identical(r$comparison, "TLR4_KLA vs Control")) fail("comparison: ", r$comparison)
if (!identical(r$pType, "adjusted") || r$pThreshold != 0.05 || r$fcThreshold != 1) fail("settings not read")
if (!identical(unlist(r$classColors[["PC"]]), "#1B9E77")) fail("class colour not Team's: ", deparse(r$classColors))
if (!identical(as.character(r$groups), colnames(mat))) fail("groups: ", deparse(r$groups))
cat("PASS top 40 of 208 by p then |log2FC|, grouped by class, with Team's settings and class colours\n")

# Colours as Team's heatmap: row z-scores of log2 means, clipped at the palette limit over all the card's rows.
z <- t(scale(t(log2(mat)))); lim <- min(4, max(1, ceiling(max(abs(z))))); z[z > lim] <- lim; z[z < -lim] <- -lim
first <- r$rows[[1L]]
if (max(abs(as.numeric(first$values) - z[first$lipid, ])) > 1e-9) fail("values are not Team's global z-scores")
if (!identical(as.numeric(r$limits), c(-lim, lim))) fail("limits: ", deparse(r$limits))
rel <- api_report_heatmap_scale(mat[1:3, ], "relative")
if (any(abs(apply(rel$matrix, 1, range) - c(0, 100)) > 1e-9)) fail("relative scaling is not 0-100 per row")
cat("PASS colours scaled as Team's heatmap (global z-score, relative)\n")

# Fallbacks: not a filtered heatmap, class averages, no differential result.
if (!identical(api_report_top_heatmap(s, "other")$available, FALSE)) fail("a volcano card must not be available")
if (!identical(api_report_top_heatmap(s, "condensed")$available, FALSE)) fail("condensed rows must not be available")
s$shared$de_results <- function() NULL
if (!identical(api_report_top_heatmap(s, "heat")$available, FALSE)) fail("without a differential result it must not be available")
cat("PASS falls back (not a filtered heatmap, class averages, no differential result)\n")

# --- Part 2: the complete synthetic fixture ------------------------------------------------------------------------
fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
pkgs <- all(vapply(c("shiny", "jsonlite", "digest", "xml2"), requireNamespace, logical(1), quietly = TRUE))
if (!file.exists(fixture) || !pkgs) { cat("SKIP part 2: fixture or packages missing\nPASS test_api_report_heatmap\n"); quit(status = 0) }
rm(api_card_get, api_flush, api_read, api_report_card_matrix)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_report_heatmap")
source("frontends/nexo-api/engine.R"); source("frontends/nexo-api/report.R")
s <- api_session_open(fixture)
on.exit(api_session_close(s), add = TRUE)
api_design(s, "animal", "independent", TRUE)
card <- api_card_create(s, "heatmap_barchart_tab-filteredHeatmapPlot")
r <- api_report_top_heatmap(s, card$instanceId)
json <- jsonlite::toJSON(r, auto_unbox = TRUE, null = "null")
if (isTRUE(r$available)) {
  if (r$shown != min(40L, r$total) || length(r$rows) != r$shown) fail("fixture: shown ", r$shown, " of ", r$total)
  if (!all(vapply(r$rows, function(x) length(x$values) == length(r$groups), logical(1)))) fail("fixture: values per group")
  cat("PASS fixture:", r$shown, "of", r$total, "rows,", r$comparison, "\n")
} else {
  if (!is.character(r$reason) || !nzchar(r$reason)) fail("fixture: unavailable without a reason")
  cat("PASS fixture: unavailable with a reason:", r$reason, "\n")
}
if (!grepl('"available":', json, fixed = TRUE)) fail("the reply does not serialise")
cat("PASS test_api_report_heatmap\n")
