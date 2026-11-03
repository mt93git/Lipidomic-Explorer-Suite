suppressPackageStartupMessages(library(shiny))
`%||%`<-function(a,b)if(is.null(a))b else a
lipidomic_plotly_event<-function(...)NULL
source('R/sample_metadata_import.R');source('R/frontends/team/results_dashboard.R')
# TAG dominate top-N, while PC/LPC/PE still belong in the selectable catalog.
names<-c(paste0('TAG(',1:35,')'),'PC(16:0)','LPC(16:0)','PE(16:0)','PC O-(16:0)')
mat<-10^outer(seq_along(names),c(-1,-.2,.3,1),function(i,j)ifelse(i<=35,4+j*i/80,4+j/100))
dimnames(mat)<-list(names,paste0('S',1:4));df<-data.frame(Lipid_Name=names,mat,check.names=FALSE)
metadata<-data.frame(FullName=colnames(mat),Group1=c('A','A','B','B'),Group2='X')
value<-function(x){force(x);function(...)x}
hub<-list(data_processed=value(df),all_metadata=value(metadata),preparation_audit=value(list()),preparation_dirty=value(FALSE),color_maps=value(list()),class_color_map=value(NULL))
server<-function(input,output,session){dashboard<-results_dashboard_module_server(input,output,session,hub)}
testServer(server,{
 session$setInputs(color_by='Group1',top_n=30L,heat_lipid_selection='__ALL__');session$flushReact()
 h<-dashboard$heatmap();stopifnot(nrow(h$z)==30,nrow(h$full_z)==39,all(startsWith(rownames(h$z),'TAG(')),all(c('PC','LPC','PE','PC O-') %in% h$classes))
 html<-output$select_heat$html;stopifnot(grepl('data-class="PC"',html,fixed=TRUE),grepl('PC(16:0)',html,fixed=TRUE))
 lim<-h$lim;full<-h$full_z
 session$setInputs(heat_lipid_selection='["PC(16:0)"]');pc<-dashboard$heatmap();stopifnot(identical(rownames(pc$z),'PC(16:0)'),identical(pc$full_z,full),identical(pc$lim,lim))
 session$setInputs(heat_lipid_selection='__EVERY__');all<-dashboard$heatmap();stopifnot(nrow(all$z)==39,all(all$df$Lipid_visible),identical(all$lim,lim))
 session$setInputs(heat_group_selection='["B"]');one<-dashboard$heatmap();stopifnot(identical(one$z[,1],full[,'B']),identical(one$lim,lim))
 session$setInputs(heat_lipid_selection='[]');stopifnot(nrow(dashboard$heatmap()$z)==0)
 # Legacy checkpoint default remains the same top-N rows, not all 39.
 session$setInputs(heat_lipid_selection='__ALL__');stopifnot(identical(rownames(dashboard$heatmap()$z),rownames(h$z)))
})
cat('PASS full lipid catalog, low-variance explicit species, exact class labels, legacy top-N, all/none and stable cohort values/scale\n')
