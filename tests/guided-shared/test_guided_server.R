library(shiny)
source('R/utils_sample_metadata.R');source('R/guided_shared.R')
`%||%`<-function(a,b)if(is.null(a))b else a
# Exercise the actual guided server with a small deterministic hub boundary.
# The real hub is covered separately by test_hub_adapter.R.
cell_show_server<-function(input,output,session,shared_data) {
  stopifnot(identical(isolate(shared_data$data_processed()),isolate(shared_data$data_processed_unfiltered())))
}
checks<-character();check<-function(n,x){stopifnot(isTRUE(x));checks<<-c(checks,n)}
fixture<-read.csv('tests/guided-shared/fixtures/abundance.csv',check.names=FALSE)
md<-read_sample_metadata_v01('tests/guided-shared/fixtures/metadata.csv')
legacy<-confirm_metadata_v01(stage_metadata_v01(md,names(fixture)[-1],c(Group1='Condition',Group2='Tissue',PatientNumber='SubjectID',Replicate='ReplicateID',TimePoint='TimePoint')),TRUE)$scientific_metadata
legacy$TimePoint_Group1<-paste0('custom-',seq_len(nrow(legacy)));legacy$Cluster<-rev(seq_len(nrow(legacy)));legacy$DisplayLabel<-paste0('custom label ',seq_len(nrow(legacy)))
server<-function(input,output,session){
  ext<-reactiveVal(NULL);restored<-reactiveVal(FALSE);generation<-reactiveVal(0L);bridge<-reactiveVal(NULL);calls<-reactiveVal(0)
  scientific<-reactiveVal(legacy);matrix<-reactiveVal(fixture);selection<-reactiveVal(names(fixture)[-1])
  hub<-list(restore_generation=generation,external_sample_metadata=ext,session_restored=restored,is_restoring=reactive(FALSE),
    all_metadata=scientific,all_numeric_columns=reactive(names(matrix())[-1]),selected_cols=selection,
    preparation_data_id=reactive(digest::digest(matrix())),rawData=reactive(list(data=matrix())),
    preparation_state=reactive(list(applied=NULL,dirty=FALSE,data_available=FALSE)),
    data_processed=reactive(fixture[1,,drop=FALSE]),data_processed_unfiltered=reactive(fixture),
    set_external_sample_metadata=function(s,confirmed){calls(isolate(calls())+1);x<-confirm_metadata_v01(s,confirmed);ext(x);scientific(x$scientific_metadata)})
  guide<-guided_shared_server(input,output,session,hub,bridge)
}
shiny::testServer(server,{
  session$flushReact();check('No upload gives false design gate, not an exception',!guide$design_ok())
  bad<-md;bad$SubjectID[1]<-''
  f<-tempfile(fileext='.csv');write.csv(bad,f,row.names=FALSE)
  session$setInputs(shared_metadata_file=data.frame(datapath=f));session$flushReact()
  check('Optional donor mapping is not preselected',grepl('selected>Not mapped',output$shared_metadata_mappings$html,fixed=TRUE))
  session$setInputs(shared_map_Group1='Condition',shared_map_PatientNumber='SubjectID');session$flushReact()
  check('Blank mapped donor remains recoverable',!guide$design_ok() && any(grepl('blank',guide$staged()$validation$errors)))
  session$setInputs(shared_step_3=1);session$flushReact()
  check('Navigation with invalid metadata does not terminate the session',!session$isClosed())
  session$setInputs(shared_map_PatientNumber='',shared_map_Group2='Condition');session$flushReact()
  check('Duplicate mapping remains recoverable',!guide$design_ok() && any(grepl('unique',guide$staged()$validation$errors)))
  session$setInputs(shared_map_Group2='');session$flushReact()
  session$setInputs(shared_design_confirm=TRUE,shared_review_receipt=list(checked=TRUE,token=guide$token()));session$setInputs(shared_apply_receipt=list(token=guide$token(),n=1))
  check('Explicit review confirms the current valid mapping',guide$design_ok() && calls()==1)
  session$setInputs(shared_map_Group2='Tissue');session$flushReact()
  check('Mapping edit invalidates confirmation',!guide$design_ok())
  session$setInputs(shared_apply_receipt=list(token=guide$token(),n=2));session$flushReact()
  check('Stale checked box cannot approve an edited mapping',calls()==1)
  session$setInputs(shared_design_confirm=FALSE);session$setInputs(shared_design_confirm=TRUE,shared_review_receipt=list(checked=TRUE,token=guide$token()));session$setInputs(shared_apply_receipt=list(token=guide$token(),n=3))
  check('Reconfirmation recovers without restarting',guide$design_ok() && calls()==2)
  generation(1L);session$flushReact()
  check('A failed restoration attempt revokes approval before hydration',!guide$design_ok())
  session$setInputs(shared_design_confirm=FALSE);session$setInputs(shared_design_confirm=TRUE,shared_review_receipt=list(checked=TRUE,token=guide$token()));session$setInputs(shared_apply_receipt=list(token=guide$token(),n=5))
  check('Fresh approval after failed import requires a current receipt',guide$design_ok())
  restored(TRUE);session$flushReact()
  check('Restoring the same sidecar revokes confirmation',!guide$design_ok())
  # Legacy review must preserve fields not represented by the new mapping selectors.
  restored(FALSE);ext(NULL);scientific(legacy);session$flushReact();restored(TRUE);session$flushReact()
  session$setInputs(shared_map_Group1='Condition',shared_map_Group2='Tissue',shared_map_PatientNumber='SubjectID',shared_map_Replicate='ReplicateID',shared_map_TimePoint='TimePoint');session$flushReact()
  session$setInputs(shared_design_confirm=FALSE);session$setInputs(shared_design_confirm=TRUE,shared_review_receipt=list(checked=TRUE,token=guide$token()));session$setInputs(shared_apply_receipt=list(token=guide$token(),n=4))
  check('Legacy confirmation preserves native clusters, labels and timepoint groups',guide$design_ok() && identical(scientific(),legacy) && calls()==3)
  changed<-legacy;changed$Cluster<-rep(99,nrow(changed));scientific(changed);session$flushReact()
  check('Live Classic metadata edits revoke legacy approval',!guide$design_ok())
  oldtoken<-guide$token()
  session$setInputs(shared_map_Group2='',shared_design_confirm=TRUE,shared_review_receipt=list(checked=TRUE,token=oldtoken),shared_apply_receipt=list(token=oldtoken,n=6));session$flushReact()
  check('One-flush stale preview receipt cannot authorize edited metadata',!guide$design_ok() && calls()==3)
  matrix(transform(fixture,S01=S01+1));session$flushReact()
  check('Matrix replacement revokes design approval',!guide$design_ok())
  unlink(f)
})
args<-commandArgs(TRUE);if(length(args))write.csv(data.frame(check=checks,status='PASS'),file.path(args[1],'guided-server.csv'),row.names=FALSE)
cat(sprintf('PASS: %d guided server checks\n',length(checks)))
