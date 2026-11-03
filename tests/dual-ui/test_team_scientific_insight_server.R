library(shiny)
`%||%`<-function(x,y)if(is.null(x)||!length(x))y else x
rd_value<-function(x)if(is.function(x))tryCatch(x(),error=function(e)NULL)else x
source('R/frontends/team/scientific_insight_context.R');source('R/frontends/team/scientific_insight.R')
future::plan(future::sequential)
team_insight_complete<-function(context)list(ok=TRUE,paragraph='Class-level evidence has been reported [PMID:123].',sources=list(list(title='Verified fixture',url='https://pubmed.ncbi.nlm.nih.gov/123/')),context_label=context$context_label,searched_at='test')
shiny::testServer(function(input,output,session){
  values<-reactiveVal(data.frame(Lipid='PC(34:1)',sample_secret=2))
  dirty<-reactiveVal(FALSE);auth<-reactiveVal(TRUE);snap<-reactiveVal(NULL)
  session$userData$team_library_authenticated<-function()auth()
  session$userData$team_canvas_export<-function()snap()
  log<-new.env();log$messages<-list();session$sendCustomMessage<-function(type,message){log$messages[[length(log$messages)+1L]]<-message}
  shared<-list(data_processed=values,preparation_dirty=dirty,preparation_state=reactive(list(revision=1)),all_metadata=reactive(data.frame(FullName='PRIVATE_SECRET')))
  dash<-list(violin_data=reactive(data.frame(Lipid='PC(34:1)',Log10_abundance=as.numeric(values()[1,2]))))
  team_scientific_insight_server(input,output,session,shared,dash)
},{
  session$flushReact()
  session$setInputs(team_scientific_insight=list(plot_id='results_dashboard-plot_violin',request_id='one'))
  for(i in 1:10){later::run_now(.05);session$flushReact()}
  stopifnot(tail(log$messages,1)[[1]]$status=='ready')
  before<-values()
  session$setInputs(team_scientific_insight=list(plot_id='results_dashboard-plot_violin',request_id='cached'))
  stopifnot(tail(log$messages,1)[[1]]$status=='ready',identical(before,values()))
  snap(list(nodes=list(list(id='results_dashboard-plot_violin',finished=list(url='test')))))
  session$setInputs(team_scientific_insight=list(plot_id='results_dashboard-plot_violin',request_id='frozen'))
  stopifnot(tail(log$messages,1)[[1]]$status=='unsupported')
  # A saved note may refresh a frozen figure only against identical data/context.
  old<-Filter(function(m)identical(m$status,'ready'),log$messages)[[1]]
  stopifnot(grepl('^[a-f0-9]{64}$',old$fingerprint))
  snap(list(nodes=list(list(id='results_dashboard-plot_violin',finished=list(url='test',stale=FALSE),insight=list(fingerprint=old$fingerprint)))))
  session$setInputs(team_scientific_insight=list(plot_id='results_dashboard-plot_violin',request_id='wrong',refresh=TRUE,fingerprint=paste(rep('0',64),collapse='')))
  stopifnot(tail(log$messages,1)[[1]]$status=='unsupported')
  # Refresh explicitly bypasses cache and still observes rate limiting.
  session$setInputs(team_scientific_insight=list(plot_id='results_dashboard-plot_violin',request_id='limited',refresh=TRUE,fingerprint=old$fingerprint))
  stopifnot(tail(log$messages,1)[[1]]$status=='error')
  Sys.sleep(8.1)
  session$setInputs(team_scientific_insight=list(plot_id='results_dashboard-plot_violin',request_id='refresh',refresh=TRUE,fingerprint=old$fingerprint))
  for(i in 1:10){later::run_now(.05);session$flushReact()}
  stopifnot(tail(log$messages,1)[[1]]$status=='ready',identical(before,values()))
  # Identical summaries are not enough: the actual prepared dataset is bound.
  values(data.frame(Lipid='PC(34:1)',sample_secret=3));session$flushReact()
  session$setInputs(team_scientific_insight=list(plot_id='results_dashboard-plot_violin',request_id='changed',refresh=TRUE,fingerprint=old$fingerprint))
  stopifnot(tail(log$messages,1)[[1]]$status=='unsupported')
  snap(NULL);auth(FALSE)
  session$setInputs(team_scientific_insight=list(plot_id='results_dashboard-plot_violin',request_id='signedout'))
  stopifnot(tail(log$messages,1)[[1]]$status=='error')
  auth(TRUE);values(data.frame(Lipid='PC(34:1)',sample_secret=4));session$flushReact()
  stopifnot(any(vapply(log$messages,function(m)identical(m$status,'stale'),logical(1))))
})
cat('PASS server cache, authentication, frozen snapshot guard, unchanged data and stale note invalidation\n')
