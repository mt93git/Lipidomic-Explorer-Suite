# R/global.R
# Global setup.



# Allow large dataset file uploads up to 250 MB
options(shiny.maxRequestSize = 250 * 1024^2)

# --- 1. LOAD LIBRARIES ---
suppressPackageStartupMessages({
  library(shiny); library(bslib); library(shinyjqui); library(readxl); library(dplyr);
  library(tidyr); library(ggplot2); library(ggrepel); library(DT); library(scales);
  library(colourpicker); library(RColorBrewer); library(stringr);
  library(purrr); library(zip); library(limma); library(stats);
  library(nipals); library(htmlwidgets); library(webshot2); library(plotly);
  library(viridisLite); library(pheatmap); library(grid); library(tibble);
  library(ggpubr); library(tidytext); library(patchwork); library(sortable);
  library(circlize); library(ggraph); library(igraph); library(tidygraph); library(ggh4x);
  library(stringdist); library(variancePartition); library(splines); library(BiocParallel)
})

# Dynamic graceful load and recovery for visNetwork
if (!requireNamespace("visNetwork", quietly = TRUE)) {
  tryCatch({
    message("[GLOBAL RECOVERY] 'visNetwork' not found. Attempting on-the-fly binary installation...")
    install.packages("visNetwork", type = "binary", quiet = TRUE)
  }, error = function(e) NULL)
}
if (requireNamespace("visNetwork", quietly = TRUE)) {
  suppressPackageStartupMessages(library(visNetwork))
} else {
  warning("Package 'visNetwork' is not available. Interactive network visualization in Module 13 will be limited.")
}

# Dynamic graceful load for optional imputeLCMD package
if (system.file(package = "imputeLCMD") == "") {
  warning("Package 'imputeLCMD' is not installed. QRILC imputation will be disabled/warn in the UI.")
} else {
  suppressPackageStartupMessages(library(imputeLCMD))
}

# --- 1b. RUNTIME OVERRIDES & FIXES ---
# Safeguard shiny's validate/need from being masked by jsonlite or other packages
validate <- shiny::validate
need <- shiny::need

# Override variancePartition:::as_lmerModLmerTest2 to support newer lme4 versions
# where the first formal argument of the deviance function is named "par" instead of "theta".
if (exists("as_lmerModLmerTest2", envir = asNamespace("variancePartition"))) {
  custom_as_lmerModLmerTest2 <- function (model, tol = 1e-08) {
    if (!inherits(model, "lmerMod")) {
      stop("model not of class 'lmerMod': cannot coerce to class 'lmerModLmerTest")
    }
    mc <- getCall(model)
    args <- c(as.list(mc), devFunOnly = TRUE)
    if (!"control" %in% names(as.list(mc))) {
      args$control <- lme4::lmerControl(check.rankX = "silent.drop.cols")
    }
    Call <- as.call(c(list(quote(lme4::lmer)), args[-1]))
    ff <- environment(formula(model))
    pf <- parent.frame(n = 2)
    sf <- sys.frames()[[1]]
    ff2 <- environment(model)
    devfun <- tryCatch({
      eval(Call, envir = pf)
    }, error = function(e1) {
      tryCatch({
        eval(Call, envir = ff)
      }, error = function(e2) {
        tryCatch({
          eval(Call, envir = ff2)
        }, error = function(e3) {
          tryCatch({
            eval(Call, envir = sf)
          }, error = function(e4) {
            "error"
          })
        })
      })
    })
    
    first_arg <- if(is.function(devfun)) names(formals(devfun))[1] else ""
    if ((is.character(devfun) && devfun == "error") || !is.function(devfun) || 
        !(first_arg %in% c("theta", "par"))) {
      stop("Unable to extract deviance function from model fit")
    }
    lmerTest:::as_lmerModLT(model, devfun, tol = tol)
  }
  assignInNamespace("as_lmerModLmerTest2", custom_as_lmerModLmerTest2, ns = "variancePartition")
}


# --- 1c. HIGH-VISIBILITY INGESTION & RUNTIME LOGGER ---
INGESTION_LOG_FILE <- file.path("data", "ingestion_trace.log")

log_ingestion_event <- function(stage, status = c("INFO", "START", "SUCCESS", "WARNING", "ERROR"), message_text, details = list()) {
  status <- match.arg(status)
  ts <- format(Sys.time(), "%Y-%m-%d %H:%M:%OS3")
  
  status_tag <- switch(status,
    "START"   = ">>> [START]",
    "INFO"    = "--> [INFO]",
    "SUCCESS" = "+++ [SUCCESS]",
    "WARNING" = "??? [WARNING]",
    "ERROR"   = "!!! [FATAL ERROR]"
  )
  
  banner <- sprintf("[INGESTION TRACE] %s | STAGE: %s | %s | %s", ts, stage, status_tag, message_text)
  
  detail_lines <- ""
  if (length(details) > 0) {
    formatted_details <- sapply(names(details), function(k) {
      val <- details[[k]]
      if (is.null(val)) val <- "<NULL>"
      else if (is.atomic(val) && length(val) > 1) val <- paste0("[", paste(head(val, 8), collapse = ", "), if(length(val) > 8) sprintf("... +%d more", length(val) - 8) else "", "]")
      else if (is.data.frame(val)) val <- sprintf("DataFrame [%d rows x %d cols]", nrow(val), ncol(val))
      sprintf("    - %s: %s", k, as.character(val))
    })
    detail_lines <- paste0("\n", paste(formatted_details, collapse = "\n"))
  }
  
  full_output <- paste0(banner, detail_lines, "\n")
  
  # 1. Output to stderr (Shiny log stream) and stdout (RStudio console stream)
  cat(full_output, file = stderr())
  cat(full_output, file = stdout())
  flush.console()
  
  # 2. Append to persistent trace log file
  tryCatch({
    dir.create(dirname(INGESTION_LOG_FILE), showWarnings = FALSE, recursive = TRUE)
    cat(full_output, file = INGESTION_LOG_FILE, append = TRUE)
  }, error = function(e) NULL)
  
  # 3. If ERROR, also show prominent Shiny UI notification
  if (status == "ERROR" && exists("showNotification", envir = asNamespace("shiny"))) {
    tryCatch({
      shiny::showNotification(
        shiny::tagList(
          shiny::tags$strong(sprintf("Ingestion Error [%s]:", stage)),
          shiny::tags$div(message_text),
          if (length(details) > 0) shiny::tags$pre(
            style = "font-size: 0.75rem; max-height: 120px; overflow: auto; margin-top: 5px;",
            paste(paste(names(details), details, sep = ": "), collapse = "\n")
          )
        ),
        type = "error",
        duration = NULL
      )
    }, error = function(e) NULL)
  }
}


# --- 2. GLOBAL CONSTANTS & DEFINITIONS ---
`%||%` <- function(a, b) { if (!is.null(a)) a else b }

# Color maps
# Color maps
CLASS_MAP_COLORS <- c(
  "GP_CL"="#E28E2B", "GP_LPA"="#A0CBE8", "GP_LPC"="#E15759", "GP_LPE"="#F28E2B",
  "GP_LPG"="#76B7B2", "GP_LPI"="#59A14F", "GP_LPS"="#A07AA1", "GP_PA"="#EDC948",
  "GP_PC"="#B07AA1", 
  "GP_PE"="#FF9DA7", "GP_PE_E"="#9C755F", "GP_PE_P"="#BAB0AC", # <- Contiguous PEs!
  "GP_PG"="#86BCB6", "GP_PI"="#D37295", "GP_PS"="#8CD17D",
  "FA_ACar"="#4E79A7", "ST_CE"="#C7C7C7", 
  "SP_Cer"="#EDC948", "SP_Cer_dh"="#B6992D", # <- Contiguous Cer!
  "SP_GlcCer"="#5C4F3D", "SP_LacCer"="#499894", 
  "SP_SM"="#9C755F", "SP_SM_dh"="#79706E", # <- Contiguous SM!
  "GL_DAG"="#FFC300", "GL_TAG"="#2ECC71", 
  "Misc"="#B0B0B0"
)
HYPERCLASS_MAP <- list(
  "GP"=c("GP_CL","GP_LPA","GP_LPC","GP_LPE","GP_LPG","GP_LPI","GP_LPS","GP_PA","GP_PC","GP_PE","GP_PG","GP_PI","GP_PS","GP_PE_P","GP_PE_E", "GP_BMP"),
  "FA"=c("FA_ACar", "FA_FA"), 
  "ST"=c("ST_CE"), 
  "SP"=c("SP_Cer","SP_GlcCer","SP_LacCer","SP_SM","SP_Cer_dh","SP_SM_dh", "SP_HexCer", "SP_CerP"), 
  "GL"=c("GL_DAG","GL_TAG", "GL_DG", "GL_TG", "GL_MG", "GL_MAG")
)
class_map <- c(
  "LPC"="GP_LPC", "LPE"="GP_LPE", "LPG"="GP_LPG", "LPI"="GP_LPI", "LPS"="GP_LPS",
  "PC"="GP_PC", "PE"="GP_PE", "PG"="GP_PG", "PI"="GP_PI", "PS"="GP_PS", "PA"="GP_PA",
  "LPA"="GP_LPA", "CL"="GP_CL", "BMP"="GP_BMP",
  "ACar"="FA_ACar", "CAR"="FA_ACar", "FA"="FA_FA", "FFA"="FA_FA",
  "CE"="ST_CE", "ChE"="ST_CE",
  "Cer"="SP_Cer", "GlcCer"="SP_GlcCer", "LacCer"="SP_LacCer", "HexCer"="SP_GlcCer",
  "CerP"="SP_CerP", "SM"="SP_SM",
  "DAG"="GL_DAG", "TAG"="GL_TAG", "DG"="GL_DAG", "TG"="GL_TAG",
  "MG"="GL_MG", "MAG"="GL_MG"
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
get_full_class_name <- function(x) {
  if (is.null(x)) return(x)
  
  # A mapping for both prefixed and non-prefixed short names
  name_map <- c(
    # Prefixed subclasses
    "GP_CL"     = "Cardiolipin",
    "GP_LPA"    = "Lysophosphatidic Acid",
    "GP_LPC"    = "Lysophosphatidylcholine",
    "GP_LPE"    = "Lysophosphatidylethanolamine",
    "GP_LPG"    = "Lysophosphatidylglycerol",
    "GP_LPI"    = "Lysophosphatidylinositol",
    "GP_LPS"    = "Lysophosphatidylserine",
    "GP_PA"     = "Phosphatidic Acid",
    "GP_PC"     = "Phosphatidylcholine",
    "GP_PE"     = "Phosphatidylethanolamine",
    "GP_PE_E"   = "Ether Phosphatidylethanolamine",
    "GP_PE_P"   = "Plasmalogen Phosphatidylethanolamine",
    "GP_PG"     = "Phosphatidylglycerol",
    "GP_PI"     = "Phosphatidylinositol",
    "GP_PS"     = "Phosphatidylserine",
    "FA_ACar"   = "Acylcarnitine",
    "ST_CE"     = "Cholesteryl Ester",
    "SP_Cer"    = "Ceramide",
    "SP_Cer_dh" = "Dihydroceramide",
    "SP_GlcCer" = "Glucosylceramide",
    "SP_LacCer" = "Lactosylceramide",
    "SP_SM"     = "Sphingomyelin",
    "SP_SM_dh"  = "Dihydrosphingomyelin",
    "GL_DAG"    = "Diacylglycerol",
    "GL_TAG"    = "Triacylglycerol",
    "GL_DG"     = "Diacylglycerol",
    "GL_TG"     = "Triacylglycerol",
    
    # Non-prefixed subclasses
    "CL"     = "Cardiolipin",
    "LPA"    = "Lysophosphatidic Acid",
    "LPC"    = "Lysophosphatidylcholine",
    "LPE"    = "Lysophosphatidylethanolamine",
    "LPG"    = "Lysophosphatidylglycerol",
    "LPI"    = "Lysophosphatidylinositol",
    "LPS"    = "Lysophosphatidylserine",
    "PA"     = "Phosphatidic Acid",
    "PC"     = "Phosphatidylcholine",
    "PE"     = "Phosphatidylethanolamine",
    "PE_E"   = "Ether Phosphatidylethanolamine",
    "PE_P"   = "Plasmalogen Phosphatidylethanolamine",
    "PG"     = "Phosphatidylglycerol",
    "PI"     = "Phosphatidylinositol",
    "PS"     = "Phosphatidylserine",
    "ACar"   = "Acylcarnitine",
    "CE"     = "Cholesteryl Ester",
    "Cer"    = "Ceramide",
    "Cer_dh" = "Dihydroceramide",
    "GlcCer" = "Glucosylceramide",
    "LacCer" = "Lactosylceramide",
    "SM"     = "Sphingomyelin",
    "SM_dh"  = "Dihydrosphingomyelin",
    "DAG"    = "Diacylglycerol",
    "TAG"    = "Triacylglycerol",
    "DG"     = "Diacylglycerol",
    "TG"     = "Triacylglycerol",
    
    # Lipid Categories (Global)
    "GP"   = "Glycerophospholipid",
    "FA"   = "Fatty Acyl",
    "ST"   = "Sterol Lipid",
    "SP"   = "Sphingolipid",
    "GL"   = "Glycerolipid",
    
    # Biosynthetic Origins / Hyperclasses (Mediators)
    "AA"   = "Arachidonic Acid",
    "EPA"  = "Eicosapentaenoic Acid",
    "DHA"  = "Docosahexaenoic Acid",
    "DPA"  = "Docosapentaenoic Acid",
    
    # Other fallback terms
    "Misc" = "Miscellaneous",
    "misc" = "Miscellaneous",
    "Unknown" = "Unknown"
  )
  
  map_one <- function(val) {
    if (is.na(val) || val == "") return(val)
    
    # If the input has an arrow "→", extract the first part (the raw abbreviation)
    if (grepl("→", val)) {
      val <- trimws(strsplit(val, "→")[[1]][1])
    }
    
    # Try exact match first
    if (val %in% names(name_map)) return(name_map[[val]])
    
    # Try case-insensitive matches
    val_upper <- toupper(val)
    names_upper <- toupper(names(name_map))
    idx <- match(val_upper, names_upper)
    if (!is.na(idx)) return(unname(name_map[idx]))
    
    return(val)
  }
  
  if (is.factor(x)) {
    lvl <- levels(x)
    mapped_lvl <- sapply(lvl, map_one)
    levels(x) <- mapped_lvl
    return(x)
  }
  
  res <- sapply(x, map_one)
  return(unname(res))
}

get_short_class_name <- function(x) {
  if (is.null(x)) return(x)
  
  name_map <- c(
    # Prefixed subclasses
    "GP_CL"     = "Cardiolipin",
    "GP_LPA"    = "Lysophosphatidic Acid",
    "GP_LPC"    = "Lysophosphatidylcholine",
    "GP_LPE"    = "Lysophosphatidylethanolamine",
    "GP_LPG"    = "Lysophosphatidylglycerol",
    "GP_LPI"    = "Lysophosphatidylinositol",
    "GP_LPS"    = "Lysophosphatidylserine",
    "GP_PA"     = "Phosphatidic Acid",
    "GP_PC"     = "Phosphatidylcholine",
    "GP_PE"     = "Phosphatidylethanolamine",
    "GP_PE_E"   = "Ether Phosphatidylethanolamine",
    "GP_PE_P"   = "Plasmalogen Phosphatidylethanolamine",
    "GP_PG"     = "Phosphatidylglycerol",
    "GP_PI"     = "Phosphatidylinositol",
    "GP_PS"     = "Phosphatidylserine",
    "FA_ACar"   = "Acylcarnitine",
    "ST_CE"     = "Cholesteryl Ester",
    "SP_Cer"    = "Ceramide",
    "SP_Cer_dh" = "Dihydroceramide",
    "SP_GlcCer" = "Glucosylceramide",
    "SP_LacCer" = "Lactosylceramide",
    "SP_SM"     = "Sphingomyelin",
    "SP_SM_dh"  = "Dihydrosphingomyelin",
    "GL_DAG"    = "Diacylglycerol",
    "GL_TAG"    = "Triacylglycerol",
    "GL_DG"     = "Diacylglycerol",
    "GL_TG"     = "Triacylglycerol",
    
    # Non-prefixed subclasses
    "CL"     = "Cardiolipin",
    "LPA"    = "Lysophosphatidic Acid",
    "LPC"    = "Lysophosphatidylcholine",
    "LPE"    = "Lysophosphatidylethanolamine",
    "LPG"    = "Lysophosphatidylglycerol",
    "LPI"    = "Lysophosphatidylinositol",
    "LPS"    = "Lysophosphatidylserine",
    "PA"     = "Phosphatidic Acid",
    "PC"     = "Phosphatidylcholine",
    "PE"     = "Phosphatidylethanolamine",
    "PE_E"   = "Ether Phosphatidylethanolamine",
    "PE_P"   = "Plasmalogen Phosphatidylethanolamine",
    "PG"     = "Phosphatidylglycerol",
    "PI"     = "Phosphatidylinositol",
    "PS"     = "Phosphatidylserine",
    "ACar"   = "Acylcarnitine",
    "CE"     = "Cholesteryl Ester",
    "Cer"    = "Ceramide",
    "Cer_dh" = "Dihydroceramide",
    "GlcCer" = "Glucosylceramide",
    "LacCer" = "Lactosylceramide",
    "SM"     = "Sphingomyelin",
    "SM_dh"  = "Dihydrosphingomyelin",
    "DAG"    = "Diacylglycerol",
    "TAG"    = "Triacylglycerol",
    "DG"     = "Diacylglycerol",
    "TG"     = "Triacylglycerol",
    
    # Lipid Categories (Global)
    "GP"   = "Glycerophospholipid",
    "FA"   = "Fatty Acyl",
    "ST"   = "Sterol Lipid",
    "SP"   = "Sphingolipid",
    "GL"   = "Glycerolipid",
    
    # Biosynthetic Origins / Hyperclasses (Mediators)
    "AA"   = "Arachidonic Acid",
    "EPA"  = "Eicosapentaenoic Acid",
    "DHA"  = "Docosahexaenoic Acid",
    "DPA"  = "Docosapentaenoic Acid",
    
    # Other fallback terms
    "Misc" = "Miscellaneous",
    "misc" = "Miscellaneous",
    "Unknown" = "Unknown"
  )
  
  map_one <- function(val) {
    if (is.na(val) || val == "" || val == "Unknown" || val == "misc" || val == "Misc") return(val)
    
    # If the input has an arrow "→", extract the first part (the raw abbreviation)
    if (grepl("→", val)) {
      val <- trimws(strsplit(val, "→")[[1]][1])
    }
    
    # Reverse lookup: if val is already a full name in name_map, find its abbreviation key
    if (val %in% name_map) {
      val <- names(name_map)[match(val, name_map)]
    }
    
    return(val)
  }
  
  if (is.factor(x)) {
    lvl <- levels(x)
    mapped_lvl <- sapply(lvl, map_one)
    levels(x) <- mapped_lvl
    return(x)
  }
  
  res <- sapply(x, map_one)
  return(unname(res))
}

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

# --- Nomenclature Shielding Helpers (Phase 1) ---
mask_clinical_classifications <- function(x, additional_terms = NULL) {
  # Clinical classifications and compound terms shielded from delimiter splitting
  custom_terms <- getOption("lipidomic_protected_terms", default = character(0))
  protected_terms <- unique(c("Septic_Shock", custom_terms, additional_terms))
  for (term in protected_terms) {
    if (is.null(term) || is.na(term) || term == "") next
    parts <- strsplit(term, "_")[[1]]
    if (length(parts) == 2) {
      pattern <- paste0("(?<![a-zA-Z0-9])", parts[1], "_", parts[2], "(?![a-zA-Z0-9])")
      x <- gsub(pattern, paste0(parts[1], "SHIELD", parts[2]), x, perl = TRUE)
    }
  }
  x
}

restore_delimiters <- function(x) {
  gsub("SHIELD", "_", x)
}

parse_col_info_v2 <- function(colName) {
  shielded <- mask_clinical_classifications(colName)
  parts <- strsplit(shielded, "_")[[1]]
  if (length(parts) >= 4) {
    group1 <- parts[1]
    group2 <- parts[2]
    replicate <- parts[3]
    timepoint <- paste(parts[4:length(parts)], collapse = "_")
  } else if (length(parts) == 3) {
    group1 <- parts[1]
    group2 <- parts[2]
    replicate <- parts[3]
    timepoint <- "0h"
  } else if (length(parts) == 2) {
    group1 <- parts[1]
    group2 <- parts[2]
    replicate <- "R1"
    timepoint <- "0h"
  } else {
    group1 <- shielded
    group2 <- NA_character_
    replicate <- "R1"
    timepoint <- "0h"
  }
  
  # Post-processing restoration step
  group1 <- restore_delimiters(group1)
  group2 <- restore_delimiters(group2)
  replicate <- restore_delimiters(replicate)
  timepoint <- restore_delimiters(timepoint)
  
  tibble(FullName = colName, Group1 = group1, Group2 = group2, Replicate = replicate, TimePoint = timepoint)
}

# --- Smart Metadata Interpreter & Mapper ---
interpret_sample_names <- function(sample_names, enabled_features = c("time_course")) {
  # Find all delimiters that occur in at least one sample name
  active_delims <- c()
  for (d in c("_", "-", "\\.")) {
    if (any(grepl(d, sample_names))) {
      active_delims <- c(active_delims, d)
    }
  }
  if (length(active_delims) == 0) {
    delim <- "_"
  } else {
    delim <- paste(active_delims, collapse = "|")
  }
  
  # Helper to split alpha and numeric parts (e.g. SCD012 -> SCD, 012, or Zymo4h -> Zymo, 4h)
  split_alpha_num <- function(x) {
    # 1. Match letters at the beginning and (numbers + letters) at the end (e.g. Zymo4h -> Zymo, 4h)
    m_tp <- regexec("^([a-zA-Z]+)([0-9]+[a-zA-Z]+)$", x)
    reg_matches_tp <- regmatches(x, m_tp)
    if (length(reg_matches_tp[[1]]) == 3) {
      return(list(type = "time_course", cond = reg_matches_tp[[1]][2], val = reg_matches_tp[[1]][3]))
    }
    
    # 2. Match letters at the beginning and numbers at the end (e.g. SCD012 -> SCD, 012)
    m <- regexec("^([a-zA-Z]+)([0-9]+)$", x)
    reg_matches <- regmatches(x, m)
    if (length(reg_matches[[1]]) == 3) {
      return(list(type = "patient", cond = reg_matches[[1]][2], val = reg_matches[[1]][3]))
    }
    
    # 3. Match numbers at the beginning and letters at the end (e.g. 0h -> 0, h)
    m2 <- regexec("^([0-9]+)([a-zA-Z]+)$", x)
    reg_matches2 <- regmatches(x, m2)
    if (length(reg_matches2[[1]]) == 3) {
      return(list(type = "reverse_tp", cond = reg_matches2[[1]][2], val = reg_matches2[[1]][3]))
    }
    return(NULL)
  }
  
  # Analyze each sample
  parsed_list <- lapply(sample_names, function(name) {
    shielded <- mask_clinical_classifications(name)
    parts <- strsplit(shielded, delim)[[1]]
    
    # Initialize values
    group1_term <- NA_character_
    group2_term <- NA_character_
    rep_term <- NA_character_
    patient_term <- NA_character_
    tp_term <- NA_character_
    
    # Feature-based patterns
    is_bio_rep <- function(x) "bio_rep" %in% enabled_features && grepl("^[mM][0-9]+$", x)
    is_tech_rep <- function(x) "tech_rep" %in% enabled_features && grepl("^[rR][0-9]+$", x)
    is_vial_rep <- function(x) "vial_rep" %in% enabled_features && grepl("^[vV][0-9]+$", x)
    
    # TimePoint patterns
    is_timepoint <- function(x) {
      if (!"time_course" %in% enabled_features) return(FALSE)
      grepl("^[0-9]+[a-zA-Z]+$", x) || grepl("^[sScC][0-9]+$", x)
    }
    
    is_patient <- function(x) grepl("^[0-9]+$", x)
    
    if (length(parts) >= 2) {
      # First part is usually Group1 + PatientNumber/TimePoint (e.g. SCD012 or Zymo4h)
      p1 <- parts[1]
      p1_split <- split_alpha_num(p1)
      
      if (!is.null(p1_split)) {
        group1_term <- p1_split$cond
        if (p1_split$type %in% c("time_course", "reverse_tp")) {
          tp_term <- p1_split$val
        } else if (p1_split$type == "patient") {
          patient_term <- p1_split$val
        }
      } else {
        group1_term <- p1
      }
      
      # Now process remaining parts
      remaining_parts <- parts[-1]
      for (part in remaining_parts) {
        if (is_bio_rep(part) || is_tech_rep(part) || is_vial_rep(part)) {
          rep_term <- part
        } else if (is_timepoint(part)) {
          tp_term <- part
        } else if (is_patient(part)) {
          patient_term <- part
        } else {
          # If it's not any of the above, it's probably the Group2 term!
          group2_term <- part
        }
      }
    } else {
      # Only 1 part, e.g. SCD012 or Zymo4h
      p_split <- split_alpha_num(parts[1])
      if (!is.null(p_split)) {
        group1_term <- p_split$cond
        if (p_split$type %in% c("time_course", "reverse_tp")) {
          tp_term <- p_split$val
        } else if (p_split$type == "patient") {
          patient_term <- p_split$val
        }
      } else {
        group1_term <- parts[1]
      }
    }
    
    # Smart Default for Group2 if missing and Group1 is SCD/SCDC
    if (is.na(group2_term) && !is.na(group1_term)) {
      if (group1_term %in% c("SCD", "SCDC", "SCDCT")) {
        group2_term <- "YA" # Default to YA (Young Adult) for Sickle Cell dataset
      }
    }
    
    tibble(
      FullName = name,
      Group1Term = group1_term,
      Group2Term = group2_term,
      ReplicateTerm = rep_term,
      PatientTerm = patient_term,
      TimePointTerm = tp_term
    )
  })
  
  parsed_df <- bind_rows(parsed_list)
  
  distinct_group1 <- na.omit(unique(parsed_df$Group1Term))
  distinct_timepoints <- na.omit(unique(parsed_df$TimePointTerm))
  distinct_replicates <- na.omit(unique(parsed_df$ReplicateTerm))
  distinct_group2 <- na.omit(unique(parsed_df$Group2Term))
  distinct_patients <- na.omit(unique(parsed_df$PatientTerm))
  
  mappings <- tibble(
    Category = character(),
    OriginalTerm = character(),
    MappedValue = character()
  )
  
  for (term in distinct_group1) {
    restored <- restore_delimiters(term)
    mapped_val <- if (restored == "SCD") {
      "Sickle Cell Disease"
    } else if (restored %in% c("SCDC", "SCDCT")) {
      "Control"
    } else {
      restored
    }
    mappings <- add_row(mappings, Category = "Group1", OriginalTerm = term, MappedValue = mapped_val)
  }
  
  for (term in distinct_timepoints) {
    restored <- restore_delimiters(term)
    mapped_val <- if (restored == "S1") {
      "Steady State TimePoint"
    } else if (restored == "S2") {
      "Steady State TimePoint2"
    } else if (restored == "C1") {
      "Pain Crisis TimePoint1"
    } else if (restored == "C2") {
      "Pain Crisis TimePoint2"
    } else {
      restored
    }
    mappings <- add_row(mappings, Category = "TimePoint", OriginalTerm = term, MappedValue = mapped_val)
  }
  
  for (term in distinct_replicates) {
    mappings <- add_row(mappings, Category = "Replicate", OriginalTerm = term, MappedValue = term)
  }
  
  for (term in distinct_group2) {
    if (!grepl("^[0-9]+$", term)) {
      mappings <- add_row(mappings, Category = "Group2", OriginalTerm = term, MappedValue = term)
    }
  }
  
  for (term in distinct_patients) {
    if (!grepl("^[0-9]+$", term)) {
      mappings <- add_row(mappings, Category = "PatientNumber", OriginalTerm = term, MappedValue = term)
    }
  }
  
  return(list(parsed_df = parsed_df, mappings = mappings, delim = delim))
}

apply_nomenclature_mappings <- function(parsed_df, mappings_df) {
  # Ensure mappings_df is valid
  if (is.null(mappings_df) || !is.data.frame(mappings_df) || nrow(mappings_df) == 0) {
    mappings_df <- tibble(Category = character(), OriginalTerm = character(), MappedValue = character())
  }
  
  group1_map <- with(subset(mappings_df, Category == "Group1"), setNames(MappedValue, OriginalTerm))
  tp_map <- with(subset(mappings_df, Category == "TimePoint"), setNames(MappedValue, OriginalTerm))
  rep_map <- with(subset(mappings_df, Category == "Replicate"), setNames(MappedValue, OriginalTerm))
  group2_map <- with(subset(mappings_df, Category == "Group2"), setNames(MappedValue, OriginalTerm))
  pat_map <- with(subset(mappings_df, Category == "PatientNumber"), setNames(MappedValue, OriginalTerm))
  
  # Safe getter for columns to handle any missing/NULL columns
  get_term_column <- function(df, col_name) {
    if (col_name %in% names(df)) {
      val <- df[[col_name]]
      if (is.null(val) || length(val) == 0) {
        return(rep(NA_character_, nrow(df)))
      }
      return(as.character(val))
    }
    return(rep(NA_character_, nrow(df)))
  }
  
  group1_terms <- get_term_column(parsed_df, "Group1Term")
  tp_terms <- get_term_column(parsed_df, "TimePointTerm")
  rep_terms <- get_term_column(parsed_df, "ReplicateTerm")
  group2_terms <- get_term_column(parsed_df, "Group2Term")
  pat_terms <- get_term_column(parsed_df, "PatientTerm")
  
  # Safe mapping function to handle empty mapping vectors
  map_terms <- function(map_vec, terms) {
    if (length(terms) == 0) return(character(0))
    if (length(map_vec) == 0) return(rep(NA_character_, length(terms)))
    res <- map_vec[terms]
    if (length(res) != length(terms)) {
      res <- rep(NA_character_, length(terms))
    }
    res
  }
  
  final_group1 <- map_terms(group1_map, group1_terms)
  final_tp <- map_terms(tp_map, tp_terms)
  final_rep <- map_terms(rep_map, rep_terms)
  final_group2 <- map_terms(group2_map, group2_terms)
  final_pat <- map_terms(pat_map, pat_terms)
  
  # Helper to safely coalesce and restore, avoiding dplyr::coalesce size recycling crashes
  safe_coalesce_restore <- function(mapped, original) {
    if (length(mapped) != length(original)) {
      mapped <- rep(NA_character_, length(original))
    }
    
    coalesced <- sapply(seq_along(original), function(i) {
      if (!is.na(mapped[i])) mapped[i] else original[i]
    })
    
    restore_delimiters(coalesced)
  }
  
  final_group1 <- safe_coalesce_restore(final_group1, group1_terms)
  final_tp <- safe_coalesce_restore(final_tp, tp_terms)
  final_rep <- safe_coalesce_restore(final_rep, rep_terms)
  final_group2 <- safe_coalesce_restore(final_group2, group2_terms)
  final_pat <- safe_coalesce_restore(final_pat, pat_terms)
  
  final_group1[is.na(final_group1)] <- "Unspecified"
  final_tp[is.na(final_tp)] <- "Unspecified"
  final_rep[is.na(final_rep)] <- "Unspecified"
  final_group2[is.na(final_group2)] <- "Unspecified"
  final_pat[is.na(final_pat)] <- "Unspecified"
  
  tibble(
    FullName = parsed_df$FullName,
    Group1 = final_group1,
    Group2 = final_group2,
    Replicate = final_rep,
    PatientNumber = final_pat,
    TimePoint = final_tp
  )
}

decompose_sample_name <- function(name, delim) {
  shielded <- if (delim == "_") mask_clinical_classifications(name) else name
  parts <- strsplit(shielded, delim)[[1]]
  if (delim == "_") parts <- restore_delimiters(parts)
  components <- list()
  for (i in seq_along(parts)) {
    p <- parts[i]
    m <- regexec("^([a-zA-Z]+)([0-9]+[a-zA-Z]*)$", p)
    reg_matches <- regmatches(p, m)
    if (length(reg_matches[[1]]) == 3 && nchar(reg_matches[[1]][2]) >= 2) {
      components[[paste0("Part_", i, "_alpha")]] <- reg_matches[[1]][2]
      components[[paste0("Part_", i, "_numeric")]] <- reg_matches[[1]][3]
    } else {
      components[[paste0("Part_", i)]] <- p
    }
  }
  components
}

parse_sample_by_schema <- function(name, delim, schema) {
  components <- decompose_sample_name(name, delim)
  
  cond_vals <- character(0)
  pop_vals <- character(0)
  rep_vals <- character(0)
  pat_vals <- character(0)
  tp_vals <- character(0)
  
  for (comp_name in names(components)) {
    category <- schema[[comp_name]]
    if (!is.null(category)) {
      val <- components[[comp_name]]
      if (category == "Group1") cond_vals <- c(cond_vals, val)
      else if (category == "Group2") pop_vals <- c(pop_vals, val)
      else if (category == "Replicate") rep_vals <- c(rep_vals, val)
      else if (category == "PatientNumber") pat_vals <- c(pat_vals, val)
      else if (category == "TimePoint") tp_vals <- c(tp_vals, val)
    }
  }
  
  cond_val <- if (length(cond_vals) > 0) paste(cond_vals, collapse = "_") else NA_character_
  pop_val <- if (length(pop_vals) > 0) paste(pop_vals, collapse = "_") else NA_character_
  rep_val <- if (length(rep_vals) > 0) paste(rep_vals, collapse = "_") else NA_character_
  pat_val <- if (length(pat_vals) > 0) paste(pat_vals, collapse = "_") else NA_character_
  tp_val <- if (length(tp_vals) > 0) paste(tp_vals, collapse = "_") else NA_character_
  
  tibble(
    FullName = name,
    Group1Term = cond_val,
    Group2Term = pop_val,
    ReplicateTerm = rep_val,
    PatientTerm = pat_val,
    TimePointTerm = tp_val
  )
}

find_matching_component <- function(full_name, selected_text, delim) {
  components <- decompose_sample_name(full_name, delim)
  selected_text <- trimws(selected_text)
  if (nchar(selected_text) == 0) return(NULL)
  
  # Try exact case-insensitive match first
  for (comp_name in names(components)) {
    if (tolower(components[[comp_name]]) == tolower(selected_text)) {
      return(comp_name)
    }
  }
  
  # Try substring match
  for (comp_name in names(components)) {
    if (grepl(tolower(selected_text), tolower(components[[comp_name]]), fixed = TRUE)) {
      return(comp_name)
    }
  }
  
  return(NULL)
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

clean_lipid_name <- function(raw_name) {
  if (is.null(raw_name) || is.na(raw_name) || !nzchar(trimws(raw_name))) {
    return(list(original = raw_name, clean = NA_character_, is_internal_standard = FALSE, standard_tag = NA_character_, adduct = NA_character_))
  }
  orig <- trimws(raw_name)
  x <- orig
  
  # 1. Detect Adduct at the end
  adduct <- NA_character_
  adduct_match <- regmatches(x, regexpr("(?i)(\\[m[+-][^\\]]+\\][+-]?|\\s*([+-])\\s*(h|na|k|nh4|aco|hcoo|cl|ch3coo|fa|2h|3h)\\b[+-]?)$", x, perl = TRUE))
  if (length(adduct_match) > 0) {
    adduct <- trimws(adduct_match)
    x <- substr(x, 1, nchar(x) - nchar(adduct_match))
    x <- trimws(x)
  }
  
  # 2. Detect and flag internal standard (protecting sphingoid base d18:1, d17:1, etc.)
  is_is <- FALSE
  std_tag <- NA_character_
  
  if (grepl("(?i)\\b(splash|lipidomix)\\b", x, perl = TRUE)) {
    is_is <- TRUE
    std_tag <- "SPLASH"
    x <- gsub("(?i)\\b(splash|lipidomix)\\b", "", x, perl = TRUE)
  }
  
  prefix_iso <- regmatches(x, regexpr("(?i)^(\\[d\\d+\\]|\\(d\\d+\\)|d\\d+[-_ ]+|13c\\d*[-_ ]+|is[-_ ]+)", x, perl = TRUE))
  if (length(prefix_iso) > 0) {
    is_is <- TRUE
    tag <- gsub("[^a-zA-Z0-9]", "", prefix_iso)
    if (is.na(std_tag)) std_tag <- tag
    x <- substr(x, nchar(prefix_iso) + 1, nchar(x))
  }
  
  iso_embed <- regmatches(x, regexpr("(?i)([-_ ]*\\(d\\d+\\)|[-_ ]*\\[d\\d+\\]|[-_]d\\d+(?!:)|[-_]13c\\d*|\\(is\\)|\\[is\\]|[-_]is\\b)", x, perl = TRUE))
  if (length(iso_embed) > 0) {
    is_is <- TRUE
    tag <- gsub("[^a-zA-Z0-9]", "", iso_embed)
    if (is.na(std_tag)) std_tag <- tag
    x <- gsub("(?i)([-_ ]*\\(d\\d+\\)|[-_ ]*\\[d\\d+\\]|[-_]d\\d+(?!:)|[-_]13c\\d*|\\(is\\)|\\[is\\]|[-_]is\\b)", "", x, perl = TRUE)
  }
  
  x <- trimws(x)
  
  # 3. Normalize legacy format '16:0-18:1-PE' or '16:0-18:1 PE' -> 'PE(16:0/18:1)'
  if (grepl("^[0-9]+:[0-9]+[-_/][0-9]+:[0-9]+[- ]+[A-Za-z]+$", x, perl = TRUE)) {
    tokens <- strsplit(x, "[- ]+")[[1]]
    if (length(tokens) == 3) {
      x <- sprintf("%s(%s/%s)", tokens[3], tokens[1], tokens[2])
    } else if (length(tokens) == 2) {
      chains <- gsub("-", "/", tokens[1])
      cls <- tokens[2]
      x <- sprintf("%s(%s)", cls, chains)
    }
  }
  
  # 4. Normalize space format 'PC 16:0_18:1' -> 'PC(16:0_18:1)' or 'PC 34:1' -> 'PC(34:1)' or 'ACar 26:6' -> 'ACar(26:6)'
  if (grepl("^[A-Za-z0-9_]+\\s+[0-9]+:[0-9]+(/[0-9]+:[0-9]+|_[0-9]+:[0-9]+)?$", x, perl = TRUE) && !grepl("\\(", x)) {
    tokens <- strsplit(x, "\\s+")[[1]]
    x <- sprintf("%s(%s)", tokens[1], tokens[2])
  }
  
  return(list(original = orig, clean = x, is_internal_standard = is_is, standard_tag = std_tag, adduct = adduct))
}

parse_lipid_name_v2 <- function(lipid_name) {
  if (is.null(lipid_name) || length(lipid_name) == 0) return(NULL)
  res_df <- parse_lipid_names_bulk(lipid_name, mode = "Global Lipidomics")
  res_df[1, ]
}




parse_lipid_names_bulk <- function(lipid_names, mode = "Global Lipidomics", custom_remaps = list()) {
  unique_names <- unique(lipid_names)
  
  parsed_list <- lapply(unique_names, function(lipid_name) {
    if (is.null(lipid_name) || is.na(lipid_name) || !nzchar(trimws(lipid_name))) {
      return(list(
        Lipid_Name = lipid_name, Clean_Name = NA_character_,
        is_internal_standard = FALSE, standard_tag = NA_character_, adduct = NA_character_,
        subclass = "Misc", hyperclass = "Misc", lipid_class = "Misc", modification = "standard",
        resolution_tier = "Tier 1: Category/Unassigned", parsing_status = "unparsed",
        suggested_candidates = "",
        nCchain1 = NA_real_, DBchain1 = NA_real_, nCchain2 = NA_real_, DBchain2 = NA_real_,
        Chain1_Class = NA_character_, Chain2_Class = NA_character_, Composite_Class = "Unclassified",
        Total_Carbons = NA_real_, Total_DB = NA_real_,
        Has_SCFA = FALSE, Has_MCFA = FALSE, Has_LCFA = FALSE, Has_VLCFA = FALSE,
        Has_SFA = FALSE, Has_MUFA = FALSE, Has_PUFA = FALSE,
        Has_AA = FALSE, Has_EPA = FALSE, Has_DHA = FALSE,
        Immune_Role = NA_character_, Biosynthetic_Origin = NA_character_
      ))
    }
    
    # Tier 1: Pre-Cleaner & Adduct / Isotope Detection
    clean_res <- clean_lipid_name(lipid_name)
    cleaned_str <- clean_res$clean
    
    # Check for manual custom remap override
    custom_class_override <- NULL
    if (!is.null(custom_remaps) && length(custom_remaps) > 0) {
      if (lipid_name %in% names(custom_remaps)) {
        custom_class_override <- custom_remaps[[lipid_name]]
      } else if (!is.na(cleaned_str) && cleaned_str %in% names(custom_remaps)) {
        custom_class_override <- custom_remaps[[cleaned_str]]
      }
    }
    
    chain_block_match <- regmatches(cleaned_str, regexpr("(?<=\\().*(?=\\))", cleaned_str, perl = TRUE))
    
    chain1_len <- NA_real_; chain1_db <- NA_real_
    chain2_len <- NA_real_; chain2_db <- NA_real_
    total_c_override <- NA_real_; total_db_override <- NA_real_
    resolution_tier <- "Tier 1: Category/Unassigned"
    parsing_status <- "unparsed"
    
    parse_one_chain <- function(x) {
      mt <- regexpr("(\\d+):(\\d+)", x)
      if (mt > -1) {
        spl <- strsplit(regmatches(x, mt), ":")[[1]]
        if (length(spl) == 2) return(as.numeric(spl))
      }
      return(c(NA_real_, NA_real_))
    }
    
    if (length(chain_block_match) > 0) {
      chain_tokens <- strsplit(gsub("/", "_", chain_block_match), "_+")[[1]]
      is_fa <- grepl("^FA", chain_tokens)
      
      if (any(is_fa)) {
        # TAG / DAG neutral loss format e.g. TAG(40:0_FA14:0)
        fa_tok <- chain_tokens[is_fa][1]
        oth_tok <- chain_tokens[!is_fa][1]
        fa_p <- parse_one_chain(fa_tok)
        oth_p <- parse_one_chain(oth_tok)
        chain1_len <- fa_p[1]; chain1_db <- fa_p[2]
        total_c_override <- sum(fa_p[1], oth_p[1], na.rm = TRUE)
        total_db_override <- sum(fa_p[2], oth_p[2], na.rm = TRUE)
        resolution_tier <- "Tier 4: Molecular Species"
        parsing_status <- "fully_resolved"
      } else if (length(chain_tokens) >= 2) {
        p1 <- parse_one_chain(chain_tokens[1])
        if (!is.na(p1[1]) && p1[1] > 34 && length(chain_tokens) >= 2 && grepl("CL", cleaned_str, ignore.case=TRUE)) {
          # CL precursor sum format (e.g. CL(72:0_18:0))
          p2 <- parse_one_chain(chain_tokens[2])
          chain1_len <- p2[1]; chain1_db <- p2[2]
          total_c_override <- p1[1]; total_db_override <- p1[2]
          resolution_tier <- "Tier 3: Sum Composition"
          parsing_status <- "sum_composition"
        } else {
          p2 <- parse_one_chain(chain_tokens[2])
          chain1_len <- p1[1]; chain1_db <- p1[2]
          chain2_len <- p2[1]; chain2_db <- p2[2]
          resolution_tier <- "Tier 4: Molecular Species"
          parsing_status <- "fully_resolved"
        }
      } else if (length(chain_tokens) == 1) {
        p1 <- parse_one_chain(chain_tokens[1])
        raw_head <- strsplit(cleaned_str, "[\\(_\\s]")[[1]][1]
        single_chain_classes <- c("LPC", "LPE", "LPG", "LPI", "LPS", "LPA", "CE", "ChE", "ACar", "CAR", "FA", "FFA", "MG", "MAG")
        if (toupper(raw_head) %in% toupper(single_chain_classes)) {
          chain1_len <- p1[1]; chain1_db <- p1[2]
          resolution_tier <- "Tier 4: Molecular Species"
          parsing_status <- "fully_resolved"
        } else {
          total_c_override <- p1[1]
          total_db_override <- p1[2]
          resolution_tier <- "Tier 3: Sum Composition"
          parsing_status <- "sum_composition"
        }
      }
    } else {
      # Shorthand format without parentheses: e.g. "ACar 26:6", "PC 34:1"
      mt <- regexpr("(\\d+):(\\d+)$", cleaned_str)
      if (mt > -1) {
        spl <- strsplit(regmatches(cleaned_str, mt), ":")[[1]]
        if (length(spl) == 2) {
          total_c_override <- as.numeric(spl[1])
          total_db_override <- as.numeric(spl[2])
          resolution_tier <- "Tier 3: Sum Composition"
          parsing_status <- "sum_composition"
        }
      }
    }
    
    # Tier 2 & 3: Base Class Identification & Candidate Suggestion
    suggested_candidates <- character(0)
    if (!is.null(custom_class_override) && nzchar(custom_class_override)) {
      # Use custom user remap override
      class_token <- custom_class_override
      subclass <- if (class_token %in% names(class_map)) class_map[[class_token]] else class_token
      if (parsing_status == "unparsed") parsing_status <- "class_only"
    } else {
      raw_token <- strsplit(cleaned_str, "[\\(_\\s]")[[1]][1]
      matching_idx <- which(tolower(names(class_map)) == tolower(raw_token))
      
      if (length(matching_idx) > 0) {
        class_token <- names(class_map)[matching_idx[1]]
        subclass <- class_map[[class_token]]
      } else {
        class_token <- "Misc"
        for (kc in names(class_map)) {
          if (grepl(paste0("^", kc), cleaned_str, ignore.case = TRUE)) {
            if (kc == "CE" && grepl("^Cer", cleaned_str, ignore.case = TRUE)) next
            class_token <- kc
            break
          }
        }
        if (class_token %in% names(class_map)) {
          subclass <- class_map[[class_token]]
        } else {
          subclass <- "Misc"
          # Suggest closest matching LIPID MAPS classes
          dists <- utils::adist(tolower(raw_token), tolower(names(class_map)))[1, ]
          best_cand_idx <- order(dists)[1:min(3, length(dists))]
          suggested_candidates <- names(class_map)[best_cand_idx]
          if (parsing_status == "unparsed") {
            parsing_status <- "ambiguous"
          }
        }
      }
    }
    
    # Modification Detection & Subclass Refinement
    modification <- "standard"
    if (grepl("\\(P-", cleaned_str)) {
      modification <- "plasmalogen"
      if (subclass == "GP_PE") subclass <- "GP_PE_P"
    } else if (grepl("\\(O-", cleaned_str)) {
      modification <- "ether"
      if (subclass == "GP_PE") subclass <- "GP_PE_E"
    } else if (grepl("Cer\\(d|SM\\(d", cleaned_str)) {
      sphingoid_match <- regmatches(cleaned_str, regexpr("d\\d+:\\d+", cleaned_str))
      if (length(sphingoid_match) > 0) {
        saturation_match <- regmatches(sphingoid_match, regexpr("(?<=:)\\d+", sphingoid_match, perl = TRUE))
        if (length(saturation_match) > 0) {
          saturation_val <- as.integer(saturation_match)
          if (saturation_val == 0) {
            modification <- "dihydro"
            if (subclass == "SP_Cer") subclass <- "SP_Cer_dh"
            if (subclass == "SP_SM") subclass <- "SP_SM_dh"
          } else {
            modification <- "mature"
            if (subclass == "SP_Cer_dh") subclass <- "SP_Cer"
            if (subclass == "SP_SM_dh") subclass <- "SP_SM"
          }
        }
      }
    }
    
    # Hyperclass Lookup
    hyperclass <- if (subclass %in% names(REVERSE_HYPERCLASS_MAP)) unname(REVERSE_HYPERCLASS_MAP[subclass]) else "Misc"
    
    # Chain classifications
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
    
    Has_AA <- (!is.na(chain1_len) & chain1_len == 20 & !is.na(chain1_db) & chain1_db == 4) |
              (!is.na(chain2_len) & chain2_len == 20 & !is.na(chain2_db) & chain2_db == 4)
    Has_EPA <- (!is.na(chain1_len) & chain1_len == 20 & !is.na(chain1_db) & chain1_db == 5) |
               (!is.na(chain2_len) & chain2_len == 20 & !is.na(chain2_db) & chain2_db == 5)
    Has_DHA <- (!is.na(chain1_len) & chain1_len == 22 & !is.na(chain1_db) & chain1_db == 6) |
               (!is.na(chain2_len) & chain2_len == 22 & !is.na(chain2_db) & chain2_db == 6)
    
    Total_Carbons <- if (!is.na(total_c_override)) total_c_override else if (is.na(chain1_len) && is.na(chain2_len)) NA_real_ else sum(chain1_len, chain2_len, na.rm = TRUE)
    Total_DB <- if (!is.na(total_db_override)) total_db_override else if (is.na(chain1_db) && is.na(chain2_db)) NA_real_ else sum(chain1_db, chain2_db, na.rm = TRUE)
    
    # Final status reconciliation
    if (subclass == "Misc" && parsing_status != "ambiguous") {
      parsing_status <- "unparsed"
    } else if (subclass != "Misc" && parsing_status == "unparsed") {
      parsing_status <- "class_only"
      resolution_tier <- "Tier 2: Class Level"
    }
    
    list(
      Lipid_Name = lipid_name, Clean_Name = cleaned_str,
      is_internal_standard = clean_res$is_internal_standard,
      standard_tag = clean_res$standard_tag,
      adduct = clean_res$adduct,
      subclass = subclass, hyperclass = hyperclass,
      lipid_class = subclass, modification = modification,
      resolution_tier = resolution_tier, parsing_status = parsing_status,
      suggested_candidates = paste(suggested_candidates, collapse = ", "),
      nCchain1 = chain1_len, DBchain1 = chain1_db,
      nCchain2 = chain2_len, DBchain2 = chain2_db,
      Chain1_Class = ch1_class$class_tag, Chain2_Class = ch2_class$class_tag,
      Composite_Class = composite_class,
      Total_Carbons = Total_Carbons, Total_DB = Total_DB,
      Has_SCFA = Has_SCFA, Has_MCFA = Has_MCFA, Has_LCFA = Has_LCFA, Has_VLCFA = Has_VLCFA,
      Has_SFA = Has_SFA, Has_MUFA = Has_MUFA, Has_PUFA = Has_PUFA,
      Has_AA = Has_AA, Has_EPA = Has_EPA, Has_DHA = Has_DHA,
      Immune_Role = NA_character_, Biosynthetic_Origin = NA_character_
    )
  })
  
  cols <- list()
  for (n in names(parsed_list[[1]])) {
    raw_vals <- lapply(parsed_list, `[[`, n)
    flat_vals <- sapply(raw_vals, function(x) {
      if (is.null(x)) return(NA)
      if (is.list(x) || is.data.frame(x)) {
        val <- x[[1]]
        if (is.null(val)) NA else val
      } else {
        x[1]
      }
    })
    if (n %in% c("Lipid_Name", "Clean_Name", "subclass", "hyperclass", "lipid_class", "modification",
                 "resolution_tier", "parsing_status", "suggested_candidates", "standard_tag", "adduct",
                 "Chain1_Class", "Chain2_Class", "Composite_Class", "Immune_Role", "Biosynthetic_Origin")) {
      cols[[n]] <- as.character(flat_vals)
    } else if (n %in% c("nCchain1", "DBchain1", "nCchain2", "DBchain2", "Total_Carbons", "Total_DB")) {
      cols[[n]] <- as.numeric(flat_vals)
    } else {
      cols[[n]] <- as.logical(flat_vals)
    }
  }
  
  unique_df <- tibble::as_tibble(cols)
  matched_indices <- match(lipid_names, unique_names)
  unique_df[matched_indices, ]
}

generate_empty_plot_message <- function(msg, title = NULL) {
  # Disambiguate automatic titles based on message content
  if (is.null(title)) {
    if (grepl("No significant", msg, ignore.case = TRUE)) {
      title <- "No Statistically Significant Features Found"
    } else if (grepl("Differential Expression", msg, fixed = TRUE) || grepl("select comparison groups", msg, ignore.case = TRUE)) {
      title <- "Differential Expression: Select Cohorts to Compare"
    }
  }
  
  # Wrap lines individually to preserve intentional linebreaks and bullet formatting
  lines <- unlist(strsplit(msg, "\n", fixed = TRUE))
  wrapped_lines <- sapply(lines, function(line) {
    if (nchar(trimws(line)) == 0) return("")
    paste(strwrap(line, width = 52), collapse = "\n")
  })
  wrapped_msg <- paste(wrapped_lines, collapse = "\n")
  
  p <- ggplot() + 
    theme_void() + 
    xlim(1, 7) + 
    ylim(1, 7)
    
  if (!is.null(title)) {
    num_lines <- length(unlist(strsplit(wrapped_msg, "\n", fixed = TRUE)))
    y_title <- if (num_lines >= 4) 5.1 else 4.65
    y_msg <- if (num_lines >= 4) 3.5 else 3.65
    msg_size <- if (num_lines >= 4) 3.9 else 4.2
    
    p <- p +
      annotate("text", x = 4, y = y_title, label = title, color = "#1e293b", size = 5.4, fontface = "bold", hjust = 0.5, vjust = 0.5) +
      annotate("text", x = 4, y = y_msg, label = wrapped_msg, color = "#b45309", size = msg_size, fontface = "bold", hjust = 0.5, vjust = 0.5)
  } else {
    p <- p + 
      annotate("text", x = 4, y = 4, label = wrapped_msg, color = "orange", size = 5, fontface = "bold", hjust = 0.5, vjust = 0.5)
  }
  return(p)
}

# -------------------------------------------------------------
# Collapsible Tab Introduction Card Helper
# -------------------------------------------------------------
render_tab_intro_card <- function(title, subtitle = NULL, bullets = NULL, collapse_id = "intro_collapse", extra = NULL) {
  wrapper_id <- paste0(collapse_id, "_wrapper")
  
  tags$div(
    id = wrapper_id,
    class = "tab-intro-wrapper",
    
    # 1. Collapsed state: Only the arrow head button in the top right area
    tags$div(
      class = "tab-intro-reexpand-bar",
      tags$button(
        class = "btn intro-toggle-btn intro-reexpand-btn",
        type = "button",
        title = "Show Introduction",
        `aria-label` = "Show Introduction",
        tags$i(class = "fa fa-chevron-down intro-toggle-chevron")
      )
    ),
    
    # 2. Expanded state: Full Intro Card
    tags$div(
      id = collapse_id,
      class = "tab-intro-card card mb-3 border-0 bg-light-subtle",
      tags$div(
        class = "card-body py-2 px-3",
        tags$div(
          class = "d-flex justify-content-between align-items-center tab-intro-header",
          style = "cursor: pointer; user-select: none;",
          tags$h5(title, class = "fw-bold mb-0 d-flex align-items-center gap-2", style = "font-size: 1.05rem;"),
          tags$button(
            class = "btn intro-toggle-btn intro-collapse-btn",
            type = "button",
            title = "Hide Introduction",
            `aria-label` = "Hide Introduction",
            tags$i(class = "fa fa-chevron-up intro-toggle-chevron")
          )
        ),
        tags$div(
          class = "tab-intro-body mt-2 pt-2 border-top border-light-subtle",
          if (!is.null(subtitle)) tags$p(class = "text-muted small mb-0", subtitle),
          if (!is.null(bullets) && length(bullets) > 0) {
            tags$ul(class = "text-muted small mb-0", style = "padding-left: 20px; margin-top: 5px;", bullets)
          },
          extra
        )
      )
    )
  )
}
assign("render_tab_intro_card", render_tab_intro_card, envir = .GlobalEnv)

# --- 3. SOURCE MODULES & OTHER R FILES ---
# Load Modules
source("R/utils_lipid_genes.R")
source("R/utils_data.R")
source("R/utils_colors.R")
source("R/utils_vis.R")
source("R/modules/utils_stats.R")
source("R/modules/utils_targeted_lipids.R")
source("R/utils_memento.R")
source("R/modules/97_statistics_module.R")
source("R/modules/1_shared_data_module.R")
source("R/modules/2_qc_boxplot_module.R")
source("R/modules/4_heatmap_module.R")
source("R/modules/5_barchart_module.R")
source("R/modules/6_volcano_module.R")
source("R/modules/7_lsea_module.R")
source("R/modules/8_structural_module.R")
source("R/modules/9_logratio_module.R")
source("R/modules/10_fla_module.R")
source("R/modules/11_longitudinal_module.R")
source("R/modules/12_structural_grid_module.R")
source("R/modules/98_system_debug_module.R")
source("R/modules/13_pathway_module.R")
source("R/modules/14_cellular_org_module.R")
source("R/modules/15_math_proof_module.R")
source("R/modules/99_export_studio_module.R")



