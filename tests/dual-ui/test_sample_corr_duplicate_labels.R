# Sample Correlation drives the real buildSampleCorrPlot() and CSV download of
# qc_boxplot_server. Duplicated sample labels (restored checkpoints) failed with
# "factor level [n] is duplicated"; they must draw one tile per sample pair, keep
# originally unique labels untouched, and leave matrix values, order, clustering
# and the CSV unchanged. Unique labels must produce exactly the pre-fix plot data.
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/global.R")

ids <- c("S1", "S2", "S3")
# Helper: originally unique labels are reserved; only duplicated positions change.
stopifnot(identical(qc_unique_corr_labels(ids, c("A", "A", "A (S1)")), c("A (S1).1", "A (S2)", "A (S1)")))
stopifnot(identical(qc_unique_corr_labels(ids, c("a", "b", "c")), c("a", "b", "c")))
stopifnot(identical(qc_unique_corr_labels(c(ids, "S4"), c("a", "b", "a", "c")), c("a (S1)", "b", "a (S3)", "c")))

set.seed(7)
mat <- matrix(rnorm(40), nrow = 10, dimnames = list(paste0("L", 1:10), c("S1", "S2", "S3", "S4")))
cor_mat <- cor(mat, use = "pairwise.complete.obs", method = "pearson")
# Shared data is not consulted: the matrix and the labels are injected below.
none <- function(...) NULL
fields <- c("allParsedMetadata", "all_metadata", "all_numeric_columns", "class_color_map", "color_maps",
  "data_processed", "data_processed_unfiltered", "dataset_revision", "detection_preview", "get_restored_input",
  "global_filtered_lipids", "global_filtered_lipids_all", "pca_fallback_active", "pca_results", "pca_settings",
  "preparation_dirty", "preparation_state", "rawData", "request_team_review_preparation",
  "restored_bqc_manual_exclusions", "restored_outlier_treatments", "restored_qc_decisions", "shape_maps",
  "stats_detail_text", "synthetic_sample_ids", "targeted_mode_active")
shared <- setNames(rep(list(none), length(fields)), fields)
shared$is_restoring <- function() FALSE

# Pre-fix (f053e56) construction of the plot data.
prefix_frame <- function(order, lookup) {
  df <- as.data.frame(cor_mat) %>% tibble::rownames_to_column("Sample1") %>%
    tidyr::pivot_longer(cols = -Sample1, names_to = "Sample2", values_to = "Correlation")
  df$Sample1_Label <- factor(lookup[df$Sample1], levels = lookup[order])
  df$Sample2_Label <- factor(lookup[df$Sample2], levels = lookup[order])
  df
}

run_case <- function(labels, cluster) {
  result <- NULL
  shiny::testServer(qc_boxplot_server, args = list(shared_data = shared, global_color_map = shiny::reactive(list())), {
    assign("buildSampleCorrMatrix", shiny::reactive(cor_mat), envir = session$env)
    scores <- data.frame(FullName = colnames(cor_mat), Label = labels, stringsAsFactors = FALSE)
    assign("plot_data", shiny::reactive(list(scores = scores, replicate_scores = scores)), envir = session$env)
    session$setInputs(mergeReplicatesMode = "single", corrCluster = cluster, corrShowLabels = TRUE,
      corrMethod = "pearson", main_tabs = "Sample Correlation")
    p <- session$env$buildSampleCorrPlot()
    csv <- read.csv(output$downloadSampleCorrCSV, check.names = FALSE, row.names = 1)
    result <<- list(plot = p, built = ggplot2::ggplot_build(p), csv = csv)
  })
  result
}

for (cluster in c(FALSE, TRUE)) {
  order <- if (cluster) colnames(cor_mat)[hclust(as.dist(1 - cor_mat))$order] else colnames(cor_mat)
  # Unique labels: exactly the pre-fix plot data.
  unique_labels <- c("Ctrl_1", "Ctrl_2", "Trt_1", "Trt_2")
  u <- run_case(unique_labels, cluster)
  stopifnot(identical(u$plot$data, prefix_frame(order, setNames(unique_labels, colnames(cor_mat)))))

  # Duplicated labels, including one that collides with a generated name.
  d <- run_case(c("A", "A", "A (S1)", "B"), cluster)
  expected <- setNames(c("A (S1).1", "A (S2)", "A (S1)", "B"), colnames(cor_mat))
  df <- d$plot$data
  stopifnot(nrow(df) == 16L, !anyNA(df$Sample1_Label), !anyNA(df$Sample2_Label),
    identical(as.character(df$Sample1_Label), unname(expected[df$Sample1])),
    identical(as.character(df$Sample2_Label), unname(expected[df$Sample2])),
    identical(levels(df$Sample1_Label), unname(expected[order])),
    identical(levels(df$Sample2_Label), unname(expected[order])))
  # Every tile is drawn, and each axis position names exactly one sample.
  tiles <- d$built$data[[1]]
  stopifnot(nrow(tiles) == 16L, !anyNA(tiles$x), !anyNA(tiles$y), !anyNA(tiles$fill),
    identical(d$built$layout$panel_params[[1]]$x$get_labels(), unname(expected[order])))

  # Correlation values, pair order and CSV are untouched by labels.
  ids_frame <- prefix_frame(order, setNames(colnames(cor_mat), colnames(cor_mat)))
  for (r in list(u, d)) {
    stopifnot(identical(r$plot$data[c("Sample1", "Sample2", "Correlation")], ids_frame[c("Sample1", "Sample2", "Correlation")]),
      identical(colnames(r$csv), colnames(cor_mat)), identical(rownames(r$csv), rownames(cor_mat)),
      isTRUE(all.equal(as.matrix(r$csv), cor_mat, tolerance = 1e-12, check.attributes = FALSE)))
  }
}
cat("OK sample correlation duplicate labels\n")
