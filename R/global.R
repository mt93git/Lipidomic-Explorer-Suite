# R/global.R
# Global setup.



# --- 1. LOAD LIBRARIES ---
suppressPackageStartupMessages({
  library(shiny); library(bslib); library(shinyjqui); library(readxl); library(dplyr);
  library(tidyr); library(ggplot2); library(ggrepel); library(DT); library(scales);
  library(colourpicker); library(RColorBrewer); library(stringr); library(imputeLCMD);
  library(purrr); library(zip); library(limma); library(fgsea); library(stats);
  library(nipals); library(htmlwidgets); library(webshot2); library(plotly);
  library(viridisLite); library(pheatmap); library(grid); library(tibble);
  library(ggpubr); library(qvalue); library(tidytext); library(patchwork); library(sortable)
})

# --- 2. GLOBAL CONSTANTS & DEFINITIONS ---
`%||%` <- function(a, b) { if (!is.null(a)) a else b }

# Color maps
# Color maps
CLASS_MAP_COLORS <- c(
  "GP_CL"="#E28E2B", "GP_LPA"="#4169E1", "GP_LPC"="#C15759", "GP_LPE"="#B69A27",
  "GP_LPG"="#26B7B2", "GP_LPI"="#59A14F", "GP_LPS"="#A07AA1", "GP_PA"="#DAA520",
  "GP_PC"="#4E79A7", 
  "GP_PE"="#FF7F00", "GP_PE_E"="#E31A1C", "GP_PE_P"="#FB9A99", # <- Contiguous PEs!
  "GP_PG"="#86BCB6", "GP_PI"="#F99BC3", "GP_PS"="#984EA3",
  "FA_ACar"="#8CD17D", "ST_CE"="#F41A1C", 
  "SP_Cer"="#EDC948", "SP_Cer_dh"="#F7E07C", # <- Contiguous Cer!
  "SP_GlcCer"="#5C4F3D", "SP_LacCer"="#6C6FA6", 
  "SP_SM"="#9C755F", "SP_SM_dh"="#D4B49F", # <- Contiguous SM!
  "GL_DAG"="#FFC300", "GL_TAG"="#2ECC71", 
  "Misc"="#B0B0B0"
)
HYPERCLASS_MAP <- list(
  "GP"=c("GP_CL","GP_LPA","GP_LPC","GP_LPE","GP_LPG","GP_LPI","GP_LPS","GP_PA","GP_PC","GP_PE","GP_PG","GP_PI","GP_PS","GP_PE_P","GP_PE_E"),
  "FA"=c("FA_ACar"), "ST"=c("ST_CE"), "SP"=c("SP_Cer","SP_GlcCer","SP_LacCer","SP_SM","SP_Cer_dh","SP_SM_dh"), "GL"=c("GL_DAG","GL_TAG")
)
class_map <- c(
  "LPC"="GP_LPC", "LPE"="GP_LPE", "LPG"="GP_LPG", "LPI"="GP_LPI", "LPS"="GP_LPS",
  "PC"="GP_PC", "PE"="GP_PE", "PG"="GP_PG", "PI"="GP_PI", "PS"="GP_PS", "PA"="GP_PA",
  "LPA"="GP_LPA", "CL"="GP_CL", "ACar"="FA_ACar", "CE"="ST_CE", "Cer"="SP_Cer",
  "GlcCer"="SP_GlcCer", "LacCer"="SP_LacCer", "SM"="SP_SM", "DAG"="GL_DAG", "TAG"="GL_TAG"
)
REVERSE_HYPERCLASS_MAP <- local({
  rev_map <- list()
  for (h in names(HYPERCLASS_MAP)) {
    for (s in HYPERCLASS_MAP[[h]]) {
      rev_map[[s]] <- h
    }
  }
  return(rev_map)
})


# --- 2b. HELPER FUNCTIONS ---
normalize_pqn_linear <- function(data_matrix) {
  presence_mask <- rowSums(!is.na(data_matrix) & data_matrix > 0) / ncol(data_matrix) >= 0.5
  data_subset <- if(sum(presence_mask) < 10) data_matrix else data_matrix[presence_mask, , drop = FALSE]
  ref_spectrum <- apply(data_subset, 1, median, na.rm = TRUE)
  ref_spectrum[ref_spectrum == 0 | is.na(ref_spectrum)] <- 1
  quotients <- sweep(data_subset, 1, ref_spectrum, "/")
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

parse_col_info_v2 <- function(colName) {
  rep_pattern <- "_([A-Z]?\\d+)$"
  matches <- str_match(colName, rep_pattern)
  rep_id <- matches[1, 2]
  base_name <- if (!is.na(rep_id)) str_remove(colName, rep_pattern) else colName
  parts <- strsplit(base_name, "_")[[1]]
  if (length(parts) > 1) {
    population <- parts[length(parts)]
    condition <- paste(parts[1:(length(parts) - 1)], collapse = "_")
  } else {
    condition <- base_name
    population <- NA_character_
  }
  tibble(FullName = colName, Condition = condition, Population = population, Replicate = rep_id)
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
  
 # 1. Base Class Identification
  class_token <- strsplit(lipid_name, "[\\(_\\s]")[[1]][1]
  for(kc in names(class_map)) if(grepl(paste0("^", kc), lipid_name)) class_token <- kc
  subclass <- if (!class_token %in% names(class_map)) "Misc" else class_map[[class_token]]
  
 # 2. Modification Detection & Subclass Refinement (PE_P, PE_E)
  modification <- "standard"
  if (stringr::str_detect(lipid_name, "\\(P-")) {
    modification <- "plasmalogen"
    if (subclass == "GP_PE") subclass <- "GP_PE_P"
  } else if (stringr::str_detect(lipid_name, "\\(O-")) {
    modification <- "ether"
    if (subclass == "GP_PE") subclass <- "GP_PE_E"
  } else if (stringr::str_detect(lipid_name, "Cer\\(d|SM\\(d")) {
    modification <- "dihydro"
    if (subclass == "SP_Cer") subclass <- "SP_Cer_dh"
    if (subclass == "SP_SM") subclass <- "SP_SM_dh"
  }

 # 3. Hyperclass Lookup (Must happen AFTER comparison subclass update)
  hyperclass <- REVERSE_HYPERCLASS_MAP[[subclass]] %||% "Misc"
  
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
    Lipid_Name = lipid_name, subclass = subclass, hyperclass = hyperclass, # Note: using subclass to match legacy code's lipid_class
    lipid_class = subclass, # Duplicate for compatibility if needed
    modification = modification, nCchain1 = chain1_len, DBchain1 = chain1_db,
    nCchain2 = chain2_len, DBchain2 = chain2_db, Chain1_Class = ch1_class$class_tag,
    Chain2_Class = ch2_class$class_tag, Composite_Class = composite_class,
    Total_Carbons = Total_Carbons, Total_DB = Total_DB, Has_SCFA = Has_SCFA,
    Has_MCFA = Has_MCFA, Has_LCFA = Has_LCFA, Has_VLCFA = Has_VLCFA, Has_SFA = Has_SFA,
    Has_MUFA = Has_MUFA, Has_PUFA = Has_PUFA
  )
}



# --- 2c. LIPID MEDIATOR DEFINITIONS ---

lipid_mediator_master_annotations <- tibble::tribble(
  ~Mediator_Abbr, ~Full_Name, ~Biosynthetic_Origin, ~Class_Subgroup, ~Immune_Role,
 # --- PUFA Precursors ---
  "Arachidonic Acid (AA)", "Arachidonic Acid", "AA", "PUFA Precursor", "Ambivalent",
  "Eicosapentaenoic Acid (EPA)", "Eicosapentaenoic Acid", "EPA", "PUFA Precursor", "Ambivalent",
  "Docosahexaenoic Acid (DHA)", "Docosahexaenoic Acid", "DHA", "PUFA Precursor", "Ambivalent",
 # --- AA-derived Mediators ---
  "PGD2", "Prostaglandin D2", "AA", "Prostaglandin", "Pro-inflammatory",
  "PGE2", "Prostaglandin E2", "AA", "Prostaglandin", "Pro-inflammatory",
  "PGF2a", "Prostaglandin F2a", "AA", "Prostaglandin", "Pro-inflammatory",
  "TXB2", "Thromboxane B2", "AA", "Thromboxane metabolite", "Pro-inflammatory",
  "LTB4", "Leukotriene B4", "AA", "Leukotriene", "Pro-inflammatory",
  "6_trans_LTB4", "6-trans-Leukotriene B4", "AA", "Leukotriene metabolite", "Pro-inflammatory",
  "6_trans_12_epi_LTB4", "6-trans-12-epi-Leukotriene B4", "AA", "Leukotriene metabolite", "Pro-inflammatory",
  "5_HETE", "5-Hydroxyeicosatetraenoic acid", "AA", "Hydroxy fatty acid", "Pro-inflammatory",
  "12_HETE", "12-Hydroxyeicosatetraenoic acid", "AA", "Hydroxy fatty acid", "Pro-inflammatory",
  "15_HETE", "15-Hydroxyeicosatetraenoic acid", "AA", "Hydroxy fatty acid", "Pro-inflammatory",
  "5_15_diHETE", "5,15-Dihydroxyeicosatetraenoic acid", "AA", "Dihydroxy fatty acid", "Ambivalent",
  "LXA4", "Lipoxin A4", "AA", "Lipoxin", "Pro-resolving",
  "LXB4", "Lipoxin B4", "AA", "Lipoxin", "Pro-resolving",
 # --- EPA-derived Mediators ---
  "5_HEPE", "5-Hydroxyeicosapentaenoic acid", "EPA", "Hydroxy fatty acid", "Ambivalent",
  "11_HEPE", "11-Hydroxyeicosapentaenoic acid", "EPA", "Hydroxy fatty acid", "Ambivalent",
  "12_HEPE", "12-Hydroxyeicosapentaenoic acid", "EPA", "Hydroxy fatty acid", "Ambivalent",
  "15_HEPE", "15-Hydroxyeicosapentaenoic acid", "EPA", "Hydroxy fatty acid", "Ambivalent",
  "18_HEPE", "18-Hydroxyeicosapentaenoic acid", "EPA", "Hydroxy fatty acid", "Pro-resolving",
  "LXA5", "Lipoxin A5", "EPA", "Lipoxin", "Pro-resolving",
  "RvE1", "Resolvin E1", "EPA", "Resolvin E-series", "Pro-resolving",
  "RvE2", "Resolvin E2", "EPA", "Resolvin E-series", "Pro-resolving",
  "RvE4", "Resolvin E4", "EPA", "Resolvin E-series", "Pro-resolving",
 # --- DHA-derived Mediators ---
  "14_HDHA", "14-Hydroxydocosahexaenoic acid", "DHA", "Hydroxy fatty acid", "Pro-resolving",
  "17_HDHA", "17-Hydroxydocosahexaenoic acid", "DHA", "Hydroxy fatty acid", "Pro-resolving",
  "PDX", "Protectin DX", "DHA", "Protectin", "Pro-resolving",
  "RvD4", "Resolvin D4", "DHA", "Resolvin D-series", "Pro-resolving",
  "RvD5", "Resolvin D5", "DHA", "Resolvin D-series", "Pro-resolving",
  "Maresin_2", "Maresin 2", "DHA", "Maresin", "Pro-resolving"
)

user_defined_subclass_colors <- c(
  "Dihydroxy fatty acid"   = "#A9D1F7",
  "Hydroxy fatty acid"     = "#578EE0",
  "Leukotriene"            = "#36BBAA",
  "Leukotriene metabolite" = "#59B52C",
  "Lipoxin"                = "#B6E675",
  "Maresin"                = "#F3DE2C",
  "Prostaglandin"          = "#F2E8CF",
  "Protectin"              = "#E07A5F",
  "Resolvin D-series"      = "#C37AC9",
  "Resolvin E-series"      = "#5D3A9B",
  "Thromboxane metabolite" = "#D83A56",
  "PUFA Precursor"         = "#A9A9A9"
)

immune_role_colors <- c(
  "Pro-inflammatory" = "#E41A1C",
  "Pro-resolving"    = "#377EB8",
  "Ambivalent"       = "#984EA3",
  "None"             = "#B0B0B0"
)

user_defined_biosynthetic_origin_colors <- c(
  "AA"  = "#A67553",
  "EPA" = "#FFE49A",
  "DHA" = "#78A1FF"
)

parse_col_info_mediator <- function(colName) {
 # Expected format: Condition_Tissue_Replicate (or R1 if missing)
 # Map Tissue -> Population for app compatibility
  parts <- strsplit(colName, "_")[[1]]
  out <- list(Condition=NA_character_, Population=NA_character_, Replicate=NA_character_)
  
  if (length(parts) >= 1) out$Condition <- parts[1]
  if (length(parts) >= 2) out$Population <- parts[2] # Mapped from Tissue
  if (length(parts) >= 3) out$Replicate <- paste(parts[3:length(parts)], collapse="_") else out$Replicate <- "R1"
  
  tibble(FullName = colName, Condition = out$Condition, Population = out$Population, Replicate = out$Replicate)
}

parse_lipid_name_mediator <- function(lipid_name) {
 # Lookup in master table
 # Try exact match on Abbreviation first
  match_idx <- match(lipid_name, lipid_mediator_master_annotations$Mediator_Abbr)
  
 # If failed, try match on Full Name
  if (is.na(match_idx)) {
    match_idx <- match(tolower(trimws(lipid_name)), tolower(trimws(lipid_mediator_master_annotations$Full_Name)))
  }
  
  if (!is.na(match_idx)) {
    info <- lipid_mediator_master_annotations[match_idx, ]
    subclass <- info$Class_Subgroup
    immune_role <- info$Immune_Role
    origin <- info$Biosynthetic_Origin
  } else {
    subclass <- "Misc" # Default to Misc instead of Unknown to match system defaults
    immune_role <- "None"
    origin <- "Unknown"
  }
  
 # Return fields compatible with global app structure
 # Mapping Class_Subgroup -> subclass/lipid_class/hyperclass logic
  tibble(
    Lipid_Name = lipid_name,
    subclass = subclass,
    hyperclass = origin, # Map Origin to Hyperclass for broad grouping
    lipid_class = subclass,
    modification = "Standard",
    Immune_Role = immune_role,
    Biosynthetic_Origin = origin,
  # Fill structural fields with NAs as they apply less here
    nCchain1=NA, DBchain1=NA, nCchain2=NA, DBchain2=NA,
    Chain1_Class=NA, Chain2_Class=NA, Composite_Class=subclass,
    Total_Carbons=NA, Total_DB=NA, Has_SCFA=FALSE, Has_MCFA=FALSE,
    Has_LCFA=FALSE, Has_VLCFA=FALSE, Has_SFA=FALSE, Has_MUFA=FALSE, Has_PUFA=FALSE
  )
}

get_mediator_color_map <- function(present_subclasses) {
 # Start with user defined
  final_colors <- user_defined_subclass_colors
  
 # Ensure Misc/Unknown
  if (!"Misc" %in% names(final_colors)) final_colors["Misc"] <- "#B0B0B0"
  if (!"Unknown" %in% names(final_colors)) final_colors["Unknown"] <- "#D3D3D3"
  
 # Auto-generate for missing
  missing <- setdiff(present_subclasses, names(final_colors))
  if (length(missing) > 0) {
    auto_cols <- safe_brewer_pal(length(missing), "Paired")
    names(auto_cols) <- missing
    final_colors <- c(final_colors, auto_cols)
  }
  
  final_colors
}


# --- 3. SOURCE MODULES & OTHER R FILES ---
# Load Modules
source("R/utils_data.R")
source("R/utils_colors.R")
source("R/utils_vis.R")
source("R/modules/utils_stats.R")
source("R/modules/1_shared_data_module.R")
source("R/modules/2_qc_boxplot_module.R")
source("R/modules/3_pca_module.R")
source("R/modules/4_heatmap_module.R")
source("R/modules/5_barchart_module.R")
source("R/modules/6_volcano_module.R")
source("R/modules/7_lsea_module.R")
source("R/modules/8_structural_module.R")
source("R/modules/9_logratio_module.R")
# source("R/modules/99_debug_module.R")
