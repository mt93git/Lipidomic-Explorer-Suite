# Team's session palette: the data hub's "Colors & palettes" editor (R/modules/1_shared_data_module.R,
# observeEvent(input$open_palette_editor) and below). Every group-coloured card reads its group colours from the
# session (global_color_map = shared_data$color_maps(), plot_instances.R; masterColorMaps applies
# color_settings_val()$custom_colors), so this is where Team changes them; a canvas copy's own customCol_*/customShape_*
# pickers never reach its plot (pilot F1). Nexo sets the editor's own inputs and lets Team's observers run:
#   - a preset or saved palette: palette_choice, then the "Use palette" button (palette_use);
#   - per-group colours: colorEditMode, the colour field of every group of that context (globalGroupCol_*), then
#     "Apply color changes" (btn_apply_colors), as Team's browser sends them.
# It never computes a colour. Team saves the result in the checkpoint (export_session_path: state.json color_shape)
# and restores it on import (restored_palette_state), so a save and a reopen keep it with no Nexo member.
# Shapes: Team's palette editor has none (session shapes follow the QC settings bridge); the route reports the
# session's current shape maps read-only.
api_palette_prefix <- "data_hub-"
# The sample-group contexts of Team's editor: masterColorMaps key, its "Color context" choice (colorEditMode),
# the colour field id stem (classColorUI) and the choice label Team shows.
api_palette_contexts <- list(
  list(id = "Group1", mode = "Group1", stem = "globalGroupCol_Group1_", label = "Sample groups (Group 1)"),
  list(id = "Group2", mode = "Group2", stem = "globalGroupCol_Group2_", label = "Sample groups (Group 2)"),
  list(id = "Group1 & Group2", mode = "Group1_Group2", stem = "globalGroupCol_Comp_", label = "Combined groups"))
# Families whose cards take their group colours (and shapes) from the session: plot_instances.R gives them
# global_color_map; the dashboard reads shared_data$palette_settings / color_maps (results_dashboard.R).
api_palette_session_families <- function() c(names(Filter(function(x) isTRUE(x$colors), team_plot_instance_families)), "results_dashboard")
# Families whose own customCol_*/customShape_* inputs never reach their plot on a canvas copy: QC builds with
# global_color_map()[[colorMap_key]] and shared_data$shape_maps() (2_qc_boxplot_module.R), and its pickers only feed
# the module's return value, which only Team's main QC tab bridges (R/server.R qc_settings_bridge). The cellular
# organization polar map applies its own pickers over the session map (14_cellular_org_module.R
# polar_active_color_map), so it keeps them. Proved by tests/dual-ui/test_api_session_palette.R part 1.
api_palette_dead_group_style <- c("qc_pca_tab")
api_palette_family_dead <- function(family) is.character(family) && length(family) == 1L && family %in% api_palette_dead_group_style

# The part of Team's palette state that decides every colour (the disk-cache key, a worker's alignment, undo).
api_palette_key <- function(s) api_read(s, {
  state <- s$shared$palette_settings()
  custom <- unlist(state$custom_colors %||% list(), use.names = TRUE)
  # A named list even when empty: JSON {} (never []), so a client sends it back as the same object.
  custom <- if (length(custom)) as.list(custom[order(names(custom))]) else stats::setNames(list(), character())
  list(useCustomColors = isTRUE(state$useCustomColors), customColors = custom,
    activePalette = as.character(state$active_palette %||% "Default"))
})

api_palette_meta <- function(s) api_read(s, tryCatch(s$shared$allParsedMetadata(), error = function(e) NULL))
# The groups Team's apply loop walks for a context (observeEvent(input$btn_apply_colors)).
api_palette_apply_groups <- function(meta, context) {
  if (is.null(meta)) return(character())
  if (identical(context$id, "Group1 & Group2")) {
    if (!all(c("Group1", "Group2") %in% names(meta))) return(character())
    return(unique(palette_combined_groups(meta)))
  }
  if (!context$id %in% names(meta)) return(character())
  sort(unique(meta[[context$id]]))
}

api_palette_get <- function(s) {
  maps <- api_read(s, tryCatch(s$shared$color_maps(), error = function(e) list()))
  shapes <- api_read(s, tryCatch(s$shared$shape_maps(), error = function(e) list()))
  meta <- api_palette_meta(s)
  key <- api_palette_key(s)
  saved <- api_read(s, s$shared$palette_settings()$color_palettes %||% list())
  contexts <- list()
  for (context in api_palette_contexts) {
    if (!length(api_palette_apply_groups(meta, context))) next
    map <- maps[[context$id]]
    if (!length(map)) next
    groups <- sort(names(map))
    contexts[[length(contexts) + 1L]] <- list(id = context$id, label = context$label,
      groups = unname(lapply(groups, function(g) list(name = g, color = toupper(as.character(map[[g]])),
        shape = if (!is.null(shapes[[context$id]][[g]])) as.numeric(shapes[[context$id]][[g]]) else NULL))))
  }
  # Team's palette list (palette_choices) and its preview chips (palettePreviewUI: at most 10 colours).
  preview <- function(name) {
    colors <- if (name %in% names(COLOR_PALETTE_PRESETS)) COLOR_PALETTE_PRESETS[[name]] else
      if (name %in% names(saved)) unique(unlist(saved[[name]]$colors, use.names = FALSE)) else character()
    I(head(colors[vapply(colors, palette_hex, logical(1))], 10L))
  }
  choices <- c("Default", names(COLOR_PALETTE_PRESETS), names(saved))
  list(active = key$activePalette,
    palettes = unname(lapply(choices, function(name) list(name = name,
      kind = if (identical(name, "Default")) "default" else if (name %in% names(COLOR_PALETTE_PRESETS)) "preset" else "saved",
      colors = preview(name)))),
    contexts = contexts, state = key, shapesEditable = FALSE)
}

api_palette_click <- function(s, id) {
  full <- paste0(api_palette_prefix, id)
  now <- api_read(s, s$mock$input[[full]])
  stats::setNames(list(as.integer((if (is.numeric(now)) now else 0L) + 1L)), full)
}

# body: list(palette = "<name>") | list(context = "<id>", colors = list(<group> = "#RRGGBB", ...)) |
#       list(restore = <state as returned in $state>) (undo, a reopened session, a render worker).
api_palette_update <- function(s, body) {
  api_mutation(s, NULL, NULL, (function() {
  if (!is.list(body)) api_abort("api_bad_request", "Expected palette, context with colors, or restore.")
  kinds <- intersect(names(body), c("palette", "context", "restore"))
  if (length(kinds) != 1L) api_abort("api_bad_request", "Expected exactly one of palette, context (with colors) or restore.")
  before <- api_palette_key(s)
  if (identical(kinds, "palette")) {
    name <- body$palette
    saved <- api_read(s, names(s$shared$palette_settings()$color_palettes %||% list()))
    if (!is.character(name) || length(name) != 1L || !name %in% c("Default", names(COLOR_PALETTE_PRESETS), saved))
      api_abort("api_bad_request", "Unknown palette.")
    do.call(api_inputs, c(list(s), stats::setNames(list(name), paste0(api_palette_prefix, "palette_choice"))))
    do.call(api_inputs, c(list(s), api_palette_click(s, "palette_use")))
  } else if (identical(kinds, "context")) {
    context <- Filter(function(x) identical(x$id, body$context), api_palette_contexts)
    if (length(context) != 1L) api_abort("api_bad_request", "Unknown colour context.")
    context <- context[[1L]]
    colors <- body$colors
    if (!is.list(colors) && !is.character(colors) || !length(colors) || is.null(names(colors)) || any(!nzchar(names(colors))))
      api_abort("api_bad_request", "Expected colors as a map of group to #RRGGBB.")
    colors <- as.list(colors)
    groups <- api_palette_apply_groups(api_palette_meta(s), context)
    unknown <- setdiff(names(colors), groups)
    if (length(unknown)) api_abort("api_bad_request", paste0("Unknown group: ", paste(unknown, collapse = ", ")))
    if (!all(vapply(colors, palette_hex, logical(1)))) api_abort("api_bad_request", "Colours must be #RRGGBB.")
    # What Team's browser sends on "Apply color changes": every field of the context, each holding the colour
    # Team's editor shows (classColorUI: the session map's colour, #B0B0B0 when it is not a hex), the edited ones
    # holding the new colour.
    map <- api_read(s, tryCatch(s$shared$color_maps()[[context$id]], error = function(e) NULL))
    fields <- lapply(groups, function(g) {
      value <- colors[[g]] %||% { current <- if (!is.null(map[[g]])) as.character(map[[g]]) else NA_character_
        if (palette_hex(current)) current else "#B0B0B0" }
      value
    })
    names(fields) <- paste0(api_palette_prefix, context$stem, vapply(groups, palette_input_id, character(1)))
    do.call(api_inputs, c(list(s), stats::setNames(list(context$mode), paste0(api_palette_prefix, "colorEditMode")), fields))
    do.call(api_inputs, c(list(s), api_palette_click(s, "btn_apply_colors")))
  } else {
    want <- body$restore
    if (!is.list(want)) api_abort("api_bad_request", "Expected a palette state to restore.")
    use <- want$useCustomColors
    if (!is.logical(use) || length(use) != 1L || is.na(use)) api_abort("api_bad_request", "useCustomColors must be true or false.")
    custom <- want$customColors %||% list()
    custom <- if (length(custom)) tryCatch(as.list(palette_validate_colors(custom)), error = function(e)
      api_abort("api_bad_request", conditionMessage(e))) else stats::setNames(list(), character())
    saved <- api_read(s, names(s$shared$palette_settings()$color_palettes %||% list()))
    active <- want$activePalette
    if (!is.character(active) || length(active) != 1L || !active %in% c("Default", names(COLOR_PALETTE_PRESETS), saved))
      api_abort("api_bad_request", "Unknown palette.")
    # Team's own setter (shared_data$set_palette_settings: the keys its checkpoint restore sets). A previous state
    # is not always reachable through the editor's buttons (a preset writes every context at once).
    api_read(s, s$shared$set_palette_settings(list(useCustomColors = use, custom_colors = custom, active_palette = active)))
  }
  api_flush(s)
  after <- api_palette_key(s)
  if (!identical(after, before)) {
    api_session_dirty(s)
    # Every group-coloured card's map follows the session: they all redraw (the session epoch; the disk-cache key
    # and the render workers' state carry api_palette_key).
    api_render_epoch_bump(s)
  }
  api_palette_get(s)
  })())
}
