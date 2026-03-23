# R/utils_colors.R
# Color Utilities.

# --- Hardcoded Palettes ---
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

HYPERCLASS_MAP_COLORS <- c(
  "GP" = "#4E79A7", "FA" = "#59A14F", "ST" = "#9C755F",
  "SP" = "#B07AA1", "GL" = "#F1C40F", "Misc" = "#B0B0B0",
  "AA" = "#E15759", "EPA" = "#76B7B2", "DHA" = "#EDC948", "DPA" = "#F28E2B"
)

#' Initialize Color Map
#' 
#' Creates a consistent color mapping for a given set of groups.
#' Guaranteed to return specific colors for specific known groups if defined,
#' otherwise assigns from a high-quality qualitative palette.
#'
#' @param groups Character vector of group names
#' @param palette_name Name of the RColorBrewer or Viridis palette to use for unknown groups
#' @return Named character vector of colors
initialize_color_map <- function(groups, palette_name = "Set1") {
  unique_groups <- sort(unique(groups))
  n <- length(unique_groups)
  if (n == 0) return(character(0))
  
 # TODO: Add specific overrides here if needed
 # e.g. if ("Control" %in% unique_groups) ...
  
  cols <- if (n <= 9) {
    RColorBrewer::brewer.pal(n = max(3, n), name = palette_name)[1:n]
  } else {
  # Interpolate if too many
    colorRampPalette(RColorBrewer::brewer.pal(9, palette_name))(n)
  }
  
  stats::setNames(cols, unique_groups)
}

#' Generate Class Colors
#'
#' Scans metadata and assigns strict colors to known groups (Conditions/Populations).
#' uses initialize_color_map for consistency.
#'
#' @param metadata Data frame containing metadata columns
#' @return A list of named color vectors (one for each relevant column)
generate_class_colors <- function(metadata) {
  req(metadata)
  
 # 1. Condition
  conds <- sort(unique(metadata$Condition))
 # Use Set1 for Conditions
  cond_colors <- initialize_color_map(conds, "Set1")
  
 # 2. Population (if exists)
  pop_colors <- if("Population" %in% names(metadata)) {
     pops <- sort(unique(metadata$Population))
     initialize_color_map(pops, "Dark2")
  } else NULL
  
 # 3. Combined Group (Condition_Population)
  group_colors <- if("Condition" %in% names(metadata) && "Population" %in% names(metadata)) {
   # Create composite
     groups <- unique(paste(metadata$Condition, metadata$Population, sep="_"))
   # Remove _NA if any
     groups <- gsub("_NA$", "", groups)
     initialize_color_map(groups, "Set2")
  } else NULL

  list(
    Condition = cond_colors,
    Population = pop_colors,
    "Condition & Population" = group_colors,
    "Lipid Class" = CLASS_MAP_COLORS,
    "Lipid Hyperclass" = HYPERCLASS_MAP_COLORS
  )
}
