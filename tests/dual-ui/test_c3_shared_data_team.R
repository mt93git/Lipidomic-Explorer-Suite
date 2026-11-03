# Block C3: Team behaviour in the shared data module, with Classic unchanged.
# Synthetic data only; no network.
# Usage: Rscript --vanilla tests/dual-ui/test_c3_shared_data_team.R
source("R/global.R")
if (!identical(lipidomic_interface(), "classic")) stop("Run this test with the Classic interface.")
check <- function(label, ok) if (!isTRUE(ok)) stop(label, call. = FALSE) else cat("ok -", label, "\n")
source("tests/dual-ui/archive_fixture_helpers.R")

# --- Classic loads no Team code --------------------------------------------
check("Classic does not source Team metadata restore helpers",
  !exists("team_metadata_sidecar_decode") && !exists("team_metadata_validate_ids"))
check("Classic registers no persistent_inputs hook", !"persistent_inputs" %in% lipidomic_hook_registered())

# --- Persistent inputs ------------------------------------------------------
saved <- list(`team_library_open` = 1, `x-team_canvas_state` = "{}", team_canvas_zoom = 2,
  `qc_pca_tab-minDetectionPct` = 50, `assistant_request` = "go")
check("Classic keeps Team library/canvas names and drops only shared transient inputs",
  identical(session_persistent_inputs(saved), saved[1:4]))

# --- Restore seed -----------------------------------------------------------
check("Classic keeps a saved main_navbar", identical(
  team_restore_seed_input(list(main_navbar = "Share"), 9L, "classic"), list(main_navbar = "Share")))
team_seed <- team_restore_seed_input(list(main_navbar = "Share", keep = "v"), 9L, "team")
check("Team drops main_navbar and fills the missing seed",
  is.null(team_seed$main_navbar) && identical(team_seed$keep, "v") && !is.null(team_seed[["qc_pca_tab-imputationSeed"]]))

# --- Archive naming ---------------------------------------------------------
check("Classic archive name is the upload path basename",
  identical(session_archive_dataset_name("abundance.csv", "/tmp/dataset-abc-abundance.csv", 1L, "classic"),
            "dataset-abc-abundance.csv"))
check("Team archive name is short and deterministic", grepl("^dataset-002-[a-f0-9]{16}\\.csv$",
  session_archive_dataset_name("abundance.csv", "/tmp/whatever.tmp", 2L, "team")))
dest <- tempfile("restored-"); dir.create(dest)
classic_path <- session_restored_dataset_path(dest, "/x/data_files/abundance.csv", "classic")
check("Classic restored path keeps its historical dataset-<rand>-<basename> form",
  identical(dirname(classic_path), dest) && grepl("^dataset-[0-9a-f]+-abundance\\.csv$", basename(classic_path)))
check("Team restored path keeps only a validated extension",
  grepl("^dataset-[0-9a-f]+\\.csv$", basename(session_restored_dataset_path(dest, "/x/a-very-long-name.csv", "team"))))
check("An unknown archive policy fails closed", inherits(try(session_archive_dataset_name("a", "b", 1L, "x"), silent = TRUE), "try-error"))
unlink(dest, recursive = TRUE)

# --- Classic export/import round trip is unchanged ---------------------------
created <- make_archive("classic")
members <- zip::zip_list(created$path)$filename
check("Classic export contains no Team canvas", !"team-canvas-v1.json" %in% members)
state <- read_session_archive(created$path)
check("Classic archive read returns no canvas", is.null(state$canvas))
cat("  Classic archive dataset entries:", unlist(state$state$uploads), "\n")
check("Classic archive datasets keep the stored upload basename (no Team dataset-NNN naming)",
  all(grepl("^data_files/upload-[0-9a-f]+\\.csv$", unlist(state$state$uploads))))
unlink(state$directory, recursive = TRUE)

# A canvas file in the ZIP is ignored by Classic reads: team_canvas_read is never called.
d <- tempfile(); dir.create(d); utils::unzip(created$path, exdir = d)
writeLines("{\"not\":\"read\"}", file.path(d, "team-canvas-v1.json"))
with_canvas <- tempfile(fileext = ".zip"); zip::zipr(with_canvas, list.files(d), root = d); unlink(d, recursive = TRUE)
check("Classic read ignores team-canvas-v1.json", is.null(read_session_archive(with_canvas)$canvas))

shiny::testServer(shared_data_server, args = list(external_settings = shiny::reactive(settings_for("classic")),
    preparation_policy = "classic"), {
  api <- session$returned
  check("Classic exposes export_session_path/import_session_path",
    is.function(api$export_session_path) && is.function(api$import_session_path))
  check("Classic keeps request_preparation_run", is.function(api$request_preparation_run))
  check("Classic Team Review request is a no-op", identical(api$request_team_review_preparation("entry"), FALSE) &&
    is.null(api$team_review_preparation_issue()))
  session$userData$team_canvas_import <- function(...) stop("Classic must not import a Team canvas.")
  api$import_session_path(with_canvas)
  for (i in 1:10) session$flushReact()
  check("Classic import via import_session_path restores and prepares as before",
    isTRUE(api$session_restored()) && !is.null(api$data_processed_unfiltered()))
  # The mock browser does not hydrate restored controls; re-run on the live selection.
  session$setInputs(selectedColumns = ids); api$request_preparation_run(); session$flushReact()
  out <- tempfile(fileext = ".zip"); api$export_session_path(out)
  check("Classic re-export has no Team canvas", !"team-canvas-v1.json" %in% zip::zip_list(out)$filename)
  st <- read_session_archive(out)
  cat("  Classic re-export dataset entries:", unlist(st$state$uploads), "\n")
  check("Classic re-export names datasets after the restored temp basename (historical behaviour)",
    all(grepl("^dataset-[0-9a-f]+-", basename(unlist(st$state$uploads)))))
  unlink(c(out, st$directory), recursive = TRUE)
})

# --- Team: hooks, canvas export/import, archive naming -----------------------
source("R/frontends/team/metadata_state.R")
source("R/frontends/team/hooks/persistent_inputs_canvas.R")
check("Team hook drops team_library_/team_canvas_ inputs",
  identical(names(session_persistent_inputs(saved)), "qc_pca_tab-minDetectionPct"))
lipidomic_hook_reset()

# Stub the Team canvas serializers only when the canvas port is not loaded.
if (!exists("team_canvas_validate")) team_canvas_validate <- function(state, ...) state
if (!exists("team_canvas_json")) team_canvas_json <- function(state) jsonlite::toJSON(state, auto_unbox = TRUE, null = "null", digits = NA)
if (!exists("team_canvas_read")) team_canvas_read <- function(path) jsonlite::read_json(path, simplifyVector = FALSE)
team_zip <- tempfile(fileext = ".zip"); imported <- NULL
args <- list(external_settings = shiny::reactive(settings_for("team")), preparation_policy = "team",
  design_check = function() TRUE)
shiny::testServer(shared_data_server, args = args, {
  api <- session$returned
  session$setInputs(files = data.frame(name = "abundance.csv", size = file.info(matrix_path)$size,
    type = "text/csv", datapath = matrix_path), selectedColumns = ids)
  session$flushReact()
  api$set_external_sample_metadata(stage_metadata_v01(metadata, ids, mapping), TRUE)
  session$setInputs(runAnalysis = 1L); session$flushReact()
  check("Team prepares data", !is.null(api$data_processed_unfiltered()))
  session$userData$team_canvas_export <- function(provenance) list(version = "1", nodes = list(), probe = "canvas")
  api$export_session_path(team_zip)
  members <- zip::zip_list(team_zip)$filename
  check("Team export carries team-canvas-v1.json", "team-canvas-v1.json" %in% members)
  check("Team export uses short dataset names", any(grepl("^data_files/dataset-001-[a-f0-9]{16}\\.csv$", members)))
})
shiny::testServer(shared_data_server, args = args, {
  api <- session$returned
  session$userData$team_canvas_import <- function(canvas, provenance) imported <<- list(canvas = canvas, provenance = provenance)
  api$import_session_path(team_zip)
  for (i in 1:12) session$flushReact()
  check("Team import restores and waits for an explicit Review", isTRUE(api$session_restored()) &&
    is.null(api$data_processed_unfiltered()))
  check("Team import hands the canvas and its provenance to the workspace",
    identical(imported$canvas$probe, "canvas") && !is.null(imported$provenance))
})
unlink(c(team_zip, with_canvas, created$path), recursive = TRUE)
cat("PASS: C3 shared data Team behaviour, Classic unchanged\n")
