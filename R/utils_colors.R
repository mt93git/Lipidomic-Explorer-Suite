# R/utils_colors.R
# Color Utilities.

# --- Default Palette ---
# App-wide default categorical palette (CARTO "Pastel"). Keep in sync with PALETTES["Pastel"] in
# www/team/js/plot_editor.js and rd_palette in R/results_dashboard.R.
DEFAULT_PALETTE <- c("#66C5CC", "#F6CF71", "#F89C74", "#DCB0F2", "#87C55F", "#9EB9F3", "#FE88B1", "#B3B3B3")

# --- Hardcoded Palettes ---
# Every class has its own colour, taken from DEFAULT_PALETTE (R/utils_colors.R): the 7 chromatic
# colours first, then palette_distinct() variants of them; "Misc" is the palette neutral gray.
# Keep this map identical in R/global.R and R/utils_colors.R.
CLASS_MAP_COLORS <- c(
  "GP_CL"="#66C5CC", "GP_LPA"="#F6CF71", "GP_LPC"="#F89C74", "GP_LPE"="#DCB0F2",
  "GP_LPG"="#87C55F", "GP_LPI"="#9EB9F3", "GP_LPS"="#FE88B1", "GP_PA"="#249AA1",
  "GP_PC"="#C9A339", "GP_PE"="#CA7244", "GP_PE_E"="#B184C6", "GP_PE_P"="#5B9A25",
  "GP_PG"="#718EC7", "GP_PI"="#D15B87", "GP_PS"="#98F2F9", "FA_ACar"="#9D7A00",
  "ST_CE"="#FFC8A3", "SP_Cer"="#FFD8FF", "SP_Cer_dh"="#B3F290", "SP_GlcCer"="#CBE6FF",
  "SP_LacCer"="#FFB5DD", "SP_SM"="#007279", "SP_SM_dh"="#735200", "GL_DAG"="#9D4900",
  "GL_TAG"="#895A9E", "Misc"="#B3B3B3"
)

# Categories take the same palette; "Misc" is the neutral gray.
HYPERCLASS_MAP_COLORS <- c(
  "GP"="#66C5CC", "FA"="#F6CF71", "ST"="#F89C74", "SP"="#DCB0F2", "GL"="#87C55F",
  "Misc"="#B3B3B3", "AA"="#9EB9F3", "EPA"="#FE88B1", "DHA"="#249AA1", "DPA"="#C9A339"
)

#' Initialize Color Map
#' 
#' Creates a consistent color mapping for a given set of groups.
#' Groups take DEFAULT_PALETTE in sorted order; beyond 8 groups the palette is
#' extended with palette_distinct() variants, so no color repeats.
#'
#' @param groups Character vector of group names
#' @param palette_name Kept for compatibility; groups always use the default palette
#' @return Named character vector of colors
initialize_color_map <- function(groups, palette_name = "Set1") {
  unique_groups <- sort(unique(groups))
  n <- length(unique_groups)
  if (n == 0) return(character(0))
  
  stats::setNames(default_palette_colors(n), unique_groups)
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



# --- Distinct categorical colors ---------------------------------------------
# A palette never repeats a color across categories. Repeated entries are
# replaced, in order, by perceptual variants of the same color (CIELAB lightness
# steps first, then HCL hue rotations), so extensions stay coherent with the
# chosen palette. Pure and deterministic: same input, same output.
palette_hex_normalize <- function(colors) {
  vapply(as.character(colors), function(x) {
    if (is.na(x) || !nzchar(x)) return("#B0B0B0")
    rgb <- tryCatch(grDevices::col2rgb(x), error = function(e) NULL)
    if (is.null(rgb)) "#B0B0B0" else grDevices::rgb(rgb[1], rgb[2], rgb[3], maxColorValue = 255)
  }, character(1), USE.NAMES = FALSE)
}

palette_lab <- function(hex) {
  grDevices::convertColor(t(grDevices::col2rgb(hex)) / 255, from = "sRGB", to = "Lab")
}

palette_variants <- function(hex) {
  luv <- grDevices::convertColor(t(grDevices::col2rgb(hex)) / 255, from = "sRGB", to = "Luv")
  l <- unname(luv[1, 1]); c <- max(sqrt(luv[1, 2]^2 + luv[1, 3]^2), 30)
  h <- unname(atan2(luv[1, 3], luv[1, 2]) * 180 / pi) %% 360
  steps <- c(-16, 16, -32, 32, -48, 48)
  rotations <- c(30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180)
  grid <- rbind(data.frame(h = h, l = l + steps),
                expand.grid(l = l + c(0, -16, 16), h = h + rotations)[, c("h", "l")])
  grid$l <- pmin(pmax(grid$l, 15), 92)
  unique(toupper(grDevices::hcl(grid$h %% 360, c, grid$l, fixup = TRUE)))
}

palette_fallback_pool <- function() {
  grid <- expand.grid(h = seq(0, 357, by = 3), c = c(85, 60, 35), l = c(60, 45, 75, 30, 88))
  unique(toupper(grDevices::hcl(grid$h, grid$c, grid$l, fixup = TRUE)))
}

palette_distinct <- function(colors, min_delta = 12) {
  hex <- palette_hex_normalize(colors)
  names(hex) <- names(colors)
  dup <- which(duplicated(hex))
  if (!length(dup)) return(hex)
  reserved <- unique(hex); used <- palette_lab(reserved)
  for (i in dup) {
    cands <- setdiff(palette_variants(hex[[i]]), reserved)
    # Own variants exhausted: widen to a fixed HCL wheel, then step through RGB.
    if (!length(cands)) cands <- setdiff(palette_fallback_pool(), reserved)
    if (!length(cands)) {
      k <- 0L
      repeat {
        cand <- sprintf("#%06X", (k * 40503L) %% 16777216L)
        if (!(cand %in% reserved)) break
        k <- k + 1L
      }
      cands <- cand
    }
    lab <- palette_lab(cands)
    dist <- vapply(seq_along(cands), function(k)
      min(sqrt(colSums((t(used) - lab[k, ])^2))), numeric(1))
    ok <- which(dist >= min_delta)
    # Best effort when every variant is close to an existing color: farthest wins.
    pick <- if (length(ok)) ok[1] else which.max(dist)
    hex[[i]] <- cands[[pick]]
    reserved <- c(reserved, cands[[pick]]); used <- rbind(used, lab[pick, , drop = FALSE])
  }
  hex
}

# Extend a palette to n distinct colors: the palette's own colors first, then
# generated variants (category k+1 is a variant of color 1, and so on).
palette_extend <- function(colors, n) {
  n <- as.integer(n)
  if (is.na(n) || n <= 0L || !length(colors)) return(character())
  palette_distinct(rep(as.character(colors), length.out = n))
}

# Named, portable palettes. Keys are context-qualified so equally named groups
# in different metadata columns can retain different colors.
COLOR_PALETTE_PRESETS <- list(
  "Tableau Classic" = c("#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC"),
  "Ocean & Coral" = c("#155E75", "#0E7490", "#06B6D4", "#0D9488", "#F97373", "#E76F51", "#A8558E", "#F0B45B"),
  "Earth & Garden" = c("#365314", "#65A30D", "#A3A635", "#B45309", "#C2410C", "#0F766E", "#7C3AED", "#78716C"),
  "Colorblind Friendly" = c("#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#000000")
)

palette_hex <- function(value) {
  is.character(value) && length(value) == 1L && !is.na(value) &&
    grepl("^#[[:xdigit:]]{6}$", value)
}

palette_context_key <- function(context, label) paste0(context, "::", label)

palette_validate_colors <- function(colors) {
  if (is.list(colors)) colors <- unlist(colors, use.names = TRUE)
  if (!is.character(colors) || is.null(names(colors)) ||
      anyNA(names(colors)) || any(!nzchar(names(colors))) ||
      anyDuplicated(names(colors)) || any(!vapply(colors, palette_hex, logical(1)))) {
    stop("Palette colors must be a named map of #RRGGBB values.", call. = FALSE)
  }
  stats::setNames(toupper(colors), names(colors))
}

palette_validate_record <- function(record, existing = character(), old_name = NULL) {
  if (!is.list(record)) stop("Invalid palette file.", call. = FALSE)
  name <- trimws(as.character(record$name %||% ""))
  if (length(name) != 1L || !nzchar(name) || nchar(name) > 80L ||
      name %in% c("Default", names(COLOR_PALETTE_PRESETS)) ||
      (name %in% existing && !identical(name, old_name))) {
    stop("Choose a unique palette name (1–80 characters).", call. = FALSE)
  }
  list(name = name, colors = as.list(palette_validate_colors(record$colors)))
}

palette_preset_colors <- function(name, contexts) {
  swatches <- COLOR_PALETTE_PRESETS[[name]]
  if (is.null(swatches)) stop("Unknown palette preset.", call. = FALSE)
  out <- character()
  for (context in names(contexts)) {
    labels <- sort(unique(as.character(contexts[[context]])))
    labels <- labels[!is.na(labels) & nzchar(labels)]
    if (!length(labels)) next
    vals <- palette_extend(swatches, length(labels))
    names(vals) <- vapply(labels, function(x) palette_context_key(context, x), character(1))
    out <- c(out, vals)
  }
  out
}

palette_resolve <- function(colors, context, label, fallback, legacy = NULL) {
  key <- palette_context_key(context, label)
  value <- colors[[key]]
  if (is.null(value) && !is.null(legacy)) {
    value <- legacy[[paste0(context, "_", gsub("[^A-Za-z0-9]", "_", label))]] %||%
      legacy[[label]]
  }
  if (palette_hex(value)) toupper(value) else fallback
}

palette_normalize_registry <- function(registry) {
  if (is.null(registry)) return(list())
  if (is.data.frame(registry)) {
    registry <- lapply(seq_len(nrow(registry)), function(i) as.list(registry[i, , drop = FALSE]))
  }
  if (!is.list(registry)) return(list())
  result <- list()
  for (record in registry) {
    normalized <- tryCatch(palette_validate_record(record), error = function(e) NULL)
    if (!is.null(normalized)) result[[normalized$name]] <- normalized
  }
  result
}

# Shiny input IDs must distinguish labels such as A-B and A_B.
palette_input_id <- function(label) {
  paste(sprintf("%02X", as.integer(charToRaw(enc2utf8(as.character(label))))), collapse = "")
}

palette_combined_groups <- function(metadata, columns = c("Group1", "Group2")) {
  if (!all(columns %in% names(metadata))) return(character())
  if (nrow(metadata) == 0L) return(character())
  apply(metadata[, columns, drop = FALSE], 1, function(row) {
    vals <- as.character(row)
    vals <- vals[!is.na(vals) & nzchar(vals) & vals != "Unspecified"]
    if (length(vals)) paste(vals, collapse = "_") else "Unspecified"
  })
}

# --- Default palette helpers ---------------------------------------------------
# n distinct colors: DEFAULT_PALETTE first, then palette_distinct() variants.
default_palette_colors <- function(n) palette_extend(DEFAULT_PALETTE, n)

# Colors for categories missing from `existing`, never reusing a color already
# present in it.
default_palette_fallback <- function(existing, new_names) {
  if (length(new_names) == 0L) return(character(0))
  pool <- default_palette_colors(length(existing) + length(new_names) + length(DEFAULT_PALETTE))
  pool <- pool[!toupper(pool) %in% toupper(as.character(unname(existing)))]
  stats::setNames(pool[seq_along(new_names)], new_names)
}
