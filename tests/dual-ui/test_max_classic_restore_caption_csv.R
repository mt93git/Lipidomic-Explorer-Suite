source('R/utils_csv_export.R')
source('R/frontends/interface.R')
source('R/modules/utils_stats.R')

numbers <- c('-1', '+0.85', '-.5', '+1.', ' -1.2e+3 ', '+2E-4')
attacks <- c('-1+cmd', '+1-2', '-.5*2', '+1e3+cmd', '=1', '@SUM(A1)', ' -cmd', '+.cmd')
stopifnot(identical(spreadsheet_csv_escape(numbers), numbers),
          identical(spreadsheet_csv_escape(attacks), paste0("'", attacks)))
f <- tempfile(fileext = '.csv')
write_spreadsheet_csv(data.frame(value = c(numbers, attacks)), f)
stopifnot(identical(read.csv(f, colClasses = 'character')$value, c(numbers, paste0("'", attacks))))
unlink(f)

old <- Sys.getenv('LIPIDOMIC_INTERFACE', unset = NA_character_)
on.exit(if (is.na(old)) Sys.unsetenv('LIPIDOMIC_INTERFACE') else Sys.setenv(LIPIDOMIC_INTERFACE = old), add = TRUE)
Sys.setenv(LIPIDOMIC_INTERFACE = 'classic')
classic <- vapply(c('fla','fla_volcano','cellular_org_stress','cellular_org_cpi','cellular_org_polar'), get_journal_caption, character(1))
Sys.setenv(LIPIDOMIC_INTERFACE = 'team')
team <- vapply(c('fla','fla_volcano','cellular_org_stress','cellular_org_cpi','cellular_org_polar'), get_journal_caption, character(1))
stopifnot(all(classic != team), all(grepl('do not|does not', team, ignore.case = TRUE)), grepl('log', get_journal_caption('pca'), ignore.case = TRUE))

cat('PASS: Classic and Team captions and signed CSV values\n')
source('R/global.R')
# Reuse the synthetic, production-exported archive constructor without running
# its older review-gate assertions, which predate Classic automatic restoration.
cross_zip <- readLines('tests/dual-ui/test_cross_zip.R', warn = FALSE)
edge_line <- grep('^# Each edge', cross_zip)[1L]
eval(parse(text = paste(cross_zip[seq_len(edge_line - 1L)], collapse = '\n')), envir = environment())
for (source_policy in c('classic', 'team')) {
  exported <- make_archive(source_policy)
  extracted <- tempfile('missing-fixture-'); dir.create(extracted)
  utils::unzip(exported$path, exdir = extracted)
  missing_zip <- tempfile(fileext = '.zip')
  zip::zipr(missing_zip, c('state.json', 'shared-state-v1.json'), root = extracted)
  unlink(extracted, recursive = TRUE)
  legacy_dir <- tempfile('legacy-fixture-'); dir.create(legacy_dir)
  utils::unzip(exported$path, exdir=legacy_dir)
  state_path <- file.path(legacy_dir, 'state.json')
  legacy_state <- jsonlite::read_json(state_path, simplifyVector=FALSE)
  archive <- read_session_archive(exported$path)
  original_settings <- archive$shared$applied$spec$settings
  unlink(archive$directory, recursive=TRUE)
  for (key in c('minDetectionPct','dropNonDetected','detectionScope','normalizationMethod',
                'useImputation','imputeZerosPerFile','imputeRemainingNAtoZero','imputationSeed'))
    legacy_state$inputs[[paste0('qc_pca_tab-', key)]] <- original_settings[[key]]
  legacy_state$inputs[['selectedColumns']] <- if (source_policy == 'classic') character(0) else ids
  jsonlite::write_json(legacy_state, state_path, auto_unbox=TRUE, pretty=TRUE, null='null')
  legacy_zip <- tempfile(fileext='.zip')
  legacy_missing_zip <- tempfile(fileext='.zip')
  zip::zipr(legacy_zip, c('state.json','data_files'), root=legacy_dir)
  zip::zipr(legacy_missing_zip, 'state.json', root=legacy_dir)
  unlink(legacy_dir, recursive=TRUE)
  for (policy in c('classic', 'team')) for (missing in c(FALSE, TRUE)) for (legacy in c(FALSE, TRUE)) {
    restore_path <- if (legacy) { if (missing) legacy_missing_zip else legacy_zip } else if (missing) missing_zip else exported$path
    cfg <- settings_for(policy)
    # testServer does not simulate browser control hydration. Supply the exact
    # serialized settings through the same reactive bridge used by the UI.
    archive <- read_session_archive(restore_path)
    saved <- archive$shared$applied$spec$settings
    unlink(archive$directory, recursive = TRUE)
    if (is.null(saved)) saved <- original_settings
    stale <- saved
    stale$normalizationMethod <- "median"
    stale$minDetectionPct <- 50
    settings <- shiny::reactiveVal(if (policy == "classic") stale else saved)
    approved <- shiny::reactiveVal(FALSE)
    shiny::testServer(shared_data_server, args = list(
      external_settings = shiny::reactive(settings()), preparation_policy = policy,
      design_check = if (policy == 'team') function() isTRUE(approved()) else NULL), {
      if (policy == "classic") session$setInputs(selectedColumns = ids[1:2])
      session$setInputs(import_session_file = data.frame(name='session.zip',
        size=file.info(restore_path)$size, type='application/zip', datapath=restore_path))
      if (missing) {
        session$flushReact()
        stopifnot(length(missing_files_to_restore()) == 1L, !isTRUE(session$returned$session_restored()))
        session$setInputs(missing_file_uploader = data.frame(name=basename(matrix_path),
          size=file.info(matrix_path)$size, type='text/csv', datapath=matrix_path))
      }
      for (i in seq_len(10L)) session$flushReact()
      api <- session$returned
      stopifnot(isTRUE(api$session_restored()), !isTRUE(api$is_restoring()))
      if (policy == 'classic') {
        stopifnot(isTRUE(analysis_is_fresh()), run_analysis_trigger_val() > 0,
                  !awaiting_restore_review(), !is.null(api$data_processed_unfiltered()),
                  identical(api$preparation_state()$applied$spec$settings$normalizationMethod, saved$normalizationMethod),
                  isTRUE(all.equal(api$data_processed_unfiltered(), exported$matrix, tolerance=1e-12)))
        settings(saved); session$setInputs(selectedColumns=ids); session$flushReact()
        stopifnot(isTRUE(all.equal(api$data_processed_unfiltered(), exported$matrix, tolerance=1e-12)))
        changed <- saved; changed$normalizationMethod <- 'median'
        settings(changed); session$setInputs(selectedColumns=ids[1:4], runAnalysis=1L); session$flushReact()
        stopifnot(identical(api$preparation_state()$applied$spec$settings$normalizationMethod, 'median'),
                  identical(api$preparation_state()$applied$spec$selected, ids[1:4]),
                  !is.null(api$data_processed_unfiltered()))
      } else {
        stopifnot(!analysis_is_fresh(), awaiting_restore_review(), is.null(api$data_processed_unfiltered()))
        session$setInputs(runAnalysis=1L); session$flushReact()
        stopifnot(is.null(api$data_processed_unfiltered()))
        approved(TRUE)
        session$setInputs(selectedColumns=ids, runAnalysis=2L); session$flushReact()
        stopifnot(!is.null(api$data_processed_unfiltered()),
                  isTRUE(all.equal(api$data_processed_unfiltered(), exported$matrix, tolerance=1e-12)))
      }
    })
    cat(sprintf('PASS: %s -> %s ZIP (%s) restores expected prepared matrix\n', source_policy, policy, paste(if (missing) 'replacement upload' else 'embedded data', if (legacy) 'legacy' else 'sidecar')))
  }
  unlink(c(exported$path, missing_zip, legacy_zip, legacy_missing_zip))
}

# Every selected sample excluded by QC must stay excluded, never expand to all.
df <- data.frame(Lipid_Name=c('a','b'), S1=c(1,2), S2=c(2,3))
req <- preparation_request(list(data=df, file_cols=list()), c('S1','S2'), settings=list(outlierTreatments=list(S1='remove', S2='remove')))
stopifnot(inherits(try(preparation_request_preview(req), silent=TRUE), 'try-error'))
cat('PASS: post-QC empty selection does not resurrect samples\n')

# A replacement upload and deletion must discard any interrupted restore spec.
shiny::testServer(shared_data_server, args=list(external_settings=shiny::reactive(list()), preparation_policy='classic'), {
  restore_initial_spec(list(selected='stale', settings=list()))
  session$setInputs(files=data.frame(name='synthetic.csv', size=file.info(matrix_path)$size,
    type='text/csv', datapath=matrix_path))
  session$flushReact()
  stopifnot(is.null(restore_initial_spec()))
  restore_initial_spec(list(selected='stale', settings=list()))
  remove_single_upload('synthetic.csv'); session$flushReact()
  stopifnot(is.null(restore_initial_spec()))
})
# Execute the actual QC observer from the module in a minimal reactive server.
qc_lines <- readLines('R/modules/2_qc_boxplot_module.R', warn=FALSE)
start <- grep('^    # Observe and apply restored outlier treatments$', qc_lines)
end <- grep('^    # Team starts a new QC review', qc_lines)
stopifnot(length(start)==1L, length(end)==1L, end > start)
qc_observer <- parse(text=paste(qc_lines[(start+1L):(end-1L)], collapse='\n'))
shiny::testServer(function(input, output, session) {
  shared_data <- list(restored_outlier_treatments=shiny::reactiveVal(NULL))
  outlierTreatments <- shiny::reactiveVal(list(S01='remove'))
  tempOutlierTreatments <- shiny::reactiveVal(list(S01='remove'))
  eval(qc_observer)
}, {
  session$flushReact(); shared_data$restored_outlier_treatments(list()); session$flushReact()
  stopifnot(identical(outlierTreatments(), list()), identical(tempOutlierTreatments(), list()))
})
cat('PASS: interrupted restore spec clears on dataset change; empty QC restore clears old treatments\n')
