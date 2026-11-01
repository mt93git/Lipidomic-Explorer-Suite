library(shiny)
`%||%`<-function(a,b)if(is.null(a))b else a
lipidomic_plotly_event<-function(...)NULL
source('R/sample_metadata_import.R');source('R/results_dashboard.R')
classes<-c('ACAR','CE','CER','CL','DAG','FA','HCER','LPA','LPC','LPE','LPG','LPI','LPS','PA','PC','PE','PG','PI','PS','SM','TAG')
mat<-outer(seq_along(classes),seq_len(66),function(i,j)i+j/100);colnames(mat)<-paste0('S',seq_len(66));df<-data.frame(Lipid_Name=paste0(classes,'(1)'),mat,check.names=FALSE)
metadata<-data.frame(FullName=colnames(mat),Group1=rep(c('Healthy','SC-SteadyState','SC-PainCrisis'),c(17,33,16)),Group2='X')
value<-function(x){force(x);function(...)x};hub<-list(data_processed=value(df),all_metadata=value(metadata),preparation_audit=value(list()),preparation_dirty=value(FALSE),color_maps=value(list()),class_color_map=value(NULL),team_compact_distribution=TRUE)
server<-function(input,output,session){dashboard<-moduleServer('tcinstance_repro',function(input,output,session)results_dashboard_module_server(input,output,session,hub))}
testServer(server,{
 target<-Sys.getenv('TEAM_COMP_PAYLOAD_DIR');stopifnot(nzchar(target),dir.exists(target))
 session$setInputs(`tcinstance_repro-color_by`='Group1',`tcinstance_repro-comp_class_selection`='__ALL__');session$flushReact()
 writeLines(output[['tcinstance_repro-plot_comp']],file.path(target,'all.json'))
 selected<-setdiff(classes,c('DAG','TAG'));raw<-as.character(jsonlite::toJSON(selected,auto_unbox=FALSE))
 session$setInputs(`tcinstance_repro-color_by`='Group1',`tcinstance_repro-comp_class_selection`=raw);session$flushReact()
 payload<-output[['tcinstance_repro-plot_comp']];p<-jsonlite::fromJSON(payload,simplifyVector=FALSE);meta<-p$x$layout$meta$teamClassSelection
 stopifnot(is.list(meta$selected),length(meta$selected)==19L,setequal(unlist(meta$selected),selected),meta$inputId=='tcinstance_repro-comp_class_selection')
 writeLines(payload,file.path(target,'filtered.json'))
 hidden<-Filter(function(t)isFALSE(t$visible),p$x$data)
 stopifnot(length(hidden)==2L,all(vapply(hidden,function(t)is.null(t[["name"]])&&is.null(t[["legendgroup"]])&&is.null(t[["y"]])&&startsWith(t$meta$teamSourceKey,'team-composition:'),logical(1))))
 cat('PASS R actual module payload66samples/3groups/allclassesexceptDAGTAG: meta.selected19stringarray matches bound input selection exactly; no dropped/groupedclass IDs.\n')
})
