suppressPackageStartupMessages(library(shiny))
`%||%`<-function(a,b)if(is.null(a))b else a
lipidomic_plotly_event<-function(...)NULL
source('R/sample_metadata_import.R');source('R/results_dashboard.R')
df<-data.frame(Lipid_Name=c('PC(1)','TAG(1)','PE(1)'),S1=c(9,1,3),S2=c(1,1,4),S3=c(2,8,2),S4=c(4,6,8),check.names=FALSE)
metadata<-data.frame(FullName=paste0('S',1:4),Group1=c('Healthy','Healthy','SC-Pain','SC-Pain'),Group2='X')
value<-function(x){force(x);function(...)x}
hub<-list(data_processed=value(df),all_metadata=value(metadata),preparation_audit=value(list()),preparation_dirty=value(FALSE),color_maps=value(list()),class_color_map=value(NULL))
server<-function(input,output,session){dashboard<-results_dashboard_module_server(input,output,session,hub)}
testServer(server,{
 session$setInputs(color_by='Group1',pca_scale='uv',violin_lipid='PC(1)',heat_lipid_selection='__EVERY__',comp_axis_mode='group',comp_group_selection='["Healthy"]');session$flushReact()
 comp<-jsonlite::fromJSON(output$plot_comp,simplifyVector=FALSE)
 stopifnot(comp$x$layout$barnorm=='percent',is.null(comp$x$layout$meta$teamComposition),length(comp$x$data[[1]]$x)==4L)
 stopifnot(!grepl('comp_axis_mode',output$select_comp$html,fixed=TRUE),!grepl('comp_group_selection',output$select_comp$html,fixed=TRUE))
 h<-jsonlite::fromJSON(output$plot_heat,simplifyVector=FALSE);t<-h$x$data[[1]]
 stopifnot(t$xgap==1,t$ygap==1,is.null(t$meta$teamSourceKey),length(t$z)==3L,length(t$z[[1]])==2L,
 t$colorscale[[1]][[2]]=='#337f87',t$colorscale[[2]][[2]]=='#f0efec',t$colorscale[[3]][[2]]=='#c77958',is.null(h$x$layout$yaxis$scaleanchor))
 dist<-jsonlite::fromJSON(output$plot_dist,simplifyVector=FALSE)
 stopifnot(all(vapply(dist$x$data,function(t)is.null(t$meta$teamSourceKey),logical(1))),is.null(dist$x$layout$meta$teamConditions))
 pca<-jsonlite::fromJSON(output$plot_pca,simplifyVector=FALSE)
 stopifnot(is.null(pca$x$layout$meta$teamConditions),pca$x$data[[1]]$marker$color %in% c('#337f87','rgba(51,127,135,1)','rgb(51,127,135)'))
 d<-dashboard$composition();stopifnot(!'Estimator'%in%names(d),nrow(d)==12L,all(d$Group%in%c('Healthy','SC-Pain')))
})
cat('PASS Classic guard: original sample composition percent normalization, original heatmap orientation/gaps/palette, original group palette, no Team condition/source metadata, new Team inputs have no effect.\n')
