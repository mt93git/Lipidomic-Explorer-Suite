# NEXO-P5: Team's PCA score analysis on a dashboard PCA card (R/results_dashboard.R rd_pca_score_ui and the pcs_*
# outputs; Team's inspector shows them under Statistics). The controls are the card's own inputs (pcs_pc, pcs_groups,
# pcs_test, pcs_corr) and its module button pcs_run; the API reads what Team's module rendered for pcs_status,
# pcs_plot, pcs_table and pcs_report (statistics.R api_pca_score). Nothing is recomputed outside Team's module.
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

# 1. Controls listed: Team's choices and defaults, the groups of this dataset, and the Run button.
schema <- api_card_schema(s, id)
control <- function(key) { hit <- Filter(function(x) identical(x$id, key), schema$controls); if (length(hit) != 1L) fail("control ", key, " missing"); hit[[1L]] }
values <- function(c) vapply(c$options, function(o) as.character(o$value), character(1))
shown <- function(c) as.character(unlist(c$value %||% c$default))
if (!identical(values(control("pcs_pc")), paste0("PC", 1:5)) || !identical(shown(control("pcs_pc")), "PC1")) fail("pcs_pc: PC1..PC5, PC1 by default")
if (!identical(values(control("pcs_groups")), c("Alpha", "Beta", "Gamma")) || !identical(shown(control("pcs_groups")), c("Alpha", "Beta", "Gamma")))
  fail("pcs_groups: the three groups, all chosen: ", deparse(values(control("pcs_groups"))), " / ", deparse(shown(control("pcs_groups"))))
if (!identical(values(control("pcs_test")), c("rank", "param")) || !identical(shown(control("pcs_test")), "rank")) fail("pcs_test: rank and param, rank by default")
if (!identical(values(control("pcs_corr")), c("BH", "holm", "bonferroni", "none")) || !identical(shown(control("pcs_corr")), "BH")) fail("pcs_corr: four corrections, BH by default")
run <- Filter(function(a) identical(a$id, "pcs_run"), schema$actionControls)
if (length(run) != 1L || !identical(run[[1L]]$label, "Run PCA score analysis")) fail("the Run PCA score analysis button is not offered")
cat("PASS controls listed: component, groups, tests, correction (Team's defaults) and Run\n")

# 2. Before Run: Team's status sentence, no result.
r <- api_pca_score(s, id)
if (!identical(r$status, "Choose the component, groups and tests, then run the analysis.") || !is.null(r$figure) || length(r$report))
  fail("before Run the analysis must show Team's status and no result: ", jsonlite::toJSON(r, auto_unbox = TRUE, null = "null"))
cat("PASS before Run: Team's status, no result\n")

# 3. Rank-based (default): Kruskal-Wallis + Mann-Whitney, BH; table of three groups; boxplot with brackets and stars.
api_card_update(s, id, list(), "pcs_run")
r <- api_pca_score(s, id)
if (!is.null(r$status)) fail("after Run the status sentence must be gone")
if (!has(r, "Kruskal-Wallis across all 3 groups at once: p = ") || !has(r, "Mann-Whitney U (normal approximation) on each pair of groups (3 comparisons).") ||
    !has(r, "Benjamini-Hochberg correction across the 3 pairwise comparisons.")) fail("rank report: ", report_text(r))
if (!has(r, "Alpha vs Beta: adjusted p = ") || !any(vapply(r$report, function(x) isTRUE(x$note), logical(1)))) fail("rank report lacks comparisons or the stars note")
if (!identical(vapply(r$table$rows, function(x) x$cells[[1L]], character(1)), c("Alpha", "Beta", "Gamma")) ||
    !identical(r$table$columns, list("Group", "Median PC1", "n")) || !all(grepl("^#", vapply(r$table$rows, `[[`, character(1), "color"))))
  fail("table: ", jsonlite::toJSON(r$table, auto_unbox = TRUE))
boxes <- Filter(function(t) identical(t$type, "box"), r$figure$data)
texts <- vapply(r$figure$layout$annotations, function(a) as.character(a$text), character(1))
if (length(boxes) != 3L || length(r$figure$layout$shapes) != 3L || !any(grepl("^Kruskal-Wallis p = ", texts)) || !all(texts[1:3] %in% c("*", "**", "***", "ns")))
  fail("plot: ", length(boxes), " boxes, ", length(r$figure$layout$shapes), " brackets, annotations ", paste(texts, collapse = " | "))
cat("PASS rank-based analysis runs: Kruskal-Wallis + Mann-Whitney U, BH; table and boxplot with stars\n")

# 4. Parametric: one-way ANOVA + Welch t-test, recomputed after the change and Run.
api_card_update(s, id, list(pcs_test = "param"), "pcs_run")
r <- api_pca_score(s, id)
texts <- vapply(r$figure$layout$annotations, function(a) as.character(a$text), character(1))
if (!has(r, "One-way ANOVA across all 3 groups at once") || !has(r, "Welch t-test on each pair of groups (3 comparisons).") || !any(grepl("^One-way ANOVA p = ", texts)))
  fail("param report: ", report_text(r))
cat("PASS parametric analysis runs: one-way ANOVA + Welch t-test\n")

# 5. Correction applied: none reports unadjusted p; Bonferroni reports adjusted p, never smaller.
p_of <- function(r) { lines <- grep(" vs ", vapply(r$report, `[[`, character(1), "text"), value = TRUE)
  suppressWarnings(as.numeric(sub("^.*p = ([0-9.]+) .*$", "\\1", lines))) }
api_card_update(s, id, list(pcs_test = "rank", pcs_corr = "none"), "pcs_run"); none <- api_pca_score(s, id)
api_card_update(s, id, list(pcs_corr = "bonferroni"), "pcs_run"); bonf <- api_pca_score(s, id)
if (!has(none, "No multiple-testing correction was applied; p-values are unadjusted.") || has(none, "adjusted p = ")) fail("none: ", report_text(none))
if (!has(bonf, "Bonferroni correction across the 3 pairwise comparisons.") || !has(bonf, "adjusted p = ")) fail("bonferroni: ", report_text(bonf))
pn <- p_of(none); pb <- p_of(bonf)
if (length(pn) != 3L || anyNA(pn) || anyNA(pb) || any(pb < pn) || !any(pb > pn)) fail("Bonferroni p ", deparse(pb), " vs unadjusted ", deparse(pn))
cat("PASS correction applied: unadjusted", paste(pn, collapse = ", "), "-> Bonferroni", paste(pb, collapse = ", "), "\n")

# 6. Team's own refusal: fewer than two groups.
api_card_update(s, id, list(pcs_groups = "Alpha"), "pcs_run")
r <- api_pca_score(s, id)
if (!identical(r$message, "Choose at least two groups.") || !is.null(r$figure)) fail("one group: ", jsonlite::toJSON(r, auto_unbox = TRUE, null = "null"))
cat("PASS one group: Team's message, no result\n")

# 7. Only for dashboard PCA cards.
other <- api_card_create(s, "results_dashboard-plot_dist")
refused <- tryCatch(api_pca_score(s, other$instanceId), error = identity)
if (!inherits(refused, "api_unprocessable")) fail("a non-PCA card must be refused")
cat("PASS other cards refused\n")

# 8. Save -> reopen: the chosen settings are Team's instance inputs (Team's validator keeps them); Nexo's member
#    records the Run press, which the restore replays, so the reopened card shows the same analysis.
api_card_update(s, id, list(pcs_groups = c("Alpha", "Beta", "Gamma"), pcs_test = "param", pcs_corr = "holm", pcs_pc = "PC2"), "pcs_run")
node <- paste0(id, "-plot_pca")
inputs <- api_card_get(s, id)$inputs[card$allowedInputs]
inputs <- inputs[!vapply(inputs, is.null, logical(1))]
nodes <- list(list(kind = "plot", id = node, label = "Principal components", x = 0, y = 0, width = 620, height = 720,
  visual = list(background = "#ffffff"), instance = list(id = id, source = "results_dashboard-plot_pca", inputs = inputs)))
nexo <- list(version = 1, nodes = stats::setNames(list(list(actions = list("pcs_run"))), node))
record <- api_checkpoint_save(s, "pca-score", list(token = "pca-score", state = list(version = "1", libraryHidden = FALSE, nodes = nodes)), nexo)
path <- api_checkpoint_path(record$id)
api_session_close(s)
archive <- read_session_archive(path, include_team_canvas = TRUE); on.exit(unlink(archive$directory, recursive = TRUE), add = TRUE)
saved <- team_canvas_validate(archive$canvas)$nodes[[1L]]$instance$inputs
if (!identical(saved$pcs_test, "param") || !identical(saved$pcs_corr, "holm") || !identical(saved$pcs_pc, "PC2") ||
    !identical(as.character(unlist(saved$pcs_groups)), c("Alpha", "Beta", "Gamma"))) fail("Team's validator does not keep the settings: ", jsonlite::toJSON(saved, auto_unbox = TRUE))
s2 <- api_session_open(path); on.exit(api_session_close(s2), add = TRUE)
r <- api_pca_score(s2, id)
if (!has(r, "One-way ANOVA across all 3 groups") || !has(r, "Holm correction across the 3 pairwise comparisons.") ||
    !identical(r$table$columns[[2L]], "Median PC2")) fail("reopened: ", report_text(r), " / ", jsonlite::toJSON(r$table$columns))
cat("PASS save -> reopen: Team keeps the settings; Nexo reopens the same analysis (ANOVA, Holm, PC2)\n")
cat("PASS test_api_pca_score\n")
