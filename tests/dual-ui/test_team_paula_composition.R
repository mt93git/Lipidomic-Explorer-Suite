suppressPackageStartupMessages(library(shiny))
`%||%`<-function(a,b)if(is.null(a))b else a
lipidomic_plotly_event<-function(...)NULL
source('R/sample_metadata_import.R');source('R/results_dashboard.R')
df<-data.frame(Lipid_Name=c('PC(1)','TAG(1)'),S1=c(9,1),S2=c(1,1),S3=c(2,8),S4=c(4,6),check.names=FALSE)
metadata<-data.frame(FullName=paste0('S',1:4),Group1=c('Healthy','Healthy','SC-Pain','SC-Pain'),Group2='X')
value<-function(x){force(x);function(...)x}
metadata_state<-reactiveVal(metadata)
hub<-list(data_processed=value(df),all_metadata=metadata_state,preparation_audit=value(list()),preparation_dirty=value(FALSE),color_maps=value(list()),class_color_map=value(NULL),team_compact_distribution=TRUE)
defaults<-rd_team_condition_colors(c('SC-Pain','Healthy_Control','SC-SteadyState'))
stopifnot(defaults[['Healthy_Control']]=='#7A7A7A',rd_team_condition_colors('Unhealthy')[[1]]!='#7A7A7A',identical(defaults[c('SC-SteadyState','SC-Pain')],rd_team_condition_colors(c('SC-SteadyState','SC-Pain','Healthy_Control'))[c('SC-SteadyState','SC-Pain')]),
 rd_team_condition_colors('Healthy_Control',c(Healthy_Control='#123456'))[[1]]=='#123456')
# Real shared hub exports automatic Set1 maps even with no active custom palette.
stopifnot(rd_team_resolved_condition_colors(c('Healthy','SC-Pain'),list(useCustomColors=FALSE,custom_colors=list(Healthy='#E41A1C')))[['Healthy']]=='#7A7A7A',
 rd_team_resolved_condition_colors(c('Healthy','SC-Pain'),list(useCustomColors=TRUE,custom_colors=list('Group1::Healthy'='#E41A1C')))[['Healthy']]=='#E41A1C',
 rd_team_resolved_condition_colors(c('Healthy','SC-Pain'),list(useCustomColors=TRUE,custom_colors=list('Group2::Healthy'='#E41A1C')))[['Healthy']]=='#7A7A7A')
hub$color_maps<-value(list(Group1=c(Healthy='#E41A1C','SC-Pain'='#377EB8')))
palette_state<-reactiveVal(list(useCustomColors=FALSE,custom_colors=list()))
hub$palette_settings<-palette_state
server<-function(input,output,session){dashboard<-results_dashboard_module_server(input,output,session,hub)}
testServer(server,{
 session$setInputs(color_by='Group1');session$flushReact()
 d<-dashboard$composition_team();pc<-subset(d$groups,Group=='Healthy' & Class=='PC')
 stopifnot(abs(pc$Mean_share_pct-70)<1e-10,abs(pc$SD_share_pct-stats::sd(c(90,50)))<1e-10,pc$N_samples==2L)
 p<-jsonlite::fromJSON(output$plot_comp,simplifyVector=FALSE)
 stopifnot(p$x$layout$meta$teamComposition$axisMode=='group',is.null(p$x$layout$barnorm),length(p$x$data)==2L,
 p$x$data[[1]]$meta$teamSourceKey=='team-composition:PC')
 html<-output$select_comp$html;stopifnot(grepl('comp_axis_mode',html),grepl('comp_group_selection',html))
 session$setInputs(comp_class_selection='["PC"]',comp_group_selection='["Healthy"]');session$flushReact()
 d<-dashboard$composition_team();stopifnot(all(d$samples$Share_pct[d$samples$Selected]==100),all(d$samples$Group_mean_share_pct[d$samples$Selected]==100),all(!d$samples$Group_visible[d$samples$Group=='SC-Pain']))
 p<-jsonlite::fromJSON(output$plot_comp,simplifyVector=FALSE)
 stopifnot(length(p$x$data[[1]]$x)==1L,p$x$data[[1]]$y[[1]]==100,!p$x$data[[2]]$visible)
 session$setInputs(comp_axis_mode='sample');session$flushReact()
 p<-jsonlite::fromJSON(output$plot_comp,simplifyVector=FALSE)
 stopifnot(p$x$layout$meta$teamComposition$axisMode=='sample',identical(unlist(p$x$data[[1]]$x),c('S1','S2')))
 # Execute the real download handler, not only the internal data contract.
 csv<-utils::read.csv(output$dl_comp,check.names=FALSE)
 stopifnot(nrow(csv)==8L,all(csv$Axis_mode=='sample'),all(csv$Group_mean_share_pct[csv$Selected]==100),
 all(!csv$Group_visible[csv$Group=='SC-Pain']),all(csv$Group_N_samples[csv$Selected]==2L),
 all(csv$Estimator=='Equal-weight mean of per-sample selected-class signal percentages'))
 # Distribution source identities distinguish samples while retaining condition groups.
 dist<-jsonlite::fromJSON(output$plot_dist,simplifyVector=FALSE)$x$data
 stopifnot(length(unique(vapply(dist,function(t)t$meta$teamSourceKey,character(1))))==4L,
 identical(dist[[1]]$legendgroup,dist[[2]]$legendgroup),dist[[1]]$fillcolor=='#7A7A7A')
 palette_state(list(useCustomColors=TRUE,custom_colors=list('Group1::Healthy'='#E41A1C')));session$flushReact()
 edited<-jsonlite::fromJSON(output$plot_dist,simplifyVector=FALSE)$x$data
 stopifnot(edited[[1]]$fillcolor=='#E41A1C')
 one<-metadata;one$Group1[2]<-'Solo';metadata_state(one)
 session$setInputs(comp_axis_mode='group',comp_group_selection='__ALL__',comp_class_selection='__ALL__');session$flushReact()
 single<-jsonlite::fromJSON(output$plot_comp,simplifyVector=FALSE)$x$data
 texts<-unlist(lapply(single,function(t)t$text))
 stopifnot(any(grepl('not defined (n < 2)',texts,fixed=TRUE)),!any(grepl('SD: NA',texts,fixed=TRUE)))
 # Export rows retain raw signals, selection flags, estimator, group n/SD/mean.
 stopifnot(all(c('Signal_sum','Selected','Group_visible','Estimator','Axis_mode','Group_mean_share_pct','Group_SD_share_pct','Group_N_samples') %in% names(d$samples)))
})
cat('PASS equal-weight sample-percentage group estimator (70%, not pooled83.33%), SD/n, selected-class renormalization, group/sample mode, group filtering, export contract, distribution sample identities.\n')
