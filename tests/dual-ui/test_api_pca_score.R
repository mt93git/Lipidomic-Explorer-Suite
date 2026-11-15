# NEXO-P5/P8: Team's PCA score analysis of a dashboard PCA card (R/results_dashboard.R rd_pca_score_ui; Team's inspector
# shows its controls under Statistics). Since Team 8e2f5c07/eac6bb75 there is no Run button: the report follows the
# controls (pcs_report), and "Plot on canvas" adds a PCA score card (results_dashboard-plot_pcascore) whose figure carries
# the boxplot, the brackets and the group table. The API reads pcs_report (statistics.R api_pca_score) and renders the
# card like any other. Nothing is recomputed outside Team's module.
# Synthetic workbook with three groups, built here. ASCII only.
for (pkg in c("shiny", "jsonlite", "digest", "xml2", "zip", "openxlsx", "readxl")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_pca_score: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_pca_score")
source("frontends/nexo-api/engine.R")
source("frontends/nexo-api/statistics.R")
source("frontends/nexo-api/datasets.R")
root <- tempfile()
Sys.setenv(LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_API_WORKSPACE = "pca-score", LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
on.exit(unlink(root, recursive = TRUE), add = TRUE)
if (!exists("api_pca_score", mode = "function")) stop("FAIL api_pca_score is not defined (the API cannot read Team's PCA score analysis)")

# ---- Synthetic workbook: groups Alpha, Beta, Gamma (4 samples each), moderate separation on the first axis -------
groups <- rep(c("Alpha", "Beta", "Gamma"), each = 4); samples <- paste0(groups, "_", rep(1:4, 3))
fixture <- "tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx"
wb <- openxlsx::loadWorkbook(fixture)
base <- as.data.frame(readxl::read_excel(fixture, sheet = "Abundance"))
set.seed(20261111)
df <- data.frame(Lipid = base$Lipid)
shift <- c(Alpha = 0, Beta = 0.6, Gamma = 1.2)
for (i in seq_along(samples)) df[[samples[[i]]]] <- 2^(seq(10, 15, length.out = nrow(df)) +
  shift[[groups[[i]]]] * rep(c(1, -1), length.out = nrow(df)) + rnorm(nrow(df), 0, .5))
meta <- data.frame(FullName = samples, Group1Term = groups, Group2Term = "Plasma",
  ReplicateTerm = as.character(rep(1:4, 3)), PatientTerm = paste0("Unit_", seq_along(samples)), TimePointTerm = "")
for (sheet in c("Abundance", "Metadata")) { openxlsx::removeWorksheet(wb, sheet); openxlsx::addWorksheet(wb, sheet) }
openxlsx::writeData(wb, "Abundance", df); openxlsx::writeData(wb, "Metadata", meta)
openxlsx::worksheetOrder(wb) <- match(api_dataset_sheets, names(wb))
workbook <- tempfile(fileext = ".xlsx"); on.exit(unlink(workbook), add = TRUE)
openxlsx::saveWorkbook(wb, workbook)
settings <- list(samples = samples, minDetectionPct = 0, detectionScope = "global", dropNonDetected = TRUE,
  normalizationMethod = "median", useImputation = TRUE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = FALSE)
s <- api_dataset_session(workbook, settings)

card <- api_card_create(s, "results_dashboard-plot_pca"); id <- card$instanceId
report_text <- function(r) paste(vapply(r$report, `[[`, character(1), "text"), collapse = "\n")
has <- function(r, text) grepl(text, report_text(r), fixed = TRUE)
fail <- function(...) stop("FAIL ", ...)

# 1. Controls listed: Team's choices and defaults, the groups of this dataset; no Run button (Team has none now).
schema <- api_card_schema(s, id)
control <- function(key) { hit <- Filter(function(x) identical(x$id, key), schema$controls); if (length(hit) != 1L) fail("control ", key, " missing"); hit[[1L]] }
values <- function(c) vapply(c$options, function(o) as.character(o$value), character(1))
shown <- function(c) as.character(unlist(c$value %||% c$default))
if (!identical(values(control("pcs_pc")), paste0("PC", 1:5)) || !identical(shown(control("pcs_pc")), "PC1")) fail("pcs_pc: PC1..PC5, PC1 by default")
if (!identical(values(control("pcs_groups")), c("Alpha", "Beta", "Gamma")) || !identical(shown(control("pcs_groups")), c("Alpha", "Beta", "Gamma")))
  fail("pcs_groups: the three groups, all chosen: ", deparse(values(control("pcs_groups"))), " / ", deparse(shown(control("pcs_groups"))))
if (!identical(values(control("pcs_test")), c("rank", "param")) || !identical(shown(control("pcs_test")), "rank")) fail("pcs_test: rank and param, rank by default")
if (!identical(values(control("pcs_corr")), c("BH", "holm", "bonferroni", "none")) || !identical(shown(control("pcs_corr")), "BH")) fail("pcs_corr: four corrections, BH by default")
if (length(Filter(function(a) identical(a$id, "pcs_run"), schema$actionControls))) fail("Team has no Run PCA score analysis button any more")
cat("PASS controls listed: component, groups, tests, correction (Team's defaults), no Run\n")

# 2. The PCA card's report follows the controls at once (rank-based default: Kruskal-Wallis + Mann-Whitney, BH);
#    the figure and the table are the canvas card's, not the inspector's.
r <- api_pca_score(s, id)
if (!has(r, "Kruskal-Wallis across all 3 groups at once: p = ") || !has(r, "Mann-Whitney U (normal approximation) on each pair of groups (3 comparisons).") ||
    !has(r, "Benjamini-Hochberg correction across the 3 pairwise comparisons.")) fail("rank report: ", report_text(r))
if (!has(r, "Alpha vs Beta: adjusted p = ") || !any(vapply(r$report, function(x) isTRUE(x$note), logical(1)))) fail("rank report lacks comparisons or the stars note")
if (!is.null(r$figure) || !is.null(r$table) || !is.null(r$status)) fail("the inspector reply carries no figure, table or status: ", jsonlite::toJSON(r[c("status", "figure", "table")], auto_unbox = TRUE, null = "null"))
cat("PASS the report follows the controls without Run: Kruskal-Wallis + Mann-Whitney U, BH\n")

# 3. Parametric: one-way ANOVA + Welch t-test, recomputed after the change.
invisible(api_card_update(s, id, list(pcs_test = "param")))
r <- api_pca_score(s, id)
if (!has(r, "One-way ANOVA across all 3 groups at once") || !has(r, "Welch t-test on each pair of groups (3 comparisons).")) fail("param report: ", report_text(r))
cat("PASS parametric analysis: one-way ANOVA + Welch t-test\n")

# 4. Correction applied: none reports unadjusted p; Bonferroni reports adjusted p, never smaller.
p_of <- function(r) { lines <- grep(" vs ", vapply(r$report, `[[`, character(1), "text"), value = TRUE)
  suppressWarnings(as.numeric(sub("^.*p = ([0-9.]+) .*$", "\\1", lines))) }
invisible(api_card_update(s, id, list(pcs_test = "rank", pcs_corr = "none"))); none <- api_pca_score(s, id)
invisible(api_card_update(s, id, list(pcs_corr = "bonferroni"))); bonf <- api_pca_score(s, id)
if (!has(none, "No multiple-testing correction was applied; p-values are unadjusted.") || has(none, "adjusted p = ")) fail("none: ", report_text(none))
if (!has(bonf, "Bonferroni correction across the 3 pairwise comparisons.") || !has(bonf, "adjusted p = ")) fail("bonferroni: ", report_text(bonf))
pn <- p_of(none); pb <- p_of(bonf)
if (length(pn) != 3L || anyNA(pn) || anyNA(pb) || any(pb < pn) || !any(pb > pn)) fail("Bonferroni p ", deparse(pb), " vs unadjusted ", deparse(pn))
cat("PASS correction applied: unadjusted", paste(pn, collapse = ", "), "-> Bonferroni", paste(pb, collapse = ", "), "\n")

# 5. Team's own refusal: fewer than two groups.
invisible(api_card_update(s, id, list(pcs_groups = "Alpha")))
r <- api_pca_score(s, id)
if (!identical(r$message, "Choose at least two groups.") || length(r$report)) fail("one group: ", jsonlite::toJSON(r, auto_unbox = TRUE, null = "null"))
cat("PASS one group: Team's message, no result\n")

# 6. "Plot on canvas": a PCA score card with the PCA card's settings opens at Team's 620x700 and renders Team's figure:
#    one box per group, a bracket and stars per pair, the group table (header, a colour dot per group) below the plot.
invisible(api_card_update(s, id, list(pcs_groups = c("Alpha", "Beta", "Gamma"), pcs_test = "param", pcs_corr = "holm", pcs_pc = "PC2")))
entry <- Filter(function(e) identical(e$id, "results_dashboard-plot_pcascore"), api_catalog())
if (length(entry) != 1L || !identical(entry[[1L]]$defaultSize, list(width = 620L, height = 700L)))
  fail("catalog: the PCA score card opens at 620x700: ", jsonlite::toJSON(entry[[1L]]$defaultSize, auto_unbox = TRUE))
pcs_inputs <- api_card_get(s, id)$inputs[card$allowedInputs]; pcs_inputs <- pcs_inputs[!vapply(pcs_inputs, is.null, logical(1))]
score <- api_card_create(s, "results_dashboard-plot_pcascore", pcs_inputs)
fig <- api_card_render(s, score$instanceId, 620, 700)$figure
boxes <- Filter(function(t) identical(t$type, "box"), fig$data)
proxies <- Filter(function(t) isTRUE(t$meta$teamLegendProxy), fig$data)
texts <- vapply(fig$layout$annotations, function(a) as.character(a$text), character(1))
if (length(boxes) != 3L || length(fig$layout$shapes) != 3L || !all(texts[1:3] %in% c("*", "**", "***", "ns")))
  fail("figure: ", length(boxes), " boxes, ", length(fig$layout$shapes), " brackets, annotations ", paste(texts, collapse = " | "))
if (!all(c("<b>Group</b>", "<b>Median PC2</b>", "<b>n</b>") %in% texts) || !any(grepl("^Alpha \\(n = 4\\)$", texts)) || length(proxies) != 3L ||
    !identical(vapply(proxies, `[[`, character(1), "legendgroup"), vapply(boxes, `[[`, character(1), "legendgroup")))
  fail("group table: ", paste(texts, collapse = " | "), "; ", length(proxies), " dots")
cat("PASS Plot on canvas: a 620x700 PCA score card renders the boxes, brackets, stars and group table (PC2)\n")

# 7. The PCA score card keeps the controls (Statistics tab) and its own report; other cards are refused.
r <- api_pca_score(s, score$instanceId)
if (!has(r, "One-way ANOVA across all 3 groups") || !has(r, "Holm correction across the 3 pairwise comparisons.")) fail("score card report: ", report_text(r))
other <- api_card_create(s, "results_dashboard-plot_dist")
refused <- tryCatch(api_pca_score(s, other$instanceId), error = identity)
if (!inherits(refused, "api_unprocessable")) fail("a non-PCA card must be refused")
cat("PASS the PCA score card has the analysis; other cards refused\n")

# 8. Save -> reopen: Team's validator keeps the PCA score card and its settings; the reopened card draws the same figure.
node <- paste0(score$instanceId, "-plot_pcascore")
nodes <- list(list(kind = "plot", id = node, label = "PCA score analysis \u00b7 PC2", x = 0, y = 0, width = 620, height = 700,
  visual = list(), instance = list(id = score$instanceId, source = "results_dashboard-plot_pcascore", inputs = pcs_inputs)))
record <- api_checkpoint_save(s, "pca-score", list(token = "pca-score", state = list(version = "1", libraryHidden = FALSE, nodes = nodes)), list(version = 1, nodes = list()))
path <- api_checkpoint_path(record$id)
invisible(api_session_close(s))
archive <- read_session_archive(path, include_team_canvas = TRUE); on.exit(unlink(archive$directory, recursive = TRUE), add = TRUE)
saved <- team_canvas_validate(archive$canvas)$nodes[[1L]]
if (!identical(saved$instance$source, "results_dashboard-plot_pcascore") || !identical(saved$instance$inputs$pcs_test, "param") || !identical(saved$instance$inputs$pcs_corr, "holm") ||
    !identical(saved$instance$inputs$pcs_pc, "PC2") || !identical(as.character(unlist(saved$instance$inputs$pcs_groups)), c("Alpha", "Beta", "Gamma")))
  fail("Team's validator does not keep the PCA score card: ", jsonlite::toJSON(saved, auto_unbox = TRUE))
s2 <- api_session_open(path); on.exit(api_session_close(s2), add = TRUE)
fig <- api_card_render(s2, score$instanceId, 620, 700)$figure
texts <- vapply(fig$layout$annotations, function(a) as.character(a$text), character(1))
if (!"<b>Median PC2</b>" %in% texts || length(Filter(function(t) identical(t$type, "box"), fig$data)) != 3L) fail("reopened: ", paste(texts, collapse = " | "))
cat("PASS save -> reopen: Team keeps the PCA score card (ANOVA, Holm, PC2) and Nexo draws it again\n")

# 9. Round trip: the Team canvas opened in Nexo (s2) and saved again, unchanged, still reads in Team with the card,
#    its 620x700 size, label and settings.
opened <- Filter(function(n) identical(n$instance$source, "results_dashboard-plot_pcascore"), s2$canvas$nodes)
if (length(opened) != 1L || !identical(opened[[1L]]$instance$inputs$pcs_test, "param") || !identical(as.numeric(opened[[1L]]$width), 620) ||
    !identical(as.numeric(opened[[1L]]$height), 700)) fail("Nexo does not open the Team canvas with the PCA score card: ", jsonlite::toJSON(s2$canvas$nodes, auto_unbox = TRUE))
again <- api_checkpoint_save(s2, "pca-score-again", list(token = "pca-score-again", state = s2$canvas), list(version = 1, nodes = list()))
archive2 <- read_session_archive(api_checkpoint_path(again$id), include_team_canvas = TRUE); on.exit(unlink(archive2$directory, recursive = TRUE), add = TRUE)
back <- team_canvas_validate(archive2$canvas)$nodes[[1L]]
if (!identical(back$id, node) || !identical(back$label, "PCA score analysis · PC2") || !identical(as.numeric(c(back$width, back$height)), c(620, 700)) ||
    !identical(back$instance, saved$instance)) fail("Team -> Nexo -> Team loses the PCA score card: ", jsonlite::toJSON(back, auto_unbox = TRUE))
cat("PASS Team canvas -> Nexo -> Team canvas keeps the PCA score card, its size, label and settings\n")
cat("PASS test_api_pca_score\n")
