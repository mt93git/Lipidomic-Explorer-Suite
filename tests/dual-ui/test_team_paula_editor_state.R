source('R/frontends/team/canvas_state.R')
e <- list(layout=list('title.text'='Custom title'),swapAxes=TRUE,palette='Gelato Days',greyHealthy=TRUE,traces=list(list(index=0,sourceKey='source:class×condition',fillColor='#FFCBE1',fillOpacity=1,points=FALSE,innerBox=TRUE)),annotations=list(list(text='Saved note',x=.5,y=.5,xref='paper',yref='paper',showarrow=FALSE,font=list(size=14,color='#000000'))))
stopifnot(identical(team_canvas_editor(e),e))
state <- list(version='1',libraryHidden=FALSE,nodes=list(list(id='plot_one',label='Plot',x=0,y=0,width=600,height=400,visual=list(editor=e))))
f <- tempfile();writeLines(team_canvas_json(team_canvas_validate(state)),f);r<-team_canvas_read(f);unlink(f)
stopifnot(identical(r$nodes[[1]]$visual$editor$swapAxes,TRUE),identical(r$nodes[[1]]$visual$editor$palette,'Gelato Days'),identical(r$nodes[[1]]$visual$editor$traces[[1]]$points,FALSE),identical(team_canvas_json(team_canvas_validate(state)),team_canvas_json(r)))
for(field in c('swapAxes','greyHealthy'))for(bad in list('true',1,list(TRUE),NA)) {x<-e;x[[field]]<-bad;stopifnot(inherits(try(team_canvas_editor(x),silent=TRUE),'try-error'))}
for(bad in c('javascript:alert(1)','<script>','Unknown','gelato days')){x<-e;x$palette<-bad;stopifnot(inherits(try(team_canvas_editor(x),silent=TRUE),'try-error'))}
x<-e;x$orientationScript<-'alert(1)';stopifnot(inherits(try(team_canvas_editor(x),silent=TRUE),'try-error'))
for(field in c('points','innerBox')) {x<-e;x$traces[[1]][[field]]<-'all';stopifnot(inherits(try(team_canvas_editor(x),silent=TRUE),'try-error'))}
cat('PASS orientation, palette, Healthy and violin controls survive validated R checkpoint; unsafe enums, unknown properties and nonboolean controls rejected\n')

gc<-list(features=list('Class A'),hiddenConditions=list('Pain'),panelOff=list('Class A'=list('Steady')),panelStyles=list('Class A'=list(colors=list('Healthy'='#123456'),points=FALSE,box=TRUE,lines=list('Healthy'='#654321'))))
stopifnot(identical(team_canvas_group_comparison(gc),gc))
team_plot_instance_validate<-function(x,id) {stopifnot(identical(id,paste0(x$id,'-comparisonPlot')));x}
state$nodes[[1]]$id<-'tcinstance_test-comparisonPlot';state$nodes[[1]]$instance<-list(id='tcinstance_test',source='group_comparison_tab-comparisonPlot',inputs=list())
state$nodes[[1]]$visual$groupComparison<-gc
f<-tempfile();writeLines(team_canvas_json(team_canvas_validate(state)),f);roundtrip<-team_canvas_read(f);unlink(f)
stopifnot(identical(roundtrip$nodes[[1]]$visual$groupComparison,gc))
for(change in list(function(x){x$features<-list('__proto__');x},function(x){x$panelOff<-NULL;x},function(x){x$panelStyles[[1]]$box<-NULL;x},function(x){x$features<-list('same','same');x},function(x){x$hiddenConditions<-rep(list('a'),101);x},function(x){x$panelStyles[[1]]$points<-'true';x},function(x){x$panelStyles[[1]]$colors[[1]]<-'javascript:red';x},function(x){x$panelStyles[[1]]$script<-'x';x},function(x){x$panelOff<-setNames(list(list('a')),'__proto__');x},function(x){x$features<-list(paste(rep('a',501),collapse=''));x}))stopifnot(inherits(try(team_canvas_group_comparison(change(gc)),silent=TRUE),'try-error'))
badowner<-state;badowner$nodes[[1]]$instance$source<-'results_dashboard-plot_heat';stopifnot(inherits(try(team_canvas_validate(badowner),silent=TRUE),'try-error'))
cat('PASS Group comparison presentation roundtrip; duplicate/oversized/unsafe unknown properties and prototype keys rejected\n')
