source('R/frontends/team/canvas_state.R')
fails<-function(x)stopifnot(inherits(try(team_canvas_editor(x),silent=TRUE),'try-error'))
e<-list(layout=list('title.text'='Plain <b>text</b> & title'),traces=list(list(index=0,sourceKey='["violin","Healthy","healthy",123,0]',hidden=TRUE)),categoryLabels=list(list(axis='xaxis',sourceKeys=list('["violin","Healthy","healthy",123,0]'),values=list('Healthy','Steady','Pain'),labels=list('Control display','Steady','Pain'))))
v<-team_canvas_editor(e);stopifnot(identical(v,e))
n<-list(id='plot_one',label='Plot',x=0,y=0,width=600,height=400,visual=list(editor=e));state<-list(version='1',libraryHidden=FALSE,nodes=list(n));p<-tempfile();writeLines(team_canvas_json(team_canvas_validate(state)),p);r<-team_canvas_read(p);unlink(p);stopifnot(identical(team_canvas_json(team_canvas_validate(state)),team_canvas_json(r)))
for(change in list(
 function(x){x$traces[[1]]$hidden<-'yes';x},
 function(x){x$traces[[1]]$sourceKey<-NULL;x},
 function(x){x$traces[[1]]$sourceKey<-'';x},
 function(x){x$traces[[1]]$visible<-'legendonly';x},
 function(x){x$traces[[1]]$x<-list(0);x},
 function(x){x$traces[[1]]$y<-list(0);x},
 function(x){x$traces[[1]]$z<-list(0);x},
 function(x){x$categoryLabels[[1]]$axis<-'scene';x},
 function(x){x$categoryLabels[[1]]$sourceKeys<-NULL;x},
 function(x){x$categoryLabels[[1]]$sourceKeys<-list('');x},
 function(x){x$categoryLabels[[1]]$values<-list(1,2,3);x},
 function(x){x$categoryLabels[[1]]$labels<-list('only');x},
 function(x){x$categoryLabels[[1]]$values<-list('same','same','Pain');x},
 function(x){x$categoryLabels[[1]]$tickvals<-list(1,2);x},
 function(x){x$categoryLabels<-rep(x$categoryLabels,2);x},
 function(x){x$categoryLabels[[1]]$labels[[1]]<-paste(rep('a',501),collapse='');x}
))fails(change(e))
cat('PASS strict hidden-source identity and categorical aliases checkpoint roundtrip; raw visibility/scientific coordinates/numeric ticks/malformed aliases rejected\n')
