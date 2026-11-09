# Two Team controls the Nexo Data tab lacked (missing-controls-a).
# 1. Chart audit b07 F4: the species plot's "Select Shifts to Visualize:" (selectedDetails) is built by
#    output$classSelectorUI (renderUI) only after "Initiate Structural Analysis" (runAnalysis),
#    R/modules/8_structural_module.R:2308-2342. In the browser the input binding gives it Team's default
#    (head(raw_choices, 4)) as soon as the markup appears; headless the API must seed it after the action, or
#    "Load Species Plot" (updateSpecies) hits req(isolate(input$selectedDetails)) and draws nothing.
# 2. Chart audit b09 (FLA logratio): Team's index picker (sel_<category> checkbox groups built by
#    output$indexPickerUI, R/modules/10_fla_module.R:877-940) is outside allowedInputs: the schema offers one
#    computed control per category (Team's labels/choices/defaults from the rendered UI) and a PATCH changes the
#    data the card draws.
# Also: the structural Data tab grouped controls under the raw tab value "differential_view"; the schema now
# carries the label Team shows for that tab (groupLabel).
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_missing_controls_a: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_missing_controls_a")
source("R/frontends/api/engine.R")

fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
if (!file.exists(fixture)) { cat("SKIP test_api_missing_controls_a: fixture missing\n"); quit(status = 0) }
s <- api_session_for_checkpoint(fixture)
on.exit(api_session_close(s), add = TRUE)
api_design(s, "Animal", "independent", TRUE)
fails <- function(expr) inherits(tryCatch({ force(expr); NULL }, error = function(e) e), "error")
by_id <- function(controls) stats::setNames(controls, vapply(controls, function(x) x$id, character(1)))
values_of <- function(control) vapply(control$options, function(o) as.character(o$value), character(1))

# --- 1. Species plot: Select Shifts to Visualize -------------------------------------------------------------
card <- api_card_create(s, "structural_tab-speciesPlotPlot")
id <- card$instanceId
stopifnot("selectedDetails" %in% card$allowedInputs)
before <- by_id(api_card_schema(s, id)$controls)
if (!is.null(before$selectedDetails) && length(before$selectedDetails$options))
  stop("selectedDetails offered choices before Initiate Structural Analysis")
cat("PASS before the action the species card offers no shifts (Team's renderUI req()s the analysis)\n")

# The Inspector presses the module button alone (pressAction): no input in the PATCH.
api_card_update(s, id, actions = "runAnalysis")
after <- by_id(api_card_schema(s, id)$controls)
shifts <- after$selectedDetails
if (is.null(shifts)) stop("no selectedDetails control after Initiate Structural Analysis")
stopifnot(identical(shifts$type, "multiselect"), identical(shifts$label, "Select Shifts to Visualize:"),
  !isTRUE(shifts$computed), length(shifts$options) >= 1L)
stopifnot(all(grepl(" \\| ", values_of(shifts))))
default <- as.character(unlist(shifts$default))
stopifnot(length(default) >= 1L, length(default) <= 4L, identical(default, head(values_of(shifts), length(default))))
cat(sprintf("PASS after the action the schema lists selectedDetails (%d shifts, default %s)\n",
  length(shifts$options), paste(default, collapse = ", ")))

# Seeded on the live instance as the browser's binding would (instance input, not Nexo's member).
live <- as.character(unlist(api_read(s, s$mock$input[[paste0(id, "-selectedDetails")]])))
if (!identical(live, default)) stop("selectedDetails not seeded after the action: ", deparse(live))
stopifnot(identical(as.character(unlist(after$selectedDetails$value)), default))
cat("PASS selectedDetails holds Team's default on the instance after the action\n")

# Load Species Plot with Team's default draws.
api_card_update(s, id, actions = "updateSpecies")
rendered <- api_card_render(s, id, 800, 600)
stopifnot(is.raw(rendered$png) || length(rendered$figure$data) > 0L)
cat("PASS Load Species Plot draws with the default shifts\n")

# Pick one shift, load again: still draws, and the instance keeps the pick.
pick <- values_of(shifts)[[length(shifts$options)]]
updated <- api_card_update(s, id, list(selectedDetails = list(pick)))
stopifnot(identical(as.character(unlist(updated$inputs$selectedDetails)), pick))
api_card_update(s, id, actions = "updateSpecies")
rendered <- api_card_render(s, id, 800, 600)
stopifnot(is.raw(rendered$png) || length(rendered$figure$data) > 0L)
stopifnot(fails(api_card_update(s, id, list(selectedDetails = list("No | Such shift")))))
cat("PASS selecting a shift + Load Species Plot draws; an unknown shift is refused\n")

# The differential tab's controls carry Team's tab title, not the raw value.
raw <- Filter(function(x) identical(x$group, "differential_view"), api_card_schema(s, id)$controls)
if (length(raw)) {
  labels <- unique(vapply(raw, function(x) as.character(x$groupLabel %||% ""), character(1)))
  if (!identical(labels, "Differential Acyl Chain Expression")) stop("differential_view group label: ", deparse(labels))
  cat("PASS differential_view controls are titled 'Differential Acyl Chain Expression'\n")
} else cat("NOTE no differential_view controls on the species card\n")

# --- 2. FLA logratio: the index picker -------------------------------------------------------------------------
fla <- api_card_create(s, "fla_tab-logratioPlot")
fid <- fla$instanceId
controls <- by_id(api_card_schema(s, fid)$controls)
sel <- names(controls)[startsWith(names(controls), "sel_")]
if (!length(sel)) stop("no sel_<category> control on the FLA logratio card")
stopifnot(!any(sel %in% fla$allowedInputs))
for (key in sel) {
  x <- controls[[key]]
  stopifnot(isTRUE(x$computed), identical(x$type, "checkboxgroup"), length(x$options) >= 1L,
    identical(x$label, sub("^sel_", "", key)))
}
chosen <- unlist(lapply(controls[sel], function(x) as.character(unlist(x$value))), use.names = FALSE)
stopifnot(setequal(chosen, intersect(c("PE/PC_Index", "Energy_Load_Index", "(LPC+LPE)/PL_Index"),
  unlist(lapply(controls[sel], values_of)))))
cat(sprintf("PASS FLA schema lists %d computed index pickers (%s), Team's default indices checked\n",
  length(sel), paste(sub("^sel_", "", sel), collapse = ", ")))

indices_drawn <- function() {
  r <- api_card_render(s, fid, 800, 600)
  if (!is.null(r$figure$data)) sort(unique(unlist(lapply(r$figure$data, function(t) c(t$x, t$name)))))
  else digest::digest(r$png)
}
first <- indices_drawn()
# Pick every index of the first category that is not chosen yet (or drop one if all are).
key <- sel[[1L]]; offered <- values_of(controls[[key]]); now <- as.character(unlist(controls[[key]]$value))
next_value <- if (length(setdiff(offered, now))) union(now, setdiff(offered, now)) else head(now, max(1L, length(now) - 1L))
api_card_update(s, fid, setNames(list(as.list(next_value)), key))
stopifnot(identical(as.character(unlist(api_read(s, s$mock$input[[paste0(fid, "-", key)]]))), next_value))
stopifnot(setequal(as.character(unlist(s$explicit[[fid]][[key]] %||% next_value)), next_value))
second <- indices_drawn()
if (identical(first, second)) stop("changing ", key, " did not change the drawn data")
cat(sprintf("PASS setting %s changes the render's data\n", key))
stopifnot(fails(api_card_update(s, fid, setNames(list(list("No_Such_Index")), key))))
stopifnot(fails(api_card_update(s, fid, list(sel_NoSuchCategory = list("PE/PC_Index")))))
cat("PASS an index or category Team did not build is refused\n")

# Another family's sel_ ids stay outside the computed set (logratio_tab keeps its own path).
stopifnot(api_is_computed_id("sel_Structural", "fla_tab"), !api_is_computed_id("sel_Glycerolipids", "logratio_tab"))
cat("PASS sel_<category> is computed for the FLA family only\n")
cat("PASS test_api_missing_controls_a\n")
