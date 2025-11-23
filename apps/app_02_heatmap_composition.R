#!/usr/bin/env Rscript
################################################################################
# --- Lipidomic Explorer (Version 10.6) ---
#
# Author: Maxence Tricaud
# Contact: maxence.benjamin@gmail.com
# ORCID: 0009-0000-0737-5110
#
# v10.6 Changelog:
# - Replaced static file and sheet inputs with a dynamic multi-file input.
# - Added UI to display loaded files with individual "remove" buttons.
# - Refactored server logic to handle a dynamic list of files.
# - Added explicit 'dplyr::' and 'stats::' namespace calls for robustness.
# - Retained the core data processing logic for heatmap and bar chart generation.
################################################################################

# ====
# --- 1. LOAD LIBRARIES ---
# ====
suppressPackageStartupMessages({
  library(shiny)
  library(bslib)
  library(shinyjqui)
  library(DT)
  library(dplyr)
  library(readxl)
  library(tidyr)
  library(pheatmap)
  library(RColorBrewer)
  library(grid)
  library(ggplot2)
  library(tibble)
  library(purrr)
  library(ggpubr)
  library(colourpicker)
  library(imputeLCMD)
  library(limma)
  library(viridisLite)
  library(ggrepel)
  library(stringr)
  library(fgsea)
  library(qvalue)
  library(stats) # Required for standard functions like model.matrix
})

# ====
# --- 2. GLOBAL CONSTANTS & DEFINITIONS ---
# ====

CLASS_MAP_COLORS <- c(
  "GP_CL" = "#E28E2B", "GP_LPA" = "#4169E1", "GP_LPC" = "#C15759",
  "GP_LPE" = "#B69A27", "GP_LPG" = "#26B7B2", "GP_LPI" = "#59A14F",
  "GP_LPS" = "#A07AA1", "GP_PA" = "#DAA520", "GP_PC" = "#4E79A7",
  "GP_PE" = "#FF7F00", "GP_PG" = "#86BCB6", "GP_PI" = "#F99BC3",
  "GP_PS" = "#984EA3", "FA_ACar" = "#8CD17D", "ST_CE" = "#F41A1C",
  "SP_Cer" = "#EDC948", "SP_GlcCer" = "#5C4F3D", "SP_LacCer" = "#6C6FA6",
  "SP_SM" = "#9C755F", "GL_DAG" = "#FFC300", "GL_TAG" = "#2ECC71", "Misc" = "#B0B0B0"
)

HYPERCLASS_MAP <- list(
  "GP" = c("GP_CL", "GP_LPA", "GP_LPC", "GP_LPE", "GP_LPG", "GP_LPI", "GP_LPS", "GP_PA", "GP_PC", "GP_PE", "GP_PG", "GP_PI", "GP_PS"),
  "FA" = c("FA_ACar"), "ST" = c("ST_CE"), "SP" = c("SP_Cer", "SP_GlcCer", "SP_LacCer", "SP_SM"),
  "GL" = c("GL_DAG", "GL_TAG")
)

HYPERCLASS_MAP_COLORS <- c(
  "GP" = "#4E79A7", "FA" = "#59A14F", "ST" = "#9C755F",
  "SP" = "#B07AA1", "GL" = "#F1C40F", "Misc" = "#B0B0B0"
)

class_map <- c("LPC"="GP_LPC", "LPE"="GP_LPE", "LPG"="GP_LPG", "LPI"="GP_LPI", "LPS"="GP_LPS",
               "PC"="GP_PC", "PE"="GP_PE", "PG"="GP_PG", "PI"="GP_PI", "PS"="GP_PS", "PA"="GP_PA",
               "LPA"="GP_LPA", "CL"="GP_CL", "ACar"="FA_ACar", "CE"="ST_CE", "Cer"="SP_Cer",
               "GlcCer"="SP_GlcCer", "LacCer"="SP_LacCer", "SM"="SP_SM",
               "DAG"="GL_DAG", "TAG"="GL_TAG")

REVERSE_HYPERCLASS_MAP <- {
  rev_map <- list()
  for (hyperclass in names(HYPERCLASS_MAP)) {
    for (subclass in HYPERCLASS_MAP[[hyperclass]]) {
      rev_map[[subclass]] <- hyperclass
    }
  }
  rev_map
}

`%||%` <- function(a, b) {
  if (is.null(a)) b else a
}

# ====
# --- 2b. HELPER FUNCTIONS (Processing & Parsing) ---
# ====

# --- UI Helpers ---
help_icon <- function(title, content) {
  popover(trigger = icon("question-circle"), title = title, content, placement = "right")
}

# --- Data Processing Helpers ---
normalize_pqn_linear <- function(data_matrix) {
  presence_mask <- rowSums(!is.na(data_matrix) & data_matrix > 0) / ncol(data_matrix) >= 0.5
  if(sum(presence_mask) < 10) {
    data_subset <- data_matrix
  } else {
    data_subset <- data_matrix[presence_mask, , drop = FALSE]
  }
  ref_spectrum <- apply(data_subset, 1, median, na.rm = TRUE)
  ref_spectrum[ref_spectrum == 0 | is.na(ref_spectrum)] <- 1
  quotients <- sweep(data_subset, 1, ref_spectrum, "/")
  norm_factors <- apply(quotients, 2, median, na.rm = TRUE)
  norm_factors[is.na(norm_factors) | norm_factors == 0] <- 1
  normalized_matrix <- sweep(data_matrix, 2, norm_factors, "/")
  return(normalized_matrix)
}

normalize_median_log <- function(log_data_matrix) {
  sample_medians <- apply(log_data_matrix, 2, median, na.rm=TRUE)
  grand_median <- median(sample_medians, na.rm = TRUE)
  norm_factors <- sample_medians - grand_median
  normalized_matrix <- sweep(log_data_matrix, 2, norm_factors, "-")
  return(normalized_matrix)
}

calculate_presence <- function(data_matrix, group_indices) {
  apply(data_matrix[, group_indices, drop=FALSE], 1, function(x) {
    sum(!is.na(x) & x > 0) / length(x) * 100
  })
}

# --- Parsing Functions ---
classify_chain <- function(nC, DB) {
  if (is.na(nC) || is.na(DB)) {
    return(list(length_class = NA_character_, saturation_class = NA_character_, class_tag = NA_character_))
  }
  
  len_class <- dplyr::case_when(
    nC < 6 ~ "SCFA", nC >= 6 & nC <= 12 ~ "MCFA",
    nC >= 13 & nC <= 21 ~ "LCFA", nC > 21 ~ "VLCFA", TRUE ~ NA_character_
  )
  
  sat_class <- dplyr::case_when(
    DB == 0 ~ "SFA", DB == 1 ~ "MUFA", DB >= 2 ~ "PUFA", TRUE ~ NA_character_
  )
  
  class_tag <- if (!is.na(len_class) && !is.na(sat_class)) paste(len_class, sat_class, sep="-") else NA_character_
  
  return(list(length_class = len_class, saturation_class = sat_class, class_tag = class_tag))
}

parse_col_info_v2 <- function(colName) {
  rep_pattern <- "_([A-Z]?\\d+)$"
  matches <- stringr::str_match(colName, rep_pattern)
  rep_id <- matches[1, 2]
  base_name <- if (!is.na(rep_id)) stringr::str_remove(colName, rep_pattern) else colName
  parts <- strsplit(base_name, "_")[[1]]
  if (length(parts) > 1) {
    tissue <- parts[length(parts)]
    condition <- paste(parts[1:(length(parts) - 1)], collapse = "_")
  } else {
    condition <- base_name
    tissue <- NA_character_
  }
  list(OriginalName = colName, Condition = condition, Tissue = tissue, Group = base_name, Rep = rep_id)
}

parse_lipid_name_v2 <- function(lipid_name) {
  main_no_adduct <- gsub("(\\+[^\\s]+|-[^\\s]+)$", "", lipid_name)
  chain_block_match <- regmatches(main_no_adduct, regexpr("(?<=\\().*(?=\\))", main_no_adduct, perl=TRUE))
  
  chain1_len <- NA_real_; chain1_db <- NA_real_;
  chain2_len <- NA_real_; chain2_db <- NA_real_
  
  if (length(chain_block_match) > 0) {
    chain_tokens <- strsplit(gsub("/", "_", chain_block_match), "_+")[[1]]
    parse_one_chain_token <- function(x) {
      mt <- regexpr("(\\d+):(\\d+)", x)
      if (mt > -1) {
        spl <- strsplit(regmatches(x, mt), ":")[[1]]
        if (length(spl) == 2) return(as.numeric(spl))
      }
      return(c(NA_real_, NA_real_))
    }
    if (length(chain_tokens) >= 1) { ch1 <- parse_one_chain_token(chain_tokens[1]); chain1_len <- ch1[1]; chain1_db <- ch1[2] }
    if (length(chain_tokens) >= 2) { ch2 <- parse_one_chain_token(chain_tokens[2]); chain2_len <- ch2[1]; chain2_db <- ch2[2] }
  }
  
  class_token <- strsplit(lipid_name, "[\\(_\\s]")[[1]][1]
  for(kc in names(class_map)) if(grepl(paste0("^", kc), lipid_name)) class_token <- kc
  subclass <- if (!class_token %in% names(class_map)) "Misc" else class_map[[class_token]]
  hyperclass <- REVERSE_HYPERCLASS_MAP[[subclass]] %||% "Misc"
  modification <- "standard"
  if (stringr::str_detect(lipid_name, "\\(P-")) {
    modification <- "plasmalogen"
  } else if (stringr::str_detect(lipid_name, "\\(O-")) {
    modification <- "ether"
  } else if (stringr::str_detect(lipid_name, "Cer\\(d|SM\\(d")) {
    modification <- "dihydro"
  }
  
  ch1_class <- classify_chain(chain1_len, chain1_db)
  ch2_class <- classify_chain(chain2_len, chain2_db)
  
  all_tags <- c(ch1_class$class_tag, ch2_class$class_tag)
  all_tags <- all_tags[!is.na(all_tags)]
  composite_class <- if (length(all_tags) > 0) paste(sort(all_tags), collapse=" / ") else "Unclassified"
  
  all_len_classes <- na.omit(c(ch1_class$length_class, ch2_class$length_class))
  all_sat_classes <- na.omit(c(ch1_class$saturation_class, ch2_class$saturation_class))
  
  Has_SCFA <- "SCFA" %in% all_len_classes; Has_MCFA <- "MCFA" %in% all_len_classes
  Has_LCFA <- "LCFA" %in% all_len_classes; Has_VLCFA <- "VLCFA" %in% all_len_classes
  Has_SFA <- "SFA" %in% all_sat_classes; Has_MUFA <- "MUFA" %in% all_sat_classes; Has_PUFA <- "PUFA" %in% all_sat_classes
  
  Total_Carbons <- sum(chain1_len, chain2_len, na.rm = TRUE)
  Total_DB <- sum(chain1_db, chain2_db, na.rm = TRUE)
  
  tibble::tibble(
    Lipid_Name = lipid_name, lipid_class = subclass, hyperclass = hyperclass,
    modification = modification, nCchain1 = chain1_len, DBchain1 = chain1_db,
    nCchain2 = chain2_len, DBchain2 = chain2_db, Chain1_Class = ch1_class$class_tag,
    Chain2_Class = ch2_class$class_tag, Composite_Class = composite_class,
    Total_Carbons = Total_Carbons, Total_DB = Total_DB, Has_SCFA = Has_SCFA,
    Has_MCFA = Has_MCFA, Has_LCFA = Has_LCFA, Has_VLCFA = Has_VLCFA, Has_SFA = Has_SFA,
    Has_MUFA = Has_MUFA, Has_PUFA = Has_PUFA
  )
}


# ====
# --- 3. UI DEFINITION ---
# ====

app_theme <- bslib::bs_theme(
  version = 5, bg = "#FFFFFF", fg = "#1F1F1F", primary = "#4E79A7",
  secondary = "#E28E2B", base_font = bslib::font_google("Inter", local = FALSE),
  heading_font = bslib::font_google("Inter", local = FALSE)
) %>% bslib::bs_add_rules(".sidebar .card-header { font-weight: bold; }")

ui <- page_navbar(
  title = "Lipidomic Explorer (v10.6)",
  theme = app_theme,
  sidebar = sidebar(
    width = 380,
    
    card(
      class = "mb-3",
      card_header("1. Data & Preprocessing"),
      card_body(
        strong("1a. Data Input"),
        fileInput("files", "Select XLSX File(s):", multiple = TRUE, accept = ".xlsx"),
        uiOutput("loaded_files_display")
      ),
      card_body(
        strong("1b. Processing Pipeline"),
        selectInput("normalizationMethod", "Normalization Method:",
                    choices = c("Median (Standard)" = "median", "PQN (Handles dilution)" = "pqn", "None" = "none"),
                    selected = "median"),
        checkboxInput("useImputation", "Impute Missing Values (QRILC)", value = TRUE)
      ),
      card_body(
        strong("1c. Select Samples for Analysis"),
        uiOutput("analysisSampleSelectorUI"),
        layout_columns(
          col_widths = c(6, 6),
          actionButton("selectAllAnalysis", "Select All", icon = icon("check-square"), class = "btn-sm w-100"),
          actionButton("unselectAllAnalysis", "Unselect All", icon = icon("square"), class = "btn-sm w-100")
        )
      ),
      card_body(
        strong("1d. Heatmap Display & Sort Mode"),
        radioButtons("repMode", NULL,
                     choices = c("Aggregate (class clustered)" = "aggregate_class",
                                 "Replicates (by Aggregate Class Order)" = "replicate_fixed_class",
                                 "Replicates (class clustered)" = "replicate_resort_class"),
                     selected = "aggregate_class"),
        checkboxInput("useAveragedSubstitution", "Use group average for unchecked samples?", FALSE)
      )
    ),
    card(
      class = "mb-3",
      card_header("2. Column Annotation"),
      card_body(
        checkboxInput("activateCellAnnotation", "Activate Column Annotation", value = FALSE),
        hr(),
        conditionalPanel(
          condition = "input.activateCellAnnotation == true",
          p("Define a cell type and color for each sample group.", class = "text-muted small"),
          uiOutput("cellAnnotationUI")
        )
      )
    ),
    card(
      class = "mb-3",
      card_header("3. Differential Expression"),
      card_body(
        selectInput("deMethod", "DE Method:",
                    choices = c("limma (Recommended)" = "limma"),
                    selected = "limma"),
        strong("Define Groups by:"),
        checkboxInput("deOrientCondition", "Condition", TRUE),
        checkboxInput("deOrientTissue", "Tissue/Source", TRUE),
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
          p("Tests if response differs between groups.", class="text-muted small"),
          uiOutput("deInteractionGroupUI")
        )
      )
    ),
    card(
      class = "mb-3",
      card_header("4. Significance & Filtering"),
      card_body(
        strong("Statistical Significance Filter"),
        icon("chart-line"),
        numericInput("pFilterThreshold", "Significance Threshold <", value = 0.05, step = 0.01),
        radioButtons("pValueMethod", "P-value Type:",
                     choices = c("Adjusted (BH-FDR)" = "bh", "Raw (uncorrected)" = "raw"),
                     selected = "bh"),
        hr(),
        numericInput("log2fcThreshold", "Absolute log2 Fold Change >=", value = 1, step = 0.1),
        radioButtons("directionFilter", "Direction:",
                     choices = c("Both", "Up-regulated" = "up", "Down-regulated" = "down"),
                     selected = "Both", inline = TRUE)
      )
    ),
    card(
      class = "mb-3",
      card_header("5. Plot Settings"),
      card_body(
        strong("5a. Select Sample Groups to Display"),
        uiOutput("displaySampleSelectorUI"),
        layout_columns(
          col_widths = c(6, 6),
          actionButton("selectAllDisplay", "Select All", icon = icon("check-square"), class = "btn-sm w-100"),
          actionButton("unselectAllDisplay", "Unselect All", icon = icon("square"), class = "btn-sm w-100")
        ),
        hr(),
        strong("5b. Heatmap Settings"),
        radioButtons("heatmapScaleMode", "Scaling:",
                     choices = c("Global Z-score (magnitude)" = "global_zscore",
                                 "Pattern Z-score (row pattern)" = "pattern_zscore",
                                 "Relative Abundance (0-100)" = "relative"),
                     selected = "global_zscore"),
        checkboxInput("fineTuneColors", "Fine Tune Color Palette", value = FALSE),
        conditionalPanel(
          condition = "input.fineTuneColors == true",
          tags$div(
            class = "p-2 border rounded mt-2",
            conditionalPanel(
              condition = "input.heatmapScaleMode == 'global_zscore'",
              p("Diverging Palette (Low-Mid-High):"),
              layout_columns(
                col_widths = c(4, 4, 4),
                colourInput("gz_low_color", NULL, value = "#2166AC"),
                colourInput("gz_mid_color", NULL, value = "#F7F7F7"),
                colourInput("gz_high_color", NULL, value = "#B2182B")
              )
            ),
            conditionalPanel(
              condition = "input.heatmapScaleMode == 'pattern_zscore' || input.heatmapScaleMode == 'relative'",
              p("Sequential Palette (Low-High):"),
              layout_columns(
                col_widths = c(6, 6),
                colourInput("seq_low_color", NULL, value = "#FFFFCC"),
                colourInput("seq_high_color", NULL, value = "#800026")
              )
            )
          )
        ),
        hr(),
        strong("Other Options"),
        radioButtons("numberDisplayMode", "Show Values on Heatmap:",
                     choices = c("None" = "none", "Raw Values" = "raw"),
                     selected = "none"),
        checkboxInput("hideHeatmapRowNames", "Hide lipid names", FALSE),
        checkboxInput("showHeatmapGrid", "Show grid lines", FALSE),
        conditionalPanel(
          condition = "input.showHeatmapGrid == true",
          radioButtons("heatmapGridColor", "Grid Color:",
                       choices = c("Light Grey" = "grey90", "Black" = "black"),
                       selected = "grey90", inline = TRUE)
        )
      ),
      card_body(
        strong("5c. Bar Chart Settings"),
        radioButtons("barGroupMode", "Group By:", choices = c("Hyperclass", "Sub-class"), selected = "Sub-class", inline = TRUE),
        radioButtons("barValueMode", "Value Mode:", choices = c("Absolute (intensity)", "Absolute (%)", "Normalized (intensity)", "Normalized (%)"), selected = "Absolute (intensity)"),
        radioButtons("barOrientation", "Orientation:",
                     choices = c("Samples on X-axis" = "sample_x", "Classes on X-axis" = "class_x"),
                     selected = "sample_x")
      )
    ),
    card(
      class = "mb-3",
      card_header("6. Lipid Class Filtering"),
      card_body(
        strong("Filter by Hyperclass"),
        uiOutput("hyperclassSelectorUI"),
        layout_columns(col_widths=c(6,6), actionButton("selectAllHyper", "All"), actionButton("unselectAllHyper", "None")),
        hr(),
        strong("Filter by Subclass"),
        uiOutput("subclassSelectorUI"),
        layout_columns(col_widths=c(6,6), actionButton("selectAllSub", "All"), actionButton("unselectAllSub", "None")),
        hr(),
        strong("Filter by Modification"),
        uiOutput("modificationSelectorUI"),
        layout_columns(col_widths=c(6,6), actionButton("selectAllMod", "All"), actionButton("unselectAllMod", "None"))
      )
    ),
    card(
      class = "mb-3",
      card_header("7. Advanced Acyl Chain Filtering"),
      card_body(
        strong("Filter by Chain Features (AND logic)"),
        checkboxGroupInput("selectedSaturationFeatures", "Saturation Features:",
                           choices = c("SFA", "MUFA", "PUFA"), inline = TRUE),
        checkboxGroupInput("selectedLengthFeatures", "Length Features:",
                           choices = c("SCFA", "MCFA", "LCFA", "VLCFA"), inline = TRUE)
      )
    ),
    card(
      class = "mb-3",
      card_header("8. Granular Chain Filtering"),
      card_body(
        checkboxInput("activateGranularFiltering", "Activate Granular Chain Filtering", value = FALSE),
        hr(),
        conditionalPanel(
          condition = "input.activateGranularFiltering == true",
          layout_columns(
            col_widths = c(9, 3),
            strong("Combo 1"),
            checkboxInput("useCombo1", "Enable", value = TRUE)
          ),
          conditionalPanel(
            condition = "input.activateGranularFiltering == true && input.useCombo1 == true",
            uiOutput("combo1SlidersUI")
          ),
          hr(),
          layout_columns(
            col_widths = c(9, 3),
            strong("Combo 2"),
            checkboxInput("useCombo2", "Enable", value = FALSE)
          ),
          conditionalPanel(
            condition = "input.activateGranularFiltering == true && input.useCombo2 == true",
            uiOutput("combo2SlidersUI")
          ),
          hr(),
          conditionalPanel(
            condition = "input.activateGranularFiltering == true && (input.useCombo1 == true || input.useCombo2 == true)",
            layout_columns(
              col_widths = c(10, 2),
              radioButtons("granularOrderMode", "Matching Logic:",
                           choices = c("Ignore chain order" = "ignore",
                                       "Respect chain order (position-specific)" = "respect"),
                           selected = "ignore"),
              help_icon("Position-Specific Matching", "Respecting order matches Combo 1 to Chain A and/or Combo 2 to Chain B. Ignoring order matches combos to any available chain.")
            )
          )
        )
      )
    ),
    card(
      class = "mb-3",
      card_header("9. Substrate Filtering"),
      card_body(
        checkboxGroupInput("n6_substrates", "n-6 Pro-Inflammatory Pathway",
                           choices = c("AA (20:4)" = "20:4", "DGLA (20:3)" = "20:3", "AdA (22:4)" = "22:4"),
                           inline = TRUE),
        hr(),
        checkboxGroupInput("n3_substrates", "n-3 Pro-Resolving Pathway",
                           choices = c("EPA (20:5)" = "20:5", "DHA (22:6)" = "22:6", "DPA (22:5)" = "22:5"),
                           inline = TRUE),
        hr(),
        checkboxGroupInput("substrate_match_positions", "Matching Positions:",
                           choices = c("In first position (sn-1)" = "sn1",
                                       "In second position (sn-2)" = "sn2",
                                       "In ANY position (OR)" = "any"),
                           selected = "any",
                           inline = TRUE)
      )
    )
  ),
  # --- Main Content Area ---
  nav_panel(
    title = "Unfiltered Heatmap", icon = icon("table-cells"),
    card(
      class = "plot-card", full_screen = TRUE,
      card_header(textOutput("unfiltered_summary_text")),
      card_body(min_height = "75vh", jqui_resizable(plotOutput("heatmapPlot", height = "100%"))),
      card_footer(
        layout_columns(col_widths = c(-8, 2, 2),
                       downloadButton("downloadHeatmapPDF", "PDF", icon = icon("file-pdf")),
                       downloadButton("downloadHeatmapCSV", "Data", icon = icon("file-csv"))
        )
      )
    )
  ),
  nav_panel(
    title = "Unfiltered Bar Chart", icon = icon("chart-bar"),
    card(
      class = "plot-card", full_screen = TRUE,
      card_body(min_height = "75vh", jqui_resizable(plotOutput("barPlot", height = "100%"))),
      card_footer(
        layout_columns(col_widths = c(-8, 2, 2),
                       downloadButton("downloadBarChartPDF", "PDF", icon = icon("file-pdf")),
                       downloadButton("downloadBarChartCSV", "Data", icon = icon("file-csv"))
        )
      )
    )
  ),
  nav_panel(
    title = "Filtered Heatmap", icon = icon("table-cells", class="text-primary"),
    card(
      class = "plot-card", full_screen = TRUE,
      card_body(min_height = "75vh", jqui_resizable(plotOutput("filteredHeatmapPlot", height = "100%"))),
      card_footer(
        layout_columns(col_widths = c(-8, 2, 2),
                       downloadButton("downloadFilteredHeatmapPDF", "PDF", icon = icon("file-pdf")),
                       downloadButton("downloadFilteredHeatmapCSV", "Data", icon = icon("file-csv"))
        )
      )
    )
  ),
  nav_panel(
    title = "Filtered Bar Chart", icon = icon("chart-bar", class="text-primary"),
    card(
      class = "plot-card", full_screen = TRUE,
      card_body(min_height = "75vh", jqui_resizable(plotOutput("filteredBarPlot", height = "100%"))),
      card_footer(
        layout_columns(col_widths = c(-8, 2, 2),
                       downloadButton("downloadFilteredBarChartPDF", "PDF", icon = icon("file-pdf")),
                       downloadButton("downloadFilteredBarChartCSV", "Data", icon = icon("file-csv"))
        )
      )
    )
  ),
  
  # --- [NEW] About & Citation Panel ---
  nav_panel("About & Citation", icon=icon("info-circle"),
            card(
              card_header(h4("About the Lipidomic Explorer")),
              card_body(
                p("This application was developed to provide an interactive interface for the comprehensive analysis of lipidomics datasets. It streamlines common workflows including data preprocessing, differential expression analysis, and the generation of publication-quality visualizations."),
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


# ====
# --- 4. SERVER LOGIC ---
# ====
server <- function(input, output, session) {
  
  # ============================================================================
  # --- A. DATA LOADING & METADATA ---
  # ============================================================================
  
  rv <- reactiveValues(
    uploads = list(),
    savedAnalysisCols = NULL,
    savedDisplayGroups = NULL
  )
  
  observeEvent(input$analysisSelectedColumns, { rv$savedAnalysisCols <- input$analysisSelectedColumns }, ignoreNULL = FALSE, ignoreInit = TRUE)
  observeEvent(input$displaySelectedGroups, { rv$savedDisplayGroups <- input$displaySelectedGroups }, ignoreNULL = FALSE, ignoreInit = TRUE)
  
  load_and_prep_file <- function(file_path, file_name) {
    req(file_path)
    all_sheets <- tryCatch(
      readxl::excel_sheets(file_path),
      error = function(e) { validate(paste("Error reading sheets from file:", file_name, ":", e$message)); NULL }
    )
    validate(need(!is.null(all_sheets), paste("File is empty or failed to load:", file_name)))
    
    combined_data <- dplyr::bind_rows(lapply(all_sheets, function(sheet) {
      tryCatch({
        df <- readxl::read_excel(path = file_path, sheet = sheet, na = c("N/A", "NA", ""))
        colnames(df)[1] <- "Lipid_Name"
        df
      }, error = function(e) {
        showNotification(paste("Could not read sheet:", sheet, "in file:", file_name), type = "warning", duration = 5)
        return(NULL)
      })
    }))
    
    validate(need(ncol(combined_data) > 1, paste("File is empty or failed to load:", file_name)))
    
    # Check for duplicate lipids within the file, which can happen with multiple sheets
    if (any(duplicated(combined_data$Lipid_Name))) {
      showNotification(paste("Warning:", file_name, "has duplicate lipids. Averaging values for each duplicate lipid."), type="warning", duration=10)
      combined_data <- combined_data %>%
        dplyr::group_by(Lipid_Name) %>%
        dplyr::summarise(dplyr::across(dplyr::where(is.numeric), ~mean(., na.rm=TRUE)), .groups='drop')
    }
    
    return(combined_data)
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
    
    lipid_lists <- purrr::map(loaded_files, ~.x$Lipid_Name)
    common_lipids <- Reduce(intersect, lipid_lists)
    validate(need(length(common_lipids) > 10, paste("Fewer than 10 common lipids found across all files. Found:", length(common_lipids))))
    
    processed_data <- purrr::map(loaded_files, ~ .x %>%
                                   dplyr::filter(Lipid_Name %in% common_lipids) %>%
                                   dplyr::arrange(Lipid_Name) %>%
                                   dplyr::select(-Lipid_Name))
    
    lipid_name_col <- loaded_files[[1]] %>% dplyr::filter(Lipid_Name %in% common_lipids) %>% dplyr::arrange(Lipid_Name) %>% dplyr::select(Lipid_Name)
    
    merged_data <- dplyr::bind_cols(lipid_name_col, !!!processed_data)
    
    numeric_cols <- setdiff(names(merged_data), "Lipid_Name")
    merged_data_filtered <- merged_data %>%
      dplyr::filter(rowSums(is.na(dplyr::across(dplyr::all_of(numeric_cols)))) < length(numeric_cols))
    
    validate(need(nrow(merged_data_filtered) > 0, "Data is empty after removing all-NA rows. Please check the input file."))
    
    merged_data_filtered %>%
      dplyr::mutate(dplyr::across(-Lipid_Name, as.numeric)) %>%
      dplyr::mutate(Lipid_Name = make.unique(as.character(Lipid_Name)))
  })
  
  getAllNumericColumns <- reactive({
    df <- rawData(); req(df)
    setdiff(names(df), "Lipid_Name")
  })
  
  getDataColumns <- reactive({
    allCols <- getAllNumericColumns(); req(length(allCols) > 0)
    meta <- do.call(rbind, lapply(allCols, function(c) as.data.frame(parse_col_info_v2(c))))
    
    meta$Condition <- factor(meta$Condition, levels = unique(meta$Condition))
    meta$Group <- factor(meta$Group, levels = unique(meta$Group))
    
    if ("Tissue" %in% colnames(meta)) {
      if(all(is.na(meta$Tissue))) {
        meta$Tissue <- factor(meta$Tissue, levels=c())
      } else {
        meta$Tissue <- factor(meta$Tissue, levels = unique(meta$Tissue))
      }
    }
    meta
  })
  
  # ============================================================================
  # --- B. DATA PROCESSING PIPELINE ---
  # ============================================================================
  
  lipidsPassingFilter <- reactive({
    req(rawData())
    rawData()$Lipid_Name
  })
  
  matrix_filtered <- reactive({
    mat_raw <- rawData()
    lipids_to_process <- lipidsPassingFilter()
    validate(need(length(lipids_to_process) > 0, "No lipids to process."))
    mat_raw_filtered <- mat_raw %>% dplyr::filter(Lipid_Name %in% lipids_to_process)
    mat_raw_filtered %>% tibble::column_to_rownames("Lipid_Name") %>% dplyr::select(dplyr::all_of(getAllNumericColumns())) %>% as.matrix()
  })
  
  processed_matrix_log2 <- reactive({
    mat_filtered <- matrix_filtered()
    
    if (input$normalizationMethod == "pqn") {
      if (isTRUE(input$useImputation)) {
        if(sum(is.na(mat_filtered) | mat_filtered <= 0) > 0) {
          mat_for_log <- mat_filtered; mat_for_log[mat_for_log <= 0] <- NA
          mat_log_pre_impute <- log2(mat_for_log)
          set.seed(123)
          mat_log_imputed <- tryCatch(imputeLCMD::impute.QRILC(mat_log_pre_impute)[[1]], error = function(e) {
            showNotification("Imputation failed.", type="error"); mat_log_pre_impute
          })
          mat_linear_imputed <- 2^mat_log_imputed
        } else {
          mat_linear_imputed <- mat_filtered
        }
      } else {
        mat_linear_imputed <- mat_filtered
      }
      mat_normalized_linear <- normalize_pqn_linear(mat_linear_imputed)
      final_log2_matrix <- log2(mat_normalized_linear)
    } else {
      mat_for_log <- mat_filtered; mat_for_log[mat_for_log <= 0] <- NA
      mat_log <- log2(mat_for_log)
      if (isTRUE(input$useImputation)) {
        if(sum(is.na(mat_log)) > 0) {
          set.seed(123)
          mat_log_imputed <- tryCatch(imputeLCMD::impute.QRILC(mat_log)[[1]], error = function(e) {
            showNotification("Imputation failed.", type="error"); mat_log
          })
        } else {
          mat_log_imputed <- mat_log
        }
      } else {
        mat_log_imputed <- mat_log
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
  
  processed_matrix_linear <- reactive({
    2^processed_matrix_log2()
  })
  
  # ============================================================================
  # --- C. DATA SELECTION & AGGREGATION ---
  # ============================================================================
  
  replicateMatrixData <- reactive({
    processed_mat <- processed_matrix_linear()
    req(processed_mat)
    data_df <- as.data.frame(processed_mat)
    checkedCols <- input$analysisSelectedColumns %||% character(0)
    
    if (!isTRUE(input$useAveragedSubstitution)) {
      validate(need(length(checkedCols) >= 2, "Please select at least two samples for analysis."))
      cols_to_use <- intersect(checkedCols, colnames(data_df))
      return(as.matrix(data_df[, cols_to_use, drop = FALSE]))
    }
    
    mat_modified <- data_df
    meta <- getDataColumns()
    group_defs <- meta %>% dplyr::group_by(Group) %>% dplyr::summarize(groupCols = list(OriginalName), .groups = "drop")
    final_col_names <- checkedCols
    
    for (i in seq_len(nrow(group_defs))) {
      theseCols <- group_defs$groupCols[[i]]
      c_checked <- intersect(theseCols, checkedCols)
      c_unchecked <- setdiff(theseCols, c_checked)
      
      if (length(c_checked) >= 2 && length(c_unchecked) > 0) {
        subVals <- rowMeans(data_df[, c_checked, drop = FALSE], na.rm = TRUE)
        for (uc in c_unchecked) {
          if (uc %in% colnames(mat_modified)) mat_modified[[uc]] <- subVals
        }
        final_col_names <- c(final_col_names, c_unchecked)
      }
    }
    
    validate(need(length(final_col_names) >= 2, "Please select >=2 samples (or a group with >=2 checked samples for averaging)."))
    final_cols_ordered <- intersect(names(data_df), unique(final_col_names))
    as.matrix(mat_modified[, final_cols_ordered, drop = FALSE])
  })
  
  aggregatedMatrixData <- reactive({
    repMat <- replicateMatrixData(); req(ncol(repMat) > 0)
    meta <- getDataColumns() %>% dplyr::filter(OriginalName %in% colnames(repMat))
    group_factor <- factor(meta$Group, levels = unique(as.character(meta$Group)))
    split.data.frame(t(repMat), group_factor) %>%
      lapply(function(sub_matrix) colMeans(sub_matrix, na.rm = TRUE)) %>%
      do.call(cbind, .) %>% `rownames<-`(rownames(repMat))
  })
  
  # ============================================================================
  # --- D. STATISTICAL ANALYSIS (LIMMA) ---
  # ============================================================================
  
  allLipidDEResults <- reactive({
    mat_log2_full <- processed_matrix_log2()
    selected_cols <- input$analysisSelectedColumns %||% character(0)
    cols_to_use <- intersect(selected_cols, colnames(mat_log2_full))
    validate(need(length(cols_to_use) > 1, "Not enough samples selected for DE analysis."))
    
    mat <- mat_log2_full[, cols_to_use, drop=FALSE]
    validate(need(nrow(mat) > 0 && ncol(mat) > 1, "Not enough data for DE."))
    
    metaDF <- getDataColumns() %>% dplyr::filter(OriginalName %in% colnames(mat))
    
    # Create the dynamic grouping factor based on checkbox selections
    grouping_vars <- c()
    if (isTRUE(input$deOrientCondition)) grouping_vars <- c(grouping_vars, "Condition")
    if (isTRUE(input$deOrientTissue) && "Tissue" %in% names(metaDF)) grouping_vars <- c(grouping_vars, "Tissue")
    
    if (length(grouping_vars) > 0) {
      metaDF$Dynamic_DE_Group <- apply(metaDF[, grouping_vars, drop = FALSE], 1, paste, collapse = "_")
    } else {
      metaDF$Dynamic_DE_Group <- "All_Samples"
    }
    metaDF$Dynamic_DE_Group <- factor(metaDF$Dynamic_DE_Group)
    
    validate(need(nlevels(metaDF$Dynamic_DE_Group) >= 2, "DE analysis requires at least 2 groups based on current 'Define Groups by' settings."))
    
    design <- stats::model.matrix(~0 + Dynamic_DE_Group, data = metaDF)
    colnames(design) <- make.names(levels(metaDF$Dynamic_DE_Group))
    
    # Translate the user's full-name selections into the current dynamic group names
    translate_selection <- function(full_names) {
      metaDF %>%
        dplyr::filter(Group %in% full_names) %>%
        dplyr::pull(Dynamic_DE_Group) %>%
        unique() %>%
        as.character()
    }
    
    if (input$deComparisonMode == "direct") {
      req(input$deReferenceGroups, input$deComparisonGroups)
      ref_dynamic <- make.names(translate_selection(input$deReferenceGroups))
      comp_dynamic <- make.names(translate_selection(input$deComparisonGroups))
      
      validate(
        need(length(ref_dynamic) > 0 && length(comp_dynamic) > 0, "Reference and Comparison groups must be selected."),
        need(length(intersect(ref_dynamic, comp_dynamic)) == 0, "Reference and Comparison groups cannot overlap under the current 'Define Groups by' settings.")
      )
      
      validate(need(all(c(ref_dynamic, comp_dynamic) %in% colnames(design)), "Selected groups not found in the current model design. Check your 'Define Groups by' settings."))
      
      ref_avg_str <- paste("(", paste(ref_dynamic, collapse="+"), ")/", length(ref_dynamic), sep="")
      comp_avg_str <- paste("(", paste(comp_dynamic, collapse="+"), ")/", length(comp_dynamic), sep="")
      contrast_str <- paste(comp_avg_str, "-", ref_avg_str)
      
    } else { # Interaction mode
      req(input$int_ref_t1, input$int_ref_t2, input$int_comp_t1, input$int_comp_t2)
      g_ref1 <- make.names(translate_selection(input$int_ref_t1))
      g_ref2 <- make.names(translate_selection(input$int_ref_t2))
      g_comp1 <- make.names(translate_selection(input$int_comp_t1))
      g_comp2 <- make.names(translate_selection(input$int_comp_t2))
      
      validate(
        need(length(unique(c(g_ref1, g_ref2, g_comp1, g_comp2))) == 4, "Interaction terms must resolve to 4 unique groups under the current 'Define Groups by' settings."),
        need(all(c(g_ref1, g_ref2, g_comp1, g_comp2) %in% colnames(design)), "Interaction groups not found in the current model design.")
      )
      
      contrast_str <- paste("(", g_comp2, "-", g_comp1, ") - (", g_ref2, "-", g_ref1, ")")
    }
    
    contrast_matrix <- limma::makeContrasts(contrasts = contrast_str, levels = design)
    fit <- tryCatch(limma::lmFit(mat, design), error = function(e) validate(need(FALSE, e$message)))
    fit2 <- limma::contrasts.fit(fit, contrast_matrix)
    eb_fit <- limma::eBayes(fit2, robust = TRUE)
    
    limma::topTable(eb_fit, coef=1, number=Inf, sort.by="none") %>%
      tibble::rownames_to_column("Lipid_Name") %>%
      dplyr::rename(p_adj_bh = adj.P.Val, p_raw = P.Value, log2FC = logFC, t_stat = t)
  })
  
  significantLipids <- reactive({
    der <- allLipidDEResults()
    req(der)
    p_col_to_use <- switch(input$pValueMethod, "bh" = "p_adj_bh", "raw" = "p_raw")
    
    filtered_der <- der %>%
      dplyr::filter(!is.na(.data[[p_col_to_use]]), !is.na(log2FC),
                    .data[[p_col_to_use]] < input$pFilterThreshold,
                    abs(log2FC) >= input$log2fcThreshold)
    
    if (input$directionFilter == "up") {
      filtered_der <- dplyr::filter(filtered_der, log2FC > 0)
    } else if (input$directionFilter == "down") {
      filtered_der <- dplyr::filter(filtered_der, log2FC < 0)
    }
    
    filtered_der$Lipid_Name
  })
  
  # ============================================================================
  # --- E. ANNOTATION & VISUALIZATION ---
  # ============================================================================
  
  annotationData <- reactive({
    df <- rawData(); req(df, "Lipid_Name" %in% colnames(df))
    dplyr::bind_rows(lapply(df$Lipid_Name, parse_lipid_name_v2))
  })
  
  class_first_sort <- function(full_anno_df, mat_in, sort_cols = c("lipid_class", "Total_Carbons", "Total_DB")) {
    if (!nrow(mat_in) || !ncol(mat_in)) {
      return(list(mat_ordered = mat_in, anno_ordered = full_anno_df, final_order = integer(0)))
    }
    anno_to_sort <- full_anno_df[match(rownames(mat_in), full_anno_df$Lipid_Name), , drop=FALSE]
    anno_to_sort$original_index <- seq_len(nrow(anno_to_sort))
    
    sort_df <- anno_to_sort
    for (col_name in sort_cols) {
      if (is.numeric(sort_df[[col_name]])) {
        sort_df[[col_name]][is.na(sort_df[[col_name]])] <- Inf
      } else {
        sort_df[[col_name]] <- as.character(sort_df[[col_name]]); sort_df[[col_name]][is.na(sort_df[[col_name]])] <- ""
      }
    }
    final_order_df <- sort_df %>% dplyr::arrange(dplyr::across(dplyr::all_of(sort_cols)))
    final_order <- final_order_df$original_index
    
    list(mat_ordered = mat_in[final_order, , drop = FALSE], anno_ordered = anno_to_sort[final_order, , drop = FALSE], final_order = final_order)
  }
  
  staircase_sort <- function(full_anno_df, mat_in, secondary_sort_mode = "grey", sort_cols = c("lipid_class", "Total_Carbons", "Total_DB")) {
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
        sort_df <- data.frame(original_index = sub_idx)
        real_cols <- intersect(sort_cols, names(sub_anno))
        for (col_name in real_cols) {
          sort_df[[col_name]] <- sub_anno[[col_name]]
          if (is.numeric(sort_df[[col_name]])) {
            sort_df[[col_name]][is.na(sort_df[[col_name]])] <- Inf
          } else {
            sort_df[[col_name]] <- as.character(sort_df[[col_name]])
            sort_df[[col_name]][is.na(sort_df[[col_name]])] <- ""
          }
        }
        final_order_df <- sort_df %>% dplyr::arrange(dplyr::across(dplyr::all_of(real_cols)))
        return(final_order_df$original_index)
      } else { # "grey" mode - sort by value in the max column
        if (current_level == "NoMax" || !(current_level %in% colnames(mat_in))) {
          return(sub_idx) # Don't sort if no max value
        }
        sub_mat_values <- mat_in[sub_idx, current_level]
        sorted_indices <- order(sub_mat_values, decreasing = TRUE, na.last = TRUE)
        return(sub_idx[sorted_indices])
      }
    }
    
    final_order <- integer(0)
    all_levels <- c(colnames(mat_in), "NoMax")
    for (lv in all_levels) {
      if (lv %in% names(group_idxs)) {
        sb <- group_idxs[[lv]]
        if (length(sb)) final_order <- c(final_order, sort_within_group(sb, lv))
      }
    }
    list(mat_ordered = mat_in[final_order, , drop = FALSE], anno_ordered = anno_for_sorting[final_order, , drop = FALSE], final_order = final_order)
  }
  
  scale_row_richer <- function(vals, max_range = 100) {
    out <- rep(NA_real_, length(vals)); idx_to_scale <- which(!is.na(vals))
    if (length(idx_to_scale) == 0) return(out)
    vals_to_scale <- vals[idx_to_scale]; min_val <- min(vals_to_scale); max_val <- max(vals_to_scale)
    range_val <- max_val - min_val
    if (range_val > 1e-6) out[idx_to_scale] <- ((vals_to_scale - min_val) / range_val) * max_range
    else out[idx_to_scale] <- max_range / 2
    out
  }
  
  generateHeatmapObject <- function(mat, title, intensity_mat, mat_for_sorting = NULL, sort_mode = "grey", display_mat = NULL) {
    validate(need(is.matrix(mat) && nrow(mat) > 0 && ncol(mat) > 0, "Not enough data for heatmap."))
    sorting_matrix <- if (!is.null(mat_for_sorting)) mat_for_sorting else mat
    anno_full <- annotationData()
    
    sres <- if (sort_mode == "class_first") class_first_sort(anno_full, sorting_matrix) else staircase_sort(anno_full, sorting_matrix, secondary_sort_mode = sort_mode)
    mat_ord <- mat[rownames(sres$mat_ordered), , drop = FALSE]
    validate(need(nrow(mat_ord) > 0, "No data left after sorting."))
    
    display_matrix <- FALSE
    if (!is.null(display_mat) && input$numberDisplayMode == "raw") {
      display_mat_ord <- display_mat[rownames(mat_ord), colnames(mat_ord), drop = FALSE]
      display_matrix <- matrix(sprintf("%.0f", display_mat_ord), nrow = nrow(display_mat_ord))
    }
    
    pheatmap_args <- list(); scale_mode <- input$heatmapScaleMode; is_diverging <- scale_mode == 'global_zscore'
    if (isTRUE(input$fineTuneColors)) {
      palette_generator <- if (is_diverging) {
        req(input$gz_low_color, input$gz_mid_color, input$gz_high_color); colorRampPalette(c(input$gz_low_color, input$gz_mid_color, input$gz_high_color))
      } else {
        req(input$seq_low_color, input$seq_high_color); colorRampPalette(c(input$seq_low_color, input$seq_high_color))
      }
    } else {
      palette_generator <- if (is_diverging) colorRampPalette(rev(RColorBrewer::brewer.pal(n=7, name="RdBu"))) else colorRampPalette(RColorBrewer::brewer.pal(n=9, name="YlOrRd"))
    }
    pheatmap_args$color <- palette_generator(100)
    font_color_matrix <- matrix("black", nrow = nrow(mat_ord), ncol = ncol(mat_ord))
    
    if (is_diverging) {
      mat_for_color <- log2(mat_ord); mat_for_color[!is.finite(mat_for_color)] <- NA
      matrix_to_plot <- t(scale(t(mat_for_color))); matrix_to_plot[is.nan(matrix_to_plot) | is.na(matrix_to_plot)] <- 0
      palette_limit <- max(1, ceiling(max(abs(matrix_to_plot), na.rm = TRUE)))
      font_color_matrix[abs(matrix_to_plot) > (0.6 * palette_limit)] <- "white"
      pheatmap_args$breaks <- seq(-palette_limit, palette_limit, length.out = 101)
      pheatmap_args$legend_breaks <- round(seq(-palette_limit, palette_limit, length.out=5)); pheatmap_args$legend_labels <- as.character(pheatmap_args$legend_breaks)
    } else {
      matrix_to_plot <- if(scale_mode == "pattern_zscore") {
        mat_zscores <- t(scale(t(log2(mat_ord)))); mat_zscores[is.nan(mat_zscores) | is.na(mat_zscores)] <- 0
        t(apply(mat_zscores, 1, scale_row_richer, max_range=100))
      } else {
        t(apply(mat_ord, 1, scale_row_richer, max_range = 100))
      }
      dimnames(matrix_to_plot) <- dimnames(mat_ord); font_color_matrix[matrix_to_plot > 60 & !is.na(matrix_to_plot)] <- "white"
      pheatmap_args$breaks <- seq(0, 100, length.out = 101); pheatmap_args$legend_breaks <- seq(0, 100, by=25); pheatmap_args$legend_labels <- c("0", "25", "50", "75", "100")
    }
    
    pheatmap_args$na_col <- "grey80"
    anno_ord <- anno_full[match(rownames(mat_ord), anno_full$Lipid_Name), , drop=FALSE]
    row_ann_df <- data.frame(Class = anno_ord$lipid_class, row.names = rownames(mat_ord))
    
    col_ann_df <- NA; ann_colors <- list(Class = CLASS_MAP_COLORS)
    if (isTRUE(input$activateCellAnnotation)) {
      cell_map <- cellAnnotationMapping()
      if (grepl("aggregate", input$repMode)) {
        col_meta <- tibble::tibble(Group = colnames(mat_ord)) %>% dplyr::left_join(cell_map, by = "Group")
        col_ann_df <- col_meta %>% dplyr::select(Group, CellType) %>% dplyr::rename(Cell = CellType) %>% dplyr::distinct() %>% tibble::column_to_rownames("Group")
      } else {
        col_meta <- getDataColumns() %>% dplyr::filter(OriginalName %in% colnames(mat_ord)) %>% dplyr::left_join(cell_map, by = "Group")
        col_ann_df <- col_meta %>% dplyr::select(OriginalName, CellType) %>% dplyr::rename(Cell = CellType) %>% dplyr::distinct() %>% tibble::column_to_rownames("OriginalName")
      }
      ann_colors$Cell <- cell_map %>% dplyr::select(CellType, CellColor) %>% dplyr::distinct() %>% { setNames(.$CellColor, .$CellType) }
    }
    
    common_args <- list(mat = matrix_to_plot, scale = "none", cluster_rows = FALSE, cluster_cols = FALSE, border_color = if (isTRUE(input$showHeatmapGrid)) input$heatmapGridColor else NA, show_rownames = !input$hideHeatmapRowNames, main = title, fontsize_row = 8, annotation_row = row_ann_df, annotation_col = col_ann_df, annotation_colors = ann_colors, display_numbers = display_matrix, fontsize_number = 8, number_color = font_color_matrix, silent = TRUE)
    ht <- do.call(pheatmap::pheatmap, c(pheatmap_args, common_args))
    
    if (length(which(ht$gtable$layout$name == "main")) > 0) {
      ht$gtable$grobs[[which(ht$gtable$layout$name == "main")]]$x <- grid::unit(0.01, "npc"); ht$gtable$grobs[[which(ht$gtable$layout$name == "main")]]$hjust <- 0
    }
    
    list(ht = ht, data = mat_ord)
  }
  
  # ============================================================================
  # --- F. UI HANDLERS & FILTERS ---
  # ============================================================================
  
  output$analysisSampleSelectorUI <- renderUI({
    req(rv$uploads); cols <- getAllNumericColumns(); req(length(cols) > 0)
    
    saved <- isolate(rv$savedAnalysisCols)
    selected <- if (is.null(saved)) cols else intersect(saved, cols)
    
    checkboxGroupInput("analysisSelectedColumns", NULL, choices = cols, selected = selected)
  })
  observeEvent(input$selectAllAnalysis, { updateCheckboxGroupInput(session, "analysisSelectedColumns", selected = getAllNumericColumns()) })
  observeEvent(input$unselectAllAnalysis, { updateCheckboxGroupInput(session, "analysisSelectedColumns", selected = character(0)) })
  
  get_display_group_choices <- reactive({
    req(replicateMatrixData())
    meta <- getDataColumns() %>% dplyr::filter(OriginalName %in% colnames(replicateMatrixData()))
    levels(meta$Group)
  })
  
  output$displaySampleSelectorUI <- renderUI({
    choices <- get_display_group_choices()
    validate(need(length(choices) > 0, "No sample groups available for display."))
    
    saved <- isolate(rv$savedDisplayGroups)
    selected <- if (is.null(saved)) choices else intersect(saved, choices)
    
    checkboxGroupInput("displaySelectedGroups", NULL, choices = choices, selected = selected)
  })
  
  observeEvent(input$selectAllDisplay, {
    updateCheckboxGroupInput(session, "displaySelectedGroups", selected = get_display_group_choices())
  })
  observeEvent(input$unselectAllDisplay, {
    updateCheckboxGroupInput(session, "displaySelectedGroups", selected = character(0))
  })
  
  output$cellAnnotationUI <- renderUI({
    meta <- getDataColumns(); req(meta); unique_groups <- levels(meta$Group)
    validate(need(length(unique_groups) > 0, "No sample groups found to annotate."))
    default_colors <- viridisLite::viridis(length(unique_groups), alpha = 0.9)
    lapply(seq_along(unique_groups), function(i) {
      group_name <- unique_groups[i]; safe_group_name <- gsub("[^A-Za-z0-9_]", "", group_name)
      layout_columns(col_widths = c(8, 4), textInput(inputId = paste0("cell_name_", safe_group_name), label = shiny::strong(group_name), value = group_name), colourpicker::colourInput(inputId = paste0("cell_color_", safe_group_name), label = NULL, value = default_colors[i]))
    })
  })
  cellAnnotationMapping <- reactive({
    meta <- getDataColumns(); req(meta, input$activateCellAnnotation); unique_groups <- levels(meta$Group)
    req(input[[paste0("cell_color_", gsub("[^A-Za-z0-9_]", "", unique_groups[1]))]])
    purrr::map_dfr(unique_groups, function(group_name) {
      safe_group_name <- gsub("[^A-Za-z0-9_]", "", group_name)
      tibble::tibble(Group = group_name, CellType = input[[paste0("cell_name_", safe_group_name)]] %||% group_name, CellColor = input[[paste0("cell_color_", safe_group_name)]] %||% "#808080")
    })
  })
  
  getDEGroupChoices <- reactive({
    req(input$analysisSelectedColumns)
    metaDF <- getDataColumns()
    metaDF %>%
      dplyr::filter(OriginalName %in% input$analysisSelectedColumns) %>%
      dplyr::pull(Group) %>%
      unique() %>%
      as.character()
  })
  
  output$deReferenceGroupUI <- renderUI({
    selectInput("deReferenceGroups", "Reference (Control) Group(s):", choices = getDEGroupChoices(), selected = shiny::isolate(input$deReferenceGroups), multiple = TRUE)
  })
  output$deComparisonGroupUI <- renderUI({
    selectInput("deComparisonGroups", "Comparison (Treatment) Group(s):", choices = character(0), selected = shiny::isolate(input$deComparisonGroups), multiple = TRUE)
  })
  
  observe({
    all_choices <- getDEGroupChoices()
    ref_choices <- input$deReferenceGroups %||% character(0)
    comp_choices <- setdiff(all_choices, ref_choices)
    current_sel <- shiny::isolate(input$deComparisonGroups)
    valid_sel <- intersect(current_sel, comp_choices)
    updateSelectInput(session, "deComparisonGroups", choices = comp_choices, selected = valid_sel)
  })
  
  output$deInteractionGroupUI <- renderUI({
    choices <- getDEGroupChoices()
    validate(need(length(choices) >= 4, "Interaction analysis requires at least 4 groups."))
    tagList(
      fluidRow(
        column(6, selectInput("int_ref_t1", "Ref Pre-Tx", choices = choices, selected=shiny::isolate(input$int_ref_t1) %||% choices[1])),
        column(6, selectInput("int_ref_t2", "Ref Post-Tx", choices = choices, selected=shiny::isolate(input$int_ref_t2) %||% choices[2]))
      ),
      fluidRow(
        column(6, selectInput("int_comp_t1", "Comp Pre-Tx", choices = choices, selected=shiny::isolate(input$int_comp_t1) %||% choices[3])),
        column(6, selectInput("int_comp_t2", "Comp Post-Tx", choices = choices, selected=shiny::isolate(input$int_comp_t2) %||% choices[4]))
      )
    )
  })
  
  get_class_choices <- reactive({
    anno <- annotationData(); req(anno); list(hyper = sort(unique(anno$hyperclass)), sub = sort(unique(anno$lipid_class)), mod = sort(unique(anno$modification)))
  })
  output$hyperclassSelectorUI <- renderUI({ choices <- get_class_choices()$hyper; checkboxGroupInput("selectedHyperclasses", NULL, choices = choices, selected = choices, inline = TRUE) })
  output$subclassSelectorUI <- renderUI({ choices <- get_class_choices()$sub; checkboxGroupInput("selectedSubclasses", NULL, choices = choices, selected = choices, inline = TRUE) })
  output$modificationSelectorUI <- renderUI({ choices <- get_class_choices()$mod; checkboxGroupInput("selectedModifications", NULL, choices = choices, selected = choices, inline = TRUE) })
  observeEvent(input$selectAllHyper, { updateCheckboxGroupInput(session, "selectedHyperclasses", selected = get_class_choices()$hyper) })
  observeEvent(input$unselectAllHyper, { updateCheckboxGroupInput(session, "selectedHyperclasses", selected = character(0)) })
  observeEvent(input$selectAllSub, { updateCheckboxGroupInput(session, "selectedSubclasses", selected = get_class_choices()$sub) })
  observeEvent(input$unselectAllSub, { updateCheckboxGroupInput(session, "selectedSubclasses", selected = character(0)) })
  observeEvent(input$selectAllMod, { updateCheckboxGroupInput(session, "selectedModifications", selected = get_class_choices()$mod) })
  observeEvent(input$unselectAllMod, { updateCheckboxGroupInput(session, "selectedModifications", selected = character(0)) })
  
  lipids_to_show_by_class <- reactive({
    anno <- annotationData(); req(anno, input$selectedHyperclasses, input$selectedSubclasses, input$selectedModifications)
    anno %>% dplyr::filter(hyperclass %in% input$selectedHyperclasses, lipid_class %in% input$selectedSubclasses, modification %in% input$selectedModifications) %>% dplyr::pull(Lipid_Name)
  })
  
  lipids_to_show_by_advanced_filters <- reactive({
    anno_data <- annotationData()
    if (!is.null(input$selectedSaturationFeatures)) {
      for (feature in input$selectedSaturationFeatures) {
        anno_data <- anno_data %>% dplyr::filter(.data[[paste0("Has_", feature)]] == TRUE)
      }
    }
    if (!is.null(input$selectedLengthFeatures)) {
      for (feature in input$selectedLengthFeatures) {
        anno_data <- anno_data %>% dplyr::filter(.data[[paste0("Has_", feature)]] == TRUE)
      }
    }
    anno_data$Lipid_Name
  })
  
  get_chain_ranges <- reactive({
    anno <- annotationData(); req(anno)
    all_nC <- c(anno$nCchain1, anno$nCchain2)
    all_DB <- c(anno$DBchain1, anno$DBchain2)
    min_C <- min(all_nC, na.rm = TRUE); max_C <- max(all_nC, na.rm = TRUE)
    min_DB <- min(all_DB, na.rm = TRUE); max_DB <- max(all_DB, na.rm = TRUE)
    if(!is.finite(min_C) || !is.finite(max_C) || !is.finite(min_DB) || !is.finite(max_DB)) return(NULL)
    list(min_C=min_C, max_C=max_C, min_DB=min_DB, max_DB=max_DB)
  })
  
  output$combo1SlidersUI <- renderUI({
    ranges <- get_chain_ranges(); req(ranges)
    tagList(
      sliderInput("granular_nC1_range", "Chain Length Range:", min=ranges$min_C, max=ranges$max_C, value=c(ranges$min_C, ranges$max_C)),
      sliderInput("granular_DB1_range", "Double Bond Range:", min=ranges$min_DB, max=ranges$max_DB, value=c(ranges$min_DB, ranges$max_DB), step=1)
    )
  })
  
  output$combo2SlidersUI <- renderUI({
    ranges <- get_chain_ranges(); req(ranges)
    tagList(
      sliderInput("granular_nC2_range", "Chain Length Range:", min=ranges$min_C, max=ranges$max_C, value=c(ranges$min_C, ranges$max_C)),
      sliderInput("granular_DB2_range", "Double Bond Range:", min=ranges$min_DB, max=ranges$max_DB, value=c(ranges$min_DB, ranges$max_DB), step=1)
    )
  })
  
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
      if (input$granularOrderMode == "respect") {
        cond1A & cond2B
      } else {
        (cond1A & cond2B) | (cond2A & cond1B)
      }
    } else if (isTRUE(input$useCombo1)) {
      if (input$granularOrderMode == "respect") {
        cond1A
      } else {
        cond1A | cond1B
      }
    } else if (isTRUE(input$useCombo2)) {
      if (input$granularOrderMode == "respect") {
        cond2B
      } else {
        cond2A | cond2B
      }
    } else {
      rep(TRUE, nrow(anno_data))
    }
    
    anno_data$Lipid_Name[passing_indices]
  })
  
  lipids_to_show_by_substrate_filter <- reactive({
    anno_data <- annotationData()
    selected_substrates <- c(input$n6_substrates, input$n3_substrates)
    
    if (length(selected_substrates) == 0) {
      return(anno_data$Lipid_Name)
    }
    
    anno_data <- anno_data %>%
      dplyr::mutate(chain1_str = dplyr::if_else(!is.na(nCchain1), paste(nCchain1, DBchain1, sep = ":"), NA_character_),
                    chain2_str = dplyr::if_else(!is.na(nCchain2), paste(nCchain2, DBchain2, sep = ":"), NA_character_))
    
    positions <- input$substrate_match_positions
    
    if ("any" %in% positions || length(positions) == 0) {
      anno_data <- anno_data %>% dplyr::filter(chain1_str %in% selected_substrates | chain2_str %in% selected_substrates)
    } else if (length(positions) == 2) {
      # Symmetrical AND: find lipids where (c1 is AA and c2 is AA) OR (c1 is EPA and c2 is EPA), etc.
      filter_condition <- paste(
        sprintf("(chain1_str == '%s' & chain2_str == '%s')", selected_substrates, selected_substrates),
        collapse = " | "
      )
      anno_data <- anno_data %>% dplyr::filter(eval(parse(text = filter_condition)))
    } else if ("sn1" %in% positions) {
      anno_data <- anno_data %>% dplyr::filter(chain1_str %in% selected_substrates)
    } else if ("sn2" %in% positions) {
      anno_data <- anno_data %>% dplyr::filter(chain2_str %in% selected_substrates)
    }
    
    return(anno_data$Lipid_Name)
  })
  
  final_lipids_to_show <- reactive({
    class_filtered <- lipids_to_show_by_class()
    advanced_filtered <- lipids_to_show_by_advanced_filters()
    granular_filtered <- lipids_to_show_by_granular_filter()
    substrate_filtered <- lipids_to_show_by_substrate_filter()
    
    tmp1 <- intersect(class_filtered, advanced_filtered)
    tmp2 <- intersect(granular_filtered, substrate_filtered)
    intersect(tmp1, tmp2)
  })
  
  
  # ============================================================================
  # --- G. PLOT GENERATION & OUTPUTS ---
  # ============================================================================
  
  get_display_replicates <- reactive({
    req(input$displaySelectedGroups, replicateMatrixData())
    meta <- getDataColumns()
    selected_replicates <- meta %>%
      dplyr::filter(Group %in% input$displaySelectedGroups) %>%
      dplyr::pull(OriginalName)
    intersect(as.character(selected_replicates), colnames(replicateMatrixData()))
  })
  
  get_filter_subtitle <- reactive({
    req(rv$uploads, allLipidDEResults())
    p_method_label <- switch(input$pValueMethod, "bh" = "FDR", "raw" = "p-value")
    filter_part1 <- sprintf("%s < %.2g, |log2FC| >= %.2f", p_method_label, input$pFilterThreshold, input$log2fcThreshold)
    
    comparison_part <- if (input$deComparisonMode == 'direct') {
      req(input$deReferenceGroups, input$deComparisonGroups); sprintf("\n [%s] vs. [%s]", paste(input$deComparisonGroups, collapse=", "), paste(input$deReferenceGroups, collapse=", "))
    } else {
      req(input$int_ref_t1, input$int_ref_t2, input$int_comp_t1, input$int_comp_t2); sprintf("\nInteraction: (%s - %s) vs (%s - %s)", input$int_comp_t2, input$int_comp_t1, input$int_ref_t2, input$int_ref_t1)
    }
    paste0(filter_part1, comparison_part, sprintf("\nMethod: %s", toupper(input$deMethod)))
  })
  
  get_heatmap_display_matrix <- reactive({
    mode <- input$numberDisplayMode; is_agg <- grepl("aggregate", input$repMode)
    if (mode == "none") NULL else if (mode == "raw") if (is_agg) aggregatedMatrixData() else replicateMatrixData() else NULL
  })
  
  unfilteredHeatmapObj <- reactive({
    req(rv$uploads); mode <- input$repMode; is_agg <- grepl("aggregate", mode)
    full_mat <- if (is_agg) aggregatedMatrixData() else replicateMatrixData()
    lipids_to_show <- final_lipids_to_show()
    full_mat_filtered <- full_mat[rownames(full_mat) %in% lipids_to_show, , drop = FALSE]
    
    mat_display <- if(is_agg){
      display_groups <- input$displaySelectedGroups %||% colnames(full_mat_filtered)
      full_mat_filtered[, colnames(full_mat_filtered) %in% display_groups, drop = FALSE]
    } else {
      display_replicates <- get_display_replicates()
      full_mat_filtered[, colnames(full_mat_filtered) %in% display_replicates, drop = FALSE]
    }
    validate(need(nrow(mat_display) > 0 && ncol(mat_display) > 0, "No lipids to display based on current filters."))
    
    intensity_matrix <- if (is_agg) aggregatedMatrixData() else replicateMatrixData()
    
    mat_sort <- if(grepl("fixed|cluster_class", mode)) {
      agg_data_filtered <- aggregatedMatrixData()[rownames(aggregatedMatrixData()) %in% rownames(mat_display), , drop = FALSE]
      groups_to_display <- input$displaySelectedGroups %||% colnames(agg_data_filtered)
      agg_data_filtered[, colnames(agg_data_filtered) %in% groups_to_display, drop = FALSE]
    } else {
      NULL
    }
    
    sort_mode_internal <- "class"
    
    title <- paste("Unfiltered Heatmap (", gsub("_", " ", mode), ")")
    generateHeatmapObject(mat_display, title, intensity_matrix, mat_sort, sort_mode_internal, get_heatmap_display_matrix())
  })
  
  filteredHeatmapObj <- reactive({
    req(rv$uploads); mode <- input$repMode; is_agg <- grepl("aggregate", mode)
    sig_lipids <- significantLipids()
    class_and_adv_lipids <- final_lipids_to_show()
    final_lipids <- intersect(sig_lipids, class_and_adv_lipids)
    
    validate(need(length(final_lipids) > 0, "No lipids passed significance and ALL other cosmetic/advanced filters."))
    
    base_matrix <- if (is_agg) aggregatedMatrixData() else replicateMatrixData()
    mat_display_unfiltered <- base_matrix[rownames(base_matrix) %in% final_lipids, , drop = FALSE]
    
    mat_display <- if(is_agg){
      display_groups <- input$displaySelectedGroups %||% colnames(mat_display_unfiltered)
      mat_display_unfiltered[, colnames(mat_display_unfiltered) %in% display_groups, drop = FALSE]
    } else {
      display_replicates <- get_display_replicates()
      mat_display_unfiltered[, colnames(mat_display_unfiltered) %in% display_replicates, drop = FALSE]
    }
    validate(need(nrow(mat_display) > 0 && ncol(mat_display) > 0, "No data to display for the filtered heatmap."))
    
    intensity_matrix <- if(is_agg) aggregatedMatrixData() else replicateMatrixData()
    
    mat_sort <- if(grepl("fixed|cluster_class", mode)) {
      agg_data_filtered <- aggregatedMatrixData()[rownames(aggregatedMatrixData()) %in% rownames(mat_display), , drop = FALSE]
      groups_to_display <- input$displaySelectedGroups %||% colnames(agg_data_filtered)
      agg_data_filtered[, colnames(agg_data_filtered) %in% groups_to_display, drop = FALSE]
    } else {
      NULL
    }
    
    sort_mode_internal <- "class"
    
    subtitle <- get_filter_subtitle()
    title <- sprintf("Filtered Heatmap [%d Lipids]\n%s", length(final_lipids), subtitle)
    generateHeatmapObject(mat_display, title, intensity_matrix, mat_sort, sort_mode_internal, get_heatmap_display_matrix())
  })
  
  get_barchart_base_matrix <- reactive({ if (grepl("aggregate", input$repMode)) aggregatedMatrixData() else replicateMatrixData() })
  
  unfilteredBarData <- reactive({
    full_mat <- get_barchart_base_matrix()
    lipids_to_show <- final_lipids_to_show()
    mat_filtered_by_class <- full_mat[rownames(full_mat) %in% lipids_to_show, , drop = FALSE]
    is_agg <- grepl("aggregate", input$repMode)
    
    mat_display <- if(is_agg){
      display_groups <- input$displaySelectedGroups %||% colnames(mat_filtered_by_class)
      mat_filtered_by_class[, colnames(mat_filtered_by_class) %in% display_groups, drop = FALSE]
    } else {
      display_replicates <- get_display_replicates()
      mat_filtered_by_class[, colnames(mat_filtered_by_class) %in% display_replicates, drop = FALSE]
    }
    computeBarData(mat_display)
  })
  
  filteredBarData <- reactive({
    base_mat <- get_barchart_base_matrix()
    sig_lipids <- significantLipids()
    class_and_adv_lipids <- final_lipids_to_show()
    final_lipids <- intersect(sig_lipids, class_and_adv_lipids)
    mat_unfiltered <- base_mat[rownames(base_mat) %in% final_lipids, , drop = FALSE]
    is_agg <- grepl("aggregate", input$repMode)
    
    mat_display <- if(is_agg){
      display_groups <- input$displaySelectedGroups %||% colnames(mat_unfiltered)
      mat_unfiltered[, colnames(mat_unfiltered) %in% display_groups, drop = FALSE]
    } else {
      display_replicates <- get_display_replicates()
      mat_unfiltered[, colnames(mat_unfiltered) %in% display_replicates, drop = FALSE]
    }
    validate(need(is.matrix(mat_display) && nrow(mat_display) > 0, "No significant lipids to display for the selected filters."))
    computeBarData(mat_display)
  })
  
  computeBarData <- function(mat){
    validate(need(is.matrix(mat) && nrow(mat) > 0 && ncol(mat) > 0, "No data for bar chart."))
    anno <- annotationData()
    dfm <- as.data.frame(mat) %>% tibble::rownames_to_column("Lipid_Name") %>%
      dplyr::left_join(dplyr::select(anno, Lipid_Name, lipid_class, hyperclass), by = "Lipid_Name") %>%
      tidyr::pivot_longer(cols = dplyr::all_of(colnames(mat)), names_to = "SampleCol", values_to = "Intensity")
    
    if (grepl("^Normalized", input$barValueMode)) {
      dfm <- dfm %>% dplyr::group_by(Lipid_Name) %>% dplyr::mutate(rowSum = sum(Intensity, na.rm = TRUE), Intensity = dplyr::if_else(rowSum > 0, Intensity / rowSum, 0)) %>% dplyr::ungroup()
    }
    
    groupVar <- if (input$barGroupMode == "Hyperclass") "hyperclass" else "lipid_class"
    dfm <- dfm %>% dplyr::rename(ClassGroup = dplyr::all_of(groupVar))
    
    if (input$barOrientation == "sample_x") {
      df_sum <- dfm %>% dplyr::group_by(SampleCol, ClassGroup) %>% dplyr::summarize(Value = sum(Intensity, na.rm = TRUE), .groups = "drop")
      df_sum$SampleCol <- factor(df_sum$SampleCol, levels = colnames(mat))
      if (grepl("\\(\\%\\)$", input$barValueMode)) df_sum <- df_sum %>% dplyr::group_by(SampleCol) %>% dplyr::mutate(Value = Value / sum(Value) * 100) %>% dplyr::ungroup()
      df_sum %>% dplyr::rename(xVal = SampleCol, fillVal = ClassGroup)
    } else {
      df_sum <- dfm %>% dplyr::group_by(ClassGroup, SampleCol) %>% dplyr::summarize(Value = sum(Intensity, na.rm = TRUE), .groups = "drop")
      df_sum$SampleCol <- factor(df_sum$SampleCol, levels = colnames(mat))
      if (grepl("\\(\\%\\)$", input$barValueMode)) df_sum <- df_sum %>% dplyr::group_by(ClassGroup) %>% dplyr::mutate(Value = Value / sum(Value) * 100) %>% dplyr::ungroup()
      df_sum %>% dplyr::rename(xVal = ClassGroup, fillVal = SampleCol)
    }
  }
  
  buildBarPlot <- function(df, titleText){
    validate(need(is.data.frame(df) && nrow(df) > 0, "No data to plot."))
    ggplot_title <- gsub("\n", "<br>", titleText)
    ylab_text <- switch(input$barValueMode, "Absolute (intensity)"="Summed Intensity", "Absolute (%)"="Relative Intensity (%)", "Normalized (intensity)"="Summed Normalized Intensity", "Normalized (%)"="Relative Normalized Intensity (%)")
    fillMap <- if (input$barOrientation == "sample_x") { if (input$barGroupMode == "Hyperclass") HYPERCLASS_MAP_COLORS else CLASS_MAP_COLORS } else { colorRampPalette(RColorBrewer::brewer.pal(9, "Set1"))(dplyr::n_distinct(df$fillVal)) %>% setNames(nm = unique(df$fillVal)) }
    
    ggplot2::ggplot(df, ggplot2::aes(x = xVal, y = Value, fill = fillVal)) + ggplot2::geom_bar(stat = "identity", position = "stack") +
      ggplot2::scale_fill_manual(values = fillMap, name = NULL, na.value = "grey50") +
      ggplot2::labs(title = NULL, subtitle = NULL, x = NULL, y = ylab_text) +
      ggplot2::theme_minimal(base_size = 14) +
      ggplot2::theme(panel.grid = ggplot2::element_blank(), axis.text.x = ggplot2::element_text(angle = 90, vjust = 0.5, hjust=1), plot.title = ggtext::element_markdown(hjust = 0, size=14, lineheight = 1.2)) +
      ggplot2::ggtitle(ggplot_title)
  }
  
  output$heatmapPlot <- renderPlot({ hmObj <- unfilteredHeatmapObj(); req(hmObj); grid::grid.newpage(); grid::grid.draw(hmObj$ht$gtable) }, execOnResize = TRUE)
  output$barPlot <- renderPlot({ buildBarPlot(unfilteredBarData(), paste("Unfiltered Bar Chart\n(", gsub("_", " ", input$repMode), ")")) }, execOnResize = TRUE)
  output$filteredHeatmapPlot <- renderPlot({ fhObj <- filteredHeatmapObj(); req(fhObj); grid::grid.newpage(); grid::grid.draw(fhObj$ht$gtable) }, execOnResize = TRUE)
  
  output$filteredBarPlot <- renderPlot({
    req(rv$uploads); sig_lipids <- significantLipids(); class_lipids <- final_lipids_to_show()
    final_lipids_count <- length(intersect(sig_lipids, class_lipids))
    subtitle <- get_filter_subtitle()
    full_title <- sprintf("Filtered Bar Chart [%d Lipids]\n%s", final_lipids_count, subtitle)
    buildBarPlot(filteredBarData(), full_title)
  }, execOnResize = TRUE)
  
  output$unfiltered_summary_text <- renderText({
    req(rawData())
    paste("Displaying all", nrow(rawData()), "features.")
  })
  
  getDownloadFilename <- function(tabName, extension) {
    req(rv$uploads); date_str <- format(Sys.Date(), "%y%m%d"); repMode <- ifelse(grepl("aggregate", input$repMode), "Agg", "Rep")
    sheetString <- tools::file_path_sans_ext(basename(names(rv$uploads)[1]))
    paste0("LipidAnalysis_", date_str, "_", sheetString, "_", tabName, "_", repMode, ".", extension)
  }
  
  output$downloadHeatmapPDF <- downloadHandler(filename=function(){getDownloadFilename("Heatmap_Unfiltered","pdf")}, content=function(file){hmObj<-unfilteredHeatmapObj();req(hmObj);w<-session$clientData$output_heatmapPlot_width%||%1000;h<-session$clientData$output_heatmapPlot_height%||%800;ggplot2::ggsave(file,plot=hmObj$ht,device="pdf",width=w/72,height=h/72,units="in",limitsize=FALSE)})
  output$downloadHeatmapCSV <- downloadHandler(filename=function(){getDownloadFilename("Heatmap_Unfiltered_Data","csv")}, content=function(file){hmObj<-unfilteredHeatmapObj();req(hmObj);write.csv(hmObj$data,file)})
  output$downloadBarChartPDF <- downloadHandler(filename=function(){getDownloadFilename("BarChart_Unfiltered","pdf")}, content=function(file){p<-buildBarPlot(unfilteredBarData(),"Unfiltered Bar Chart");w<-session$clientData$output_barPlot_width%||%1000;h<-session$clientData$output_barPlot_height%||%700;ggplot2::ggsave(file,plot=p,device="pdf",width=w/72,height=h/72,units="in",limitsize=FALSE)})
  output$downloadBarChartCSV <- downloadHandler(filename=function(){getDownloadFilename("BarChart_Unfiltered_Data","csv")}, content=function(file){write.csv(unfilteredBarData(),file,row.names=FALSE)})
  output$downloadFilteredHeatmapPDF <- downloadHandler(filename=function(){getDownloadFilename("Heatmap_Filtered","pdf")}, content=function(file){fhObj<-filteredHeatmapObj();req(fhObj);w<-session$clientData$output_filteredHeatmapPlot_width%||%1100;h<-session$clientData$output_filteredHeatmapPlot_height%||%850;ggplot2::ggsave(file,plot=fhObj$ht,device="pdf",width=w/72,height=h/72,units="in",limitsize=FALSE)})
  output$downloadFilteredHeatmapCSV <- downloadHandler(filename=function(){getDownloadFilename("Heatmap_Filtered_Data","csv")}, content=function(file){fhObj<-filteredHeatmapObj();req(fhObj);write.csv(fhObj$data,file)})
  output$downloadFilteredBarChartPDF <- downloadHandler(filename=function(){getDownloadFilename("BarChart_Filtered","pdf")}, content=function(file){p<-buildBarPlot(filteredBarData(),"Filtered Bar Chart");w<-session$clientData$output_filteredBarPlot_width%||%1000;h<-session$clientData$output_filteredBarPlot_height%||%700;ggplot2::ggsave(file,plot=p,device="pdf",width=w/72,height=h/72,units="in",limitsize=FALSE)})
  output$downloadFilteredBarChartCSV <- downloadHandler(filename=function(){getDownloadFilename("BarChart_Filtered_Data","csv")}, content=function(file){write.csv(filteredBarData(),file,row.names=FALSE)})
  
}

# ====
# --- 5. RUN APPLICATION ---
# ====
shinyApp(ui = ui, server = server)