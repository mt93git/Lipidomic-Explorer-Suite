source('R/global.R')
args <- commandArgs(trailingOnly=TRUE)
if (!length(args)) args <- 'tests/dual-ui/fixtures/classic-seed7-synthetic.zip'
stopifnot(length(args)==1L, file.exists(args[1]))
archive <- read_session_archive(args[1]); on.exit(unlink(archive$directory,recursive=TRUE),add=TRUE)
stopifnot(is.null(archive$state$inputs[['qc_pca_tab-imputationSeed']]),
          identical(as.integer(archive$state$preparation_contract$imputation_seed),7L))
# Capture the real numeric input update invoked by the production import path.
restore_numeric_messages <- list()
trace('updateNumericInput',where=.GlobalEnv,
      tracer=quote({restore_numeric_messages[[length(restore_numeric_messages)+1L]] <<- list(id=inputId,value=value)}),print=FALSE)
on.exit(untrace('updateNumericInput',where=.GlobalEnv),add=TRUE)
settings <- shiny::reactiveVal(list(imputationSeed=42L,useImputation=FALSE,normalizationMethod='none'))
shiny::testServer(shared_data_server,args=list(external_settings=shiny::reactive(settings()),
 preparation_policy='team',design_check=function() FALSE),{
 session$setInputs(import_session_file=data.frame(name='session.zip',size=file.info(args[1])$size,type='application/zip',datapath=args[1]))
 for(i in seq_len(10L)) session$flushReact()
 stopifnot(isTRUE(session$returned$session_restored()),is.null(session$returned$data_processed_unfiltered()))
})
matched <- Filter(function(x) identical(x$id,'qc_pca_tab-imputationSeed'),restore_numeric_messages)
stopifnot(length(matched)>0L, identical(as.integer(matched[[length(matched)]]$value),7L))
stopifnot(identical(team_restore_seed_input(list('qc_pca_tab-imputationSeed'=11),7,'team')[[1]],11),
          is.null(team_restore_seed_input(list(),7,'classic')[['qc_pca_tab-imputationSeed']]))
cat('PASS: real restore sends saved seed to Team control; explicit control wins\n')
