source('R/global.R')
source('R/sample_metadata_import.R')
source('R/frontends/team/server.R')
checks <- character()
check <- function(label, condition) { if (!isTRUE(condition)) stop(paste('FAIL:',label)); checks <<- c(checks,label) }
fixture <- data.frame(Lipid_Name=paste0('PC(',seq(100,199),':1)'),
  S1=seq(101,200),S2=seq(201,300),S3=seq(301,400),S4=seq(401,500),check.names=FALSE)
fixture$S1[c(2,8,19,33,55,89)] <- NA
fixture$S2[c(3,11,28,42,72,91)] <- NA
path <- tempfile(fileext='.csv'); write.csv(fixture,path,row.names=FALSE)
ids <- names(fixture)[-1]
md <- data.frame(SampleID=ids,Condition=c('A','A','B','B'),Tissue='bone',stringsAsFactors=FALSE)
base <- list(useImputation=FALSE,normalizationMethod='none',imputeZerosPerFile=FALSE,
 imputeRemainingNAtoZero=TRUE,minDetectionPct=0,dropNonDetected=FALSE,detectionScope='global',
 outlierTreatments=list(),outlier_trigger=0,imputationSeed=42L)
results <- list()
for (policy in c('classic','team')) {
 settings <- shiny::reactiveVal(base)
 approval <- shiny::reactiveVal('independent')
 shiny::testServer(shared_data_server,args=list(external_settings=shiny::reactive(settings()),
    preparation_policy=policy,design_check=function() TRUE,inference_check=function(paired) identical(approval(),'independent') && !paired), {
   session$setInputs(files=data.frame(name='synthetic.csv',size=file.info(path)$size,type='text/csv',datapath=path),
      selectedColumns=ids,useAveragedSubstitution=FALSE)
   session$flushReact(); api <- session$returned
   api$set_external_sample_metadata(stage_metadata_v01(md,ids,c(Group1='Condition',Group2='Tissue')),TRUE)
   session$flushReact(); session$setInputs(runAnalysis=1);session$flushReact()
   check(paste(policy,'actual hub explicit preparation succeeds'),preparation$state()$status=='ready')
   results[[policy]] <<- data_processed_full()
   if(policy=='classic') {
     s<-settings();s$imputeRemainingNAtoZero<-FALSE;settings(s);session$setInputs(runAnalysis=2);session$flushReact()
     check('Classic reports missing-value policy mismatch without changing input',preparation$state()$status=='error' && grepl('Review missing-value handling',preparation$state()$error,fixed=TRUE) && isTRUE(all.equal(rawData()$data,fixture,check.attributes=FALSE)))
     s$imputeRemainingNAtoZero<-TRUE;settings(s);session$setInputs(runAnalysis=3);session$flushReact()
     check('Classic retry succeeds after explicit missing-value cleanup',preparation$state()$status=='ready' && !anyNA(data_processed_full()))
   }
   if(policy=='team') {
     session$setInputs(deReferenceGroups='A',deComparisonGroups='B',deOrientGroup1=TRUE,deOrientGroup2=FALSE,deMethod='limma',pValueType='raw',pFilterThreshold=1,log2fcThreshold=0);session$flushReact()
     check('team independent inference permitted',api$inference_allowed(FALSE))
     check('Team DE engine produces results for independent design',!is.null(api$de_results()) && !is.null(api$significant_lipids()))
     for (design in c('paired','uncertain','invalid')) {
       approval(design);session$flushReact()
       check(paste('Team DE caches suppressed for',design),is.null(api$de_results()) && is.null(api$significant_lipids()))
     }
     approval('independent');session$flushReact()
     check('Team DE returns after independent confirmation',!is.null(api$de_results()))
     check('team paired inference denied by callback',!api$inference_allowed(TRUE))
     old <- data_processed_full(); s<-settings();s$minDetectionPct<-95;s$outlierTreatments<-list(S1='remove');s$outlier_trigger<-1L;settings(s);session$flushReact()
     check('QC and threshold remain pending until explicit Team run',preparation$state()$revision==1L && preparation$state()$dirty && identical(data_processed_full(),old))
     check('Team inference waits for re-preparation after settings change',!api$inference_allowed(FALSE) && is.null(api$de_results()))
     session$setInputs(runAnalysis=2);session$flushReact()
     check('explicit remove takes precedence and threshold applies',preparation$state()$revision==2L && !'S1'%in%names(data_processed_full()) && preparation$state()$applied$spec$settings$minDetectionPct==95)
     s$minDetectionPct<-0;s$outlierTreatments<-list(S1='average',S3='remove');settings(s);session$setInputs(useAveragedSubstitution=TRUE,runAnalysis=3);session$flushReact()
     check('explicit removal beats averaging, average labeled synthetic',!('S3'%in%names(data_processed_full())) && 'S1'%in%api$synthetic_sample_ids())
     check('synthetic samples block inference',!api$inference_allowed(FALSE) && !api$inference_allowed(TRUE) && is.null(api$de_results()) && is.null(api$significant_lipids()))
     s$outlierTreatments<-list();s$useImputation<-FALSE;s$imputeRemainingNAtoZero<-FALSE;settings(s);session$setInputs(useAveragedSubstitution=FALSE,runAnalysis=4);session$flushReact()
     check('Team no imputation preserves missing values',preparation$state()$status=='ready' && anyNA(data_processed_full()))
     blocked_legacy <- tryCatch(api$data_processed(),error=function(e)e)
     check('legacy modules cannot consume incomplete Team matrix',
       inherits(blocked_legacy,'error') && anyNA(api$data_processed_allow_missing()))
     incomplete_de <- tryCatch(allLipidDEOutput(),error=function(e)e)
     check('Team DE requires complete measurements and leaves prepared data intact',
       api$inference_allowed(FALSE) && inherits(incomplete_de,'error') &&
       grepl('complete finite measurements',conditionMessage(incomplete_de),fixed=TRUE) &&
       anyNA(data_processed_full()))
     view_data <- team_missingness_data_adapter(api)
     check('Team presentation adapter retains incomplete prepared values',
       identical(view_data$data_processed(),api$data_processed_allow_missing()) &&
       anyNA(view_data$data_processed()))
     prepared_csv <- utils::read.csv(output$downloadPostNADataDirect,check.names=FALSE)
     check('prepared matrix download retains missing cells',anyNA(prepared_csv))
     incomplete_pca <- tryCatch(pca_results(),error=function(e)e)
     check('legacy PCA rejects incomplete Team matrix without changing prepared data',
       inherits(incomplete_pca,'error') && anyNA(data_processed_full()))
     seed_id <- preparation$state()$applied$request_id
     s$imputationSeed<-43L;settings(s);session$flushReact()
     check('seed is part of immutable request identity',!identical(seed_id,preparation$state()$pending_id))
     s$imputeRemainingNAtoZero<-TRUE;s$useImputation<-TRUE;s$imputationSeed<-42L;settings(s);session$setInputs(runAnalysis=5);session$flushReact()
     check('real QRILC run succeeds',preparation$state()$status=='ready')
     qr1<-data_processed_full();session$setInputs(runAnalysis=6);session$flushReact()
     check('same seed produces identical QRILC output',identical(qr1,data_processed_full()))
     s$imputationSeed<-43L;settings(s);session$setInputs(runAnalysis=7);session$flushReact()
     check('different seed changes real QRILC output',!identical(qr1,data_processed_full()))
   }
   unlink(unlist(rv$uploads))
 })
}
check('same explicit settings produce identical Classic and Team matrices',identical(results$classic,results$team))
# An injected failing engine exercises the production exception path without altering installed packages.
for (policy in c('classic','team')) {
  fail_settings <- shiny::reactiveVal(modifyList(base,list(useImputation=TRUE)))
  shiny::testServer(shared_data_server,args=list(external_settings=shiny::reactive(fail_settings()),
      preparation_policy=policy,design_check=function() TRUE,
      qrilc_imputer=function(mat) stop('injected QRILC failure')), {
    session$setInputs(files=data.frame(name='synthetic-failure.csv',size=file.info(path)$size,type='text/csv',datapath=path),selectedColumns=ids,useAveragedSubstitution=FALSE)
    session$flushReact();session$returned$set_external_sample_metadata(stage_metadata_v01(md,ids,c(Group1='Condition',Group2='Tissue')),TRUE)
    session$flushReact();session$setInputs(runAnalysis=1);session$flushReact()
    if (policy=='team') check('Team fails closed on QRILC error',preparation$state()$status=='error' && is.null(data_processed_full()))
    else check('Classic retains documented QRILC fallback',preparation$state()$status=='ready' && !anyNA(data_processed_full()) && isTRUE(audit_trace_data()$qrilc_failed))
    unlink(unlist(rv$uploads))
  })
}
# Output overflow is invalid even if a Team request permits missing values.
inf_server <- function(input,output,session) {
  request <- reactiveVal(preparation_request(list(data=fixture,file_cols=list(ids)),ids,NULL,
    list(useImputation=FALSE,imputeRemainingNAtoZero=FALSE),policy='team'))
  trigger <- reactiveVal(0L)
  ctl <- shared_preparation_controller(request,function(r) { d<-r$data_info$data;d$S1[1]<-Inf;d },trigger,reactive(0L),function()TRUE,'team')
}
shiny::testServer(inf_server, {session$flushReact();trigger(1L);session$flushReact();check('nonfinite output rejected',ctl$state()$status=='error' && is.null(ctl$data()))})
cat(sprintf('PASS: %d real hub parity and policy checks\n',length(checks)))
