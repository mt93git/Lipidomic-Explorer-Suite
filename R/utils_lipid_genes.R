# R/utils_lipid_genes.R
# Utilities to load and parse lipid-to-gene mapping databases.
# Covers: subclasses, structural features, ratios, flippases, ABC transporters, intracellular transfer, transcriptional regulators, CYP/LOX enzymes, cell adhesion, and cytoskeletal GTPases.

# Global environment cache for mappings
.LIPID_GENE_CACHE <- new.env(parent = emptyenv())

#' Load all CSV mapping tables into memory
#' @return Logical indicating success
load_lipid_gene_mappings <- function() {
  # File mapping definitions
  filenames <- list(
    subclasses = "lipid_subclasses_mapping.csv",
    structural = "lipid_structural_features_mapping.csv",
    ratios = "lipid_functional_ratios_mapping.csv",
    abc_transporters = "lipid_abc_transporters_mapping.csv",
    intracellular_transfer = "lipid_intracellular_transfer_mapping.csv",
    transcriptional_regulators = "lipid_transcriptional_regulators_mapping.csv",
    cyp_lox_enzymes = "lipid_cyp_lox_enzymes_mapping.csv",
    cell_adhesion_receptors = "lipid_cell_adhesion_receptors_mapping.csv",
    cytoskeletal_gtpases = "lipid_cytoskeletal_gtpases_mapping.csv",
    flippases = "lipid_flippases_scramblases_mapping.csv",
    biological_links = "lipid_gene_biological_links.csv",
    genes_ontological_roles = "lipid_genes_ontological_roles.csv"
  )
  
  success <- TRUE
  for (name in names(filenames)) {
    fname <- filenames[[name]]
    candidates <- c(
      file.path("data", fname),
      file.path(getwd(), "data", fname),
      file.path(dirname(getwd()), "data", fname),
      file.path(dirname(dirname(getwd())), "data", fname)
    )
    valid_p <- candidates[file.exists(candidates)][1]
    if (!is.na(valid_p) && file.exists(valid_p)) {
      tryCatch({
        df <- read.csv(valid_p, stringsAsFactors = FALSE, check.names = FALSE)
        assign(name, df, envir = .LIPID_GENE_CACHE)
      }, error = function(e) {
        warning(sprintf("Failed to read mapping file %s: %s", valid_p, e$message))
        success <<- FALSE
      })
    } else {
      success <- FALSE
    }
  }
  return(success)
}

# Helper to split and clean comma-separated gene strings
.clean_gene_list <- function(gene_string) {
  if (is.null(gene_string) || is.na(gene_string) || gene_string == "") {
    return(character(0))
  }
  genes <- strsplit(gene_string, ",")[[1]]
  # Remove whitespace and empty entries
  genes <- trimws(genes)
  genes <- genes[genes != ""]
  return(unique(genes))
}

#' Retrieve genes for a specific lipid subclass
#' @param subclass_name Name of the subclass (e.g., "Acylcarnitine")
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_lipid_subclass_genes <- function(subclass_name, species = "mouse") {
  if (!exists("subclasses", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("subclasses", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  row <- df[tolower(df$Subclass_Name) == tolower(subclass_name), ]
  if (nrow(row) == 0) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  return(.clean_gene_list(row[[col_name]]))
}

#' Retrieve genes for a structural feature
#' @param feature_name Name of the feature (e.g., "Elongation_VLCFA")
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_lipid_structural_genes <- function(feature_name, species = "mouse") {
  if (!exists("structural", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("structural", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  row <- df[tolower(df$Feature_Name) == tolower(feature_name), ]
  if (nrow(row) == 0) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  return(.clean_gene_list(row[[col_name]]))
}

#' Retrieve genes associated with a functional ratio
#' @param ratio_name Name of the ratio (e.g., "PE/PC_Index")
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_lipid_ratio_genes <- function(ratio_name, species = "mouse") {
  if (!exists("ratios", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("ratios", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  row <- df[tolower(df$Ratio_Name) == tolower(ratio_name), ]
  if (nrow(row) == 0) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  return(.clean_gene_list(row[[col_name]]))
}

#' Retrieve genes for a specific ABC transporter
#' @param transporter_name Name of the transporter (e.g., "ABCA7")
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_abc_transporter_genes <- function(transporter_name, species = "mouse") {
  if (!exists("abc_transporters", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("abc_transporters", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  row <- df[tolower(df$Transporter_Name) == tolower(transporter_name), ]
  if (nrow(row) == 0) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  return(.clean_gene_list(row[[col_name]]))
}

#' Retrieve genes for an intracellular transfer carrier
#' @param carrier_name Name of the carrier group (e.g., "STARD11_CERT_Ceramide")
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_intracellular_transfer_genes <- function(carrier_name, species = "mouse") {
  if (!exists("intracellular_transfer", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("intracellular_transfer", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  row <- df[tolower(df$Carrier_Name) == tolower(carrier_name), ]
  if (nrow(row) == 0) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  return(.clean_gene_list(row[[col_name]]))
}

#' Retrieve genes for a transcriptional regulator axis
#' @param regulator_axis Name of the axis (e.g., "SREBP_Axis")
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_transcriptional_regulator_genes <- function(regulator_axis, species = "mouse") {
  if (!exists("transcriptional_regulators", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("transcriptional_regulators", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  row <- df[tolower(df$Regulator_Axis) == tolower(regulator_axis), ]
  if (nrow(row) == 0) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  return(.clean_gene_list(row[[col_name]]))
}

#' Retrieve genes for a CYP/LOX enzyme system
#' @param enzyme_system Name of the system (e.g., "CYP_Epoxygenases_Cardiovascular")
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_cyp_lox_genes <- function(enzyme_system, species = "mouse") {
  if (!exists("cyp_lox_enzymes", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("cyp_lox_enzymes", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  row <- df[tolower(df$Enzyme_System) == tolower(enzyme_system), ]
  if (nrow(row) == 0) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  return(.clean_gene_list(row[[col_name]]))
}

#' Retrieve genes for a cell adhesion receptor system
#' @param adhesion_system Name of the system (e.g., "Integrins_Leukocyte_Adhesion")
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_cell_adhesion_genes <- function(adhesion_system, species = "mouse") {
  if (!exists("cell_adhesion_receptors", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("cell_adhesion_receptors", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  row <- df[tolower(df$Adhesion_System) == tolower(adhesion_system), ]
  if (nrow(row) == 0) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  return(.clean_gene_list(row[[col_name]]))
}

#' Retrieve genes for a cytoskeletal GTPase engine
#' @param gtpase_engine Name of the engine (e.g., "Rho_GTPases_Morphology")
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_cytoskeletal_gtpase_genes <- function(gtpase_engine, species = "mouse") {
  if (!exists("cytoskeletal_gtpases", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("cytoskeletal_gtpases", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  row <- df[tolower(df$GTPase_Engine) == tolower(gtpase_engine), ]
  if (nrow(row) == 0) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  return(.clean_gene_list(row[[col_name]]))
}

#' Retrieve flippase and scramblase genes
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_flippase_scramblase_genes <- function(species = "mouse") {
  if (!exists("flippases", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("flippases", envir = .LIPID_GENE_CACHE)
  if (is.null(df)) return(character(0))
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Gene" else "Human_Gene"
  return(unique(na.omit(df[[col_name]])))
}

#' Get detailed list of all functional ratios (for UI selectors)
#' @return Dataframe of ratio metadata
get_all_functional_ratios <- function() {
  if (!exists("ratios", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  get("ratios", envir = .LIPID_GENE_CACHE)
}

#' Retrieve a consolidated unique list of all regulatory genes across the entire database
#' @param species Organism target: "human" or "mouse"
#' @return Character vector of gene symbols
get_all_database_genes <- function(species = "mouse") {
  if (!exists("subclasses", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  
  col_name <- if (tolower(species) == "mouse") "Mouse_Genes" else "Human_Genes"
  tables <- c("subclasses", "structural", "ratios", "abc_transporters", 
              "intracellular_transfer", "transcriptional_regulators", 
              "cyp_lox_enzymes", "cell_adhesion_receptors", "cytoskeletal_gtpases")
  
  all_genes <- character(0)
  for (t in tables) {
    if (exists(t, envir = .LIPID_GENE_CACHE)) {
      df <- get(t, envir = .LIPID_GENE_CACHE)
      if (!is.null(df) && col_name %in% colnames(df)) {
        for (val in df[[col_name]]) {
          all_genes <- c(all_genes, .clean_gene_list(val))
        }
      }
    }
  }
  
  # Nagata flippases scramblases
  if (exists("flippases", envir = .LIPID_GENE_CACHE)) {
    df_flip <- get("flippases", envir = .LIPID_GENE_CACHE)
    flip_col <- if (tolower(species) == "mouse") "Mouse_Gene" else "Human_Gene"
    if (!is.null(df_flip) && flip_col %in% colnames(df_flip)) {
      all_genes <- c(all_genes, df_flip[[flip_col]])
    }
  }
  
  return(unique(na.omit(all_genes[all_genes != ""])))
}

#' Retrieve clinical explanation for a gene-lipidmetric interaction
#' @param gene_symbol Name of the gene (e.g., "ELOVL6")
#' @param metric_name Name of the metric (e.g., "Elongation_LCFA_SFA_MUFA")
#' @param category Category of the metric: "pathway", "subclass", "structural", or "ratio"
#' @return List containing Mechanism_Summary and Sources
get_lipid_gene_link_description <- function(gene_symbol, metric_name, category = NULL) {
  if (!exists("biological_links", envir = .LIPID_GENE_CACHE)) {
    load_lipid_gene_mappings()
  }
  df <- get("biological_links", envir = .LIPID_GENE_CACHE)
  
  # 1. Try to find direct match in the database
  if (!is.null(df)) {
    row <- df[tolower(df$Gene_Symbol) == tolower(gene_symbol) & tolower(df$Metric_Name) == tolower(metric_name), ]
    if (nrow(row) > 0) {
      return(list(
        Mechanism_Summary = row$Mechanism_Summary[1],
        Sources = row$Sources[1]
      ))
    }
  }
  
  # 2. Look up the specific gene's ontological role
  gene_role <- NULL
  if (exists("genes_ontological_roles", envir = .LIPID_GENE_CACHE)) {
    df_roles <- get("genes_ontological_roles", envir = .LIPID_GENE_CACHE)
    if (!is.null(df_roles)) {
      match_row <- df_roles[tolower(df_roles$Gene_Symbol) == tolower(gene_symbol), ]
      if (nrow(match_row) > 0) {
        gene_role <- match_row$Ontological_Role[1]
      }
    }
  }
  
  # 3. Retrieve metric general description
  metric_desc <- ""
  sources_desc <- "Database"
  
  if (!is.null(category)) {
    category <- tolower(category)
    if (category == "subclass") {
      df_sub <- get("subclasses", envir = .LIPID_GENE_CACHE)
      if (!is.null(df_sub)) {
        row_sub <- df_sub[tolower(df_sub$Subclass_Name) == tolower(metric_name), ]
        if (nrow(row_sub) > 0) {
          metric_desc <- row_sub$Description_Function[1]
          sources_desc <- row_sub$Sources[1]
        }
      }
    } else if (category == "structural") {
      df_struct <- get("structural", envir = .LIPID_GENE_CACHE)
      if (!is.null(df_struct)) {
        row_struct <- df_struct[tolower(df_struct$Feature_Name) == tolower(metric_name), ]
        if (nrow(row_struct) > 0) {
          metric_desc <- row_struct$Mechanism_Description[1]
          sources_desc <- row_struct$Sources[1]
        }
      }
    } else if (category == "ratio") {
      df_ratio <- get("ratios", envir = .LIPID_GENE_CACHE)
      if (!is.null(df_ratio)) {
        row_ratio <- df_ratio[tolower(df_ratio$Ratio_Name) == tolower(metric_name), ]
        if (nrow(row_ratio) > 0) {
          metric_desc <- row_ratio$Biochemical_Interpretation[1]
          sources_desc <- row_ratio$Sources[1]
        }
      }
    }
  }
  
  # 4. Construct rich combined ontological description if gene role is known
  if (!is.null(gene_role)) {
    if (metric_desc != "") {
      desc <- sprintf("Gene %s %s, which is directly involved in the metabolism of the lipidomic metric %s (%s).", 
                      gene_symbol, gene_role, metric_name, metric_desc)
    } else {
      desc <- sprintf("Gene %s %s, which is associated with changes in the lipidomic metric %s.", 
                      gene_symbol, gene_role, metric_name)
    }
    return(list(
      Mechanism_Summary = desc,
      Sources = sources_desc
    ))
  }
  
  # 5. Fallback if only metric description is known
  if (metric_desc != "") {
    return(list(
      Mechanism_Summary = sprintf("Gene %s is co-expressed with the lipidomic metric %s. General biological function: %s", 
                                  gene_symbol, metric_name, metric_desc),
      Sources = sources_desc
    ))
  }
  
  # 6. Final default fallback
  return(list(
    Mechanism_Summary = sprintf("Gene %s is statistically correlated with the abundance of lipidomic metric %s, suggesting biochemical association within cellular lipid metabolic networks.", 
                                gene_symbol, metric_name),
    Sources = "Calculated Co-Expression Matrix"
  ))
}

# Auto-initialize mappings on load
load_lipid_gene_mappings()
