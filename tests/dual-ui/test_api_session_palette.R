# Pilot phase 1 close, F1 (P2): per-card group colours/shapes did nothing on a QC canvas copy. A copy gets its colour
# map from the session (plot_instances.R: global_color_map <- shared_data$color_maps(); QC builds with
# global_color_map()[[colorMap_key]] and shared_data$shape_maps()), and its customCol_*/customShape_* pickers only
# feed its return value. What Team offers for group colours is the session palette of the data hub ("Colors &
# palettes"). This test:
#   1. proves, by rendering before/after, which families' per-card pickers reach the plot on a canvas copy
#      (QC: no; cellular organization polar map: yes);
#   2. checks the card schema: QC offers no customCol_/customShape_ and says its group colours follow the session
#      palette; the polar map keeps its pickers; old values are dropped, not refused, on QC;
#   3. drives the session palette route (palette.R) through Team's own editor inputs: a per-group colour, a preset,
#      a restore (undo), refusals; the PCA redraws with the new colour; the cache keys follow;
#   4. saves the session as Nexo does (Team's export_session_path) and reopens it: Team's archive reader and
#      Team's restore keep the colour (round trip).
# Written on a machine without R (2026-11-08): never run by its author; run it in a UTF-8 locale, e.g.
#   LC_ALL=en_US.UTF-8 Rscript tests/dual-ui/test_api_session_palette.R
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_session_palette: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0", LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV", "LIPIDOMIC_API_WORKERS"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_session_palette")
source("R/frontends/api/engine.R")
if (!exists("api_palette_update", mode = "function")) stop("FAIL palette.R is not loaded by engine.R (no api_palette_update)")

fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
s <- api_session_open(fixture)
on.exit(api_session_close(s), add = TRUE)
by_id <- function(controls) stats::setNames(controls, vapply(controls, function(x) x$id, character(1)))
refused <- function(expr) tryCatch({ force(expr); FALSE }, error = function(e) inherits(e, "api_bad_request"))
set_input <- function(id, key, value) do.call(api_inputs, c(list(s), stats::setNames(list(value), paste0(id, "-", key))))
draw <- function(id) { api_render_cache_clear(s); r <- api_card_render(s, id, 620, 600); stopifnot(is.raw(r$png) || !is.null(r$figure)); r }
print_of <- function(r) digest::digest(if (is.raw(r$png)) r$png else r$figure)
# A PNG pixel of this colour within +-12 per channel (the pilot's pixel check), drawn at `alpha` over white (a point's
# centre), when the png package is installed.
has_colour <- function(r, hex, alpha = 1) {
  if (!is.raw(r$png)) return(grepl(tolower(hex), tolower(jsonlite::toJSON(r$figure, auto_unbox = TRUE)), fixed = TRUE) ||
    grepl(sprintf("rgba(%d,%d,%d", strtoi(substr(hex, 2, 3), 16L), strtoi(substr(hex, 4, 5), 16L), strtoi(substr(hex, 6, 7), 16L)),
      gsub(" ", "", jsonlite::toJSON(r$figure, auto_unbox = TRUE)), fixed = TRUE))
  if (!requireNamespace("png", quietly = TRUE)) return(NA)
  img <- png::readPNG(r$png); want <- alpha * grDevices::col2rgb(hex)[, 1] / 255 + (1 - alpha)
  near <- function(k, v) abs(img[, , k] - v) <= 12 / 255
  any(near(1, want[[1]]) & near(2, want[[2]]) & near(3, want[[3]]))
}
colour <- "#AA3300"

# Group 1 levels as Team's session map holds them (the fixture's Control group when it has one).
maps <- api_read(s, s$shared$color_maps())
groups <- sort(names(maps$Group1))
if (!length(groups)) stop("FAIL the fixture has no Group1 colour map")
group <- if ("Control" %in% groups) "Control" else groups[[1L]]
original <- toupper(maps$Group1[[group]])
if (identical(original, colour)) stop("FAIL pick another test colour: the fixture already draws ", group, " in ", colour)
picker <- paste0("customCol_", gsub("\\s|&", "_", group))
cat(sprintf("INFO Group1 levels %s; testing %s (session colour %s)\n", paste(groups, collapse = ", "), group, original))

# 1. Which per-card pickers reach the plot on a canvas copy: set the picker as Team's browser would (the module
#    built it in renderUI) and render before/after.
pca <- api_card_create(s, "qc_pca_tab-pca2dPlot")$instanceId
set_input(pca, "useCustomColors", TRUE); api_flush(s)
before <- draw(pca)
set_input(pca, picker, colour); api_flush(s)
if (!identical(api_read(s, s$mock$input[[paste0(pca, "-", picker)]]), colour)) stop("FAIL the QC picker input was not set")
after <- draw(pca)
if (!identical(print_of(before), print_of(after))) stop("FAIL QC: the copy's ", picker, " changed its PCA (expected Team to ignore it)")
if (isTRUE(has_colour(after, colour))) stop("FAIL QC: the PCA shows ", colour, " after the copy's picker")
set_input(pca, "useShapes", TRUE); api_flush(s)
shaped <- draw(pca)
shape_levels <- sort(names(api_read(s, s$shared$shape_maps())[[api_read(s, s$mock$input[[paste0(pca, "-shapeGrouping")]]) %||% "Group2"]]))
shape_group <- if (length(shape_levels)) shape_levels[[1L]] else group
set_input(pca, paste0("customShape_", gsub("\\s|&", "_", shape_group)), "8"); api_flush(s)
if (!identical(print_of(shaped), print_of(draw(pca)))) stop("FAIL QC: the copy's customShape_ changed its PCA (expected Team to ignore it)")
cat("PASS QC copy: customCol_/customShape_ set as Team's browser would leave the PCA unchanged (dead on a canvas copy)\n")

polar <- api_card_create(s, "cellular_org_tab-polarPlot")$instanceId
set_input(polar, "useCustomColors", TRUE); api_flush(s)
polar_before <- draw(polar)
set_input(polar, picker, colour); api_flush(s)
polar_after <- draw(polar)
if (identical(print_of(polar_before), print_of(polar_after))) stop("FAIL cellular polar map: the copy's ", picker, " did not change the plot")
# Its points are drawn with alpha = 0.85 (14_cellular_org_module.R, geom_point(size = pt_size, alpha = 0.85)).
if (identical(has_colour(polar_after, colour, 0.85), FALSE)) stop("FAIL cellular polar map: no ", colour, " pixel (alpha 0.85) after the copy's picker")
cat(sprintf("PASS cellular organization polar map: the copy's own %s redraws it%s (kept per card)\n", picker,
  if (isTRUE(has_colour(polar_after, colour, 0.85))) paste0(" in ", colour, " (alpha 0.85)") else ""))

# 2. The card schema follows: QC offers no per-group pickers and says its colours follow the session palette.
qc_schema <- api_card_schema(s, pca)
qc_ids <- vapply(qc_schema$controls, `[[`, "", "id")
if (any(grepl("^(customCol|customShape)_", qc_ids))) stop("FAIL QC schema still offers ", paste(grep("^(customCol|customShape)_", qc_ids, value = TRUE), collapse = ", "))
if (!isTRUE(qc_schema$sessionPalette)) stop("FAIL QC schema does not say sessionPalette = TRUE")
polar_controls <- by_id(api_card_schema(s, polar)$controls)
if (!isTRUE(polar_controls[[picker]]$computed)) stop("FAIL the polar map no longer offers ", picker, " (computed)")
if (!isTRUE(api_card_schema(s, polar)$sessionPalette)) stop("FAIL the polar map's base colours follow the session: sessionPalette expected")
stopifnot(!api_is_computed_id("customCol_Control", "qc_pca_tab"), api_is_computed_id("customCol_Control", "cellular_org_tab"),
  api_is_computed_id("customCol_Control")) # the render pool's family-less guard still counts them
# A checkpoint saved before this fix may carry them in Nexo's member: Nexo re-sends them on reopen. Dropped, not 400.
updated <- tryCatch({ api_card_update(s, pca, stats::setNames(list("#123456"), picker)); TRUE }, error = function(e) conditionMessage(e))
if (!isTRUE(updated)) stop("FAIL an old QC customCol_ value is refused: ", updated)
if (!is.null(s$explicit[[pca]][[picker]])) stop("FAIL the dropped QC picker landed in the card's explicit inputs")
if (!refused(api_card_update(s, polar, list(customCol_NoSuchGroup = "#123456")))) stop("FAIL an unknown group on the polar map is accepted")
cat("PASS schema: QC has no customCol_/customShape_ and sessionPalette = TRUE; the polar map keeps them; old QC values are dropped\n")

# 3. The session palette route, through Team's editor inputs.
got <- api_palette_get(s)
names_of <- vapply(got$palettes, `[[`, "", "name")
if (!identical(names_of[seq_len(1L + length(COLOR_PALETTE_PRESETS))], c("Default", names(COLOR_PALETTE_PRESETS))))
  stop("FAIL palettes are not Team's list (Default, then COLOR_PALETTE_PRESETS): ", paste(names_of, collapse = ", "))
g1 <- Filter(function(x) identical(x$id, "Group1"), got$contexts)
if (length(g1) != 1L || !identical(g1[[1L]]$label, "Sample groups (Group 1)")) stop("FAIL no Group1 context labelled as Team's editor")
listed <- stats::setNames(vapply(g1[[1L]]$groups, `[[`, "", "color"), vapply(g1[[1L]]$groups, `[[`, "", "name"))
if (!identical(unname(listed[groups]), toupper(unname(unlist(maps$Group1[groups]))))) stop("FAIL Group1 colours are not the session's color_maps()")
if (!isFALSE(got$shapesEditable)) stop("FAIL Team's palette editor has no shapes: shapesEditable must be FALSE")
cat(sprintf("PASS GET palette: %d palettes (Team's names), %d context(s), Group1 colours = the session map\n", length(got$palettes), length(got$contexts)))

state0 <- got$state
epoch <- s$epoch %||% 0; s$dirty <- FALSE
others <- api_read(s, s$shared$color_maps()$Group1)
edited <- api_palette_update(s, list(context = "Group1", colors = stats::setNames(list(tolower(colour)), group)))
live <- api_read(s, s$shared$color_maps()$Group1)
if (!identical(toupper(live[[group]]), colour)) stop("FAIL Team's session map has ", live[[group]], " for ", group, ", expected ", colour)
for (g in setdiff(groups, group)) if (!identical(toupper(live[[g]]), toupper(others[[g]]))) stop("FAIL ", g, " changed with ", group)
if (!identical(api_read(s, s$mock$input$`data_hub-colorEditMode`), "Group1")) stop("FAIL colorEditMode was not Team's Group1 mode")
if (!identical(edited$state$customColors[[palette_context_key("Group1", group)]], colour)) stop("FAIL the state does not carry Group1::", group)
if (!isTRUE(edited$state$useCustomColors)) stop("FAIL useCustomColors not set by Team's apply")
if (!isTRUE(s$dirty) || !((s$epoch %||% 0) > epoch)) stop("FAIL the session is not dirty or its render epoch did not move")
pca_now <- draw(pca)
if (identical(print_of(pca_now), print_of(after))) stop("FAIL the PCA did not redraw with the session colour")
if (identical(has_colour(pca_now, colour), FALSE)) stop("FAIL the PCA has no ", colour, " pixel after the session palette change")
cat(sprintf("PASS PATCH palette {context: Group1, colors: {%s: %s}} sets Team's editor fields + Apply; the PCA redraws%s\n",
  group, colour, if (isTRUE(has_colour(pca_now, colour))) paste0(" in ", colour) else ""))

# The disk-cache key and a render worker's state carry the palette.
descriptor <- list(source = "qc_pca_tab-pca2dPlot", render = "png", fixed = FALSE, explicit = list())
key_edited <- api_render_disk_key(s, descriptor, 620, 600, "png")
# pool.R is in run.R's engine (not engine.R): the workers' state (api_pool_state) carries the palette too.
if (!exists("api_pool_state", mode = "function")) source("R/frontends/api/pool.R", local = globalenv())
stopifnot(identical(api_pool_state(s)$palette, api_palette_key(s)))

state1 <- edited$state
preset <- names(COLOR_PALETTE_PRESETS)[[1L]]
used <- api_palette_update(s, list(palette = preset))
if (!identical(used$active, preset) || !identical(api_read(s, s$shared$palette_settings()$active_palette), preset)) stop("FAIL palette_use did not apply ", preset)
expected <- api_read(s, palette_preset_colors(preset, list(Group1 = as.character(s$shared$allParsedMetadata()$Group1))))
for (g in groups) if (!identical(toupper(api_read(s, s$shared$color_maps()$Group1[[g]])), toupper(expected[[palette_context_key("Group1", g)]])))
  stop("FAIL ", g, " is not ", preset, "'s colour after Use palette")
if (identical(api_render_disk_key(s, descriptor, 620, 600, "png"), key_edited)) stop("FAIL the disk-cache key ignores the session palette")
cat(sprintf("PASS PATCH palette {palette: %s} = Team's palette_choice + Use palette; the disk-cache key follows\n", preset))

# Undo: restore the previous state exactly (Team's own setter), twice back.
api_palette_update(s, list(restore = state1))
if (!identical(api_palette_key(s), state1)) stop("FAIL restore did not bring back the edited state")
if (!identical(api_render_disk_key(s, descriptor, 620, 600, "png"), key_edited)) stop("FAIL the same palette gives another disk-cache key")
api_palette_update(s, list(restore = state0))
if (!identical(api_palette_key(s), state0)) stop("FAIL restore did not bring back the opened state")
if (!identical(toupper(api_read(s, s$shared$color_maps()$Group1[[group]])), original)) stop("FAIL ", group, " is not back to ", original)
cat("PASS PATCH palette {restore: state} brings back an earlier state exactly (undo, reopen, worker alignment)\n")

stopifnot(refused(api_palette_update(s, list(palette = "No such palette"))),
  refused(api_palette_update(s, list(context = "Group1", colors = stats::setNames(list("red"), group)))),
  refused(api_palette_update(s, list(context = "Group1", colors = list(NoSuchGroup = "#123456")))),
  refused(api_palette_update(s, list(context = "Lipid Class", colors = stats::setNames(list("#123456"), group)))),
  refused(api_palette_update(s, list(palette = preset, restore = state0))),
  refused(api_palette_update(s, list(restore = list(useCustomColors = TRUE, customColors = list(x = "nope"), activePalette = "Default")))))
cat("PASS refusals: unknown palette, non-hex colour, unknown group or context, two operations, a bad restore\n")

# 4. Round trip: save as Nexo does (Team's export_session_path, storage.R api_checkpoint_save), then Team's reader
#    and Team's restore (api_session_open imports the ZIP through the data hub).
api_palette_update(s, list(context = "Group1", colors = stats::setNames(list(colour), group)))
zip <- tempfile(fileext = ".zip"); on.exit(unlink(zip), add = TRUE)
api_read(s, s$shared$export_session_path(zip))
archive <- read_session_archive(zip, include_team_canvas = TRUE)
on.exit(unlink(archive$directory, recursive = TRUE), add = TRUE)
saved <- archive$state$color_shape
if (!identical(toupper(saved$custom_colors[[palette_context_key("Group1", group)]] %||% ""), colour) || !isTRUE(saved$useCustomColors))
  stop("FAIL the checkpoint's state.json color_shape does not carry Group1::", group, " = ", colour)
s2 <- api_session_open(zip)
on.exit(api_session_close(s2), add = TRUE)
if (!identical(toupper(api_read(s2, s2$shared$color_maps()$Group1[[group]])), colour)) stop("FAIL reopened: Team's session map lost ", colour)
if (!identical(api_palette_key(s2), api_palette_key(s))) stop("FAIL reopened: the palette state differs")
cat("PASS round trip: Team's export saves the colour (state.json color_shape) and Team's restore brings it back\n")

# 5. The HTTP routes (plumber), when plumber is installed.
if (requireNamespace("plumber", quietly = TRUE)) local({
  s3 <- api_session_for_checkpoint(fixture)
  # plumber.R reads api_run_dir from the global environment (as in test_api_plotly_click.R).
  assign("api_run_dir", normalizePath("R/frontends/api"), envir = globalenv()); root <- getwd()
  router <- plumber::pr_set_serializer(plumber::plumb(file.path(api_run_dir, "plumber.R")),
    plumber::serializer_unboxed_json(null = "null", na = "null", digits = NA))
  setwd(root)
  router <- plumber::pr_hook(router, "preroute", function() setwd(root))
  call <- function(method, path, x = NULL) {
    req <- new.env(); body <- if (is.null(x)) raw() else charToRaw(jsonlite::toJSON(x, auto_unbox = TRUE))
    req$REQUEST_METHOD <- method; req$PATH_INFO <- path; req$QUERY_STRING <- ""
    req$HTTP_CONTENT_TYPE <- "application/json"
    req$rook.input <- list(read = function(l = -1L) body, rewind = function() invisible(0L))
    out <- router$call(req)
    list(status = as.integer(out$status), body = jsonlite::fromJSON(if (is.raw(out$body)) rawToChar(out$body) else as.character(out$body), simplifyVector = FALSE))
  }
  path <- paste0("/api/v1/sessions/", s3$sessionId, "/palette")
  got <- call("GET", path)
  if (got$status != 200L || !is.list(got$body$state$customColors)) stop("FAIL GET palette answered ", got$status)
  sent <- call("PATCH", path, list(context = "Group1", colors = stats::setNames(list(colour), group)))
  if (sent$status != 200L || !identical(sent$body$state$customColors[[palette_context_key("Group1", group)]], colour)) stop("FAIL PATCH palette answered ", sent$status)
  back <- call("PATCH", path, list(restore = got$body$state))
  if (back$status != 200L || !identical(jsonlite::toJSON(back$body$state), jsonlite::toJSON(got$body$state))) stop("FAIL PATCH restore over HTTP did not round-trip the state")
  if (call("PATCH", path, list(palette = "nope"))$status != 400L) stop("FAIL an unknown palette over HTTP is not 400")
  cat("PASS GET/PATCH /api/v1/sessions/<id>/palette: 200, the state round-trips as JSON; a bad palette 400\n")
}) else cat("NOTE plumber not installed: HTTP part skipped\n")
cat("PASS test_api_session_palette\n")
