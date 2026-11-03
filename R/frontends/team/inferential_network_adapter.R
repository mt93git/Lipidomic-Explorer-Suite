# Fail closed in Team when independent-sample inference is unavailable. The
# shared modules remain untouched; their correlation p-values must not silently
# use the count of repeated observations as independent sample size.
team_inferential_network_adapter <- function(original, kind=c('structural','fla')) {
  kind<-match.arg(kind);stopifnot(is.function(original))
  reactive_name<-if(kind=='structural')'networkData'else'correlation_data'
  output_name<-if(kind=='structural')'networkPlot'else'plotCircos'
  output_target<-substitute(output$NAME,list(NAME=as.name(output_name)))
  message<-if(kind=='structural') 'Correlation network requires a confirmed independent study design. Repeated observations cannot be treated as independent.' else 'Functional correlation circos requires a confirmed independent study design. Repeated observations cannot be treated as independent.'
  counts<-c(reactive=0L,output=0L,logic=0L)
  rewrite<-function(node){
    if(is.call(node)&&identical(node[[1]],as.name('<-'))){
      is_data<-identical(node[[2]],as.name(reactive_name));is_output<-identical(node[[2]],output_target);is_logic<-kind=='fla'&&identical(node[[2]],as.name('circos_plot_logic'))
      if(is_data||is_output||is_logic){
        expected<-if(is_data||is_logic)'reactive'else'renderPlot'
        if(!is.call(node[[3]])||!identical(node[[3]][[1]],as.name(expected))||length(node[[3]])<2L)stop('Team network gate requires review: shared renderer structure changed')
        arg_name<-names(node[[3]])[2L];if(is.null(arg_name))arg_name<-''
        body<-node[[3]][[2]]
        if(length(arg_name)!=1L||is.na(arg_name)||!arg_name%in%c('','expr')||!is.call(body)||!identical(body[[1]],as.name('{')))stop('Team network gate requires review: first argument must be an expression body')
        node[[3]][[2]]<-if(is_logic)substitute({if(!guided_local_inference_allowed(session,shared_data))return(function(include_title=FALSE){print(generate_empty_plot_message(MESSAGE))});ORIGINAL},list(ORIGINAL=body,MESSAGE=message))else if(is_data)substitute({if(!guided_local_inference_allowed(session,shared_data))return(NULL);ORIGINAL},list(ORIGINAL=body))else substitute({if(!guided_local_inference_allowed(session,shared_data))return(generate_empty_plot_message(MESSAGE));ORIGINAL},list(ORIGINAL=body,MESSAGE=message))
        key<-if(is_logic)'logic'else if(is_data)'reactive'else'output';counts[[key]]<<-counts[[key]]+1L;return(node)
      }
    }
    if(is.recursive(node))for(i in seq_along(node))if(!is.null(node[[i]]))node[[i]]<-rewrite(node[[i]])
    node
  }
  adapted<-original;body(adapted)<-rewrite(body(original))
  if(!identical(unname(counts),c(1L,1L,if(kind=='fla')1L else 0L)))stop('Team network gate requires review: shared module structure changed')
  adapted
}
