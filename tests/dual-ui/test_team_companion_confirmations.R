library(shiny)
Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE='1')
source('R/frontends/team/companion_assistant.R')
server <- function(input,output,session) {
 shared <- list(rawData=reactive(data.frame(x=1)), is_restoring=reactive(FALSE))
 guide <- list(step=reactive(3L))
 assistant <- companion_assistant_server(input,output,session,shared,guide)
}
testServer(server, {
 messages<-list();session$sendCustomMessage<-function(type,message){messages[[length(messages)+1L]]<<-list(type=type,message=message)}
 session$setInputs(`qc_pca_tab-normalizationMethod`='none',`qc_pca_tab-minDetectionPct`=20,`qc_pca_tab-useImputation`=FALSE);session$flushReact()
 session$setInputs(assistant_request=list(nonce=1,text='set detection to 80 and prepare'));stopifnot(is.null(assistant$pending()))
 reply<-tail(Filter(function(x)identical(x$type,'assistant_reply'),messages),1)[[1]]$message$text;stopifnot(grepl('Review',reply,fixed=TRUE),grepl('automatically after confirmation',reply,fixed=TRUE),!grepl('Quality|click Prepare data',reply))
 session$setInputs(assistant_action=list(nonce=2,id='propose_parameter',revision=assistant$revision(),args=list(parameter='detection',value=101)));stopifnot(is.null(assistant$pending()))
 session$setInputs(assistant_request=list(nonce=3,text='Set the detection threshold to 80%'));p<-assistant$pending();stopifnot(!is.null(p),identical(p$value,80),identical(assistant$settings()$detection,20),!any(vapply(messages,function(x)identical(x$type,'team-review-confirmed-detection'),logical(1))))
 session$setInputs(assistant_cancel=list(nonce=4,token=p$token));stopifnot(is.null(assistant$pending()))
 session$setInputs(assistant_confirm=list(nonce=5,token=p$token));stopifnot(is.null(assistant$pending()),tail(assistant$audit()$Status,1)=='rejected no pending proposal')
 session$setInputs(assistant_request=list(nonce=6,text='set detection to 80'));p<-assistant$pending();stopifnot(!is.null(p))
 session$setInputs(`qc_pca_tab-minDetectionPct`=25);session$flushReact();session$setInputs(assistant_confirm=list(nonce=7,token=p$token));stopifnot(is.null(assistant$pending()),tail(assistant$audit()$Status,1)=='rejected no pending proposal')
 session$setInputs(assistant_request=list(nonce=8,text='set detection to 80'));p<-assistant$pending();session$setInputs(assistant_confirm=list(nonce=9,token=p$token));stopifnot(is.null(assistant$pending()),tail(assistant$audit()$Status,1)=='setting update sent',any(vapply(messages,function(x)identical(x$type,'team-review-confirmed-detection')&&identical(x$message$threshold,80),logical(1))))
 cat('PASS mixed request, invalid action, cancel, stale confirmation, explicit confirmation\n')
})

Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE='0')
testServer(server, {
 messages<-list();session$sendCustomMessage<-function(type,message){messages[[length(messages)+1L]]<<-list(type=type,message=message)}
 session$setInputs(`qc_pca_tab-normalizationMethod`='none',`qc_pca_tab-minDetectionPct`=20,`qc_pca_tab-useImputation`=FALSE);session$flushReact()
 session$setInputs(assistant_request=list(nonce=101,text='set detection to 80 and prepare'))
 reply<-tail(Filter(function(x)identical(x$type,'assistant_reply'),messages),1)[[1]]$message$text
 stopifnot(identical(reply,'I can propose one scientific setting at a time, but I will not prepare or run the analysis from chat. Ask separately to change a setting, confirm it, then review Quality and click Prepare data yourself.'),is.null(assistant$pending()))
})
cat('PASS: rejected compound request gives correct Team guidance and unchanged Classic reply\n')
