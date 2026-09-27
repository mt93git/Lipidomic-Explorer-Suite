# R/utils_colors.R
# Color Utilities.

# --- Hardcoded Palettes ---
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
  
  overrides <- c(
    # Combined groups
    "CCSteadyState1_Control" = "#BDBDBD",
    "SteadyState1_Exp"       = "#9ECAE1",
    "SteadyState2_Exp"       = "#3182BD",
    "PainCrisis1_Exp"        = "#FB6A4A",
    "PainCrisis2_Exp"        = "#CB181D",
    
    # Group1s
    "CCSteadyState1"         = "#BDBDBD",
    "SteadyState1"           = "#9ECAE1",
    "SteadyState2"           = "#3182BD",
    "PainCrisis1"            = "#FB6A4A",
    "PainCrisis2"            = "#CB181D"
  )
  
  cols <- sapply(unique_groups, function(g) {
    if (g %in% names(overrides)) {
      overrides[[g]]
    } else {
      NA_character_
    }
  })
  
  unmapped_indices <- which(is.na(cols))
  if (length(unmapped_indices) > 0) {
    num_unmapped <- length(unmapped_indices)
    
    # RColorBrewer palettes have different maximum number of colors (e.g. Set2 is 8, Set1 is 9, Dark2 is 8)
    max_colors <- 8 # Default fallback
    if (palette_name %in% rownames(RColorBrewer::brewer.pal.info)) {
      max_colors <- RColorBrewer::brewer.pal.info[palette_name, "maxcolors"]
    }
    
    fallback_cols <- if (num_unmapped <= max_colors) {
      RColorBrewer::brewer.pal(n = max(3, num_unmapped), name = palette_name)[1:num_unmapped]
    } else {
      colorRampPalette(RColorBrewer::brewer.pal(max_colors, palette_name))(num_unmapped)
    }
    cols[unmapped_indices] <- fallback_cols
  }
  
  return(cols)
}

#' Generate Class Colors
#'
#' Scans metadata and assigns strict colors to known groups (Group1/Group2).
#' uses initialize_color_map for consistency.
#'
#' @param metadata Data frame containing metadata columns
#' @return A list of named color vectors (one for each relevant column)
generate_class_colors <- function(metadata) {
  req(metadata)
  
 # 1. Group1
  conds <- sort(unique(metadata$Group1))
 # Use Set1 for Group1
  cond_colors <- initialize_color_map(conds, "Set1")
  
 # 2. Group2 (if exists)
  pop_colors <- if("Group2" %in% names(metadata)) {
     pops <- sort(unique(metadata$Group2))
     initialize_color_map(pops, "Dark2")
  } else NULL
  
 # 3. Combined Group (Group1_Group2)
  group_colors <- if("Group1" %in% names(metadata) && "Group2" %in% names(metadata)) {
   # Create composite
     groups <- unique(paste(metadata$Group1, metadata$Group2, sep="_"))
   # Remove _NA if any
     groups <- gsub("_NA$", "", groups)
     initialize_color_map(groups, "Set2")
  } else NULL

  list(
    Group1 = cond_colors,
    Group2 = pop_colors,
    "Group1 & Group2" = group_colors,
    "Lipid Main Class" = CLASS_MAP_COLORS,
    "Lipid Class" = CLASS_MAP_COLORS,
    "Lipid Category" = HYPERCLASS_MAP_COLORS,
    "Lipid Hyperclass" = HYPERCLASS_MAP_COLORS
  )
}

#' Merge Custom Color Overrides with Palette Fallbacks
#'
#' Preserves user-assigned group colors while filling in any newly added or unmapped groups.
#'
#' @param existing_map Named vector of current group colors
#' @param target_groups Character vector of group names to cover
#' @param palette_name Name of fallback palette
#' @return Named vector of hex colors
merge_custom_color_map <- function(existing_map, target_groups, palette_name = "Set1") {
  unique_groups <- sort(unique(target_groups))
  if (length(unique_groups) == 0) return(character(0))
  
  merged <- initialize_color_map(unique_groups, palette_name = palette_name)
  if (length(existing_map) > 0) {
    valid_overrides <- existing_map[names(existing_map) %in% unique_groups]
    valid_overrides <- valid_overrides[!is.na(valid_overrides) & valid_overrides != ""]
    if (length(valid_overrides) > 0) {
      merged[names(valid_overrides)] <- valid_overrides
    }
  }
  return(merged)
}

# --- Expert Acyl Chain Color Palettes ---
EXPERT_ACYL_CHAIN_PALETTES <- list(
  # Carbon 2 Family (Acetate - Vivid Sea Green / Turquoise)
  "2" = c("#0D9488", "#14B8A6", "#2DD4BF"),
  # Carbon 3 Family (Propionate - Coral Peach)
  "3" = c("#FB923C", "#FDBA74", "#FED7AA"),
  # Carbon 4 Family (Butyrate - Deep Forest Green)
  "4" = c("#15803D", "#16A34A", "#4ADE80"),
  # Carbon 5 Family (Valerate - Warm Amber Ochre)
  "5" = c("#D97706", "#F59E0B", "#FBBF24"),
  # Carbon 6 Family (Hexanoate - Vivid Amethyst / Deep Violet)
  "6" = c("#7E22CE", "#9333EA", "#C084FC", "#E9D5FF"),
  # Carbon 7 Family (Heptanoate - Burnt Sienna)
  "7" = c("#C2410C", "#EA580C", "#FB923C"),
  # Carbon 8 Family (Octanoate - Bright Goldenrod / Mustard)
  "8" = c("#CA8A04", "#EAB308", "#FDE047", "#FEF08A"),
  # Carbon 9 Family (Pelargonate - Warm Terracotta Bronze)
  "9" = c("#9A3412", "#C2410C", "#EA580C"),
  # Carbon 10 Family (Decanoate - Deep Pine Teal)
  "10" = c("#115E59", "#14B8A6", "#5EEAD4", "#99F6E4"),
  # Carbon 11 Family (Undecanoate - Dark Berry Rose)
  "11" = c("#881337", "#BE123C", "#FB7185"),
  # Carbon 12 Family (Laurate - Royal Cobalt Blue)
  "12" = c("#1E40AF", "#2563EB", "#60A5FA", "#BAE6FD"),
  # Carbon 13 Family (Tridecanoate - Olive Moss)
  "13" = c("#4D7C0F", "#65A30D", "#84CC16"),
  # Carbon 14 Family (Deep Cobalt Navy)
  "14" = c("#1E3A8A", "#2563EB", "#60A5FA", "#93C5FD"),
  # Carbon 15 Family (Vivid Royal Violet)
  "15" = c("#7C3AED", "#8B5CF6", "#A78BFA", "#C4B5FD"),
  # Carbon 16 Family (Crimson to Coral Red)
  "16" = c("#B91C1C", "#F87171", "#DC2626", "#EF4444", "#FCA5A5", "#FECACA"),
  # Carbon 17 Family (Warm Terracotta Rust to Bright Salmon)
  "17" = c("#C2410C", "#EA580C", "#FB923C", "#FDBA74"),
  # Carbon 18 Family (Amber Brown to Butter Cream)
  "18" = c("#B45309", "#F97316", "#FBBF24", "#FEF08A", "#F59E0B", "#FDE68A"),
  # Carbon 19 Family (Deep Olive Green to Bright Lime)
  "19" = c("#65A30D", "#84CC16", "#A3E635", "#D9F99D", "#4D7C0F", "#365314"),
  # Carbon 20 Family (Emerald, Cyan, Deep Teal, Mint, Ruby, Rose)
  "20" = c("#047857", "#06B6D4", "#0F766E", "#A5F3FC", "#BE185D", "#FB7185", "#F43F5E"),
  # Carbon 21 Family (Deep Teal to Aquamarine)
  "21" = c("#0F766E", "#14B8A6", "#2DD4BF", "#0D9488", "#115E59", "#134E4A"),
  # Carbon 22 Family (Slate, Steel, Indigo, Royal Iris, Lavender Periwinkle)
  "22" = c("#475569", "#64748B", "#4338CA", "#3730A3", "#1E1B4B", "#6366F1", "#C7D2FE", "#E0E7FF"),
  # Carbon 23 Family (Deep Wine Plum)
  "23" = c("#701A75", "#86198F", "#A21CAF", "#C026D3", "#D946EF", "#E879F9", "#F0ABFC"),
  # Carbon 24 Family (Charcoal Slate, Ocean Blue, Cyan, Electric Blue, Violet, Fuchsia)
  "24" = c("#334155", "#0284C7", "#0E7490", "#0369A1", "#2563EB", "#6D28D9", "#C026D3"),
  # Carbon 25 Family (Deep Indigo Mauve)
  "25" = c("#312E81", "#4338CA", "#4F46E5", "#6366F1", "#818CF8", "#A5B4FC", "#C7D2FE"),
  # Carbon 26 Family (VLCFA - Deep Blackberry, Vivid Magenta, Orchid, Pink)
  "26" = c("#581C87", "#D946EF", "#A21CAF", "#C026D3", "#E879F9", "#F472B6", "#FB7185", "#FDA4AF"),
  # Carbon 27 Family (Warm Ochre Brown)
  "27" = c("#78350F", "#92400E", "#B45309")
)

EXPERT_SPECIFIC_ACYL_COLORS <- c(
  # Short & Medium Chains
  "2:0" = "#0D9488",
  "3:0" = "#FB923C",
  "4:0" = "#15803D",
  "5:0" = "#D97706",
  "6:0" = "#7E22CE",
  "6:1" = "#9333EA",
  "6:2" = "#C084FC",
  "7:0" = "#C2410C",
  "8:0" = "#CA8A04",
  "8:1" = "#EAB308",
  "8:2" = "#FDE047",
  "9:0" = "#9A3412",
  "9:1" = "#EA580C",
  "10:0" = "#115E59",
  "10:1" = "#14B8A6",
  "10:2" = "#5EEAD4",
  "11:0" = "#881337",
  "11:1" = "#BE123C",
  "12:0" = "#1E40AF",
  "12:1" = "#2563EB",
  "12:2" = "#60A5FA",
  "13:0" = "#4D7C0F",
  "13:1" = "#65A30D",
  # Long Chains
  "14:0" = "#1E3A8A",
  "14:1" = "#2563EB",
  "15:0" = "#7C3AED",
  "15:1" = "#8B5CF6",
  "16:0" = "#B91C1C",
  "16:1" = "#F87171",
  "16:2" = "#DC2626",
  "17:0" = "#C2410C",
  "17:1" = "#EA580C",
  "17:2" = "#FB923C",
  "18:0" = "#B45309",
  "18:1" = "#F97316",
  "18:2" = "#FBBF24",
  "18:3" = "#FEF08A",
  "18:4" = "#F59E0B",
  "19:0" = "#65A30D",
  "19:1" = "#84CC16",
  "20:0" = "#047857",
  "20:1" = "#06B6D4",
  "20:2" = "#0F766E",
  "20:3" = "#A5F3FC",
  "20:4" = "#BE185D",
  "20:5" = "#FB7185",
  "20:6" = "#F43F5E",
  "21:0" = "#0F766E",
  "22:0" = "#475569",
  "22:1" = "#64748B",
  "22:2" = "#4338CA",
  "22:4" = "#1E1B4B",
  "22:5" = "#6366F1",
  "22:6" = "#C7D2FE",
  "23:0" = "#701A75",
  "23:1" = "#86198F",
  "24:0" = "#334155",
  "24:1" = "#0284C7",
  "24:2" = "#0E7490",
  "24:4" = "#2563EB",
  "24:5" = "#6D28D9",
  "24:6" = "#C026D3",
  "25:0" = "#312E81",
  # Very Long Chains (VLCFA - Sphingolipids & Glycosphingolipids)
  "26:0" = "#581C87",
  "26:1" = "#D946EF",
  "26:2" = "#A21CAF",
  "27:0" = "#78350F",
  "Other" = "#94A3B8"
)

#' Generate Non-Overlapping Expert Colors for Acyl Chains
#'
#' Assigns distinct, non-overlapping colors to acyl chains based on carbon family,
#' double bond saturation, and expert color mappings.
#'
#' @param chains Character vector of acyl chain tokens (e.g. c("16:0", "18:1", "20:4"))
#' @param custom_overrides Optional named vector of user color overrides
#' @return Named character vector of hex colors
generate_acyl_chain_colors <- function(chains, custom_overrides = NULL) {
  unique_chains <- sort(unique(chains))
  if (length(unique_chains) == 0) return(character(0))
  
  res_cols <- character(length(unique_chains))
  names(res_cols) <- unique_chains
  
  for (ch in unique_chains) {
    if (!is.null(custom_overrides) && ch %in% names(custom_overrides) && !is.na(custom_overrides[[ch]]) && custom_overrides[[ch]] != "") {
      res_cols[ch] <- custom_overrides[[ch]]
    } else if (grepl("^Spotted/Unassigned", ch)) {
      res_cols[ch] <- "#757575"
    } else if (ch %in% names(EXPERT_SPECIFIC_ACYL_COLORS)) {
      res_cols[ch] <- EXPERT_SPECIFIC_ACYL_COLORS[[ch]]
    } else {
      # Parse Carbon and Double Bond count
      spl <- strsplit(ch, ":")[[1]]
      if (length(spl) == 2) {
        c_num <- spl[1]
        db_num <- as.numeric(spl[2])
        if (c_num %in% names(EXPERT_ACYL_CHAIN_PALETTES)) {
          family_pal <- EXPERT_ACYL_CHAIN_PALETTES[[c_num]]
          idx <- min(length(family_pal), max(1, db_num + 1))
          res_cols[ch] <- family_pal[idx]
        } else {
          c_val <- as.numeric(c_num)
          if (!is.na(c_val)) {
            # Harmonious slate neutral ramp for high-carbon sum compositions (>24), avoiding neon HSV
            slate_ramp <- c("#475569", "#64748B", "#94A3B8", "#CBD5E1", "#334155", "#1E293B")
            idx <- ((c_val + db_num) %% length(slate_ramp)) + 1
            res_cols[ch] <- slate_ramp[idx]
          } else {
            res_cols[ch] <- "#757575"
          }
        }
      } else {
        res_cols[ch] <- "#9E9E9E"
      }
    }
  }
  
  return(res_cols)
}


