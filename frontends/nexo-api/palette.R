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
#   - Lipid class / Lipid category: the same Apply with Team's class fields (globalClassCol_*, globalOriginCol_*),
#     whose colours Team reads from shared_data$class_color_map / origin_color_map;
#   - Save & reuse: palette_name + "Save palette" (palette_save), "Import palette JSON" (palette_upload, a file
#     Nexo writes from the posted record), and Download JSON (the record Team's downloadHandler writes).
# Shapes: Team's palette editor has none (session shapes follow the QC settings bridge); the route reports the
# session's current shape maps read-only.
api_palette_prefix <- "data_hub-"
# The sample-group contexts of Team's editor: masterColorMaps key, its "Color context" choice (colorEditMode),
# the colour field id stem (classColorUI) and the choice label Team shows.
api_palette_contexts <- list(
  list(id = "Group1", mode = "Group1", stem = "globalGroupCol_Group1_", label = "Sample groups (Group 1)"),
  list(id = "Group2", mode = "Group2", stem = "globalGroupCol_Group2_", label = "Sample groups (Group 2)"),
  list(id = "Group1 & Group2", mode = "Group1_Group2", stem = "globalGroupCol_Comp_", label = "Combined groups"),
  # Team's two annotation contexts (classColorUI / btn_apply_colors with anno): lipid main class and category.
  list(id = "Lipid Class", mode = "Lipid Class", stem = "globalClassCol_", label = "Lipid class", column = "subclass"),
  list(id = "Hyperclass", mode = "Hyperclass", stem = "globalOriginCol_", label = "Lipid category", column = "hyperclass"))
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
api_palette_anno <- function(s) api_read(s, tryCatch(s$shared$annotationData(), error = function(e) NULL))
# The groups Team's apply loop walks for a context (observeEvent(input$btn_apply_colors)); the annotation contexts
# walk sort(unique(anno$subclass)) / sort(unique(anno$hyperclass)).
api_palette_apply_groups <- function(meta, context, anno = NULL) {
  if (!is.null(context$column)) {
    if (is.null(anno) || !context$column %in% names(anno)) return(character())
    return(sort(unique(as.character(anno[[context$column]]))))
  }
  if (is.null(meta)) return(character())
  if (identical(context$id, "Group1 & Group2")) {
    if (!all(c("Group1", "Group2") %in% names(meta))) return(character())
    return(unique(palette_combined_groups(meta)))
  }
  if (!context$id %in% names(meta)) return(character())
  sort(unique(meta[[context$id]]))
}

# The colours Team's editor shows for a context: the session map (masterColorMaps), or for the annotation contexts
# Team's class maps (map_lipid_class / map_bio_origin, exported as class_color_map / origin_color_map).
api_palette_map <- function(s, context, maps = NULL) {
  if (identical(context$id, "Lipid Class")) return(api_read(s, tryCatch(s$shared$class_color_map(), error = function(e) NULL)))
  if (identical(context$id, "Hyperclass")) return(api_read(s, tryCatch(s$shared$origin_color_map(), error = function(e) NULL)))
  maps <- maps %||% api_read(s, tryCatch(s$shared$color_maps(), error = function(e) list()))
  maps[[context$id]]
}
# Team's palette_current_colors(): every context's colours keyed "<context>::<label>", what "Save palette" and
# "Download JSON" record.
api_palette_current_colors <- function(s) {
  maps <- api_read(s, tryCatch(s$shared$color_maps(), error = function(e) list()))
  class_map <- api_read(s, tryCatch(s$shared$class_color_map(), error = function(e) NULL))
  origin_map <- api_read(s, tryCatch(s$shared$origin_color_map(), error = function(e) NULL))
  if (!is.null(class_map)) maps[["Lipid Class"]] <- class_map
  if (!is.null(origin_map)) maps[["Hyperclass"]] <- origin_map
  out <- character()
  for (context in names(maps)) {
    vals <- maps[[context]]
    for (label in names(vals)) out[[palette_context_key(context, label)]] <- vals[[label]]
  }
  out
}
api_palette_saved <- function(s) api_read(s, s$shared$palette_settings()$color_palettes %||% list())
# Download JSON: the record Team's downloadHandler writes (a preset or Default is saved as "<name> copy").
api_palette_export <- function(s) {
  name <- as.character(api_palette_key(s)$activePalette)
  list(filename = paste0(gsub("[^A-Za-z0-9_-]", "_", name), ".json"),
    record = list(name = if (name %in% c("Default", names(COLOR_PALETTE_PRESETS))) paste0(name, " copy") else name,
      colors = as.list(api_palette_current_colors(s))))
}

api_palette_get <- function(s) {
  maps <- api_read(s, tryCatch(s$shared$color_maps(), error = function(e) list()))
  shapes <- api_read(s, tryCatch(s$shared$shape_maps(), error = function(e) list()))
  meta <- api_palette_meta(s)
  anno <- api_palette_anno(s)
  key <- api_palette_key(s)
  saved <- api_palette_saved(s)
  contexts <- list()
  for (context in api_palette_contexts) {
    if (!length(api_palette_apply_groups(meta, context, anno))) next
    map <- api_palette_map(s, context, maps)
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
#       list(restore = <state as returned in $state>) (undo, a reopened session, a render worker) |
#       list(save = "<name>") (Save palette) | list(import = list(name = "<name>", colors = list(<key> = "#RRGGBB")))
#       (Import palette JSON).
api_palette_update <- function(s, body) {
  api_mutation(s, NULL, NULL, (function() {
  if (!is.list(body)) api_abort("api_bad_request", "Expected palette, context with colors, restore, save or import.")
  kinds <- intersect(names(body), c("palette", "context", "restore", "save", "import"))
  if (length(kinds) != 1L) api_abort("api_bad_request", "Expected exactly one of palette, context (with colors), restore, save or import.")
  before <- api_palette_key(s)
  saved_before <- api_palette_saved(s)
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
    groups <- api_palette_apply_groups(api_palette_meta(s), context, api_palette_anno(s))
    unknown <- setdiff(names(colors), groups)
    if (length(unknown)) api_abort("api_bad_request", paste0("Unknown group: ", paste(unknown, collapse = ", ")))
    if (!all(vapply(colors, palette_hex, logical(1)))) api_abort("api_bad_request", "Colours must be #RRGGBB.")
    # What Team's browser sends on "Apply color changes": every field of the context, each holding the colour
    # Team's editor shows (classColorUI: the session map's colour, #B0B0B0 when it is not a hex), the edited ones
    # holding the new colour.
    map <- api_palette_map(s, context)
    fields <- lapply(groups, function(g) {
      value <- colors[[g]] %||% { current <- if (!is.null(map[[g]])) as.character(map[[g]]) else NA_character_
        if (palette_hex(current)) current else "#B0B0B0" }
      value
    })
    names(fields) <- paste0(api_palette_prefix, context$stem, vapply(groups, palette_input_id, character(1)))
    do.call(api_inputs, c(list(s), stats::setNames(list(context$mode), paste0(api_palette_prefix, "colorEditMode")), fields))
    do.call(api_inputs, c(list(s), api_palette_click(s, "btn_apply_colors")))
  } else if (identical(kinds, "save")) {
    name <- body$save
    if (!is.character(name) || length(name) != 1L) api_abort("api_bad_request", "Expected save as a palette name.")
    # Team's own check (palette_validate_record, as its palette_save observer calls it): Team only shows a
    # notification when it refuses, so the API says why before pressing the button.
    record <- tryCatch(palette_validate_record(list(name = name, colors = api_palette_current_colors(s)),
      existing = names(api_palette_saved(s)), old_name = api_palette_key(s)$activePalette), error = function(e) e)
    if (inherits(record, "error")) api_abort("api_bad_request", conditionMessage(record))
    do.call(api_inputs, c(list(s), stats::setNames(list(name), paste0(api_palette_prefix, "palette_name"))))
    do.call(api_inputs, c(list(s), api_palette_click(s, "palette_save")))
    if (!record$name %in% names(api_palette_saved(s))) api_abort("api_bad_request", "Team did not save the palette.")
    # Team's palette_save also copies every colour the editor shows into custom_colors (useCustomColors = TRUE), so
    # the automatic defaults become explicit edits and a card with its own colours (the dashboard's condition
    # colours, rd_team_resolved_condition_colors) switches to them. Saving only records the palette: keep the
    # colour state as it was, with the saved palette named as the active one.
    api_read(s, s$shared$set_palette_settings(list(useCustomColors = before$useCustomColors,
      custom_colors = before$customColors, active_palette = record$name)))
  } else if (identical(kinds, "import")) {
    raw <- body$import
    record <- tryCatch(palette_validate_record(raw, existing = names(api_palette_saved(s))), error = function(e) e)
    if (inherits(record, "error")) api_abort("api_bad_request", conditionMessage(record))
    # Team's fileInput: the file the browser uploads, here written from the posted record (Team reads it with
    # jsonlite::read_json(simplifyVector = TRUE) and validates it again).
    file <- tempfile(fileext = ".json"); on.exit(unlink(file), add = TRUE)
    jsonlite::write_json(list(name = record$name, colors = record$colors), file, auto_unbox = TRUE)
    upload <- data.frame(name = "palette.json", size = file.size(file), type = "application/json", datapath = file,
      stringsAsFactors = FALSE)
    do.call(api_inputs, c(list(s), stats::setNames(list(upload), paste0(api_palette_prefix, "palette_upload"))))
    if (!record$name %in% names(api_palette_saved(s))) api_abort("api_bad_request", "Team did not import the palette.")
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
  # A saved or imported palette is part of the checkpoint (Team's color_palettes): save the session.
  if (!identical(api_palette_saved(s), saved_before)) api_session_dirty(s)
  if (!identical(after, before)) {
    api_session_dirty(s)
    # Every group-coloured card's map follows the session: they all redraw (the session epoch; the disk-cache key
    # and the render workers' state carry api_palette_key).
    api_render_epoch_bump(s)
  }
  api_palette_get(s)
  })())
}
