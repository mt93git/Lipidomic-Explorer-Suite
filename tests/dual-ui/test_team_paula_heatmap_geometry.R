suppressPackageStartupMessages(library(shiny))
`%||%`<-function(a,b)if(is.null(a))b else a
lipidomic_plotly_event<-function(...)NULL
source('R/sample_metadata_import.R');source('R/results_dashboard.R')
# Dense fixture reproduces Paula's 474 by 2 dimensions, with asymmetric values.
z<-matrix(seq_len(948)/100-5,474,2,dimnames=list(paste0('PC(',1:474,')'),c('Healthy_Control','SC-Pain')))
v<-rd_team_heatmap_view(z,c(34L,32L))
stopifnot(!v$squares,identical(v$z,z),identical(dim(v$text),dim(z)),grepl('SC-Pain',v$text[474,2]))
# Full1362row catalog gets a tall bounded scroll target, never a420px strip.
large<-matrix(seq_len(2724),1362,2,dimnames=list(paste0('L',1:1362),c('A','B')))
lv<-rd_team_heatmap_view(large,c(34L,32L))
stopifnot(identical(lv$z,large),lv$width==800,lv$height==16499,
 (lv$height-lv$margin$t-lv$margin$b)/nrow(large)==12,
 length(lv$yaxis$tickvals)<=80,lv$xaxis$side=='top',lv$colorbar$lenmode=='pixels',lv$colorbar$len==160,lv$colorbar$y==1,lv$colorbar$yanchor=='top',lv$margin$t==110,lv$margin$b==45,identical(lv$yaxis$tickvals[c(1,length(lv$yaxis$tickvals))],rownames(large)[c(1,1362)]))
capped<-rd_team_heatmap_view(matrix(1,3000,2,dimnames=list(paste0('L',1:3000),c('A','B'))),c(34,32))
stopifnot(capped$height==24000,length(capped$yaxis$tickvals)<=80)
# Compact labels wrap safely in both orientations; source axis IDs stay raw.
labels<-matrix(1:32,16,2,dimnames=list(paste0('L',1:16),c('Healthy','SC-SteadyState<&>')))
wrapped<-rd_team_heatmap_view(labels,c(17L,34L))
stopifnot(identical(wrapped$x,colnames(labels)),
 identical(wrapped$xaxis$ticktext,unname(vapply(seq_len(2),function(i)rd_team_heat_tick(colnames(labels)[i],c(17L,34L)[i]),character(1)))),
 grepl('<br>',wrapped$xaxis$ticktext[2],fixed=TRUE),
 grepl('&lt;&amp;&gt;',wrapped$xaxis$ticktext[2],fixed=TRUE))
wrapped_small<-rd_team_heatmap_view(labels[1:3,,drop=FALSE],c(17L,34L))
stopifnot(!any(grepl('<br>',wrapped_small$yaxis$ticktext,fixed=TRUE)),grepl('&lt;&amp;&gt;',wrapped_small$yaxis$ticktext[2],fixed=TRUE))
small<-z[1:3,,drop=FALSE];v<-rd_team_heatmap_view(small,c(34L,32L))
stopifnot(abs((v$width-v$margin$l-v$margin$r)*diff(v$xaxis$domain)/nrow(small)-16)<1e-10,
 (v$height-v$margin$t-v$margin$b)/ncol(small)==16,v$colorbar$orientation=='h',v$margin$l==210,v$yaxis$title$standoff==20)
stopifnot(v$squares,identical(v$z,t(small)),identical(dim(v$text),c(2L,3L)),
 grepl('PC(3)',v$text[2,3],fixed=TRUE),grepl('SC-Pain',v$text[2,3]),
 identical(v$x,rownames(small)),identical(v$y,colnames(small)),v$yaxis$scaleanchor=='x',v$yaxis$scaleratio==1)
stopifnot(rd_team_heatmap_view(z[1:15,,drop=FALSE],c(34,32))$squares,
 !rd_team_heatmap_view(z[1:16,,drop=FALSE],c(34,32))$squares)
mat<-10^outer(seq_len(474),c(-1,-.2,.3,1),function(i,j)4+j*i/1000)
dimnames(mat)<-list(rownames(z),paste0('S',1:4))
df<-data.frame(Lipid_Name=rownames(mat),mat,check.names=FALSE)
metadata<-data.frame(FullName=colnames(mat),Group1=c('A','A','B','B'),Group2='X')
value<-function(x){force(x);function(...)x}
hub<-list(data_processed=value(df),all_metadata=value(metadata),preparation_audit=value(list()),preparation_dirty=value(FALSE),color_maps=value(list()),class_color_map=value(NULL),team_compact_distribution=TRUE)
server<-function(input,output,session){dashboard<-results_dashboard_module_server(input,output,session,hub)}
testServer(server,{
 session$setInputs(color_by='Group1',top_n=30L,heat_lipid_selection='__EVERY__');session$flushReact()
 full<-dashboard$heatmap();p<-jsonlite::fromJSON(output$plot_heat,simplifyVector=FALSE)
 trace<-p$x$data[[1]];stopifnot(trace$xgap==0,trace$ygap==0,
 trace$meta$teamSourceKey=='team-abundance-heatmap',
 is.numeric(trace$colorscale[[1]][[1]]),trace$colorscale[[1]][[2]]=='#0047AB',
 trace$colorscale[[2]][[2]]=='#FFFFFF',trace$colorscale[[3]][[2]]=='#FF0000',
 p$x$layout$meta$teamHeatmap$geometry=='rectangular',p$x$layout$meta$teamHeatmap$naturalWidth==800,
 p$x$layout$meta$teamHeatmap$naturalHeight==5843,p$x$layout$meta$teamHeatmap$rowCount==474)
 stopifnot(grepl('tds-heat-controls',output$select_heat$html,fixed=TRUE),grepl('474 selected',output$heat_selection_summary,fixed=TRUE))
 session$setInputs(heat_lipid_selection=jsonlite::toJSON(rownames(mat)[1:3]));session$flushReact()
 small<-dashboard$heatmap();p<-jsonlite::fromJSON(output$plot_heat,simplifyVector=FALSE)
 stopifnot(identical(small$lim,full$lim),identical(small$full_z,full$full_z),
 p$x$layout$meta$teamHeatmap$geometry=='square-horizontal',p$x$layout$yaxis$scaleanchor=='x',
 p$x$data[[1]]$meta$teamSourceKey=='team-abundance-heatmap',
 length(p$x$data[[1]]$z)==2L,length(p$x$data[[1]]$z[[1]])==3L)
 session$setInputs(heat_group_selection='["B"]');session$flushReact()
 p<-jsonlite::fromJSON(output$plot_heat,simplifyVector=FALSE)
 stopifnot(p$x$data[[1]]$ygap==0,p$x$data[[1]]$colorscale[[1]][[2]]=='#0047AB',
 length(p$x$data[[1]]$z)==1L,identical(dashboard$heatmap()$lim,full$lim))
})
cat('PASS: dense 474x2, small/threshold geometry, transposed hovers/IDs, numeric scale, stable full-cohort math and defaults across rerender. No browser test.\n')
