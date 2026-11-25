# Report export (Nexo): the "Filtered average heatmap" (heatmap_barchart_tab-filteredHeatmapPlot) has ~200 rows in a
# real study, too many to label on one A4 page. For the report only, Nexo draws its 40 most significant rows. This
# reads what the session already holds and recomputes nothing: the card's own data (its "download data" handler, the
# rows and group means the card draws), Team's differential result for the active comparison (shared_data
# de_results: p values and log2FC), the significance settings, the lipid classes and Team's class colours. The row
# values are scaled for colour exactly as Team's heatmap does (R/utils_vis.R generateHeatmapObject, the scale mode
# of the card), over all the card's rows, so the 40 rows keep the colours they have on the card.
api_report_top_heatmap <- function(s, instanceId, n = 40L) {
  none <- function(reason) list(available = FALSE, reason = reason)
  card <- tryCatch(api_card_get(s, instanceId), api_not_found = function(e) NULL)
  if (is.null(card) || !identical(card$source, "heatmap_barchart_tab-filteredHeatmapPlot"))
    return(none("This is not a filtered average heatmap."))
  inputs <- card$inputs %||% list()
  if (isTRUE(inputs$condenseRows)) return(none("The heatmap shows class averages, not lipids."))
  api_flush(s)
  de <- api_read(s, tryCatch(s$shared$de_results(), error = function(e) NULL))
  if (!is.data.frame(de) || !nrow(de) || !all(c("Lipid_Name", "log2FC") %in% names(de)))
    return(none("There is no differential result for this session."))
  # The card's own data: the lipids it draws (significant and passing the class filters) and its group means.
  mat <- api_report_card_matrix(s, instanceId)
  if (is.null(mat) || nrow(mat) < 1L) return(none("The heatmap has no rows."))
  si <- s$inputs %||% list()
  adjusted <- !identical(as.character(si[["data_hub-pValueType"]] %||% "adjusted"), "raw")
  p_col <- if (adjusted) "p_adj_bh" else "p_raw"
  if (!p_col %in% names(de)) return(none("The differential result has no p values."))
  row <- match(rownames(mat), as.character(de$Lipid_Name))
  if (anyNA(row)) return(none("Some heatmap rows are not in the differential result."))
  p <- as.numeric(de[[p_col]][row]); fc <- as.numeric(de$log2FC[row])
  scaled <- api_report_heatmap_scale(mat, inputs$heatmapScaleMode %||% "global_zscore")
  # The n most significant (smallest p, then largest |log2FC|), then grouped by class (Team's main class).
  keep <- head(order(p, -abs(fc), rownames(mat)), n)
  anno <- api_read(s, tryCatch(s$shared$annotationData(), error = function(e) NULL))
  class <- if (is.data.frame(anno) && all(c("Lipid_Name", "subclass") %in% names(anno)))
    as.character(anno$subclass[match(rownames(mat), as.character(anno$Lipid_Name))]) else rep(NA_character_, nrow(mat))
  class[is.na(class) | !nzchar(class)] <- "Other"
  keep <- keep[order(class[keep], p[keep], -abs(fc[keep]))]
  colours <- api_read(s, tryCatch(s$shared$class_color_map(), error = function(e) NULL))
  used <- unique(class[keep])
  class_colors <- stats::setNames(lapply(used, function(k) {
    v <- if (!is.null(colours) && k %in% names(colours)) as.character(colours[[k]]) else NA_character_
    if (is.na(v) || !nzchar(v)) "#9CA3AF" else toupper(substr(v, 1L, 7L))
  }), used)
  ref <- as.character(si[["data_hub-deReferenceGroups"]] %||% character())
  comp <- as.character(si[["data_hub-deComparisonGroups"]] %||% character())
  list(available = TRUE, total = nrow(mat), shown = length(keep), groups = I(colnames(mat)),
    scaleMode = scaled$mode, limits = I(scaled$limits),
    pType = if (adjusted) "adjusted" else "raw",
    pThreshold = as.numeric(si[["data_hub-pFilterThreshold"]] %||% 0.05),
    fcThreshold = as.numeric(si[["data_hub-log2fcThreshold"]] %||% 1),
    comparison = if (length(comp) && length(ref)) paste(paste(comp, collapse = " + "), "vs", paste(ref, collapse = " + ")) else "",
    classColors = class_colors,
    rows = unname(lapply(keep, function(i) list(lipid = rownames(mat)[i], class = class[i], p = p[i], log2FC = fc[i],
      values = I(unname(as.numeric(scaled$matrix[i, ])))))))
}

# The card's data as its own "download data" handler writes it (lipid rows, one column per group).
api_report_card_matrix <- function(s, instanceId) {
  registry <- s$mock$.__enclos_env__$private$file_generators
  key <- s$mock$ns(paste0(instanceId, "-downloadFilteredHeatmapCSV"))
  if (!isTRUE(tryCatch(registry$has(key), error = function(e) FALSE))) return(NULL)
  out <- tryCatch(api_run_download(s, registry$get(key), ".csv"), error = function(e) NULL)
  if (is.null(out$bytes)) return(NULL)
  text <- rawToChar(out$bytes); Encoding(text) <- "UTF-8"
  df <- tryCatch(utils::read.csv(text = sub("^﻿", "", text), check.names = FALSE, stringsAsFactors = FALSE), error = function(e) NULL)
  if (!is.data.frame(df) || ncol(df) < 2L) return(NULL)
  mat <- as.matrix(df[, -1L, drop = FALSE]); storage.mode(mat) <- "double"
  rownames(mat) <- as.character(df[[1L]]); mat
}

# Team's colour scaling of the heatmap (R/utils_vis.R generateHeatmapObject), per row: global z-score of log2 values
# (centred only for a flat row) clipped at the palette limit, or row pattern / relative scaling to 0-100.
api_report_heatmap_scale <- function(mat, mode) {
  if (identical(mode, "global_zscore")) {
    m <- log2(mat); m[!is.finite(m)] <- NA
    z <- t(apply(m, 1, function(x) { sd_x <- stats::sd(x, na.rm = TRUE)
      if (is.na(sd_x) || sd_x == 0) x - mean(x, na.rm = TRUE) else (x - mean(x, na.rm = TRUE)) / sd_x }))
    if (ncol(mat) == 1L) z <- t(z)
    z[is.nan(z) | is.na(z)] <- 0
    lim <- min(4, max(1, ceiling(max(abs(z), na.rm = TRUE))))
    z[z > lim] <- lim; z[z < -lim] <- -lim
    return(list(mode = "global_zscore", matrix = z, limits = c(-lim, lim)))
  }
  m <- if (identical(mode, "pattern_zscore")) {
    l <- log2(mat); l[!is.finite(l)] <- NA
    z <- tryCatch(t(scale(t(l))), error = function(e) l); z[is.nan(z) | is.na(z)] <- 0; z
  } else mat
  out <- t(apply(m, 1, scale_row_richer, max_range = 100)); if (ncol(mat) == 1L) out <- t(out)
  list(mode = if (identical(mode, "pattern_zscore")) "pattern_zscore" else "relative", matrix = out, limits = c(0, 100))
}
