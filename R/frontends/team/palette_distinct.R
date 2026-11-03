# Team-only distinct categorical colours for the Results dashboard
# (results_dashboard.R: rd_team_resolved_condition_colors and its bars/swatches).
# Copied verbatim from production R/utils_colors.R. Classic keeps its own
# R/utils_colors.R unchanged; moving these helpers there (and using
# palette_extend in palette_preset_colors) is a proposal for the shared backend.
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

