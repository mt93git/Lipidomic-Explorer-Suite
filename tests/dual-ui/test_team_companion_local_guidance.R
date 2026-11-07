library(shiny)
Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE='1')
source('R/frontends/team/companion_assistant.R')
companion_ai_available<-function()FALSE
server<-function(input,output,session){shared<-list(rawData=reactive(data.frame(x=1)),is_restoring=reactive(FALSE));guide<-list(step=reactive(3L));assistant<-companion_assistant_server(input,output,session,shared,guide)}
testServer(server,{
 messages<-list();session$sendCustomMessage<-function(type,message){messages[[length(messages)+1L]]<<-list(type=type,message=message)}
 session$setInputs(`qc_pca_tab-normalizationMethod`='none',`qc_pca_tab-minDetectionPct`=20,`qc_pca_tab-useImputation`=FALSE);session$flushReact()
 questions<-c('explain this step','what is normalization','what is detection','what is PCA','what is a violin plot','what is a volcano plot','what is the 3d cell','what is QRILC')
 for(i in seq_along(questions)){
  session$setInputs(assistant_request=list(nonce=i,text=questions[[i]]));msg<-tail(Filter(function(x)identical(x$type,'assistant_reply'),messages),1)[[1]]$message
  stopifnot(!grepl('Quality|Open Results|Prepare data|nothing autosaves',paste(msg$text,paste(vapply(msg$actions,function(a)a$label,character(1)),collapse=' ')),ignore.case=TRUE))
 }
 session$setInputs(assistant_request=list(nonce=30,text='set detection to 80'));stopifnot(!is.null(assistant$pending()),identical(assistant$settings()$detection,20))
})
cat('PASS: actual Team local fallback and step guidance; no obsolete labels; scientific proposal needs confirmation\n')
