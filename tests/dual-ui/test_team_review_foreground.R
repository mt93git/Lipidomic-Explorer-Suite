library(shiny)
source('R/frontends/team/foreground.R')
server<-function(input,output,session){
 run<-reactiveVal(0); state<-reactiveVal(list(status='pending',pending_id='new',revision=1L,applied=list(request_id='old')))
 shared<-list(run_analysis_trigger=run,preparation_state=state,request_team_review_preparation=function(kind,expected_threshold,expected_id){if(identical(input$mode,'throw'))stop('synthetic failure');if(identical(input$mode,'reject'))return(FALSE);if(identical(input$mode,'noop'))return(TRUE);run(isolate(run())+1);TRUE})
 view<-team_review_foreground_adapter(input,session,shared)
 observeEvent(input$call,{req<-input$team_review_prepare;view$request_team_review_preparation(kind=req$kind,expected_threshold=req$threshold)},ignoreInit=TRUE)
}
testServer(server,{
 messages<-list();session$sendCustomMessage<-function(type,message){messages[[length(messages)+1L]]<<-list(type=type,message=message)}
 statuses<-function()vapply(Filter(function(x)identical(x$type,'team-review-foreground-result'),messages),function(x)x$message$status,character(1))
 session$setInputs(mode='reject',team_review_prepare=list(kind='detection',source='human',token=1,threshold=80));session$setInputs(call=1);stopifnot(tail(statuses(),1)=='rejected')
 session$setInputs(mode='noop',team_review_prepare=list(kind='entry',source='human',token=2));session$setInputs(call=2);stopifnot(tail(statuses(),1)=='noop')
 session$setInputs(mode='throw',team_review_prepare=list(kind='detection',source='human',token=4,threshold=25));stopifnot(inherits(try(view$request_team_review_preparation(kind='detection',expected_threshold=25),silent=TRUE),'try-error'),tail(statuses(),1)=='failed')
 session$setInputs(mode='ok',team_review_prepare=list(kind='detection',source='human',token=3,threshold=50));session$setInputs(call=3);n<-length(statuses());session$setInputs(unrelated_autosave=1);session$flushReact();stopifnot(length(statuses())==n)
 state(list(status='ready',pending_id='new',revision=2L,applied=list(request_id='new')));session$flushReact();session$elapse(600);session$flushReact();stopifnot(tail(statuses(),1)=='complete')
 cat('PASS: review foreground rejects/noops, waits for matching preparation and flush; unrelated autosave cannot acknowledge\n')
})
