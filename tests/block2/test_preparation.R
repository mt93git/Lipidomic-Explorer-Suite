# Focused production-function and real Shiny scheduler checks; synthetic data only.
source('tests/integration/helpers.R')
source('R/utils_preparation.R')
checks <- character()
check <- function(name, condition) {stopifnot(isTRUE(condition));checks <<- c(checks,name)}
fails <- function(expr) inherits(tryCatch({force(expr);NULL},error=identity),'error')
df <- data.frame(Lipid_Name=paste0('SYN_L',1:5), A=c(10,10,0,NA,Inf),
                 B=c(10,0,0,NA,2), C=c(10,10,10,NA,2), D=c(10,0,0,NA,2))
ids <- names(df)[-1]
md <- data.frame(FullName=ids,Group1=c('Control','Control','Comparison','Comparison'),Group2='Synthetic')
info <- list(data=df,file_cols=list(ids))
p <- preparation_detection_preview(df,ids)
check('Classic defaults keep every row including all-absent', all(p$keep) && p$retained==5)
check('Zero / NA / infinity are not detections', identical(preparation_detection_preview(df,ids,75)$keep,c(TRUE,FALSE,FALSE,FALSE,TRUE)))
check('Threshold boundary is inclusive',identical(preparation_detection_preview(df,ids,50)$keep,c(TRUE,TRUE,FALSE,FALSE,TRUE)))
check('Drop absent independently of percentage',identical(preparation_detection_preview(df,ids,0,TRUE)$keep,c(TRUE,TRUE,TRUE,FALSE,TRUE)))
check('Group threshold uses any complete Group1/Group2 group',identical(preparation_detection_preview(df,ids,100,FALSE,'group',md)$keep,c(TRUE,FALSE,FALSE,FALSE,TRUE)))
check('Metadata row order does not change grouping',identical(preparation_detection_preview(df,ids,100,FALSE,'group',md),preparation_detection_preview(df,ids,100,FALSE,'group',md[4:1,])))
check('One feature / one sample per group has correct dimensions',isTRUE(unname(preparation_detection_preview(df[1,,drop=FALSE],c('A','C'),100,FALSE,'group',md)$keep)))
check('Group labels containing delimiters remain distinct', {
  weird <- md; weird$Group1 <- c('a_b','a','a_b','a');weird$Group2 <- c('c','b_c','c','b_c')
  preparation_detection_preview(df,ids,100,FALSE,'group',weird)$keep[2]
})
check('Missing group metadata rejected only when group filter active', fails(preparation_detection_preview(df,ids,10,FALSE,'group',NULL)) && all(preparation_detection_preview(df,ids,0,FALSE,'group',NULL)$keep))
check('Duplicate metadata IDs rejected',fails(preparation_detection_preview(df,ids,10,FALSE,'group',rbind(md,md[1,]))))
check('Malformed thresholds / flags rejected',all(vapply(list(-1,101,NA,Inf,'80',c(0,80)),function(x) fails(preparation_settings(list(minDetectionPct=x))),logical(1))) && fails(preparation_settings(list(dropNonDetected=1))))
check('Duplicate lipids rejected',fails(preparation_detection_preview(rbind(df,df[1,]),ids)))
check('Unknown selections / treatments rejected',fails(preparation_sample_ids(df,'UNKNOWN')) && fails(preparation_sample_ids(df,ids,list(UNKNOWN='remove'))))
check('Explicit empty selection never falls back to all', length(preparation_sample_ids(df,character()))==0 && length(preparation_sample_ids(df,NULL))==4)
check('Remove and average do not count as measured detections',identical(preparation_sample_ids(df,ids,list(A='remove',B='average')),c('C','D')))
check('Too restrictive filter rejects rather than returns empty data',fails(preparation_filter_detected(df,ids,100)))
check('Classic no-op is byte-identical',identical(preparation_filter_detected(df,ids)$data,df))

# Same actual production matrix function used by the app, with only external I/O mocked.
e <- preparation_env(); e$settings$imputeRemainingNAtoZero <- TRUE
f <- synthetic_fixture(); base <- e$compute_imputed_matrix(TRUE)
r <- preparation_request(e$rawData(),e$input$selectedColumns,f$metadata,e$settings,FALSE)
check('Immutable request gives same result as Classic call',identical(base,e$compute_imputed_matrix(TRUE,r)))
e$settings$normalizationMethod <- 'pqn'; e$input$selectedColumns <- character()
check('Later live controls cannot change a captured request',identical(base,e$compute_imputed_matrix(TRUE,r)))
check('No selected samples yields no computed matrix',is.null(e$compute_imputed_matrix(TRUE)))
# At 100%, reference is independent manual removal of incomplete rows before production math.
rf <- r; rf$spec$settings$minDetectionPct <- 100
actual <- e$compute_imputed_matrix(TRUE,rf)
manual <- r; manual$data_info$data <- f$data[rowSums(is.na(f$data[,-1]))==0,,drop=FALSE]
rownames(manual$data_info$data)<-NULL
check('Filtering precedes imputation and matches manual matrix subset',identical(actual,e$compute_imputed_matrix(TRUE,manual)))

server <- function(input,output,session) {
  current <- reactiveVal(r); run <- reactiveVal(0L); qc <- reactiveVal(0L)
  auth <- reactiveVal(TRUE); broken <- reactiveVal(FALSE); calls <- reactiveVal(0L)
  ctl <- shared_preparation_controller(current,function(req) {
    calls(isolate(calls())+1L)
    if (broken()) stop('Synthetic computation failure')
    e$compute_imputed_matrix(TRUE,req)
  },run,qc,auth)
}
shiny::testServer(server, {
  session$flushReact()
  check('New session has no applied result',ctl$state()$status=='unprepared' && is.null(ctl$data()))
  check('Unconfirmed apply rejected',fails(ctl$apply(FALSE,current()$id)))
  check('Stale preview confirmation rejected',fails(ctl$apply(TRUE,'stale-id')))
  run(1L);session$flushReact()
  check('Explicit run commits one revision',ctl$state()$status=='ready' && calls()==1 && ctl$state()$revision==1)
  original <- ctl$data()
  pending <- current(); pending$spec$settings$minDetectionPct <- 100
  pending <- preparation_request(pending$data_info,pending$spec$selected,pending$metadata,pending$spec$settings)
  current(pending);session$flushReact()
  check('Threshold edits are pending and preserve applied output',ctl$state()$status=='pending' && calls()==1 && identical(ctl$data(),original))
  s<-pending$spec$settings;s$outlierTreatments<-list(S01='remove')
  current(preparation_request(pending$data_info,pending$spec$selected,pending$metadata,s));qc(1L);session$flushReact()
  check('QC applies treatment without adopting pending threshold',ctl$state()$applied$spec$settings$minDetectionPct==0 && !'S01'%in%names(ctl$data()) && ctl$state()$status=='pending')
  run(2L);session$flushReact()
  check('Explicit rerun applies pending filter',ctl$state()$status=='ready' && ctl$state()$applied$spec$settings$minDetectionPct==100)
  broken(TRUE);run(3L);session$flushReact()
  check('Failure hides stale output and retains last successful provenance',ctl$state()$status=='error' && is.null(ctl$data()) && ctl$state()$revision==3 && length(ctl$state()$history)==3)
  broken(FALSE);run(4L);session$flushReact()
  check('Explicit retry recovers',ctl$state()$status=='ready' && ctl$state()$revision==4)
  changed<-current();changed$metadata$Group1[1]<-'Different'
  current(preparation_request(changed$data_info,changed$spec$selected,changed$metadata,changed$spec$settings));session$flushReact()
  check('Metadata edit hides old output',is.null(ctl$data()) && ctl$state()$dirty)
  qc(2L);session$flushReact()
  check('QC cannot apply across changed metadata',ctl$state()$status=='error' && ctl$state()$revision==4)
  run(5L);session$flushReact()
  check('Explicit run accepts reviewed metadata',ctl$state()$status=='ready')
  changed<-current(); changed$data_info$data$S02[1]<-999
  current(preparation_request(changed$data_info,changed$spec$selected,changed$metadata,changed$spec$settings));session$flushReact()
  check('New values with identical matrix dimensions invalidate output',is.null(ctl$data()) && ctl$state()$status=='unprepared')
  auth(FALSE);run(6L);session$flushReact()
  check('Unauthorized run cannot commit',ctl$state()$revision==5 && fails(ctl$apply(TRUE,current()$id)))
})
shiny::testServer(server, {session$flushReact();check('Second session cannot inherit first session state',is.null(ctl$data()) && ctl$state()$revision==0 && length(ctl$state()$history)==0)})
# QC reports and pre-normalization plots must not describe pending controls.
qc_env <- new.env(parent=globalenv())
qc_state <- list(data_available=TRUE,applied=list(spec=r$spec))
qc_env$shared_data <- list(preparation_state=function() qc_state,rawData=function() r$data_info,
  selected_cols=function() 'S01',global_filtered_lipids=function() NULL,
  all_numeric_columns=function() r$spec$selected)
qc_env$input <- list(normalizationMethod='pqn',useImputation=TRUE,imputeZerosPerFile=TRUE,dropMisc=FALSE)
qc_env$`%||%` <- function(x,y) if(is.null(x)) y else x
load_assignments('R/modules/utils_stats.R','get_stats_console_method_summary',qc_env)
load_assignments('R/modules/2_qc_boxplot_module.R',c('build_qc_stats_report','data_pre_processed'),qc_env)
check('QC report names the applied method despite pending controls',grepl('Normalization Method (applied): none',qc_env$build_qc_stats_report('Normalization Check'),fixed=TRUE))
check('QC before plot uses applied selection and zero handling',identical(shiny::isolate(qc_env$data_pre_processed()),r$data_info$data))
qc_state$data_available <- FALSE
check('QC report blocks stale provenance after invalidation',fails(qc_env$build_qc_stats_report('Normalization Check')))

args <- commandArgs(TRUE)
if(length(args)) {dir.create(args[1],recursive=TRUE,showWarnings=FALSE);write.csv(data.frame(check=checks,status='PASS'),file.path(args[1],'state-filter-checks.csv'),row.names=FALSE)}
cat(sprintf('PASS: %d preparation, filtering and session-state checks\n',length(checks)))
