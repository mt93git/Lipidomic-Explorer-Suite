# R/modules/1_shared_data_module.R
# Shared functionality and data hub.

shared_data_ui <- function(id) {
  ns <- NS(id)
  tagList(
    accordion(
       open = "1. Input & Run Analysis", multiple = TRUE,
       accordion_panel("0. Lexicon", icon = icon("book"),
         tags$div(style="max-height: 300px; overflow-y: auto;",
           strong("Hyperclass:"), 
           tags$div(style="margin-left: 10px;",
             p(strong("FA: Fatty Acyls")),
             tags$ul(
               tags$li("ACar: Acylcarnitine")
             ),
             p(strong("GP: Glycerophospholipids")),
             tags$ul(
               tags$li("CL: Cardiolipin"), 
               tags$li("LPC: Lysophosphatidylcholine"), 
               tags$li("LPG: Lysophosphatidylglycerol"),
               tags$li("LPI: Lysophosphatidylinositol"), 
               tags$li("LPS: Lysophosphatidylserine"), 
               tags$li("PC: Phosphatidylcholine"), 
               tags$li("PE: Phosphatidylethanolamine"),
               tags$li("PE_E: Phosphatidylethanolamine (Ether-linked)"), 
               tags$li("PE_P: Phosphatidylethanolamine (Plasmalogen)"), 
               tags$li("PG: Phosphatidylglycerol"),
               tags$li("PI: Phosphatidylinositol"), 
               tags$li("PS: Phosphatidylserine")
             ),
             p(strong("SP: Sphingolipids")),
             tags$ul(
               tags$li("Cer_dh: Ceramide (Dihydro)"),
               tags$li("GlcCer: Glucosylceramide"), 
               tags$li("LacCer: Lactosylceramide"), 
               tags$li("SM: Sphingomyelin"), 
               tags$li("SM_dh: Sphingomyelin (Dihydro)")
             ),
             p(strong("ST: Sterol Lipids")),
             tags$ul(
               tags$li("CE: Cholesteryl Ester")
             ),
             p(strong("GL: Glycerolipids")),
             tags$ul(
               tags$li("DAG: Diacylglycerol"),
               tags$li("TAG: Triacylglycerol")
             )
           ),
           strong("Modification:"), 
           tags$ul(
             tags$li("Dihydro (d-): Dihydro-modification"),
             tags$li("Standard: Normal backbone"),
             tags$li("Plasmalogen (P-): Plasmalogen ether linkage"),
             tags$li("Ether (O-): Ether linkage")
           ),
           strong("Filters:"),
           p("Saturation:"),
           tags$ul(tags$li("SFA: Saturated Fatty Acid"), tags$li("MUFA: Monounsaturated Fatty Acid"), tags$li("PUFA: Polyunsaturated Fatty Acid")),
           p("Length:"),
           tags$ul(tags$li("SCFA: Short-Chain (<6C)"), tags$li("MCFA: Medium-Chain (6-12C)"), tags$li("LCFA: Long-Chain (13-21C)"), tags$li("VLCFA: Very-Long-Chain (>21C)"))
         )
       ),
       accordion_panel("1. Input & Run Analysis", icon = icon("upload"),
          radioButtons(ns("analysisMode"), "Analysis Mode:", 
                       choices = c("Global Lipidomics", "Lipid Mediators"), 
                       selected = "Global Lipidomics", inline = TRUE),
          fileInput(ns("files"), "Upload Data File(s):", multiple = TRUE, accept = c(".csv", ".xlsx")),
          uiOutput(ns("loaded_files_display")),
          hr(),
          actionButton(ns("runAnalysis"), "Run Analysis", icon = icon("play"), class = "btn-primary w-100")
       ),
       accordion_panel("2. Sample Selection", icon = icon("check-square"),
     # CSS to force wrapping of long sample names
         tags$style(HTML(".checkbox label { white-space: normal; word-wrap: break-word; }")),
         uiOutput(ns("columnSelectorUI")),
         layout_columns(col_widths=c(6,6),
                        actionButton(ns("selectAll"), "Select All", icon=icon("check-square"), class="btn-sm w-100"),
                        actionButton(ns("unselectAll"), "Unselect All", icon=icon("square"), class="btn-sm w-100")),
         hr(),
     # --- PROTOCOL: SYNTHETIC PRESERVATION TOGGLE ---
         checkboxInput(ns("useAveragedSubstitution"), "Preserve matrix: Use group average for unchecked samples", FALSE)
       ),
       accordion_panel("3. Differential Expression", icon = icon("scale-balanced"),
         selectInput(ns("deMethod"), "Method:", choices = c("limma"), selected = "limma"),
         checkboxInput(ns("deOrientCondition"), "Group by Condition", TRUE),
         checkboxInput(ns("deOrientPopulation"), "Group by Population", TRUE),
         radioButtons(ns("deComparisonMode"), "Mode:", choices = c("Direct" = "direct", "Interaction" = "interaction"), inline = TRUE),
         conditionalPanel("input.deComparisonMode == 'direct'", ns = ns,
           uiOutput(ns("deReferenceGroupUI")), uiOutput(ns("deComparisonGroupUI"))
         ),
         conditionalPanel("input.deComparisonMode == 'interaction'", ns = ns,
           uiOutput(ns("deInteractionGroupUI"))
         ),
         hr(),
         radioButtons(ns("pValueType"), "P-value Type:", 
                      choices = c("Adjusted (BH-FDR)" = "adjusted", "Raw (uncorrected)" = "raw"),
                      selected = "adjusted"),
         numericInput(ns("pFilterThreshold"), "Threshold <", 0.05, step = 0.01),
         numericInput(ns("log2fcThreshold"), "|Log2FC| >=", 1, step = 0.1)
       ),
       accordion_panel("4. Lipid Class Filters", icon = icon("filter"),
         uiOutput(ns("hyperclassSelectorUI")),
         uiOutput(ns("subclassSelectorUI")),

         uiOutput(ns("modificationSelectorUI")),
         hr(),
         uiOutput(ns("splitControlUI"))
       ),
       accordion_panel("5. Advanced Filters", icon = icon("flask"),
         checkboxGroupInput(ns("selectedSaturationFeatures"), "Saturation:", choices = c("SFA", "MUFA", "PUFA"), inline = TRUE),
         checkboxGroupInput(ns("selectedLengthFeatures"), "Length:", choices = c("SCFA", "MCFA", "LCFA", "VLCFA"), inline = TRUE)
       ),
       accordion_panel("6. Granular Chain Filters", icon = icon("ruler"),
         checkboxInput(ns("activateGranularFiltering"), "Activate", FALSE),
         conditionalPanel("input.activateGranularFiltering == true", ns = ns,
           checkboxInput(ns("useCombo1"), "Combo 1", TRUE),
           uiOutput(ns("combo1SlidersUI")),
           checkboxInput(ns("useCombo2"), "Combo 2", FALSE),
           uiOutput(ns("combo2SlidersUI")),
           radioButtons(ns("granularOrderMode"), "Logic:", choices = c("Ignore Order" = "ignore", "Respect Order" = "respect"), selected = "ignore")
         )
       ),
       accordion_panel("7. Substrate Filters", icon = icon("dna"),
         checkboxGroupInput(ns("n6_substrates"), "n-6 Pathway:", choices = c("AA (20:4)"="20:4", "DGLA (20:3)"="20:3", "AdA (22:4)"="22:4"), inline = TRUE),
         checkboxGroupInput(ns("n3_substrates"), "n-3 Pathway:", choices = c("EPA (20:5)"="20:5", "DHA (22:6)"="22:6", "DPA (22:5)"="22:5"), inline = TRUE),
         radioButtons(ns("substrate_match_positions"), "Position:", choices = c("Any"="any", "sn-1"="sn1", "sn-2"="sn2"), selected = "any", inline = TRUE)
       ),
       accordion_panel("8. Change Color", icon = icon("palette"),
         p(class="text-muted small", "Customize colors for all detected lipid classes globally."),
         
     # --- Context Selector ---
         selectInput(ns("colorEditMode"), "Select Color Context:", 
                     choices = c("Lipid Class", "Biosynthetic Origin", "Lipid Mediator Single Species"),
                     selected = "Lipid Class", width = "100%"),

         uiOutput(ns("classColorUI"))
       )
    )
  )
}

# Server logic

shared_data_server <- function(id, external_settings = reactive(NULL)) {
  moduleServer(id, function(input, output, session) {
    
    SHAPE_CHOICES <- c("Circle"=16, "Square"=15, "Triangle"=17, "Diamond"=18, "Plus"=3, "Cross"=4, "Star"=8)
    
    rv <- reactiveValues(
        uploads = list(), # Now stores PATHS only
        origin_colors = list(), # Persistent store for Origin Colors
        species_colors = list() # Persistent store for Species Colors
    )

  # --- HELPER: Detect File Type ---
    detect_file_type <- function(fp) {
        if(!file.exists(fp)) return("unknown")
    # Try reading header
        header <- tryCatch(
            readxl::read_excel(fp, n_max = 5, .name_repair = "minimal"), 
            error = function(e) return(NULL)
        )
        if(is.null(header)) return("unknown")
        
        cols <- colnames(header)
    # Signature: Lipid Mediator (Cols are Lipids like PGD2, PGE2) OR Col 1 is "Sample_Name"
    # Signature: Global Lipidomics (Cols are Samples like Vehicle-..., Col 1 is Lipid name like "CE(...)")
        
    # Heuristic 1: Check Col 1 Name
        col1 <- cols[1]
        
    # Heuristic 2: Check standard Mediator names in columns
        mediator_candidates <- c("PGD2", "PGE2", "LXA4", "RvD1", "Maresin", "TXB2")
        matches_mediator_cols <- sum(mediator_candidates %in% cols) > 0
        
    # Heuristic 3: Check Row Content (Global has Lipid Strings in Col 1)
        first_col_vals <- as.character(header[[1]])
        has_lipid_strings <- any(grepl("^(CE|PC|PE|SM|LPC)\\(", first_col_vals))
        
        if (matches_mediator_cols) {
            return("mediator")
        } else if (has_lipid_strings) {
            return("global")
        } else {
      # Fallback based on "Sample Name" vs "Sample_Name" if strict
            if (grepl("Sample_Name", col1)) return("mediator") # Usually usage in current Mediator files
            if (grepl("Sample Name", col1)) return("global")
            return("global") # Default
        }
    }

    observeEvent(input$files, {
      req(input$files)
      current_files <- rv$uploads
      for (i in 1:nrow(input$files)) {
        file_info <- input$files[i, ]
        if (!file_info$name %in% names(current_files)) {
      # CRITICAL FIX: Always store PATH, never DataFrame
            current_files[[file_info$name]] <- file_info$datapath 
        }
      }
      rv$uploads <- purrr::compact(current_files)
    })
    
    observe({
      req(names(rv$uploads))
      lapply(names(rv$uploads), function(filename) {
        safe_id <- make.names(filename)
        observeEvent(input[[paste0("remove_", safe_id)]], {
          current_uploads <- rv$uploads
          current_uploads[[filename]] <- NULL
          rv$uploads <- current_uploads
        })
      })
    })
    
    output$loaded_files_display <- renderUI({
      files <- names(rv$uploads)
      if (length(files) == 0) return(NULL)
      tags$div(
        class = "mt-2 p-2 border rounded",
        lapply(files, function(filename) {
          safe_id <- make.names(filename)
          tags$div(
            class = "d-flex justify-content-between align-items-center mb-1",
            tags$span(filename),
            actionButton(session$ns(paste0("remove_", safe_id)), icon("times"), 
                         class="btn-sm btn-link text-danger", 
                         style="text-decoration: none; padding: 0 0.3rem;")
          )
        })
      )
    })
    
    rawData <- reactive({
   # Autonomous Ingestion Logic
      cat(file=stderr(), "\n[DEBUG] --- rawData Reactive Triggered ---\n")
      
   # 1. Gather all file paths (Directory + Uploads)
   # Directory scan depends on mode preference, but content check is universal
      
      files_to_process <- list()
      
   # A. Directory Scan (Context-Aware)
   # Scan target directories based on the selected Analysis Mode.
   # 'Global Lipidomics' targets the 'data' directory.
   # 'Lipid Mediators' targets the 'Lipid mediators' directory (checking current and parent levels).
      
      if (input$analysisMode == "Global Lipidomics") {
          data_dir <- "data"
          if (dir.exists(data_dir)) {
             fs <- list.files(data_dir, pattern = "\\.csv$", full.names = TRUE)
             if(length(fs) > 0) files_to_process <- c(files_to_process, stats::setNames(as.list(fs), basename(fs)))
          }
      } else {
     # Mediator Scan logic (with parent check)
          mediator_dir <- "Lipid mediators"
          fs <- list.files(mediator_dir, pattern = "\\.xlsx$", full.names = TRUE)
          if(length(fs) == 0) {
              parent_dir <- "../Lipid mediators"
              if(dir.exists(parent_dir)) fs <- list.files(parent_dir, pattern = "\\.xlsx$", full.names = TRUE)
          }
          if(length(fs) > 0) files_to_process <- c(files_to_process, stats::setNames(as.list(fs), basename(fs)))
      }
      
   # B. Add Uploads (Override or Append)
      if (length(rv$uploads) > 0) {
          files_to_process <- c(files_to_process, rv$uploads)
      }
      
      files_to_process <- files_to_process[!duplicated(names(files_to_process))]
      
      validate(need(length(files_to_process) > 0, "No data files found. Please upload or ensure data directories exist."))
      
   # 2. Process Files
      parsed_data <- lapply(names(files_to_process), function(fname) {
          fp <- files_to_process[[fname]]
          cat(file=stderr(), "[DEBUG] Analyzing:", fname, "\n")
          
     # Detect Type
          ftype <- detect_file_type(fp)
          cat(file=stderr(), "[DEBUG]   Detected Type:", ftype, "\n")
          
          if (ftype == "global") {
       # GLOBAL PARSER
       # Use custom loading to handle CSV or Excel if needed, but 'load_one_file' handles read_excel/csv? 
       # load_one_file in utils_data.R uses read_excel.
       # If .csv, required logic. assume .xlsx for now based on user files, but 'data' dir scan was .csv
              
              if (grepl("\\.csv$", fp)) {
                   df <- read.csv(fp, check.names=FALSE)
                   if(!"Lipid_Name" %in% names(df)) names(df)[1] <- "Lipid_Name" # Assumption
                   return(df)
              } else {
                   return(load_one_file(fp, fname))
              }
              
          } else if (ftype == "mediator") {
       # MEDIATOR PARSER (Transpose Logic)
               allSheets <- tryCatch(readxl::excel_sheets(fp), error = function(e) character(0))
               if(length(allSheets) == 0) return(NULL)
               
               sheet_dfs <- lapply(allSheets, function(sht) {
                   df_raw <- tryCatch(readxl::read_xlsx(fp, sheet = sht, col_names = TRUE, .name_repair = "unique"), error = function(e) NULL)
                   if (is.null(df_raw)) return(NULL)
                   
          # Standardize sample column
                   sample_col <- colnames(df_raw)[1]
                   df_raw <- df_raw %>% dplyr::filter(!is.na(.[[1]]))
                   df_raw[[sample_col]] <- make.unique(as.character(df_raw[[sample_col]]))
                   
          # Numeric Conversion
                   for (j in 2:ncol(df_raw)) if (!is.numeric(df_raw[[j]])) suppressWarnings(df_raw[[j]] <- as.numeric(as.character(df_raw[[j]])))
                   
                   mat <- as.matrix(df_raw[,-1, drop=FALSE])
                   rownames(mat) <- df_raw[[sample_col]]
                   
          # Transpose
                   t_df <- as.data.frame(t(mat), stringsAsFactors = FALSE) %>%
                       tibble::rownames_to_column("Lipid_Name")
                   
                   t_df
               })
               sheet_dfs <- sheet_dfs[!sapply(sheet_dfs, is.null)]
               if(length(sheet_dfs) == 0) return(NULL)
               purrr::reduce(sheet_dfs, function(x, y) full_join(x, y, by = "Lipid_Name"))
               
          } else {
              cat(file=stderr(), "[DEBUG]   Unknown file type. Skipping.\n")
              return(NULL)
          }
      })
      
      parsed_data <- parsed_data[!sapply(parsed_data, is.null)]
      validate(need(length(parsed_data) > 0, "Failed to parse any valid data files."))
      
   # 3. Merge
   # Find common lipids to avoid massive NA blocks if disparate
   # OR just full join
      
      merged_df <- purrr::reduce(parsed_data, function(x, y) full_join(x, y, by = "Lipid_Name"))
      
   # 4. Final Cleanup
      merged_df <- merged_df %>% dplyr::mutate(across(-all_of("Lipid_Name"), as.numeric))
      file_cols <- list(setdiff(names(merged_df), "Lipid_Name")) # Simplified col tracking
      
      list(data = merged_df, file_cols = file_cols)
    })
    all_numeric_columns <- reactive({
      df_info <- rawData(); req(df_info$data)
      df_info$data %>% dplyr::select(where(is.numeric)) %>% names()
    })
    output$columnSelectorUI <- renderUI({
      cols <- all_numeric_columns(); req(cols)
      checkboxGroupInput(session$ns("selectedColumns"), "Select samples:", choices = cols, selected = cols)
    })
    observeEvent(input$selectAll, { updateCheckboxGroupInput(session, "selectedColumns", selected = all_numeric_columns()) })
    observeEvent(input$unselectAll, { updateCheckboxGroupInput(session, "selectedColumns", selected = character(0)) })
  # Helper to retrieve settings safely
    get_setting <- function(name, default = NULL) {
      settings <- external_settings()
      if (is.null(settings) || is.null(settings[[name]])) return(default)
      settings[[name]]
    }

    data_processed <- eventReactive(input$runAnalysis, {
      df_info <- rawData(); req(df_info)
      useCols <- input$selectedColumns
      if(is.null(useCols) || length(useCols) == 0) {
    # Fallback: if input is NULL (UI not ready) or empty, try to default to all numeric columns
    # This handles the "clicked too fast" scenario
        cols_all <- names(df_info$data)[sapply(df_info$data, is.numeric)]
        cols_all <- setdiff(cols_all, "Lipid_Name")
        if(length(cols_all) > 0) useCols <- cols_all
      }
      validate(need(length(useCols) > 0, "Please select at least one sample."))
      data_subset <- df_info$data %>% dplyr::select(Lipid_Name, all_of(useCols))
        
    # External Setting: imputeZerosPerFile (default TRUE)
        if (isTRUE(get_setting("imputeZerosPerFile", TRUE))) {
          for (cols_in_file in df_info$file_cols) {
            data_subset <- impute_zeros_per_file(data_subset, cols_in_file)
          }
        }
      mat_subset <- data_subset %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      
   # --- LEGACY PIPELINE ALIGNMENT (v9.6) ---
   # 1. Log Transform Scaffolding
   # intentionally produce NAs for 0s here to allow QRILC to see them as missing (Legacy Parity)
      mat_for_log <- mat_subset
      mat_for_log[mat_for_log <= 0] <- NA 
      mat_log <- log2(mat_for_log)
      
   # 2. Imputation (QRILC)
   # Performed on Log Scale (as per Legacy)
      if (isTRUE(get_setting("useImputation", TRUE))) {
        if (sum(is.na(mat_log)) > 0) {
     # Capture output to avoid console spam using tryCatch for robustness
          mat_log_imputed <- tryCatch({
             set.seed(42)
             invisible(capture.output(res <- imputeLCMD::impute.QRILC(mat_log)[[1]]))
             res
          }, error = function(e) {
             warning("Imputation failed: ", e$message)
             mat_log # Fallback
          })
        } else { 
            mat_log_imputed <- mat_log 
        }
      } else { 
          mat_log_imputed <- mat_log 
      }
      
   # 3. Normalization
   # PQN expects Linear scale. Median expects Log scale.
      norm_method <- get_setting("normalizationMethod", "median")
      
      mat_final_log <- if (norm_method == "pqn") {
     # PQN Sandwich: Log -> Exp -> PQN -> Log
         mat_linear_imputed <- 2^mat_log_imputed
         mat_norm_linear <- normalize_pqn_linear(mat_linear_imputed)
         log2(mat_norm_linear)
      } else if (norm_method == "median") {
     # Median on Log
         normalize_median_log(mat_log_imputed)
      } else {
     # None
         mat_log_imputed
      }
      
   # 4. Final Cleanup & Linear Return
   # Ensure no infinite values
      mat_final_log[!is.finite(mat_final_log)] <- NA
      
   # Return LINEAR data for downstream compatibility
      mat_final_linear <- 2^mat_final_log
      
      data_processed_final <- as.data.frame(mat_final_linear) %>% tibble::rownames_to_column("Lipid_Name")
      
   # =========================================================================
   # --- INJECTION START: SYNTHETIC PRESERVATION PROTOCOL ---
   # =========================================================================
      if (isTRUE(input$useAveragedSubstitution)) {
     # 1. Scope boundaries: determine what was dropped from the master list
     # df_info$data contains all columns from the raw input
          all_cols <- names(df_info$data)[sapply(df_info$data, is.numeric)]
          all_cols <- setdiff(all_cols, "Lipid_Name")
          
     # useCols are the ones currently selected and processed
          unchecked_cols <- setdiff(all_cols, useCols)
          
          if (length(unchecked_cols) > 0) {
       # 2. Extract global peer metadata safely (Mode-agnostic)
       # Note: allParsedMetadata uses 'useCols' by default, so Required to parse ALL columns here
       # or responsibly re-parse for the unchecked ones? 
       # Better: Re-parse everything to get full groups.
              
              cols_to_parse <- c(useCols, unchecked_cols)
              
              full_meta <- if (input$analysisMode == "Global Lipidomics") {
                  bind_rows(lapply(cols_to_parse, parse_col_info_v2))
              } else {
                  bind_rows(lapply(cols_to_parse, parse_col_info_mediator))
              }
              
       # 3. Determine semantic peer groups natively
              full_meta$Group <- if("Condition" %in% names(full_meta) && "Population" %in% names(full_meta)) {
                  paste(full_meta$Condition, full_meta$Population, sep="_")
              } else if ("Condition" %in% names(full_meta)) {
                  full_meta$Condition
              } else { "All" }
              
              group_defs <- full_meta %>% dplyr::group_by(Group) %>% dplyr::summarize(groupCols = list(FullName), .groups="drop")
              
       # 4. Execute Triangulation and Substitution
              for (i in seq_len(nrow(group_defs))) {
                  theseCols <- group_defs$groupCols[[i]]
                  c_checked <- intersect(theseCols, useCols)          # Biological peers that survived filtering
                  c_unchecked <- intersect(theseCols, unchecked_cols) # Missing samples to synthesize
                  
         # Requires at least one valid peer to act as a mathematical anchor
                  if (length(c_checked) >= 1 && length(c_unchecked) > 0) {
           # Calculate Mean Intensity Vector across checked peers
                      if (length(c_checked) == 1) {
                          subVals <- data_processed_final[[c_checked]]
                      } else {
                          subVals <- rowMeans(data_processed_final[, c_checked, drop=FALSE], na.rm=TRUE)
                      }
                      
           # Substitute the void with the Calculated Mean Vector
                      for (uc in c_unchecked) {
                          data_processed_final[[uc]] <- subVals
                      }
                  }
              }
              
       # 5. Topological Realignment: Force original experimental matrix dimensions
       # want the columns to be in the original order if possible, or at least grouped?
       # Let's try to verify if 'all_cols' preserves original order from 'df_info$data'.
       # Yes, 'names(df_info$data)' should be original order.
              
              final_cols_ordered <- c("Lipid_Name", intersect(all_cols, names(data_processed_final)))
              data_processed_final <- data_processed_final %>% dplyr::select(dplyr::all_of(final_cols_ordered))
          }
      }
   # =========================================================================
   # --- INJECTION END ---
   # =========================================================================
      
   # External Setting: imputeRemainingNAtoZero (default TRUE)
      if (isTRUE(get_setting("imputeRemainingNAtoZero", TRUE))) {
        na_count <- sum(is.na(data_processed_final))
        if (na_count > 0) {
          data_processed_final <- data_processed_final %>% dplyr::mutate(across(where(is.numeric), ~replace_na(., 0)))
        }
      }
      validate(need(sum(is.na(data_processed_final)) == 0, "Processing resulted in unhandled NA values."))
      return(data_processed_final)
    })
    allParsedMetadata <- reactive({
      cols <- all_numeric_columns(); req(cols)
      if (input$analysisMode == "Global Lipidomics") {
          bind_rows(lapply(cols, parse_col_info_v2))
      } else {
          bind_rows(lapply(cols, parse_col_info_mediator))
      }
    })
    baseLipidAnnotation <- reactive({
      req(rawData()$data$Lipid_Name)
      if (input$analysisMode == "Global Lipidomics") {
          bind_rows(lapply(rawData()$data$Lipid_Name, parse_lipid_name_v2))
      } else {
          bind_rows(lapply(rawData()$data$Lipid_Name, parse_lipid_name_mediator))
      }
    })
    
    annotationData <- reactive({
      req(baseLipidAnnotation())
      base_anno <- baseLipidAnnotation()
      


      active_mods <- input$activeModifications %||% character(0)
      
      base_anno %>% dplyr::mutate(
        subclass = case_when(
          modification == "plasmalogen" & !("plasmalogen" %in% active_mods) & subclass == "GP_PE_P" ~ "GP_PE",
          modification == "ether" & !("ether" %in% active_mods) & subclass == "GP_PE_E" ~ "GP_PE",
          modification == "dihydro" & !("dihydro" %in% active_mods) & subclass == "SP_Cer_dh" ~ "SP_Cer",
          modification == "dihydro" & !("dihydro" %in% active_mods) & subclass == "SP_SM_dh" ~ "SP_SM",
          TRUE ~ subclass
        ),
    # Re-derive hyperclass just in case
        hyperclass = case_when(
           subclass %in% c("GP_PE") ~ "GP",
           TRUE ~ hyperclass
        )
      )
    })
    
  # --- GLOBAL FILTER LOGIC ---
    
  # 1. Class Filters
    output$hyperclassSelectorUI <- renderUI({
      anno <- annotationData(); req(anno)
      choices <- sort(unique(anno$hyperclass))
      tagList(
        div(style="margin-bottom: 5px;",
            actionLink(session$ns("btn_all_hyper"), "All", style="text-decoration: underline; font-weight: normal; margin-right: 10px; cursor: pointer; color: #007bff;"),
            actionLink(session$ns("btn_none_hyper"), "None", style="text-decoration: underline; font-weight: normal; cursor: pointer; color: #007bff;")
        ),
        checkboxGroupInput(session$ns("hyperclassSelector"), 
                           label = if(isTRUE(input$analysisMode == "Lipid Mediators")) "Biosynthetic Origin:" else "Hyperclass:", 
                           choices = choices, selected = choices, inline = TRUE)
      )
    })
    outputOptions(output, "hyperclassSelectorUI", suspendWhenHidden = FALSE)
    
    observeEvent(input$btn_all_hyper, {
      anno <- annotationData(); req(anno)
      choices <- sort(unique(anno$hyperclass))
      updateCheckboxGroupInput(session, "hyperclassSelector", selected = choices)
    })
    observeEvent(input$btn_none_hyper, {
      updateCheckboxGroupInput(session, "hyperclassSelector", selected = character(0))
    })
    
    output$subclassSelectorUI <- renderUI({
      anno <- annotationData(); req(anno)
      req(input$hyperclassSelector)
      filtered_anno <- anno %>% dplyr::filter(hyperclass %in% input$hyperclassSelector)
      choices <- sort(unique(filtered_anno$subclass))
      
   # Persistence Logic:
   # Filter selection is executed via strict intersection with available choices.
   # This ensures that selecting a consolidated class (e.g., "GP_PE") does not inadvertently
   # auto-select split derivatives (e.g., "GP_PE_P") unless explicitly present in the choice set.
      current_selection <- isolate(input$subclassSelector)
      selected <- if(is.null(current_selection)) choices else intersect(current_selection, choices)
      
      
      tagList(
        div(style="margin-bottom: 5px;",
            actionButton(session$ns("btn_all_sub"), "All", class = "btn btn-link btn-xs", style="padding: 0; text-decoration: underline; font-weight: normal; margin-right: 10px; border: none;"),
            actionButton(session$ns("btn_none_sub"), "None", class = "btn btn-link btn-xs", style="padding: 0; text-decoration: underline; font-weight: normal; border: none;")
        ),
        checkboxGroupInput(session$ns("subclassSelector"), "Subclass:", choices = choices, selected = selected, inline = TRUE)
      )
    })
    outputOptions(output, "subclassSelectorUI", suspendWhenHidden = FALSE)
    
    observeEvent(input$btn_all_sub, {
      anno <- annotationData(); req(anno, input$hyperclassSelector)
      filtered_anno <- anno %>% dplyr::filter(hyperclass %in% input$hyperclassSelector)
      choices <- as.character(sort(unique(filtered_anno$subclass)))
      updateCheckboxGroupInput(session, "subclassSelector", selected = choices)
    })
    observeEvent(input$btn_none_sub, {
      updateCheckboxGroupInput(session, "subclassSelector", selected = character(0))
    })
    
    output$modificationSelectorUI <- renderUI({
      anno <- annotationData(); req(anno)
      req(input$hyperclassSelector, input$subclassSelector)
      if(!"modification" %in% names(anno)) return(NULL)
      filtered_anno <- anno %>% dplyr::filter(hyperclass %in% input$hyperclassSelector, subclass %in% input$subclassSelector)
      choices <- sort(unique(filtered_anno$modification))
      tagList(
        div(style="margin-bottom: 5px;",
            actionLink(session$ns("btn_all_mod"), "All", style="text-decoration: underline; font-weight: normal; margin-right: 10px; cursor: pointer; color: #007bff;"),
            actionLink(session$ns("btn_none_mod"), "None", style="text-decoration: underline; font-weight: normal; cursor: pointer; color: #007bff;")
        ),
        checkboxGroupInput(session$ns("modificationSelector"), "Modification:", choices = choices, selected = choices, inline = TRUE)
      )
    })
    
    output$splitControlUI <- renderUI({
      anno <- baseLipidAnnotation(); req(anno)
   # Check presence
      has_plasmalogen <- any(anno$modification == "plasmalogen")
      has_ether <- any(anno$modification == "ether")
      has_dihydro <- any(anno$modification == "dihydro")
      
      choices <- list()
      selected <- list()
      
      if(has_plasmalogen) { choices[["Plasmalogen (P-)"]] <- "plasmalogen"; selected <- c(selected, "plasmalogen") }
      if(has_ether) { choices[["Ether (O-)"]] <- "ether"; selected <- c(selected, "ether") }
      if(has_dihydro) { choices[["Dihydro (d-)"]] <- "dihydro"; selected <- c(selected, "dihydro") }
      
      if(length(choices) == 0) return(NULL)
        
      checkboxGroupInput(session$ns("activeModifications"), "Split Subclasses:", 
                         choices = choices, selected = unlist(selected), inline = TRUE)
    })
    outputOptions(output, "modificationSelectorUI", suspendWhenHidden = FALSE)

    observeEvent(input$btn_all_mod, {
      anno <- annotationData(); req(anno, input$hyperclassSelector, input$subclassSelector)
      if(!"modification" %in% names(anno)) return(NULL)
      filtered_anno <- anno %>% dplyr::filter(hyperclass %in% input$hyperclassSelector, subclass %in% input$subclassSelector)
      choices <- sort(unique(filtered_anno$modification))
      updateCheckboxGroupInput(session, "modificationSelector", selected = choices)
    })
    observeEvent(input$btn_none_mod, {
      updateCheckboxGroupInput(session, "modificationSelector", selected = character(0))
    })
    
    lipids_to_show_by_class <- reactive({
      anno <- annotationData()
      req(anno, input$hyperclassSelector, input$subclassSelector)
      if("modification" %in% names(anno)) req(input$modificationSelector)
      
      res <- anno %>% dplyr::filter(hyperclass %in% input$hyperclassSelector, subclass %in% input$subclassSelector)
      if("modification" %in% names(anno)) {
         res <- res %>% dplyr::filter(modification %in% input$modificationSelector)
      }
   # Safety check prevents crashes during transient states where inputs are stale
      req(nrow(res) > 0)
      res %>% dplyr::pull(Lipid_Name)
    })
    
  # 2. Advanced Filters
    lipids_to_show_by_advanced_filters <- reactive({
      anno <- annotationData()
   # Saturation
      if (!is.null(input$selectedSaturationFeatures) && length(input$selectedSaturationFeatures) > 0) {
        req_cols <- paste0("Has_", input$selectedSaturationFeatures)
        if(all(req_cols %in% names(anno))) {
           sat_mat <- as.matrix(anno[, req_cols])
           anno <- anno[rowSums(sat_mat, na.rm=TRUE) > 0, ]
        }
      }
   # Length
      if (!is.null(input$selectedLengthFeatures) && length(input$selectedLengthFeatures) > 0) {
        req_cols <- paste0("Has_", input$selectedLengthFeatures)
        if(all(req_cols %in% names(anno))) {
           len_mat <- as.matrix(anno[, req_cols])
           anno <- anno[rowSums(len_mat, na.rm=TRUE) > 0, ]
        }
      }
      anno$Lipid_Name
    })
    
  # 3. Granular Filters
    get_chain_ranges <- reactive({
      anno <- annotationData(); req(anno)
      all_nC <- c(anno$nCchain1, anno$nCchain2); all_DB <- c(anno$DBchain1, anno$DBchain2)
      min_C <- min(all_nC, na.rm = TRUE); max_C <- max(all_nC, na.rm = TRUE)
      min_DB <- min(all_DB, na.rm = TRUE); max_DB <- max(all_DB, na.rm = TRUE)
      if(!is.finite(min_C) || !is.finite(max_C)) return(NULL)
      list(min_C=min_C, max_C=max_C, min_DB=min_DB, max_DB=max_DB)
    })
    output$combo1SlidersUI <- renderUI({
      ranges <- get_chain_ranges(); req(ranges)
      tagList(
        sliderInput(session$ns("granular_nC1_range"), "Chain Length Range:", min=ranges$min_C, max=ranges$max_C, value=c(ranges$min_C, ranges$max_C)),
        sliderInput(session$ns("granular_DB1_range"), "Double Bond Range:", min=ranges$min_DB, max=ranges$max_DB, value=c(ranges$min_DB, ranges$max_DB), step=1)
      )
    })
    outputOptions(output, "combo1SlidersUI", suspendWhenHidden = FALSE)
    output$combo2SlidersUI <- renderUI({
      ranges <- get_chain_ranges(); req(ranges)
      tagList(
        sliderInput(session$ns("granular_nC2_range"), "Chain Length Range:", min=ranges$min_C, max=ranges$max_C, value=c(ranges$min_C, ranges$max_C)),
        sliderInput(session$ns("granular_DB2_range"), "Double Bond Range:", min=ranges$min_DB, max=ranges$max_DB, value=c(ranges$min_DB, ranges$max_DB), step=1)
      )
    })
    outputOptions(output, "combo2SlidersUI", suspendWhenHidden = FALSE)
    lipids_to_show_by_granular_filter <- reactive({
      anno_data <- annotationData()
      if (!isTRUE(input$activateGranularFiltering) || (!isTRUE(input$useCombo1) && !isTRUE(input$useCombo2))) {
        return(anno_data$Lipid_Name)
      }
      req(input$granularOrderMode)
      cond1A <- cond1B <- cond2A <- cond2B <- rep(FALSE, nrow(anno_data))
      
      if (isTRUE(input$useCombo1)) {
        req(input$granular_nC1_range, input$granular_DB1_range)
        cond1A <- tidyr::replace_na(dplyr::between(anno_data$nCchain1, input$granular_nC1_range[1], input$granular_nC1_range[2]) &
                                      dplyr::between(anno_data$DBchain1, input$granular_DB1_range[1], input$granular_DB1_range[2]), FALSE)
        cond1B <- tidyr::replace_na(dplyr::between(anno_data$nCchain2, input$granular_nC1_range[1], input$granular_nC1_range[2]) &
                                      dplyr::between(anno_data$DBchain2, input$granular_DB1_range[1], input$granular_DB1_range[2]), FALSE)
      }
      if (isTRUE(input$useCombo2)) {
        req(input$granular_nC2_range, input$granular_DB2_range)
        cond2A <- tidyr::replace_na(dplyr::between(anno_data$nCchain1, input$granular_nC2_range[1], input$granular_nC2_range[2]) &
                                      dplyr::between(anno_data$DBchain1, input$granular_DB2_range[1], input$granular_DB2_range[2]), FALSE)
        cond2B <- tidyr::replace_na(dplyr::between(anno_data$nCchain2, input$granular_nC2_range[1], input$granular_nC2_range[2]) &
                                      dplyr::between(anno_data$DBchain2, input$granular_DB2_range[1], input$granular_DB2_range[2]), FALSE)
      }
      passing_indices <- if (isTRUE(input$useCombo1) && isTRUE(input$useCombo2)) {
         if (input$granularOrderMode == "respect") cond1A & cond2B else (cond1A & cond2B) | (cond2A & cond1B)
      } else if (isTRUE(input$useCombo1)) {
         if (input$granularOrderMode == "respect") cond1A else cond1A | cond1B
      } else if (isTRUE(input$useCombo2)) {
         if (input$granularOrderMode == "respect") cond2B else cond2A | cond2B
      } else { rep(TRUE, nrow(anno_data)) }
      
      anno_data$Lipid_Name[passing_indices]
    })
    
  # 4. Substrate Filters
    lipids_to_show_by_substrate_filter <- reactive({
      anno_data <- annotationData()
      selected_substrates <- c(input$n6_substrates, input$n3_substrates)
      if (length(selected_substrates) == 0) return(anno_data$Lipid_Name)
      
      anno_data <- anno_data %>%
        dplyr::mutate(chain1_str = dplyr::if_else(!is.na(nCchain1), paste(nCchain1, DBchain1, sep = ":"), NA_character_),
                      chain2_str = dplyr::if_else(!is.na(nCchain2), paste(nCchain2, DBchain2, sep = ":"), NA_character_))
      
      positions <- input$substrate_match_positions
      if ("any" %in% positions || length(positions) == 0) {
        anno_data <- anno_data %>% dplyr::filter(chain1_str %in% selected_substrates | chain2_str %in% selected_substrates)
      } else if ("sn1" %in% positions) {
        anno_data <- anno_data %>% dplyr::filter(chain1_str %in% selected_substrates)
      } else if ("sn2" %in% positions) {
        anno_data <- anno_data %>% dplyr::filter(chain2_str %in% selected_substrates)
      }
      anno_data$Lipid_Name
    })
    
  # --- 6. Global Class Colors ---
    output$classColorUI <- renderUI({
      anno <- annotationData(); req(anno)
   # Use the centralized map as the source of truth
   # This ensures the UI always reflects the current system state (including defaults)
      current_map <- global_class_color_map()
      classes <- sort(names(current_map))
      
   # Grid layout for color pickers
      tagList(
        lapply(classes, function(cls) {
      # Sanitize ID: Remove spaces and non-alphanumeric chars to match server logic
           safe_cls <- gsub("[^A-Za-z0-9]", "_", cls)
           
      # Use color from map, default to grey if missing (safety fallback)
           def_col <- if(!is.null(current_map[[cls]])) current_map[[cls]] else "#B0B0B0"
           
           div(style="display: inline-block; width: 32%; padding-right: 5px; vertical-align: top;",
               colourpicker::colourInput(session$ns(paste0("globalClassCol_", safe_cls)), label=cls, value = def_col, showColour = "both")
           )
        })
      )
    })
    
  # --- 6. Hierarchical Color Logic ---
    
  # A. Lipid Class Map (Existing Logic Refined)
    map_lipid_class <- reactive({
       anno <- annotationData(); req(anno)
       classes <- sort(unique(anno$subclass))
       
    # Determine Base Defaults
       if (input$analysisMode == "Global Lipidomics") {
           current_map <- CLASS_MAP_COLORS
           unknown <- setdiff(classes, names(current_map))
           if (length(unknown) > 0) {
       # Safe Brewer Fallback
             fallback_colors <- safe_brewer_pal(length(unknown), "Dark2")
             names(fallback_colors) <- unknown
             current_map <- c(current_map, fallback_colors)
           }
       } else {
      # Mediator Mode -> Use logic from global.R
           current_map <- get_mediator_color_map(classes)
       }

    # Override with Inputs (prefix: globalClassCol_)
       for(cls in classes) {
         safe_cls <- gsub("[^A-Za-z0-9]", "_", cls)
         inp_id <- paste0("globalClassCol_", safe_cls)
         if(!is.null(input[[inp_id]]) && input[[inp_id]] != "") {
           current_map[[cls]] <- input[[inp_id]]
         }
       }
       current_map
    })
    
  # B. Biosynthetic Origin Map
    map_bio_origin <- reactive({
       anno <- annotationData(); req(anno)
    # Use 'hyperclass' column for Origin in Mediator mode, or strict Hyperclass in Global mode
       origins <- sort(unique(anno$hyperclass))
       
    # Defaults
       current_map <- if(input$analysisMode == "Lipid Mediators") {
      # Mediator Origins (AA, EPA, DHA)
           if(exists("user_defined_biosynthetic_origin_colors")) user_defined_biosynthetic_origin_colors else HYPERCLASS_MAP_COLORS
       } else {
      # Global Hyperclasses (GP, SP, GL, etc.)
           HYPERCLASS_MAP_COLORS
       }
       
    # Ensure coverage
       unknown <- setdiff(origins, names(current_map))
       if(length(unknown) > 0) {
           fallback <- safe_brewer_pal(length(unknown), "Set1")
           names(fallback) <- unknown
           current_map <- c(current_map, fallback)
       }
       
    # Override with Inputs (prefix: globalOriginCol_)
    # Use Persistent Store (rv$origin_colors) to survive UI destruction
       for(org in names(rv$origin_colors)) {
          current_map[[org]] <- rv$origin_colors[[org]]
       }
       current_map
    })
    
  # Persistence Observer for Origins
    observe({
       anno <- annotationData()
       req(anno)
       origins <- unique(anno$hyperclass) 
       
       for(org in origins) {
         if(is.na(org)) next
         safe_org <- gsub("[^A-Za-z0-9]", "_", org)
         inp_id <- paste0("globalOriginCol_", safe_org)
         val <- input[[inp_id]]
         
         if(!is.null(val) && val != "") {
             rv$origin_colors[[org]] <- val
         }
       }
    })
    
  # C. Single Species Map (Lipid_Name)
    map_single_species <- reactive({
       anno <- annotationData(); req(anno)
       species <- sort(unique(anno$Lipid_Name))
       
    # Deterministic generation to keep it stable across re-renders
       n <- length(species)
    # Configured for non-Viridis. Using standard categorical "Hue" palette (ggplot2 default).
    # If n is large, hue_pal is standard.
       base_pal <- scales::hue_pal()(n)
       names(base_pal) <- species
       
       current_map <- base_pal
       
    # Override with Inputs (prefix: globalSpeciesCol_)
    # Use Persistent Store (rv$species_colors)
       for(sp in names(rv$species_colors)) {
          current_map[[sp]] <- rv$species_colors[[sp]]
       }
       current_map
    })

  # Persistence Observer for Species
    observe({
       anno <- annotationData()
       req(anno)
       species <- unique(anno$Lipid_Name)
       
       for(sp in species) {
          if(is.na(sp)) next
          safe_sp <- gsub("[^A-Za-z0-9]", "_", sp)
          inp_id <- paste0("globalSpeciesCol_", safe_sp)
          val <- input[[inp_id]]
          
          if(!is.null(val) && val != "") {
             rv$species_colors[[sp]] <- val
          }
       }
    })

  # --- UI Rendering for Panel 8 ---
    output$classColorUI <- renderUI({
      anno <- annotationData(); req(anno)
      mode <- input$colorEditMode # Current Dropdown Selection
      
   # Select Data and Input Prefix based on Mode
   # BREAK LOOP: Isolate the map read to prevent recursive re-rendering when inputs update.
   # The UI should initialize with current map, but input updates (which update the map via observer)
   # should NOT trigger a full UI re-render.
      if (is.null(mode) || mode == "Lipid Class") {
          current_map <- isolate(map_lipid_class())
          prefix <- "globalClassCol_"
          items <- sort(names(current_map))
      } else if (mode == "Biosynthetic Origin") {
          current_map <- isolate(map_bio_origin())
          prefix <- "globalOriginCol_"
          items <- sort(names(current_map))
      } else {
     # Single Species
          current_map <- isolate(map_single_species())
          prefix <- "globalSpeciesCol_"
          items <- sort(names(current_map))
      }
      
   # Grid layout 
      tagList(
        lapply(items, function(item) {
           safe_id <- gsub("[^A-Za-z0-9]", "_", item)
           val <- if(!is.null(current_map[[item]])) current_map[[item]] else "#B0B0B0"
           
           div(style="display: inline-block; width: 32%; padding-right: 5px; vertical-align: top;",
               colourpicker::colourInput(session$ns(paste0(prefix, safe_id)), label=item, value = val, showColour = "both")
           )
        })
      )
    })
    
  # Backward Compatibility Wrapper
    global_class_color_map <- map_lipid_class

  # 5. Differential Expression Logic
    getDEGroupChoices <- reactive({
      req(data_processed())
      meta <- allParsedMetadata() %>% dplyr::filter(FullName %in% colnames(data_processed()))
      if(isTRUE(input$deOrientCondition) && isTRUE(input$deOrientPopulation)) {
        unique(paste(meta$Condition, meta$Population, sep="_"))
      } else if (isTRUE(input$deOrientCondition)) {
        unique(meta$Condition)
      } else { "All" }
    })
    output$deReferenceGroupUI <- renderUI({ 
      choices <- getDEGroupChoices()
   # Persistence: Keep current selection if valid
      current_sel <- isolate(input$deReferenceGroups)
      selected <- intersect(current_sel, choices)
      selectInput(session$ns("deReferenceGroups"), "Reference:", choices = choices, selected = selected, multiple = TRUE) 
    })
    output$deComparisonGroupUI <- renderUI({ 
      choices <- getDEGroupChoices()
   # Persistence: Keep current selection if valid
      current_sel <- isolate(input$deComparisonGroups)
      selected <- intersect(current_sel, choices)
      selectInput(session$ns("deComparisonGroups"), "Comparison:", choices = choices, selected = selected, multiple = TRUE) 
    })
    
    output$deInteractionGroupUI <- renderUI({
      choices <- getDEGroupChoices()
      
   # Persistence helper
      get_persisted <- function(id) {
         curr <- isolate(input[[id]])
         if(is.null(curr) || curr == "") return(NULL)
         if(curr %in% choices) return(curr) else return(NULL)
      }
      
      tagList(
        p(class="text-muted small", "Formula: (Comp_T2 - Comp_T1) - (Ref_T2 - Ref_T1)"),
        div(style="display: flex; gap: 5px;",
            div(style="flex: 1;", selectInput(session$ns("int_comp_t2"), "Comp T2:", choices = choices, selected = get_persisted("int_comp_t2"))),
            div(style="flex: 1;", selectInput(session$ns("int_comp_t1"), "Comp T1:", choices = choices, selected = get_persisted("int_comp_t1")))
        ),
        div(style="display: flex; gap: 5px;",
            div(style="flex: 1;", selectInput(session$ns("int_ref_t2"), "Ref T2:", choices = choices, selected = get_persisted("int_ref_t2"))),
            div(style="flex: 1;", selectInput(session$ns("int_ref_t1"), "Ref T1:", choices = choices, selected = get_persisted("int_ref_t1")))
        )
      )
    })
    
    allLipidDEResults <- reactive({
      mat <- data_processed()
      if (is.null(mat) || ncol(mat) < 3) return(NULL) # Lipid_Name + 2 columns
      
      mat_num <- mat %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      meta <- allParsedMetadata() %>% dplyr::filter(FullName %in% colnames(mat_num))
      
   # Determine Grouping based on Selection
      meta$Dynamic_DE_Group <- if(isTRUE(input$deOrientCondition) && isTRUE(input$deOrientPopulation)) {
        paste(meta$Condition, meta$Population, sep="_")
      } else if (isTRUE(input$deOrientCondition)) {
        meta$Condition
      } else { "All" }
      
   # Check if groups are valid
      if (input$deComparisonMode == "direct") {
        if (is.null(input$deReferenceGroups) || length(input$deReferenceGroups) == 0 ||
            is.null(input$deComparisonGroups) || length(input$deComparisonGroups) == 0) {
          return(NULL)
        }
      } else {
        req(input$int_ref_t1, input$int_ref_t2, input$int_comp_t1, input$int_comp_t2)
        if (any(c(input$int_ref_t1, input$int_ref_t2, input$int_comp_t1, input$int_comp_t2) == "")) return(NULL)
      }
      
   # Construct Contrast String
      contrast_str <- if (input$deComparisonMode == "direct") {
        construct_contrast_string(input$deReferenceGroups, input$deComparisonGroups)
      } else {
    # Interaction Contrast: (Comp_T2 - Comp_T1) - (Ref_T2 - Ref_T1)
    # Required to make sure these names are valid R variables for makeContrasts
        g_ref1 <- make.names(input$int_ref_t1); g_ref2 <- make.names(input$int_ref_t2)
        g_comp1 <- make.names(input$int_comp_t1); g_comp2 <- make.names(input$int_comp_t2)
        
    # Verify groups exist in design
    # The design matrix will have names like make.names(levels(Dynamic_DE_Group))
    # perform_limma_analysis helper handles design creation, but construct contrast string here.
    # Ideally, must unify this, but perform_limma_analysis takes a string.
    # Let's hope perform_limma_analysis handles make.names internaly or consistently.
    # In this app, perform_limma_analysis is defined in server.R likely.
        
        paste0("(", g_comp2, "-", g_comp1, ")-(", g_ref2, "-", g_ref1, ")")
      }
      
   # --- LEGACY ALIGNMENT (v9.6) ---
   # Ensure using strict log2(x) for DE to match Legacy, not log2(x+1)
      mat_log <- log2(mat_num)
      mat_log[!is.finite(mat_log)] <- NA
      
      limma_out <- perform_limma_analysis(mat_log, meta, "Dynamic_DE_Group", contrast_str)
      if (is.null(limma_out)) return(NULL)
      limma_out$results
    })
    
    significantLipids <- reactive({
      res <- allLipidDEResults()
      if(is.null(res)) return(NULL)
      p_col <- if(input$pValueType == "adjusted") "p_adj_bh" else "p_raw"
      res %>% 
        dplyr::filter(.data[[p_col]] <= input$pFilterThreshold, abs(log2FC) >= input$log2fcThreshold) %>%
        dplyr::pull(Lipid_Name)
    })
    
  # --- GLOBAL FILTERED LIPIDS ---
    global_filtered_lipids <- reactive({
      l1 <- lipids_to_show_by_class()
      l2 <- lipids_to_show_by_advanced_filters()
      l3 <- lipids_to_show_by_granular_filter()
      l4 <- lipids_to_show_by_substrate_filter()
      
      print(paste("DEBUG: Class Filters:", length(l1)))
      print(paste("DEBUG: Adv Filters:", length(l2)))
      print(paste("DEBUG: Granular Filters:", length(l3)))
      print(paste("DEBUG: Substrate Filters:", length(l4)))
      
      base_set <- Reduce(intersect, list(l1, l2, l3, l4))
      print(paste("DEBUG: Global Filtered Set length:", length(base_set)))
      
      base_set
    })

    pca_results <- reactive({
      df <- data_processed(); req(df)
      
   # Apply Global Filters to PCA Data
      filtered_lipids <- global_filtered_lipids()
      if(!is.null(filtered_lipids)) {
        df <- df %>% dplyr::filter(Lipid_Name %in% filtered_lipids)
      }

      useCols <- setdiff(names(df), "Lipid_Name")
      validate(need(nrow(df) > 1 && length(useCols) >= 2, "Not enough data for PCA."))
      
   # External Setting: pcaMode (default 'omics')
      pca_mode <- get_setting("pcaMode", "omics")
      
      if (pca_mode == "omics") {
        showNotification("Running PCA on Individual Lipids...", type = "message")
        mat_pca <- df %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
        mat_pca_t <- t(mat_pca)
        near_zero_var <- which(apply(mat_pca_t, 2, var, na.rm = TRUE) < 1e-10)
        if (length(near_zero_var) > 0) {
          showNotification(paste("Removing", length(near_zero_var), "lipids with zero variance."), type = "warning")
          mat_pca_t <- mat_pca_t[, -near_zero_var, drop = FALSE]
        }
        validate(need(ncol(mat_pca_t) > 1, "Not enough variable lipids for PCA."))
        pca_res <- prcomp(mat_pca_t, scale. = TRUE)
        
    # External Setting: maxPCs (default 3)
        max_pcs <- get_setting("maxPCs", 3)
        ncomp <- min(max_pcs, ncol(pca_res$x))
        
        pca_scores_df <- as.data.frame(pca_res$x) %>%
          dplyr::select(all_of(paste0("PC", 1:ncomp))) %>%
          tibble::rownames_to_column("FullName") %>%
          dplyr::left_join(allParsedMetadata(), by = "FullName")
          
    # External Setting: mergeReplicates (default TRUE)
        if (isTRUE(get_setting("mergeReplicates", TRUE))) {
          merged_meta <- allParsedMetadata() %>%
            dplyr::mutate(NewGroupName = gsub("_NA$", "", paste(Condition, Population, sep = "_"))) %>%
            dplyr::distinct(NewGroupName, .keep_all = TRUE) %>%
            dplyr::select(-FullName, -Replicate)
          pca_scores_df <- pca_scores_df %>%
            dplyr::mutate(NewGroupName = gsub("_NA$", "", paste(Condition, Population, sep = "_"))) %>%
            dplyr::group_by(NewGroupName) %>%
            dplyr::summarise(across(starts_with("PC"), mean), .groups = "drop") %>%
            dplyr::left_join(merged_meta, by = "NewGroupName") %>%
            dplyr::mutate(FullName = NewGroupName)
        }
        pca_loadings_df <- as.data.frame(pca_res$rotation) %>%
          dplyr::select(all_of(paste0("PC", 1:ncomp))) %>%
          tibble::rownames_to_column("Lipid_Name") %>%
          dplyr::left_join(annotationData() %>% dplyr::select(Lipid_Name, subclass), by = "Lipid_Name") %>%
          dplyr::rename(Class = subclass)
        var_explained <- round(summary(pca_res)$importance[2, 1:ncomp] * 100, 1)
        list(score_df = pca_scores_df, load_df = pca_loadings_df, var_PC = var_explained)
        
      } else { # CLASS mode
        showNotification("Running PCA on Aggregated Classes...", type = "message")
        anno <- annotationData() %>% dplyr::filter(Lipid_Name %in% df$Lipid_Name)
        df_class <- df %>%
          dplyr::left_join(anno %>% dplyr::select(Lipid_Name, subclass), by = "Lipid_Name")
          
    # External Setting: dropMisc (default TRUE)
        if(isTRUE(get_setting("dropMisc", TRUE))){ df_class <- df_class[df_class$subclass != "Misc", ] }
        colMetadata <- allParsedMetadata() %>% dplyr::filter(FullName %in% useCols)
        
    # External Setting: mergeReplicates (default TRUE)
        if(isTRUE(get_setting("mergeReplicates", TRUE))){
          colMetadata$NewGroupName <- gsub(pattern = "_NA$", replacement = "", x = paste(colMetadata$Condition, colMetadata$Population, sep="_"))
        } else {
          colMetadata$NewGroupName <- colMetadata$FullName
        }
        longDF <- df_class %>%
          tidyr::pivot_longer(all_of(useCols), names_to = "FullName", values_to = "Value") %>%
          dplyr::left_join(colMetadata %>% dplyr::select(FullName, NewGroupName), by = "FullName")
        classAggDF <- longDF %>%
          dplyr::group_by(subclass, NewGroupName) %>%
          dplyr::summarize(Value = sum(Value, na.rm=T), .groups="drop")
        mat_wide <- classAggDF %>%
          tidyr::pivot_wider(names_from = subclass, values_from = Value, values_fill = 0)
        mat_pca <- as.matrix(mat_wide[, -1])
        rownames(mat_pca) <- mat_wide$NewGroupName
        mat_pca_filt <- mat_pca[, apply(mat_pca, 2, sd, na.rm = TRUE) > 1e-12, drop = FALSE]
        
    # External Setting: maxPCs (default 3)
        max_pcs <- get_setting("maxPCs", 3)
        validate(need(ncol(mat_pca_filt) >= max_pcs, "Not enough variable features for the PCs requested."))
        ncomp <- min(max_pcs, nrow(mat_pca_filt) - 1, ncol(mat_pca_filt))
        pca_res <- nipals::nipals(mat_pca_filt, ncomp = ncomp, gramschmidt = TRUE)
        score_df <- as.data.frame(pca_res$scores) %>%
          `colnames<-`(paste0("PC", 1:ncomp)) %>%
          tibble::rownames_to_column("FullName") %>%
          dplyr::left_join(
            colMetadata %>% 
              dplyr::distinct(NewGroupName, .keep_all = TRUE) %>% 
              dplyr::select(-FullName) %>% 
              dplyr::rename(FullName = NewGroupName),
            by = "FullName"
          )
        load_df <- as.data.frame(pca_res$loadings) %>%
          `colnames<-`(paste0("PC", 1:ncomp)) %>%
          tibble::rownames_to_column(var = "Class")
        list(score_df = score_df, load_df = load_df, var_PC = round(pca_res$R2 * 100, 1))
      }
    })
    masterColorMaps <- reactive({
      meta <- allParsedMetadata(); req(meta)
      unique_conditions <- sort(unique(meta$Condition)) %>% na.omit()
      cond_colors <- initialize_color_map(unique_conditions, "Set1")
      
      unique_populations <- sort(unique(meta$Population)) %>% na.omit()
      pop_colors <- initialize_color_map(unique_populations, "Dark2")
      
   # Combined
      meta_groups <- meta %>% dplyr::mutate(Group = gsub("_NA$", "", paste(Condition, Population, sep = "_")))
      unique_groups <- sort(unique(meta_groups$Group)) %>% na.omit()
      group_colors <- initialize_color_map(unique_groups, "Set2") 
      
   # Apply Custom Overrides from QC Module
      if (isTRUE(get_setting("useCustomColors", FALSE))) {
         custom_map <- get_setting("custom_colors", list())
         
     # Override Condition Colors
         for (cond in names(cond_colors)) {
            safe_key <- gsub(" ", "_", cond) # QC module likely uses underscore for Safe ID?
      # Actually QC module uses: gsub("\\s|&", "_", g)
      # Let's check keys in custom_map.
      # If standard keys match, use them.
            if (!is.null(custom_map[[cond]])) { 
               cond_colors[[cond]] <- custom_map[[cond]] 
            } else {
        # Try safe key
               safe <- gsub("[^A-Za-z0-9_]", "_", cond)
               if (!is.null(custom_map[[safe]])) cond_colors[[cond]] <- custom_map[[safe]]
            }
         }
         
     # Override Population Colors
         for (pop in names(pop_colors)) {
            if (!is.null(custom_map[[pop]])) { pop_colors[[pop]] <- custom_map[[pop]] }
         }
         
     # Override Group Colors
         for (grp in names(group_colors)) {
             if (!is.null(custom_map[[grp]])) { group_colors[[grp]] <- custom_map[[grp]] }
         }
      }
      
      list(Condition = cond_colors, Population = pop_colors, "Condition & Population" = group_colors)
    })
    masterShapeMaps <- reactive({
      meta <- allParsedMetadata(); req(meta)
      list(Condition = make_shape_map(meta$Condition, SHAPE_CHOICES), Population = make_shape_map(meta$Population, SHAPE_CHOICES))
    })
    activeColorMap <- reactive({ 
      req(masterColorMaps())
      group <- get_setting("colorGrouping", "Condition")
      masterColorMaps()[[group]] 
    })
    activeShapeMap <- reactive({ 
      req(masterShapeMaps())
      group <- get_setting("shapeGrouping", "Population")
      masterShapeMaps()[[group]] 
    })
    output$customColorUI <- renderUI({
      req(isTRUE(get_setting("useCustomColors", FALSE)), activeColorMap())
   # Note: This controls custom colors on the server side if were to render them here
   # but they are rendered in QC module. Kept for legacy or fallback.
      NULL 
    })
    output$customShapeUI <- renderUI({
      req(isTRUE(get_setting("useShapes", FALSE)), activeShapeMap())
      NULL
    })
    default_class_colors <- reactive({
      req(pca_results())
      classes <- unique(pca_results()$load_df$Class) %>% na.omit()
      req(length(classes) > 0)
      finalColors <- CLASS_MAP_COLORS
      unknown <- setdiff(classes, names(finalColors))
      if (length(unknown) > 0) {
        fallback_colors <- colorRampPalette(brewer.pal(8, "Dark2"))(length(unknown))
        names(fallback_colors) <- unknown
        finalColors <- c(finalColors, fallback_colors)
      }
      finalColors[classes]
    })
    output$customColorClassUI <- renderUI({
      req(pca_results(), isTRUE(get_setting("useCustomColorsClasses", FALSE)))
      NULL
    })
    dynamic_class_colors <- reactive({
      defaults <- default_class_colors()
      if (!isTRUE(get_setting("useCustomColorsClasses", FALSE))) return(defaults)
      
   # For customization, used to read inputs. Now these inputs are in QC module.
   # The qc_boxplot_module sends back 'custom_class_colors' list in settings.
      custom_map <- get_setting("custom_class_colors", list())
      
      for (g in names(defaults)) {
        if (!is.null(custom_map[[g]])) { defaults[g] <- custom_map[[g]] }
      }
      defaults
    })
    observeEvent(get_setting("mergeReplicates", TRUE), {
   # This used to update a local input 'labelParts'. 
   # Since labelParts is now in QC module, this logic should move there or be handled by the user.
   # cannot update an input that doesn't exist here. 
   # Removing local update logic.
    }, ignoreNULL = TRUE, ignoreInit = TRUE)
    
    return(
      list(
        rawData = rawData, data_processed = data_processed, pca_results = pca_results,
        selected_cols = reactive({ input$selectedColumns }), all_metadata = allParsedMetadata,
        annotationData = annotationData,
        run_analysis_trigger = reactive({ input$runAnalysis }),
        aesthetics = reactive({
          list(
            color_group = get_setting("colorGrouping", "Condition"), 
            shape_group = get_setting("shapeGrouping", "Population"),
            use_shapes = get_setting("useShapes", FALSE), 
            label_parts = get_setting("labelParts", "Condition"),
            use_custom_colors = get_setting("useCustomColors", FALSE), 
            use_custom_class_colors = get_setting("useCustomColorsClasses", FALSE),
            add_frame_2d = get_setting("addFrame2D", FALSE), 
            score_marker_size_2d = get_setting("scoreMarkerSize2D", 8),
            score_text_size_2d = get_setting("scoreTextSize2D", 4), 
            score_marker_size_3d = get_setting("scoreMarkerSize3D", 8),
            load_marker_size_2d = get_setting("loadMarkerSize2D", 8), 
            load_text_size_2d = get_setting("loadTextSize2D", 4),
            load_marker_size_3d = get_setting("loadMarkerSize3D", 14), 
            show_labels_3d = get_setting("showLabels3D", TRUE),
            smart_label_pca_2d = get_setting("smartLabelPCA2D", TRUE), 
            repel_force_pca_2d = get_setting("repelForcePCA2D", 30),
            repel_box_pad_pca_2d = get_setting("repelBoxPadPCA2D", 0.35), 
            repel_point_pad_pca_2d = get_setting("repelPointPadPCA2D", 0.35),
            smart_label_load_2d = get_setting("smartLabelLoad2D", TRUE), 
            repel_force_load_2d = get_setting("repelForceLoad2D", 20),
            repel_box_pad_load_2d = get_setting("repelBoxPadLoad2D", 0.35), 
            repel_point_pad_load_2d = get_setting("repelPointPadLoad2D", 0.35)
          )
        }),
        color_maps = masterColorMaps, shape_maps = masterShapeMaps,
        dynamic_class_colors = dynamic_class_colors,
    # Export Filters and DE
        global_filtered_lipids = global_filtered_lipids,
        de_results = allLipidDEResults,
        significant_lipids = significantLipids,
        de_contrast_info = reactive({ 
            if(is.null(input$deReferenceGroups) || is.null(input$deComparisonGroups)) return(NULL)
            list(ref=input$deReferenceGroups, comp=input$deComparisonGroups, str=construct_contrast_string(input$deReferenceGroups, input$deComparisonGroups)) 
        }),
        de_settings = reactive({
          list(
            p_value_type = input$pValueType,
            p_threshold = input$pFilterThreshold,
            log2fc_threshold = input$log2fcThreshold
          )
        }),
        grouped_metadata = reactive({
          meta <- allParsedMetadata()
     # Reconstruct the dynamic grouping logic locally to export it
          meta$Dynamic_DE_Group <- if(isTRUE(input$deOrientCondition) && isTRUE(input$deOrientPopulation)) {
            paste(meta$Condition, meta$Population, sep="_")
          } else if (isTRUE(input$deOrientCondition)) {
            meta$Condition
          } else { "All" }
          meta
        }),
        class_color_map = map_lipid_class,   # Export Class Map
        origin_color_map = map_bio_origin,   # Export Origin Map
        species_color_map = map_single_species # Export Species Map
      )
    )
  })
}

