Sys.setenv(LIPIDOMIC_INTERFACE="classic")
source("R/global.R")
shiny::testServer(function(input,output,session){
  bridge<-shiny::reactiveVal(NULL)
  shared<-shared_data_server("hub",external_settings=bridge,preparation_policy="classic",root_session=session)
  qc<-qc_boxplot_server("qc",shared,shiny::reactive(shared$color_maps()))
  shiny::observe({bridge(qc())})
},{
  matrix_path<-normalizePath("tests/guided-shared/fixtures/abundance.csv");ids<-names(read.csv(matrix_path,check.names=FALSE))[-1]
  session$setInputs(`qc-normalizationMethod`="none",`qc-useImputation`=FALSE,`qc-imputeZerosPerFile`=TRUE,`qc-imputeRemainingNAtoZero`=TRUE,`qc-minDetectionPct`=0,`qc-dropNonDetected`=FALSE,`qc-detectionScope`="global",`qc-dropMisc`=FALSE,`qc-pcaMode`="omics",`qc-maxPCs`=3,`qc-mergeReplicatesMode`="single",`qc-outlierScope`="global",`qc-outlierThreshold`=2.5)
  session$setInputs(`hub-files`=data.frame(name=basename(matrix_path),size=file.info(matrix_path)$size,type="text/csv",datapath=matrix_path),`hub-selectedColumns`=ids)
  session$flushReact();session$setInputs(`hub-runAnalysis`=1L);session$flushReact()
  stopifnot(!is.null(shared$data_processed_unfiltered()),!shared$preparation_state()$dirty)
  # Browser regression: preparation/PCA must survive before style controls arrive.
  stopifnot(is.null(input[["qc-classLabelFormat"]]))
  session$setInputs(`qc-classLabelFormat`="short");session$flushReact()
  session$setInputs(`qc-normalizationMethod`="median",`qc-minDetectionPct`=50);session$flushReact()
  notice<-output[["qc-classicPreparationNotice"]]$html
  stopifnot(shared$preparation_state()$dirty,grepl("changes pending",notice,fixed=TRUE),grepl("Re-run Pipeline",notice,fixed=TRUE),!grepl("Update prepared data",notice,fixed=TRUE),grepl("Applied: none normalization",notice,fixed=TRUE))
  before<-shared$run_analysis_trigger();session$setInputs(`qc-applyClassicPreparation`=1L);session$flushReact()
  stopifnot(shared$run_analysis_trigger()==before+1L,!shared$preparation_state()$dirty,shared$preparation_state()$applied$spec$settings$normalizationMethod=="median",shared$preparation_state()$applied$spec$settings$minDetectionPct==50)
  stopifnot(grepl("up to date",output[["qc-classicPreparationNotice"]]$html,fixed=TRUE))
})
cat("PASS actual QC quick-apply input traverses shared preparation exactly once and clears pending state\n")
