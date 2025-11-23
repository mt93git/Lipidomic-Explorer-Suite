#!/usr/bin/env Rscript
##################################################################################
# --- Lipidomic Explorer: PCA & Loading Plots (Version 7.6 - Bugfix) ---
#
# Author: Maxence Tricaud
# Contact: maxence.benjamin@gmail.com
# ORCID: 0009-0000-0737-5110
#
# v7.6 Changelog (Bugfix):
# - Fixed a crash in "Aggregated Classes" PCA mode caused by duplicate 'FullName'
#   columns during a join operation. The logic now correctly handles column
#   renaming to prevent conflicts.
# - All other features from v7.5 remain intact.
##################################################################################

# ── Packages ──────────────────────────────────────────────────────────────────
suppressPackageStartupMessages({
  library(shiny)
  library(bslib)
  library(shinyjqui)
  library(readxl)
  library(dplyr)
  library(tidyr)
  library(stringr)
  library(nipals)
  library(RColorBrewer)
  library(colourpicker)
  library(htmlwidgets)
  library(webshot2)
  library(plotly)
  library(ggplot2)
  library(ggrepel)
  library(viridisLite)
  library(imputeLCMD)
  library(purrr)
  library(DT)
  library(pheatmap)
})

# ── Global Constants & Advanced Parsers ───────────────────────────────────────
SHAPE_CHOICES <- c("Circle"=16, "Square"=15, "Triangle"=17, "Diamond"=18, "Plus"=3, "Cross"=4, "Star"=8)
GGPLOT_TO_PLOTLY_SHAPES <- c("16"="circle", "15"="square", "17"="triangle-up", "18"="diamond", "3"="cross", "4"="x", "8"="star")
CLASS_MAP_COLORS <- c(
  "GP_CL"="#E28E2B", "GP_LPA"="#4169E1", "GP_LPC"="#C15759", "GP_LPE"="#B69A27",
  "GP_LPG"="#26B7B2", "GP_LPI"="#59A14F", "GP_LPS"="#A07AA1", "GP_PA"="#DAA520",
  "GP_PC"="#4E79A7", "GP_PE"="#FF7F00", "GP_PG"="#86BCB6", "GP_PI"="#F99BC3",
  "GP_PS"="#984EA3", "FA_ACar"="#8CD17D", "ST_CE"="#F41A1C", "SP_Cer"="#EDC948",
  "SP_GlcCer"="#5C4F3D", "SP_LacCer"="#6C6FA6", "SP_SM"="#9C755F", "GL_DAG"="#FFC300",
  "GL_TAG"="#2ECC71", "Misc"="#B0B0B0"
)
HYPERCLASS_MAP <- list(
  "GP" = c("GP_CL","GP_LPA","GP_LPC","GP_LPE","GP_LPG","GP_LPI","GP_LPS","GP_PA","GP_PC","GP_PE","GP_PG","GP_PI","GP_PS"),
  "FA" = c("FA_ACar"), "ST" = c("ST_CE"),
  "SP" = c("SP_Cer","SP_GlcCer","SP_LacCer","SP_SM"),
  "GL" = c("GL_DAG","GL_TAG")
)
HYPERCLASS_MAP_COLORS <- c("GP"="#4E79A7", "FA"="#59A14F", "ST"="#9C755F", "SP"="#B07AA1", "GL"="#F1C40F", "Misc"="#B0B0B0")
class_map <- c(
  "LPC"="GP_LPC", "LPE"="GP_LPE", "LPG"="GP_LPG", "LPI"="GP_LPI", "LPS"="GP_LPS",
  "PC"="GP_PC", "PE"="GP_PE", "PG"="GP_PG", "PI"="GP_PI", "PS"="GP_PS", "PA"="GP_PA",
  "LPA"="GP_LPA", "CL"="GP_CL", "ACar"="FA_ACar", "CE"="ST_CE", "Cer"="SP_Cer",
  "GlcCer"="SP_GlcCer", "LacCer"="SP_LacCer", "SM"="SP_SM", "DAG"="GL_DAG", "TAG"="GL_TAG"
)
REVERSE_HYPERCLASS_MAP <- { rev_map<-list(); for(h in names(HYPERCLASS_MAP)){for(s in HYPERCLASS_MAP[[h]]){rev_map[[s]]<-h}}; rev_map }
`%||%` <- function(a, b) if (is.null(a) || is.na(a)) b else a

parse_col_info_v2 <- function(colName) {
  rep_pattern <- "_([A-Z]?\\d+)$"; matches <- str_match(colName, rep_pattern); rep_id <- matches[1, 2]
  base_name <- if (!is.na(rep_id)) str_remove(colName, rep_pattern) else colName
  parts <- strsplit(base_name, "_")[[1]]
  if (length(parts) > 1) {
    population <- parts[length(parts)]; condition <- paste(parts[1:(length(parts)-1)], collapse="_")
  } else { condition <- base_name; population <- NA_character_ }
  tibble(FullName=colName, Condition=condition, Population=population, Replicate=rep_id)
}
parse_lipid_name_v2 <- function(lipid_name) {
  pattern <- paste0("^(",paste(names(class_map),collapse="|"),")","(?:\\(","(\\d+:\\d+)", "(?:/|_)?)?","(\\d+:\\d+)?","\\)?")
  matches <- str_match(lipid_name, pattern)
  if (is.na(matches[1,1])) { class_match <- str_match(lipid_name, paste0("^(",paste(names(class_map),collapse="|"),")")); if (!is.na(class_match[1,1])) matches[1,2] <- class_match[1,2] }
  class_token <- matches[1,2]
  if(is.na(class_token)) return(tibble(Lipid_Name=lipid_name,subclass="Misc",hyperclass="Misc"))
  subclass <- class_map[[class_token]]; hyperclass <- REVERSE_HYPERCLASS_MAP[[subclass]] %||% "Misc"
  tibble(Lipid_Name=lipid_name,subclass=subclass,hyperclass=hyperclass)
}
normalize_pqn_linear <- function(data_matrix) {
  ref_spectrum <- apply(data_matrix, 1, median, na.rm=TRUE)
  ref_spectrum[ref_spectrum == 0 | is.na(ref_spectrum)] <- 1
  quotients <- sweep(data_matrix, 1, ref_spectrum, "/")
  norm_factors <- apply(quotients, 2, median, na.rm = TRUE)
  norm_factors[is.na(norm_factors) | norm_factors == 0] <- 1
  sweep(data_matrix, 2, norm_factors, "/")
}
normalize_median_log <- function(log_data_matrix) {
  sample_medians <- apply(log_data_matrix, 2, median, na.rm=TRUE)
  grand_median <- median(sample_medians, na.rm = TRUE)
  norm_factors <- sample_medians - grand_median
  sweep(log_data_matrix, 2, norm_factors, "-")
}

# ── UI ────────────────────────────────────────────────────────────────────────
ui <- page_navbar(
  title = "Lipidomic Explorer: PCA & Loading Plots (v7.6)",
  theme = bslib::bs_theme(version = 5),
  nav_spacer(),
  sidebar = sidebar(
    width = 380,
    card(class="mb-3", card_header("1. Input & Run PCA"),
         card_body(
           fileInput("files", "Upload Excel File(s) (.xlsx):", multiple = TRUE, accept = ".xlsx"),
           uiOutput("loaded_files_display"),
           hr(),
           uiOutput("columnSelectorUI"),
           layout_columns(col_widths=c(6,6),
                          actionButton("selectAll", "Select All", icon=icon("check-square"), class="btn-sm w-100"),
                          actionButton("unselectAll", "Unselect All", icon=icon("square"), class="btn-sm w-100")), hr(),
           actionButton("runPCA", "Run PCA", icon=icon("play"), class="btn-primary w-100")
         )),
    card(class="mb-3", card_header("2. PCA & Data Settings"),
         card_body(
           selectInput("normalizationMethod", "Normalization Method:",
                       choices = c("Median (Log Scale)"="median", "PQN (Linear Scale)"="pqn", "None"="none"),
                       selected = "median"),
           radioButtons("pcaMode", "PCA Analysis Mode:",
                        choices = c("Individual Lipids (OMICS)" = "omics",
                                    "Aggregated Classes (CLASS)" = "class"),
                        selected = "omics"),
           hr(),
           strong("Missing Value Handling"),
           checkboxInput("useImputation", "Impute Missing Values (QRILC)", value=TRUE),
           checkboxInput("imputeZerosPerFile", "For each file, impute all-NA lipids to 0", value=TRUE),
           checkboxInput("imputeRemainingNAtoZero", "Final cleanup: Impute any remaining NAs to 0", value=TRUE),
           hr(),
           strong("Data Filtering"),
           checkboxInput("mergeReplicates", "Merge replicates for PCA?", TRUE),
           checkboxInput("dropMisc", "Drop 'Misc' lipids?", TRUE), hr(),
           numericInput("maxPCs", "Max PCs to compute:", value=3, min=2, step=1)
         )),
    card(class="mb-3", card_header("3. Plot Aesthetics"),
         card_body(
           accordion(open=T, multiple=T,
                     accordion_panel("PCA Score Plot", icon=icon("users"),
                                     strong("Coloring"),
                                     radioButtons("colorGrouping", "Color Samples By:", choices=c("Condition","Population","Condition & Population"), selected="Condition", inline=T),
                                     checkboxGroupInput("labelParts", "Label content:", choices=c("Condition","Population","Replicate"), selected=c("Condition"), inline=T),
                                     checkboxInput("useCustomColors", "Override sample colors?", FALSE),
                                     uiOutput("customColorUI"), hr(),
                                     strong("Shaping"),
                                     checkboxInput("useShapes", "Use different shapes for groups?", value=FALSE),
                                     conditionalPanel("input.useShapes == true",
                                                      radioButtons("shapeGrouping", "Shape Samples By:", choices=c("Condition","Population"), selected="Population", inline=T),
                                                      uiOutput("customShapeUI"))
                     ),
                     accordion_panel("PCA Loading Plot", icon=icon("atom"),
                                     checkboxInput("useCustomColorsClasses","Override class colors?",F),
                                     uiOutput("customColorClassUI")),
                     accordion_panel("Plot Styling", icon=icon("ruler-combined"),
                                     checkboxInput("addFrame2D", "Add frame to 2D plots?", FALSE), hr(),
                                     numericInput("scoreMarkerSize2D", "PCA - 2D Dot Size:", value=8, min=1),
                                     numericInput("scoreTextSize2D", "PCA - 2D Label Font Size:", value=4, min=1, step=0.5),
                                     numericInput("scoreMarkerSize3D", "PCA - 3D Dot Size:", value=8, min=1), hr(),
                                     numericInput("loadMarkerSize2D", "Loadings - 2D Dot Size:", value=8, min=1),
                                     numericInput("loadTextSize2D", "Loadings - 2D Label Font Size:", value=4, min=1, step=0.5),
                                     numericInput("loadMarkerSize3D", "Loadings - 3D Dot Size:", value=14, min=1), hr(),
                                     checkboxInput("showLabels3D", "Show labels on 3D plots?", FALSE)
                     ),
                     accordion_panel("2D Smart Labeling (ggrepel)", icon=icon("tags"),
                                     checkboxInput("smartLabelPCA2D", "Smart labels for PCA 2D?", TRUE),
                                     conditionalPanel("input.smartLabelPCA2D",
                                                      numericInput("repelForcePCA2D", "Repel Force:", value=30),
                                                      numericInput("repelBoxPadPCA2D", "Box Padding:", value=0.35),
                                                      numericInput("repelPointPadPCA2D", "Point Padding:", value=0.35)), hr(),
                                     checkboxInput("smartLabelLoad2D", "Smart labels for Loadings 2D?", TRUE),
                                     conditionalPanel("input.smartLabelLoad2D",
                                                      numericInput("repelForceLoad2D", "Repel Force:", value=20),
                                                      numericInput("repelBoxPadLoad2D", "Box Padding:", value=0.35),
                                                      numericInput("repelPointPadLoad2D", "Point Padding:", value=0.35))
                     )
           )
         )),
    card(class="mb-3", card_header("4. Downloads"),
         card_body(
           layout_columns(col_widths=6,
                          downloadButton("downloadPCA2Dpdf", "PCA 2D (PDF)"),
                          downloadButton("downloadPCA3Dpdf", "PCA 3D (PDF)"),
                          downloadButton("downloadLoad2Dpdf", "Loading 2D (PDF)"),
                          downloadButton("downloadLoad3Dpdf", "Loading 3D (PDF)")), hr(),
           downloadButton("downloadAll", "Download All (ZIP)", icon=icon("file-zipper"), class="w-100")
         ))
  ),
  nav_panel("PCA Plots", icon=icon("sitemap"),
            navset_card_pill(
              nav_panel("PCA 2D Score", card(card_body(jqui_resizable(plotOutput("pca2dPlot", height="80vh"))))),
              nav_panel("PCA 3D Score", card(card_body(jqui_resizable(plotlyOutput("pca3dPlot", height="80vh"))))),
              nav_panel("Loading 2D", card(card_body(jqui_resizable(plotOutput("load2dPlot", height="80vh"))))),
              nav_panel("Loading 3D", card(card_body(jqui_resizable(plotlyOutput("load3dPlot", height="80vh")))))
            )
  ),
  nav_panel("QC", icon=icon("chart-line"),
            navset_card_pill(
              nav_panel("Normalization Check",
                        navset_card_tab(
                          nav_panel("Before Preprocessing",
                                    card(card_body(jqui_resizable(plotOutput("boxplotBeforeNorm", height="60vh"))),
                                         card_footer(downloadButton("downloadBoxplotBefore", "PDF", icon=icon("file-pdf"), class="btn-sm")))
                          ),
                          nav_panel("After All Processing Steps",
                                    card(card_body(jqui_resizable(plotOutput("boxplotAfterNorm", height="60vh"))),
                                         card_footer(downloadButton("downloadBoxplotAfter", "PDF", icon=icon("file-pdf"), class="btn-sm")))
                          )
                        )
              ),
              nav_panel("Lipid Class Composition",
                        layout_sidebar(
                          sidebar = sidebar(
                            title = "Bar Plot Settings",
                            radioButtons("barGroupMode", "Group By:", choices=c("Hyperclass", "Sub-class"), selected="Sub-class", inline=TRUE),
                            radioButtons("barValueMode", "Value Mode:", choices=c("Absolute (intensity)", "Absolute (%)", "Normalized (intensity)", "Normalized (%)"), selected="Absolute (intensity)"),
                            radioButtons("barOrientation", "Orientation:", choices=c("Samples on X-axis"="sample_x", "Classes on X-axis"="class_x"), selected="sample_x")
                          ),
                          card(
                            card_header("Lipid Class Composition of Processed Data"),
                            card_body(jqui_resizable(plotOutput("compositionBarPlot", height="70vh"))),
                            card_footer(downloadButton("downloadBarPlot", "PDF", icon=icon("file-pdf"), class="btn-sm"))
                          )
                        )
              )
            )
  ),
  # --- About & Citation Panel ---
  nav_panel("About & Citation", icon=icon("info-circle"),
            card(
              card_header(h4("About the Lipidomic Explorer")),
              card_body(
                p("This application was developed to provide an interactive interface for the comprehensive analysis of lipidomics datasets. It streamlines common workflows including data preprocessing, principal component analysis (PCA), and the generation of publication-quality visualizations."),
                hr(),
                h5("Author"),
                p("Maxence Tricaud"),
                p(
                  icon("envelope"), 
                  tags$a(href="mailto:maxence.benjamin@gmail.com", "maxence.benjamin@gmail.com")
                ),
                p(
                  tags$img(src = "https://info.orcid.org/wp-content/uploads/2019/11/orcid_16x16.png", style="width:16px; height:16px;"),
                  " ORCID: ",
                  tags$a(href="https://orcid.org/0009-0000-0737-5110", target="_blank", "0009-0000-0737-5110")
                ),
                hr(),
                h5("How to Cite This Tool"),
                p("If this application was instrumental in your research, please consider citing it. This helps support the development and maintenance of open-source scientific software. 🙏"),
                tags$blockquote(
                  class = "blockquote",
                  "Tricaud, M. (2025). ", 
                  tags$em("Lipidomic Explorer: An Interactive R/Shiny Application. "), 
                  "Yale University. [Software]. Retrieved from: (GitHub Link Coming Soon)"
                ),
                hr(),
                h5("License"),
                p("This software is open-source and distributed under the MIT License. You are free to use, modify, and distribute it, provided the original copyright and permission notices are included."),
                p("Copyright (c) 2025 Maxence Tricaud")
              )
            )
  )
)

# ── Server ──────────────────────────────────────────────────────────────────
server <- function(input, output, session) {
  
  rv <- reactiveValues(
    uploads = list() # Store uploaded dataframes, named by file name
  )
  
  plot_dims <- reactiveValues(
    pca2d=list(width=960,height=768), pca3d=list(width=960,height=720), 
    load2d=list(width=960,height=768), load3d=list(width=960,height=720),
    boxplot_before=list(width=600, height=500),
    boxplot_after=list(width=600, height=500),
    composition_bar=list(width=800, height=600)
  )
  observeEvent(input$pca2dPlot_size, {req(input$pca2dPlot_size); plot_dims$pca2d <- input$pca2dPlot_size})
  observeEvent(input$pca3dPlot_size, {req(input$pca3dPlot_size); plot_dims$pca3d <- input$pca3dPlot_size})
  observeEvent(input$load2dPlot_size, {req(input$load2dPlot_size); plot_dims$load2d <- input$load2dPlot_size})
  observeEvent(input$load3dPlot_size, {req(input$load3dPlot_size); plot_dims$load3d <- input$load3dPlot_size})
  observeEvent(input$boxplotBeforeNorm_size, {req(input$boxplotBeforeNorm_size); plot_dims$boxplot_before <- input$boxplotBeforeNorm_size})
  observeEvent(input$boxplotAfterNorm_size, {req(input$boxplotAfterNorm_size); plot_dims$boxplot_after <- input$boxplotAfterNorm_size})
  observeEvent(input$compositionBarPlot_size, {req(input$compositionBarPlot_size); plot_dims$composition_bar <- input$compositionBarPlot_size})
  
  load_one_file <- function(file_path, file_name) {
    req(file_path)
    tryCatch({
      sheets <- lapply(readxl::excel_sheets(file_path), function(s) readxl::read_excel(file_path, s, na=c("N/A","NA","")))
      combined <- bind_rows(sheets); validate(need(ncol(combined)>1, "File or sheet seems empty."))
      colnames(combined)[1] <- "Lipid_Name"
      if (any(duplicated(combined$Lipid_Name))) {
        showNotification(paste("Warning:", file_name, "has duplicates. Averaging values for each duplicate lipid."), type="warning", duration=10)
        combined <- combined %>% group_by(Lipid_Name) %>% summarise(across(dplyr::where(is.numeric), ~mean(., na.rm=TRUE)), .groups='drop')
      }
      return(combined)
    }, error=function(e) {showNotification(paste("Error reading", file_name,":",e$message),type="error", duration=10);NULL})
  }
  
  observeEvent(input$files, {
    req(input$files)
    current_files <- rv$uploads
    for (i in 1:nrow(input$files)) {
      file_info <- input$files[i, ]
      if (!file_info$name %in% names(current_files)) {
        current_files[[file_info$name]] <- load_one_file(file_info$datapath, file_info$name)
      }
    }
    rv$uploads <- purrr::compact(current_files) # Remove any NULLs from failed loads
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
      style = "background-color: #f8f9fa;",
      lapply(files, function(filename) {
        safe_id <- make.names(filename)
        tags$div(
          class = "d-flex justify-content-between align-items-center mb-1",
          tags$span(filename),
          actionButton(paste0("remove_", safe_id), icon("times"), 
                       class="btn-sm btn-link text-danger", 
                       style="text-decoration: none; padding: 0 0.3rem;")
        )
      })
    )
  })
  
  rawData <- reactive({
    loaded_files <- rv$uploads
    validate(need(length(loaded_files) > 0, "Please upload at least one valid Excel file."))
    
    if (length(loaded_files) > 1) {
      lipid_lists <- purrr::map(loaded_files, ~.x$Lipid_Name)
      common_lipids <- Reduce(intersect, lipid_lists)
      validate(need(length(common_lipids) > 5, paste("Fewer than 5 common lipids found across all files. Found:", length(common_lipids))))
      
      processed_data <- purrr::map(loaded_files, ~ .x %>% dplyr::filter(Lipid_Name %in% common_lipids) %>% dplyr::arrange(Lipid_Name))
      
      lipid_name_col <- processed_data[[1]] %>% dplyr::select(Lipid_Name)
      data_cols <- purrr::map(processed_data, ~ .x %>% dplyr::select(-Lipid_Name))
      
      merged <- bind_cols(lipid_name_col, !!!data_cols)
    } else {
      merged <- loaded_files[[1]]
    }
    validate(need(!any(duplicated(names(merged)[-1])), "Duplicate sample names detected across files. Please ensure column headers are unique."))
    
    final_data <- merged %>% dplyr::mutate(across(-all_of("Lipid_Name"), as.numeric))
    file_cols <- lapply(loaded_files, function(df) setdiff(names(df), "Lipid_Name"))
    
    list(data = final_data, file_cols = file_cols)
  })
  
  getAllNumericColumns <- reactive({ df_info <- rawData(); req(df_info$data); df_info$data %>% dplyr::select(dplyr::where(is.numeric)) %>% names() })
  output$columnSelectorUI <- renderUI({ cols <- getAllNumericColumns(); req(cols); checkboxGroupInput("selectedColumns", "Select samples:", choices=cols, selected=cols) })
  observeEvent(input$selectAll, { updateCheckboxGroupInput(session, "selectedColumns", selected=getAllNumericColumns()) })
  observeEvent(input$unselectAll, { updateCheckboxGroupInput(session, "selectedColumns", selected=character(0)) })
  
  observeEvent(input$mergeReplicates, {
    current_selected <- input$labelParts
    if (isTRUE(input$mergeReplicates)) { new_selected <- setdiff(current_selected, "Replicate") } else { new_selected <- union(current_selected, "Replicate") }
    updateCheckboxGroupInput(session, "labelParts", selected = new_selected)
  }, ignoreNULL = TRUE, ignoreInit = TRUE)
  
  data_pre_processed <- reactive({
    df_info <- rawData(); req(df_info$data)
    useCols <- input$selectedColumns; validate(need(length(useCols)>0, "Please select at least one sample."))
    data_subset <- df_info$data %>% dplyr::select(Lipid_Name, all_of(useCols))
    
    impute_zeros <- function(df, cols_to_check) {
      if(is.null(cols_to_check)) return(df)
      cols_present <- intersect(names(df), cols_to_check)
      if (length(cols_present) > 0) {
        rows_all_na <- rowSums(is.na(df[, cols_present, drop=FALSE])) == length(cols_present)
        df[rows_all_na, cols_present] <- 0
      }
      return(df)
    }
    
    if (isTRUE(input$imputeZerosPerFile)) {
      for (cols_in_file in df_info$file_cols) {
        data_subset <- impute_zeros(data_subset, cols_in_file)
      }
    }
    return(data_subset)
  })
  
  dataForPCA <- reactive({
    df_info <- rawData(); req(df_info)
    data_subset <- data_pre_processed()
    mat_subset <- data_subset %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
    if(input$normalizationMethod == "pqn") { mat_subset <- normalize_pqn_linear(mat_subset) }
    mat_log <- log2(mat_subset + 1)
    if(input$normalizationMethod == "median") { mat_log <- normalize_median_log(mat_log) }
    mat_for_impute <- mat_log
    
    if (isTRUE(input$useImputation)) {
      if(sum(is.na(mat_for_impute)) > 0) {
        impute_batch <- function(log_mat_batch) {
          if (is.null(log_mat_batch) || ncol(log_mat_batch)==0 || sum(is.na(log_mat_batch))==0) return(log_mat_batch)
          set.seed(42); imputeLCMD::impute.QRILC(log_mat_batch)[[1]]
        }
        
        batches <- df_info$file_cols
        
        imputed_batches <- purrr::map(batches, function(cols) {
          if(is.null(cols)) return(NULL)
          cols_to_impute <- intersect(colnames(mat_for_impute), cols)
          if(length(cols_to_impute) == 0) return(NULL)
          impute_batch(mat_for_impute[, cols_to_impute, drop=FALSE])
        })
        
        mat_log_imputed <- do.call(cbind, purrr::compact(imputed_batches))
        mat_log_imputed <- mat_log_imputed[, colnames(mat_for_impute), drop=FALSE]
      } else { mat_log_imputed <- mat_for_impute }
    } else { mat_log_imputed <- mat_for_impute }
    
    final_mat_linear <- 2^mat_log_imputed - 1
    final_mat_linear[final_mat_linear < 0] <- 0
    data_processed <- as.data.frame(final_mat_linear) %>% tibble::rownames_to_column("Lipid_Name")
    
    if(isTRUE(input$imputeRemainingNAtoZero)){
      na_count <- sum(is.na(data_processed)); if (na_count > 0) {
        data_processed <- data_processed %>% dplyr::mutate(across(dplyr::where(is.numeric), ~replace_na(., 0)))
      }
    }
    validate(need(sum(is.na(data_processed)) == 0, "Processing resulted in unhandled NA values. Try enabling final cleanup."))
    return(data_processed)
  })
  
  pcaResults <- eventReactive(input$runPCA, {
    # --- COMMON SETUP ---
    df <- dataForPCA()
    req(df)
    useCols <- setdiff(names(df), "Lipid_Name")
    validate(need(nrow(df) > 1 && length(useCols) >= 2, "Not enough data for PCA."))
    
    # --- MODE SWITCH ---
    if (input$pcaMode == "omics") {
      # =============================================================
      # --- MODE 1: Individual Lipids (OMICS) ---
      # PCA on individual lipid species using prcomp (standard).
      # =============================================================
      showNotification("Running PCA on Individual Lipids (OMICS mode)...", type = "message")
      
      mat_pca <- df %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      mat_pca_t <- t(mat_pca)
      
      for (j in 1:ncol(mat_pca_t)) {
        if(any(is.na(mat_pca_t[,j]))) {
          mat_pca_t[is.na(mat_pca_t[, j]), j] <- mean(mat_pca_t[, j], na.rm = TRUE)
        }
      }
      
      near_zero_var <- which(apply(mat_pca_t, 2, var, na.rm = TRUE) < 1e-10)
      if (length(near_zero_var) > 0) {
        showNotification(
          paste("Removing", length(near_zero_var), "lipids with zero variance before PCA."),
          type = "warning", duration = 8
        )
        mat_pca_t_filt <- mat_pca_t[, -near_zero_var, drop = FALSE]
      } else {
        mat_pca_t_filt <- mat_pca_t
      }
      
      validate(need(ncol(mat_pca_t_filt) > 1, "Not enough variable lipids remain for PCA after filtering constant features."))
      
      pca_res <- prcomp(mat_pca_t_filt, scale. = TRUE)
      
      ncomp <- min(input$maxPCs, ncol(pca_res$x))
      pca_scores_df <- as.data.frame(pca_res$x) %>%
        dplyr::select(all_of(paste0("PC", 1:ncomp))) %>%
        tibble::rownames_to_column("FullName") %>%
        dplyr::left_join(allParsedMetadata(), by = "FullName")
      
      if (isTRUE(input$mergeReplicates)) {
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
      
    } else {
      # =============================================================
      # --- MODE 2: Aggregated Classes (CLASS) ---
      # PCA on summed lipid classes using nipals.
      # =============================================================
      showNotification("Running PCA on Aggregated Classes (CLASS mode)...", type = "message")
      
      anno <- annotationData() %>% dplyr::filter(Lipid_Name %in% df$Lipid_Name)
      df <- df %>%
        dplyr::left_join(anno %>% dplyr::select(Lipid_Name, subclass), by = "Lipid_Name") %>%
        dplyr::rename(plot_class = subclass)
      
      if(isTRUE(input$dropMisc)){ df <- df[df$plot_class != "Misc", ] }
      
      colMetadata <- bind_rows(lapply(useCols, parse_col_info_v2))
      if(isTRUE(input$mergeReplicates)){
        colMetadata$NewGroupName <- gsub("_NA$","",paste(colMetadata$Condition, colMetadata$Population, sep="_"))
      } else {
        colMetadata$NewGroupName <- colMetadata$FullName
      }
      
      longDF <- df[, c("Lipid_Name", "plot_class", useCols)] %>%
        tidyr::pivot_longer(all_of(useCols), names_to = "FullName", values_to = "Value") %>%
        dplyr::left_join(colMetadata[, c("FullName", "NewGroupName")], by = "FullName")
      
      classAggDF <- longDF %>%
        dplyr::group_by(plot_class, NewGroupName) %>%
        dplyr::summarize(Value = sum(Value, na.rm=T), .groups="drop")
      
      mat_wide <- classAggDF %>%
        tidyr::pivot_wider(names_from = plot_class, values_from = Value, values_fill = 0)
      
      mat_pca <- as.matrix(mat_wide[, -1])
      rownames(mat_pca) <- mat_wide$NewGroupName
      mat_pca_filt <- mat_pca[, apply(mat_pca, 2, sd, na.rm = TRUE) > 1e-12, drop = FALSE]
      
      validate(need(ncol(mat_pca_filt) >= input$maxPCs, "Not enough variable features for the number of PCs requested."))
      ncomp <- min(input$maxPCs, nrow(mat_pca_filt) - 1, ncol(mat_pca_filt))
      
      pca_res <- nipals::nipals(mat_pca_filt, ncomp = ncomp, gramschmidt = TRUE)
      var_expl <- pca_res$R2
      
      sc <- as.data.frame(pca_res$scores)
      colnames(sc) <- paste0("PC", 1:ncomp)
      
      score_df <- sc %>%
        tibble::rownames_to_column("FullName") %>%
        dplyr::left_join(
          colMetadata %>% 
            dplyr::distinct(NewGroupName, .keep_all = TRUE) %>% 
            dplyr::select(-FullName) %>% 
            dplyr::rename(FullName = NewGroupName),
          by = "FullName"
        )
      
      ld <- as.data.frame(pca_res$loadings)
      colnames(ld) <- paste0("PC", 1:ncomp)
      load_df <- ld %>% tibble::rownames_to_column(var = "Class")
      
      list(score_df = score_df, load_df = load_df, var_PC = round(var_expl * 100, 1))
    }
  })
  
  allParsedMetadata <- reactive({cols<-getAllNumericColumns();req(cols);bind_rows(lapply(cols,parse_col_info_v2))})
  annotationData <- reactive({req(rawData());bind_rows(lapply(rawData()$data$Lipid_Name, parse_lipid_name_v2))})
  masterColorMaps <- reactive({meta <- allParsedMetadata(); req(meta); safe_brewer_pal<-function(n,name){colorRampPalette(brewer.pal(max(3,n),name))(n)}; unique_conditions<-sort(unique(meta$Condition)) %>% na.omit(); cond_colors<-if(length(unique_conditions)>0)safe_brewer_pal(length(unique_conditions),"Set1")else c(); names(cond_colors)<-unique_conditions; unique_populations<-sort(unique(meta$Population)) %>% na.omit(); pop_colors<-if(length(unique_populations)>0)safe_brewer_pal(length(unique_populations),"Dark2")else c(); names(pop_colors)<-unique_populations; meta_groups<-meta %>% dplyr::mutate(Group=gsub("_NA$","",paste(Condition,Population,sep="_"))); unique_groups<-sort(unique(meta_groups$Group)) %>% na.omit(); group_colors<-if(length(unique_groups)>0)viridisLite::viridis(length(unique_groups))else c(); names(group_colors)<-unique_groups; list(Condition=cond_colors, Population=pop_colors, "Condition & Population"=group_colors)})
  masterShapeMaps <- reactive({meta <- allParsedMetadata(); req(meta); make_shape_map<-function(groups){unique_groups<-sort(unique(groups)) %>% na.omit(); if(length(unique_groups)==0)return(character(0)); shapes<-rep(unname(SHAPE_CHOICES),length.out=length(unique_groups)); names(shapes)<-unique_groups; shapes}; list(Condition=make_shape_map(meta$Condition), Population=make_shape_map(meta$Population))})
  activeColorMap <- reactive({req(masterColorMaps(),input$colorGrouping);masterColorMaps()[[input$colorGrouping]]})
  activeShapeMap <- reactive({req(masterShapeMaps(),input$shapeGrouping);masterShapeMaps()[[input$shapeGrouping]]})
  output$customColorUI <- renderUI({req(isTRUE(input$useCustomColors),activeColorMap());colors<-activeColorMap();validate(need(length(colors)>0,"No groups for custom colors."));lapply(names(colors),function(g)colourInput(paste0("customCol_",gsub("\\s|&","_",g)),paste("Color for",g),value=colors[[g]]))})
  output$customShapeUI <- renderUI({req(isTRUE(input$useShapes),activeShapeMap());shapes<-activeShapeMap();validate(need(length(shapes)>0,"No groups for custom shapes."));lapply(names(shapes),function(g)selectInput(paste0("customShape_",g),paste("Shape for",g),choices=SHAPE_CHOICES,selected=shapes[[g]]))})
  dynamicGroupingColors <- reactive({base<-activeColorMap();req(base);if(!isTRUE(input$useCustomColors))return(base);for(g in names(base)){picker<-input[[paste0("customCol_",gsub("\\s|&","_",g))]];if(!is.null(picker)&&picker!="")base[g]<-picker};base})
  dynamicShapes <- reactive({base<-activeShapeMap();req(base);if(!isTRUE(input$useShapes))return(NULL);for(g in names(base)){shape_val<-input[[paste0("customShape_",g)]];if(!is.null(shape_val)&&shape_val!="")base[g]<-as.integer(shape_val)};base})
  default_class_colors <- reactive({req(pcaResults());classes<-unique(pcaResults()$load_df$Class)%>%na.omit();req(length(classes)>0);finalColors<-CLASS_MAP_COLORS;unknown<-setdiff(classes,names(finalColors));if(length(unknown)>0){names(unknown)<-unknown;fallback_colors<-colorRampPalette(brewer.pal(8,"Dark2"))(length(unknown));names(fallback_colors)<-unknown;finalColors<-c(finalColors,fallback_colors)};finalColors[classes]})
  output$customColorClassUI <- renderUI({req(pcaResults(),isTRUE(input$useCustomColorsClasses));defaults<-default_class_colors();lapply(names(defaults),function(c)colourInput(paste0("customClassCol_",c),paste("Color:",c),value=defaults[[c]]))})
  dynamicClassColors <- reactive({defaults<-default_class_colors();if(!isTRUE(input$useCustomColorsClasses))return(defaults);for(g in names(defaults)){custom_val<-input[[paste0("customClassCol_",g)]];if(!is.null(custom_val)){defaults[g]<-custom_val}};defaults})
  buildLabelText<-function(c,p,r){paste(c(if("Condition"%in%input$labelParts)gsub("_"," ",c),if("Population"%in%input$labelParts)p,if("Replicate"%in%input$labelParts)r),collapse="\n")}
  buildPCA2D_ggplot <- reactive({r<-pcaResults();req(r);sc<-r$score_df;replicate_col<-if("Replicate" %in% names(sc))sc$Replicate else NA;sc$Label2D<-mapply(buildLabelText,sc$Condition,sc$Population,replicate_col);colorMap<-dynamicGroupingColors();if(input$colorGrouping=="Condition & Population"){sc$ColorGroupVal<-gsub("_NA$","",paste(sc$Condition,sc$Population,sep="_"))}else{sc$ColorGroupVal<-sc[[input$colorGrouping]]%>%replace_na("NA")%>%gsub("_"," ",.)};sc$ColorGroupVal<-factor(sc$ColorGroupVal,levels=names(colorMap));plot_aes<-ggplot2::aes(x=PC1,y=PC2,color=ColorGroupVal);if(isTRUE(input$useShapes)){shapeMap<-dynamicShapes();req(shapeMap);sc$ShapeGroupVal<-sc[[input$shapeGrouping]]%>%replace_na("NA");sc$ShapeGroupVal<-factor(sc$ShapeGroupVal,levels=names(shapeMap));plot_aes<-utils::modifyList(plot_aes,ggplot2::aes(shape=ShapeGroupVal))};p<-ggplot2::ggplot(sc,plot_aes)+ggplot2::geom_point(size=input$scoreMarkerSize2D)+ggplot2::scale_color_manual(name=input$colorGrouping,values=colorMap,drop=F)+ggplot2::geom_hline(yintercept=0,color="black",linewidth=0.4)+ggplot2::geom_vline(xintercept=0,color="black",linewidth=0.4)+ggplot2::labs(title="2D PCA Score",x=paste0("PC1 (",r$var_PC[1],"%)"),y=paste0("PC2 (",r$var_PC[2%||%1],"%)"))+ggplot2::theme_minimal(base_size=14)+ggplot2::theme(panel.grid=ggplot2::element_blank(),plot.background=ggplot2::element_rect(fill="white",color=NA));if(isTRUE(input$useShapes)){p<-p+ggplot2::scale_shape_manual(name=input$shapeGrouping,values=dynamicShapes())};if(isTRUE(input$addFrame2D))p<-p+ggplot2::theme(panel.border=ggplot2::element_rect(colour="black",fill=NA,linewidth=1));if(isTRUE(input$smartLabelPCA2D)){p<-p+ggrepel::geom_text_repel(ggplot2::aes(label=Label2D),color="black",size=input$scoreTextSize2D,force=input$repelForcePCA2D,box.padding=input$repelBoxPadPCA2D,point.padding=input$repelPointPadPCA2D)}else{p<-p+ggplot2::geom_text(ggplot2::aes(label=Label2D),vjust=-0.8,color="black",size=input$scoreTextSize2D)};p})
  output$pca2dPlot<-renderPlot({buildPCA2D_ggplot()})
  buildPCA3D_plotly<-reactive({r<-pcaResults();req(r);sc<-r$score_df;req(nrow(sc)>0,"PC3"%in%names(sc));replicate_col<-if("Replicate" %in% names(sc))sc$Replicate else NA;sc$Label3D<-mapply(function(c,p,r){paste(c(if("Condition"%in%input$labelParts)gsub("_"," ",c),if("Population"%in%input$labelParts)p,if("Replicate"%in%input$labelParts)r),collapse="<br>")},sc$Condition,sc$Population,replicate_col);colorMap<-dynamicGroupingColors();if(input$colorGrouping=="Condition & Population"){sc$ColorGroupVal<-gsub("_NA$","",paste(sc$Condition,sc$Population,sep="_"))}else{sc$ColorGroupVal<-sc[[input$colorGrouping]]%>%replace_na("NA")%>%gsub("_"," ",.)};sc$ColorGroupVal<-factor(sc$ColorGroupVal,levels=names(colorMap));shapeMap_plotly<-NULL;if(isTRUE(input$useShapes)){shapeMap_gg<-dynamicShapes();req(shapeMap_gg);shapeMap_plotly<-GGPLOT_TO_PLOTLY_SHAPES[as.character(shapeMap_gg)];names(shapeMap_plotly)<-names(shapeMap_gg);sc$ShapeGroupVal<-sc[[input$shapeGrouping]]%>%replace_na("NA");sc$ShapeGroupVal<-factor(sc$ShapeGroupVal,levels=names(shapeMap_plotly))};plotly::plot_ly(data=sc,x=~PC1,y=~PC2,z=~PC3,color=~ColorGroupVal,colors=colorMap,symbol=if(isTRUE(input$useShapes))~ShapeGroupVal else I("circle"),symbols=if(isTRUE(input$useShapes))shapeMap_plotly else NULL,text=~Label3D,type="scatter3d",mode=if(isTRUE(input$showLabels3D))"markers+text" else "markers",textfont=list(color='#000000',size=12),marker=list(size=input$scoreMarkerSize3D)) %>% plotly::layout(title=list(text="3D PCA Score"),legend=list(title=list(text=paste(c(input$colorGrouping,if(isTRUE(input$useShapes))input$shapeGrouping),collapse=" & "))),scene=list(xaxis=list(title=paste0("PC1 (",r$var_PC[1],"%)")),yaxis=list(title=paste0("PC2 (",r$var_PC[2%||%1],"%)")),zaxis=list(title=paste0("PC3 (",r$var_PC[3%||%1],"%)"))),paper_bgcolor='rgba(255,255,255,1)',plot_bgcolor='rgba(0,0,0,0)')})
  output$pca3dPlot<-renderPlotly({buildPCA3D_plotly()})
  buildLoad2D_ggplot<-reactive({r<-pcaResults();req(r);ld<-r$load_df;if("Lipid_Name" %in% names(ld)){ld$Label2D <- ld$Lipid_Name}else{ld$Label2D <- gsub("_"," ",ld$Class)};colorMap<-dynamicClassColors();ld$Class<-factor(ld$Class,levels=names(colorMap));p<-ggplot2::ggplot(ld,ggplot2::aes(PC1,PC2,color=Class))+ggplot2::geom_point(size=input$loadMarkerSize2D)+ggplot2::scale_color_manual(values=colorMap,name="Lipid Class",drop=F)+ggplot2::geom_hline(yintercept=0,color="black",linewidth=0.4)+ggplot2::geom_vline(xintercept=0,color="black",linewidth=0.4)+ggplot2::labs(title="2D PCA Loadings",x="PC1 Loading",y="PC2 Loading")+ggplot2::theme_minimal(base_size=14)+ggplot2::theme(panel.grid=ggplot2::element_blank(),plot.background=ggplot2::element_rect(fill="white",color=NA));if(isTRUE(input$addFrame2D))p<-p+ggplot2::theme(panel.border=ggplot2::element_rect(colour="black",fill=NA,linewidth=1));if(isTRUE(input$smartLabelLoad2D)){p<-p+ggrepel::geom_text_repel(ggplot2::aes(label=Label2D),color="black",size=input$loadTextSize2D,force=input$repelForceLoad2D,box.padding=input$repelBoxPadLoad2D,point.padding=input$repelPointPadLoad2D)}else{p<-p+ggplot2::geom_text(ggplot2::aes(label=Label2D),vjust=-0.8,color="black",size=input$loadTextSize2D)};p})
  output$load2dPlot<-renderPlot({buildLoad2D_ggplot()})
  buildLoad3D_plotly<-reactive({r<-pcaResults();req(r);ld<-r$load_df;req(nrow(ld)>0,"PC3"%in%names(ld));if("Lipid_Name" %in% names(ld)){ld$TextLabel <- ld$Lipid_Name}else{ld$TextLabel <- gsub("_"," ",ld$Class)};plotly::plot_ly(data=ld,x=~PC1,y=~PC2,z=~PC3,color=~Class,colors=dynamicClassColors(),text=~TextLabel,type="scatter3d",mode=if(isTRUE(input$showLabels3D))"markers+text" else "markers",textfont=list(color='#000000',size=12),marker=list(size=input$loadMarkerSize3D)) %>% plotly::layout(title=list(text="3D PCA Loadings"),scene=list(xaxis=list(title="PC1 Loading"),yaxis=list(title="PC2 Loading"),zaxis=list(title="PC3 Loading")),paper_bgcolor='rgba(255,255,255,1)',plot_bgcolor='rgba(0,0,0,0)')})
  output$load3dPlot<-renderPlotly({buildLoad3D_plotly()})
  
  ## --- QC Plot Logic & Outputs ---
  prepare_boxplot_data <- function(data_df, metadata) {data_df %>% tidyr::pivot_longer(cols=-Lipid_Name, names_to="FullName", values_to="Intensity") %>% dplyr::left_join(metadata %>% dplyr::select(FullName, Condition), by="FullName")}
  boxplotBeforePlotObj <- reactive({req(data_pre_processed(),input$selectedColumns);df_log<-data_pre_processed()%>%dplyr::mutate(across(dplyr::where(is.numeric),~log2(.+1)));meta<-allParsedMetadata()%>%dplyr::filter(FullName%in%input$selectedColumns);plot_data<-prepare_boxplot_data(df_log,meta);ggplot2::ggplot(plot_data,ggplot2::aes(x=FullName,y=Intensity,fill=Condition))+ggplot2::geom_boxplot(outlier.shape=NA)+ggplot2::labs(x=NULL, y="Log2(Intensity + 1)")+ggplot2::theme_bw(base_size=12)+ggplot2::coord_cartesian(ylim=stats::quantile(plot_data$Intensity,c(0.01,0.99),na.rm=T))+ggplot2::theme(axis.text.x=ggplot2::element_text(angle=90,hjust=1,vjust=0.5),axis.title.x=ggplot2::element_blank())})
  output$boxplotBeforeNorm <- renderPlot({ boxplotBeforePlotObj() })
  boxplotAfterPlotObj <- reactive({req(dataForPCA(),input$selectedColumns);df_log<-dataForPCA()%>%dplyr::mutate(across(dplyr::where(is.numeric),~log2(.+1)));meta<-allParsedMetadata()%>%dplyr::filter(FullName%in%input$selectedColumns);plot_data<-prepare_boxplot_data(df_log,meta);ggplot2::ggplot(plot_data,ggplot2::aes(x=FullName,y=Intensity,fill=Condition))+ggplot2::geom_boxplot(outlier.shape=NA)+ggplot2::labs(x=NULL, y="Log2(Intensity + 1)")+ggplot2::theme_bw(base_size=12)+ggplot2::coord_cartesian(ylim=stats::quantile(plot_data$Intensity,c(0.01,0.99),na.rm=T))+ggplot2::theme(axis.text.x=ggplot2::element_text(angle=90,hjust=1,vjust=0.5),axis.title.x=ggplot2::element_blank())})
  output$boxplotAfterNorm <- renderPlot({ boxplotAfterPlotObj() })
  
  computeBarData <- function(mat, anno_df){validate(need(is.matrix(mat)&&nrow(mat)>0&&ncol(mat)>0,"No data for bar chart."));dfm<-as.data.frame(mat) %>% tibble::rownames_to_column("Lipid_Name")%>%dplyr::left_join(dplyr::select(anno_df,Lipid_Name,subclass,hyperclass),by="Lipid_Name")%>%tidyr::pivot_longer(cols=all_of(colnames(mat)),names_to="SampleCol",values_to="Intensity");if(grepl("Normalized",input$barValueMode)){dfm<-dfm%>%dplyr::group_by(Lipid_Name)%>%dplyr::mutate(rowSum=sum(Intensity,na.rm=T),Intensity=if_else(rowSum>0,Intensity/rowSum,0))%>%dplyr::ungroup()};groupVar<-if(input$barGroupMode=="Hyperclass")"hyperclass" else "subclass";dfm<-dfm%>%dplyr::rename(ClassGroup=all_of(groupVar));if(input$barOrientation=="sample_x"){df_sum<-dfm%>%dplyr::group_by(SampleCol,ClassGroup)%>%dplyr::summarize(Value=sum(Intensity,na.rm=T),.groups="drop");df_sum$SampleCol<-factor(df_sum$SampleCol,levels=colnames(mat));if(grepl("\\(\\%\\)$",input$barValueMode))df_sum<-df_sum%>%dplyr::group_by(SampleCol)%>%dplyr::mutate(Value=Value/sum(Value)*100)%>%dplyr::ungroup();df_sum%>%dplyr::rename(xVal=SampleCol,fillVal=ClassGroup)}else{df_sum<-dfm%>%dplyr::group_by(ClassGroup,SampleCol)%>%dplyr::summarize(Value=sum(Intensity,na.rm=T),.groups="drop");df_sum$SampleCol<-factor(df_sum$SampleCol,levels=colnames(mat));if(grepl("\\(\\%\\)$",input$barValueMode))df_sum<-df_sum%>%dplyr::group_by(ClassGroup)%>%dplyr::mutate(Value=Value/sum(Value)*100)%>%dplyr::ungroup();df_sum%>%dplyr::rename(xVal=ClassGroup,fillVal=SampleCol)}}
  buildBarPlot <- function(df){validate(need(is.data.frame(df)&&nrow(df)>0,"No data to plot."));ylab_text<-switch(input$barValueMode,"Absolute (intensity)"="Summed Intensity","Absolute (%)"="Relative Intensity (%)","Normalized (intensity)"="Summed Lipid-Wise Normalized Intensity","Normalized (%)"="Relative Lipid-Wise Normalized Intensity (%)");fillMap<-if(input$barOrientation=="sample_x"){if(input$barGroupMode=="Hyperclass")HYPERCLASS_MAP_COLORS else CLASS_MAP_COLORS}else{colorRampPalette(brewer.pal(9,"Set1"))(n_distinct(df$fillVal)) %>% setNames(nm=unique(df$fillVal))};ggplot2::ggplot(df,ggplot2::aes(x=xVal,y=Value,fill=fillVal))+ggplot2::geom_bar(stat="identity",position="stack")+ggplot2::scale_fill_manual(values=fillMap,name=NULL,na.value="grey50")+ggplot2::labs(x=NULL,y=ylab_text)+ggplot2::theme_minimal(base_size=14)+ggplot2::theme(panel.grid=ggplot2::element_blank(),axis.text.x=ggplot2::element_text(angle=90,vjust=0.5,hjust=1))}
  barPlotData <- reactive({req(dataForPCA(),annotationData());computeBarData(mat=dataForPCA()%>%tibble::column_to_rownames("Lipid_Name")%>%as.matrix(),anno_df=annotationData())})
  compositionBarPlotObj <- reactive({ buildBarPlot(barPlotData()) })
  output$compositionBarPlot <- renderPlot({ compositionBarPlotObj() })
  
  ## --- Download Handlers ---
  create_download <- function(plot_obj, dims, file_prefix) {downloadHandler(filename=function()paste0(file_prefix,"_",format(Sys.time(),"%Y%m%d_%H%M"),".pdf"),content=function(f){p<-plot_obj();req(p);d<-dims();ggplot2::ggsave(f,p,"pdf",width=d$width/96,height=d$height/96,units="in")})}
  output$downloadPCA2Dpdf <- create_download(buildPCA2D_ggplot, reactive(plot_dims$pca2d), "PCA_2D")
  output$downloadLoad2Dpdf <- create_download(buildLoad2D_ggplot, reactive(plot_dims$load2d), "Loading_2D")
  output$downloadBoxplotBefore <- create_download(boxplotBeforePlotObj, reactive(plot_dims$boxplot_before), "QC_Boxplot_Before")
  output$downloadBoxplotAfter <- create_download(boxplotAfterPlotObj, reactive(plot_dims$boxplot_after), "QC_Boxplot_After")
  output$downloadBarPlot <- create_download(compositionBarPlotObj, reactive(plot_dims$composition_bar), "QC_Barplot_Composition")
  
  create_3d_download <- function(plotly_obj, dims, file_prefix) {downloadHandler(filename=function()paste0(file_prefix,"_",format(Sys.time(),"%Y%m%d_%H%M"),".pdf"),content=function(f){fig<-plotly_obj();req(fig);d<-dims();tmp<-tempfile(fileext=".html");htmlwidgets::saveWidget(fig,tmp);webshot2::webshot(tmp,f,vwidth=d$width,vheight=d$height)})}
  output$downloadPCA3Dpdf <- create_3d_download(buildPCA3D_plotly, reactive(plot_dims$pca3d), "PCA_3D")
  output$downloadLoad3Dpdf <- create_3d_download(buildLoad3D_plotly, reactive(plot_dims$load3d), "Loading_3D")
  
  output$downloadAll<-downloadHandler(filename=function()paste0("PCA_Analysis_",format(Sys.time(),"%Y%m%d_%H%M"),".zip"),content=function(f){owd<-setwd(tempdir());on.exit(setwd(owd));files<-c();dpi<-96;if(!is.null(p<-buildPCA2D_ggplot())){d<-plot_dims$pca2d;ggplot2::ggsave("PCA_2D.pdf",p,width=d$width/dpi,height=d$height/dpi,units="in");files<-c(files,"PCA_2D.pdf")};if(!is.null(p<-buildLoad2D_ggplot())){d<-plot_dims$load2d;ggplot2::ggsave("Loading_2D.pdf",p,width=d$width/dpi,height=d$height/dpi,units="in");files<-c(files,"Loading_2D.pdf")};if(!is.null(fig<-buildPCA3D_plotly())){d<-plot_dims$pca3d;tmp<-"PCA_3D.html";htmlwidgets::saveWidget(fig,tmp);webshot2::webshot(tmp,"PCA_3D.pdf",vwidth=d$width,vheight=d$height);files<-c(files,"PCA_3D.pdf")};if(!is.null(fig<-buildLoad3D_plotly())){d<-plot_dims$load3d;tmp<-"Loading_3D.html";htmlwidgets::saveWidget(fig,tmp);webshot2::webshot(tmp,"Loading_3D.pdf",vwidth=d$width,vheight=d$height);files<-c(files,"Loading_3D.pdf")};zip(f,files)})
  
}

shinyApp(ui = ui, server = server)

