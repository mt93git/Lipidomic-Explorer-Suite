suppressPackageStartupMessages(library(shiny))
source('R/frontends/team/project_records.R')
# Resuming a checkpoint imports its records (history, actions, goal) and rebuilds the applied
# preparation, which re-logs the latest archived run. Neither is an edit: no
# 'team-project-records-changed' (the autosave trigger) until the records really change.
keep<-as.list(rep(TRUE,20L))
run<-function(key,time)list(key=key,time=time,experiment='QA clean resume',keep=keep,retained=20L,sample_count=6L,threshold=0,scope='global',imputation='None',normalization='None',seed=42L,run=1L)
server<-function(input,output,session){
 workflow<-list(goal=reactiveVal('overview'),history=reactiveVal(list(run('k-saved','2026-11-04 10:00 UTC'))))
 assistant<-list(pending=reactiveVal(NULL),audit=reactiveVal(data.frame(Time='t0',Action='Set',Parameter='p',Previous='a',Proposed='b',Status='Applied',stringsAsFactors=FALSE)))
 hub<-list(preparation_audit=function()NULL,qc_decisions=function()NULL,is_restoring=function()FALSE,restore_generation=function()1L)
 session$userData$team_project_methods_writer<-function(file)writeLines('QA methods',file)
 team_project_records_server(input,output,session,hub,workflow,assistant)
}
testServer(server,{
 sent<-0L
 session$sendInputMessage<-function(id,message)NULL
 session$sendCustomMessage<-function(type,message)if(identical(type,'team-project-records-changed'))sent<<-sent+1L
 history<-function()isolate(workflow$history())
 record<-isolate(session$userData$team_project_records_export())
 # New session: empty records, import, then the rebuilt preparation re-logs the latest run.
 workflow$history(list());assistant$audit(isolate(assistant$audit())[0,,drop=FALSE]);workflow$goal('');session$flushReact()
 sent<-0L
 isolate(session$userData$team_project_records_import(record));session$flushReact()
 stopifnot(identical(sent,0L))
 # guided_workflow.R marks the restore's own rebuild with its restore generation.
 rebuild<-run('k-saved','rebuild');rebuild$restore_rebuild<-1L
 workflow$history(c(history(),list(rebuild)));session$flushReact()
 stopifnot(length(history())==1L,identical(sent,0L))
 cat('PASS importing a checkpoint and its preparation rebuild do not schedule an autosave.\n')
 # The first real change is scheduled, and so is every later one.
 workflow$history(c(history(),list(run('k-new','user run'))));session$flushReact()
 stopifnot(identical(sent,1L))
 workflow$goal('a new question');session$flushReact()
 stopifnot(identical(sent,2L))
 # Going back to the imported records is a change against what is now in the project.
 workflow$goal('overview');session$flushReact()
 stopifnot(identical(sent,3L))
 cat('PASS real record changes after a resume are still scheduled, including a return to the imported values.\n')
 # A companion action recorded after a fresh resume is scheduled too.
 record<-isolate(session$userData$team_project_records_export())
 isolate(session$userData$team_project_records_import(record));session$flushReact()
 sent<-0L
 a<-isolate(assistant$audit());a<-rbind(a,data.frame(Time='t1',Action='Set',Parameter='q',Previous='c',Proposed='d',Status='Applied',stringsAsFactors=FALSE))
 assistant$audit(a);session$flushReact()
 stopifnot(identical(sent,1L))
 cat('PASS a companion action after a resume is scheduled.\n')
})
