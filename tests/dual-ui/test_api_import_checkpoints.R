for (pkg in c("jsonlite", "zip", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_import_checkpoints: package", pkg, "not installed\n"); quit(status = 0)
}
local({
  root <- tempfile("import-test-"); dir.create(root); on.exit(unlink(root, recursive = TRUE))
  fixture <- file.path(root, "synthetic.zip")
  stopifnot(file.copy("tests/dual-ui/fixtures/nexo-complete-synthetic.zip", fixture))
  canvas <- list(version = "1", libraryHidden = FALSE, nodes = list(list(kind = "plot",
    id = "tcinstance_synthetic-plot_pca", label = "Synthetic PCA", visual = list(), x = 0, y = 0, width = 800, height = 600,
    instance = list(id = "tcinstance_synthetic", source = "results_dashboard-plot_pca", inputs = list()))))
  jsonlite::write_json(canvas, file.path(root, "team-canvas-v1.json"), auto_unbox = TRUE)
  zip::zip_append(fixture, "team-canvas-v1.json", root = root)
  bad <- file.path(root, "corrupt.zip"); writeLines("synthetic corrupt archive", bad)
  manifest <- file.path(root, "manifest.tsv"); report <- file.path(root, "report.tsv")
  store <- file.path(root, "store")
  run <- function(paths, labels, verify = FALSE, storage = store) {
    write.table(data.frame(path = paths, label = labels), manifest, sep = "\t", quote = FALSE, row.names = FALSE)
    output <- suppressWarnings(system2(file.path(R.home("bin"), "Rscript"), c("--vanilla",
      "frontends/nexo-api/tools/import_checkpoints.R", "--manifest", shQuote(manifest),
      "--storage", shQuote(storage), "--workspace", "synthetic-import", "--report", shQuote(report),
      if (verify) "--verify-only"), stdout = TRUE, stderr = TRUE))
    status <- attr(output, "status"); if (is.null(status)) status <- 0L
    if (!file.exists(report)) stop("FAIL importer did not write report")
    list(status = status, rows = read.delim(report, stringsAsFactors = FALSE, check.names = FALSE, na.strings = NULL, colClasses = c(error = "character")))
  }
  # Extend only a synthetic archive; never depend on operator checkpoints.
  zip::unzip(fixture, files = "state.json", exdir = root)
  state <- jsonlite::read_json(file.path(root, "state.json"), simplifyVector = FALSE)
  preserved <- list(team_workspace_nav = list(step = 5L, token = 7L),
    team_review_prepare = list(step = 2L, token = 3L),
    `qc_pca_tab-guided_qc_undo` = list(step = 1L, token = 4L),
    team_client_error = list(message = "synthetic", code = 2L),
    `structural_tab-synthetic_plot_container_size` = list(width = 800L, height = 600L),
    `structural_tab-synthetic__shinyjquiBookmarkState__resizable` = list(width = 800L, height = 600L),
    main_navbar = "structural_tab", `qc_pca_tab-table_cells_selected` = list(),
    `structural_tab-synthetic_accordion` = c("one", "two"))
  for (chain in c("DB1", "DB2", "nC1", "nC2")) {
    preserved[[paste0("data_hub-granular_", chain, "_range")]] <- c(0L, 40L)
    preserved[[paste0("logratio_tab-gran_", chain)]] <- c(0L, 40L)
  }
  for (key in c("smartLabelLoad2D", "showSingleLipidNames", "showLabels3D"))
    preserved[[paste0("tcinstance_synthetic-", key)]] <- FALSE
  for (key in c("xMin", "xMax", "yMin", "yMax")) preserved[paste0("volcano_tab-", key)] <- list(NULL)
  state$inputs[names(preserved)] <- preserved
  state$outliers$qc_decisions <- data.frame(time = "synthetic-time", sample = "synthetic-sample",
    action = "remove", reason = "synthetic reason", pca_settings = "synthetic settings")
  jsonlite::write_json(state, file.path(root, "state.json"), auto_unbox = TRUE, digits = 17, null = "null")
  zip::zip_append(fixture, "state.json", root = root)
  first <- run(fixture, "synthetic")
  if (first$status != 0L || first$rows$equal != "yes")
    stop("FAIL synthetic checkpoint preserves ranges, structured inputs, QC decisions, card options and UI state: ",
      first$rows$differences, " ", first$rows$error)
  stopifnot(first$status == 0L, first$rows$imported == "yes", first$rows$equal == "yes",
    first$rows$cards == 1L, first$rows$cards_rendered == 1L,
    identical(names(first$rows), c("label", "sha256", "size_bytes", "imported", "cards", "cards_rendered", "equal", "differences", "metadata_id_policy", "error")))
  cat("PASS synthetic checkpoint preserves ranges, structured inputs, QC decisions, card options and UI state\n")
  cat("PASS good ZIP imports, opens, renders every card and preserves science; exact report columns\n")
  again <- run(fixture, "synthetic")
  stopifnot(again$status == 0L, again$rows$imported == "already",
    length(list.files(store, pattern = "[.]json$", recursive = TRUE)) == 1L)
  cat("PASS repeated ZIP is already imported with one record\n")
  # Obtain the exact Team boundary error without relying on zip library wording.
  team_error <- tryCatch({ zip::zip_list(bad); "" }, error = conditionMessage)
  mixed <- run(c(bad, fixture), c("corrupt", "synthetic"))
  stopifnot(mixed$status != 0L, mixed$rows$error[1] == team_error,
    mixed$rows$imported[1] == "no", mixed$rows$equal[2] == "yes", mixed$rows$imported[2] == "already")
  cat("PASS corrupt ZIP reports Team error and later rows still pass\n")
  Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
    LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0",
    LIPIDOMIC_STORAGE_DIR = file.path(root, "live-store"), LIPIDOMIC_API_WORKSPACE = "synthetic-import")
  suppressPackageStartupMessages(source("R/global.R"))
  source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_import_checkpoints")
  source("frontends/nexo-api/engine.R")
  original <- read_session_archive(fixture)
  on.exit(unlink(original$directory, recursive = TRUE), add = TRUE)
  stopifnot("volcano_tab-xMin" %in% names(original$state$inputs),
    is.null(original$state$inputs[["volcano_tab-xMin"]]))
  s <- api_session_open(fixture); on.exit(api_session_close(s), add = TRUE)
  stopifnot(identical(api_read(s, s$mock$input$team_workspace_nav), list(step = 5L, token = 7L)))
  api_inputs(s, `data_hub-activateGranularFiltering` = TRUE, `data_hub-useCombo1` = TRUE,
    `data_hub-useCombo2` = FALSE, `data_hub-granularOrderMode` = "ignore",
    `data_hub-granular_nC1_range` = c(0L, 40L), `data_hub-granular_DB1_range` = c(0L, 40L))
  api_flush(s)
  numeric_rows <- api_read(s, s$shared$global_filtered_lipids_all())
  s$bus$echo("data_hub-granular_nC1_range", list(value = c("0", "40")))
  s$bus$echo("data_hub-granular_DB1_range", list(value = c("0", "40")))
  api_flush(s)
  stopifnot(length(numeric_rows) > 0L,
    identical(api_read(s, s$shared$global_filtered_lipids_all()), numeric_rows),
    identical(api_read(s, s$mock$input[["data_hub-granular_nC1_range"]]), c(0L, 40L)))
  cat("PASS live granular filter after range echo returns numeric-bound rows\n")
  # Deliberate edit: compare without invoking all.equal's fragile list formatter.
  source("frontends/nexo-api/tools/checkpoint_comparison.R")
  before <- list(state = list(inputs = list(team_workspace_nav = list(step = 5L, token = 7L))))
  after <- before; after$state$inputs$team_workspace_nav$step <- 6L
  comparison <- api_checkpoint_comparison(before, after)
  report_row <- data.frame(equal = comparison$equal, differences = comparison$differences)
  write.table(report_row, file.path(root, "altered.tsv"), sep = "\t", row.names = FALSE)
  report_row <- read.delim(file.path(root, "altered.tsv"))
  stopifnot(report_row$equal == "no", report_row$differences == "state.inputs.team_workspace_nav",
    identical(api_checkpoint_differences(list(x = NA), list(x = TRUE)), "x"),
    identical(api_checkpoint_differences(list(state = list(inputs = list(absent = NULL))),
      list(state = list(inputs = list()))), "state.inputs.absent"),
    identical(api_checkpoint_differences(list(state = list(outliers = list(private = "before"))),
      list(state = list(outliers = list(private = "after")))), "state.outliers"))
  cat("PASS altered value reports its path without comparison formatter crash\n")
  api_inputs(s, main_navbar = "qc_pca_tab", `tcinstance_synthetic-showLabels3D` = TRUE)
  edited <- api_checkpoint_save(s, "edited", list(token = "synthetic-edit", state = s$canvas))
  edited_archive <- read_session_archive(api_store()$load(api_workspace(), edited$id))
  on.exit(unlink(edited_archive$directory, recursive = TRUE), add = TRUE)
  stopifnot("volcano_tab-xMin" %in% names(edited_archive$state$inputs),
    is.null(edited_archive$state$inputs[["volcano_tab-xMin"]]),
    identical(edited_archive$state$inputs$main_navbar, "qc_pca_tab"),
    isTRUE(edited_archive$state$inputs[["tcinstance_synthetic-showLabels3D"]]))
  cat("PASS explicit tab and card option edits survive save\n")
  dry_store <- file.path(root, "dry-store")
  dry <- run(fixture, "synthetic", TRUE, dry_store)
  stopifnot(dry$status == 0L, dry$rows$imported == "no", dry$rows$equal == "yes",
    dry$rows$cards_rendered == 1L, !dir.exists(dry_store))
  cat("PASS verify-only verifies without writing destination storage\n")
})
