suppressPackageStartupMessages(library(shiny))
source('R/frontends/team/project_records.R')
# Each resume rebuilds the applied preparation after import and re-logs the
# latest archived run. That rebuild must not grow run history; real runs stay.
keep<-as.list(rep(TRUE,2280L))
# Real runs with new settings differ in content (seed here); a rebuild repeats the saved content under a new key.
run<-function(key,time,seed=switch(key,'k-new'=7L,'k-other'=8L,42L))list(key=key,time=time,experiment='QA growth fixture',keep=keep,retained=2000L,sample_count=66L,threshold=0,scope='global',imputation='None',normalization='None',seed=seed,run=1L)
# The run the restore itself produced carries its restore generation (guided_workflow.R); a person's runs do not.
generation<-reactiveVal(0L)
resume<-function()generation(isolate(generation())+1L)
rebuild<-function(key,time,seed=NULL,gen=isolate(generation())){h<-if(is.null(seed))run(key,time) else run(key,time,seed);h$restore_rebuild<-gen;h}
server<-function(input,output,session){
 workflow<-list(goal=reactiveVal('overview'),history=reactiveVal(list(run('k-saved','2026-11-04 10:00 UTC'))))
 assistant<-list(pending=reactiveVal(NULL),audit=reactiveVal(data.frame(Time=character(),Action=character(),Parameter=character(),Previous=character(),Proposed=character(),Status=character(),stringsAsFactors=FALSE)))
 hub<-list(preparation_audit=function()NULL,qc_decisions=function()NULL,is_restoring=function()FALSE,restore_generation=generation)
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
  resume();isolate(session$userData$team_project_records_import(record));session$flushReact()
  # The rebuilt run's key hashes the new restore_generation, so it never equals the saved key.
  workflow$history(c(history(),list(rebuild(paste0('k-gen',i),paste('rebuild',i),42L))));session$flushReact()
  stopifnot(length(history())==1L,isTRUE(history()[[1]]$archived),history()[[1]]$run==1L)
 }
 stopifnot(length(unique(sizes[-1]))==1L) # first export gains the archived marker once
 # A real run with new settings after resume is kept.
 workflow$history(c(history(),list(run('k-new','user run'))));session$flushReact()
 stopifnot(length(history())==2L,identical(history()[[2]]$key,'k-new'))
 # Only the first live run after import is checked: a later identical run is kept.
 record<-isolate(session$userData$team_project_records_export())
 resume();isolate(session$userData$team_project_records_import(record));session$flushReact()
 stopifnot(length(history())==2L)
 workflow$history(c(history(),list(run('k-other','user run 2'))));session$flushReact()
 workflow$history(c(history(),list(run('k-new','user repeats latest'))));session$flushReact()
 stopifnot(length(history())==4L)
 # Rebuild already finished before import: it is filtered there, and a later
 # deliberate run with the same settings is kept.
 record<-isolate(session$userData$team_project_records_export())
 workflow$history(c(history(),list(rebuild('k-new','rebuild before import',gen=isolate(generation())+1L))))
 resume();isolate(session$userData$team_project_records_import(record));session$flushReact()
 stopifnot(length(history())==4L)
 workflow$history(c(history(),list(run('k-new','deliberate repeat'))));session$flushReact()
 stopifnot(length(history())==5L)
 # Existing archived duplicates are never dropped or rewritten.
 dup<-record;dup$run_history<-c(dup$run_history,dup$run_history)
 resume();isolate(session$userData$team_project_records_import(dup));session$flushReact()
 stopifnot(length(history())==length(dup$run_history))
 # (a) A person's identical re-run (same content as the latest saved run, its own key) made before the import is kept; the restore's own rebuild, which
 # finishes after the import, is still removed.
 rec<-isolate(session$userData$team_project_records_export())
 workflow$history(list(run('k-user-a','user re-run before import',7L)));session$flushReact()
 resume();isolate(session$userData$team_project_records_import(rec));session$flushReact()
 n<-length(rec$run_history)+1L
 stopifnot(length(history())==n,!isTRUE(history()[[n]]$archived),identical(history()[[n]]$time,'user re-run before import'))
 workflow$history(c(history(),list(rebuild('k-gen-a','rebuild after user run',7L))));session$flushReact()
 stopifnot(length(history())==n)
 # (b) A person's identical run after the restore is kept, whether it comes before the restore's
 # rebuild finishes or after it.
 rec<-isolate(session$userData$team_project_records_export())
 workflow$history(list());session$flushReact()
 resume();isolate(session$userData$team_project_records_import(rec));session$flushReact()
 n<-length(history())
 workflow$history(c(history(),list(run('k-user-b1','user identical run after restore',7L))));session$flushReact()
 stopifnot(length(history())==n+1L)
 workflow$history(c(history(),list(rebuild('k-gen-b','rebuild after restore',7L))));session$flushReact()
 stopifnot(length(history())==n+1L)
 workflow$history(c(history(),list(run('k-user-b2','user identical run after rebuild',7L))));session$flushReact()
 stopifnot(length(history())==n+2L)
 # (c) A marker left by an earlier restore is ignored: a later restore with different content still removes
 # its own rebuild, and the stale marked run stays.
 rec<-isolate(session$userData$team_project_records_export())
 workflow$history(list(rebuild('k-stale','earlier restore rebuild',8L)));session$flushReact()
 resume();isolate(session$userData$team_project_records_import(rec));session$flushReact()
 n<-length(rec$run_history)+1L
 stopifnot(length(history())==n,identical(history()[[n]]$key,'k-stale'))
 workflow$history(c(history(),list(rebuild('k-gen-c','rebuild of this restore',7L))));session$flushReact()
 stopifnot(length(history())==n)
})
cat('PASS 25 resumes keep run history and record size constant; only the restore rebuild is removed; identical user runs before and after restore kept; archived duplicates kept.\n')
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
