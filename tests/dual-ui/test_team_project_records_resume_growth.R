suppressPackageStartupMessages(library(shiny))
source('R/frontends/team/project_records.R')
# Each resume rebuilds the applied preparation after import and re-logs the
# latest archived run. That rebuild must not grow run history; real runs stay.
keep<-as.list(rep(TRUE,2280L))
run<-function(key,time)list(key=key,time=time,experiment='QA growth fixture',keep=keep,retained=2000L,sample_count=66L,threshold=0,scope='global',imputation='None',normalization='None',seed=42L,run=1L)
server<-function(input,output,session){
 workflow<-list(goal=reactiveVal('overview'),history=reactiveVal(list(run('k-saved','2026-11-04 10:00 UTC'))))
 assistant<-list(pending=reactiveVal(NULL),audit=reactiveVal(data.frame(Time=character(),Action=character(),Parameter=character(),Previous=character(),Proposed=character(),Status=character(),stringsAsFactors=FALSE)))
 hub<-list(preparation_audit=function()NULL,qc_decisions=function()NULL,is_restoring=function()FALSE)
 session$userData$team_project_methods_writer<-function(file)writeLines('QA methods',file)
 team_project_records_server(input,output,session,hub,workflow,assistant)
}
testServer(server,{
 session$sendInputMessage<-function(id,message)NULL
 history<-function()isolate(workflow$history())
 sizes<-integer()
 for(i in seq_len(25L)){
  record<-isolate(session$userData$team_project_records_export())
  sizes<-c(sizes,team_project_records_nodes(record))
  # Resume in a new session: import, then the rebuilt preparation finishes and is re-logged.
  workflow$history(list());session$flushReact()
  isolate(session$userData$team_project_records_import(record));session$flushReact()
  workflow$history(c(history(),list(run('k-saved',paste('rebuild',i)))));session$flushReact()
  stopifnot(length(history())==1L,isTRUE(history()[[1]]$archived),history()[[1]]$run==1L)
 }
 stopifnot(length(unique(sizes[-1]))==1L) # first export gains the archived marker once
 # A real run with new settings after resume is kept.
 workflow$history(c(history(),list(run('k-new','user run'))));session$flushReact()
 stopifnot(length(history())==2L,identical(history()[[2]]$key,'k-new'))
 # Only the first live run after import is checked: a later identical run is kept.
 record<-isolate(session$userData$team_project_records_export())
 isolate(session$userData$team_project_records_import(record));session$flushReact()
 stopifnot(length(history())==2L)
 workflow$history(c(history(),list(run('k-other','user run 2'))));session$flushReact()
 workflow$history(c(history(),list(run('k-new','user repeats latest'))));session$flushReact()
 stopifnot(length(history())==4L)
 # Rebuild already finished before import: it is filtered there, and a later
 # deliberate run with the same settings is kept.
 record<-isolate(session$userData$team_project_records_export())
 workflow$history(c(history(),list(run('k-new','rebuild before import'))))
 isolate(session$userData$team_project_records_import(record));session$flushReact()
 stopifnot(length(history())==4L)
 workflow$history(c(history(),list(run('k-new','deliberate repeat'))));session$flushReact()
 stopifnot(length(history())==5L)
 # Existing archived duplicates are never dropped or rewritten.
 dup<-record;dup$run_history<-c(dup$run_history,dup$run_history)
 isolate(session$userData$team_project_records_import(dup));session$flushReact()
 stopifnot(length(history())==length(dup$run_history))
})
cat('PASS 25 resumes keep run history and record size constant; new and deliberate runs kept; archived duplicates kept.\n')
# A record past the bound fails with its own message, marked permanent.
big<-list(version='1',kind='archived-project-records',created_at='now',design=list(unit='',relationship='',notes=''),question='',
 run_history=lapply(1:22,function(i)run(paste0('k',i),'t')),companion_actions=list(),methods=list(status='not_prepared',lines=list('x')),applied_preparation=list(),quality_decisions=NULL)
err<-tryCatch(team_project_records_validate(big),error=conditionMessage)
stopifnot(identical(err,team_project_records_size_message),team_project_records_permanent(err))
bad<-big;bad$run_history<-list();bad$extra<-1
stopifnot(team_project_records_permanent(tryCatch(team_project_records_validate(bad),error=conditionMessage)))
stopifnot(!team_project_records_permanent('Save timed out. Your changes remain in this tab.'),!team_project_records_permanent('A save is already in progress; retry after it finishes.'))
s<-new.env();s$userData<-list(team_project_records_last_nodes=85000L);stopifnot(team_project_records_near_limit(s))
s$userData$team_project_records_last_nodes<-20000L;stopifnot(!team_project_records_near_limit(s))
cat('PASS size-limit rejection is explicit and permanent; transient failures still retry; near-limit at >80%.\n')
