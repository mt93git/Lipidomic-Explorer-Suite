suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a)) b else a
lipidomic_plotly_event<-function(...)NULL
source('R/sample_metadata_import.R');source('R/results_dashboard.R')
labels<-paste0('C',seq_len(10),'(16:0)'); samples<-paste0('S',1:4)
mat<-outer(seq_len(10),seq_len(4),function(i,j)exp((i+j/3+(i*j*j)/50)/4));dimnames(mat)<-list(labels,samples)
df<-data.frame(Lipid_Name=labels,mat,check.names=FALSE)
metadata<-data.frame(FullName=samples,Group1=c('A','A','B',NA),Group2=c('X','Y','Y','Y'))
value<-function(x){force(x);function(...)x};data<-reactiveVal(df)
hub<-list(data_processed=data,all_metadata=value(metadata),preparation_audit=value(list(normalization='none',imputation='none')),preparation_dirty=value(FALSE),color_maps=value(list()),class_color_map=value(NULL))
server<-function(input,output,session){dashboard<-results_dashboard_module_server(input,output,session,hub)}
testServer(server,{
 session$setInputs(color_by='Group1',top_n=10L,heat_group_selection='__ALL__',comp_class_selection='__ALL__');session$flushReact()
 h<-dashboard$heatmap();stopifnot(identical(colnames(h$full_z),c('A','B','Unassigned')),sum(unique(h$df[c('Group','Group_n')])$Group_n)==4)
 z<-t(scale(t(log10(mat))));for(g in h$groups){ix<-which(ifelse(is.na(metadata$Group1),'Unassigned',metadata$Group1)==g);stopifnot(max(abs(h$full_z[,g]-rowMeans(z[rownames(h$full_z),ix,drop=FALSE])))<1e-12)}
 full<-h$full_z;limit<-h$lim;session$setInputs(heat_group_selection='["B"]');h2<-dashboard$heatmap();stopifnot(identical(colnames(h2$z),'B'),identical(h2$full_z,full),identical(h2$lim,limit),sum(h2$df$Visible)==10)
 session$setInputs(heat_group_selection='[]');empty<-dashboard$heatmap();stopifnot(ncol(empty$z)==0,all(!empty$df$Visible),identical(empty$full_z,full))
 session$setInputs(heat_group_selection='["B"]',heat_lipid_selection='["C1(16:0)","C3(16:0)"]');yl<-dashboard$heatmap();stopifnot(identical(colnames(yl$z),'B'),sum(yl$df$Visible)==2,all(yl$df$Group_visible[yl$df$Group=='B']),sum(yl$df$Lipid_visible)==6,identical(yl$full_z,full),identical(yl$lim,limit))
 session$setInputs(heat_lipid_selection='[]');yn<-dashboard$heatmap();stopifnot(nrow(yn$z)==0,ncol(yn$z)==1,all(!yn$df$Visible),identical(yn$full_z,full))
 session$setInputs(heat_group_selection='__ALL__',color_by='Group2');h3<-dashboard$heatmap();stopifnot(identical(colnames(h3$full_z),c('X','Y')),all(h3$df$Group_n[h3$df$Group=='X']==1))
 comp<-dashboard$composition();stopifnot(length(levels(comp$Class))==10,!any(as.character(comp$Class)=='Other classes'),nrow(comp)==40,all(comp$Selected))
 for(sample in samples){d<-comp[comp$Sample==sample,];stopifnot(abs(sum(d$Share_pct)-100)<1e-10,all(abs(d$Signal_sum-mat[match(as.character(d$Class),rd_class(labels)),sample])<1e-12))}
 original<-output$plot_comp;payload<-jsonlite::fromJSON(original,simplifyVector=FALSE);stopifnot(identical(payload$x$layout$barnorm,'percent'),endsWith(payload$x$layout$meta$teamClassSelection$inputId,'comp_class_selection'),length(payload$x$layout$meta$teamClassSelection$classes)==10,all(vapply(payload$x$data,function(x)!is.null(x$legendgroup),logical(1))));session$setInputs(comp_class_selection='["C1","C2"]');sub<-dashboard$composition();stopifnot(identical(output$plot_comp,original),sum(sub$Selected)==8,all(is.na(sub$Share_pct[!sub$Selected])),all(abs(tapply(sub$Share_pct,sub$Sample,sum,na.rm=TRUE)-100)<1e-10))
 session$setInputs(comp_class_selection='[]');none<-dashboard$composition();stopifnot(!any(none$Selected),all(is.na(none$Share_pct)),all(none$Denominator_selected==0))
 zdf<-df;zdf[,-1]<-0;data(zdf);session$flushReact();zero<-dashboard$composition();stopifnot(all(is.na(zero$Share_all_pct)),all(is.na(zero$Share_pct)))
})
cat('PASS grouped heatmap cohort-fixed z/rank/scale, exact classes, selection, empty and zero denominator\n')
