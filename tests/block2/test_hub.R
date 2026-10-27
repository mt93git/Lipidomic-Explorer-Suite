# Exercise the real hub observers and CSV parser in an isolated process.
source('R/global.R')
settings <- shiny::reactiveVal(list(useImputation=FALSE,normalizationMethod='none',
  imputeZerosPerFile=FALSE,imputeRemainingNAtoZero=TRUE,minDetectionPct=0,
  dropNonDetected=FALSE,detectionScope='global',outlierTreatments=list(),outlier_trigger=0))
fixture <- data.frame(Lipid_Name=c('PC(34:1)','PE(36:2)','SM(34:1)','TG(52:2)'),
  Control_A_1=c(10,0,2,NA),Control_A_2=c(12,10,3,NA),
  Comparison_A_1=c(20,10,4,NA),Comparison_A_2=c(24,10,5,NA))
path <- tempfile(fileext='.csv');write.csv(fixture,path,row.names=FALSE)
checks <- character()
check <- function(n,ok) {stopifnot(isTRUE(ok));checks <<- c(checks,n)}
shiny::testServer(shared_data_server,args=list(external_settings=shiny::reactive(settings())), {
  session$flushReact()
  # Upload through actual observer; only temporary synthetic data are persisted.
  session$setInputs(files=data.frame(name=basename(path),size=file.info(path)$size,type='text/csv',datapath=path),
    selectedColumns=names(fixture)[-1],useAveragedSubstitution=FALSE)
  session$flushReact()
  check('CSV ingested by production hub',identical(rawData()$data,fixture))
  session$setInputs(runAnalysis=1);session$flushReact()
  check('Run button commits production preparation',preparation$state()$revision==1 && nrow(data_processed_full())==4)
  original<-data_processed_full()
  s<-settings();s$minDetectionPct<-80;settings(s);session$flushReact()
  check('Bridge threshold shows preview without committing',preparation$preview()$retained==2 && identical(data_processed_full(),original) && preparation$state()$status=='pending')
  download_path <- output$downloadImputedBefore
  check('Real before-QC CSV handler exports applied rows',file.exists(download_path) && nrow(read.csv(download_path))==4)
  after_path <- output$downloadImputedAfter
  check('Real after-QC CSV handler preserves applied matrix',isTRUE(all.equal(read.csv(after_path,check.names=FALSE),original,tolerance=1e-12)))
  both_path <- output$downloadImputedBoth
  unpack <- tempfile();dir.create(unpack);zip::unzip(both_path,exdir=unpack)
  csvs <- list.files(unpack,pattern='csv$',full.names=TRUE)
  check('Real before/after ZIP contains applied matrices',length(csvs)==2 && all(vapply(csvs,function(x)nrow(read.csv(x))==4,logical(1))))
  before_pending <- imputed_before_applied()
  check('Before-QC export uses applied settings',nrow(before_pending)==4)
  check('Pending ZIP export blocked rather than restoring different settings',inherits(tryCatch(serialize_state(),error=identity),'error'))
  check('Pending state is visible in rendered pipeline badge',grepl('Changes pending',output$pipelineStatusUI$html,fixed=TRUE))
  session$setInputs(ensure_analysis_run=1);session$flushReact()
  check('Navigation cannot apply pending scientific parameters',preparation$state()$revision==1 && identical(data_processed_full(),original))
  s$outlierTreatments<-list(Control_A_1='remove');s$outlier_trigger<-1;settings(s);session$flushReact()
  check('QC bridge retains applied threshold',preparation$state()$revision==2 && preparation$state()$applied$spec$settings$minDetectionPct==0 && !'Control_A_1'%in%names(data_processed_full()))
  session$setInputs(runAnalysis=2);session$flushReact()
  check('Re-run applies pending threshold with removed sample denominator',preparation$state()$revision==3 && nrow(data_processed_full())==3)
  check('Ready session retains existing serialization contract',all(c('inputs','metadata','outliers','uploads') %in% names(serialize_state())))
  session$setInputs(selectedColumns=character());session$flushReact()
  session$setInputs(runAnalysis=3);session$flushReact()
  check('Empty sample selection fails visibly without stale exports',preparation$state()$status=='error' && is.null(data_processed_full()))
  session$setInputs(selectedColumns=names(fixture)[-1],runAnalysis=4);session$flushReact()
  check('Retry recovers after explicit sample selection',preparation$state()$status=='ready' && nrow(data_processed_full())==3)
  session$setInputs(dropMisc=FALSE)
  unlink(unlist(rv$uploads))
})
args<-commandArgs(TRUE)
if(length(args)) write.csv(data.frame(check=checks,status='PASS'),file.path(args[1],'hub-checks.csv'),row.names=FALSE)
cat(sprintf('PASS: %d actual-hub checks\n',length(checks)))
