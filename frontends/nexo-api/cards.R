# Independent Team module instances within a live checkpoint session.
api_card_inputs_validate <- function(inputs, allowed) {
  if (!is.list(inputs) || (length(inputs) && (is.null(names(inputs)) ||
      anyNA(names(inputs)) || any(!nzchar(names(inputs))) || anyDuplicated(names(inputs)))))
    api_abort("api_bad_request", "Inputs must be a named object with unique keys.")
  unknown <- setdiff(names(inputs), allowed)
  if (length(unknown)) api_abort("api_bad_request", paste("Unknown input:", unknown[[1L]]))
}
api_card_get <- function(s, instanceId) {
  api_alive(s)
  if (!exists(instanceId, s$cards, inherits = FALSE)) {
    # A legacy dashboard node's v0 instance: the v0 route may have drawn it from the disk cache without creating
    # it, and the inspector asks it for its controls; create it as that route does.
    v0 <- if (is.character(instanceId) && length(instanceId) == 1L)
      regmatches(instanceId, regexec("^tcinstance_v0_(pca|violin|dist|comp|heat)$", instanceId))[[1]] else character()
    if (length(v0) == 2L) { api_dashboard_v0_card(s, v0[[2]]); return(s$cards[[instanceId]]) }
    saved <- if (is.character(instanceId) && length(instanceId) == 1L) api_card_saved(s, instanceId)
    if (is.null(saved)) api_abort("api_not_found", "Unknown card.")
    return(api_card_restore(s, instanceId, saved))
  }
  s$cards[[instanceId]]
}
# Older Team canvases keep a family's own view as a node with no instance (id = source).
api_card_fixed_id <- function(nodeId) paste0("tcinstance_fixed_", tolower(gsub("[^A-Za-z0-9]+", "_", nodeId)))
# Team's browser re-creates a checkpoint's module instances when it restores the canvas;
# headless, nothing does. The first request for a card the open canvas holds re-creates it
# from its saved source and inputs.
api_card_saved <- function(s, instanceId) {
  for (node in s$canvas$nodes %||% list()) {
    if (!is.list(node) || !identical(node$kind %||% "plot", "plot")) next
    instance <- node$instance
    if (is.list(instance) && identical(instance$id %||% instance$instanceId, instanceId) && is.character(instance$source))
      return(list(source = instance$source, inputs = instance$inputs %||% list()))
    if (is.null(instance) && is.character(node$id) && length(node$id) == 1L &&
        identical(api_card_fixed_id(node$id), instanceId) &&
        !is.null(tryCatch(api_catalog_entry(node$id), api_bad_request = function(e) NULL)))
      return(list(source = node$id, inputs = list(), fixed = TRUE))
  }
  NULL
}
# A restore, not an edit: it never dirties the session. A saved value this build's control
# no longer accepts falls back to Team's default instead of losing the whole card.
api_card_restore <- function(s, instanceId, saved) {
  dirty <- isTRUE(s$dirty)
  restoring <- s$restoring; s$restoring <- TRUE
  on.exit({ s$dirty <- dirty; s$restoring <- restoring }, add = TRUE)
  api_debug("restore saved card ", instanceId, " (", saved$source, ")")
  # Warm a render worker's copy first (pool.R; none for a fixed copy or a card with replayed actions: the saved
  # descriptor says so), in parallel with this restore.
  api_card_warm(s, instanceId)
  card <- api_card_create(s, saved$source, api_saved_inputs_accepted(saved$source, saved$inputs), instanceId, warm = FALSE)
  if (isTRUE(saved$fixed)) { api_card_family_view_inputs(s, card); entry <- s$cards[[instanceId]]; entry$fixed <- TRUE; assign(instanceId, entry, envir = s$cards) }
  # Chart audit b07 F3: the module buttons pressed on this card (Nexo's member) are pressed again.
  if (length(api_card_member_actions(s, instanceId))) api_card_replay(s, instanceId, api_card_member_actions(s, instanceId))
  s$cards[[instanceId]]
}
# A fixed node is the family's own view, which Team shows with every archived input of
# that family, including those its module builds at run time (e.g. logratio's
# sel_<class group> checkboxes, absent from the static markup and so from allowedInputs).
api_card_family_view_inputs <- function(s, card) {
  archived <- s$archived_inputs %||% list()
  prefix <- paste0(card$family, "-")
  keys <- names(archived) %||% character(); keys <- keys[startsWith(keys, prefix)]
  keys <- keys[!sub(prefix, "", keys, fixed = TRUE) %in% card$allowedInputs]
  keys <- keys[!grepl("plotly_|_brush$|_click$|_hover$|_selected$", keys)]
  extra <- list()
  for (key in keys) {
    value <- archived[[key]]
    if (is.list(value)) value <- unlist(value, use.names = FALSE)
    if (is.null(value) || !(is.character(value) || is.numeric(value) || is.logical(value))) next
    extra[[paste0(card$instanceId, "-", substring(key, nchar(prefix) + 1L))]] <- value
  }
  if (!length(extra)) return(invisible(card))
  do.call(api_inputs, c(list(s), extra))
  api_flush(s, function() s$bus$settled(card$instanceId))
  invisible(card)
}
# The saved values this build's controls accept; the others fall back to Team's defaults.
api_saved_inputs_accepted <- function(source, inputs) {
  entry <- api_catalog_entry(source)
  if (!is.list(inputs) || (length(inputs) && is.null(names(inputs)))) inputs <- list()
  inputs <- inputs[intersect(names(inputs), entry$allowedInputs)]
  kept <- list()
  for (key in names(inputs)) {
    value <- tryCatch(api_validate_inputs(entry$inputs %||% list(), inputs[key])[[key]],
      api_bad_request = function(e) NULL)
    if (!is.null(value)) kept[[key]] <- value
  }
  kept
}
api_card_current_inputs <- function(s, card) {
  api_read(s, stats::setNames(lapply(card$allowedInputs, function(key)
    tryCatch(s$mock$input[[paste0(card$instanceId, "-", key)]], error = function(e) NULL)),
    card$allowedInputs))
}
api_family_archived_inputs <- function(s, family, allowed) {
  archived <- s$archived_inputs %||% list()
  keys <- names(archived) %||% character(); keys <- keys[startsWith(keys, paste0(family, "-"))]
  out <- list()
  for (key in keys) {
    local <- sub("^[^-]+-", "", key); value <- archived[[key]]
    if (!local %in% allowed || grepl("plotly_|_brush$|_click$|_hover$|_selected$", local)) next
    if (is.list(value)) value <- unlist(value, use.names = FALSE)
    if (is.null(value) || !(is.character(value) || is.numeric(value) || is.logical(value))) next
    if (is.character(value) && length(value) == 1L && !nzchar(value)) next
    out[[local]] <- value
  }
  out
}
# A render worker (pool.R) creates its own copy of a poolable card while this process works ("warm"): the first render
# then only draws. Never waits for the worker and never fails the caller. No pool (or inside a worker): nothing.
api_card_warm <- function(s, instanceId, descriptor = NULL) {
  if (!exists("api_pool_warm", mode = "function") || !exists("api_pool", inherits = TRUE) || !length(api_pool$workers))
    return(invisible(FALSE))
  invisible(isTRUE(tryCatch(api_pool_warm(s, instanceId, descriptor), error = function(e) FALSE)))
}
# Create phases (goal 3 diagnosis): recorded only while the create route measures (api_timing$scope "create"), so a
# create nested in a render's "open" or in a worker never adds phases to that render's timing.
api_create_phase <- function(phase, since) if (identical(api_timing$scope, "create")) api_timing_add(phase, since)
api_card_create <- function(s, source, inputs = list(), instanceId = NULL, warm = TRUE) {
  api_mutation(s, NULL, NULL, (function() {
  started <- Sys.time()
  api_alive(s)
  resolved <- tryCatch(team_plot_instance_source(source), error = function(e)
    api_abort("api_bad_request", conditionMessage(e)))
  if (is.null(instanceId)) repeat {
    instanceId <- paste0("tcinstance_", paste(sample(c(0:9, letters[1:6]), 12L, replace = TRUE), collapse = ""))
    if (!exists(instanceId, s$instance_sources, inherits = FALSE)) break
  }
  if (!is.character(instanceId) || length(instanceId) != 1L || is.na(instanceId) ||
      !grepl("^tcinstance_[a-z0-9_]{1,80}$", instanceId))
    api_abort("api_bad_request", "Invalid instanceId.")
  if (exists(instanceId, s$instance_sources, inherits = FALSE) &&
      !identical(s$instance_sources[[instanceId]], source))
    api_abort("api_conflict", "This instanceId already belongs to another source.")
  entry <- api_catalog_entry(source)
  api_card_inputs_validate(inputs, entry$allowedInputs)
  if (length(inputs)) inputs <- api_validate_inputs(entry$inputs %||% list(), inputs)
  # Team allows 160 module instances per session (plot_instances.R).
  if (!exists(instanceId, s$cards, inherits = FALSE) && length(ls(s$cards, all.names = TRUE)) >= 160L)
    api_abort("api_conflict", "This session already holds 160 cards; remove some first.")
  if (exists(instanceId, s$cards, inherits = FALSE)) {
    api_card_update(s, instanceId, inputs, warm = warm)
    return(s$cards[[instanceId]])
  }
  api_create_phase("validate", started); started <- Sys.time()
  # The worker's copy starts now, in parallel with this create: same source and explicit inputs as recorded below.
  if (isTRUE(warm)) api_card_warm(s, instanceId, list(source = source, render = entry$render, fixed = FALSE, explicit = as.list(inputs)))
  api_create_phase("warm", started); started <- Sys.time()
  defaults <- if (resolved$family == "results_dashboard") team_dashboard_input_defaults() else
    team_plot_instance_input_defaults(resolved$family)
  if (resolved$family == "results_dashboard") defaults$violin_lipid <- api_read(s,
    as.character(s$shared$data_processed_allow_missing()[[1L]][1L]))
  defaults <- defaults[intersect(names(defaults), entry$allowedInputs)]
  defaults <- utils::modifyList(defaults, entry$tabs %||% list())
  defaults <- utils::modifyList(defaults, entry$shownBy %||% list())
  # Team copies the family view's live values (canvas.js instanceValues); headless,
  # those are the checkpoint's archived inputs for that family namespace.
  defaults <- utils::modifyList(defaults, api_family_archived_inputs(s, resolved$family, entry$allowedInputs))
  defaults <- utils::modifyList(defaults, inputs, keep.null = TRUE)
  api_create_phase("defaults", started); started <- Sys.time()
  nodeId <- paste0(instanceId, "-", resolved$output)
  api_session_dirty(s)
  # The card's plot output stays behind its lazy gate (session.R api_output_lazy) until the card's inputs settle:
  # wanted from the start, Team's module drew it once per settling round (seeded instance inputs, echoed module
  # updates, renderUI-built inputs), three full draws of the violin view (~11 s each on the complete fixture).
  api_size(s, nodeId, 800, 600)
  do.call(api_inputs, c(list(s), stats::setNames(defaults, paste0(instanceId, "-", names(defaults)))))
  api_create_phase("inputs", started); started <- Sys.time()
  # A parked module retains its namespace in Team; never reassign it to another source.
  s$instance_sources[[instanceId]] <- source
  api_debug("create instance ", instanceId)
  api_read(s, s$domain$userData$team_canvas_instances_create(list(id = instanceId, source = source, inputs = defaults)))
  api_create_phase("instance", started); started <- Sys.time()
  api_debug("created; flushing until settled")
  api_flush(s, function() s$bus$settled(instanceId))
  api_create_phase("flush", started); started <- Sys.time()
  api_seed_rendered_inputs(s, instanceId)
  api_create_phase("seed", started); started <- Sys.time()
  # Now the plot is drawn, once, from the settled inputs at 800x600 (the size the eager order drew its last draw at,
  # so a render at another size replays the same recorded plot). Seeding again keeps any input whose markup only
  # appears after the plot is drawn; it flushes only if it finds one. Counted in "flush" (Team's graph computes it).
  if (isTRUE(api_output_want(s, nodeId))) {
    api_flush(s)
    api_seed_rendered_inputs(s, instanceId)
  }
  api_create_phase("flush", started); started <- Sys.time()
  errors <- Filter(function(x) identical(x$id, instanceId), s$bus$messages("team-canvas-instance-error"))
  card <- list(instanceId = instanceId, nodeId = nodeId, source = source, family = resolved$family,
    render = entry$render, allowedInputs = entry$allowedInputs, inputs = defaults,
    settled = s$bus$settled(instanceId), error = if (length(errors)) tail(errors, 1L)[[1L]]$message else NULL)
  card$inputs <- api_card_current_inputs(s, card)
  card$plotHeight <- api_card_plot_height(card)
  s$cards[[instanceId]] <- card
  # The disk cache keys a card by the inputs set on it explicitly (render_disk.R).
  if (is.null(s$explicit)) s$explicit <- new.env(parent = emptyenv())
  s$explicit[[instanceId]] <- as.list(inputs)
  api_create_phase("card", started)
  card
  })())
}
# Legacy dashboard nodes (no instance) render through one fixed v0 instance per output.
# Lenient on purpose (the v0 client sends the whole saved input set): keep only the
# inputs this output accepts; /cards stays strict. Building it from saved inputs restores
# the checkpoint, so it never dirties the session (canvas edits do, through validate).
api_dashboard_v0_card <- function(s, output, inputs = list()) {
  if (!is.character(output) || length(output) != 1L || !output %in% c("pca", "violin", "dist", "comp", "heat"))
    api_abort("api_bad_request", "Unknown dashboard output.")
  source <- paste0("results_dashboard-plot_", output)
  allowed <- team_plot_instance_input_ids(source)
  merged <- utils::modifyList(s$inputs, inputs, keep.null = TRUE)
  merged <- merged[intersect(names(merged), allowed)]
  instance <- paste0("tcinstance_v0_", output)
  # Built from the checkpoint's own values: one this build refuses falls back to the default.
  if (!exists(instance, envir = s$cards, inherits = FALSE)) merged <- api_saved_inputs_accepted(source, merged)
  dirty <- isTRUE(s$dirty)
  if (exists(instance, envir = s$cards, inherits = FALSE)) api_card_update(s, instance, merged)
  else api_card_create(s, source, merged, instance, warm = FALSE) # the v0 route draws on the main process
  s$dirty <- dirty
  instance
}
# The v0 route draws a dashboard copy. Before creating the module instance, look for the same
# content on disk: what api_card_create would record as its explicit inputs, keyed like any card.
api_dashboard_v0_render <- function(s, output, inputs = list(), width = 900, height = 600) {
  instance <- paste0("tcinstance_v0_", output)
  if (is.character(output) && length(output) == 1L && output %in% c("pca", "violin", "dist", "comp", "heat") &&
      !exists(instance, envir = s$cards, inherits = FALSE) && exists("api_render_disk_key", mode = "function")) {
    source <- paste0("results_dashboard-plot_", output)
    merged <- utils::modifyList(s$inputs, inputs, keep.null = TRUE)
    merged <- api_saved_inputs_accepted(source, merged[intersect(names(merged), team_plot_instance_input_ids(source))])
    entry <- tryCatch(api_catalog_entry(source), error = function(e) NULL)
    if (!is.null(entry)) {
      descriptor <- list(source = source, render = entry$render, fixed = FALSE, explicit = as.list(merged))
      hit <- api_render_disk_get(api_render_disk_key(s, descriptor, width, height, entry$render))
      if (!is.null(hit)) { hit$cached <- TRUE; hit$disk <- TRUE; return(hit) }
    }
  }
  api_card_render(s, api_dashboard_v0_card(s, output, inputs), width, height)
}
# warm = TRUE (the PATCH route): a changed static input sends a render worker a warm job for the new content before
# this process applies it, so both run in parallel (pool.R; never for actions, which make the card unpoolable).
api_card_update <- function(s, instanceId, inputs = list(), actions = character(), warm = FALSE, req = NULL, res = NULL, handle = NULL) {
  out <- api_mutation(s, req, res, (function() {
  card <- api_card_get(s, instanceId)
  schema <- NULL
  allowed <- card$allowedInputs
  # Pilot F1: a QC copy's per-group pickers never reach its plot (palette.R api_palette_family_dead). Values a
  # checkpoint saved before (Nexo's member re-sends them on reopen) are dropped, not refused: they never drew anything.
  if (api_palette_family_dead(card$family)) inputs <- inputs[!grepl("^(customCol|customShape)_.+$", names(inputs) %||% character())]
  # Computed controls are accepted only when the module has actually built them for this card.
  if (any(api_is_computed_id(names(inputs)))) {
    schema <- api_card_schema(s, instanceId)
    built <- vapply(schema$controls, function(x) if (isTRUE(x$computed)) x$id else NA_character_, character(1))
    allowed <- c(allowed, built[!is.na(built)])
  }
  api_card_inputs_validate(inputs, allowed)
  if (is.list(actions)) actions <- as.character(unlist(actions, use.names = FALSE))
  if (!is.character(actions) || anyNA(actions) || any(!grepl("^[A-Za-z][A-Za-z0-9_]{0,99}$", actions)))
    api_abort("api_bad_request", "Actions must be an array of action names.")
  if (length(inputs) || length(actions)) {
    if (is.null(schema)) schema <- api_card_schema(s, instanceId)
    inputs <- api_validate_inputs(schema$controls, inputs)
    allowed_actions <- as.character(unlist(schema$actions, use.names = FALSE))
    unknown <- setdiff(actions, allowed_actions)
    if (length(unknown)) api_abort("api_bad_request", paste("Unknown action:", paste(unknown, collapse = ", ")))
  }
  # Values equal to the live ones are not changes (the legacy dashboard route re-sends
  # the whole saved set): skip them so they neither dirty the session nor bump the epoch.
  if (length(inputs)) {
    live <- api_read(s, lapply(names(inputs), function(n)
      tryCatch(s$mock$input[[paste0(instanceId, "-", n)]], error = function(e) NULL)))
    inputs <- inputs[!mapply(identical, live, inputs, USE.NAMES = FALSE)]
  }
  if (length(inputs) || length(actions)) api_session_dirty(s)
  if (length(inputs) && !is.null(s$explicit) && !is.null(s$explicit[[instanceId]]))
    s$explicit[[instanceId]] <- utils::modifyList(s$explicit[[instanceId]], inputs, keep.null = TRUE)
  # A pressed module button changes state its inputs do not record: no disk cache for this card.
  if (length(actions)) { if (is.null(s$acted)) s$acted <- new.env(parent = emptyenv()); s$acted[[instanceId]] <- TRUE }
  if (isTRUE(warm) && length(inputs) && !length(actions)) api_card_warm(s, instanceId)
  s$bus$modal <- NULL
  if (length(inputs)) do.call(api_inputs, c(list(s),
    stats::setNames(inputs, paste0(instanceId, "-", names(inputs)))))
  for (action in actions) {
    key <- paste0(instanceId, "-", action)
    current <- api_read(s, tryCatch(s$mock$input[[key]], error = function(e) NULL)) %||% 0L
    if (!is.numeric(current) || length(current) != 1L || !is.finite(current))
      api_abort("api_bad_request", paste("Not an action counter:", action))
    do.call(api_inputs, c(list(s), stats::setNames(list(current + 1L), key)))
  }
  api_card_pressed_add(s, instanceId, actions)
  api_flush(s)
  # A module button can make Team's renderUI build new inputs (the species plot's "Select Shifts to Visualize:"
  # after "Initiate Structural Analysis", 8_structural_module.R classSelectorUI): the browser's binding gives them
  # their default as the markup appears, so seed them here as on create (chart audit b07 F4).
  if (length(actions)) api_seed_rendered_inputs(s, instanceId)
  card$inputs <- api_card_current_inputs(s, card)
  card$settled <- s$bus$settled(instanceId)
  card$plotHeight <- api_card_plot_height(card)
  s$cards[[instanceId]] <- card
  out <- list(settled = card$settled, inputs = card$inputs)
  if (!is.null(card$plotHeight)) out$plotHeight <- card$plotHeight
  modal <- api_modal_parts(s$bus$modal$html)
  s$bus$modal <- NULL
  if (!is.null(modal)) out$modal <- modal
    out
  })(), handle = handle)
  # Test-only crash after application; no test state or timers when the options are unset.
  fail <- getOption("nexo.api.fail_after_apply")
  if (!is.null(fail) && isTRUE(fail(s$sessionId, instanceId))) stop("test: PATCH failed after apply")
  delay <- getOption("nexo.api.delay_patch")
  if (!is.null(delay)) {
    s$test_patch_n <- (s$test_patch_n %||% 0L) + 1L
    seconds <- delay(s$sessionId, instanceId, s$test_patch_n)
    # Yield while waiting so an in-process test can apply the next PATCH before this answer.
    until <- Sys.time() + seconds
    while (Sys.time() < until) later::run_now(max(0, min(0.01, as.numeric(until - Sys.time()))))
  }
  out
}
# The module's own plot height for a card whose catalog entry names a height input (catalog.R):
# the settled instance value of that input (Team's renderUI seeds it), never recomputed here.
api_card_plot_height <- function(card) {
  input <- tryCatch(api_catalog_entry(card$source)$heightInput, error = function(e) NULL)
  if (!is.character(input) || length(input) != 1L) return(NULL)
  value <- suppressWarnings(as.numeric(unlist(card$inputs[[input]], use.names = FALSE)))
  if (length(value) != 1L || !is.finite(value) || value <= 0) return(NULL)
  as.integer(round(value))
}
# A modalDialog's markup as the client shows it: the title's text and the body's html
# (the client keeps a safe subset of that html; nothing here runs in a browser).
api_modal_parts <- function(html) {
  if (!is.character(html) || !length(html) || !nzchar(html)) return(NULL)
  doc <- tryCatch(xml2::read_html(html), error = function(e) NULL)
  if (is.null(doc)) return(NULL)
  has <- function(name) paste0("contains(concat(' ',@class,' '),' ", name, " ')")
  title <- xml2::xml_find_first(doc, paste0("//*[", has("modal-title"), "]"))
  title <- if (inherits(title, "xml_missing")) "" else api_button_text(title) %||% ""
  body <- xml2::xml_find_first(doc, paste0("//*[", has("modal-body"), "]"))
  body <- if (inherits(body, "xml_missing")) "" else paste(vapply(xml2::xml_contents(body), as.character, character(1)), collapse = "")
  list(title = title, html = body)
}
api_card_render_size <- function(width, height) {
  dimension <- function(x) is.numeric(x) && length(x) == 1L && is.finite(x) && x > 0
  if (!dimension(width) || !dimension(height)) api_abort("api_bad_request", "Width and height must be positive finite numbers.")
  # Team's canvas limits (canvas_state.R): width 240-4000, height 220-4000. Cap, do not reject.
  c(min(max(width, 100), 4000), min(max(height, 100), 4000))
}
# Team's module stopped with an R error while drawing (not a req()/validate() refusal). Team's browser shows that
# error text in the output; answer 422 with it (forwarded from a render worker like any api_unprocessable) instead
# of plumber's generic 500. The API's own refusals and session loss keep their class.
api_render_module_error <- function(e) {
  own <- c("api_bad_request", "api_not_found", "api_conflict", "api_unprocessable", "api_too_large",
    "api_unavailable", "api_method_not_allowed", "session_lost")
  if (any(own %in% class(e))) stop(e)
  message <- conditionMessage(e)
  api_abort("api_unprocessable", if (nzchar(message)) paste("Team's module could not draw this plot:", message)
    else "Team's module could not draw this plot (it stopped without a message).")
}
# Team's three BQC views draw only a small grey sentence on an empty plot when fewer than 2 BQC replicate samples are
# chosen (R/modules/2_qc_boxplot_module.R output$bqcPlot, bqcDeviationPlot, bqcAbundancePlot); on a board card that
# image reads as blank. After Team drew it, the card gets Team's sentence instead (422, as a validate() refusal).
api_bqc_placeholders <- c(bqcPlot = "Please configure at least 2 BQC replicate samples to view plot.",
  bqcDeviationPlot = "Please configure at least 2 BQC replicate samples.",
  bqcAbundancePlot = "Please configure at least 2 BQC replicate samples.")
api_bqc_placeholder <- function(s, card) {
  output <- sub("^qc_pca_tab-", "", card$source)
  if (!startsWith(card$source, "qc_pca_tab-") || !output %in% names(api_bqc_placeholders)) return(invisible())
  chosen <- api_read(s, s$mock$input[[sub("[^-]+$", "bqcSamples", card$nodeId)]])
  if (length(chosen) < 2L) api_abort("api_unprocessable", api_bqc_placeholders[[output]])
}
api_card_render <- function(s, instanceId, width = 800, height = 600,
                            format = c("auto", "plotly", "png", "svg"), dpr = 1L, res = NULL) {
  if (missing(format)) format <- "auto"
  api_render_answer(s, res, (function() {
  started <- Sys.time()
  size <- api_card_render_size(width, height); width <- size[[1L]]; height <- size[[2L]]
  dpr <- api_render_dpr(dpr)
  api_timing_add("args", started); started <- Sys.time()
  # Disk cache (render_disk.R): a saved card whose content was drawn before is served
  # without re-creating its module; anything that feeds the plot is in the key.
  descriptor <- if (exists("api_card_descriptor", mode = "function")) api_card_descriptor(s, instanceId) else NULL
  api_timing_add("descriptor", started)
  disk_key <- NULL
  if (!is.null(descriptor) && is.character(format) && length(format) == 1L &&
      (identical(format, "auto") || identical(format, descriptor$render) ||
        # Nexo asks Plotly and visNetwork cards for "json": the card's native JSON, the same render.
        (identical(format, "json") && descriptor$render %in% c("plotly", "visnetwork")))) {
    # The memory cache first: it holds what this session drew (or read from disk) at this epoch, under the key
    # the render below stores (the card's native format, dpr 1 for anything but a PNG). Looking at the disk first
    # answered every repeat of a disk-cacheable card from disk (digest + readRDS) and never said "memory".
    started <- Sys.time()
    key_format <- api_render_format_key(descriptor$render, if (identical(descriptor$render, "png")) dpr else 1L)
    hit <- api_render_cache_get(s, api_render_key(s, instanceId, width, height, key_format))
    api_timing_add("memory", started)
    if (!is.null(hit)) { hit$cached <- TRUE; api_timing_note("hit", "memory"); return(hit) }
    started <- Sys.time()
    disk_key <- api_render_disk_key(s, descriptor, width, height, key_format)
    hit <- api_render_disk_get(disk_key)
    api_timing_add("cache", started)
    if (!is.null(hit)) {
      started <- Sys.time()
      api_render_cache_put(s, api_render_key(s, instanceId, width, height, key_format), hit)
      api_timing_add("store", started)
      hit$cached <- TRUE; hit$disk <- TRUE; api_timing_note("hit", "disk")
      return(hit)
    }
  }
  started <- Sys.time(); loaded <- is.character(instanceId) && length(instanceId) == 1L && exists(instanceId, envir = s$cards, inherits = FALSE)
  card <- api_card_get(s, instanceId)
  # Restoring a saved card (re-creating its module instance) is the "open" phase; looking up a live card is "card".
  api_timing_add(if (loaded) "card" else "open", started); started <- Sys.time()
  # Only renderPlot reads the pixel ratio; other renderers draw once at the logical size.
  if (!identical(card$render, "png")) dpr <- 1L
  if (!is.character(format) || length(format) != 1L || is.na(format) ||
      !format %in% c("auto", "json", "plotly", "png", "svg")) api_abort("api_bad_request", "Unknown render format.")
  # "json" = whatever native JSON the card produces (plotly, visnetwork or html data).
  if (identical(format, "json")) format <- if (card$render %in% c("plotly", "visnetwork", "html")) card$render else "json"
  # H1 returns the native renderer. No browser or image-conversion service is involved.
  if (format != "auto" && format != card$render)
    api_abort("api_unprocessable", paste("This card supports native", card$render, "rendering; requested", format))
  key <- api_render_key(s, instanceId, width, height, api_render_format_key(if (identical(format, "auto")) card$render else format, dpr))
  hit <- api_render_cache_get(s, key)
  api_timing_add("memory", started)
  if (!is.null(hit)) { hit$cached <- TRUE; api_timing_note("hit", "memory"); return(hit) }
  started <- Sys.time()
  api_output_want(s, card$nodeId)
  api_size(s, card$nodeId, width, height)
  if (identical(card$render, "png")) api_pixelratio(s, card$nodeId, dpr)
  api_timing_add("input", started); started <- Sys.time()
  api_flush(s)
  api_timing_add("flush", started); started <- Sys.time()
  unavailable <- function(e) {
    message <- conditionMessage(e)
    if (!nzchar(message)) message <- "The plot inputs are unavailable for this session."
    api_abort("api_unprocessable", message)
  }
  api_debug("getOutput ", card$nodeId)
  value <- tryCatch(api_read(s, s$mock$getOutput(card$nodeId)),
    shiny.silent.error = unavailable, validation = unavailable, error = api_render_module_error)
  api_bqc_placeholder(s, card)
  api_timing_add("output", started); started <- Sys.time()
  figure <- NULL; png <- NULL
  if (card$render %in% c("plotly", "visnetwork")) {
    if (!is.character(value) || length(value) != 1L)
      api_abort("api_unprocessable", "The plot inputs are unavailable for this session.")
    figure <- jsonlite::fromJSON(value, simplifyVector = FALSE)$x
  } else if (card$render == "png") {
    if (!is.list(value) || !is.character(value$src) || length(value$src) != 1L ||
        !startsWith(value$src, "data:image/png;base64,"))
      api_abort("api_unprocessable", "The plot did not produce a PNG image.")
    png <- jsonlite::base64_dec(sub("^data:image/png;base64,", "", value$src))
  } else {
    messages <- Filter(function(x) identical(x$id, instanceId), s$bus$messages("team-group-comparison-data"))
    figure <- if (length(messages)) tail(messages, 1L)[[1L]] else list(requiresConfirmation = TRUE)
  }
  api_timing_add("encode", started); started <- Sys.time()
  # Reading the preparation revision may settle Team's shared preparation reactive: its own phase.
  s$revision <- api_read(s, s$shared$preparation_state()$revision)
  api_timing_add("revision", started); started <- Sys.time()
  result <- list(render = card$render, figure = figure, png = png, width = width, height = height,
    provenance = list(commit = api_commit, checkpointSha256 = s$sha256,
      preparationCheck = s$receipt, revision = s$revision, hooks = "team"), cached = FALSE)
  # Only a PNG carries its pixel ratio (width/height stay the logical size the <img> is shown at).
  if (dpr != 1L) result$dpr <- dpr
  # Keyed with the epoch after the flush: echoed updates during this render are part of it.
  api_render_cache_put(s, api_render_key(s, instanceId, width, height, api_render_format_key(if (identical(format, "auto")) card$render else format, dpr)), result)
  api_timing_add("store", started); started <- Sys.time()
  # Store under the key computed before the render, and only if nothing that feeds the
  # plot changed meanwhile (a restore records the same explicit inputs it was keyed with).
  # "rekey" = re-reading the descriptor and the disk key after the render; "disk" = writing the disk entry.
  same <- !is.null(disk_key) && identical(disk_key, api_render_disk_key(s, api_card_descriptor(s, instanceId), width, height, api_render_format_key(card$render, dpr)))
  if (!is.null(disk_key)) api_timing_add("rekey", started)
  if (same) {
    started <- Sys.time()
    api_render_disk_put(disk_key, result)
    api_timing_add("disk", started)
  }
  result
  })())
}
# Retina (Phase 1 close): a PNG render may be drawn at pixel ratio 2. 1 (the default) or 2 only.
api_render_dpr <- function(dpr) {
  if (is.null(dpr)) return(1L)
  if (!is.numeric(dpr) || length(dpr) != 1L || is.na(dpr) || !dpr %in% c(1, 2))
    api_abort("api_bad_request", "dpr must be 1 or 2.")
  as.integer(dpr)
}
# The format part of the memory and disk cache keys: a 2x PNG never answers a 1x request (and
# back). 1x keys are unchanged, so the disk cache written before this change still hits.
api_render_format_key <- function(format, dpr = 1L) if (isTRUE(dpr > 1L)) paste0(format, "@", dpr, "x") else format
api_card_park <- function(s, instanceId) {
  api_mutation(s, NULL, NULL, (function() {
  api_card_get(s, instanceId)
  # This production tree implements the park event in plot_instances.R.
  api_session_dirty(s)
  api_inputs(s, team_canvas_instance_park = instanceId)
  api_flush(s)
  rm(list = instanceId, envir = s$cards)
  invisible(NULL)
  })())
}
api_commit <- tryCatch(unname(system2("git", c("rev-parse", "HEAD"), stdout = TRUE)[1L]),
  error = function(e) NA_character_)


# Inputs that Team creates through renderUI get their initial values from the
# browser's input bindings when the markup is inserted. Headless, we read each
# rendered UI output of the instance, derive the defaults from the markup with
# Team's own team_plot_instance_doc_defaults(), and set the ones still unset.
api_rendered_output_names <- function(s, instanceId) {
  private <- tryCatch(s$mock$.__enclos_env__$private, error = function(e) NULL)
  outs <- names(private$outs)
  outs <- outs[startsWith(outs, paste0(instanceId, "-"))]
  # Reading a download output runs its content function (e.g. a full ggsave): only the
  # markup outputs matter here, so skip download handlers (H8 profile: 57% of a heatmap create).
  downloads <- vapply(outs, function(name) isTRUE(tryCatch(private$file_generators$has(s$mock$ns(name)), error = function(e) FALSE)), logical(1))
  outs[!downloads]
}
api_seed_rendered_inputs <- function(s, instanceId, rounds = 2L) {
  prefix <- paste0(instanceId, "-")
  for (round in seq_len(rounds)) {
    seeded <- list()
    for (name in api_rendered_output_names(s, instanceId)) {
      value <- tryCatch(api_read(s, s$mock$getOutput(name)), error = function(e) NULL)
      html <- if (is.list(value) && is.character(value$html)) value$html else if (is.character(value) && length(value) == 1L && grepl("<", value, fixed = TRUE)) value else NULL
      if (is.null(html)) next
      doc <- tryCatch(xml2::read_html(gsub(prefix, "tcinstance_schema-", html, fixed = TRUE)), error = function(e) NULL)
      defaults <- tryCatch(team_plot_instance_doc_defaults(doc), error = function(e) list())
      for (key in names(defaults)) {
        id <- paste0(prefix, key)
        current <- tryCatch(api_read(s, s$mock$input[[id]]), error = function(e) NULL)
        if (is.null(current) && is.null(seeded[[id]])) seeded[[id]] <- defaults[[key]]
      }
    }
    if (!length(seeded)) break
    api_debug("seeding ", length(seeded), " rendered inputs for ", instanceId)
    do.call(api_inputs, c(list(s), seeded))
    api_flush(s)
  }
  invisible(s)
}


# Chart audit b07 F3: module actions the user pressed on a card (e.g. structural "Initiate Structural Analysis").
# Team's canvas saves only a card's inputs, so a copy or a reopened card showed Team's placeholder until the user
# pressed the button again. Nexo keeps the pressed action ids, ordered, in its own checkpoint member
# (nexo-canvas-v1.json, nodes[<node id>]$actions; never the instance inputs, so Team's validator and Team's restore
# are unchanged) and the API presses them again on the copy, the restored card or the recovered session's card.
# Replay is idempotent (an action already pressed on this instance is not pressed again) and bounded (each recorded
# action at most once per call, at most 20). Download buttons are never recorded nor replayed.
api_card_action_ids <- function(actions) {
  if (is.list(actions)) actions <- unlist(actions, use.names = FALSE)
  if (is.null(actions) || !length(actions)) return(character())
  if (!is.character(actions) || anyNA(actions) || any(!grepl("^[A-Za-z][A-Za-z0-9_]{0,99}$", actions)))
    api_abort("api_bad_request", "Actions must be an array of action names.")
  actions <- unique(actions[!grepl("download", actions, ignore.case = TRUE)])
  if (length(actions) > 20L) api_abort("api_bad_request", "At most 20 recorded actions.")
  actions
}
api_card_pressed <- function(s, instanceId)
  if (is.null(s$pressed) || !exists(instanceId, envir = s$pressed, inherits = FALSE)) character() else s$pressed[[instanceId]]
api_card_pressed_add <- function(s, instanceId, actions) {
  actions <- actions[!grepl("download", actions, ignore.case = TRUE)]
  if (!length(actions)) return(invisible(NULL))
  if (is.null(s$pressed)) s$pressed <- new.env(parent = emptyenv())
  s$pressed[[instanceId]] <- unique(c(api_card_pressed(s, instanceId), actions))
  invisible(NULL)
}
# The actions Nexo's member records for the open canvas node that holds this instance.
api_card_member_actions <- function(s, instanceId) {
  members <- s$nexo$nodes
  if (!is.list(members) || !length(members) || !is.character(instanceId) || length(instanceId) != 1L) return(character())
  for (node in s$canvas$nodes %||% list()) {
    instance <- if (is.list(node)) node$instance else NULL
    if (!is.list(instance) || !identical(instance$id %||% instance$instanceId, instanceId)) next
    if (!is.character(node$id) || length(node$id) != 1L || !is.list(members[[node$id]])) return(character())
    return(tryCatch(api_card_action_ids(members[[node$id]]$actions), api_bad_request = function(e) character()))
  }
  character()
}
# A restore, not an edit: it never dirties the session. An action the card's module does not offer, or one that
# fails, is reported in `failed` (the card keeps Team's placeholder; Nexo's Inspector asks to press it again).
api_card_replay <- function(s, instanceId, actions) {
  api_mutation(s, NULL, NULL, (function() {
  actions <- api_card_action_ids(actions)
  api_card_get(s, instanceId)
  dirty <- isTRUE(s$dirty)
  on.exit(s$dirty <- dirty, add = TRUE)
  todo <- setdiff(actions, api_card_pressed(s, instanceId))
  failed <- character()
  if (length(todo)) {
    offered <- tryCatch(as.character(unlist(api_card_schema(s, instanceId)$actions, use.names = FALSE)),
      error = function(e) character())
    for (action in todo) {
      ok <- action %in% offered && tryCatch({ api_card_update(s, instanceId, list(), action); TRUE },
        error = function(e) { if (inherits(e, "session_lost")) stop(e); api_debug("replay ", action, " failed: ", conditionMessage(e)); FALSE })
      if (!ok) failed <- c(failed, action)
    }
  }
  list(replayed = I(setdiff(todo, failed)), failed = I(failed), pressed = I(api_card_pressed(s, instanceId)),
    settled = isTRUE(s$cards[[instanceId]]$settled))
  })())
}

# Chart audit b12 (Astra review 2026-11-08): Team turns a click on a cell plot's Plotly point into an input change
# (R/frontends/team/plot_instances.R l.55-62: a class bar selects cell_class, a comparison point selects cell_sample).
# Nexo forwards the click as Shiny's plotly binding sends it (plotly's htmlwidgets/plotly.js registerShinyValue):
# the root input "plotly_click-<source>", where <source> is the instance's private event source, set to the JSON
# array of points (eventDataWithKey). Team's own observer (lipidomic_plotly_event -> plotly::event_data, which
# parses that JSON) then runs. A dedicated route, not PATCH .../cards/<id>: the input is not one of the card's
# namespaced controls (PATCH accepts only allowedInputs, which exclude plotly_ inputs on purpose) and a click is an
# event (Shiny priority "event"), not a value to save. Only the sources Team registers with
# event_register("plotly_click") and observes on a canvas copy (tests/dual-ui/test_api_plotly_click.R checks Team's
# code). The dashboard (rd_<chart>) and Guided QC (guided_qc_points) clicks open Team side panels outside the plot
# (sample card, exclusion popover) that a Nexo card does not show: not forwarded.
api_card_click_sources <- list(cell_class_plot = "cell_class_profile", cell_comparison_plot = "cell_comparison_points")
api_plotly_point_keys <- c("curveNumber", "pointNumber", "x", "y", "z", "customdata", "key")
# A JSON scalar of a click point (number, string, boolean or null), at most 2000 characters.
api_plotly_scalar <- function(x) is.null(x) || ((is.numeric(x) || is.logical(x) || is.character(x)) && length(x) == 1L &&
  (!is.character(x) || (!is.na(x) && nchar(x) <= 2000L)) && (!is.numeric(x) || is.na(x) || is.finite(x)))
# The click's points as plotly's binding builds them, or 400. Values stay as parsed (lists for JSON arrays).
api_plotly_points <- function(points) {
  if (!is.list(points) || !length(points) || length(points) > 50L || !is.null(names(points)))
    api_abort("api_bad_request", "points must be a non-empty array of at most 50 click points.")
  index <- function(x) is.numeric(x) && length(x) == 1L && is.finite(x) && x >= 0 && x == round(x)
  flat <- function(x) is.list(x) && is.null(names(x)) && length(x) <= 50L && all(vapply(x, api_plotly_scalar, logical(1)))
  for (point in points) {
    if (!is.list(point) || is.null(names(point)) || !all(names(point) %in% api_plotly_point_keys) || anyDuplicated(names(point)) ||
        !all(c("curveNumber", "x", "y") %in% names(point)))
      api_abort("api_bad_request", "Each click point is an object with curveNumber, pointNumber, x, y (and optionally z, customdata, key).")
    if (!index(point$curveNumber)) api_abort("api_bad_request", "curveNumber must be a non-negative integer.")
    number <- point$pointNumber
    if (!is.null(number) && !index(number) && !(is.list(number) && length(number) %in% 1:2 && all(vapply(number, index, logical(1)))))
      api_abort("api_bad_request", "pointNumber must be a non-negative integer or a pair of them.")
    for (key in intersect(c("x", "y", "z", "customdata", "key"), names(point)))
      if (!api_plotly_scalar(point[[key]]) && !flat(point[[key]]))
        api_abort("api_bad_request", paste0("Click point ", key, " must be a number, text, boolean, null or a flat array of them."))
  }
  points
}
# The input value Shiny receives: JSON.stringify of plotly's array (a list stays an array, a scalar stays a scalar).
api_plotly_click_json <- function(points) as.character(jsonlite::toJSON(points, auto_unbox = TRUE, null = "null", na = "null", digits = NA))
api_card_event <- function(s, instanceId, body) {
  api_mutation(s, NULL, NULL, (function() {
  card <- api_card_get(s, instanceId)
  if (!is.list(body)) api_abort("api_bad_request", "Expected a JSON object.")
  if (!identical(body$event %||% "plotly_click", "plotly_click")) api_abort("api_bad_request", "Only plotly_click events are forwarded.")
  allowed <- api_card_click_sources[[card$source]]
  if (is.null(allowed)) api_abort("api_bad_request", "This plot takes no click events.")
  if (!is.character(body$source) || length(body$source) != 1L || !identical(body$source, allowed))
    api_abort("api_bad_request", "Unknown event source for this plot.")
  points <- api_plotly_points(body$points)
  key <- paste0("plotly_click-", instanceId, "-", allowed)
  value <- api_plotly_click_json(points)
  set <- function(v) api_guard(s, api_with_loop(s, do.call(s$mock$setInputs, stats::setNames(list(v), key))))
  # Shiny's priority "event": the same click again is a new event; the mock session only invalidates on a change.
  if (identical(api_read(s, tryCatch(s$mock$input[[key]], error = function(e) NULL)), value)) set(NULL)
  set(value)
  api_flush(s)
  before <- card$inputs
  card$inputs <- api_card_current_inputs(s, card)
  card$settled <- s$bus$settled(instanceId)
  changed <- names(card$inputs)[!mapply(identical, card$inputs, before[names(card$inputs)], USE.NAMES = FALSE)]
  if (length(changed)) {
    # As the same choice made in the Data tab: an edit, its values recorded like a PATCH's (disk cache key, worker
    # copies), and this card's cached renders invalidated (the echo of Team's update already bumped its epoch).
    api_session_dirty(s)
    if (!is.null(s$explicit) && !is.null(s$explicit[[instanceId]]))
      s$explicit[[instanceId]] <- utils::modifyList(s$explicit[[instanceId]], card$inputs[changed], keep.null = TRUE)
    api_render_epoch_bump(s, paste0(instanceId, "-", changed))
  }
  card$plotHeight <- api_card_plot_height(card)
  s$cards[[instanceId]] <- card
  list(settled = card$settled, inputs = card$inputs, changed = I(changed))
  })())
}

# Per-phase render timing (Phase 1 close): the render route answers a Server-Timing header and
# logs one line per render to stderr. Phases in ms, every step between the route's start and its answer:
# request (session lookup, body, dpr, size), pool (api_pool_job, only with workers), queue (waiting for a render
# worker; 0 on the main process), args (api_card_render's own size/dpr checks), descriptor (api_card_descriptor),
# memory (memory-cache lookups), cache (disk key digest + disk read), open (restoring a saved card's module
# instance) or card (looking up a live one), input (output wanted, size, pixel ratio), flush (Team's reactive
# graph settles: the plot itself is drawn here or in output), output (getOutput), encode (PNG decode / JSON
# parse), revision (reading the preparation revision), store (memory-cache put), rekey (descriptor + disk key
# re-read after the render), disk (disk-cache write), guard (api_exclusive's memory guard), other (total - the
# sum of the others: what no phase measured), total; "where" says main | worker | main-fallback and "hit" says
# memory | disk. Measurement only: nothing here changes what is drawn.
api_timing <- new.env(parent = emptyenv())
api_timing_reset <- function() {
  api_timing$phases <- list(); api_timing$notes <- list(); api_timing$t0 <- Sys.time(); api_timing$scope <- NULL
  invisible()
}
api_timing_add <- function(phase, since) {
  if (is.null(api_timing$phases)) api_timing_reset()
  ms <- as.numeric(difftime(Sys.time(), since, units = "secs")) * 1000
  api_timing$phases[[phase]] <- (api_timing$phases[[phase]] %||% 0) + ms
  invisible(ms)
}
api_timing_note <- function(key, value) {
  if (is.null(api_timing$notes)) api_timing_reset()
  api_timing$notes[[key]] <- value
  invisible()
}
api_timing_other <- function(phases, total) {
  measured <- sum(vapply(phases[setdiff(names(phases), "other")], function(x) as.numeric(x)[[1L]], numeric(1)))
  max(0, total - measured)
}
api_timing_snapshot <- function() list(phases = api_timing$phases %||% list(), notes = api_timing$notes %||% list(),
  t0 = api_timing$t0 %||% Sys.time())
api_timing_header <- function(timing = api_timing_snapshot(), total = NULL) {
  phases <- timing$phases
  total <- total %||% (as.numeric(difftime(Sys.time(), timing$t0, units = "secs")) * 1000) # %||% binds tighter than *
  parts <- c(vapply(names(phases), function(n) sprintf("%s;dur=%.1f", n, phases[[n]]), character(1)),
    sprintf("total;dur=%.1f", total),
    vapply(names(timing$notes), function(n) sprintf('%s;desc="%s"', n, gsub('[^A-Za-z0-9_.@-]', "", as.character(timing$notes[[n]]))), character(1)))
  paste(parts, collapse = ", ")
}
# Create route (goal 3 diagnosis): request (session lookup, body), validate (source, id, catalog entry, input
# validation, 160-card check), warm (handing the render pool a warm job: never waits for it), defaults (Team's input
# defaults, the family's archived inputs; the results dashboard reads its first lipid here), inputs (size,
# setting the card's inputs on the mock session: setInputs flushes), instance (Team's
# team_canvas_instances_create: the module's server starts), flush (Team's reactive graph until the card settles,
# then, after seed, the plot output wanted and computed once at 800x600), seed (reading the card's rendered UI
# outputs to seed renderUI-built inputs, a flush per round), card (instance errors, current inputs, plot height, records),
# guard, other, total. One stderr line: "create <instance> <source> phase=ms ... total=ms".
api_timing_create_log <- function(instanceId, source, timing = api_timing_snapshot(), total = NULL) {
  total <- total %||% (as.numeric(difftime(Sys.time(), timing$t0, units = "secs")) * 1000) # %||% binds tighter than *
  phases <- timing$phases
  line <- paste(c(sprintf("create %s %s", instanceId %||% "-", source %||% "-"),
    vapply(names(phases), function(n) sprintf("%s=%.0fms", n, phases[[n]]), character(1)),
    sprintf("total=%.0fms", total)), collapse = " ")
  message(line)
  invisible(line)
}
# One line per render: "render <instance> <w>x<h>@<dpr>x <where> phase=ms ... total=ms".
api_timing_log <- function(instanceId, width, height, dpr, timing = api_timing_snapshot(), total = NULL) {
  total <- total %||% (as.numeric(difftime(Sys.time(), timing$t0, units = "secs")) * 1000) # %||% binds tighter than *
  phases <- timing$phases
  line <- paste(c(sprintf("render %s %sx%s@%sx %s", instanceId, width, height, dpr,
      paste(vapply(names(timing$notes), function(n) paste0(n, "=", timing$notes[[n]]), character(1)), collapse = " ")),
    vapply(names(phases), function(n) sprintf("%s=%.0fms", n, phases[[n]]), character(1)),
    sprintf("total=%.0fms", total)), collapse = " ")
  message(line)
  invisible(line)
}
