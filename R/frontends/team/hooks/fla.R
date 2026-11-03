# Team implementation of fla_violin_palette(safe_colors, c_levels)
# (R/modules/10_fla_module.R current_violin_plot). Ported from production's
# fla_palette_adapter.R: a named colour returned by sapply acquires an extra
# level suffix; restore the intended group names. This is bug-level and also
# affects Classic, but fixing it for everyone needs Max's approval, so it stays
# a Team hook (Classic identity) for now.
team_fla_violin_palette <- function(safe_colors, c_levels, ...) {
  names(safe_colors) <- as.character(c_levels)
  safe_colors
}
lipidomic_hook_register("fla_violin_palette", team_fla_violin_palette)
