// Isolated fixture: preview cannot promote a live, stale, unsafe or changed figure to export.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {chromium} = require('../browser/ci/node_modules/playwright');
(async () => {
  const markup = execFileSync('Rscript',['--vanilla','-e','source("R/frontends/team/canvas.R"); cat(as.character(team_canvas_ui()))'],{encoding:'utf8'});
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1200,height:1000}});
    const errors = []; page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<!doctype html><html lang="en"><body>'+markup+'</body></html>');
    await page.addStyleTag({path:path.resolve('www/team/css/canvas_preview.css')});
    await page.evaluate(() => {
      window.busyEvents=[];window.TeamBusy={begin:label=>(busyEvents.push(['begin',label]),'token'),end:token=>busyEvents.push(['end',token]),fail:(token,msg)=>busyEvents.push(['fail',token,msg])};window.shinyEvents={};window.jQuery=()=>({on:function(names,fn){names.split(' ').forEach(name=>shinyEvents[name]=fn);return this}});
      window.previewFixture={state:{version:'1',libraryHidden:false,nodes:[]},ready:true,archived:0};
      window.captureCount=0;window.TeamCanvas={previewState:()=>{captureCount++;return structuredClone(window.previewFixture);}};
      window.pdfCalls=[]; window.pageText=[]; const fillText=CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText=function(t,...args){pageText.push(String(t));return fillText.call(this,t,...args);};
      window.jspdf={jsPDF:function (options) {
        pdfCalls.push(['new',options]); this.setTextColor=this.setFontSize=()=>{};
        this.text=(...args)=>pdfCalls.push(['text',...args]); this.splitTextToSize=x=>[x];
        this.addImage=(...args)=>pdfCalls.push(['image',...args.slice(1)]); this.addPage=(...args)=>pdfCalls.push(['page',...args]);
        this.save=name=>pdfCalls.push(['save',name]);
      }};
      window.snapshotURL='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#276e6c"/></svg>');
      window.addFinished=(count=1)=>{previewFixture.state.nodes=Array.from({length:count},(_,i)=>({id:'p'+i,label:'Finished plot '+(i+1),x:50+i*650,y:40,width:620,height:500,visual:{},finished:{url:snapshotURL,createdAt:'2026-10-28T15:00:00Z',stale:false}}));};
    });
    await page.addScriptTag({path:path.resolve('www/team/js/canvas_preview.js')});
    const previewTab=page.getByRole('tab',{name:'Print preview'}), workspaceTab=page.getByRole('tab',{name:'Workspace',exact:true});
    if(process.env.TEAM_LIVE_GRADIENT_DATAURL){
      const actual=fs.readFileSync(process.env.TEAM_LIVE_GRADIENT_DATAURL,'utf8').trim();
      await page.evaluate(url=>{addFinished(1);previewFixture.state.nodes[0].finished.url=url;},actual);
      await previewTab.click();
      assert.equal(await page.locator('.tc-preview-print').isEnabled(),true,'actual Plotly gradient snapshot is previewable');
      await page.evaluate(()=>{previewFixture.state.nodes=[];});await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    }

    await workspaceTab.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await previewTab.getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#tc-workspace-panel').isVisible(),false);
    assert.equal(await page.locator('.tc-preview-print').isEnabled(),true);
    assert.equal(await page.locator('.tc-paper').count(),1,'blank page supports primitives before adding plots');
    await page.keyboard.press('Home'); assert.equal(await workspaceTab.getAttribute('aria-selected'),'true');
    await page.keyboard.press('End'); assert.equal(await previewTab.getAttribute('aria-selected'),'true');
    await page.evaluate(()=>{addFinished(2); previewFixture.state.nodes[1].finished=null;});
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    assert.match(await page.locator('.tc-preview-status').textContent(),/Finish live plots first/);
    assert.equal(await page.locator('.tc-paper').count(),0);
    await page.evaluate(()=>{addFinished(2);previewFixture.state.nodes[1].finished.stale=true;});
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    assert.match(await page.locator('.tc-preview-status').textContent(),/needs review/);
    assert.equal(await page.locator('.tc-preview-pdf').isDisabled(),true);
    await page.evaluate(()=>{addFinished(2);previewFixture.ready=false;previewFixture.message='The current plot is still updating.';});
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    assert.match(await page.locator('.tc-preview-status').textContent(),/still updating/);
    await page.locator('.tc-page-settings>summary').click();
    await page.getByLabel('Layout',{exact:true}).selectOption('pages');
    await page.evaluate(()=>{previewFixture.ready=true;addFinished(2);previewFixture.state.nodes[0].label='<img src=x onerror="window.previewInjected=true"> α';});
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    assert.equal(await page.locator('.tc-paper').count(),2);
    assert.equal(await page.locator('.tc-paper figure img').count(),2);
    assert.equal(await page.locator('.tc-paper figcaption img').count(),0);
    assert.equal(await page.evaluate(()=>!!window.previewInjected),false);
    assert.equal(await page.locator('.tc-preview-pdf').isEnabled(),true);
    // Hidden preview must not validate snapshots on workspace mutations or Shiny traffic.
    await workspaceTab.click();
    await page.evaluate(()=>{captureCount=0;const board=document.querySelector('.tc-board');for(let i=0;i<20;i++){board.style.width=(1400+i)+'px';board.classList.toggle('test-dirty');}previewFixture.state.nodes[0].finished.stale=true;shinyEvents['shiny:value']();shinyEvents['shiny:idle']();});
    await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>captureCount),0);
    await previewTab.click();assert.match(await page.locator('.tc-preview-status').textContent(),/needs review/);assert.equal(await page.locator('.tc-preview-pdf').isDisabled(),true);
    await page.evaluate(()=>{previewFixture.state.nodes[0].finished.stale=false;});await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    assert.equal(await page.locator('.tc-preview-pdf').isEnabled(),true);

    const sheets = await page.locator('.tc-paper').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height,overflow:n.scrollWidth>n.clientWidth+1};}));
    assert.ok(sheets.every(s=>Math.abs(s.w/s.h-612/792)<.01&&!s.overflow));
    await page.locator('.tc-preview-pdf').click();
    await page.waitForFunction(()=>pdfCalls.some(c=>c[0]==='save'));
    assert.equal(await page.evaluate(()=>pdfCalls.filter(c=>c[0]==='image').length),2);
    assert.equal(await page.evaluate(()=>pdfCalls.filter(c=>c[0]==='page').length),1);
    assert.ok((await page.evaluate(()=>pdfCalls.filter(c=>c[0]==='image').every(c=>c.slice(2,6).every(Number.isFinite)))));
    // Free layout uses page-point coordinates and persists edits without moving workspace nodes.
    await page.evaluate(() => { window.savedDocument=null; TeamCanvas.getDocument=()=>savedDocument; TeamCanvas.setDocument=value=>{savedDocument=structuredClone(value);}; });
    await page.getByLabel('Layout',{exact:true}).selectOption('free');
    assert.equal(await page.locator('.tc-paper figure').count(),2);
    await page.locator('.tc-paper figure').first().click();
    // An input followed by change with the same normalized value must not
    // commit twice; the live value is already persisted by input.
    await page.evaluate(()=>{window.documentCommits=0;const original=TeamCanvas.setDocument;TeamCanvas.setDocument=function(value){documentCommits++;return original(value);};});
    await page.getByLabel('X (pt)',{exact:true}).fill('125');
    assert.equal(await page.evaluate(()=>savedDocument.items[0].x),125,'input immediately persists final value');
    assert.ok(Math.abs(await page.locator('.tc-paper figure').first().evaluate(el=>parseFloat(el.style.left))-125/612*100)<0.001,'input updates visible geometry immediately');
    const commitsAfterInput=await page.evaluate(()=>documentCommits);
    await page.getByLabel('X (pt)',{exact:true}).dispatchEvent('change');
    assert.equal(await page.evaluate(()=>documentCommits),commitsAfterInput,'unchanged change must not duplicate persistence');
    // A preparation update schedules a full refresh while the field has an uncommitted draft.
    await page.getByLabel('X (pt)',{exact:true}).focus();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:true,pending:0,running:0,revision:'focused'}})));
    await page.waitForTimeout(150);
    assert.equal(await page.getByLabel('X (pt)',{exact:true}).inputValue(),'125');
    assert.equal(await page.getByLabel('X (pt)',{exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.evaluate(()=>{shinyEvents['shiny:value']();shinyEvents['shiny:idle']();});
    await page.getByLabel('X (pt)',{exact:true}).dispatchEvent('change');
    assert.equal(await page.evaluate(()=>savedDocument.items[0].x),125);
    assert.equal(await page.evaluate(()=>previewFixture.state.nodes[0].x),50);
    await page.getByLabel('X (pt)',{exact:true}).blur(); await page.waitForTimeout(20);
    await page.getByLabel('Caption',{exact:true}).fill('');
    await page.getByLabel('Caption',{exact:true}).dispatchEvent('change');
    assert.equal(await page.locator('.tc-paper figure').first().locator('figcaption').count(),0);
    await page.getByLabel('Caption',{exact:true}).blur(); await page.waitForTimeout(20);
    await page.locator('.tc-paper figure').first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(()=>savedDocument.items[0].x),126);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(()=>savedDocument.items[0].x),127);
    await page.getByLabel('Width (pt)',{exact:true}).fill('9999');
    await page.getByLabel('Width (pt)',{exact:true}).dispatchEvent('change');
    assert.equal(await page.evaluate(()=>savedDocument.items[0].width),612);
    assert.equal(await page.getByLabel('Width (pt)',{exact:true}).inputValue(),'612','change displays clamped value');
    assert.equal(await page.evaluate(()=>savedDocument.items[0].x),0);
    // An unrelated Shiny value arriving during a pointer drag must not detach its item.
    await page.getByLabel('Layout',{exact:true}).selectOption('free');
    const dragInitialX=await page.evaluate(()=>savedDocument.items[1].x);
    const box=await page.locator('.tc-paper figure').nth(1).boundingBox();
    await page.mouse.move(box.x+20,box.y+30); await page.mouse.down();
    await page.mouse.move(box.x+35,box.y+40);
    await page.evaluate(()=>{shinyEvents['shiny:value']();shinyEvents['shiny:idle']();});
    await page.mouse.move(box.x+55,box.y+50); await page.mouse.up();
    assert.ok(await page.evaluate(x=>savedDocument.items[1].x>x,dragInitialX));
    // Selecting another figure while an inspector draft is focused changes the edited item.
    await page.locator('.tc-paper figure').first().click();
    await page.getByLabel('X (pt)',{exact:true}).focus();
    await page.evaluate(()=>{shinyEvents['shiny:busy']();shinyEvents['shiny:value']();});
    await page.locator('.tc-paper figure').nth(1).click();
    await page.evaluate(()=>shinyEvents['shiny:idle']());
    const firstX=await page.evaluate(()=>savedDocument.items[0].x);
    await page.getByLabel('X (pt)',{exact:true}).fill('190');
    await page.getByLabel('X (pt)',{exact:true}).dispatchEvent('change');
    assert.equal(await page.evaluate(()=>savedDocument.items[0].x),firstX);
    assert.equal(await page.evaluate(()=>savedDocument.items[1].x),190);
    const desktopBoxes=await page.evaluate(()=>({inspector:document.querySelector('.tc-free-inspector').getBoundingClientRect().x,paper:document.querySelector('.tc-preview-pages').getBoundingClientRect().x}));assert.ok(desktopBoxes.inspector<desktopBoxes.paper,'inspector appears left of preview');
    await page.getByRole('button',{name:'Add text'}).click();
    await page.getByLabel('Text',{exact:true}).fill('A < B & C');
    await page.evaluate(()=>{shinyEvents['shiny:value']();shinyEvents['shiny:idle']();});
    await page.getByLabel('Text',{exact:true}).dispatchEvent('change');
    assert.equal(await page.locator('.tc-paper-text').textContent(),'A < B & C');
    assert.equal(await page.getByLabel('Text',{exact:true}).evaluate(el=>el.tagName),'TEXTAREA');
    assert.equal(await page.getByLabel('Font size (pt)',{exact:true}).count(),1);
    assert.equal(await page.evaluate(()=>savedDocument.items.find(i=>i.type==='text').text),'A < B & C');
    // Undo while the edited field still has focus: the input commit already
    // populated history, without requiring a blur/change event.
    await page.getByRole('button',{name:'Undo',exact:true}).dispatchEvent('click');
    assert.equal(await page.locator('.tc-paper-text').textContent(),'Text');
    await page.getByRole('button',{name:'Redo',exact:true}).dispatchEvent('click');
    assert.equal(await page.locator('.tc-paper-text').textContent(),'A < B & C');
    await page.getByLabel('Text',{exact:true}).blur();
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    assert.equal(await page.locator('.tc-paper-text').textContent(),'Text');
    await page.getByRole('button',{name:'Redo',exact:true}).click();
    assert.equal(await page.locator('.tc-paper-text').textContent(),'A < B & C');
    // Double click opens a plain-text draft; Escape cancels, blur commits once.
    await page.locator('.tc-paper figure').filter({has:page.locator('.tc-paper-text')}).dblclick();
    assert.equal(await page.getByLabel('Text',{exact:true}).getAttribute('data-draft'),'1');await page.getByLabel('Text',{exact:true}).fill('Discard <draft>');await page.getByLabel('Text',{exact:true}).press('Escape');assert.equal(await page.locator('.tc-paper-text').textContent(),'A < B & C');
    await page.locator('.tc-paper figure').filter({has:page.locator('.tc-paper-text')}).dblclick();await page.getByLabel('Text',{exact:true}).fill('Committed <text>');await page.getByLabel('Text',{exact:true}).blur();assert.equal(await page.locator('.tc-paper-text').textContent(),'Committed <text>');await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.locator('.tc-paper-text').textContent(),'A < B & C');
    await page.evaluate(()=>{previewFixture.state.nodes.forEach(n=>{n.finished.url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><clipPath id="shared"><rect width="100" height="100"/></clipPath></defs><path id="shape" clip-path="url(#shared)" d="M0 0L100 100"/></svg>');});});
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    const svgDownload=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download SVG'}).click();
    const svg=await svgDownload; const svgPath=await svg.path(); const svgText=fs.readFileSync(svgPath,'utf8');
    assert.match(svgText,/A &lt; B &amp; C/); assert.match(svgText,/viewBox="0 0 612 792"/);
    assert.match(svgText,/id="embedded0-shared"/); assert.match(svgText,/id="embedded1-shared"/);
    assert.match(svgText,/url\(#embedded0-shared\)/); assert.match(svgText,/url\(#embedded1-shared\)/);
    assert.doesNotMatch(svgText,/<image[^>]+https?:/); assert.match(svgText,/<path/);
    assert.equal(await page.locator('.tc-preview-download-fallback').count(),1);await page.evaluate(()=>{shinyEvents['shiny:value']();window.dispatchEvent(new Event('team-canvas-changed'));});await page.waitForTimeout(120);assert.equal(await page.locator('.tc-preview-download-fallback').count(),1,'automatic reconciliation must preserve download fallback');
    await page.getByLabel('Paper',{exact:true}).selectOption('custom');
    await page.getByLabel('Page width (pt)').fill('978.261'); await page.getByLabel('Page width (pt)').dispatchEvent('change');
    await page.getByLabel('Page height (pt)').fill('1325.54'); await page.getByLabel('Page height (pt)').dispatchEvent('change');
    assert.deepEqual(await page.evaluate(()=>[savedDocument.paper,savedDocument.paperWidth,savedDocument.paperHeight]),['custom',978.261,1325.54]);
    assert.equal(await page.getByLabel('Show page header and footer').isChecked(),true);
    await page.getByLabel('Show page header and footer').uncheck();
    assert.equal(await page.evaluate(()=>savedDocument.showPageFurniture),false);
    assert.equal(await page.locator('.tc-paper-heading').count(),0);
    await page.evaluate(()=>window.dispatchEvent(new Event('team-document-restored')));
    assert.equal(await page.getByLabel('Show page header and footer').isChecked(),false);
    const customSvgDownload=page.waitForEvent('download'); await page.getByRole('button',{name:'Download SVG'}).click();
    const customSvg=await customSvgDownload; const customSvgText=fs.readFileSync(await customSvg.path(),'utf8'); assert.match(customSvgText,/viewBox="0 0 978.261 1325.54"/); assert.doesNotMatch(customSvgText,/FIGURE CANVAS|Finished figure snapshots/);
    await page.evaluate(()=>pageText=[]); await page.locator('.tc-preview-pdf').click(); await page.waitForFunction(()=>pdfCalls.filter(c=>c[0]==='save').length>=2);
    assert.equal(await page.evaluate(()=>pageText.some(t=>/FIGURE CANVAS|Finished figure snapshots/.test(t))),false);
    assert.deepEqual(await page.evaluate(()=>pdfCalls.filter(c=>c[0]==='new').at(-1)[1].format),[978.261,1325.54]);
    await page.getByLabel('Page width (pt)').fill('99'); await page.getByLabel('Page width (pt)').dispatchEvent('change');
    assert.match(await page.locator('.tc-preview-status').textContent(),/between 100 and 3000/); assert.equal(await page.locator('.tc-preview-pdf').isDisabled(),true);
    assert.equal(await page.evaluate(()=>savedDocument.paperWidth),978.261);
    await page.getByLabel('Page width (pt)').fill('978.261'); await page.getByLabel('Page width (pt)').dispatchEvent('change');
    await page.getByLabel('Show page header and footer').check();
    assert.equal(await page.locator('.tc-paper-heading').count(),1);
    await page.getByLabel('Paper',{exact:true}).selectOption('letter');
    await page.getByLabel('Layout',{exact:true}).selectOption('arrangement');
    assert.equal(await page.locator('.tc-paper').count(),1);
    assert.equal(await page.locator('.tc-paper figure').count(),2);
    const positions=await page.locator('.tc-paper figure').evaluateAll(nodes=>nodes.map(n=>parseFloat(n.style.left)));
    assert.ok(positions[1]>positions[0]);
    await page.getByLabel('Paper',{exact:true}).selectOption('a4');
    await page.getByLabel('Orientation',{exact:true}).selectOption('landscape');
    const ratio=await page.locator('.tc-paper').evaluate(n=>{let r=n.getBoundingClientRect();return r.width/r.height;});
    assert.ok(Math.abs(ratio-841.89/595.28)<.01);
    // Figure 1 is a draft layout: only a real finished 2D PCA can populate B.
    await page.getByLabel('Paper',{exact:true}).selectOption('letter');
    await page.getByLabel('Orientation',{exact:true}).selectOption('portrait');
    await page.getByLabel('Layout',{exact:true}).selectOption('figure1');
    assert.equal(await page.locator('.tc-paper figure').count(),10);
    assert.equal(await page.locator('.tc-paper-placeholder').count(),10);
    assert.equal(await page.locator('.tc-paper img').count(),0);
    assert.match(await page.locator('.tc-paper-heading').textContent(),/DRAFT.*PENDING/);
    assert.match(await page.locator('.tc-paper-draft-legend').textContent(),/Log2FC.*pending/);
    assert.match(await page.locator('.tc-paper-footer').textContent(),/Descriptive draft · review scientific settings before publication/);
    await page.evaluate(()=>{previewFixture.state.nodes[0].id='results_dashboard-plot_pca';window.pdfCalls=[];window.drawnText=[];window.originalFillText=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){drawnText.push(text);return originalFillText.call(this,text,...args);};});
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    assert.equal(await page.locator('.tc-paper-placeholder').count(),9);
    assert.equal(await page.locator('.tc-paper img').count(),1);
    const draftCaptions=await page.locator('.tc-paper figcaption').allTextContents();
    for(const label of ['A / Study workflow','B / PCA','C / LPA','C / LPC','C / LPI','C / CL','D / AA (Sn2)','D / PE 18:0_20:4','D / PC 16:0_20:4','D / PC 18:0_20:4']) assert.ok(draftCaptions.some(text=>text.includes(label)),label);
    await page.locator('.tc-preview-pdf').click();
    await page.waitForFunction(()=>pdfCalls.some(c=>c[0]==='save'&&c[1]==='figure-1-draft.pdf'));
    assert.equal(await page.evaluate(()=>drawnText.filter(text=>text==='PENDING').length),9);
    assert.ok(await page.evaluate(()=>drawnText.some(text=>text.includes('DRAFT')&&text.includes('model pending'))));
    assert.ok(await page.evaluate(()=>drawnText.some(text=>text.includes('Descriptive draft · review scientific settings before publication'))));
    // A finished schematic belongs to panel A, never to a measured-data panel.
    await page.evaluate(()=>{Object.assign(previewFixture.state.nodes[1],{kind:'illustration',assetId:'lc-ms',assetVersion:'1',label:'LC–MS workflow'});pdfCalls=[];drawnText=[];});
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    assert.equal(await page.locator('.tc-paper-placeholder').count(),8);
    assert.equal(await page.locator('.tc-paper img').count(),2);
    assert.match(await page.locator('.tc-paper figcaption').first().textContent(),/A.*LC–MS.*schematic/);
    assert.match(await page.locator('.tc-paper-draft-legend').textContent(),/schematic, not to scale/);
    await page.locator('.tc-preview-pdf').click();
    await page.waitForFunction(()=>pdfCalls.some(c=>c[0]==='save'));
    assert.equal(await page.evaluate(()=>drawnText.filter(text=>text==='PENDING').length),8);
    await page.evaluate(()=>{CanvasRenderingContext2D.prototype.fillText=originalFillText;previewFixture.state.nodes[1].finished=null;});
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    assert.equal(await page.locator('.tc-preview-pdf').isDisabled(),true);
    assert.equal(await page.locator('.tc-paper').count(),0);
    assert.match(await page.locator('.tc-preview-status').textContent(),/Finish live plots first/);
    await page.evaluate(()=>addFinished(2));
    await page.getByLabel('Layout',{exact:true}).selectOption('arrangement');
    await page.getByLabel('Paper',{exact:true}).selectOption('a4');
    await page.getByLabel('Orientation',{exact:true}).selectOption('landscape');
    // SVG may never introduce network loads, active content, animation or an HTML document.
    for (const markup of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill: u\\72l(https://invalid.example/x)"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://invalid.example/private"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://invalid.example/x";</style></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="https://invalid.example/x"/></svg>'
    ]) {
      await page.evaluate(markup=>{addFinished();previewFixture.state.nodes[0].finished.url='data:image/svg+xml,'+encodeURIComponent(markup);},markup);
      await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
      assert.equal(await page.locator('.tc-preview-pdf').isDisabled(),true);
      assert.equal(await page.locator('.tc-paper').count(),0);
    }
    await page.evaluate(()=>{addFinished();previewFixture.archived=1;});
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    assert.match(await page.locator('.tc-preview-status').textContent(),/saved checkpoint/);
    // Printing uses a separate static document, preserving Unicode text and omitting controls.
    await page.evaluate(()=>{
      window.originalAppend=Node.prototype.appendChild;
      Node.prototype.appendChild=function(child){
        const result=originalAppend.call(this,child);
        if(child.tagName==='IFRAME') child.contentWindow.print=()=>{
          window.printedDocument={figures:child.contentDocument.querySelectorAll('figure').length,controls:child.contentDocument.querySelectorAll('button,input,select').length,text:child.contentDocument.body.textContent,styles:child.contentDocument.querySelector('style').textContent};
          child.contentWindow.dispatchEvent(new Event('afterprint'));
        };
        return result;
      };
      previewFixture.state.nodes[0].label='Lipid α concentration';
    });
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    await page.locator('.tc-preview-print').click();
    await page.waitForFunction(()=>!!window.printedDocument);
    const printed=await page.evaluate(()=>printedDocument);
    assert.equal(printed.figures,1); assert.equal(printed.controls,0);
    assert.match(printed.text,/Lipid α concentration/); assert.match(printed.styles,/@page\{size:841.89pt 595.28pt;margin:0\}/);
    assert.equal(await page.locator('.tc-print-frame').count(),0);
    await page.evaluate(()=>{previewFixture.state.nodes[0].id='results_dashboard-plot_pca';});
    await page.getByLabel('Layout',{exact:true}).selectOption('figure1');
    await page.locator('.tc-preview-print').click();
    await page.waitForFunction(()=>printedDocument.figures===10);
    assert.match((await page.evaluate(()=>printedDocument.text)),/DRAFT.*PENDING/);
    assert.match((await page.evaluate(()=>printedDocument.text)),/Descriptive draft · review scientific settings before publication/);
    assert.equal((await page.evaluate(()=>printedDocument.text)).match(/PENDING/g).length,10); // heading plus nine placeholders
    await page.getByLabel('Layout',{exact:true}).selectOption('arrangement');
    await page.evaluate(()=>{Node.prototype.appendChild=originalAppend;});
    // Async image preparation must not export a former state when the canvas changes.
    await page.evaluate(()=>{
      window.pdfCalls=[]; window.pageText=[]; const fillText=CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText=function(t,...args){pageText.push(String(t));return fillText.call(this,t,...args);}; window.originalDecode=HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode=function(){return new Promise(resolve=>{window.releaseDecode=()=>originalDecode.call(this).then(resolve);});};
    });
    await page.locator('.tc-preview-pdf').click();
    await page.waitForFunction(()=>typeof releaseDecode==='function');
    await page.evaluate(()=>{previewFixture.state.nodes[0].label='Changed after export started';releaseDecode();});
    await page.waitForFunction(()=>document.querySelector('.tc-preview-status').textContent.includes('changed during export'));
    assert.equal(await page.evaluate(()=>pdfCalls.some(c=>c[0]==='save')),false);
    await page.evaluate(()=>{HTMLImageElement.prototype.decode=originalDecode;previewFixture.state.nodes=[];});
    // Even a synthetic click cannot bypass the empty-workspace guard.
    await page.locator('.tc-preview-pdf').dispatchEvent('click');
    assert.equal(await page.evaluate(()=>pdfCalls.some(c=>c[0]==='save')),false);
    // Exercise the bundled PDF library as well as the controlled failure/race fixture above.
    await page.addScriptTag({path:path.resolve('www/team/vendor/jspdf.umd.min.js')});
    await page.evaluate(()=>{addFinished(2);previewFixture.archived=0;});
    await page.getByLabel('Layout',{exact:true}).selectOption('pages');
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    const downloaded=page.waitForEvent('download'); await page.locator('.tc-preview-pdf').click();
    const pdfDownload=await downloaded, pdfBytes=fs.readFileSync(await pdfDownload.path());
    assert.equal(pdfDownload.suggestedFilename(),'figure-canvas.pdf');
    assert.equal(pdfBytes.subarray(0,5).toString(),'%PDF-');
    assert.match(pdfBytes.toString('latin1'),/\/Count 2\b/);
    assert.equal(errors.length,0,errors.join('\n'));
    await page.getByLabel('Layout',{exact:true}).selectOption('figure1');
    const draftDownloaded=page.waitForEvent('download');await page.locator('.tc-preview-pdf').click();
    const draftDownload=await draftDownloaded,draftBytes=fs.readFileSync(await draftDownload.path());
    assert.equal(draftDownload.suggestedFilename(),'figure-1-draft.pdf');assert.equal(draftBytes.subarray(0,5).toString(),'%PDF-');assert.match(draftBytes.toString('latin1'),/\/Count 1\b/);
    // UI tracing sends unrelated busy/value/idle while five snapshots decode.
    await page.evaluate(()=>{
      addFinished(5);window.decodeReleases=[];
      HTMLImageElement.prototype.decode=function(){const image=this;return new Promise((resolve,reject)=>decodeReleases.push(()=>originalDecode.call(image).then(resolve,reject)));};
    });
    await page.getByLabel('Layout',{exact:true}).selectOption('pages');
    await page.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await page.waitForTimeout(120);
    const busyDownload=page.waitForEvent('download');
    await page.locator('.tc-preview-pdf').click();
    await page.waitForFunction(()=>decodeReleases.length===5);
    await page.evaluate(()=>{shinyEvents['shiny:busy']();shinyEvents['shiny:value']();decodeReleases.forEach(fn=>fn());setTimeout(()=>shinyEvents['shiny:idle'](),100);});
    const stableDownload=await busyDownload, stableBytes=fs.readFileSync(await stableDownload.path());
    assert.match(stableBytes.toString('latin1'),/\/Count 5\b/);
    assert.match(await page.locator('.tc-preview-status').textContent(),/[Dd]ownload requested/);
    // Scientific revision changes still abort, and later tracing cannot erase the failure.
    await page.evaluate(()=>{window.decodeReleases=[];});
    await page.locator('.tc-preview-pdf').click();
    await page.waitForFunction(()=>decodeReleases.length===5);
    await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('team-preparation-state',{detail:{ready:false,pending:true,running:true,revision:42}}));decodeReleases.forEach(fn=>fn());});
    await page.waitForFunction(()=>document.querySelector('.tc-preview-status').textContent.includes('changed during export'));
    await page.evaluate(()=>{shinyEvents['shiny:value']();shinyEvents['shiny:idle']();});
    await page.waitForTimeout(150);
    assert.match(await page.locator('.tc-preview-status').textContent(),/changed during export/);
    await page.evaluate(()=>{HTMLImageElement.prototype.decode=originalDecode;});
    // Stephania preset retains every finished snapshot and is undoable and exportable.
    const stylePage=await browser.newPage({acceptDownloads:true});
    await stylePage.setContent('<!doctype html><html><body>'+markup+'</body></html>');
    await stylePage.addStyleTag({path:path.resolve('www/team/css/canvas_preview.css')});
    await stylePage.evaluate(()=>{
      window.confirm=()=>true;window.saved=null;window.snapshot='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="black"/></svg>');
      const ids=['results_dashboard-plot_pca','results_dashboard-plot_violin','results_dashboard-plot_comp','cohort','vial','lcms','workflow','taxonomy'];
      window.fixture={state:{nodes:ids.map((id,i)=>({id,label:id,kind:i<3?'plot':'illustration',assetId:({cohort:'cohort-donor',vial:'serum-vial',lcms:'lc-ms',workflow:'study-workflow-scd',taxonomy:'lipid-class-taxonomy'})[id],x:i<3?10:100+(i-3)*100,y:20,width:i<3?300:75,height:i<3?200:60,finished:{url:snapshot,stale:false,createdAt:'2026-10-28T00:00:00Z'}}))},ready:true,archived:3};
      window.TeamCanvas={previewState:()=>structuredClone(fixture),getDocument:()=>structuredClone(saved),setDocument:d=>{saved=structuredClone(d)}};
    });
    await stylePage.addScriptTag({path:path.resolve('www/team/js/canvas_preview.js')});
    await stylePage.getByRole('tab',{name:'Print preview'}).click();
    const before=await stylePage.evaluate(()=>JSON.stringify(fixture.state));
    const printArtBefore=await stylePage.evaluate(()=>saved.items.filter(i=>['cohort','vial','lcms','workflow','taxonomy'].includes(i.nodeId)));
    await stylePage.getByRole('button',{name:'Publication layout'}).click();await stylePage.getByRole('button',{name:'Apply layout',exact:true}).click();
    assert.equal(await stylePage.locator('.tc-free-resize').first().evaluate(el=>getComputedStyle(el).opacity),'0');
    await stylePage.locator('.tc-paper figure').first().click();
    assert.equal(await stylePage.locator('.tc-paper figure.selected .tc-free-resize').evaluate(el=>getComputedStyle(el).opacity),'1');
    assert.equal(await stylePage.locator('.tc-paper figure:not(.selected) .tc-free-resize').first().evaluate(el=>getComputedStyle(el).opacity),'0');
    // A pending width draft belongs to A even if B is selected before blur.
    await stylePage.getByLabel('Lock proportions').uncheck();
    const beforeSwitch=await stylePage.evaluate(()=>structuredClone(saved.items.filter(i=>['cohort','vial'].includes(i.nodeId))));
    await stylePage.getByLabel('Width (pt)',{exact:true}).fill('180');
    await stylePage.locator('.tc-paper figure[aria-label="Move vial"]').click();
    const afterSwitch=await stylePage.evaluate(()=>saved.items.filter(i=>['cohort','vial'].includes(i.nodeId)));
    assert.equal(afterSwitch.find(i=>i.nodeId==='cohort').width,180);
    assert.deepEqual(afterSwitch.find(i=>i.nodeId==='vial'),beforeSwitch.find(i=>i.nodeId==='vial'));
    await stylePage.locator('.tc-paper figure[aria-label="Move cohort"]').click();
    await stylePage.getByRole('button',{name:'Undo',exact:true}).click();
    // Real blur/change events must keep the inspector attached across sequential edits.
    const figureId=await stylePage.locator('.tc-paper figure.selected').evaluate(el=>el.getAttribute('aria-label'));
    await stylePage.getByLabel('Lock proportions').uncheck();
    for(const [field,value] of [['X (pt)','120'],['Y (pt)','100'],['Width (pt)','180'],['Height (pt)','110']]) {
      const input=stylePage.getByLabel(field,{exact:true}); await input.fill(value);await input.press('Tab');
    }
    const edited=await stylePage.evaluate(()=>saved.items.find(i=>i.nodeId==='cohort'));
    assert.deepEqual([edited.x,edited.y,edited.width,edited.height],[120,100,180,110]);
    assert.equal(await stylePage.locator('.tc-paper figure.selected').getAttribute('aria-label'),figureId);
    await stylePage.getByLabel('Lock proportions').check();
    await stylePage.getByLabel('Width (pt)',{exact:true}).fill('200');await stylePage.getByLabel('Width (pt)',{exact:true}).press('Tab');
    const locked=await stylePage.evaluate(()=>saved.items.find(i=>i.nodeId==='cohort'));
    assert.ok(Math.abs(Number(await stylePage.getByLabel('Height (pt)',{exact:true}).inputValue())-locked.height)<0.001);
    // Undo edits to restore the preset for geometry assertions below.
    for(let i=0;i<5;i++)await stylePage.getByRole('button',{name:'Undo',exact:true}).click();
    const styled=await stylePage.evaluate(()=>saved);
    assert.equal(styled.paper,'custom');assert.equal(styled.paperWidth,980);assert.ok(styled.paperHeight>=850&&styled.paperHeight<=3000);assert.equal(styled.showPageFurniture,false);
    assert.deepEqual(styled.items.filter(i=>i.type==='figure').map(i=>i.nodeId).sort(),['cohort','lcms','results_dashboard-plot_comp','results_dashboard-plot_pca','results_dashboard-plot_violin','taxonomy','vial','workflow'].sort());
    assert.ok(styled.items.every(i=>i.x>=0&&i.y>=0&&i.width>=20&&i.height>=20&&i.x+i.width<=980&&i.y+i.height<=styled.paperHeight));
    for(const old of printArtBefore)assert.deepEqual(styled.items.find(i=>i.id===old.id),old);
    const art=['cohort','vial','lcms','workflow','taxonomy'].map(id=>styled.items.find(i=>i.nodeId===id));
    assert.equal(art.length,5); // Existing print positions and sizes are preserved above.
    assert.deepEqual(styled.items.filter(i=>i.type==='text').map(i=>i.text),['A','B','C','D']);
    assert.equal(await stylePage.evaluate(()=>JSON.stringify(fixture.state)),before);
    await stylePage.getByRole('button',{name:'Publication layout'}).click();await stylePage.getByRole('button',{name:'Apply layout',exact:true}).click();
    assert.equal(await stylePage.evaluate(()=>saved.items.filter(i=>i.type==='text' && /^stephania-panel-/.test(i.id)).length),4);
    await stylePage.evaluate(()=>{fixture.state.nodes=fixture.state.nodes.filter(n=>!['cohort','vial','lcms'].includes(n.id));});
    await stylePage.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await stylePage.waitForTimeout(120);
    await stylePage.getByRole('button',{name:'Publication layout'}).click();await stylePage.getByRole('button',{name:'Apply layout',exact:true}).click();
    const three=await stylePage.evaluate(()=>saved);
    const plots=three.items.filter(i=>i.type==='figure' && i.nodeId.startsWith('results_dashboard-'));
    assert.equal(plots.length,3);
    for(const plot of plots)assert.ok(plot.x>=0&&plot.y>=0&&plot.x+plot.width<=three.paperWidth&&plot.y+plot.height<=three.paperHeight);
    const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
    for(let i=0;i<plots.length;i++)for(let j=i+1;j<plots.length;j++)assert.equal(overlap(plots[i],plots[j]),false,'publication plots must not overlap');
    for(const plot of plots)for(const obj of three.items.filter(i=>i.type==='shape'||(i.type==='figure'&&!i.nodeId.startsWith('results_dashboard-'))))assert.equal(overlap(plot,obj),false,'publication plots must not overlap preserved objects');
    await stylePage.evaluate(()=>{saved.items.push({id:'title-note',type:'text',x:20,y:700,width:300,height:50,text:'A long study title',fontSize:24,color:'#000000',z:90},{id:'source-note',type:'text',x:20,y:760,width:300,height:50,text:'Source note',fontSize:12,color:'#000000',z:91});window.dispatchEvent(new Event('team-document-restored'));});
    await stylePage.getByRole('button',{name:'Publication layout'}).click();await stylePage.getByRole('button',{name:'Apply layout',exact:true}).click();
    const footer=await stylePage.evaluate(()=>saved.items.filter(i=>['title-note','source-note'].includes(i.id)));
    assert.equal(footer.length,2);assert.ok(footer.every(i=>i.width===300));
    assert.deepEqual(footer.map(i=>[i.x,i.height]),[[20,50],[20,50]]);assert.equal(footer[1].y-footer[0].y,60);
    const afterBand=await stylePage.evaluate(()=>saved);const dataFigures=afterBand.items.filter(i=>i.type==='figure'&&i.nodeId.startsWith('results_dashboard-'));assert.ok(footer[0].y>=Math.max(...dataFigures.map(i=>i.y+i.height)));const ordered=dataFigures.map(i=>i.y).sort((a,b)=>a-b);assert.ok(ordered[ordered.length-1]-ordered[0]<700,'old annotations must not introduce a large gap among figures');
    assert.equal(footer[0].fontSize,24);assert.equal(footer[1].fontSize,12);
    await stylePage.getByRole('button',{name:'Undo',exact:true}).click();const undoneNotes=await stylePage.evaluate(()=>saved.items.filter(i=>['title-note','source-note'].includes(i.id)));assert.deepEqual(undoneNotes.map(i=>i.y),[700,760]);await stylePage.getByRole('button',{name:'Redo',exact:true}).click();assert.deepEqual(await stylePage.evaluate(()=>saved.items.filter(i=>['title-note','source-note'].includes(i.id)).map(i=>i.y)),footer.map(i=>i.y));
    const bandRepeat=await stylePage.evaluate(()=>JSON.stringify(saved));await stylePage.getByRole('button',{name:'Publication layout'}).click();await stylePage.getByRole('button',{name:'Apply layout',exact:true}).click();assert.equal(await stylePage.evaluate(()=>JSON.stringify(saved)),bandRepeat,'repeating layout must be idempotent');
    await stylePage.evaluate(()=>{fixture.state.nodes.push(...['cohort','vial','lcms'].map(id=>({id,label:id,kind:'illustration',assetId:id,x:10,y:20,width:300,height:200,finished:{url:snapshot,stale:false,createdAt:'2026-10-28T00:00:00Z'}})));});
    await stylePage.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await stylePage.waitForTimeout(120);

    const styleSvg=stylePage.waitForEvent('download');await stylePage.getByRole('button',{name:'Download SVG'}).click();const styleXml=fs.readFileSync(await (await styleSvg).path(),'utf8');assert.match(styleXml,/viewBox="0 0 980 [0-9.]+"/);assert.ok(Number(/viewBox="0 0 980 ([0-9.]+)"/.exec(styleXml)[1])>=850);assert.doesNotMatch(styleXml,/FIGURE CANVAS/);
    // Restoring a document resets history.
    await stylePage.evaluate(()=>window.dispatchEvent(new Event('team-document-restored')));
    assert.equal(await stylePage.getByRole('button',{name:'Undo',exact:true}).isDisabled(),true);
    assert.equal(await stylePage.evaluate(()=>saved.paperWidth),980);
    await stylePage.evaluate(()=>window.dispatchEvent(new Event('team-document-restored')));assert.equal(await stylePage.locator('.tc-paper figure img').count(),8);
    await stylePage.close();
    // Generic layout handles each real panel count without inventing figures or changing snapshots.
    for (const count of [1,2,3,6]) {
      const grid=await browser.newPage();await grid.setContent('<!doctype html><html><body>'+markup+'</body></html>');
      await grid.evaluate(count=>{window.saved=null;const url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>');window.fixture={state:{nodes:Array.from({length:count},(_,i)=>({id:'plot_'+i,label:'Plot '+i,kind:'plot',x:10,y:10,width:300,height:200,finished:{url,stale:false,createdAt:'2026-10-28T00:00:00Z'}}))},ready:true,archived:0};window.TeamCanvas={previewState:()=>structuredClone(fixture),getDocument:()=>structuredClone(saved),setDocument:d=>{saved=structuredClone(d)}};},count);
      await grid.addScriptTag({path:path.resolve('www/team/js/canvas_preview.js')});await grid.getByRole('tab',{name:'Print preview'}).click();const original=await grid.evaluate(()=>JSON.stringify(fixture.state));
      await grid.getByRole('button',{name:'Publication layout'}).click();await grid.getByRole('button',{name:'Apply layout',exact:true}).click();
      const state=await grid.evaluate(()=>saved), fig=state.items.filter(i=>i.type==='figure');assert.equal(fig.length,count);const labels=state.items.filter(i=>i.type==='text'&&/^stephania-panel-/.test(i.id));assert.equal(labels.length,count);for(let i=0;i<count;i++){assert.equal(labels[i].text,String.fromCharCode(65+i));assert.equal(labels[i].x,fig[i].x);assert.equal(labels[i].y,fig[i].y-28);}assert.equal(await grid.evaluate(()=>JSON.stringify(fixture.state)),original);
      for(const item of fig)assert.ok(item.x>=0&&item.y>=0&&item.x+item.width<=state.paperWidth&&item.y+item.height<=state.paperHeight);
      for(let i=0;i<fig.length;i++)for(let j=i+1;j<fig.length;j++)assert.ok(!(fig[i].x<fig[j].x+fig[j].width&&fig[i].x+fig[i].width>fig[j].x&&fig[i].y<fig[j].y+fig[j].height&&fig[i].y+fig[i].height>fig[j].y));
      await grid.close();
    }
    const artOnly=await browser.newPage();await artOnly.setContent('<!doctype html><html><body>'+markup+'</body></html>');
    await artOnly.evaluate(()=>{window.saved=null;const url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>');window.fixture={state:{nodes:[{id:'art_only',label:'Art',kind:'illustration',assetId:'neutrophil',x:100,y:60,width:200,height:140,finished:{url,stale:false,createdAt:'2026-10-28T00:00:00Z'}}]},ready:true,archived:0};window.TeamCanvas={previewState:()=>structuredClone(fixture),getDocument:()=>structuredClone(saved),setDocument:d=>{saved=structuredClone(d)}};});
    await artOnly.addScriptTag({path:path.resolve('www/team/js/canvas_preview.js')});await artOnly.getByRole('tab',{name:'Print preview'}).click();await artOnly.getByRole('button',{name:'Publication layout'}).click();await artOnly.getByRole('button',{name:'Apply layout',exact:true}).click();assert.deepEqual(await artOnly.evaluate(()=>saved.items.filter(i=>i.type==='text').map(i=>i.text)),['A']);await artOnly.close();
    // Integration contract: use the real canvas API, not only a mocked readiness flag.
    const realPage=await browser.newPage();
    await realPage.setContent('<!doctype html><html lang="en"><body><div id="results_dashboard-plot_pca" class="shiny-plot-output"></div>'+markup+'</body></html>');
    await realPage.evaluate(()=>{window.Shiny={shinyapp:{},addCustomMessageHandler:()=>{},setInputValue:()=>{}};window.realEvents={};window.jQuery=()=>({on:function(names,fn){names.split(' ').forEach(name=>(realEvents[name]||(realEvents[name]=[])).push(fn));return this;}});});
    await realPage.addStyleTag({path:path.resolve('www/team/css/canvas.css')});
    await realPage.addStyleTag({path:path.resolve('www/team/css/canvas_preview.css')});
    await realPage.addScriptTag({path:path.resolve('www/team/js/canvas.js')});
    await realPage.addScriptTag({path:path.resolve('www/team/js/canvas_preview.js')});
    await realPage.evaluate(()=>{
      const url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#276e6c"/></svg>');
      TeamCanvas.restore({version:'1',libraryHidden:false,nodes:[{id:'results_dashboard-plot_pca',label:'Saved result',x:30,y:30,width:620,height:500,visual:{},finished:{url,createdAt:'2026-10-28T15:00:00Z',stale:false}}]});
    });
    await realPage.getByRole('tab',{name:'Print preview'}).click();
    assert.equal(await realPage.locator('.tc-paper').count(),1);
    assert.match(await realPage.locator('.tc-preview-status').textContent(),/saved checkpoint/);
    await realPage.waitForFunction(()=>!document.querySelector('.tc-preview-print').disabled);assert.equal(await realPage.locator('.tc-preview-print').isEnabled(),true);
    await realPage.evaluate(()=>{document.documentElement.classList.add('shiny-busy');realEvents['shiny:busy'].forEach(f=>f());});
    await realPage.waitForTimeout(30);await realPage.evaluate(()=>window.dispatchEvent(new Event('team-canvas-changed')));await realPage.waitForTimeout(120);
    assert.equal(await realPage.locator('.tc-preview-print').isDisabled(),true);
    assert.equal(await realPage.evaluate(()=>TeamCanvas.previewState().ready),false);
    // Model a missed idle event: Shiny's authoritative class clears, but no event fires.
    await realPage.evaluate(()=>document.documentElement.classList.remove('shiny-busy'));
    await realPage.waitForFunction(()=>!document.querySelector('.tc-preview-print').disabled);
    assert.equal(await realPage.evaluate(()=>TeamCanvas.previewState().ready),true);
    // Autosave creates a Shiny busy period while preview remains open. An SVG
    // click during that period must recover automatically after idle.
    await realPage.evaluate(()=>{document.documentElement.classList.add('shiny-busy');realEvents['shiny:busy'].forEach(f=>f());});
    assert.equal(await realPage.locator('.tc-preview-svg').isDisabled(),true);
    await realPage.evaluate(()=>{document.documentElement.classList.remove('shiny-busy');realEvents['shiny:idle'].forEach(f=>f());});
    await realPage.waitForFunction(()=>!document.querySelector('.tc-preview-svg').disabled);
    await realPage.waitForFunction(()=>!document.querySelector('.tc-preview-print').disabled);assert.equal(await realPage.locator('.tc-preview-print').isEnabled(),true);
    await realPage.evaluate(()=>{document.querySelector('.tc-snapshot img').src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>');window.dispatchEvent(new Event('team-canvas-changed'));});
    await realPage.waitForTimeout(150);
    assert.equal(await realPage.locator('.tc-preview-print').isDisabled(),true);
    await realPage.close();
    assert.ok(await page.evaluate(()=>busyEvents.some(e=>e[0]==='begin')&&busyEvents.some(e=>e[0]==='end')&&busyEvents.some(e=>e[0]==='fail')));
    await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.tc-inspector-toggle').isVisible(),true);await page.locator('.tc-inspector-toggle').click();assert.equal(await page.locator('.tc-inspector-toggle').getAttribute('aria-expanded'),'true');
    console.log('Team canvas print preview: tabs, page layout, PDF, state gates, race protection and SVG security passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
