source('R/frontends/team/canvas_state.R')
fails<-function(f)stopifnot(inherits(tryCatch(f(),error=identity),'error'))
n<-list(id='plot_pca',label='PCA',x=0,y=0,width=600,height=400,visual=list())
s<-list(version='1',libraryHidden=FALSE,nodes=list(n))
old<-team_canvas_validate(s);stopifnot(is.null(old$document),is.null(old$nodes[[1]]$visual$editor))
s$nodes[[1]]$visual$editor<-list(layout=list('title.text'='Reviewed PCA','font.size'=18,'xaxis.showgrid'=TRUE,'legend.orientation'='h'),traces=list(list(index=0,sourceKey='["scatter","Group","",0]',name='Group',color='#123456',lineWidth=2,markerSize=8,opacity=0.5)),annotations=list(list(text='Note',x=0.5,y=0.6,xref='paper',yref='paper',showarrow=FALSE,font=list(size=14,color='#123456'))))
s$document<-list(version='1',layout='figure1',paper='letter',orientation='portrait',items=list(list(id='figure_a',nodeId='plot_pca',type='figure',x=10,y=10,width=300,height=300,caption='Panel A',z=0),list(id='note_a',type='text',x=10,y=320,width=500,height=60,text='Draft; review pending',fontSize=14,color='#123456',z=1)))
v<-team_canvas_validate(s);p<-tempfile();writeLines(team_canvas_json(v),p);stopifnot(identical(team_canvas_json(team_canvas_read(p)),team_canvas_json(v)));unlink(p)
for(change in list(
 function(x){x$nodes[[1]]$visual$editor$layout[['xaxis.range']]<-list(0,1);x},
 function(x){x$nodes[[1]]$visual$editor$traces[[1]]$x<-list(1,2);x},
 function(x){x$nodes[[1]]$visual$editor$traces[[1]]$index<-0.5;x},
 function(x){x$nodes[[1]]$visual$editor$traces[[1]]$sourceKey<-paste(rep('a',501),collapse='');x},
 function(x){x$nodes[[1]]$visual$editor$traces<-rep(x$nodes[[1]]$visual$editor$traces,2);x},
 function(x){x$nodes[[1]]$visual$editor$traces[[1]]$color<-'red';x},
 function(x){x$nodes[[1]]$visual$editor$annotations[[1]]$xref<-'x';x},
 function(x){x$nodes[[1]]$visual$editor$annotations[[1]]$showarrow<-TRUE;x},
 function(x){x$nodes[[1]]$visual$editor$annotations[[1]]$font$size<-73;x},
 function(x){x$document$items[[1]]$nodeId<-'missing';x},
 function(x){x$document$items[[1]]$caption<-paste(rep('a',1001),collapse='');x},
 function(x){x$document$items[[1]]$x<-400;x},
 function(x){x$document$items[[1]]$z<-Inf;x},
 function(x){x$document$items[[2]]$text<-paste(rep('a',2001),collapse='');x},
 function(x){x$document$items[[2]]$color<-'url(evil)';x},
 function(x){x$document$items[[2]]$nodeId<-'plot_pca';x},
 function(x){x$document$items<-rep(x$document$items,41);x},
 function(x){x$document$items[[2]]$id<-'figure_a';x},
 function(x){x$document$paper<-'poster';x}
))fails(function()team_canvas_validate(change(s)))
cat('Team editor/document validation, roundtrip, backwards compatibility and security checks passed.\n')
# Exercise the actual browser sanitizer, then validate its JSON server-side.
node_script<-tempfile(fileext='.cjs');payload<-tempfile(fileext='.json')
writeLines(c(
 "const fs=require('fs'),path=require('path');",
 "const {chromium}=require(path.resolve('tests/browser/ci/node_modules/playwright'));",
 "(async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent('<body></body>');await page.addScriptTag({path:path.resolve('www/team/js/plot_editor.js')});",
 "const result=await page.evaluate(()=>{const e=window.TeamPlotEditor,layout={};Object.keys(e.layoutSchema).forEach(k=>{const s=e.layoutSchema[k];layout[k]=s.type==='number'?(s.min+s.max)/2:s.type==='boolean'?true:s.type==='color'?'#123456':s.choices?s.choices[0]:'Reviewed text';});return e.sanitize({layout,traces:[{index:0,sourceKey:'series-key',name:'Group',color:'#123456',fillColor:'#aa2255',fillOpacity:0.6,lineColor:'#abcdef',lineWidth:2,markerSize:8,opacity:0.5}],annotations:[{text:'Literal <img> note',x:0.4,y:0.7,size:14,color:'#123456'}]});});fs.writeFileSync(process.argv[2],JSON.stringify(result));}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exit(1)});"
),node_script)
status<-system2('node',c(shQuote(node_script),shQuote(payload)))
stopifnot(status==0L,file.exists(payload))
editor<-jsonlite::read_json(payload,simplifyVector=FALSE)
checked<-team_canvas_editor(editor)
stopifnot(identical(team_canvas_json(checked),team_canvas_json(editor)))
unlink(c(node_script,payload))
cat('Real Playwright sanitizer output accepted unchanged by R editor validator.\n')

# Plain text references and escaped markup remain legitimate figure content.
s$document$items[[2]]$text<-'Reference: https://example.org; literal <img>'
s$nodes[[1]]$visual$editor$layout[['title.text']]<-'Reference https://example.org'
stopifnot(identical(team_canvas_validate(s)$document$items[[2]]$text,s$document$items[[2]]$text))

# Custom paper dimensions are exact in either orientation; legacy documents remain valid.
custom<-s;custom$document$paper<-'custom';custom$document$paperWidth<-978.261;custom$document$paperHeight<-1325.54;custom$document$showPageFurniture<-FALSE
custom$document$orientation<-'landscape'
custom$document$items[[1]]$x<-650
v<-team_canvas_validate(custom);stopifnot(identical(v$document$paperWidth,978.261),identical(v$document$paperHeight,1325.54),identical(v$document$showPageFurniture,FALSE))
p<-tempfile();writeLines(team_canvas_json(v),p);stopifnot(identical(team_canvas_json(team_canvas_read(p)),team_canvas_json(v)));unlink(p)
for (change in list(
  function(x){x$document$paperWidth<-99;x},
  function(x){x$document$paperHeight<-3001;x},
  function(x){x$document$paperWidth<-NULL;x},
  function(x){x$document$showPageFurniture<-'false';x},
  function(x){x$document$items[[1]]$x<-700;x},
  function(x){x$document$paper<-'letter';x}
)) fails(function()team_canvas_validate(change(custom)))
stopifnot(is.null(team_canvas_validate(s)$document$showPageFurniture))
cat('Custom paper bounds, orientation, furniture and legacy validation passed.\n')
scale_state <- list(layout=list(),traces=list(list(index=0,sourceKey='heatmap-key',scaleLow='#123456',scaleMid='#abcdef',scaleHigh='#fedcba')))
validated_scale <- team_canvas_editor(scale_state)
stopifnot(identical(validated_scale$traces[[1]]$scaleMid,'#abcdef'))
for (bad in list(list(index=0,scaleLow='#123456'),list(index=0,scaleLow='#123456',scaleMid='url(evil)',scaleHigh='#fedcba'),list(index=0,scaleLow='#123456',scaleMid='#abcdef',scaleHigh='#fedcba',zmin=0)))
  fails(function()team_canvas_editor(list(traces=list(bad))))
cat('Heatmap scale validates complete hex stops, rejects partial/hostile and scientific fields.\n')
scale_checkpoint <- s
scale_checkpoint$nodes[[1]]$visual$editor <- scale_state
scale_checkpoint <- team_canvas_validate(scale_checkpoint)
file_scale <- tempfile();writeLines(team_canvas_json(scale_checkpoint),file_scale)
scale_restored <- team_canvas_read(file_scale);unlink(file_scale)
stopifnot(identical(scale_restored$nodes[[1]]$visual$editor$traces[[1]]$scaleHigh,'#fedcba'))
cat('Heatmap scale checkpoint roundtrip passed.\n')

fill_state <- list(traces=list(list(index=0,sourceKey="violin",fillColor="#aa2255",fillOpacity=0.6)))
stopifnot(identical(team_canvas_editor(fill_state), fill_state))
for (bad in list("bad", -0.1, 1.1)) { x<-fill_state;x$traces[[1]]$fillOpacity<-bad;fails(function()team_canvas_editor(x)) }
cat("Fill controls checkpoint contract and invalid opacity validation passed.\n")
