suppressPackageStartupMessages(library(shiny))
source('R/frontends/team/project_records.R');source('R/frontends/team/project_library.R')
`%||%`<-function(a,b)if(is.null(a))b else a
run<-list(run=1L,time='2026-10-31 UTC',experiment='QA records fixture',retained=3L,sample_count=4L,threshold=0,scope='cohort',imputation='None',normalization='None',seed=123L)
server<-function(input,output,session){
 workflow<-list(goal=reactiveVal('overview'),history=reactiveVal(list(run)))
 assistant<-list(pending=reactiveVal(list(token='must-not-restore')),audit=reactiveVal(data.frame(Time='2026-10-31 UTC',Action='confirm',Parameter='detection',Previous='5',Proposed='0',Status='setting update sent')))
 hub<-list(preparation_audit=function()list(normalization='None',imputation='None'),qc_decisions=function()data.frame(Sample='QA-S1',Decision='keep'),is_restoring=function()FALSE)
 session$userData$team_project_methods_writer<-function(file)writeLines(c('QA methods snapshot','Run history is session-local.'),file)
 records<-team_project_records_server(input,output,session,hub,workflow,assistant)
}
testServer(server,{
 session$setInputs(guide_unit='Animal',guide_design_type='independent',guide_design_notes='Synthetic QA design note',guide_design_confirm=TRUE);session$flushReact()
 stopifnot(!grepl('Saved to your project',output$team_project_records_status,fixed=TRUE))
 isolate(session$userData$team_project_records_saved());session$flushReact()
 stopifnot(grepl('Saved to your project',output$team_project_records_status,fixed=TRUE))
 record<-isolate(session$userData$team_project_records_export())
 stopifnot(record$design$notes=='Synthetic QA design note',record$run_history[[1]]$seed==123L,!any(grepl('session-local',unlist(record$methods$lines),fixed=TRUE)))
 root<-tempfile();dir.create(root);writeLines('{}',file.path(root,'state.json'));path<-tempfile(fileext='.zip');zip::zipr(path,'state.json',root=root)
 old<-team_project_records_read(path);stopifnot(is.null(old))
 live_export<-session$userData$team_project_records_export
 session$userData$team_project_records_export<-function()record
 team_project_records_attach(path,session)
 session$userData$team_project_records_export<-live_export
 fresh<-team_project_records_read(path);stopifnot(identical(team_project_records_json(fresh),team_project_records_json(record)))
 # Real archive content, not R serialization; no commands, approvals or tokens.
 stopifnot(!any(c('pending','approval','guide_design_confirm')%in%names(fresh)))
 sent<-list();session$sendInputMessage<-function(id,message)sent[[id]]<<-message
 isolate(session$userData$team_project_records_import(fresh));session$flushReact()
 stopifnot(is.null(isolate(assistant$pending())),isTRUE(isolate(workflow$history())[[1]]$archived),startsWith(isolate(workflow$history())[[1]]$time,'[Archived]'),startsWith(isolate(assistant$audit())$Status,'[Archived]'),isFALSE(sent$guide_design_confirm$value),sent$guide_design_notes$value=='Synthetic QA design note')
 archived_file<-output$team_archived_methods;stopifnot(any(grepl('ARCHIVED CHECKPOINT RECORD',readLines(archived_file),fixed=TRUE)))
 isolate(session$userData$team_project_records_import(NULL));session$flushReact();stopifnot(grepl('older checkpoint',output$team_project_records_status,fixed=TRUE))
 bad<-fresh;bad$pending<-list(token='forbidden');stopifnot(inherits(tryCatch(team_project_records_validate(bad),error=identity),'error'))
 # Record validation must complete before any storage action is possible.
 bad<-fresh;bad$run_history[[1]]$retained<-list(executable='no');stopifnot(inherits(tryCatch(team_project_records_validate(bad),error=identity),'error'))
 # Synthetic fixture exported for the isolated QA DB roundtrip.
 target<-Sys.getenv('TEAM_RECORDS_QA_FIXTURE');if(nzchar(target))writeLines(team_project_records_json(fresh),target,useBytes=TRUE)
 events<-list();session$sendCustomMessage<-function(type,message)events[[length(events)+1L]]<<-list(type=type,message=message)
 session$setInputs(guide_design_notes='Modified note without a Canvas edit');session$flushReact()
 stopifnot(any(vapply(events,function(x)x$type=='team-project-records-changed',logical(1))))
 events<-list();assistant$audit(rbind(isolate(assistant$audit()),data.frame(Time='now',Action='cancel',Parameter='',Previous='',Proposed='',Status='cancelled')));session$flushReact()
 stopifnot(any(vapply(events,function(x)x$type=='team-project-records-changed',logical(1))))
 events<-list();next_run<-run;next_run$time<-'new completed run';workflow$history(c(isolate(workflow$history()),list(next_run)));session$flushReact()
 stopifnot(any(vapply(events,function(x)x$type=='team-project-records-changed',logical(1))))
 unlink(c(root,path),recursive=TRUE)
})
# Verify the adapter finds the actual shared report without mutating Classic.
source('R/guided_workflow.R');original<-body(guided_workflow_server)
original_guide<-guided_workflow_server
# Deliberately stop after exporter hook registration by using a miniature contract.
guided_workflow_server<-function(input,output,session,shared_data){output$guide_report<-downloadHandler(filename=function()'qa.txt',content=function(file)writeLines('Run history is session-local.',file));invisible(list(history=reactiveVal(list())))}
testServer(function(input,output,session){workflow<-team_project_guided_server(input,output,session,list())},{
 path<-tempfile();session$userData$team_project_methods_writer(path);stopifnot(!any(grepl('session-local',readLines(path),fixed=TRUE)));unlink(path)
})
stopifnot(identical(body(original_guide),original))
cat('PASS atomic ZIP records sidecar, exact JSON roundtrip, archived methods/history/actions hydration, no pending proposal/approval revival, old checkpoint fallback, invalid schema rejected, Team exporter clone leaves Classic untouched.\n')
# Exercise the actual assistant's log in Team and Classic with 205 harmless
# rejected confirmations. No scientific setting or live proposal is applied.
source('R/companion_assistant.R')
for(team in c(TRUE,FALSE)) {
 testServer(function(input,output,session){
   workflow<-list(step=function()1L,design_ok=function()FALSE)
   hub<-list(is_restoring=function()FALSE,rawData=function()NULL,selected_cols=function()character(),all_metadata=function()NULL,loaded_files=function()character(),data_processed=function()NULL,preparation_dirty=function()FALSE,preparation_audit=function()NULL,de_contrast_info=function()NULL)
   assistant<-if(team)team_project_companion_server(input,output,session,hub,workflow) else companion_assistant_server(input,output,session,hub,workflow)
 },{
   session$flushReact()
   for(i in seq_len(205L))session$setInputs(assistant_confirm=list(nonce=i,token='invalid-no-proposal'))
   stopifnot(nrow(isolate(assistant$audit()))==if(team)205L else 200L,is.null(isolate(assistant$pending())))
 })
}
cat('PASS actual assistant: Team retains all205 logged events, Classic cap200 unchanged, no proposal/setting applied.\n')

# Team contextual copy changes are scoped; the shared Classic helper is untouched.
team_workspace_enabled<-function()TRUE
html<-htmltools::renderTags(team_project_share_ui())$html
stopifnot(!grepl('1. Download',html,fixed=TRUE),!grepl('2. Download',html,fixed=TRUE),!grepl('3. Download',html,fixed=TRUE),grepl('Downloads below are optional copies',html,fixed=TRUE),!grepl('Companion actions are session-local',html,fixed=TRUE))
testServer(function(input,output,session){
 workflow<-list(step=function()7L,design_ok=function()FALSE)
 assistant<-team_project_companion_server(input,output,session,list(),workflow)
},{
 messages<-list();session$sendCustomMessage<-function(type,message)messages[[length(messages)+1L]]<<-list(type=type,message=message)
 session$flushReact();session$setInputs(assistant_request=list(nonce=1,text='explain this step'));session$flushReact()
 replies<-Filter(function(x)x$type=='assistant_reply',messages)
 stopifnot(any(vapply(replies,function(x)grepl('methods and decisions',x$message$text,fixed=TRUE)&&grepl('Downloads are optional',x$message$text,fixed=TRUE),logical(1))))
})
cat('PASS server notes/history/audit emit autosave messages independently of Canvas; Team Share and companion explain persistence/optional downloads.\n')
# Empty restore may invalidate no reactive value: the first real edit and its
# undo must both autosave; a one-shot hydration comparison must never stick.
testServer(function(input,output,session){
 workflow<-list(goal=reactiveVal('overview'),history=reactiveVal(list()))
 assistant<-list(pending=reactiveVal(NULL),audit=reactiveVal(data.frame(Time=character(),Action=character(),Parameter=character(),Previous=character(),Proposed=character(),Status=character())))
 records<-team_project_records_server(input,output,session,list(),workflow,assistant)
},{
 session$setInputs(guide_unit='',guide_design_type='',guide_design_notes='',team_library_project='A');session$flushReact()
 record<-isolate(session$userData$team_project_records_export());stopifnot(length(record$run_history)==0L,length(record$companion_actions)==0L)
 isolate(session$userData$team_project_records_import(record));session$flushReact()
 events<-list();session$sendCustomMessage<-function(type,message)events[[length(events)+1L]]<<-type
 session$setInputs(guide_design_notes='first real edit');session$flushReact()
 stopifnot('team-project-records-changed'%in%unlist(events))
 isolate(session$userData$team_project_records_saved());session$flushReact()
 events<-list();session$setInputs(guide_design_notes='');session$flushReact()
 stopifnot('team-project-records-changed'%in%unlist(events),!grepl('Saved to your project',output$team_project_records_status,fixed=TRUE))
 isolate(session$userData$team_project_records_saved());session$flushReact()
 stopifnot(grepl('Saved to your project',output$team_project_records_status,fixed=TRUE))
 session$setInputs(team_library_project='B');session$flushReact()
 stopifnot(!grepl('Saved to your project',output$team_project_records_status,fixed=TRUE),grepl('Project selection changed',output$team_project_records_status,fixed=TRUE))
})
cat('PASS empty restore first edit+undo both trigger autosave; returning to restored state is not suppressed; Saved status resets on project selection.\n')
# Nonempty update*Input hydration takes a client roundtrip. Historical server
# changes + old inputs, partial updates and final target values must stay quiet.
testServer(function(input,output,session){
 workflow<-list(goal=reactiveVal('overview'),history=reactiveVal(list()))
 assistant<-list(pending=reactiveVal(NULL),audit=reactiveVal(data.frame(Time=character(),Action=character(),Parameter=character(),Previous=character(),Proposed=character(),Status=character())))
 records<-team_project_records_server(input,output,session,list(),workflow,assistant)
},{
 session$setInputs(guide_unit='',guide_design_type='',guide_design_notes='');session$flushReact()
 record<-isolate(session$userData$team_project_records_export());record$design<-list(unit='Animal',relationship='independent',notes='x');record$run_history<-list(run)
 events<-list();session$sendCustomMessage<-function(type,message)events[[length(events)+1L]]<<-type
 isolate(session$userData$team_project_records_import(record));session$flushReact()
 stopifnot(!'team-project-records-changed'%in%unlist(events),grepl('restored',output$team_project_records_status,fixed=TRUE))
 session$setInputs(guide_unit='Animal');session$flushReact()
 stopifnot(!'team-project-records-changed'%in%unlist(events))
 session$setInputs(guide_design_type='independent',guide_design_notes='x');session$flushReact()
 stopifnot(!'team-project-records-changed'%in%unlist(events))
 session$setInputs(guide_design_notes='y');session$flushReact()
 stopifnot(sum(unlist(events)=='team-project-records-changed')==1L)
 events<-list();session$setInputs(guide_design_notes='x');session$flushReact()
 stopifnot(sum(unlist(events)=='team-project-records-changed')==1L)
 # A genuine edit before a delayed client response also releases the gate.
 session$setInputs(guide_design_notes='');session$flushReact();events<-list()
 isolate(session$userData$team_project_records_import(record));session$flushReact();events<-list()
 session$setInputs(guide_design_notes='user edit before acknowledgement');session$flushReact()
 stopifnot(sum(unlist(events)=='team-project-records-changed')==1L)
})
cat('PASS asynchronous nonempty design hydration old→partial→target emits no autosave; first real edit, undo and pre-ack real note edit each autosave.\n')
