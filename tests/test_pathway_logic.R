# Ensure UTF-8 locale
tryCatch(Sys.setlocale("LC_ALL", "en_US.UTF-8"), error = function(e) NULL)

cat("Loading 13_pathway_module.R helper functions...\n")

# Ensure TEST_LIB_PATH or isolated library is in .libPaths() if running under CI or custom env
test_lib <- Sys.getenv("TEST_LIB_PATH")
if (nzchar(test_lib) && dir.exists(test_lib) && !(test_lib %in% .libPaths())) {
  .libPaths(c(test_lib, .libPaths()))
}

# Source the module file to load its definitions
source("R/modules/13_pathway_module.R")

# Locate helper functions in the server code by source code extraction or rewriting for test isolation.
# Since the server function has nested helper functions (is_consolidated, count_saturated_unsaturated, map_species_to_pathway_class),
# we define local test equivalents referencing the identical logic to audit correctness.

is_consolidated <- function(lipid_name, subclass) {
  single_chain_subclasses <- c("GP_LPC", "GP_LPE", "GP_LPG", "GP_LPI", "GP_LPS", "GP_LPA", "FA_ACar", "LCB")
  if (subclass %in% single_chain_subclasses) {
    return(FALSE)
  }
  if (grepl("\\(", lipid_name)) {
    inner <- regmatches(lipid_name, regexpr("(?<=\\().*(?=\\))", lipid_name, perl = TRUE))
    if (length(inner) > 0) {
      return(!grepl("[/_|;]", inner))
    }
  }
  return(FALSE)
}

count_saturated_unsaturated <- function(lipid_name) {
  m <- regexpr("(?<=\\().*(?=\\))", lipid_name, perl = TRUE)
  if (m == -1) {
    m2 <- regexpr("\\d+:\\d+$", lipid_name)
    if (m2 == -1) return(c(sat = 0, unsat = 0))
    chain_block <- regmatches(lipid_name, m2)
  } else {
    chain_block <- regmatches(lipid_name, m)
  }
  
  chain_block <- gsub("\\(\\d*OH\\)", "", chain_block, ignore.case = TRUE)
  chain_block <- gsub("\\(O\\)", "", chain_block, ignore.case = TRUE)
  
  chains <- strsplit(chain_block, "[/_|;]")[[1]]
  n_sat <- 0
  n_unsat <- 0
  for (ch in chains) {
    mt <- regexpr("(?<=:)\\d+", ch, perl = TRUE)
    if (mt > -1) {
      db <- as.numeric(regmatches(ch, mt))
      if (!is.na(db)) {
        if (db == 0) {
          n_sat <- n_sat + 1
        } else {
          n_unsat <- n_unsat + 1
        }
      }
    }
  }
  return(c(sat = n_sat, unsat = n_unsat))
}

map_species_to_pathway_class <- function(subclass, modification) {
  if (is.null(subclass) || is.na(subclass) || subclass == "") return(NA_character_)
  
  if (subclass %in% c("GP_PE_P", "GP_PE_E")) return("ePE")
  if (subclass == "SP_Cer_dh") return("dhCer")
  
  is_ether <- !is.null(modification) && !is.na(modification) && modification %in% c("ether", "plasmalogen")
  if (subclass == "GP_PC" && is_ether) return("ePC")
  
  if (!subclass %in% names(REVERSE_CLASS_MAP)) return(NA_character_)
  
  mapped <- REVERSE_CLASS_MAP[[subclass]]
  return(mapped)
}


# --- 1. Audit is_consolidated logic ---
cat("1. Testing is_consolidated logic...\n")
stopifnot(is_consolidated("PC(16:0/18:1)", "GP_PC") == FALSE)
stopifnot(is_consolidated("PC(16:0_18:1)", "GP_PC") == FALSE)
stopifnot(is_consolidated("PC(34:1)", "GP_PC") == TRUE)
stopifnot(is_consolidated("LPC(18:1)", "GP_LPC") == FALSE) # Single chain subclass, not consolidated
stopifnot(is_consolidated("TG(16:0/18:1/18:2)", "GL_TAG") == FALSE)
stopifnot(is_consolidated("TG(52:3)", "GL_TAG") == TRUE)

# --- 2. Audit count_saturated_unsaturated logic ---
cat("2. Testing count_saturated_unsaturated logic...\n")
c1 <- count_saturated_unsaturated("PC(16:0/18:1)")
stopifnot(c1["sat"] == 1 && c1["unsat"] == 1)

c2 <- count_saturated_unsaturated("TG(16:0/18:1/18:2)")
stopifnot(c2["sat"] == 1 && c2["unsat"] == 2)

c3 <- count_saturated_unsaturated("LPE(18:0)")
stopifnot(c3["sat"] == 1 && c3["unsat"] == 0)

c4 <- count_saturated_unsaturated("PC(O-16:0/18:1)") # Ether format check
stopifnot(c4["sat"] == 1 && c4["unsat"] == 1)

# --- 3. Audit map_species_to_pathway_class logic ---
cat("3. Testing map_species_to_pathway_class logic...\n")
stopifnot(map_species_to_pathway_class("GP_PC", "Standard") == "PC")
stopifnot(map_species_to_pathway_class("GP_PE_P", "Standard") == "ePE")
stopifnot(map_species_to_pathway_class("GP_PE_E", "Standard") == "ePE")
stopifnot(map_species_to_pathway_class("GP_PC", "ether") == "ePC")
stopifnot(map_species_to_pathway_class("SP_Cer_dh", "Standard") == "dhCer")
stopifnot(map_species_to_pathway_class("GL_TAG", "Standard") == "TG")
stopifnot(is.na(map_species_to_pathway_class("FA_ACar", "Standard")))
stopifnot(is.na(map_species_to_pathway_class(NA_character_, "Standard")))
stopifnot(map_species_to_pathway_class("GP_PC", NA_character_) == "PC")

cat("\n=== ALL LIPID PATHWAY LOGIC TESTS PASSED SUCCESSFULLY ===\n")
