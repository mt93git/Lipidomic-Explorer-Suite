# Team Results dashboard PCA contract and parity fixture.
# This intentionally uses the same canonical matrix recipe as shared_data$pca_results:
# log2(pmax(x, 0) + 1), finite complete lipids, variance >= 1e-10, center + unit scale.

dashboard <- file.path("R", "results_dashboard.R")
stopifnot(file.exists(dashboard))
src <- paste(readLines(dashboard, warn = FALSE), collapse = "\n")

check <- function(label, ok) {
  if (!isTRUE(ok)) stop(label, call. = FALSE)
}

check("dashboard exposes canonical log2 default", grepl('"log2"', src, fixed = TRUE) &&
        grepl("log2(pmax(b$mat, 0) + 1)", src, fixed = TRUE))
check("dashboard uses shared variance cutoff", grepl("sds^2 >= 1e-10", src, fixed = TRUE))
check("PCA honors explicit scaling control", grepl('scale. = identical(input$pca_scale, "uv")', src, fixed = TRUE))
check("canonical transformation is documented", grepl("matching the shared individual-lipid PCA", src, fixed = TRUE))

# Numerical parity fixture: scores/loadings are identical up to the usual PCA sign
# convention (and column order), using the actual production pca_data reactive.
# The rectangular fixture catches transpose/indexing mistakes and includes an
# incomplete row plus a constant row that production must exclude.
x <- matrix(c(
  0, 2, 5, 10,
  1, 0, 4, 8,
  3, 6, 0, 12,
  2, 4, 8, 0,
  7, 7, 7, 7,
  NA, 3, 4, 5
), nrow = 6, byrow = TRUE,
dimnames = list(paste0("L", 1:6), paste0("S", 1:4)))
canonical <- log2(pmax(x, 0) + 1)
keep <- apply(canonical, 1, function(v) all(is.finite(v)) && stats::var(v) >= 1e-10)
canonical <- canonical[keep, , drop = FALSE]
shared <- stats::prcomp(t(canonical), center = TRUE, scale. = TRUE)

# Load and evaluate the production dashboard assignment without starting Shiny.
# This is the same reactive body used by results_dashboard_module_server.
source(file.path("tests", "integration", "helpers.R"), local = TRUE)
dashboard_env <- new.env(parent = environment())
sys.source("R/results_dashboard.R", dashboard_env)
dashboard_env$input <- shiny::reactiveValues(pca_transform = "log2", pca_scale = "uv")
dashboard_env$base <- function() list(
  mat = x,
  log = log10(pmax(x, 0)),
  groups = data.frame(Sample = colnames(x), Group = rep(c("Control", "Sickle cell"), each = 2), stringsAsFactors = FALSE)
)
dashboard_env$sample_info <- function() list(
  group = rep(c("Control", "Sickle cell"), each = 2),
  levels = c("Control", "Sickle cell"),
  colors = c(Control = "#337f87", `Sickle cell` = "#c77958")
)
dashboard_env$pca_data <- NULL
dashboard_assignment <- find_assignment(parse("R/results_dashboard.R"), "pca_data")
eval(dashboard_assignment, dashboard_env)
dashboard_pca <- shiny::isolate(dashboard_env$pca_data())

same_up_to_sign <- function(a, b, tol = 1e-12) {
  if (!all(dim(a) == dim(b))) return(FALSE)
  all(vapply(seq_len(ncol(a)), function(j) {
    max(abs(a[, j] - b[, j])) <= tol || max(abs(a[, j] + b[, j])) <= tol
  }, logical(1)))
}
check("PCA production scores match canonical recipe", same_up_to_sign(shared$x, dashboard_pca$pc$x))
check("PCA production lipids match canonical filtering", identical(dashboard_pca$cl$mat, canonical))
check("PCA production loadings match canonical recipe", same_up_to_sign(shared$rotation, dashboard_pca$pc$rotation))
check("PCA explained variance matches", max(abs((shared$sdev^2 / sum(shared$sdev^2)) -
                                                  (dashboard_pca$pc$sdev^2 / sum(dashboard_pca$pc$sdev^2)))) <= 1e-12)

# The explicit centered-only alternative is exercised through the same
# production reactive and reports its selected scaling metadata.
dashboard_env$input$pca_scale <- "none"
centered_dashboard <- shiny::isolate(dashboard_env$pca_data())
check("centered-only PCA is honored by production reactive",
      identical(centered_dashboard$df$Scaling[[1]], "none"))

cat("PASS: Results dashboard canonical PCA transformation, filtering, scaling, and parity fixture\n")
