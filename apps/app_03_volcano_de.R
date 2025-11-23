#!/usr/bin/env Rscript
#################################################################################
# --- Lipidomic Explorer (Version 25.6) ---
#
# Author: Maxence Tricaud
# Contact: maxence.benjamin@gmail.com
# ORCID: 0009-0000-0737-5110
#################################################################################

# v25.6 Changelog:
# - Replaced 2 static file inputs with a single dynamic multi-file input.
# - Added UI to display loaded files with individual "remove" buttons.
# - Refactored server logic to handle a dynamic list of files.
# - Added explicit 'dplyr::' namespace calls to prevent "unused argument" errors.
# - Corrected 'model.matrix' function call to use 'stats::' namespace, resolving
#   the "not an exported object" error.

# ==============================================================================
# --- 1. LOAD LIBRARIES ---
# ==============================================================================
suppressPackageStartupMessages({
  library(shiny)
  library(bslib)
  library(shinyjqui)
  library(readxl)
  library(dplyr)
  library(tidyr)
  library(ggplot2)
  library(ggrepel)
  library(DT)
  library(scales)
  library(colourpicker)
  library(RColorBrewer)
  library(stringr)
  library(imputeLCMD)
  library(purrr)
  library(zip)
  library(limma)
  library(fgsea)
  library(stats)
})

# ==============================================================================
# --- 2. GLOBAL CONSTANTS & DEFINITIONS ---
# ==============================================================================

`%||%` <- function(a, b) { if (!is.null(a)) a else b }

# Color mappings and Hyperclass maps retained
PATHWAY_COLORS_VOLCANO <- c(
  "Not Enriched" = "grey80", "PG" = "#86BCB6", "PE" = "#FF7F00", "PC" = "#4E79A7", "PS" = "#984EA3", "ACar" = "#8CD17D", "TAG" = "#2ECC71", "Cer" = "#EDC948", "LPC" = "#C15759", "LPE" = "#B69A27", "PI" = "#F99BC3", "SM" = "#9C755F", "CE" = "#F41A1C", "DAG" = "#FFC300", "CL" = "#E28E2B", "PA" = "#DAA520", "Misc" = "#B0B0B0"
)

HYPERCLASS_MAP <- list(
  "GP" = c("GP_CL", "GP_LPA", "GP_LPC", "GP_LPE", "GP_LPG", "GP_LPI", "GP_LPS", "GP_PA", "GP_PC", "GP_PE", "GP_PG", "GP_PI", "GP_PS"),
  "FA" = c("FA_ACar"), "ST" = c("ST_CE"), "SP" = c("SP_Cer", "SP_GlcCer", "SP_LacCer", "SP_SM"),
  "GL" = c("GL_DAG", "GL_TAG")
)

SUBSTRATE_MAP <- c("AA (20:4)" = "20:4", "DGLA (20:3)" = "20:3", "AdA (22:4)" = "22:4",
                   "EPA (20:5)" = "20:5", "DHA (22:6)" = "22:6", "DPA (22:5)" = "22:5")

# Subsets for UI clarity
N6_SUBSTRATES <- SUBSTRATE_MAP[1:3]
N3_SUBSTRATES <- SUBSTRATE_MAP[4:6]

# ==============================================================================
# --- 3. HELPER FUNCTIONS ---
# ==============================================================================

# --- UI Helpers ---
help_icon <- function(title, content) {
  popover(trigger = icon("question-circle"), title = title, content, placement = "right")
}

# --- Data Processing Helpers ---
normalize_pqn_linear <- function(data_matrix) {
  presence_mask <- rowSums(!is.na(data_matrix) & data_matrix > 0) / ncol(data_matrix) >= 0.5
  data_subset <- if(sum(presence_mask) < 10) data_matrix else data_matrix[presence_mask, , drop = FALSE]
  ref_spectrum <- apply(data_subset, 1, median, na.rm = TRUE)
  ref_spectrum[ref_spectrum == 0 | is.na(ref_spectrum)] <- 1
  quotients <- sweep(data_subset, 1, ref_spectrum, "/")
  norm_factors <- apply(quotients, 2, median, na.rm = TRUE)
  norm_factors[is.na(norm_factors) | norm_factors == 0] <- 1
  return(sweep(data_matrix, 2, norm_factors, "/"))
}

normalize_median_log <- function(log_data_matrix) {
  sample_medians <- apply(log_data_matrix, 2, median, na.rm=TRUE)
  grand_median <- median(sample_medians, na.rm = TRUE)
  norm_factors <- sample_medians - grand_median
  return(sweep(log_data_matrix, 2, norm_factors, "-"))
}

calculate_presence <- function(data_matrix, group_indices) {
  apply(data_matrix[, group_indices, drop=FALSE], 1, function(x) sum(!is.na(x) & x > 0) / length(x) * 100)
}

# --- Parsing Functions ---
parse_col_info <- function(colName) {
  rep_match <- stringr::str_match(colName, "_([A-Z]?\\d+)")
  rep_id <- if (!is.na(rep_match[1, 1])) rep_match[1, 2] else NA_character_
  
  base_name <- if (!is.na(rep_id)) {
    stringr::str_remove(colName, fixed(paste0("_", rep_id)))
  } else {
    colName
  }
  
  parts <- strsplit(base_name, "_")[[1]]
  if (length(parts) > 1) {
    population <- parts[length(parts)]
    condition <- paste(parts[1:(length(parts) - 1)], collapse = "_")
  } else {
    condition <- base_name
    population <- "Default"
  }
  
  list(Condition = condition, Population = population, Group = base_name, Rep = rep_id, OriginalName = colName)
}

parse_lipid_name <- function(lip) {
  class_name_map <- c("ACar"="FA_ACar", "CE"="ST_CE", "Cer"="SP_Cer", "CL"="GP_CL", "GlcCer"="SP_GlcCer", "LacCer"="SP_LacCer", "LPC"="GP_LPC", "LPE"="GP_LPE", "LPG"="GP_LPG", "LPI"="GP_LPI", "LPS"="GP_LPS", "PC"="GP_PC", "PE"="GP_PE", "PA"="GP_PA", "LPA"="GP_LPA", "PG"="GP_PG", "PI"="GP_PI", "PS"="GP_PS", "SM"="SP_SM", "DAG"="GL_DAG", "TAG"="GL_TAG")
  out <- list(subclass = "Misc", hyperclass = "Misc", modification = "standard", chain1_length = NA_real_, DBchain1 = NA_real_, chain2_length = NA_real_, DBchain2 = NA_real_)
  known_classes <- names(class_name_map); known_classes <- known_classes[order(nchar(known_classes), decreasing = TRUE)]
  class_token <- NA_character_
  for (kc in known_classes) { if (startsWith(lip, kc)) { class_token <- kc; break } }
  if (is.na(class_token)) return(out)
  out$subclass <- class_name_map[[class_token]]
  for (hp in names(HYPERCLASS_MAP)) { if (out$subclass %in% HYPERCLASS_MAP[[hp]]) { out$hyperclass <- hp; break } }
  if (stringr::str_detect(lip, "\\(P-")) { out$modification <- "plasmalogen"
  } else if (stringr::str_detect(lip, "\\(O-")) { out$modification <- "ether"
  } else if (stringr::str_detect(lip, "Cer\\(d|SM\\(d")) { out$modification <- "dihydro" }
  parse_one_chain_token <- function(x) {
    out_chain <- list(length = NA_real_, dbonds = NA_real_)
    mt <- regexpr("(\\d+):(\\d+)", x)
    if (mt > -1) { match_str <- regmatches(x, mt); spl <- strsplit(match_str, ":")[[1]]; if (length(spl) == 2) { out_chain$length <- as.numeric(spl[1]); out_chain$dbonds <- as.numeric(spl[2]) } }
    out_chain
  }
  main_no_adduct <- sub("(\\s?[+-][^\\s]+)$", "", lip)
  chain_block_match <- regmatches(main_no_adduct, regexpr("(?<=\\().*(?=\\))", main_no_adduct, perl = TRUE))
  if (length(chain_block_match) > 0 && nchar(chain_block_match[1]) > 0) {
    chain_tokens <- strsplit(gsub("[/_]", "_", chain_block_match[1]), "_")[[1]]
    if (length(chain_tokens) >= 1) { ch1 <- parse_one_chain_token(chain_tokens[1]); out$chain1_length <- ch1$length; out$DBchain1 <- ch1$dbonds }
    if (length(chain_tokens) >= 2) { ch2 <- parse_one_chain_token(chain_tokens[2]); out$chain2_length <- ch2$length; out$DBchain2 <- ch2$dbonds }
  } else {
    chain_part <- trimws(sub(paste0("^", class_token), "", main_no_adduct))
    if (nchar(chain_part) > 0) { ch1 <- parse_one_chain_token(chain_part); out$chain1_length <- ch1$length; out$DBchain1 <- ch1$dbonds }
  }
  return(out)
}

# --- Chain Classification Helpers ---
get_saturation_class <- function(db_count) {
  dplyr::case_when(is.na(db_count) ~ NA_character_, db_count == 0 ~ "SFA", db_count == 1 ~ "MUFA", db_count > 1 ~ "PUFA", TRUE ~ NA_character_)
}
get_length_class <- function(len) {
  dplyr::case_when(is.na(len) ~ NA_character_, len < 6 ~ "SCFA", len <= 12 ~ "MCFA", len <= 21 ~ "LCFA", len > 21 ~ "VLCFA", TRUE ~ NA_character_)
}
get_substrate_id <- function(len, db) {
  if (is.na(len) || is.na(db)) return(NA_character_)
  id_str <- paste0(len, ":", db)
  match <- names(SUBSTRATE_MAP)[SUBSTRATE_MAP == id_str]
  if (length(match) > 0) match[1] else NA_character_
}


cleanLipidName <- function(x) sub("([+\\-](NH4|AcO|\\d*H))$","",x)

# --- Plotting Helpers ---
piecewise_compress_trans <- function(L, a) {
  if(L < 0) stop("Threshold L must be >= 0"); if(a <= 0) stop("Param a must be > 0")
  forward <- function(x) sapply(x, function(v) if(is.na(v) || abs(v) <= L) v else sign(v)*(L + a*log(abs(v)-L+1)))
  inverse <- function(y) sapply(y, function(v) if(is.na(v) || abs(v) <= L) v else sign(v)*(L + exp((abs(v)-L)/a) - 1))
  scales::trans_new("piecewiseCompress", forward, inverse, domain=c(-Inf,Inf))
}
piecewise_compress_non_sig <- function(T_val, factor) {
  if(T_val <= 0 || factor < 1) return(scales::identity_trans())
  boundary <- T_val / factor
  forward <- function(y) ifelse(is.na(y) | y <= 0, y, ifelse(y <= T_val, y / factor, boundary + (y - T_val)))
  inverse <- function(y_prime) ifelse(is.na(y_prime) | y_prime <= 0, y_prime, ifelse(y_prime <= boundary, y_prime * factor, T_val + (y_prime - boundary)))
  scales::trans_new("nonSigYCompress", forward, inverse, domain = c(0, Inf))
}
round_away_from_zero <- function(x) {
  if(is.na(x) || x==0) return(0)
  sign(x) * ceiling(abs(x))
}


# ==============================================================================
# --- 4. UI DEFINITION ---
# ==============================================================================

app_theme <- bslib::bs_theme(version = 5, bg = "#FFFFFF", fg = "#1F1F1F", primary = "#4E79A7", secondary = "#E28E2B", base_font = bslib::font_google("Inter", local=FALSE), heading_font = bslib::font_google("Inter", local=FALSE)) %>% bslib::bs_add_rules(".sidebar .card-header { font-weight: bold; }")

ui <- page_navbar(
  title = "Lipidomic Explorer (v25.6)",
  theme = app_theme,
  sidebar = sidebar(
    width = 380,
    card(class="mb-3", card_header("1. Data Import"),
         p("Upload one or more files. Column names must be unique within and across files."),
         fileInput("files", "Upload Excel File(s) (.xlsx):", multiple = TRUE, accept = ".xlsx"),
         uiOutput("loaded_files_display")
    ),
    
    card(class="mb-3", card_header("2. Preprocessing & Filtering"),
         strong("Normalization & Imputation"),
         selectInput("normalizationMethod", "Normalization Method:",
                     choices = c("Median (Standard)" = "median",
                                 "PQN (Handles dilution)" = "pqn",
                                 "None" = "none"),
                     selected = "median"),
         checkboxInput("useImputation", "Impute Missing Values (QRILC)", value=TRUE),
         hr(),
         strong("Feature Filtering (advanced)"),
         checkboxInput("enableFiltering", "Enable Presence Filtering (advanced)", value=FALSE),
         help_icon("Presence Filtering", "Filters out lipids missing (>0) in too many samples BEFORE imputation. This reduces the number of statistical tests and improves FDR results."),
         conditionalPanel(condition="input.enableFiltering == true",
                          sliderInput("filterThreshold", "Keep lipids present in >= X% of samples...", min=0, max=100, value=50, step=5),
                          radioButtons("filterMode", "...in:", choices=c("At least one group"="one", "All groups"="all", "Total samples"="total"), selected="one")
         )
    ),
    
    card(class="mb-3", card_header("3. Sample Selection & DE Settings"),
         uiOutput("columnSelectorUI"),
         selectInput("deMethod", "DE Method:", choices=c("limma"="limma"), selected="limma"),
         strong("Define Groups by:"),
         checkboxInput("deOrientCondition", "Condition", TRUE),
         checkboxInput("deOrientPopulation", "Population", TRUE),
         hr(),
         radioButtons("deComparisonMode", "DE Comparison Mode:",
                      choices = c("Direct Comparison" = "direct", "Interaction Effect" = "interaction"),
                      selected = "direct", inline = TRUE),
         conditionalPanel(
           condition = "input.deComparisonMode == 'direct'",
           uiOutput("deReferenceGroupUI"),
           uiOutput("deComparisonGroupUI")
         ),
         conditionalPanel(
           condition = "input.deComparisonMode == 'interaction'",
           uiOutput("deInteractionGroupUI")
         )
    ),
    
    card(class="mb-3", card_header("4. Significance Filters"),
         numericInput("log2fcCut", "log2 Fold-Change cutoff >=", 1, step=0.1),
         hr(),
         radioButtons("pValueMethod", "P-value Type:",
                      choices=c("Adjusted (BH-FDR)" = "bh",
                                "Raw (uncorrected)" = "raw"),
                      selected="bh"),
         numericInput("pFilterThreshold", "Significance Threshold <", value=0.05, step=0.01)
    ),
    
    card(
      class = "mb-3",
      card_header("5. Lipid Class Filtering (Cosmetic)"),
      card_body(
        strong("Filter by Hyperclass"), uiOutput("hyperclassSelectorUI"),
        layout_columns(col_widths=c(6,6), actionButton("selectAllHyper", "All"), actionButton("unselectAllHyper", "None")), hr(),
        strong("Filter by Subclass"), uiOutput("subclassSelectorUI"),
        layout_columns(col_widths=c(6,6), actionButton("selectAllSub", "All"), actionButton("unselectAllSub", "None")), hr(),
        strong("Filter by Modification"), uiOutput("modificationSelectorUI"),
        layout_columns(col_widths=c(6,6), actionButton("selectAllMod", "All"), actionButton("unselectAllMod", "None"))
      )
    ),
    
    card(
      class = "mb-3",
      card_header("6. Granular Chain Filtering"),
      card_body(
        checkboxInput("activate_granular_filter", "Activate Granular Chain Filtering", value = FALSE),
        conditionalPanel(
          condition = "input.activate_granular_filter == true",
          strong("Combo 1"),
          checkboxInput("enable_combo1", "Enable", value = TRUE),
          sliderInput("length_range1", "Chain Length Range:", min = 14, max = 72, value = c(14, 72), step = 1),
          sliderInput("db_range1", "Double Bond Range:", min = 0, max = 8, value = c(0, 8), step = 1),
          hr(),
          strong("Combo 2"),
          checkboxInput("enable_combo2", "Enable", value = FALSE),
          sliderInput("length_range2", "Chain Length Range:", min = 14, max = 72, value = c(14, 72), step = 1),
          sliderInput("db_range2", "Double Bond Range:", min = 0, max = 8, value = c(0, 8), step = 1),
          hr(),
          strong("Matching Logic"),
          radioButtons("chain_match_logic", NULL,
                       choices = c("Ignore chain order" = "ignore",
                                   "Respect chain order (position-specific)" = "respect"),
                       selected = "ignore")
        )
      )
    ),
    
    card(
      class = "mb-3",
      card_header("7. Advanced Feature Filtering"),
      card_body(
        checkboxInput("enable_feature_filters", "Activate Feature Filtering", value = FALSE),
        conditionalPanel(
          condition = "input.enable_feature_filters == true",
          strong("Filter by Chain Features (AND logic)"),
          checkboxGroupInput("sat_features", "Saturation Features:",
                             choices = c("SFA", "MUFA", "PUFA"), inline = TRUE),
          checkboxGroupInput("len_features", "Length Features:",
                             choices = c("SCFA", "MCFA"), inline = TRUE),
          hr(),
          strong("Substrate Filtering"),
          checkboxGroupInput("subs_n6", "n-6 Pro-Inflammatory Pathway:",
                             choices = N6_SUBSTRATES, inline = TRUE),
          checkboxGroupInput("subs_n3", "n-3 Pro-Resolving Pathway:",
                             choices = N3_SUBSTRATES, inline = TRUE),
          checkboxGroupInput("substrate_match_positions", "Matching Positions:",
                             choices = c("In first position (sn-1)" = "sn1",
                                         "In second position (sn-2)" = "sn2",
                                         "In ANY position (OR)" = "any"),
                             selected = "any",
                             inline = TRUE)
        )
      )
    ),
    
    card(
      class = "mb-3",
      card_header("8. Volcano Plot Aesthetics"),
      card_body(
        strong("Coloring Scheme"),
        radioButtons("volcanoColorMode", NULL,
                     choices = c("By Regulation (Up/Down)" = "regulation",
                                 "By Enriched Pathway (LSEA)" = "pathway",
                                 "Regulation (Enriched Only)" = "regulation_enriched"),
                     selected = "regulation"),
        hr(),
        strong("Labeling Settings"),
        checkboxInput("showLabels", "Show Volcano Labels?", TRUE),
        sliderInput("labelThreshold", "Label Top (Up & Down):", 0, 100, 10, 1),
        checkboxInput("useCountInsteadOfPct", "Threshold as absolute count? (if unchecked, use %)", TRUE),
        sliderInput("alphaWeightLog2FC", "Weight abs(Log2FC):", 0, 5, 1, 0.1),
        sliderInput("betaWeightNegLog10P", "Weight -Log10P(raw):", 0, 5, 1, 0.1),
        hr(),
        strong("Aesthetic Settings"),
        numericInput("labelTextSize", "Label Text Size:", 4.5, min=1, step=0.5),
        colourInput("labelTextColor", "Label Text Color:", value = "#000000"),
        numericInput("pointSize", "Volcano Dot Size:", 4, min=0.5, step=0.5),
        numericInput("axisTextSize", "Volcano Axis Text Size:", 16, min=6, step=1),
        numericInput("legendTextSize", "Volcano Legend Font Size:", 16, min=6, step=1),
        numericInput("labelForce", "Label Repel Force:", 35, min=0, step=1),
        checkboxInput("removeGrid", "Remove grid lines?", TRUE),
        hr(),
        strong("Axis Settings"),
        numericInput("xMin", "Volcano X-Min:", NULL),
        numericInput("xMax", "Volcano X-Max:", NULL),
        numericInput("yMax", "Volcano Y-Max:", NULL),
        checkboxInput("compressX", "Compress X beyond ±cut?", FALSE),
        conditionalPanel(
          condition="input.compressX == true",
          numericInput("xCompressParam", "X Compress Param:", 0.6, min=0.01, step=0.01)
        ),
        checkboxInput("compressY", "Compress Y below p-thresh?", TRUE),
        conditionalPanel(
          condition="input.compressY == true",
          numericInput("yCompressFactor", "Y compress factor:", 1.5, min=1.0, step=0.1)
        )
      )
    )
  ),
  
  # --- Main Content Area ---
  nav_panel("Volcano Plot", icon=icon("mountain-sun"),
            card(class="plot-card", full_screen=TRUE,
                 card_header(textOutput("volcano_stats_text", container=h5)),
                 card_body(min_height="75vh",
                           jqui_resizable(
                             plotOutput("volcanoPlot", height = "100%"),
                             options = list(
                               create = JS(
                                 "function(event, ui) {
                                  var el = $(this);
                                  Shiny.setInputValue('volcano_plot_width', el.width(), {priority: 'event'});
                                  Shiny.setInputValue('volcano_plot_height', el.height(), {priority: 'event'});
                                }"
                               ),
                               stop = JS(
                                 "function(event, ui) {
                                  Shiny.setInputValue('volcano_plot_width', ui.size.width, {priority: 'event'});
                                  Shiny.setInputValue('volcano_plot_height', ui.size.height, {priority: 'event'});
                                }"
                               )
                             )
                           )
                 )
            ),
            card_footer(layout_columns(col_widths = c(-8, 2, 2),
                                       downloadButton("downloadPlot", "PDF", icon = icon("file-pdf")),
                                       downloadButton("downloadTable", "Data", icon = icon("file-csv"))
            ))
  ),
  
  # --- About & Citation Panel ---
  nav_panel("About & Citation", icon=icon("info-circle"),
            card(
              card_header(h4("About the Lipidomic Explorer")),
              card_body(
                p("This application was developed to provide an interactive interface for the comprehensive analysis of lipidomics datasets. It streamlines common workflows including data preprocessing, differential expression analysis, and the generation of publication-quality visualizations like volcano plots."),
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

# ==============================================================================
# --- 5. SERVER LOGIC ---
# ==============================================================================
server <- function(input, output, session) {
  
  # ============================================================================
  # --- A. DATA LOADING & METADATA ---
  # ============================================================================
  
  rv <- reactiveValues(
    uploads = list() # Store uploaded dataframes, named by file name
  )
  
  plot_dims <- reactiveValues(
    volcano_plot = list(width = 960, height = 768)
  )
  observeEvent(input$volcano_plot_width, { req(input$volcano_plot_width); plot_dims$volcano_plot$width <- input$volcano_plot_width })
  observeEvent(input$volcano_plot_height, { req(input$volcano_plot_height); plot_dims$volcano_plot$height <- input$volcano_plot_height })
  
  load_and_prep_file <- function(file_path, file_name) {
    req(file_path)
    all_sheets <- tryCatch(
      lapply(readxl::excel_sheets(file_path), function(sheet) {
        readxl::read_excel(file_path, sheet = sheet, na = c("N/A", "NA", ""))
      }), error = function(e) { validate(paste("Error reading file:", file_name, ":", e$message)); NULL }
    )
    combined <- dplyr::bind_rows(all_sheets)
    validate(need(ncol(combined) > 1, paste("File:", file_name, "is empty or failed to load.")))
    colnames(combined)[1] <- "Lipid.ID"
    return(combined)
  }
  
  observeEvent(input$files, {
    req(input$files)
    current_files <- rv$uploads
    for (i in 1:nrow(input$files)) {
      file_info <- input$files[i, ]
      if (!file_info$name %in% names(current_files)) {
        current_files[[file_info$name]] <- load_and_prep_file(file_info$datapath, file_info$name)
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
      }, ignoreNULL = TRUE)
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
      merged_data <- Reduce(function(df1, df2) {
        dplyr::inner_join(df1, df2, by = "Lipid.ID")
      }, loaded_files)
      
      validate(need(nrow(merged_data) > 10, "Fewer than 10 lipids were common between the uploaded files. Please check that lipid names match."))
      showNotification(paste("Successfully merged", length(loaded_files), "files, found", nrow(merged_data), "common lipids."), type="message")
    } else {
      merged_data <- loaded_files[[1]]
    }
    
    merged_data %>%
      dplyr::mutate(across(-dplyr::all_of("Lipid.ID"), as.numeric)) %>%
      dplyr::rename(Sample.Name_Original = "Lipid.ID") %>%
      dplyr::mutate(Sample.Name = make.unique(as.character(Sample.Name_Original)))
  })
  
  getAllNumericColumns <- reactive({ df <- rawData(); req(df); setdiff(names(df), c("Sample.Name", "Sample.Name_Original")) })
  
  getDataColumns <- reactive({
    allCols <- getAllNumericColumns(); req(length(allCols) > 0)
    meta <- do.call(rbind, lapply(allCols, function(c) as.data.frame(parse_col_info(c))))
    meta$Condition <- factor(meta$Condition, levels=unique(meta$Condition))
    if ("Population" %in% colnames(meta)) {
      meta$Population <- factor(meta$Population, levels=unique(meta$Population))
    }
    meta
  })
  
  get_grouping_id <- reactive({
    metaDF <- getDataColumns(); req(metaDF)
    group_parts <- list()
    if (isTRUE(input$deOrientCondition)) group_parts <- append(group_parts, list(as.character(metaDF$Condition)))
    if (isTRUE(input$deOrientPopulation) && "Population" %in% colnames(metaDF)) {
      group_parts <- append(group_parts, list(as.character(metaDF$Population)))
    }
    if (length(group_parts) > 0) {
      do.call(paste, c(group_parts, sep = "_"))
    } else {
      rep("AllSamples", nrow(metaDF))
    }
  })
  
  # ============================================================================
  # --- B. DATA PROCESSING PIPELINE ---
  # ============================================================================
  lipidsPassingFilter <- reactive({
    req(rawData()); mat_raw <- rawData()
    mat_numeric <- mat_raw %>% dplyr::select(-Sample.Name, -Sample.Name_Original) %>% as.matrix()
    rownames(mat_numeric) <- mat_raw$Sample.Name
    if (!isTRUE(input$enableFiltering)) return(rownames(mat_numeric))
    groups <- get_grouping_id()
    metaDF <- getDataColumns()
    valid_cols <- intersect(metaDF$OriginalName, colnames(mat_numeric))
    mat_numeric <- mat_numeric[, valid_cols, drop=FALSE]
    groups <- groups[metaDF$OriginalName %in% valid_cols]
    keep <- rep(FALSE, nrow(mat_numeric))
    threshold <- input$filterThreshold
    if (input$filterMode == "total") {
      presence <- calculate_presence(mat_numeric, 1:ncol(mat_numeric))
      keep <- presence >= threshold
    } else if (input$filterMode == "one") {
      for (g in unique(groups)) {
        indices <- which(groups == g)
        if (length(indices) > 0) keep <- keep | (calculate_presence(mat_numeric, indices) >= threshold)
      }
    } else if (input$filterMode == "all") {
      keep <- rep(TRUE, nrow(mat_numeric))
      for (g in unique(groups)) {
        indices <- which(groups == g)
        if (length(indices) > 0) keep <- keep & (calculate_presence(mat_numeric, indices) >= threshold)
        else { keep <- rep(FALSE, nrow(mat_numeric)); break }
      }
    }
    rownames(mat_numeric)[keep]
  })
  
  matrix_filtered <- reactive({
    mat_raw <- rawData(); lipids_to_process <- lipidsPassingFilter()
    validate(need(length(lipids_to_process) > 0, "No lipids passed filtering. Try relaxing filters in Section 2."))
    mat_raw_filtered <- mat_raw %>% dplyr::filter(Sample.Name %in% lipids_to_process)
    mat_raw_filtered %>% dplyr::select(Sample.Name, dplyr::all_of(getAllNumericColumns())) %>% tibble::column_to_rownames("Sample.Name") %>% as.matrix()
  })
  
  processed_matrix_log2 <- reactive({
    mat_filtered <- matrix_filtered()
    if (input$normalizationMethod == "pqn") {
      mat_for_impute <- mat_filtered
      if (isTRUE(input$useImputation)) {
        if(sum(is.na(mat_for_impute) | mat_for_impute <= 0) > 0) {
          mat_for_impute[mat_for_impute <= 0] <- NA
          mat_log_imputed <- imputeLCMD::impute.QRILC(log2(mat_for_impute))[[1]]
          mat_for_impute <- 2^mat_log_imputed
        }
      }
      mat_normalized_linear <- normalize_pqn_linear(mat_for_impute)
      final_log2_matrix <- log2(mat_normalized_linear)
    } else {
      mat_for_log <- mat_filtered
      mat_for_log[mat_for_log <= 0] <- NA
      mat_log <- log2(mat_for_log)
      mat_log_imputed <- mat_log
      if (isTRUE(input$useImputation)) {
        if(sum(is.na(mat_log)) > 0) mat_log_imputed <- imputeLCMD::impute.QRILC(mat_log)[[1]]
      }
      if (input$normalizationMethod == "median") {
        final_log2_matrix <- normalize_median_log(mat_log_imputed)
      } else {
        final_log2_matrix <- mat_log_imputed
      }
    }
    final_log2_matrix[!is.finite(final_log2_matrix)] <- NA
    return(final_log2_matrix)
  })
  
  # ============================================================================
  # --- C. STATISTICAL ANALYSIS ---
  # ============================================================================
  allLipidDEResults <- reactive({
    mat_full <- processed_matrix_log2()
    selected_cols <- input$selectedColumns
    cols_to_use <- intersect(selected_cols, colnames(mat_full))
    validate(need(length(cols_to_use) > 1, "Not enough samples selected for DE analysis."))
    mat <- mat_full[, cols_to_use, drop=FALSE]
    metaDF <- getDataColumns()[getDataColumns()$OriginalName %in% colnames(mat),]
    
    metaDF$DE_Group_ID <- get_grouping_id()[getDataColumns()$OriginalName %in% colnames(mat)]
    metaDF$DE_Group_ID <- factor(metaDF$DE_Group_ID)
    
    group_counts <- table(metaDF$DE_Group_ID)
    if (length(group_counts) < 2) validate(need(FALSE, "DE analysis requires at least 2 groups."))
    if (any(group_counts < 2)) showNotification("Warning: Some groups have < 2 replicates.", type="warning", duration=5)
    
    design <- stats::model.matrix(~0 + DE_Group_ID, data = metaDF);
    colnames(design) <- make.names(levels(metaDF$DE_Group_ID))
    
    if (input$deComparisonMode == "direct") {
      req(input$deReferenceGroups, input$deComparisonGroups)
      ref_groups <- make.names(input$deReferenceGroups)
      comp_groups <- make.names(input$deComparisonGroups)
      validate(need(all(ref_groups %in% colnames(design)) && all(comp_groups %in% colnames(design)), "Selected groups not found in data."))
      ref_avg_str <- paste("(", paste(ref_groups, collapse="+"), ")/", length(ref_groups), sep="")
      comp_avg_str <- paste("(", paste(comp_groups, collapse="+"), ")/", length(comp_groups), sep="")
      contrast_str <- paste(comp_avg_str, "-", ref_avg_str)
    } else { # Interaction Effect
      req(input$int_ref_t1, input$int_ref_t2, input$int_comp_t1, input$int_comp_t2)
      g_ref1 <- make.names(input$int_ref_t1); g_ref2 <- make.names(input$int_ref_t2)
      g_comp1 <- make.names(input$int_comp_t1); g_comp2 <- make.names(input$int_comp_t2)
      validate(need(all(c(g_ref1, g_ref2, g_comp1, g_comp2) %in% colnames(design)), "Selected interaction groups not found."))
      contrast_str <- paste("(", g_comp2, "-", g_comp1, ") - (", g_ref2, "-", g_ref1, ")")
    }
    
    contrast_matrix <- limma::makeContrasts(contrasts = contrast_str, levels = design)
    
    fit <- tryCatch(limma::lmFit(mat, design), error = function(e) validate(need(FALSE, paste("Limma failed. Error:", e$message))))
    fit2 <- limma::contrasts.fit(fit, contrast_matrix)
    eb_fit <- limma::eBayes(fit2, robust = TRUE)
    
    stats_df <- limma::topTable(eb_fit, coef=1, number=Inf, sort.by="none") %>%
      tibble::rownames_to_column("Sample.Name") %>%
      dplyr::rename(log2FC = logFC, p_raw = P.Value, p_adj_bh = adj.P.Val, t_stat = t)
    
    rawData() %>% dplyr::select(Sample.Name, Sample.Name_Original) %>% dplyr::right_join(stats_df, by="Sample.Name")
  })
  
  # ============================================================================
  # --- D. DATA INTEGRATION & PLOTTING ---
  # ============================================================================
  lipidAnnotation <- reactive({
    req(rawData()) %>%
      dplyr::select(Sample.Name, Sample.Name_Original) %>%
      dplyr::mutate(parsed = purrr::map(Sample.Name_Original, parse_lipid_name)) %>%
      tidyr::unnest_wider(parsed)
  })
  
  augmentedLipidAnnotation <- reactive({
    lipidAnnotation() %>%
      dplyr::mutate(
        chain1_sat_class = get_saturation_class(DBchain1),
        chain2_sat_class = get_saturation_class(DBchain2),
        chain1_len_class = get_length_class(chain1_length),
        chain2_len_class = get_length_class(chain2_length),
        chain1_substrate = purrr::pmap_chr(list(chain1_length, DBchain1), get_substrate_id),
        chain2_substrate = purrr::pmap_chr(list(chain2_length, DBchain2), get_substrate_id)
      )
  })
  
  lipids_for_plotting <- reactive({
    df <- augmentedLipidAnnotation()
    
    # 1. Class Filters
    df <- df %>%
      dplyr::filter(
        hyperclass %in% input$selectedHyperclasses,
        subclass %in% input$selectedSubclasses,
        modification %in% input$selectedModifications
      )
    
    # 2. Granular (Slider) Filters
    if (isTRUE(input$activate_granular_filter)) {
      combo1_on <- isTRUE(input$enable_combo1)
      combo2_on <- isTRUE(input$enable_combo2)
      
      if (combo1_on || combo2_on) {
        chain_matches <- function(len, db, len_range, db_range) {
          if (is.na(len) || is.na(db)) return(FALSE)
          (len >= len_range[1] && len <= len_range[2]) & (db >= db_range[1] && db <= db_range[2])
        }
        
        df <- df %>% dplyr::rowwise() %>%
          dplyr::mutate(
            c1_match_C1 = chain_matches(chain1_length, DBchain1, input$length_range1, input$db_range1),
            c2_match_C1 = chain_matches(chain2_length, DBchain2, input$length_range1, input$db_range1),
            c1_match_C2 = chain_matches(chain1_length, DBchain1, input$length_range2, input$db_range2),
            c2_match_C2 = chain_matches(chain2_length, DBchain2, input$length_range2, input$db_range2)
          )
        
        if (input$chain_match_logic == "respect") {
          if (combo1_on && !combo2_on) { df <- df %>% dplyr::filter(c1_match_C1)
          } else if (!combo1_on && combo2_on) { df <- df %>% dplyr::filter(c2_match_C2)
          } else if (combo1_on && combo2_on) { df <- df %>% dplyr::filter(c1_match_C1 & c2_match_C2) }
        } else { # "ignore"
          if (combo1_on && !combo2_on) { df <- df %>% dplyr::filter(c1_match_C1 | c2_match_C1)
          } else if (!combo1_on && combo2_on) { df <- df %>% dplyr::filter(c1_match_C2 | c2_match_C2)
          } else if (combo1_on && combo2_on) { df <- df %>% dplyr::filter( (c1_match_C1 & c2_match_C2) | (c1_match_C2 & c2_match_C1) ) }
        }
      }
    }
    
    # 3. Feature (Categorical/Substrate) Filters
    if (isTRUE(input$enable_feature_filters)) {
      if (!is.null(input$sat_features)) {
        df <- df %>% dplyr::mutate( total_db = coalesce(DBchain1, 0) + coalesce(DBchain2, 0), whole_lipid_sat_class = get_saturation_class(total_db) ) %>% dplyr::filter(whole_lipid_sat_class %in% input$sat_features)
      }
      if (!is.null(input$len_features)) {
        df <- df %>% dplyr::mutate( total_len = coalesce(chain1_length, 0) + coalesce(chain2_length, 0), whole_lipid_len_class = get_length_class(total_len) ) %>% dplyr::filter(whole_lipid_len_class %in% input$len_features)
      }
      selected_subs <- c(input$subs_n6, input$subs_n3)
      if (!is.null(selected_subs) && length(selected_subs) > 0) {
        
        df <- df %>%
          dplyr::mutate(
            chain1_str_sub = dplyr::if_else(!is.na(chain1_length), paste(chain1_length, DBchain1, sep = ":"), NA_character_),
            chain2_str_sub = dplyr::if_else(!is.na(chain2_length), paste(chain2_length, DBchain2, sep = ":"), NA_character_)
          )
        
        positions <- input$substrate_match_positions
        
        if ("any" %in% positions || length(positions) == 0) {
          df <- df %>% dplyr::filter(chain1_str_sub %in% selected_subs | chain2_str_sub %in% selected_subs)
        } else if (length(positions) == 2) {
          filter_condition <- paste(
            sprintf("(chain1_str_sub == '%s' & chain2_str_sub == '%s')", selected_subs, selected_subs),
            collapse = " | "
          )
          df <- df %>% dplyr::filter(eval(parse(text = filter_condition)))
        } else if ("sn1" %in% positions) {
          df <- df %>% dplyr::filter(chain1_str_sub %in% selected_subs)
        } else if ("sn2" %in% positions) {
          df <- df %>% dplyr::filter(chain2_str_sub %in% selected_subs)
        }
      }
    }
    
    return(df$Sample.Name)
  })
  
  volcanoData <- reactive({
    stats_results <- allLipidDEResults(); req(stats_results)
    anno_df <- augmentedLipidAnnotation(); req(anno_df)
    
    p_col_to_use <- switch(input$pValueMethod, "bh"="p_adj_bh", "raw"="p_raw")
    
    stats_with_regulation <- stats_results %>%
      dplyr::mutate(
        Regulation = dplyr::case_when(
          !is.na(.data[[p_col_to_use]]) & .data[[p_col_to_use]] < input$pFilterThreshold & log2FC >= input$log2fcCut ~ "Up",
          !is.na(.data[[p_col_to_use]]) & .data[[p_col_to_use]] < input$pFilterThreshold & log2FC <= -input$log2fcCut ~ "Down",
          TRUE ~ "NS"
        ),
        negLog10P = -log10(.data[[p_col_to_use]]),
        negLog10P_raw = -log10(p_raw),
        labelRankVal = (input$alphaWeightLog2FC * abs(log2FC)) + (input$betaWeightNegLog10P * negLog10P_raw)
      )
    
    lipids_to_plot <- lipids_for_plotting()
    
    base_volcano_data <- stats_with_regulation %>%
      dplyr::inner_join(anno_df %>% dplyr::select(Sample.Name, subclass), by = "Sample.Name") %>%
      dplyr::filter(Sample.Name %in% lipids_to_plot) %>%
      dplyr::mutate(Lipid.Class.Simple = stringr::str_remove(subclass, "^(GP|FA|ST|SP|GL)_"))
    
    validate(need(nrow(base_volcano_data) > 0, "No lipids remain after applying all filters. Please adjust your filter settings."))
    
    lipid_sets <- split(base_volcano_data$Sample.Name, base_volcano_data$Lipid.Class.Simple)
    ranked_lipids <- base_volcano_data %>% dplyr::filter(!is.na(t_stat)) %>% dplyr::select(Sample.Name, t_stat) %>% tibble::deframe()
    
    if (length(ranked_lipids) >= 10) {
      fgsea_results <- tryCatch(fgsea::fgsea(pathways = lipid_sets, stats = ranked_lipids, minSize = 3, eps = 0.0, nPermSimple = 10000), error = function(e) NULL)
      significant_pathways <- if (!is.null(fgsea_results) && nrow(fgsea_results) > 0) {
        fgsea_results %>% dplyr::filter(padj < 0.25) %>% dplyr::pull(pathway)
      } else { character(0) }
    } else { significant_pathways <- character(0) }
    
    base_volcano_data %>%
      dplyr::mutate(Pathway.Group = dplyr::if_else(Lipid.Class.Simple %in% significant_pathways, Lipid.Class.Simple, "Not Enriched"))
  })
  
  de_comparison_string <- reactive({
    if (input$deComparisonMode == 'direct') {
      req(input$deReferenceGroups, input$deComparisonGroups)
      paste(paste(input$deComparisonGroups, collapse = "+"), "\nVs\n", paste(input$deReferenceGroups, collapse = "+"))
    } else {
      req(input$int_ref_t1, input$int_ref_t2, input$int_comp_t1, input$int_comp_t2)
      paste0("Interaction: (", input$int_comp_t2, "-", input$int_comp_t1, ") vs (", input$int_ref_t2, "-", input$int_ref_t1, ")")
    }
  })
  
  plot_main_title <- reactive({
    df <- volcanoData(); req(df)
    up <- sum(df$Regulation == "Up"); down <- sum(df$Regulation == "Down")
    paste0(de_comparison_string(), "\nSignificant: ", up + down, " (Down: ", down, ", Up: ", up, ")")
  })
  
  generateVolcanoPlot <- function() {
    plot_data <- volcanoData()
    validate(need(is.data.frame(plot_data) && nrow(plot_data) > 0, "No data available for plotting. Try relaxing filters."))
    
    p_thresh_line <- -log10(input$pFilterThreshold)
    p_val_label <- switch(input$pValueMethod, "bh"="Adj. P-Value (FDR)", "raw"="Raw P-Value")
    
    p <- ggplot2::ggplot(plot_data, ggplot2::aes(x = log2FC, y = negLog10P)) +
      ggplot2::geom_vline(xintercept = c(-input$log2fcCut, input$log2fcCut), linetype = "dotted") +
      ggplot2::geom_hline(yintercept = p_thresh_line, linetype = "dotted") +
      ggplot2::labs(title = plot_main_title(), x = expression(Log[2]~"Fold Change"), y = bquote(-Log[10]~.(p_val_label))) +
      ggplot2::theme_bw(base_size = 14)
    
    if (input$volcanoColorMode == "pathway") {
      p <- p +
        ggplot2::geom_point(data = dplyr::filter(plot_data, Pathway.Group == "Not Enriched"), aes(color = Pathway.Group), alpha = 0.5, size = input$pointSize) +
        ggplot2::geom_point(data = dplyr::filter(plot_data, Pathway.Group != "Not Enriched"), aes(color = Pathway.Group), size = input$pointSize, alpha = 0.8) +
        ggplot2::scale_color_manual(values = PATHWAY_COLORS_VOLCANO, name = "Enriched Lipid Class")
    } else if (input$volcanoColorMode == "regulation_enriched") {
      p <- p +
        ggplot2::geom_point(data = dplyr::filter(plot_data, Pathway.Group == "Not Enriched"), color = "grey80", alpha = 0.5, size = input$pointSize) +
        ggplot2::geom_point(data = dplyr::filter(plot_data, Pathway.Group != "Not Enriched"), aes(color = Regulation), size = input$pointSize, alpha = 0.9) +
        ggplot2::scale_color_manual(values = c("Up" = "#E41A1C", "Down" = "#377EB8", "NS" = "#AAAAAA"), name = "Regulation (Enriched Only)")
    } else {
      p <- p +
        ggplot2::geom_point(aes(color = Regulation), alpha = 0.7, size = input$pointSize) +
        ggplot2::scale_color_manual(values = c("Up" = "#E41A1C", "Down" = "#377EB8", "NS" = "#AAAAAA"), name = "Regulation")
    }
    
    auto_xMin <- round_away_from_zero(min(plot_data$log2FC, na.rm = TRUE))
    auto_xMax <- round_away_from_zero(max(plot_data$log2FC, na.rm = TRUE))
    auto_yMax <- round_away_from_zero(max(plot_data$negLog10P, na.rm = TRUE))
    
    final_xMin <- if (!is.null(input$xMin) && !is.na(input$xMin)) input$xMin else auto_xMin
    final_xMax <- if (!is.null(input$xMax) && !is.na(input$xMax)) input$xMax else auto_xMax
    final_yMax <- if (!is.null(input$yMax) && !is.na(input$yMax)) input$yMax else auto_yMax
    
    trans_x <- if(isTRUE(input$compressX)) piecewise_compress_trans(input$log2fcCut, input$xCompressParam) else "identity"
    trans_y <- if(isTRUE(input$compressY)) piecewise_compress_non_sig(p_thresh_line, input$yCompressFactor) else "identity"
    
    default_breaks <- scales::breaks_extended()(c(final_xMin, final_xMax))
    custom_breaks <- unique(sort(c(default_breaks, -input$log2fcCut, input$log2fcCut)))
    custom_breaks <- custom_breaks[custom_breaks >= final_xMin & custom_breaks <= final_xMax]
    
    p <- p + ggplot2::scale_x_continuous(limits = c(final_xMin, final_xMax), trans = trans_x, breaks = custom_breaks) +
      ggplot2::scale_y_continuous(limits = c(0, final_yMax), trans = trans_y)
    
    if (isTRUE(input$removeGrid)) p <- p + ggplot2::theme(panel.grid = ggplot2::element_blank())
    
    p <- p + ggplot2::theme(
      plot.title = ggplot2::element_text(hjust = 0, face = "bold", size = 14),
      axis.text = ggplot2::element_text(size = input$axisTextSize),
      axis.title = ggplot2::element_text(size = input$axisTextSize + 2),
      legend.text = ggplot2::element_text(size = input$legendTextSize),
      legend.title = ggplot2::element_text(size = input$legendTextSize)
    )
    
    if (isTRUE(input$showLabels) && input$labelThreshold > 0) {
      df_sig <- plot_data %>% dplyr::filter(Regulation != "NS")
      if (nrow(df_sig) > 0) {
        n_up <- sum(df_sig$Regulation == "Up"); n_down <- sum(df_sig$Regulation == "Down")
        
        top_n_up <- if (isTRUE(input$useCountInsteadOfPct)) input$labelThreshold else round(n_up * (input$labelThreshold / 100))
        top_n_down <- if (isTRUE(input$useCountInsteadOfPct)) input$labelThreshold else round(n_down * (input$labelThreshold / 100))
        
        labelData <- dplyr::bind_rows(
          df_sig %>% dplyr::filter(Regulation == "Up") %>% dplyr::arrange(desc(labelRankVal)) %>% head(top_n_up),
          df_sig %>% dplyr::filter(Regulation == "Down") %>% dplyr::arrange(desc(labelRankVal)) %>% head(top_n_down)
        )
        if (nrow(labelData) > 0) {
          p <- p + ggrepel::geom_text_repel(
            data=labelData, aes(label=cleanLipidName(Sample.Name_Original)), 
            color = input$labelTextColor, size = input$labelTextSize, force = input$labelForce,
            max.overlaps=Inf, show.legend=FALSE
          )
        }
      }
    }
    return(p)
  }
  
  output$volcanoPlot <- renderPlot({ generateVolcanoPlot() }, execOnResize = TRUE)
  output$volcano_stats_text <- renderText({ plot_main_title() })
  
  # ============================================================================
  # --- UI HANDLERS & DOWNLOADS ---
  # ============================================================================
  
  output$columnSelectorUI <- renderUI({
    colnms <- getAllNumericColumns(); req(colnms)
    tagList(strong("Select Samples:"), checkboxGroupInput("selectedColumns", NULL, choices=colnms, selected=colnms), actionLink("selectAll_samples", "All"), " | ", actionLink("unselectAll_samples", "None"))
  })
  observeEvent(input$selectAll_samples, { updateCheckboxGroupInput(session, "selectedColumns", selected=getAllNumericColumns()) })
  observeEvent(input$unselectAll_samples, { updateCheckboxGroupInput(session, "selectedColumns", selected=character(0)) })
  
  getDEGroupChoices <- reactive({
    groups <- get_grouping_id()
    selected_samples <- input$selectedColumns
    metaDF <- getDataColumns()
    groups_in_selected <- groups[metaDF$OriginalName %in% selected_samples]
    sort(unique(groups_in_selected))
  })
  
  output$deReferenceGroupUI <- renderUI({ choices <- getDEGroupChoices(); validate(need(length(choices)>1, "Need >= 2 groups.")); selectInput("deReferenceGroups", "Reference (Control):", choices=choices, multiple=TRUE) })
  output$deComparisonGroupUI <- renderUI({ choices <- getDEGroupChoices(); ref_selected <- input$deReferenceGroups %||% character(0); comp_choices <- setdiff(choices, ref_selected); validate(need(length(comp_choices)>0, "No groups left.")); selectInput("deComparisonGroups", "Comparison (Treatment):", choices=comp_choices, multiple=TRUE) })
  output$deInteractionGroupUI <- renderUI({
    choices <- getDEGroupChoices(); validate(need(length(choices) >= 4, "Interaction analysis requires at least 4 groups."))
    tagList(
      fluidRow(column(6, selectInput("int_ref_t1", "Ref Baseline", choices=choices, selected=if(length(choices)>0) choices[1])), column(6, selectInput("int_ref_t2", "Ref Treatment", choices=choices, selected=if(length(choices)>1) choices[2]))),
      fluidRow(column(6, selectInput("int_comp_t1", "Comp Baseline", choices=choices, selected=if(length(choices)>2) choices[3])), column(6, selectInput("int_comp_t2", "Comp Treatment", choices=choices, selected=if(length(choices)>3) choices[4])))
    )
  })
  
  get_class_choices <- reactive({ anno <- lipidAnnotation(); req(anno); list(hyper=sort(unique(anno$hyperclass)), sub=sort(unique(anno$subclass)), mod=sort(unique(anno$modification))) })
  output$hyperclassSelectorUI <- renderUI({ choices <- get_class_choices()$hyper; checkboxGroupInput("selectedHyperclasses", NULL, choices=choices, selected=choices, inline=TRUE) })
  output$subclassSelectorUI <- renderUI({ choices <- get_class_choices()$sub; checkboxGroupInput("selectedSubclasses", NULL, choices=choices, selected=choices, inline=TRUE) })
  output$modificationSelectorUI <- renderUI({ choices <- get_class_choices()$mod; checkboxGroupInput("selectedModifications", NULL, choices=choices, selected=choices, inline=TRUE) })
  observeEvent(input$selectAllHyper, { updateCheckboxGroupInput(session, "selectedHyperclasses", selected=get_class_choices()$hyper) })
  observeEvent(input$unselectAllHyper, { updateCheckboxGroupInput(session, "selectedHyperclasses", selected=character(0)) })
  observeEvent(input$selectAllSub, { updateCheckboxGroupInput(session, "selectedSubclasses", selected=get_class_choices()$sub) })
  observeEvent(input$unselectAllSub, { updateCheckboxGroupInput(session, "selectedSubclasses", selected=character(0)) })
  observeEvent(input$selectAllMod, { updateCheckboxGroupInput(session, "selectedModifications", selected=get_class_choices()$mod) })
  observeEvent(input$unselectAllMod, { updateCheckboxGroupInput(session, "selectedModifications", selected=character(0)) })
  
  # --- DOWNLOAD HANDLERS ---
  get_dl_name <- reactive({ paste0("LipidTool_", format(Sys.Date(),"%y%m%d"), "_", gsub("[^A-Za-z0-9_]", "", de_comparison_string() %||% "DE")) })
  
  output$downloadPlot <- downloadHandler(
    filename = function() { paste0(get_dl_name(), "_VolcanoPlot.pdf") },
    content = function(f) {
      plot_w_px <- input$volcano_plot_width %||% 960
      plot_h_px <- input$volcano_plot_height %||% 768
      w_in <- max(plot_w_px / 96, 4)
      h_in <- max(plot_h_px / 96, 3)
      ggplot2::ggsave(f, plot = generateVolcanoPlot(), device = "pdf", width = w_in, height = h_in, units = "in", limitsize = FALSE)
    }
  )
  
  output$downloadTable <- downloadHandler(
    filename = function() { paste0(get_dl_name(), "_Significant_Lipids.csv") },
    content = function(f) {
      data_to_write <- volcanoData()
      validate(need(is.data.frame(data_to_write) && nrow(data_to_write) > 0, "Volcano data is not available."))
      
      significant_data <- data_to_write %>%
        dplyr::filter(Regulation != "NS") %>%
        dplyr::arrange(p_raw)
      validate(need(nrow(significant_data) > 0, "No significant data to download with current filters."))
      
      format_pval_2digits <- function(p_values) {
        sapply(p_values, function(p) {
          if (is.na(p) || !is.finite(p)) return("NA")
          if (p < 0.001) {
            return(formatC(p, format = "e", digits = 2))
          } else {
            return(format(round(p, 2), nsmall = 2))
          }
        })
      }
      
      report_df <- significant_data %>%
        dplyr::transmute(
          `Lipid Name` = Sample.Name_Original,
          `log2 Fold Change` = sprintf("%+.2f", log2FC),
          `Raw P-Value` = format_pval_2digits(p_raw),
          `Adjusted P-Value (BH)` = format_pval_2digits(p_adj_bh)
        )
      
      write.csv(report_df, f, row.names = FALSE, na = "NA", quote = TRUE)
    }
  )
  
}

shinyApp(ui = ui, server = server)