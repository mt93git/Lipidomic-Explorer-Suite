# Team implementations of the heatmap hooks called by R/modules/4_heatmap_module.R.

# Team's shared hub exposes prepared LINEAR abundances, so the selected-feature
# violin and its CSV take log2 of positive finite values (others become NA).
team_violin_log2_samples <- function(data, sample_cols) {
  for (column in sample_cols) {
    values <- as.numeric(data[[column]])
    valid <- is.finite(values) & values > 0
    transformed <- rep(NA_real_, length(values))
    transformed[valid] <- log2(values[valid])
    data[[column]] <- transformed
  }
  data
}

team_heatmap_violin_values <- function(sub_df, sample_cols, scale, ...) {
  if (identical(scale, "linear")) sub_df else team_violin_log2_samples(sub_df, sample_cols)
}

# Presentation only: one bound output per movable Canvas card. The module has
# already defined output[[name]] with the full content; Team redefines it (Shiny
# replaces the earlier observer) so `name` keeps only the
# controls (quick access strip and, for the filtered view, its title script);
# `<name>_average` and `<name>_sd` each hold one card. The CSV handlers choose
# XLSX when available, so their buttons get the format-neutral label "Data".
team_heatmap_container_outputs <- function(output, name, build, ...) {
  output[[name]] <- shiny::renderUI(build(show_avg = FALSE, show_sd = FALSE, download_label = "Data"))
  output[[paste0(name, "_average")]] <- shiny::renderUI(
    build(show_sd = FALSE, controls = FALSE, download_label = "Data"))
  output[[paste0(name, "_sd")]] <- shiny::renderUI(
    build(show_avg = FALSE, controls = FALSE, download_label = "Data"))
  invisible(output)
}

lipidomic_hook_register("heatmap_violin_values", team_heatmap_violin_values)
lipidomic_hook_register("heatmap_container_outputs", team_heatmap_container_outputs)
