# R/modules/98_system_debug_module.R
# System Debug Tab

system_debug_ui <- function(id) {
  ns <- NS(id)
  tagList(
    card(
      card_header("System State & Active Reactives"),
      layout_columns(
        col_widths = c(4, 4, 4),
        card(
          card_header("Selected Samples & Groups"),
          verbatimTextOutput(ns("debug_metadata"))
        ),
        card(
          card_header("Differential Expression State"),
          verbatimTextOutput(ns("debug_de_state"))
        ),
        card(
          card_header("Data Ingestion & Alignment Debugger"),
          verbatimTextOutput(ns("debug_multiomics"))
        )
      ),
      card(
        card_header("Processed Data Matrix Head"),
        DTOutput(ns("debug_matrix"))
      )
    )
  )
}

system_debug_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    
    output$debug_metadata <- renderPrint({
      meta <- shared_data$grouped_metadata()
      if(is.null(meta)) {
         cat("No metadata available yet.\n")
         return()
      }
      cat("Analysis Mode:", shared_data$analysisMode(), "\n")
      cat("Total Samples Parsed:", nrow(meta), "\n\n")
      print(head(meta, 15))
    })
    
    output$debug_de_state <- renderPrint({
      contrast <- shared_data$de_contrast_info()
      settings <- shared_data$de_settings()
      
      if(is.null(contrast)) {
         cat("No DE Contrast set.\n")
      } else {
         cat("Reference Group(s): ", paste(contrast$ref, collapse=", "), "\n")
         cat("Comparison Group(s):", paste(contrast$comp, collapse=", "), "\n")
         cat("Contrast String:    ", contrast$str, "\n")
      }
      cat("\n--- Settings ---\n")
      print(settings)
    })
    
    output$debug_multiomics <- renderPrint({
      df_abund <- shared_data$data_processed()
      anno <- shared_data$annotationData()
      meta <- shared_data$grouped_metadata()
      mode <- shared_data$analysisMode() %||% "Global Lipidomics"
      
      cat("=== Data Ingestion & Mapping Status ===\n")
      cat("Active Analysis Mode: ", mode, "\n")
      cat("Lipidomics Loaded:    ", !is.null(df_abund), if (!is.null(df_abund)) sprintf("(%d lipids)", nrow(df_abund)) else "", "\n")
      cat("Metadata Loaded:       ", !is.null(meta), if (!is.null(meta)) sprintf("(%d samples)", nrow(meta)) else "", "\n")
      
      if (is.null(df_abund) || is.null(anno) || is.null(meta)) {
        cat("\n[STATUS] Data ingestion is not complete yet.\n")
        return()
      }
      
      # subclass counts
      subclasses <- table(anno$subclass)
      cat("\nParsed Lipid Main Classes:\n")
      print(subclasses)
      
      # Match status
      mediator_subclasses <- intersect(names(subclasses), c("Prostaglandin", "Leukotriene", "Hydroxy fatty acid", "Lipoxin"))
      if (length(mediator_subclasses) > 0) {
        cat("\n⚠️ WARNING / MISMATCH DETECTED:\n")
        cat("This is the Global Lipidomic Explorer, but your dataset appears to contain Lipid Mediator classes.\n")
        cat("👉 RESOLUTION: Please use the standard Lipidomic Explorer application for Lipid Mediator analysis.\n")
      }
    })
    
    output$debug_matrix <- renderDT({
      df <- shared_data$data_processed()
      req(df)
      DT::datatable(head(df, 15), options = list(scrollX = TRUE, pageLength = 15))
    })
    
  })
}
