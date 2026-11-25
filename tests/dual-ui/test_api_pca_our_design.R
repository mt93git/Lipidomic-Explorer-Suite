# Nexo always shows the frontend's PCA design: the dashboard "Principal components" card for the scores and the
# dashboard "PCA loadings" card for the loadings. The Quality-check PCA images (qc_pca_tab-pca2dPlot,
# -pca2dVectorPlot, -load2dPlot, -load2dVectorPlot) keep running in Team's backend but Nexo never offers them,
# never creates them and reopens old boards that hold them as the dashboard cards. The loadings card reads the same
# PCA as the scores card (pca_data(), the same pca_transform / pca_scale): nothing is recomputed differently.
# Synthetic checkpoint only.
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_pca_our_design: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_pca_our_design")
source("frontends/nexo-api/engine.R")
fail <- function(...) stop("FAIL ", ..., call. = FALSE)
root <- tempfile()
Sys.setenv(LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_API_WORKSPACE = "pca-our-design", LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
on.exit(unlink(root, recursive = TRUE), add = TRUE)
qc <- c("qc_pca_tab-pca2dPlot", "qc_pca_tab-pca2dVectorPlot", "qc_pca_tab-load2dPlot", "qc_pca_tab-load2dVectorPlot")
ours <- c("results_dashboard-plot_pca", "results_dashboard-plot_pca", "results_dashboard-plot_loadings", "results_dashboard-plot_loadings")

# 1. The catalog Nexo is served (GET /api/v1/catalog) has the loadings card and none of the four QC PCA cards.
#    The full catalog still lists every Team output (create and restore look entries up there).
if (!exists("api_catalog_served", mode = "function")) fail("api_catalog_served (the catalog GET /catalog serves) is not defined")
served <- vapply(api_catalog_served(), `[[`, character(1), "id")
if (any(qc %in% served)) fail("the served catalog still offers ", paste(intersect(qc, served), collapse = ", "))
if (!"results_dashboard-plot_loadings" %in% served) fail("the served catalog has no results_dashboard-plot_loadings")
entry <- api_catalog_entry("results_dashboard-plot_loadings")
if (!identical(entry$label, "PCA loadings") || !identical(entry$group, "Dashboard") || !identical(entry$render, "plotly"))
  fail("loadings entry: ", entry$label, " / ", entry$group, " / ", entry$render)
if (!all(c("pca_transform", "pca_scale") %in% entry$allowedInputs)) fail("the loadings card does not take the PCA controls")
all_ids <- vapply(api_catalog(), `[[`, character(1), "id")
if (!all(qc %in% all_ids) || length(all_ids) - length(served) != length(qc)) fail("api_catalog() must keep every Team output")
cat("PASS the served catalog hides the four QC PCA cards and lists PCA loadings\n")

s <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")

# 2. A create request (POST /sessions/<id>/cards) for any of the four QC sources yields our card; QC-only inputs drop.
if (!exists("api_card_create_requested", mode = "function")) fail("api_card_create_requested (the POST /cards handler) is not defined")
for (i in seq_along(qc)) {
  card <- api_card_create_requested(s, list(source = qc[[i]], inputs = list(scoreMarkerSize2D = 9)))
  if (!identical(card$source, ours[[i]])) fail(qc[[i]], " created ", card$source, " instead of ", ours[[i]])
  if (!identical(card$nodeId, paste0(card$instanceId, "-", sub("^results_dashboard-", "", ours[[i]])))) fail("node id ", card$nodeId)
}
plain <- api_card_create_requested(s, list(source = "qc_pca_tab-boxplotAfterNorm"))
if (!identical(plain$source, "qc_pca_tab-boxplotAfterNorm")) fail("other QC cards are created as asked")
cat("PASS creating a QC PCA card from Nexo creates the dashboard card instead\n")

# 3. The loadings figure: Plotly, one point per lipid the PCA kept, x = PC1 loading and y = PC2 loading of the very
#    PCA the scores card draws (same pca_data(), same transform and scaling), axis titles with % variance.
check_loadings <- function(transform, scale) {
  main <- list(`results_dashboard-pca_transform` = transform, `results_dashboard-pca_scale` = scale)
  do.call(api_inputs, c(list(s), main)); api_flush(s)
  pca <- api_read(s, s$dashboard$pca())
  rot <- pca$pc$rotation
  card <- api_card_create(s, "results_dashboard-plot_loadings", list(pca_transform = transform, pca_scale = scale))
  rendered <- api_card_render(s, card$instanceId, 620, 720)
  if (!identical(rendered$render, "plotly") || is.null(rendered$figure)) fail("the loadings card is not a Plotly figure")
  traces <- Filter(function(t) identical(t$type, "scatter"), rendered$figure$data)
  lipid <- unlist(lapply(traces, function(t) unlist(t$customdata)))
  x <- unlist(lapply(traces, function(t) unlist(t$x))); y <- unlist(lapply(traces, function(t) unlist(t$y)))
  if (length(lipid) != nrow(rot) || anyDuplicated(lipid) || !setequal(lipid, rownames(rot)))
    fail(sprintf("%s/%s: %d points for %d kept lipids", transform, scale, length(lipid), nrow(rot)))
  if (max(abs(x - rot[lipid, 1])) > 1e-9 || max(abs(y - rot[lipid, 2])) > 1e-9)
    fail(transform, "/", scale, ": loadings differ from the dashboard PCA rotation")
  if (any(vapply(traces, function(t) any(grepl("text", t$mode %||% "")), logical(1)))) fail("no on-plot text labels")
  layout <- rendered$figure$layout
  title <- function(axis) { x <- layout[[axis]]$title; if (is.list(x)) x$text else x }
  want <- sprintf("PC%d loading (%.1f%%)", 1:2, pca$ve[1:2])
  if (!identical(title("xaxis"), want[[1]]) || !identical(title("yaxis"), want[[2]]))
    fail("axis titles ", title("xaxis"), " / ", title("yaxis"), " want ", paste(want, collapse = " / "))
  classes <- unique(rd_class(rownames(rot)))
  if (length(classes) > 1L && length(traces) != length(classes)) fail("one trace per lipid class: ", length(traces), " for ", length(classes))
  first <- unlist(traces[[1]]$customdata)[[1]]
  if (!grepl(htmltools::htmlEscape(first), unlist(traces[[1]]$text)[[1]], fixed = TRUE)) fail("the hover text names the lipid")
  invisible(length(lipid))
}
n <- check_loadings("log2", "uv")
check_loadings("log10", "none")
cat(sprintf("PASS the loadings card draws the dashboard PCA's PC1/PC2 loadings, one point per kept lipid (%d)\n", n))

# 4. An old board that holds the QC cards reopens them as our cards, same place and size; QC-only inputs drop.
nodes <- list(
  list(kind = "plot", id = "tcinstance_oldpca00001-pca2dPlot", label = "PCA scores", x = 10, y = 20, width = 640, height = 700,
    visual = list(background = "#ffffff"),
    instance = list(id = "tcinstance_oldpca00001", source = "qc_pca_tab-pca2dPlot", inputs = list(scoreMarkerSize2D = 9))),
  list(kind = "plot", id = "tcinstance_oldload0001-load2dVectorPlot", label = "PCA loadings", x = 700, y = 20, width = 600, height = 650,
    visual = list(background = "#ffffff"),
    instance = list(id = "tcinstance_oldload0001", source = "qc_pca_tab-load2dVectorPlot", inputs = list())),
  list(kind = "plot", id = "qc_pca_tab-load2dPlot", label = "PCA loadings (fixed)", x = 0, y = 800, width = 620, height = 720,
    visual = list(background = "#ffffff")))
record <- api_checkpoint_save(s, "pca-our-design", list(token = "pca-our-design", state = list(version = "1", libraryHidden = FALSE, nodes = nodes)))
path <- api_checkpoint_path(record$id)
api_session_close(s)
r <- api_session_open(path)
on.exit(api_session_close(r), add = TRUE)
expect <- list(tcinstance_oldpca00001 = "results_dashboard-plot_pca", tcinstance_oldload0001 = "results_dashboard-plot_loadings",
  tcinstance_fixed_qc_pca_tab_load2dplot = "results_dashboard-plot_loadings")
for (id in names(expect)) {
  saved <- api_card_saved(r, id)
  if (!identical(saved$source, expect[[id]])) fail("saved ", id, " resolves to ", saved$source %||% "nothing")
  rendered <- api_card_render(r, id, 620, 720)
  card <- api_card_get(r, id)
  if (!identical(card$source, expect[[id]]) || !identical(rendered$render, "plotly")) fail(id, " restored as ", card$source)
  if (!is.null(card$inputs$scoreMarkerSize2D)) fail("a QC-only input reached the dashboard card")
}
if (isTRUE(r$dirty)) fail("restoring the dashboard cards must not dirty the session")
cat("PASS a saved board with QC PCA cards reopens them as the dashboard scores and loadings cards\n")
