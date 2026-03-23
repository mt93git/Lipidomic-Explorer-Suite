# R/modules/99_debug_module.R
# Debugging Utility for Heatmap Sorting

debug_ui <- function(id) {
  ns <- NS(id)
  tagList(
    card(
      card_header("Heatmap Sorting Diagnostics"),
      layout_columns(
        col_widths = c(6, 6),
        card(
           card_header("State Overview"),
           verbatimTextOutput(ns("state_summary"))
        ),
        card(
           card_header("Class Order (Invariant Source)"),
           verbatimTextOutput(ns("class_order_dump"))
        )
      ),
      layout_columns(
        col_widths = c(6, 6),
        card(
           card_header("Unfiltered Data Preview"),
           DT::dataTableOutput(ns("unfiltered_table"))
        ),
        card(
           card_header("Filtered Data Preview (Matches Screenshot?)"),
           DT::dataTableOutput(ns("filtered_table"))
        )
      ),
      card(
        card_header("Annotation Check (Why is it splitting?)"),
        DT::dataTableOutput(ns("annotation_table"))
      ),
      card(
        card_header("Aggregation Logic Check"),
        verbatimTextOutput(ns("aggregation_dump"))
      )
    )
  )
}

debug_server <- function(id, heatmap_state) {
  moduleServer(id, function(input, output, session) {
    
    output$state_summary <- renderPrint({
      req(heatmap_state)
      st <- heatmap_state()
      cat("--- Heatmap Mode ---\n")
      cat("Selected Mode:", st$sort_mode, "\n")
      cat("Scale Mode:   ", st$scale_mode, "\n")
      
      cat("\n--- Matrices ---\n")
      if(!is.null(st$replicate_matrix)) {
          cat("Replicate Matrix: ", paste(dim(st$replicate_matrix), collapse=" x "), "\n")
      } else {
          cat("Replicate Matrix: NULL\n")
      }
      
      if(!is.null(st$aggregated_matrix)) {
          cat("Aggregated Matrix:", paste(dim(st$aggregated_matrix), collapse=" x "), "\n")
      } else {
          cat("Aggregated Matrix: NULL\n")
      }
      
      cat("\n--- Sorting (Rows) ---\n")
      if(!is.null(st$unfiltered_rows)) {
          cat("Unfiltered Rows:", length(st$unfiltered_rows), "\n")
          cat("Top 5 (Unfiltered):", paste(head(st$unfiltered_rows, 5), collapse=", "), "\n")
      }
      if(!is.null(st$filtered_rows)) {
          cat("Filtered Rows:", length(st$filtered_rows), "\n")
          cat("Top 5 (Filtered):", paste(head(st$filtered_rows, 5), collapse=", "), "\n")
      }
    })
    
    output$class_order_dump <- renderPrint({
      req(heatmap_state)
      st <- heatmap_state()
      
      cat("--- Global Color Map Keys (Invariant Order) ---\n")
      if(!is.null(st$class_map)) {
         cat("Total Classes:", length(names(st$class_map)), "\n")
         print(names(st$class_map))
      } else {
         cat("Class Map is NULL! (Crucial Failure)\n")
         if(exists("CLASS_MAP_COLORS")) {
             cat("fallback: CLASS_MAP_COLORS exists in global env.\n")
         } else {
             cat("fallback: CLASS_MAP_COLORS MISSING globally.\n")
         }
      }
    })
    
    output$unfiltered_table <- DT::renderDataTable({
      req(heatmap_state)
      st <- heatmap_state()
      req(st$unfiltered_preview)
      DT::datatable(st$unfiltered_preview, options = list(pageLength = 5, scrollX = TRUE))
    })

    output$filtered_table <- DT::renderDataTable({
      req(heatmap_state)
      st <- heatmap_state()
      if(is.null(st$filtered_preview)) return(NULL)
      DT::datatable(st$filtered_preview, options = list(pageLength = 5, scrollX = TRUE))
    })
    
    output$annotation_table <- DT::renderDataTable({
      req(heatmap_state)
      st <- heatmap_state()
      if(is.null(st$filtered_annotation)) return(NULL)
      
   # Enhance with Debug Info
      df <- st$filtered_annotation
      
   # 1. Add Block Info (Primary Sort Key)
   # required the matrix values to determine max
      mat <- st$filtered_preview # This is just head... we need full matrix
   # heatmap_module doesn't export full sorted matrix in filtered_preview usually?
   # exported filtered_rows. capable to get data from Aggregated Matrix (if Mode 1/2)
      
   # Let's use the annotation df directly and map class index
      if(!is.null(st$class_map)) {
         fixed_levels <- names(st$class_map)
         df$Class_Index <- match(df$subclass, fixed_levels)
         df$Is_Known_Class <- !is.na(df$Class_Index)
      }
      
   # 2. Add Block Info from Aggregated Matrix (if available)
      if(!is.null(st$aggregated_matrix)) {
          agg <- st$aggregated_matrix
     # Subset to these lipids
          common <- intersect(df$Lipid_Name, rownames(agg))
          if(length(common) > 0) {
              sub_agg <- agg[common, , drop=FALSE]
       # Calculate Max Col
              max_idx <- apply(sub_agg, 1, which.max)
              max_names <- colnames(sub_agg)[max_idx]
              
       # Map back to df
              df$Staircase_Block <- max_names[match(df$Lipid_Name, rownames(sub_agg))]
          }
      }

   # Sort by same order as filtered rows if possible (The Display Order)
      if(!is.null(st$filtered_rows)) {
         df <- df[match(st$filtered_rows, df$Lipid_Name), , drop=FALSE]
      }
      
   # DEBUG: Dump to Console to ensure visibility
      print("DEBUG: Annotation Check Table (Top 10):")
      print(head(df, 10))
      
      DT::datatable(df, options = list(pageLength = 50, scrollX = TRUE))
    })
    
    output$aggregation_dump <- renderPrint({
      req(heatmap_state)
      st <- heatmap_state()
      
      if(!is.null(st$aggregated_matrix)) {
          cat("Aggregation Columns (Groups):\n")
          print(colnames(st$aggregated_matrix))
      }
      
      cat("\nReplicate Columns (Samples):\n")
      if(!is.null(st$replicate_matrix)) {
          print(colnames(st$replicate_matrix))
      }
    })
    
  })
}
