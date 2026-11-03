source('R/frontends/team/canvas_state.R')
insight <- list(paragraph='A bounded interpretation.',context_label='PCA context',searched_at='2026-10-29T12:00:00Z',fingerprint=paste(rep('a',64),collapse=''),sources=list(list(pmid='12345678',title='A study',year='2025',url='https://pubmed.ncbi.nlm.nih.gov/12345678/')),stale=FALSE)
node <- list(id='plot_pca',label='PCA',x=0,y=0,width=700,height=500,visual=list(),insight=insight)
state <- list(version='1',libraryHidden=FALSE,nodes=list(node))
valid <- team_canvas_validate(state);stopifnot(identical(valid$nodes[[1]]$insight,insight))
path<-tempfile();writeLines(team_canvas_json(valid),path,useBytes=TRUE);stopifnot(identical(team_canvas_read(path)$nodes[[1]]$insight,insight));unlink(path)
state$nodes[[1]]$insight$stale<-TRUE;stopifnot(isTRUE(team_canvas_validate(state)$nodes[[1]]$insight$stale))
state$nodes[[1]]$insight$sources[[1]]$year<-'';stopifnot(identical(team_canvas_validate(state)$nodes[[1]]$insight$sources[[1]]$year,''))
state$nodes[[1]]$insight<-NULL;stopifnot(is.null(team_canvas_validate(state)$nodes[[1]]$insight))
fails<-function(f)stopifnot(inherits(try(f(),silent=TRUE),'try-error'))
for (change in list(
 function(x){x$paragraph<-strrep('a',1801);x},function(x){x$paragraph<-'<script>';x},
 function(x){x$context_label<-strrep('x',1001);x},function(x){x$searched_at<-strrep('x',81);x},
 function(x){x$fingerprint<-strrep('z',64);x},function(x){x$stale<-'false';x},
 function(x){x$sources<-rep(x$sources,4);x},function(x){x$sources[[1]]$url<-'https://pubmed.ncbi.nlm.nih.gov/12345678/?q=x';x},
 function(x){x$sources[[1]]$url<-'https://pubmed.ncbi.nlm.nih.gov.evil/12345678/';x},function(x){x$sources[[1]]$pmid<-'0001';x},
 function(x){x$sources[[1]]$year<-'20x5';x},function(x){x$sources[[1]]$title<-'<img>';x},function(x){x$unexpected<-1;x}
)) {bad<-state;bad$nodes[[1]]$insight<-change(insight);fails(function()team_canvas_validate(bad))}
ill<-state;ill$nodes[[1]]<-list(kind='illustration',assetVersion='1',id='illustration_a',assetId='neutrophil',label='Cell',x=0,y=0,width=320,height=260,visual=list(),color='#112233',insight=insight);fails(function()team_canvas_validate(ill))
cat('PASS: insight validation, hostile sources and checkpoint roundtrip\n')
