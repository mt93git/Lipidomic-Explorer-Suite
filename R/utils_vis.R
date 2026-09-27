# R/utils_vis.R
# Visualization Utilities.

# ==============================================================================
# --- 0. Tab Introduction Collapsible UI Component ---
# ==============================================================================
render_tab_intro_card <- function(title, subtitle = NULL, bullets = NULL, collapse_id = "intro_collapse", extra = NULL) {
  wrapper_id <- paste0(collapse_id, "_wrapper")
  body_id <- paste0(collapse_id, "_body")
  btn_id <- paste0(collapse_id, "_btn")
  
  shiny::tags$div(
    id = wrapper_id,
    class = "tab-intro-wrapper mb-2",
    
    # 1. Compact Permanent Header: Clean Title + Discrete "Tab info" Pill Button
    shiny::tags$div(
      class = "d-flex align-items-center justify-content-between tab-intro-permanent-header py-1",
      shiny::tags$div(
        class = "d-flex align-items-center gap-3",
        shiny::tags$h5(
          title,
          class = "fw-bold mb-0 tab-intro-permanent-title",
          style = "font-size: 1.12rem; letter-spacing: -0.01em;"
        ),
        shiny::tags$button(
          id = btn_id,
          class = "btn btn-sm tab-intro-pill-btn",
          type = "button",
          `data-bs-toggle` = "collapse",
          `data-bs-target` = paste0("#", body_id),
          `aria-expanded` = "false",
          `aria-controls` = body_id,
          shiny::tags$i(class = "fa fa-circle-info me-1 text-secondary"),
          shiny::tags$span(class = "tab-intro-btn-label", "Tab info"),
          shiny::tags$i(class = "fa fa-chevron-down ms-1 tab-intro-chevron", style = "font-size: 0.68rem;")
        )
      )
    ),
    
    # 2. Collapsible Drawer Body (collapsed by default)
    shiny::tags$div(
      id = body_id,
      class = "collapse tab-intro-drawer-collapse mt-2",
      shiny::tags$div(
        class = "card border-0 bg-light-subtle p-3 tab-intro-drawer-card",
        style = "border-left: 3px solid #2563EB !important; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);",
        if (!is.null(subtitle)) shiny::tags$p(class = "text-muted small mb-2", subtitle),
        if (!is.null(bullets) && length(bullets) > 0) {
          shiny::tags$ul(class = "text-muted small mb-0", style = "padding-left: 20px; line-height: 1.5;", bullets)
        },
        extra
      )
    )
  )
}
assign("render_tab_intro_card", render_tab_intro_card, envir = .GlobalEnv)

# ==============================================================================
# --- 1. Helper Functions (Scaling & Sorting) ---
# ==============================================================================

#' Scale Row Richer
#' Scales values to a 0-100 range based on min/max of the row.
scale_row_richer <- function(vals, max_range = 100) {
  out <- rep(NA_real_, length(vals)); idx_to_scale <- which(!is.na(vals))
  if (length(idx_to_scale) == 0) return(out)
  vals_to_scale <- vals[idx_to_scale]; min_val <- min(vals_to_scale); max_val <- max(vals_to_scale)
  range_val <- max_val - min_val
  if (range_val > 1e-6) out[idx_to_scale] <- ((vals_to_scale - min_val) / range_val) * max_range
  else out[idx_to_scale] <- max_range / 2
  out
}

#' Class First Sort
class_first_sort <- function(full_anno_df, mat_in, sort_cols = c("subclass", "Total_Carbons", "Total_DB"),
                             fixed_class_order = NULL, fixed_origin_order = NULL) {
  if (!nrow(mat_in) || !ncol(mat_in)) {
    return(list(mat_ordered = mat_in, anno_ordered = full_anno_df, final_order = integer(0)))
  }
  
  real_sort_cols <- intersect(sort_cols, names(full_anno_df))
  
  anno_to_sort <- full_anno_df[match(rownames(mat_in), full_anno_df$Lipid_Name), , drop=FALSE]
  
  sort_df <- data.frame(original_index = seq_len(nrow(anno_to_sort)))
  
  for (col_name in real_sort_cols) {
    val <- anno_to_sort[[col_name]]
    if ((col_name == "subclass" || col_name == "lipid_class") && !is.null(fixed_class_order)) {
      final_levels <- unique(c(fixed_class_order, unique(val)))
      sort_df[[col_name]] <- factor(val, levels = final_levels)
    } else if (col_name == "hyperclass" && !is.null(fixed_origin_order)) {
      final_levels <- unique(c(fixed_origin_order, unique(val)))
      sort_df[[col_name]] <- factor(val, levels = final_levels)
    } else if (is.numeric(val)) {
      sort_df[[col_name]] <- val
      sort_df[[col_name]][is.na(sort_df[[col_name]])] <- Inf
    } else {
      if(is.factor(val)) sort_df[[col_name]] <- val else sort_df[[col_name]] <- as.character(val)
      sort_df[[col_name]][is.na(sort_df[[col_name]])] <- ""
    }
  }
  
 # Inject overall Maximum Intensity for proper cascading
  sort_df[["__Max_Intensity__"]] <- apply(mat_in, 1, max, na.rm=TRUE)
  
  grouping_cols <- intersect(real_sort_cols, c("subclass", "lipid_class", "hyperclass"))
  other_cols <- setdiff(real_sort_cols, grouping_cols)
  
  order_args <- list()
  for(col in grouping_cols) order_args[[col]] <- sort_df[[col]]
  order_args[["__Max_Intensity__"]] <- -sort_df[["__Max_Intensity__"]] # Negative forces Descending
  for(col in other_cols) order_args[[col]] <- sort_df[[col]]
  
  final_order <- sort_df$original_index[do.call(order, c(order_args, list(na.last = TRUE)))]
  
  list(mat_ordered = mat_in[final_order, , drop = FALSE], 
       anno_ordered = anno_to_sort[final_order, , drop = FALSE], 
       final_order = final_order)
}

#' Staircase Sort
staircase_sort <- function(full_anno_df, mat_in, secondary_sort_mode = "grey", 
                           sort_cols = c("subclass", "Total_Carbons", "Total_DB"),
                           fixed_class_order = NULL, fixed_origin_order = NULL) {
  if (!nrow(mat_in) || !ncol(mat_in)) return(list(mat_ordered = mat_in, anno_ordered = full_anno_df, final_order = integer(0)))
  
  rowMaxIdx <- apply(mat_in, 1, function(r) { if (all(is.na(r))) NA else which.max(r) })
  max_fac <- factor(rowMaxIdx, levels = seq_len(ncol(mat_in)), labels = colnames(mat_in))
  if (any(is.na(rowMaxIdx))) {
    newLev <- c(levels(max_fac), "NoMax"); max_fac <- factor(max_fac, levels = newLev); max_fac[is.na(rowMaxIdx)] <- "NoMax"
  }
  group_idxs <- split(seq_len(nrow(mat_in)), max_fac)
  
  anno_for_sorting <- full_anno_df[match(rownames(mat_in), full_anno_df$Lipid_Name), , drop=FALSE]
  
  sort_within_group <- function(sub_idx, current_level) {
    if (length(sub_idx) <= 1) return(sub_idx)
    
    if (secondary_sort_mode == "class") {
      sub_anno <- anno_for_sorting[sub_idx, , drop = FALSE]
      real_cols <- intersect(sort_cols, names(sub_anno))
      sort_df <- data.frame(original_index = sub_idx)
      
   # Failsafe ensuring grouping factor isn't dropped
      grouping_cols <- intersect(real_cols, c("subclass", "lipid_class", "hyperclass"))
      if (length(grouping_cols) == 0 && "subclass" %in% names(sub_anno)) {
          grouping_cols <- "subclass"
          real_cols <- unique(c("subclass", real_cols))
      }
      other_cols <- setdiff(real_cols, grouping_cols)
      
   # Extract Intensity for Tertiary Sorting Tie-breaker
      if (current_level != "NoMax" && current_level %in% colnames(mat_in)) {
          sort_df[["__Max_Intensity__"]] <- mat_in[sub_idx, current_level]
      } else {
          sort_df[["__Max_Intensity__"]] <- rowMeans(mat_in[sub_idx, , drop=FALSE], na.rm=TRUE)
      }
      
   # HARD-CATCH NA ARTIFACTS
      sort_df[["__Max_Intensity__"]][is.na(sort_df[["__Max_Intensity__"]])] <- -Inf
      
      if(length(real_cols) == 0) {
          return(sub_idx[order(sort_df[["__Max_Intensity__"]], decreasing = TRUE, na.last = TRUE)])
      }
      
      for (col_name in grouping_cols) {
        val <- sub_anno[[col_name]]
        if ((col_name == "subclass" || col_name == "lipid_class") && !is.null(fixed_class_order)) {
          final_levels <- unique(c(fixed_class_order, unique(as.character(val))))
          sort_df[[col_name]] <- factor(as.character(val), levels = final_levels)
        } else if (col_name == "hyperclass" && !is.null(fixed_origin_order)) {
          final_levels <- unique(c(fixed_origin_order, unique(as.character(val))))
          sort_df[[col_name]] <- factor(as.character(val), levels = final_levels)
        } else {
          sort_df[[col_name]] <- if(is.factor(val)) val else as.character(val)
        }
      }
      
      for (col_name in other_cols) {
        val <- sub_anno[[col_name]]
        if (is.numeric(val)) {
          sort_df[[col_name]] <- val
          sort_df[[col_name]][is.na(sort_df[[col_name]])] <- Inf
        } else {
          sort_df[[col_name]] <- if(is.factor(val)) val else as.character(val)
          sort_df[[col_name]][is.na(sort_df[[col_name]])] <- ""
        }
      }
      
   # Execute Absolute Hierarchy: Secondary (Class) -> Tertiary (Desc Intensity) -> Other
      order_args <- list()
      for(col in grouping_cols) order_args[[col]] <- sort_df[[col]]
      order_args[["__Max_Intensity__"]] <- -sort_df[["__Max_Intensity__"]] # Negative forces Descending
      for(col in other_cols) order_args[[col]] <- sort_df[[col]]
      
      return(sort_df$original_index[do.call(order, c(order_args, list(na.last = TRUE)))])

    } else {
      if (current_level == "NoMax" || !(current_level %in% colnames(mat_in))) return(sub_idx)
      sub_mat_values <- mat_in[sub_idx, current_level]
      sub_mat_values[is.na(sub_mat_values)] <- -Inf
      return(sub_idx[order(sub_mat_values, decreasing = TRUE, na.last = TRUE)])
    }
  }
  
  final_order <- integer(0)
  all_levels <- c(colnames(mat_in), "NoMax")
  for (lv in all_levels) {
    if (lv %in% names(group_idxs) && length(group_idxs[[lv]])) {
      final_order <- c(final_order, sort_within_group(group_idxs[[lv]], lv))
    }
  }
  list(mat_ordered = mat_in[final_order, , drop = FALSE], 
       anno_ordered = anno_for_sorting[final_order, , drop = FALSE], 
       final_order = final_order)
}

# ==============================================================================
# --- 2. Heatmap Generation ---
# ==============================================================================

#' Class First Staircase Sort
#' Groups by Class globally, and within each Class performs peak condition (staircase) sort.
class_first_staircase_sort <- function(full_anno_df, mat_in, secondary_sort_mode = "class", 
                           sort_cols = c("subclass", "Total_Carbons", "Total_DB"),
                           fixed_class_order = NULL, fixed_origin_order = NULL) {
  if (!nrow(mat_in) || !ncol(mat_in)) return(list(mat_ordered = mat_in, anno_ordered = full_anno_df, final_order = integer(0)))
  
  anno_for_sorting <- full_anno_df[match(rownames(mat_in), full_anno_df$Lipid_Name), , drop=FALSE]
  
  # Determine primary class column to group by
  primary_col <- sort_cols[1]
  if (is.null(primary_col) || !(primary_col %in% names(anno_for_sorting))) {
    primary_col <- "subclass"
  }
  
  # Split indices by Class
  class_vals <- anno_for_sorting[[primary_col]]
  
  if ((primary_col == "subclass" || primary_col == "lipid_class") && !is.null(fixed_class_order)) {
    final_levels <- unique(c(fixed_class_order, unique(as.character(class_vals))))
    class_fac <- factor(as.character(class_vals), levels = final_levels)
  } else if (primary_col == "hyperclass" && !is.null(fixed_origin_order)) {
    final_levels <- unique(c(fixed_origin_order, unique(as.character(class_vals))))
    class_fac <- factor(as.character(class_vals), levels = final_levels)
  } else {
    class_fac <- if(is.factor(class_vals)) class_vals else factor(as.character(class_vals))
  }
  
  class_idxs <- split(seq_len(nrow(mat_in)), class_fac)
  
  final_order <- integer(0)
  
  for (cls in levels(class_fac)) {
    if (cls %in% names(class_idxs) && length(class_idxs[[cls]])) {
      sub_idx <- class_idxs[[cls]]
      
      # Perform standard staircase_sort ON THIS SUBSET
      sub_mat <- mat_in[sub_idx, , drop=FALSE]
      sub_res <- staircase_sort(full_anno_df, sub_mat, secondary_sort_mode = secondary_sort_mode,
                                sort_cols = sort_cols,
                                fixed_class_order = fixed_class_order, fixed_origin_order = fixed_origin_order)
      
      # sub_res$final_order gives the 1..N order of the SUB-MATRIX. 
      # We map it back to global indices.
      final_order <- c(final_order, sub_idx[sub_res$final_order])
    }
  }
  
  list(mat_ordered = mat_in[final_order, , drop = FALSE], 
       anno_ordered = anno_for_sorting[final_order, , drop = FALSE], 
       final_order = final_order)
}

# --- 2. Heatmap Generation ---
# ==============================================================================

# Note: CLASS_MAP_COLORS and HYPERCLASS_MAP_COLORS are now defined in R/utils_colors.R


#' Generate Heatmap Object
#' Wrapper for pheatmap with custom sorting, scaling, and annotation.
generateHeatmapObject <- function(mat, title, 
     # Matrices
          mat_for_sorting = NULL, 
          display_mat = NULL, 
     # Data
          annotation_data = NULL, 
          cell_annotation = NULL, # list(df=..., colors=...)
     # Options
          sort_mode = "grey", # "class_first", "class", "grey"
          scale_mode = "global_zscore", # "global_zscore", "pattern_zscore", "relative"
          show_grid = FALSE, 
          grid_color = "grey90",
          hide_row_names = FALSE, 
          fine_tune_colors = FALSE, 
          colors_diverging = NULL, # c(low, mid, high)
          colors_sequential = NULL, # c(low, high)
          class_colors = NULL, # Optional: Global class color map
          origin_colors = NULL, # Contextual origin colors (Passed from Shared Data)
          species_colors = NULL, # Granular species colors (Passed from Shared Data)
          annotation_cols = c("subclass") # Vector of columns to annotate/sort by
) {
  
 # --- Pree-Flight Checks ---
  if (is.null(mat)) return(NULL)
  if (nrow(mat) < 2 || ncol(mat) < 2) return(NULL)

 # Check for Zero Variance (Flat lines)
 # If any row has zero variance, strict scaling will crash or produce NaNs.
 # force a safe mode if detected.
  row_vars <- apply(mat, 1, var, na.rm=TRUE)
  has_zero_var <- any(row_vars == 0 | is.na(row_vars))

 # --- Sorting ---
  sorting_matrix <- if (!is.null(mat_for_sorting)) mat_for_sorting else mat
  anno_full <- annotation_data
  
 # Determine Canonical Class Order from Colors
 # Determine Canonical Orders
  canonical_class_order <- NULL
  if(!is.null(class_colors)) {
      canonical_class_order <- names(class_colors)
  } else if (exists("CLASS_MAP_COLORS")) {
      canonical_class_order <- names(CLASS_MAP_COLORS)
  }
  
  canonical_origin_order <- NULL
  if(!is.null(origin_colors)) {
      canonical_origin_order <- names(origin_colors)
  } else if (exists("HYPERCLASS_MAP_COLORS")) {
      canonical_origin_order <- names(HYPERCLASS_MAP_COLORS)
  }
  
  sres <- if (sort_mode == "none") {
    list(mat_ordered = sorting_matrix, 
         anno_ordered = anno_full[match(rownames(sorting_matrix), anno_full$Lipid_Name), , drop=FALSE], 
         final_order = seq_len(nrow(sorting_matrix)))
  } else if (sort_mode == "class_first") {
    sort_targets <- c(annotation_cols, "Total_Carbons", "Total_DB")
    class_first_sort(anno_full, sorting_matrix, sort_cols = sort_targets,
                     fixed_class_order = canonical_class_order, 
                     fixed_origin_order = canonical_origin_order) 
  } else if (sort_mode == "class_first_staircase") {
    sort_targets <- c(annotation_cols, "Total_Carbons", "Total_DB")
    class_first_staircase_sort(anno_full, sorting_matrix, secondary_sort_mode = "class", 
                   sort_cols = sort_targets,
                   fixed_class_order = canonical_class_order,
                   fixed_origin_order = canonical_origin_order)
  } else {
    sec_mode <- if(sort_mode == "class") "class" else "grey"
    sort_targets <- c(annotation_cols, "Total_Carbons", "Total_DB")
    staircase_sort(anno_full, sorting_matrix, secondary_sort_mode = sec_mode, 
                   sort_cols = sort_targets,
                   fixed_class_order = canonical_class_order,
                   fixed_origin_order = canonical_origin_order)
  }
  
 # Re-order
  mat_ord <- mat[rownames(sres$mat_ordered), , drop = FALSE]
  if(nrow(mat_ord) < 2) return(NULL)
  
  print(paste("---- DIAGNOSTIC:", title, "----"))
  print(paste("Matrix dimensions (Rows x Cols):", nrow(mat_ord), "x", ncol(mat_ord)))
  print(paste("Total NAs in Matrix:", sum(is.na(mat_ord))))
  
 # --- Scaling & Colors ---
  pheatmap_args <- list()
  is_diverging <- scale_mode == 'global_zscore'
  
  if (isTRUE(fine_tune_colors)) {
    palette_generator <- if (is_diverging) {
      if(!is.null(colors_diverging) && length(colors_diverging) >= 2 && !any(is.na(colors_diverging))) {
        colorRampPalette(colors_diverging)
      } else {
        colorRampPalette(rev(RColorBrewer::brewer.pal(n=7, name="RdBu")))
      }
    } else {
      if(!is.null(colors_sequential) && length(colors_sequential) >= 2 && !any(is.na(colors_sequential))) {
        colorRampPalette(colors_sequential)
      } else {
        colorRampPalette(RColorBrewer::brewer.pal(n=9, name="YlOrRd"))
      }
    }
  } else {
    palette_generator <- if (is_diverging) colorRampPalette(rev(RColorBrewer::brewer.pal(n=7, name="RdBu"))) else colorRampPalette(RColorBrewer::brewer.pal(n=9, name="YlOrRd"))
  }
  
  pheatmap_args$color <- palette_generator(100)
  font_color_matrix <- matrix("black", nrow = nrow(mat_ord), ncol = ncol(mat_ord))
  
  matrix_to_plot <- NULL
  
  if (is_diverging) {
  # Global Z-Score
    mat_for_color <- log2(mat_ord); mat_for_color[!is.finite(mat_for_color)] <- NA
    
  # SAFE SCALING LOGIC
    if (has_zero_var) {
   # If contains zero variance, standard scaling crashes. 
   # attempt centering, if that fails, return unscaled log values.
      matrix_to_plot <- tryCatch({
         t(apply(mat_for_color, 1, function(x) {
            sd_x <- sd(x, na.rm=TRUE)
            if(is.na(sd_x) || sd_x == 0) return(x - mean(x, na.rm=TRUE)) # Center only
            return((x - mean(x, na.rm=TRUE))/sd_x)
         }))
      }, error = function(e) mat_for_color)
   # Since handled scaling manually (or skipped it), pass this to pheatmap with scale="none".
    } else {
   # Standard scaling
      matrix_to_plot <- t(scale(t(mat_for_color)))
    }
    
    matrix_to_plot[is.nan(matrix_to_plot) | is.na(matrix_to_plot)] <- 0
    
    palette_limit <- min(4, max(1, ceiling(max(abs(matrix_to_plot), na.rm = TRUE))))
    matrix_to_plot[matrix_to_plot > palette_limit] <- palette_limit
    matrix_to_plot[matrix_to_plot < -palette_limit] <- -palette_limit
    font_color_matrix[abs(matrix_to_plot) > (0.6 * palette_limit)] <- "white"
    pheatmap_args$breaks <- seq(-palette_limit, palette_limit, length.out = 101)
    pheatmap_args$legend_breaks <- round(seq(-palette_limit, palette_limit, length.out=5))
    pheatmap_args$legend_labels <- as.character(pheatmap_args$legend_breaks)
  } else {
  # Relative or Pattern Z
    matrix_to_plot <- if(scale_mode == "pattern_zscore") {
      mat_log <- log2(mat_ord); mat_log[!is.finite(mat_log)] <- NA
   # Row Scaling
      mat_zscores <- tryCatch({ t(scale(t(mat_log))) }, error=function(e) mat_log)
      mat_zscores[is.nan(mat_zscores) | is.na(mat_zscores)] <- 0
      t(apply(mat_zscores, 1, scale_row_richer, max_range=100))
    } else {
      t(apply(mat_ord, 1, scale_row_richer, max_range = 100))
    }
    dimnames(matrix_to_plot) <- dimnames(mat_ord)
    font_color_matrix[matrix_to_plot > 60 & !is.na(matrix_to_plot)] <- "white"
    pheatmap_args$breaks <- seq(0, 100, length.out = 101)
    pheatmap_args$legend_breaks <- seq(0, 100, by=25)
    pheatmap_args$legend_labels <- c("0", "25", "50", "75", "100")
  }
  
  pheatmap_args$na_col <- "grey80"
  
 # --- Annotation ---
  row_ann_df <- NULL
  if (!is.null(annotation_data)) {
    anno_ord <- annotation_data[match(rownames(mat_ord), annotation_data$Lipid_Name), , drop=FALSE]
    
  # Build dataframe for multiple columns
    df_list <- list()
    
  # Map internal column names to display names
  # subclass -> "Class"
  # hyperclass -> "Hyperclass"
  # others -> same name
    
    for(col in annotation_cols) {
       if(col %in% names(anno_ord)) {
          disp_name <- switch(col, 
             "subclass" = "Lipid Main Class",
             "hyperclass" = "Lipid Category",
             col
          )
          df_list[[disp_name]] <- anno_ord[[col]]
       }
    }
    
    if(length(df_list) > 0) {
       row_ann_df <- as.data.frame(df_list, check.names = FALSE)
       rownames(row_ann_df) <- rownames(mat_ord)
     }
  }
  
  col_ann_df <- NULL; 
  
 # Build Ann Colors List
  ann_colors <- list()
  
 # Add Lipid Main Class Colors if present
  cls_target <- intersect(c("Lipid Main Class", "Class"), names(row_ann_df))[1]
  if(!is.na(cls_target)) {
     base_cols <- if(!is.null(class_colors)) {
        class_colors
     } else {
        bm <- CLASS_MAP_COLORS
        unique_cls <- unique(row_ann_df[[cls_target]])
        if (any(grepl("→", unique_cls))) {
           names(bm) <- get_short_class_name(names(bm))
        } else if (any(unique_cls %in% get_full_class_name(names(bm)))) {
           names(bm) <- get_full_class_name(names(bm))
        }
        bm
     }
     ann_colors[[cls_target]] <- base_cols
  }
  
 # Add Lipid Category Colors if present
  cat_target <- intersect(c("Lipid Category", "Hyperclass"), names(row_ann_df))[1]
  if(!is.na(cat_target)) {
     origin_cols <- if(!is.null(origin_colors)) {
        origin_colors
     } else {
        bm <- if(exists("HYPERCLASS_MAP_COLORS")) HYPERCLASS_MAP_COLORS else CLASS_MAP_COLORS
        unique_orig <- unique(row_ann_df[[cat_target]])
        if (any(grepl("→", unique_orig))) {
           names(bm) <- get_short_class_name(names(bm))
        } else if (any(unique_orig %in% get_full_class_name(names(bm)))) {
           names(bm) <- get_full_class_name(names(bm))
        }
        bm
     }
     
     ann_colors[[cat_target]] <- origin_cols
  }
  
  if (!is.null(cell_annotation)) {
    col_ann_df <- cell_annotation$df
    ann_colors$Cell <- cell_annotation$colors
  }
  
 # Handle display numbers
  display_matrix <- FALSE
  if (!is.null(display_mat)) { # If raw matrix is provided
     display_nodes <- display_mat[rownames(mat_ord), colnames(mat_ord), drop=FALSE]
   # Format needed? For now pass raw values
     display_matrix <- matrix(sprintf("%.0f", display_nodes), nrow=nrow(display_nodes))
  }
  
  common_args <- list(mat = matrix_to_plot, cluster_rows = FALSE, cluster_cols = FALSE, 
                      border_color = if (isTRUE(show_grid)) grid_color else NA, 
                      show_rownames = !hide_row_names, main = title, fontsize_row = 8, 
                      annotation_row = row_ann_df, annotation_col = col_ann_df, 
                      annotation_colors = ann_colors, 
                      display_numbers = display_matrix, 
                      fontsize_number = 8, number_color = font_color_matrix, silent = TRUE,
                      legend = FALSE)
  
 # Scaling Logic Verification:
 # The `matrix_to_plot` object is already processed (e.g., Z-scored or normalized) in the preceding steps.
 # To prevent double-standardization, the 'scale' parameter for pheatmap is explicitly set to "none".
 # This ensures that the custom scaling logic (handling zero variance or specific normalization modes) is preserved.
 # The call is wrapped in tryCatch to handle potential edge cases gracefully.
  
  print("=== DIAGNOSTIC: cell_annotation payload to pheatmap ===")
  print("col_ann_df structure:")
  print(str(col_ann_df))
  if(!is.null(col_ann_df)) {
     print("col_ann_df rownames:")
     print(rownames(col_ann_df))
     print("matrix colnames:")
     print(colnames(matrix_to_plot))
  }
  print("ann_colors structure:")
  print(str(ann_colors))
  print("=====================================================")
  
  ht <- tryCatch({
    do.call(pheatmap::pheatmap, c(pheatmap_args, common_args, list(scale = "none")))
  }, error = function(e) {
    print(paste("ERROR in pheatmap (", title, "):", e$message))
    print("----- pheatmap_args -----")
    print(str(pheatmap_args))
    print("----- common_args (excluding mat) -----")
    common_args_no_mat <- common_args
    common_args_no_mat$mat <- "matrix omitted for brevity"
    print(str(common_args_no_mat))
    return(NULL)
  })
  
  if(is.null(ht)) return(NULL)
  
 # Fix title alignment and append custom horizontal legend
  if (!is.null(ht$gtable)) {
    idx <- which(ht$gtable$layout$name == "main")
    if (length(idx) > 0) {
      ht$gtable$grobs[[idx]]$x <- grid::unit(0.01, "npc")
      ht$gtable$grobs[[idx]]$hjust <- 0
    }
    
  # ----- CUSTOM HORIZONTAL LEGEND -----
    if (!is.null(pheatmap_args$color) && !is.null(pheatmap_args$legend_labels)) {
        leg_title_text <- if (is_diverging) "Global Scaling (Z-Score)" else if (scale_mode == "pattern_zscore") "Row Pattern Scaling (0-100)" else "Relative Scaling (0-100)"
        leg_colors <- pheatmap_args$color
        leg_labels <- pheatmap_args$legend_labels
        
        # Top-Quartile Rendering layout immune to bounding box dropping constraints
        # By setting the cell to 8 lines and drawing at y > 0.6, we defeat the 3-line ghost margin cropping loop.
        leg_title <- grid::textGrob(as.character(leg_title_text), x=0.5, y=0.9, just="center", gp=grid::gpar(fontsize=12, fontface="bold", col="black"))
        
        num_colors <- length(leg_colors)
        rect_w <- 0.8 / num_colors
        x_positions <- seq(0.1, 0.9 - rect_w, length.out=num_colors)
        
        label_x_pos <- seq(0.1, 0.9, length.out=length(leg_labels))
        leg_text <- grid::textGrob(as.character(leg_labels), x = label_x_pos, y = 0.75, just = "center", gp=grid::gpar(fontsize=10, fontface="plain", col="black"))
        
        leg_rects <- grid::rectGrob(x = x_positions, y = 0.6, width = rect_w, height = 0.15, 
                                    just = c("left", "center"), gp = grid::gpar(col = NA, fill = as.character(leg_colors)))
        
        leg_grob <- grid::gTree(children = grid::gList(leg_title, leg_text, leg_rects))
        
        gt <- ht$gtable
        
        # Top margin: compact buffer (0.8 lines) so title starts snugly under card header/banner
        gt <- gtable::gtable_add_rows(gt, grid::unit(0.8, "lines"), 0)
        # Bottom margin: 8.0 lines for the custom horizontal legend
        gt <- gtable::gtable_add_rows(gt, grid::unit(8.0, "lines"), -1)
        
        # Deduct the total added height (8.8 lines) from the matrix flexible spacer
        matrix_row_idx <- which(gt$layout$name == "matrix")
        if(length(matrix_row_idx) > 0) {
           t_mat <- gt$layout$t[matrix_row_idx[1]]
           gt$heights[t_mat] <- gt$heights[t_mat] - grid::unit(8.8, "lines")
        }
        
        matrix_col <- gt$layout$l[gt$layout$name == "matrix"]
        if(length(matrix_col) == 0) matrix_col <- 3
        
        gt <- gtable::gtable_add_grob(gt, leg_grob, t = nrow(gt), l = matrix_col[1], b = nrow(gt), r = matrix_col[1], name="custom_horizontal_legend", clip="off")
        
        ht$gtable <- gt
    }
  }
  
  list(ht = ht, data = mat_ord)
}

# ==============================================================================
# --- 3. Bar Chart Generation ---
# ==============================================================================

#' Generates a ggplot2 bar chart for composition analysis.
buildBarPlot <- function(mat, titleText, 
                         annotation_data,
                         group_mode = "Sub-class", # "Hyperclass", "Sub-class"
                         value_mode = "Absolute (intensity)", # "Absolute (intensity)", "Absolute (%)", "Normalized (intensity)", "Normalized (%)"
                         orientation = "sample_x", # "sample_x", "class_x"
                         sample_grouping = NULL, # Named vector: names=Samples, values=Groups (for aggregation)
                         aggregate_by_group = FALSE, # If TRUE, averages samples by group
                         compute_error_bars = FALSE, # If TRUE, adds error bars (Validation Mean +/- SD)
                         sample_colors = NULL, # Named vector for sample/group colors (only used if orientation="class_x")
                         class_colors = NULL, # Optional global map
                         error_bar_type = "total", # "total" or "individual"
                         error_bar_stats_mode = "sem", # "sd" or "sem"
                         color_error_bars_by_class = FALSE
) {
  validate(need(is.matrix(mat) && nrow(mat) > 0 && ncol(mat) > 0, "No data for bar chart."))
  req(annotation_data)
  
 # Prepare Long Format Data
  dfm <- as.data.frame(mat) %>% tibble::rownames_to_column("Lipid_Name") %>%
    dplyr::left_join(dplyr::select(annotation_data, Lipid_Name, subclass, hyperclass), by = "Lipid_Name") %>%
    tidyr::pivot_longer(cols = dplyr::all_of(colnames(mat)), names_to = "SampleCol", values_to = "Intensity")
  
 # Normalize if requested
  if (grepl("^Normalized", value_mode)) {
    dfm <- dfm %>% dplyr::group_by(Lipid_Name) %>% 
      dplyr::mutate(rowSum = sum(Intensity, na.rm = TRUE), 
                    Intensity = dplyr::if_else(rowSum > 0, Intensity / rowSum, 0)) %>% 
      dplyr::ungroup()
  }
  

 # Grouping Variable (ClassGroup)
  groupVar <- if (group_mode %in% c("Hyperclass", "Lipid Category", "hyperclass")) {
     "hyperclass" 
  } else if (group_mode %in% c("Sub-class", "Class", "Lipid Main Class", "subclass")) {
     "subclass"
  } else {
    # Fallback or direct column name (e.g. Lipid_Name)
      if (group_mode %in% names(dfm)) group_mode else "subclass"
  }
  
 # Check if groupVar actually exists (Safety)
  if (!groupVar %in% names(dfm)) {
     warning(paste("Grouping variable", groupVar, "not found. Defaulting to subclass."))
     groupVar <- "subclass"
  }
  
  dfm <- dfm %>% dplyr::rename(ClassGroup = dplyr::all_of(groupVar))
  
 # Custom Hierarchical Sorting for Single Species
  if (groupVar %in% c("Lipid_Name", "Lipid Mediator Single Species") && "subclass" %in% names(dfm)) {
    # If the user defined a specific subclass order (like in Lipid Mediators), use it
    if (exists("user_defined_subclass_colors")) {
      dfm$subclass <- factor(dfm$subclass, levels = names(user_defined_subclass_colors))
    }
    
    # Extract unique species mapped to their subclass, sort by subclass then species
    ordered_lipids <- dfm %>% 
      dplyr::distinct(ClassGroup, subclass) %>%
      dplyr::arrange(subclass, ClassGroup) %>%
      dplyr::pull(ClassGroup)
      
    dfm$ClassGroup <- factor(dfm$ClassGroup, levels = ordered_lipids)
  }
 # Enforce Original Sample Order
 # Capturing the order from the input matrix columns
 # This prevents dplyr::group_by from implicitly re-sorting alphabetically
  dfm$SampleCol <- factor(dfm$SampleCol, levels = colnames(mat))
  
 # Helper for aggregation
 # If aggregate_by_group is TRUE, must have sample_grouping
  if (isTRUE(aggregate_by_group) && !is.null(sample_grouping)) {
    dfm$Group <- sample_grouping[as.character(dfm$SampleCol)]
  # Filter out samples not in grouping
    dfm <- dfm %>% dplyr::filter(!is.na(Group))
  }
  
 # Aggregation Logic
  plot_df <- NULL
  error_df <- NULL 
  
 # Step 1: Reduce to Class Level per Sample
  df_class_sample <- dfm %>% 
    dplyr::group_by(SampleCol, ClassGroup) %>% 
    dplyr::summarize(Value = sum(Intensity, na.rm = TRUE), .groups = "drop")
  
 # If Normalized Value Mode requested (%), do it per sample NOW
  if (grepl("\\(\\%\\)$", value_mode)) {
    df_class_sample <- df_class_sample %>% 
      dplyr::group_by(SampleCol) %>% 
      dplyr::mutate(Value = Value / sum(Value) * 100) %>% 
      dplyr::ungroup()
  }
  
 # Step 2: Handle Aggregation
  if (isTRUE(aggregate_by_group) && !is.null(sample_grouping)) {
  # Respect appearance order for groups
  # derive the group order from the sample order in 'mat'
  # sample_grouping is a named vector (Names=Samples, Values=Groups)
    
  # Get unique groups in order of appearance
    ordered_groups <- unique(sample_grouping[colnames(mat)])
    ordered_groups <- ordered_groups[!is.na(ordered_groups)]
    
    df_class_sample$Group <- factor(sample_grouping[as.character(df_class_sample$SampleCol)], levels = ordered_groups)
    df_class_sample <- df_class_sample %>% dplyr::filter(!is.na(Group))
    
  # Calculate Mean & SD per Group
    df_agg <- df_class_sample %>% 
      dplyr::group_by(Group, ClassGroup) %>% 
      dplyr::summarize(
        MeanValue = mean(Value, na.rm=TRUE),
        SDValue = sd(Value, na.rm=TRUE),
        NValue = sum(!is.na(Value)),
        .groups = "drop"
      )
    
    # Determine individual segment error value based on statistical mode
    if (error_bar_stats_mode == "sem") {
      df_agg$ErrorValue <- ifelse(df_agg$NValue > 0, df_agg$SDValue / sqrt(df_agg$NValue), NA)
    } else {
      df_agg$ErrorValue <- df_agg$SDValue
    }
    
  # For plotting, treat 'Group' as the 'SampleCol'
    plot_df <- df_agg %>% dplyr::rename(SampleCol = Group, Value = MeanValue)
    
  # Error Bars?
    if (isTRUE(compute_error_bars)) {
      if (error_bar_type == "total") {
        # Calculate Total Mean & Total SD per Group
        df_total_sample <- df_class_sample %>% 
          dplyr::group_by(SampleCol, Group) %>% 
          dplyr::summarize(Total = sum(Value, na.rm=TRUE), .groups="drop")
        
        df_total_agg <- df_total_sample %>% 
          dplyr::group_by(Group) %>% 
          dplyr::summarize(
            MeanTotal = mean(Total, na.rm=TRUE),
            SDTotal = sd(Total, na.rm=TRUE),
            NTotal = sum(!is.na(Total)),
            .groups="drop"
          )
        
        if (error_bar_stats_mode == "sem") {
          df_total_agg$ErrorTotal <- ifelse(df_total_agg$NTotal > 0, df_total_agg$SDTotal / sqrt(df_total_agg$NTotal), NA)
        } else {
          df_total_agg$ErrorTotal <- df_total_agg$SDTotal
        }
        
        error_df <- df_total_agg %>% dplyr::rename(xVal = Group)
      }
    }
    
  } else {
    plot_df <- df_class_sample
  }
  
 # Step 3: Prepare Axes based on Orientation
  if (orientation == "sample_x") {
    plot_df <- plot_df %>% dplyr::rename(xVal = SampleCol, fillVal = ClassGroup)
    if(!is.factor(plot_df$xVal)) {
       plot_df$xVal <- factor(plot_df$xVal, levels = unique(plot_df$xVal)) 
    }
  } else {
    plot_df <- plot_df %>% dplyr::rename(xVal = ClassGroup, fillVal = SampleCol)
    if(!is.factor(plot_df$xVal)) {
       plot_df$xVal <- factor(plot_df$xVal, levels = unique(plot_df$xVal)) 
    }
  }
  
  # Calculate cumulative sum error bounds if error_bar_type == "individual"
  if (isTRUE(compute_error_bars) && isTRUE(aggregate_by_group) && error_bar_type == "individual") {
     # Ensure fillVal is a factor to keep stacking order consistent
     if (!is.factor(plot_df$fillVal)) {
       plot_df$fillVal <- factor(plot_df$fillVal, levels = unique(plot_df$fillVal))
     }
     
     # Calculate cumulative sum of Value for each xVal to position stacked error bars
     plot_df <- plot_df %>% 
       dplyr::group_by(xVal) %>% 
       dplyr::arrange(desc(fillVal)) %>% 
       dplyr::mutate(
         CumValue = cumsum(Value),
         ErrorMin = CumValue - ErrorValue,
         ErrorMax = CumValue + ErrorValue
       ) %>% 
       dplyr::ungroup()
  }
  
 # Plotting
  ggplot_title <- gsub("\n", "<br>", titleText)
  ylab_text <- switch(value_mode, 
                      "Absolute (intensity)"="Summed Intensity", 
                      "Absolute (%)"="Relative Intensity (%)", 
                      "Normalized (intensity)"="Summed Normalized Intensity", 
                      "Normalized (%)"="Relative Normalized Intensity (%)")
  if (isTRUE(aggregate_by_group)) ylab_text <- paste("Mean", ylab_text)
  
  fillMap <- if (orientation == "sample_x") { 
    if (group_mode %in% c("Hyperclass", "Lipid Category", "hyperclass")) {
       if(!is.null(class_colors)) {
          class_colors
       } else {
          base_map <- if(exists("HYPERCLASS_MAP_COLORS")) HYPERCLASS_MAP_COLORS else CLASS_MAP_COLORS
          unique_vals <- unique(plot_df$fillVal)
          if (any(grepl("→", unique_vals))) {
             names(base_map) <- get_short_class_name(names(base_map))
          } else if (any(unique_vals %in% get_full_class_name(names(base_map)))) {
             names(base_map) <- get_full_class_name(names(base_map))
          }
          base_map
       }
    } else if (group_mode == "Lipid_Name" || group_mode == "Lipid Mediator Single Species") {
    # Use passed colors if available, else fallback
       if(!is.null(class_colors)) {
          class_colors
       } else {
          lipid_names <- unique(plot_df$fillVal)
          colorRampPalette(RColorBrewer::brewer.pal(9, "Set1"))(length(lipid_names)) %>% setNames(lipid_names)
       }
    } else {
       if(!is.null(class_colors)) {
          class_colors
       } else {
          base_map <- CLASS_MAP_COLORS
          unique_vals <- unique(plot_df$fillVal)
          if (any(grepl("→", unique_vals))) {
             names(base_map) <- get_short_class_name(names(base_map))
          } else if (any(unique_vals %in% get_full_class_name(names(base_map)))) {
             names(base_map) <- get_full_class_name(names(base_map))
          }
          base_map
       }
    }
  } else { 
  # Use provided sample colors if available
    if (!is.null(sample_colors)) {
   # Ensure coverage
      used_grps <- unique(plot_df$fillVal)
      missing <- setdiff(used_grps, names(sample_colors))
      if(length(missing)>0) {
        slack <- colorRampPalette(RColorBrewer::brewer.pal(9, "Set1"))(length(missing))
        names(slack) <- missing
        c(sample_colors, slack)
      } else {
        sample_colors
      }
    } else {
      colorRampPalette(RColorBrewer::brewer.pal(9, "Set1"))(dplyr::n_distinct(plot_df$fillVal)) %>% setNames(nm = unique(plot_df$fillVal)) 
    }
  }
  
  p <- ggplot2::ggplot(plot_df, ggplot2::aes(x = xVal, y = Value, fill = fillVal)) + 
    ggplot2::geom_bar(stat = "identity", position = "stack") +
    ggplot2::scale_fill_manual(values = fillMap, name = NULL, na.value = "grey50") +
    ggplot2::labs(title = NULL, subtitle = NULL, x = NULL, y = ylab_text) +
    ggplot2::theme_minimal(base_size = 14) +
    ggplot2::theme(panel.grid = ggplot2::element_blank(), 
                   axis.text.x = ggplot2::element_text(angle = 90, vjust = 0.5, hjust=1), 
                   plot.title = ggplot2::element_text(hjust = 0, size=14, lineheight = 1.2)) +
    ggplot2::ggtitle(ggplot_title)
    
 # Add Error Bars if requested
  if (isTRUE(compute_error_bars) && isTRUE(aggregate_by_group)) {
    if (error_bar_type == "total" && !is.null(error_df) && orientation == "sample_x") {
      p <- p + ggplot2::geom_errorbar(data = error_df, 
                                      ggplot2::aes(x=xVal, ymin=MeanTotal-ErrorTotal, ymax=MeanTotal+ErrorTotal), 
                                      inherit.aes=FALSE, width=0.2)
    } else if (error_bar_type == "individual" && "ErrorMin" %in% names(plot_df)) {
      if (isTRUE(color_error_bars_by_class)) {
        p <- p + ggplot2::geom_errorbar(data = plot_df,
                                        ggplot2::aes(x=xVal, ymin=ErrorMin, ymax=ErrorMax, color=fillVal),
                                        inherit.aes=FALSE, width=0.2, linewidth = 0.8) +
                 ggplot2::scale_color_manual(values = fillMap, guide = "none")
      } else {
        p <- p + ggplot2::geom_errorbar(data = plot_df,
                                        ggplot2::aes(x=xVal, ymin=ErrorMin, ymax=ErrorMax),
                                        inherit.aes=FALSE, width=0.2, color = "black")
      }
    }
  }
  
  return(p)
}

buildDonutPlot <- function(mat, titleText, 
                           annotation_data,
                           group_mode = "Sub-class",
                           value_mode = "Absolute (%)",
                           sample_grouping = NULL,
                           aggregate_by_group = FALSE,
                           class_colors = NULL,
                           show_stats = FALSE,
                           orientation = "sample_x",
                           sample_colors = NULL,
                           ncols = 4,
                           min_pct = 0.0) {
  validate(need(is.matrix(mat) && nrow(mat) > 0 && ncol(mat) > 0, "No data for donut plot."))
  req(annotation_data)
  
  # Prepare Long Format Data
  dfm <- as.data.frame(mat) %>% tibble::rownames_to_column("Lipid_Name") %>%
    dplyr::left_join(dplyr::select(annotation_data, Lipid_Name, subclass, hyperclass), by = "Lipid_Name") %>%
    tidyr::pivot_longer(cols = dplyr::all_of(colnames(mat)), names_to = "SampleCol", values_to = "Intensity")
  
  # Normalize if requested
  if (grepl("^Normalized", value_mode)) {
    dfm <- dfm %>% dplyr::group_by(Lipid_Name) %>% 
      dplyr::mutate(rowSum = sum(Intensity, na.rm = TRUE), 
                    Intensity = dplyr::if_else(rowSum > 0, Intensity / rowSum, 0)) %>% 
      dplyr::ungroup()
  }
  
  # Grouping Variable (ClassGroup)
  groupVar <- if (group_mode %in% c("Hyperclass", "Lipid Category", "hyperclass")) {
     "hyperclass" 
  } else if (group_mode %in% c("Sub-class", "Lipid Main Class", "subclass", "Class")) {
     "subclass"
  } else {
      if (group_mode %in% names(dfm)) group_mode else "subclass"
  }
  dfm <- dfm %>% dplyr::rename(ClassGroup = dplyr::all_of(groupVar))
  
  # Enforce Original Sample Order
  dfm$SampleCol <- factor(dfm$SampleCol, levels = colnames(mat))
  
  # Helper for aggregation mapping
  if (!is.null(sample_grouping)) {
    dfm$Group <- sample_grouping[as.character(dfm$SampleCol)]
    dfm <- dfm %>% dplyr::filter(!is.na(Group))
  }
  
  # Reduce to Class Level per Sample
  df_class_sample <- dfm %>% 
    dplyr::group_by(SampleCol, ClassGroup) %>% 
    dplyr::summarize(Value = sum(Intensity, na.rm = TRUE), .groups = "drop")
    
  if (!is.null(sample_grouping)) {
    ordered_groups <- unique(sample_grouping[colnames(mat)])
    ordered_groups <- ordered_groups[!is.na(ordered_groups)]
    df_class_sample$Group <- factor(sample_grouping[as.character(df_class_sample$SampleCol)], levels = ordered_groups)
    df_class_sample <- df_class_sample %>% dplyr::filter(!is.na(Group))
  }

  if (orientation == "class_x") {
    # Each donut is a ClassGroup. Slices represent samples/groups.
    if (isTRUE(aggregate_by_group) && !is.null(sample_grouping)) {
      # Slices are Groups
      plot_df <- df_class_sample %>%
        dplyr::group_by(Group, ClassGroup) %>%
        dplyr::summarize(Value = mean(Value, na.rm = TRUE), .groups = "drop") %>%
        dplyr::rename(FacetVar = ClassGroup, SliceGroup = Group)
    } else {
      # Slices are SampleCols
      plot_df <- df_class_sample %>%
        dplyr::rename(FacetVar = ClassGroup, SliceGroup = SampleCol)
    }
  } else {
    # Each donut is a Sample/Group. Slices represent classes.
    if (isTRUE(aggregate_by_group) && !is.null(sample_grouping)) {
      # Donuts are Groups
      plot_df <- df_class_sample %>%
        dplyr::group_by(Group, ClassGroup) %>%
        dplyr::summarize(Value = mean(Value, na.rm = TRUE), .groups = "drop") %>%
        dplyr::rename(FacetVar = Group, SliceGroup = ClassGroup)
    } else {
      # Donuts are SampleCols
      plot_df <- df_class_sample %>%
        dplyr::rename(FacetVar = SampleCol, SliceGroup = ClassGroup)
    }
  }
  
  # Calculate cumulative sum coordinates for donut slices
  plot_df <- plot_df %>%
    dplyr::arrange(FacetVar, desc(SliceGroup)) %>%
    dplyr::group_by(FacetVar) %>%
    dplyr::mutate(
      TotalVal = sum(Value, na.rm = TRUE),
      Pct = dplyr::if_else(TotalVal > 0, Value / TotalVal * 100, 0),
      ymax = cumsum(Pct / 100),
      ymin = c(0, head(ymax, n = -1)),
      y_mid = (ymax + ymin) / 2
    ) %>%
    dplyr::ungroup()
  
  # Get color map
  fillMap <- NULL
  if (orientation == "class_x") {
    if (!is.null(sample_colors)) {
      fillMap <- sample_colors
    } else {
      unique_slices <- unique(plot_df$SliceGroup)
      fillMap <- colorRampPalette(RColorBrewer::brewer.pal(9, "Set1"))(length(unique_slices)) %>% 
        setNames(nm = unique_slices)
    }
  } else {
    if (!is.null(class_colors)) {
      fillMap <- class_colors
    } else {
      unique_slices <- unique(plot_df$SliceGroup)
      fillMap <- colorRampPalette(RColorBrewer::brewer.pal(9, "Set1"))(length(unique_slices)) %>% 
        setNames(nm = unique_slices)
    }
  }
  
  # Calculate grid columns
  n_facets <- length(unique(plot_df$FacetVar))
  ncols_use <- if (!is.null(ncols)) min(ncols, n_facets) else min(4, n_facets)
  if (is.na(ncols_use) || ncols_use <= 0) ncols_use <- 1
  
  p <- ggplot2::ggplot(plot_df) +
    ggplot2::geom_rect(ggplot2::aes(ymin = ymin, ymax = ymax, xmin = 2, xmax = 3, fill = SliceGroup), color = "white", linewidth = 0.5) +
    ggplot2::coord_polar(theta = "y", start = 0) +
    ggplot2::xlim(0.5, 3.5) +
    ggplot2::facet_wrap(~ FacetVar, ncol = ncols_use) +
    ggplot2::scale_fill_manual(values = fillMap, name = NULL, na.value = "grey50") +
    ggplot2::theme_void(base_size = 14) +
    ggplot2::theme(
      legend.position = "right",
      plot.title = ggplot2::element_text(face = "bold", hjust = 0.5, size = 16, margin = ggplot2::margin(b = 10)),
      strip.text = ggplot2::element_text(face = "bold", size = 9.3, color = "black", margin = ggplot2::margin(b = 5))
    ) +
    ggplot2::ggtitle(titleText)
    
  # Overlay stats labels if checked
  if (isTRUE(show_stats)) {
    label_df <- plot_df %>% dplyr::filter(Pct >= min_pct)
    p <- p + ggrepel::geom_label_repel(
      data = label_df,
      ggplot2::aes(x = 2.5, y = y_mid, label = sprintf("%.1f%%", Pct), fill = SliceGroup),
      color = "black", fontface = "bold", size = 3.5, show.legend = FALSE,
      family = "sans", nudge_x = 0.8, segment.color = "grey30", segment.size = 0.4,
      max.overlaps = Inf
    )
  }
  
  return(p)
}

# ==============================================================================
# --- 4. Utilities ---
# ==============================================================================

getDownloadFilename <- function(sheetName=NULL, tabName, extension, repMode) {
  date_str <- format(Sys.Date(), "%y%m%d")
  repStr <- ifelse(grepl("aggregate", repMode), "Agg", "Rep")
  sheetString <- if(!is.null(sheetName)) tools::file_path_sans_ext(basename(sheetName)) else "LipidAnalysis"
  paste0("LipidAnalysis_", date_str, "_", sheetString, "_", tabName, "_", repStr, ".", extension)
}

# ==============================================================================
# --- 5. LogRatio Violin Plot ---
# ==============================================================================

#' Generate LogRatio Violin Plot with Significance Markers
#' 
#' @param df Dataframe containing Log2FC, GroupingVal, etc.
#' @param target_features Vector of features to plot.
#' @param baseline_groups Vector of baseline groups.
#' @param color_mapping Named vector for filling GroupingVal colors.
#' @param y_label Character string for the Y-axis label.
#' @param show_baseline Boolean, whether to plot horizontal line at Y=0.
#' @param return_list Boolean, whether to return list of raw plots instead of patchwork.
#' @param color_var Optional dimension strictly overriding plot map colors natively.
#' 
plot_logratio_violin <- function(df, target_features, baseline_groups, color_mapping, y_label = "Value", show_baseline = FALSE, return_list = FALSE, color_var = NULL, sig_display_type = "star", show_legend = FALSE, facet_fontsize = 11, sig_threshold = 0.05) {
  req(nrow(df) > 0)
  
  plots <- list()
  
  for(feat in target_features) {
    sub_df <- df %>% dplyr::filter(Feature == feat)
    v_val <- var(sub_df$Plot_Value, na.rm = TRUE)
    if (nrow(sub_df) == 0 || is.na(v_val) || v_val == 0) next
    
    y_max <- max(sub_df$Plot_Value[is.finite(sub_df$Plot_Value)], na.rm=TRUE)
    y_min <- min(sub_df$Plot_Value[is.finite(sub_df$Plot_Value)], na.rm=TRUE)
    y_range <- y_max - y_min
    if(is.na(y_range) || y_range == 0 || is.infinite(y_range)) y_range <- 1
    
    clean_title <- gsub("_", " ", feat)
    
  # Identify Dimensional Structure
    has_facets <- "Facet_Grp" %in% colnames(sub_df) && !all(sub_df$Facet_Grp == "All")
    
    x_var <- if ("X_Grp" %in% colnames(sub_df)) "X_Grp" else "GroupingVal"
    fill_var <- if(!is.null(color_var) && color_var %in% colnames(sub_df)) color_var else (if("GroupingVal" %in% colnames(sub_df)) "GroupingVal" else x_var)
    
  # Groups: trust the pre-assigned factor levels from processed_db
    all_groups <- levels(sub_df[[x_var]])
    if (is.null(all_groups)) all_groups <- unique(as.character(sub_df[[x_var]]))
    
    # Initialize height tracker across all X positions using maximum density / dot tips
    x_heights <- numeric(length(all_groups))
    for (j in seq_along(all_groups)) {
       g <- all_groups[j]
       g_vals <- na.omit(sub_df$Plot_Value[sub_df[[x_var]] == g & is.finite(sub_df$Plot_Value)])
       if (length(g_vals) >= 2) {
          dens <- tryCatch(density(g_vals, adjust = 1)$x, error = function(e) g_vals)
          x_heights[j] <- max(dens, na.rm = TRUE)
       } else if (length(g_vals) == 1) {
          x_heights[j] <- g_vals
       } else {
          x_heights[j] <- y_min
       }
    }
    
    annot_df <- data.frame()
    
    if (has_facets) {
       ref_x <- unique(sub_df$X_Grp[sub_df$GroupingVal %in% baseline_groups])[1]
       if (is.na(ref_x)) ref_x <- all_groups[1]
       
       for(fac in unique(sub_df$Facet_Grp)) {
          f_df <- sub_df %>% dplyr::filter(Facet_Grp == fac)
          for(grp in setdiff(unique(sub_df$GroupingVal), baseline_groups)) {
             g_df <- f_df %>% dplyr::filter(GroupingVal == grp)
             if(nrow(g_df) == 0) next
             
             stars_val <- g_df$Significance[1]
             p_val <- g_df$P_Value[1]
             annot_text <- if (sig_display_type == "pvalue") {
                if (is.na(p_val) || p_val >= sig_threshold) ""
                else if (p_val < 0.001) sprintf("p = %.1e", p_val)
                else sprintf("p = %.3f", p_val)
             } else {
                if (!is.na(p_val) && p_val >= sig_threshold) "ns" else stars_val
             }
             if(!is.na(annot_text) && annot_text != "ns" && annot_text != "Reference" && annot_text != "") {
                target_x <- unique(g_df$X_Grp)[1]
                if (is.na(target_x)) next
                
                xmin_idx <- match(ref_x, all_groups)
                xmax_idx <- match(target_x, all_groups)
                if (is.na(xmin_idx) || is.na(xmax_idx)) next
                
                if (xmin_idx > xmax_idx) {
                   tmp <- xmin_idx
                   xmin_idx <- xmax_idx
                   xmax_idx <- tmp
                }
                
                span_indices <- xmin_idx:xmax_idx
                bracket_y <- max(x_heights[span_indices], na.rm = TRUE) + (y_range * 0.08)
                
                annot_df <- rbind(annot_df, data.frame(
                   GroupingVal = grp,
                   Facet_Grp = fac,
                   X_Grp = grp,
                   Plot_Value = bracket_y,
                   xmin = xmin_idx,
                   xmax = xmax_idx,
                   stars = annot_text,
                   stringsAsFactors = FALSE
                ))
                x_heights[span_indices] <- bracket_y + (y_range * 0.14)
              }
           }
        }
     } else {
        for(grp in setdiff(unique(sub_df$GroupingVal), baseline_groups)) {
           g_df <- sub_df %>% dplyr::filter(GroupingVal == grp)
           if(nrow(g_df) == 0) next
           
           stars_val <- g_df$Significance[1]
           p_val <- g_df$P_Value[1]
           annot_text <- if (sig_display_type == "pvalue") {
              if (is.na(p_val) || p_val >= sig_threshold) ""
              else if (p_val < 0.001) sprintf("p = %.1e", p_val)
              else sprintf("p = %.3f", p_val)
           } else {
              if (!is.na(p_val) && p_val >= sig_threshold) "ns" else stars_val
           }
           if(!is.na(annot_text) && annot_text != "ns" && annot_text != "Reference" && annot_text != "") {
              target_x <- grp
              xmin_idx <- match(baseline_groups[1], all_groups)
              xmax_idx <- match(target_x, all_groups)
              if (is.na(xmin_idx) || is.na(xmax_idx)) next
              
              if (xmin_idx > xmax_idx) {
                 tmp <- xmin_idx
                 xmin_idx <- xmax_idx
                 xmax_idx <- tmp
              }
              
              span_indices <- xmin_idx:xmax_idx
              bracket_y <- max(x_heights[span_indices], na.rm = TRUE) + (y_range * 0.08)
              
              annot_df <- rbind(annot_df, data.frame(
                 GroupingVal = grp, 
                 Plot_Value = bracket_y,
                 xmin = xmin_idx,
                 xmax = xmax_idx,
                 stars = annot_text,
                 stringsAsFactors = FALSE
              ))
              x_heights[span_indices] <- bracket_y + (y_range * 0.14)
           }
        }
     }
     
     # Track overall plot ceiling to accommodate high brackets
     y_ceiling <- if (nrow(annot_df) > 0) max(c(x_heights + y_range * 0.1, y_max + y_range * 0.2), na.rm = TRUE) else y_max + y_range * 0.1
     
     p <- ggplot2::ggplot(sub_df, ggplot2::aes(x = .data[[x_var]], y = Plot_Value, fill = .data[[fill_var]]))
     
     if (show_baseline) {
        p <- p + ggplot2::geom_hline(yintercept = 0, linetype = "dashed", color = "grey50", linewidth = 0.5)
     }
     
     is_dodged <- (x_var != fill_var) && !all(as.character(sub_df[[x_var]]) == as.character(sub_df[[fill_var]]))
     if (is_dodged) {
        p <- p + ggplot2::geom_violin(position = ggplot2::position_dodge(0.8), trim = FALSE, color = "black", linewidth = 0.2, alpha = 0.8) +
          ggplot2::geom_boxplot(position = ggplot2::position_dodge(0.8), width = 0.15, fill = "white", color = "black", outlier.shape = NA, linewidth = 0.2) +
          ggplot2::geom_jitter(position = ggplot2::position_jitterdodge(jitter.width = 0.1, dodge.width = 0.8), shape = 21, color = "black", size = 2, fill="white", stroke=0.8)
     } else {
        p <- p + ggplot2::geom_violin(trim = FALSE, color = "black", linewidth = 0.2, alpha = 0.8) +
          ggplot2::geom_boxplot(width = 0.2, fill = "white", color = "black", outlier.shape = NA, linewidth = 0.2) +
          ggplot2::geom_jitter(width = 0.1, shape = 21, color = "black", size = 2, fill="white", stroke=1)
     }
     
     if (!is.null(color_mapping) && !is.null(names(color_mapping))) {
        req_lvls <- unique(as.character(sub_df[[fill_var]]))
        missing_lvls <- setdiff(req_lvls, names(color_mapping))
        if (length(missing_lvls) > 0) {
           pal <- RColorBrewer::brewer.pal(min(9, max(3, length(missing_lvls))), "Set1")
           if (length(missing_lvls) > length(pal)) pal <- colorRampPalette(pal)(length(missing_lvls))
           color_mapping <- c(color_mapping, stats::setNames(pal[1:length(missing_lvls)], missing_lvls))
        }
     }
     
     p <- p + ggplot2::scale_fill_manual(values = color_mapping) +
       ggplot2::scale_x_discrete(limits = all_groups, drop = FALSE) +
       ggplot2::theme_classic(base_size = 14) +
       ggplot2::theme(
         text = ggplot2::element_text(family = "sans"),
         plot.title = ggplot2::element_text(size = max(12, facet_fontsize + 4), face = "bold", hjust = 0.5),
         axis.text.x = ggplot2::element_text(size = 12, angle = 45, hjust = 1, face = "bold"),
         axis.text.y = ggplot2::element_text(size = 12),
         axis.title.x = ggplot2::element_blank(),
         axis.title.y = ggplot2::element_text(size = 12, face = "bold", margin = ggplot2::margin(r = 5)),
         strip.text = ggplot2::element_text(size = facet_fontsize, face = "bold", color = "black"),
         strip.background = ggplot2::element_rect(fill="grey90", color="black", linewidth=0.5),
         panel.grid.major.y = ggplot2::element_line(color = "grey80", linetype = "dotted"),
         legend.position = if (isTRUE(show_legend)) "right" else "none",
         aspect.ratio = 0.95,
         plot.margin = ggplot2::margin(t=15, r=10, b=15, l=10)
       ) +
       ggplot2::labs(title = clean_title, y = y_label) +
       ggplot2::expand_limits(y = y_ceiling) +
       ggplot2::scale_y_continuous(expand = ggplot2::expansion(mult = c(0.1, 0.05))) +
       ggplot2::coord_cartesian(clip = "off")
       
     facet_vals <- if (has_facets) unique(as.character(sub_df$Facet_Grp)) else character(0)
     is_duplicate_facet <- has_facets && length(facet_vals) == 1 && (
        gsub("_", " ", facet_vals[1]) == clean_title ||
        facet_vals[1] == clean_title
     )
     
     if (!is_duplicate_facet && has_facets) {
        p <- p + ggplot2::facet_wrap(~ Facet_Grp, scales = "free_x")
     }
       
     if(nrow(annot_df) > 0) {
        annot_df$x_center <- (annot_df$xmin + annot_df$xmax) / 2
        annot_df$text_y <- annot_df$Plot_Value + (y_range * 0.02)
        
        p <- p + 
           ggplot2::geom_segment(
              data = annot_df,
              ggplot2::aes(x = xmin, xend = xmax, y = Plot_Value, yend = Plot_Value),
              inherit.aes = FALSE, color = "black", linewidth = 0.4
           ) +
           ggplot2::geom_text(
              data = annot_df,
              ggplot2::aes(x = x_center, y = text_y, label = stars),
              inherit.aes = FALSE, color = "black", size = 3.8, fontface = "bold", vjust = 0
           )
     }
    plots[[feat]] <- p
  }
  
  if(length(plots) == 0) return(NULL)
  
  if (return_list) {
     return(plots)
  }

  if(length(plots) == 1) return(plots[[1]])

  if(!requireNamespace("patchwork", quietly = TRUE)) {
    warning("patchwork package required to combine multiple plots. Returning first plot.")
    return(plots[[1]])
  }
  
  patchwork::wrap_plots(plots, ncol = min(3, length(plots)))
}
