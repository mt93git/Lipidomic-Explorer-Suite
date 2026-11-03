source('R/global.R')
archive <- 'tests/dual-ui/fixtures/classic-seed7-synthetic.zip'
raw <- normalizePath('tests/guided-shared/fixtures/abundance.csv')
settings <- shiny::reactiveVal(list(useImputation=FALSE,normalizationMethod='none',imputeZerosPerFile=FALSE,imputeRemainingNAtoZero=TRUE,minDetectionPct=0,dropNonDetected=FALSE,detectionScope='global',outlierTreatments=list()))
for(action in c('add','remove')) {
 shiny::testServer(shared_data_server,args=list(external_settings=shiny::reactive(settings()),preparation_policy='classic'),{
  session$setInputs(import_session_file=data.frame(name='seed.zip',size=file.info(archive)$size,type='application/zip',datapath=archive))
  for(i in seq_len(10L))session$flushReact()
  stopifnot(isTRUE(session$returned$session_restored()),identical(restored_preparation_seed(),7L))
  if (action=='add') {
    session$setInputs(files=data.frame(name='new-synthetic.csv',size=file.info(raw)$size,type='text/csv',datapath=raw));session$flushReact()
  } else {
    remove_single_upload(names(rv$uploads)[1]);session$flushReact()
  }
  stopifnot(is.null(restored_preparation_seed()))
 })
}
cat('PASS: restored seed retained during import and cleared on new upload or removal\n')
