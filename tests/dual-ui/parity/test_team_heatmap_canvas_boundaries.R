# No app launch, install or private data: actual shared source + Team-only clone.
suppressPackageStartupMessages({library(shiny);library(bslib)})
source('R/frontends/team/heatmap_scale_adapter.R');source('R/frontends/team/heatmap_canvas_boundaries_adapter.R')
e<-new.env(parent=globalenv());sys.source('R/modules/4_heatmap_module.R',e)
original<-e$heatmap_server;before<-serialize(body(original),NULL)
adapted<-team_heatmap_canvas_boundaries_adapter(original)
stopifnot(identical(before,serialize(body(original),NULL)))
collect<-function(node,predicate){result<-list();walk<-function(x){if(predicate(x))result[[length(result)+1L]]<<-x;if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]]))walk(x[[i]])};walk(node);result}
# Every scientific/reactive/plot/download expression is byte-for-byte identical.
scientific<-function(fn)collect(body(fn),function(x)is.call(x)&&is.symbol(x[[1]])&&as.character(x[[1]])%in%c('reactive','renderPlot','renderPlotly','downloadHandler','observeEvent','eventReactive'))
stopifnot(identical(scientific(original),scientific(adapted)))
scaled<-team_heatmap_scale_adapter(original);combined<-team_heatmap_canvas_boundaries_adapter(scaled)
stopifnot(identical(scientific(scaled),scientific(combined)))
uis<-collect(body(adapted),function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&is.call(x[[2]])&&identical(x[[2]][[1]],as.name('$'))&&identical(x[[2]][[2]],as.name('output'))&&is.call(x[[3]])&&identical(x[[3]][[1]],as.name('renderUI')))
names(uis)<-vapply(uis,function(x)as.character(x[[2]][[3]]),character(1))
ids<-c('unfiltered_heatmap_container','filtered_heatmap_container')
original_uis<-collect(body(original),function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&is.call(x[[2]])&&identical(x[[2]][[1]],as.name('$'))&&identical(x[[2]][[2]],as.name('output'))&&is.call(x[[3]])&&identical(x[[3]][[1]],as.name('renderUI')))
names(original_uis)<-vapply(original_uis,function(x)as.character(x[[2]][[3]]),character(1))
ui_parts<-function(expr,env,filtered){expr[[length(expr)]]<-if(filtered)quote(list(quick=as.character(quick_access),script=as.character(script_tag)))else quote(list(quick=as.character(quick_access),script=NULL));eval(call('function',pairlist(),expr),env)()}
controls_reference<-list()
for(avg in c(FALSE,TRUE))for(sd in c(FALSE,TRUE))for(id in ids){
 env<-new.env(parent=globalenv());env$ns<-NS('heatmap_barchart_tab');env$input<-list(condenseRows=avg,condenseRowsSD=sd);env$shared_data<-list(de_contrast_info=function()NULL)
 html<-function(name)as.character(eval(call('function',pairlist(),uis[[name]][[3]][[2]]),env)())
 controls<-html(id);a<-html(paste0(id,'_average'));s<-html(paste0(id,'_sd'))
 stopifnot(!grepl('>\\s*CSV\\s*<',paste0(a,s)),grepl('>\\s*Data\\s*<',paste0(a,s)))
 filtered<-id=='filtered_heatmap_container'
 original_parts<-ui_parts(original_uis[[id]][[3]][[2]],env,filtered)
 adapted_parts<-ui_parts(uis[[id]][[3]][[2]],env,filtered)
 stopifnot(identical(original_parts,adapted_parts))
 if(is.null(controls_reference[[id]]))controls_reference[[id]]<-adapted_parts else stopifnot(identical(controls_reference[[id]],adapted_parts))
 if(filtered){stopifnot(grepl('typeof window.updateFilteredHeatmapTabTitle',adapted_parts$script,fixed=TRUE),grepl('window.updateFilteredHeatmapTabTitle("")',adapted_parts$script,fixed=TRUE),!grepl('heatmapPlot|filteredHeatmapPlot|querySelector|document\\.',adapted_parts$script))}
 nplot<-function(x)length(regmatches(x,gregexpr('class="shiny-plot-output',x,fixed=TRUE))[[1]])
 stopifnot(nplot(controls)==0L,nplot(a)==as.integer(avg||(!avg&&!sd)),nplot(s)==as.integer(sd),grepl('Quick Access',controls),!grepl('Quick Access',a),!grepl('Quick Access',s))
}
# Fail closed on renderer/body/branch/plot-ID drift and duplicate application.
reject<-function(fn)stopifnot(inherits(try(team_heatmap_canvas_boundaries_adapter(fn),silent=TRUE),'try-error'))
mutate<-function(fn,old,new){walk<-function(x){if(identical(x,old))return(new);if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]]))x[[i]]<-walk(x[[i]]);x};body(fn)<-walk(body(fn));fn}
reject(adapted)
reject(mutate(original,'CSV','Changed label'))
reject(mutate(original,'downloadHeatmapCSV','driftedDownload'))
reject(mutate(original,quote(tagList(quick_access,cards)),quote(tagList(cards))))
reject(mutate(original,quote(show_sd<-isTRUE(input$condenseRowsSD)),quote(show_sd<-FALSE))) # original condition shape is part of contract below
reject(mutate(original,quote(plotOutput(ns('heatmapSDPlot'),height='750px')),quote(plotOutput(ns('driftedPlot'),height='750px'))))
reject(mutate(original,quote(renderUI),quote(driftedRenderUI)))
# Flag-dependent controls/scripts cannot be separated safely without review.
reject(mutate(original,quote(tagList(quick_access,cards)),quote(tagList(quick_access,cards,show_sd))))
flag_dependent<-original
walk_flags<-function(x){if(is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name('quick_access')))x[[3]]<-substitute({if(show_sd)NULL;ORIGINAL},list(ORIGINAL=x[[3]])) else if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]]))x[[i]]<-walk_flags(x[[i]]);x}
body(flag_dependent)<-walk_flags(body(flag_dependent));reject(flag_dependent)
script_dependent<-original
walk_script<-function(x){if(is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name('script_tag')))x[[3]]<-substitute({if(show_avg)NULL;ORIGINAL},list(ORIGINAL=x[[3]])) else if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]]))x[[i]]<-walk_script(x[[i]]);x}
body(script_dependent)<-walk_script(body(script_dependent));reject(script_dependent)
reordered<-original
walk_order<-function(x){if(is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],quote(output$unfiltered_heatmap_container))){parts<-as.list(x[[3]][[2]]);parts[c(3L,4L)]<-parts[c(4L,3L)];x[[3]][[2]]<-as.call(parts);return(x)};if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]]))x[[i]]<-walk_order(x[[i]]);x}
body(reordered)<-walk_order(body(reordered));reject(reordered)
# A named non-expression first argument and non-braced body must fail closed.
change_renderer<-function(fn,kind){walk<-function(x){if(is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],quote(output$unfiltered_heatmap_container))){x[[3]]<-if(kind=='height')substitute(renderUI(height={400},expr=BODY),list(BODY=x[[3]][[2]]))else quote(renderUI(NULL));return(x)};if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]]))x[[i]]<-walk(x[[i]]);x};body(fn)<-walk(body(fn));fn}
reject(change_renderer(original,'height'));reject(change_renderer(original,'body'))
cat('PASS: sibling heatmap UI; all4 switch combinations; source Classic and scientific/plot/CSV expressions unchanged; AST drift rejected\n')
proof<-Sys.getenv('HEATMAP_BOUNDARY_PROOF_JSON')
if(nzchar(proof))jsonlite::write_json(list(status='PASS',classic_body_sha256=digest::digest(body(original),algo='sha256'),classic_body_unchanged=identical(before,serialize(body(original),NULL)),scientific_plot_csv_expressions=length(scientific(original)),scientific_plot_csv_sha256=digest::digest(scientific(original),algo='sha256'),adapted_scientific_plot_csv_sha256=digest::digest(scientific(adapted),algo='sha256'),all_four_switch_combinations=TRUE,quick_access_and_script_identical_all_four=TRUE,script_guarded_no_plot_dependency=TRUE,scale_adapter_composition=TRUE),proof,auto_unbox=TRUE,pretty=TRUE)
