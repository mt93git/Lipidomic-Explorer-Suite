# Equivalence: Review "Edit groups" -> Apply rebuilds the sample metadata, groups and colours
# EXACTLY as uploading the same edited table through "Add sample labels" (the real
# sample_metadata_import_server confirm path). Uses Paula's 67-sample checkpoint (ckpt16).
# Usage (from the repo root):
#   TEAM_GROUPS_CKPT=~/ux-equivalence/ux13/ckpt16.zip R --vanilla --no-echo --file=tests/dual-ui/test_team_group_editor_equivalence.R
ck <- path.expand(Sys.getenv("TEAM_GROUPS_CKPT", "~/ux-equivalence/ux13/ckpt16.zip"))
# Paula's checkpoint is real lab data and is not in the repository: without it there is nothing to compare.
if (!file.exists(ck)) {
  cat("SKIP test_team_group_editor_equivalence.R: needs Paula's 67-sample checkpoint (real data, not in the repository); set TEAM_GROUPS_CKPT to run it\n")
  quit(save = "no", status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/global.R")
team_workspace_enabled <- function() TRUE
check <- function(label, ok) if (!isTRUE(ok)) stop("FAIL: ", label, call. = FALSE) else cat("ok -", label, "\n")
unz_dir <- tempfile("ckpt16-"); dir.create(unz_dir); utils::unzip(ck, exdir = unz_dir)
saved_canvas <- team_canvas_read(file.path(unz_dir, "team-canvas-v1.json"))

# Exclusions as Team supplies them: two removed samples (external settings) and the selection.
settings <- list(normalizationMethod = "none", useImputation = FALSE, imputeZerosPerFile = TRUE,
  imputeRemainingNAtoZero = TRUE, minDetectionPct = 0, dropNonDetected = TRUE, detectionScope = "global",
  dropMisc = FALSE, imputationSeed = 42, outlierTreatments = list())
run <- function(apply_edit) {
  # testServer evaluates in its own environment chain: hand the edit and the result over globally.
  assign(".group_edit", apply_edit, envir = globalenv()); assign(".group_out", NULL, envir = globalenv())
  server <- function(input, output, session) {
    controls <- shiny::reactiveVal(settings)
    hub <- shared_data_server("hub", external_settings = controls, preparation_policy = "team",
                              design_check = function() TRUE, root_session = session)
    session$userData$team_canvas_export <- function(provenance = NULL) saved_canvas
    guide_step <- shiny::reactiveVal(3L)   # Review
    team_group_editor_server(input, session, hub, guide_step)
  }
  shiny::testServer(server, {
    hub$import_session_path(ck)
    for (i in seq_len(12L)) session$flushReact()
    stopifnot(isTRUE(hub$session_restored()))
    ids <- setdiff(names(hub$rawData()$data), "Lipid_Name")
    excluded <- ids[c(5L, 40L)]
    changed <- settings; changed$outlierTreatments <- stats::setNames(list("remove", "remove"), excluded)
    controls(changed)
    session$setInputs(`hub-selectedColumns` = ids)
    session$flushReact()
    stopifnot(hub$request_team_review_preparation("entry")); session$flushReact()
    stopifnot(identical(hub$preparation_state()$status, "ready"))
    before <- list(selected = input$`hub-selectedColumns`, outliers = controls()$outlierTreatments,
                   qc = hub$restored_qc_decisions(), spec_selected = hub$preparation_state()$applied$spec$selected,
                   meta = hub$all_metadata(), ext = hub$external_sample_metadata())
    canvas_zip_before <- read_session_archive(output$`hub-export_session_btn`, include_team_canvas = TRUE, metadata_decoder = team_metadata_sidecar_decode)
    trigger_before <- hub$run_analysis_trigger()
    .group_edit(session, hub, ids, before, guide_step)
    session$flushReact(); session$flushReact()
    trigger_after_apply <- hub$run_analysis_trigger()
    # Same preparation request as Next from "Add sample labels" (and as the editor's Apply).
    stopifnot(hub$request_team_review_preparation("entry")); session$flushReact()
    stopifnot(identical(hub$preparation_state()$status, "ready"))
    canvas_zip_after <- read_session_archive(output$`hub-export_session_btn`, include_team_canvas = TRUE, metadata_decoder = team_metadata_sidecar_decode)
    .group_out <<- list(ids = ids, excluded = excluded, before = before,
      prepared_by_apply = !identical(trigger_before, trigger_after_apply),
      after = list(selected = input$`hub-selectedColumns`, outliers = controls()$outlierTreatments,
                   qc = hub$restored_qc_decisions(), spec_selected = hub$preparation_state()$applied$spec$selected),
      ext = hub$external_sample_metadata(), meta = hub$all_metadata(),
      groups = team_review_groups(hub$all_metadata(), hub$palette_settings()),
      editor = team_group_editor_payload(hub$all_metadata(), hub$external_sample_metadata()),
      processed = hub$data_processed_unfiltered(), applied_meta = hub$preparation_state()$applied$spec$metadata_id,
      canvas_before = canvas_zip_before$canvas, canvas_after = canvas_zip_after$canvas,
      shared_after = canvas_zip_after$shared$metadata$scientific_metadata)
    unlink(c(canvas_zip_before$directory, canvas_zip_after$directory), recursive = TRUE)
  })
  get(".group_out", envir = globalenv())
}

# The edits an analyst makes in the table: rename two Healthy samples' Group 1, move three
# samples' Group 2 to a new label (Group 2 is not mapped in Paula's file: it comes from names).
edit_values <- function(meta) {
  g1 <- as.character(meta$Group1); g2 <- as.character(meta$Group2)
  healthy <- which(g1 == "Healthy"); g1[healthy[1:2]] <- "Healthy recheck"
  g2[c(1L, 2L, 30L)] <- "Pilot"
  list(Group1 = g1, Group2 = g2)
}

# A. Apply through the editor's Shiny observer (what the browser sends).
A <- run(function(session, hub, ids, before, guide_step) {
  values <- edit_values(before$meta)
  # A stale table version (metadata replaced / checkpoint switched since loading) is refused.
  session$setInputs(team_groups_apply = list(token = 0, version = "stale", samples = as.list(ids),
    values = list(Group1 = as.list(values$Group1), Group2 = as.list(values$Group2))))
  session$flushReact()
  stopifnot(identical(hub$external_sample_metadata(), before$ext))
  cat("ok - a stale table version is refused and changes nothing\n")
  version <- team_group_editor_version(before$meta, before$ext)
  # Off Review (e.g. a cached request after leaving Review) nothing is applied.
  guide_step(2L)
  session$setInputs(team_groups_apply = list(token = 2, version = version, samples = as.list(ids),
    values = list(Group1 = as.list(values$Group1), Group2 = as.list(values$Group2))))
  session$flushReact()
  stopifnot(identical(hub$external_sample_metadata(), before$ext))
  cat("ok - off Review an apply is refused and changes nothing\n")
  guide_step(3L)
  for (bad in list(strrep("9", 100000), "abc", -5)) {
    session$setInputs(team_groups_apply = list(token = bad, version = version, samples = as.list(ids),
      values = list(Group1 = as.list(values$Group1), Group2 = as.list(values$Group2))))
    session$flushReact()
    stopifnot(identical(hub$external_sample_metadata(), before$ext))
  }
  cat("ok - an invalid or huge token is refused and changes nothing\n")

  session$setInputs(team_groups_apply = list(token = 1, version = version, samples = as.list(ids),
    values = list(Group1 = as.list(values$Group1), Group2 = as.list(values$Group2))))
})

# B. The same table as a CSV, built here independently of the editor's code: the checkpoint's
# confirmed metadata rows (state.json), the identifier under its column name, the edited
# Group 1 written into its mapped column (Condition) and the edited Group 2 in a new column.
# It is uploaded with the real "Add sample labels" module and confirmed.
state <- jsonlite::read_json(file.path(unz_dir, "state.json"), simplifyVector = TRUE)
rows <- as.data.frame(state$metadata$external_sample_metadata$data, check.names = FALSE, stringsAsFactors = FALSE)
stopifnot(identical(rows$FullName, A$ids), identical(state$metadata$external_sample_metadata$id_column, "SampleID"))
values <- edit_values(A$before$meta)
csv <- data.frame(SampleID = rows$FullName, rows[setdiff(names(rows), "FullName")], check.names = FALSE, stringsAsFactors = FALSE)
csv$Condition <- values$Group1
csv$Group2 <- values$Group2
csv_path <- tempfile(fileext = ".csv")
utils::write.csv(csv, csv_path, row.names = FALSE, na = "", fileEncoding = "UTF-8")
captured <- NULL
shiny::testServer(sample_metadata_import_server,
  args = list(sample_ids = shiny::reactive(A$ids), on_confirm = function(s) captured <<- s), {
    session$setInputs(file = data.frame(name = "edited.csv", size = file.info(csv_path)$size, type = "text/csv", datapath = csv_path))
    session$setInputs(id_column = "SampleID")
    session$setInputs(map_Group1 = "Condition", map_Group2 = "Group2", map_Replicate = "",
                      map_PatientNumber = "SubjectID", map_TimePoint = "ExpectedVisit")
    session$setInputs(confirm = 1)
  })
stopifnot(is.list(captured))
# guided_workflow.R wires on_confirm = shared_data$set_external_sample_metadata.
B <- run(function(session, hub, ids, before, guide_step) hub$set_external_sample_metadata(captured))

check("Apply itself requested the Review update (server-side, same operation)", isTRUE(A$prepared_by_apply))
check("the edit changed the groups (not a no-op)", !identical(A$meta$Group1, A$before$meta$Group1) && !identical(A$meta$Group2, A$before$meta$Group2))
check("edited labels landed: 2 'Healthy recheck', 3 'Pilot'", sum(A$meta$Group1 == "Healthy recheck") == 2L && sum(A$meta$Group2 == "Pilot") == 3L)
check("identical external sample metadata (scientific, display, mappings, snapshot)", identical(A$ext, B$ext))
check("identical canonical metadata / groups (all_metadata)", identical(A$meta, B$meta))
check("identical Review groups and colours", identical(A$groups, B$groups))
check("identical editor table after apply", identical(A$editor, B$editor))
check("identical prepared matrix after the Review update", identical(A$processed, B$processed))
check("identical metadata id in the applied preparation", identical(A$applied_meta, B$applied_meta))
check("identical exported scientific metadata", identical(A$shared_after, B$shared_after))
for (X in list(A = A, B = B)) {
  check("exclusions kept: selected samples unchanged", identical(X$before$selected, X$after$selected))
  check("exclusions kept: removed samples unchanged", identical(X$before$outliers, X$after$outliers))
  check("exclusions kept: QC decisions unchanged", identical(X$before$qc, X$after$qc))
  check("exclusions kept: applied selection unchanged", identical(X$before$spec_selected, X$after$spec_selected))
  check("excluded samples are still out of the prepared data", !any(X$excluded %in% names(X$processed)))
  check("checkpoint content kept: exported Canvas JSON byte-identical before/after (and to ckpt16)", !is.null(X$canvas_after) &&
        identical(team_canvas_json(X$canvas_before), team_canvas_json(X$canvas_after)) &&
        identical(team_canvas_json(X$canvas_after), team_canvas_json(saved_canvas)))
}
cat("PASS: Edit groups apply == uploading the edited table (Paula ckpt16, 67 samples); exclusions and checkpoints kept\n")

# Unit checks of the table builder.
ids <- A$ids
base <- team_group_editor_base_table(A$before$ext, ids)
check("base table: identifier column restored, matrix order", identical(base$table$SampleID, ids) && identical(base$id_column, "SampleID"))
same <- team_group_editor_edit_table(base, A$before$meta, list(Group1 = A$before$meta$Group1, Group2 = A$before$meta$Group2))
check("unchanged unmapped Group2 adds no column or mapping", identical(names(same$table), names(base$table)) && identical(same$mappings, base$mappings))
bad <- team_group_editor_edit_table(base, A$before$meta, list(Group1 = replace(A$before$meta$Group1, 1L, "")))
check("an empty mapped Group 1 value is refused by the upload checks",
      inherits(try(team_group_editor_snapshot(bad, ids), silent = TRUE), "try-error"))
none <- team_group_editor_base_table(NULL, ids)
check("without a metadata file a SampleID table is used", identical(names(none$table), "SampleID") && !length(none$mappings))
reject <- function(request) {
  base <- list(token = 1, version = "v1")
  request <- c(base[setdiff(names(base), names(request))], request)
  inherits(try(team_group_editor_request_values(request, ids), silent = TRUE), "try-error")
}
ok_values <- as.list(A$before$meta$Group1)
check("request shape accepted", !reject(list(samples = as.list(ids), values = list(Group1 = ok_values))))
check("nested values rejected", reject(list(samples = as.list(ids), values = list(Group1 = c(list(c("a", "b")), ok_values[-1])))))
check("non-text values rejected", reject(list(samples = as.list(ids), values = list(Group1 = c(list(1), ok_values[-1])))))
check("over-long labels rejected", reject(list(samples = as.list(ids), values = list(Group1 = c(list(strrep("x", 201)), ok_values[-1])))))
check("missing token rejected", inherits(try(team_group_editor_request_values(list(version = "v1", samples = as.list(ids), values = list(Group1 = ok_values)), ids), silent = TRUE), "try-error"))
for (bad_token in list(NULL, "1", c(1, 2), -1, 1.5, Inf, NA_real_, 2^60, strrep("9", 5000)))
  check(sprintf("invalid token rejected (%s)", substr(paste(deparse(bad_token), collapse = ""), 1, 24)),
        reject(list(token = bad_token, samples = as.list(ids), values = list(Group1 = ok_values))))
check("over-long version rejected", reject(list(version = strrep("v", 129), samples = as.list(ids), values = list(Group1 = ok_values))))
check("byte ceiling counts token and version", local({ old <- team_group_editor_max_bytes
  need <- sum(nchar(unlist(ok_values), type = "bytes")) + sum(nchar(ids, type = "bytes"))
  team_group_editor_max_bytes <<- need + 2L; on.exit(team_group_editor_max_bytes <<- old)
  reject(list(token = 1, version = "v1", samples = as.list(ids), values = list(Group1 = ok_values))) &&
    !reject(list(token = 1, version = "v", samples = as.list(ids), values = list(Group1 = ok_values))) }))
check("unknown request members rejected", reject(list(samples = as.list(ids), values = list(Group1 = ok_values), junk = "x")))
check("whole-request byte ceiling", local({ old <- team_group_editor_max_bytes; team_group_editor_max_bytes <<- 100L
  on.exit(team_group_editor_max_bytes <<- old); reject(list(samples = as.list(ids), values = list(Group1 = ok_values))) }))
check("unknown fields rejected", reject(list(samples = as.list(ids), values = list(Replicate = ok_values))))
check("wrong length rejected", reject(list(samples = as.list(ids), values = list(Group1 = ok_values[-1]))))
check("other samples rejected", reject(list(samples = as.list(rev(ids)), values = list(Group1 = ok_values))))
check("version changes when labels change", !identical(team_group_editor_version(A$before$meta, A$before$ext), team_group_editor_version(A$meta, A$ext)))
cat("PASS: group editor table builder and request limits\n")
