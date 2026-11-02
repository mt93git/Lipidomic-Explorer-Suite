(function () {
  'use strict';
  // Print is a view of finished images, never a screenshot of live analysis controls.
  function init() {
    var root = document.getElementById('team-canvas-root');
    if (!root || !root.querySelector('#tc-preview-panel')) return;
    var tabs = Array.from(root.querySelectorAll('.tc-mode-tabs [role="tab"]'));
    var panel = root.querySelector('#tc-preview-panel'), pages = panel.querySelector('.tc-preview-pages');
    // The shell hides the workspace tabs; keep a visible way back from this view.
    var heading = panel.querySelector('.tc-preview-heading');
    if (heading && !heading.querySelector('.tc-preview-back')) { var back = document.createElement('button'); back.type = 'button'; back.className = 'tc-preview-back'; back.textContent = '← Back to canvas'; back.addEventListener('click', function () { backToCanvas(); }); heading.prepend(back); }
    // View navigation is deliberately separate from document coordinates and exports.
    var previewZoom = 1, zoomMode = 'width', zoomFrame = 0;
    var navigation = document.createElement('div'); navigation.className = 'tc-preview-navigation';
    navigation.setAttribute('role','group'); navigation.setAttribute('aria-label','Print preview zoom');
    function zoomButton(label, text, action) { var button=document.createElement('button');button.type='button';button.setAttribute('aria-label',label);button.textContent=text;button.addEventListener('click',action);navigation.appendChild(button);return button; }
    var zoomOut=zoomButton('Zoom out print preview','−',function(){setPreviewZoom(previewZoom/1.25);});
    var zoomReset=zoomButton('Reset print preview zoom to 100%','100%',function(){setPreviewZoom(1);});
    var zoomIn=zoomButton('Zoom in print preview','+',function(){setPreviewZoom(previewZoom*1.25);});
    zoomButton('Fit whole page','Fit page',function(){zoomMode='page';applyPreviewZoom();pages.scrollTop=0;pages.scrollLeft=0;});
    zoomButton('Fit page width','Fit width',function(){zoomMode='width';applyPreviewZoom();pages.scrollLeft=0;});
    pages.before(navigation);pages.tabIndex=0;pages.setAttribute('role','region');
    function setPreviewZoom(value) { zoomMode='manual';applyPreviewZoom(Math.max(.1,Math.min(3,value))); }
    function applyPreviewZoom(value) {
      if(panel.hidden)return;
      var sheets=Array.from(pages.querySelectorAll('.tc-paper'));if(!sheets.length)return;
      var old=previewZoom, left=pages.scrollLeft, top=pages.scrollTop;
      // A concrete scroll box makes its complete content reachable, including in focus mode.
      pages.style.height=Math.max(260,Math.min(850,window.innerHeight-pages.getBoundingClientRect().top-24))+'px';if(inspector)inspector.style.maxHeight=window.innerWidth>850?pages.style.height:'40dvh';
      var width=Math.max.apply(null,sheets.map(function(e){return Number(e.dataset.previewWidth);}));
      var height=Math.max.apply(null,sheets.map(function(e){return Number(e.dataset.previewHeight);}));
      var fitWidth=Math.max(.02,(pages.clientWidth-48)/(width*4/3));
      previewZoom=zoomMode==='page'?Math.min(fitWidth,Math.max(.02,(pages.clientHeight-48)/(height*4/3))):zoomMode==='width'?Math.min(1,fitWidth):(value||previewZoom);
      sheets.forEach(function(sheet){sheet.style.width=(Number(sheet.dataset.previewWidth)*4/3*previewZoom)+'px';sheet.style.height=(Number(sheet.dataset.previewHeight)*4/3*previewZoom)+'px';});
      zoomReset.textContent=Math.round(previewZoom*100)+'%';zoomOut.disabled=previewZoom<=.10001;zoomIn.disabled=previewZoom>=2.9999;
      pages.scrollLeft=left*previewZoom/old;pages.scrollTop=top*previewZoom/old;
    }
    function schedulePreviewZoom(){cancelAnimationFrame(zoomFrame);zoomFrame=requestAnimationFrame(function(){applyPreviewZoom();});}
    window.addEventListener('resize',schedulePreviewZoom);
    if(window.ResizeObserver)new ResizeObserver(schedulePreviewZoom).observe(panel);
    var status = panel.querySelector('.tc-preview-status'), pdfButton = panel.querySelector('.tc-preview-pdf'), printButton = panel.querySelector('.tc-preview-print');
    var layout = panel.querySelector('.tc-preview-layout'), paper = panel.querySelector('.tc-preview-paper'), orientation = panel.querySelector('.tc-preview-orientation');
    var furniture=panel.querySelector('.tc-preview-furniture');
    var customWidth=panel.querySelector('.tc-preview-custom-width'), customHeight=panel.querySelector('.tc-preview-custom-height');
    var generation = 0, exporting = false, refreshTimer, current = null, busy = false, exportFailed = false, preparationSignature = null, errorNotice = false;
    var placementNotice = '', downloadFallback = null, autoPlacementPending = false;
    var documentState = null, restored = false, selected = null, inspectorItemId = null, history = [], future = [], lastSaved = null, replaying = false, aspectLocked = true, guides = false, inspector = document.createElement('div');
    inspector.className = 'tc-free-inspector';inspector.setAttribute('aria-label','Selected object properties');
    var editorBody=document.createElement('div');editorBody.className='tc-document-editor';pages.before(editorBody);editorBody.appendChild(inspector);editorBody.appendChild(pages);var inspectorToggle=document.createElement('button');inspectorToggle.type='button';inspectorToggle.className='tc-inspector-toggle';inspectorToggle.textContent='Object properties';inspectorToggle.setAttribute('aria-expanded','false');editorBody.before(inspectorToggle);inspectorToggle.addEventListener('click',function(){var open=editorBody.classList.toggle('tc-inspector-open');inspectorToggle.setAttribute('aria-expanded',String(open));});
    var pageOptions=panel.querySelector('.tc-preview-options'),pageSettings=document.createElement('details'),pageSummary=document.createElement('summary');
    pageSettings.className='tc-page-settings';pageSummary.textContent='Page setup';pageOptions.before(pageSettings);pageSettings.appendChild(pageSummary);pageSettings.appendChild(pageOptions);pageSettings.addEventListener('toggle',schedulePreviewZoom);
    var renderedState=null, selectionTransition=false;
    function itemNode(item){return renderedState && renderedState.nodes.find(function(n){return n.id===item.nodeId;});}
    function itemName(item){var node=itemNode(item);if(item.type==='shape')return item.shape.charAt(0).toUpperCase()+item.shape.slice(1);return item.type==='text'?(item.text.trim().split('\n')[0].slice(0,65)||'Empty text'):(node?node.label:'Figure');}
    function commitPendingField(){var input=document.activeElement,item=documentState&&documentState.items.find(function(i){return i.id===selected;});if(!item||!inspector.contains(input)||!input.dataset.itemKey||String(item[input.dataset.itemKey])===input.value)return;selectionTransition=true;try{editItem(item,input.dataset.itemKey,input.value);current=capture();}finally{selectionTransition=false;}}
    function selectItem(id){commitPendingField();selected=id;if(current)render(current);}
    function selectionDecorations(){pages.querySelectorAll('.tc-selection-label').forEach(function(e){e.remove();});var figure=pages.querySelector('.tc-free-item.selected');if(!figure)return;var label=document.createElement('span');label.className='tc-selection-label';label.setAttribute('aria-hidden','true');label.textContent=figure.dataset.objectName;figure.appendChild(label);if(figure.offsetTop<24)label.style.transform='none';}
    pages.addEventListener('keydown',function(event){if(event.key==='Escape'){event.stopPropagation();selected=null;if(current)render(current);pages.focus({preventScroll:true});}});
    pages.addEventListener('click',function(event){if(!event.target.closest('.tc-free-item')){selected=null;if(current)render(current);}});
    var draftReviewNote = 'Descriptive draft · review scientific settings before publication';
    function tell(message) { status.textContent = message; if(downloadFallback)status.appendChild(downloadFallback.link); }
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var active = t === tab; t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
      });
      if (focus) tab.focus();
      if (tab.id === 'tc-preview-tab') { restoreDocument(); refresh(); }
      else { generation++;current=null;controls(false);clearTimeout(refreshTimer);window.dispatchEvent(new Event('resize')); }
    }
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (event) {
        var next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
        if (next >= 0) { event.preventDefault(); select(tabs[next], true); }
      });
    });
    function unsafeSvgReference(value) {
      var withoutLocal=value.replace(/url\(\s*(['"]?)#[A-Za-z0-9_.:-]+\1\s*\)/gi,'');
      return /[\\@]|\/\*/.test(value) || /url\s*\(/i.test(withoutLocal) || /javascript:/i.test(value);
    }
    function safeImage(url) {
      if (typeof url !== 'string' || url.length > 4 * 1024 * 1024) return false;
      if (/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(url)) {
        try { var binary = atob(url.slice(url.indexOf(',') + 1)); return binary.length >= 33 && binary.slice(0,8) === '\x89PNG\r\n\x1a\n' && binary.slice(12,16) === 'IHDR'; } catch (e) { return false; }
      }
      if (!/^data:image\/svg\+xml(?:;charset=utf-8)?(?:;base64)?,/i.test(url)) return false;
      try {
        var comma = url.indexOf(','), prefix = url.slice(0,comma), encoded = url.slice(comma + 1);
        var markup = /;base64$/i.test(prefix) ? atob(encoded) : decodeURIComponent(encoded);
        if (/<!DOCTYPE|<!ENTITY/i.test(markup)) return false;
        var doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
        if (doc.documentElement.localName !== 'svg' || doc.querySelector('parsererror,script,foreignObject,iframe,object,embed,animate,set,animateMotion,animateTransform,discard')) return false;
        if (Array.from(doc.querySelectorAll('style')).some(function (el) { return unsafeSvgReference(el.textContent); })) return false;
        return Array.from(doc.querySelectorAll('*')).every(function (el) {
          return Array.from(el.attributes).every(function (a) {
            var name = a.name.toLowerCase(), value = a.value.trim();
            if (name.indexOf('on') === 0) return false;
            if (name === 'href' || name === 'xlink:href') return value.charAt(0) === '#' || /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value);
            return !unsafeSvgReference(value);
          });
        });
      } catch (e) { return false; }
    }
    function capture() {
      reconcileIdle();
      if (!window.TeamCanvas || typeof TeamCanvas.previewState !== 'function') throw new Error('The canvas is not ready. Return to Workspace and try again.');
      var result = TeamCanvas.previewState(), state = result && result.state;
      if (!state || !Array.isArray(state.nodes) || state.nodes.length > 50) throw new Error('The figure workspace could not be read.');
      if (!state.nodes.length && layout.value!=='free') throw new Error('Add plots in Workspace, or choose Free layout to draw with shapes and text.');
      var live = state.nodes.filter(function (n) { return !n.finished; }).length;
      if (live) throw new Error('Finish live plots first. ' + live + ' plot' + (live === 1 ? ' is' : 's are') + ' still being edited in Workspace.');
      if (state.nodes.some(function (n) { return n.finished.stale; })) throw new Error('A finished figure needs review because its analysis changed. Return to Workspace, choose Edit, then finish it again.');
      if (busy || (window.Shiny && Shiny.shinyapp && document.documentElement.classList.contains('shiny-busy')) || !result.ready) throw new Error(result.message || 'The analysis is updating. Wait for the finished figures before exporting.');
      state.nodes.forEach(function (n) {
        if (typeof n.id !== 'string' || typeof n.label !== 'string' || n.label.length > 1000 || !safeImage(n.finished.url) || !['x','y','width','height'].every(function (key) { return typeof n[key] === 'number' && Number.isFinite(n[key]) && n[key] >= 0; }) || n.width < 1 || n.height < 1) throw new Error('A finished figure has invalid image or layout data. Review it in Workspace.');
      });
      var settings = readSettings();
      if (settings.layout === 'free') syncDocument(state, settings);
      return {state:state, settings:settings, document:settings.layout === 'free' ? JSON.parse(JSON.stringify(documentState)) : null, archived:result.archived || 0, signature:JSON.stringify([state, settings, settings.layout === 'free' ? documentState : null])};
    }
    function readSettings() {
      var settings={layout:['free','arrangement','figure1'].includes(layout.value)?layout.value:'pages',paper:['a4','custom'].includes(paper.value)?paper.value:'letter',orientation:orientation.value==='landscape'?'landscape':'portrait',showPageFurniture:furniture.checked};
      if(settings.paper==='custom'){settings.paperWidth=Number(customWidth.value);settings.paperHeight=Number(customHeight.value);if(!Number.isFinite(settings.paperWidth)||!Number.isFinite(settings.paperHeight)||settings.paperWidth<100||settings.paperWidth>3000||settings.paperHeight<100||settings.paperHeight>3000)throw new Error('Page width and height must be between 100 and 3000 pt.');}return settings;
    }
    function updatePaperControls(){panel.querySelectorAll('.tc-preview-custom-size').forEach(function(el){el.hidden=paper.value!=='custom';});orientation.disabled=paper.value==='custom';}
    updatePaperControls();
    function size(settings) {
      if(settings.paper==='custom')return [settings.paperWidth,settings.paperHeight];
      var dimensions = settings.paper === 'a4' ? [595.28,841.89] : [612,792];
      return settings.orientation === 'landscape' ? dimensions.reverse() : dimensions;
    }
    function restoreDocument() {
      if (restored) return; restored=true;
      var saved=window.TeamCanvas && typeof TeamCanvas.getDocument === 'function' ? TeamCanvas.getDocument() : null;
      if (saved && saved.version === '1' && Array.isArray(saved.items)) {
        documentState=JSON.parse(JSON.stringify(saved)); lastSaved=JSON.stringify(documentState);
        if (['free','pages','arrangement','figure1'].includes(saved.layout)) layout.value=saved.layout;
        if (['letter','a4','custom'].includes(saved.paper)) paper.value=saved.paper;
        if(saved.paper==='custom'){customWidth.value=saved.paperWidth;customHeight.value=saved.paperHeight;} updatePaperControls();
        if (['portrait','landscape'].includes(saved.orientation)) orientation.value=saved.orientation; furniture.checked=saved.showPageFurniture!==false;
      }
    }
    function syncDocument(state, settings) {
      if (!documentState) {
        var saved = window.TeamCanvas && typeof TeamCanvas.getDocument === 'function' ? TeamCanvas.getDocument() : null;
        documentState = saved && saved.version === '1' && Array.isArray(saved.items) ? JSON.parse(JSON.stringify(saved)) : {version:'1',items:[]};
      }
      if(documentState.items.length>80)throw new Error('This document exceeds 80 objects. Remove objects before composing the page.');
      var dims = size(settings), existing = documentState.items.filter(function(i) { return i && (i.type === 'text' || i.type === 'shape' || (i.type === 'figure' && state.nodes.some(function(n){return n.id === i.nodeId;})));  });
      var expanded=false,added=false;
      state.nodes.forEach(function(n,index) {
        if(existing.some(function(i){return i.nodeId===n.id;}))return;
        if(existing.length>=80)throw new Error('This page is full. Remove an object or choose One plot per page.');
        var heatmap=/heatmap/i.test(n.id),w=Math.min(dims[0]-40,heatmap?460:220),h=Math.min(dims[1]-40,heatmap?420:160),gap=16;
        var xs=[20],ys=[40];existing.forEach(function(i){xs.push(i.x+i.width+gap);ys.push(i.y+i.height+gap);});xs.sort(function(a,b){return a-b;});ys.sort(function(a,b){return a-b;});
        function clear(x,y){return !existing.some(function(i){return x<i.x+i.width+gap&&x+w+gap>i.x&&y<i.y+i.height+gap&&y+h+gap>i.y;});}
        var pos=null;ys.some(function(y){return xs.some(function(x){if(x+w>dims[0]-20||y+h>dims[1]-28||!clear(x,y))return false;pos={x:x,y:y};return true;});});
        if(!pos){
          var y=Math.max(40,...existing.map(function(i){return i.y+i.height+gap;}));
          if(y+h+28>3000)throw new Error('This page is full. Remove an object or choose One plot per page.');
          dims[1]=y+h+28;pos={x:20,y:y};expanded=true;
        }
        var baseId='figure-'+index+'-'+n.id.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,130),uniqueId=baseId,suffix=1;while(existing.some(function(i){return i.id===uniqueId;}))uniqueId=baseId+'-'+suffix++;
        added=true; existing.push({id:uniqueId,nodeId:n.id,type:'figure',x:pos.x,y:pos.y,width:w,height:h,caption:n.label,z:Math.min(10000,existing.reduce(function(m,i){return Math.max(m,i.z||0);},0)+1)});
      });
      if(expanded){settings.paper='custom';settings.paperWidth=dims[0];settings.paperHeight=dims[1];paper.value='custom';customWidth.value=dims[0];customHeight.value=dims[1];updatePaperControls();placementNotice='Page expanded to fit new figures. Existing objects were kept in place. ';}

      if(added)autoPlacementPending=true;
      documentState.items = existing.map(function(i,index) {
        var width=Math.max(20,Math.min(dims[0],Number(i.width)||220)), height=Math.max(20,Math.min(dims[1],Number(i.height)||160));
        var base={id:String(i.id),type:i.type,x:Math.max(0,Math.min(dims[0]-width,Number(i.x)||0)),y:Math.max(0,Math.min(dims[1]-height,Number(i.y)||0)),width:width,height:height,z:Math.max(0,Math.min(10000,Math.round(Number(i.z)||0)))}; if(i.type==='text'){base.text=typeof i.text==='string'?i.text.slice(0,2000):'';base.fontSize=Math.max(6,Math.min(72,Number(i.fontSize)||12));base.color=/^#[0-9a-f]{6}$/i.test(i.color)?i.color:'#172d4b';} else if(i.type==='shape'){base.shape=i.shape;base.fill=i.fill;base.stroke=i.stroke;base.strokeWidth=i.strokeWidth;if(i.radius!==undefined)base.radius=i.radius;} else {base.nodeId=String(i.nodeId);base.caption=typeof i.caption === 'string' ? i.caption.slice(0,1000) : '';} Object.keys(i).forEach(function(key){if(!(key in base))delete i[key];}); Object.assign(i,base); return i;
      });
      documentState.showPageFurniture=settings.showPageFurniture;documentState.layout='free'; documentState.paper=settings.paper; documentState.orientation=settings.orientation; if(settings.paper==='custom'){documentState.paperWidth=settings.paperWidth;documentState.paperHeight=settings.paperHeight;}else{delete documentState.paperWidth;delete documentState.paperHeight;} if(!lastSaved) lastSaved=JSON.stringify(documentState);
    }
    function applyDocumentSettings(doc) { layout.value=doc.layout;paper.value=doc.paper;orientation.value=doc.orientation;furniture.checked=doc.showPageFurniture!==false;if(doc.paper==='custom'){customWidth.value=doc.paperWidth;customHeight.value=doc.paperHeight;}updatePaperControls(); }
    function replayDocument(redo) {
      var from=redo?future:history, to=redo?history:future;
      if(exporting || !documentState || !from.length)return false;
      to.push(JSON.stringify(documentState)); documentState=JSON.parse(from.pop());
      applyDocumentSettings(documentState); replaying=true;
      try {saveDocument();} finally {replaying=false;}
      refresh(); return true;
    }
    document.addEventListener('keydown',function(event){
      if(event.defaultPrevented || panel.hidden || !root.contains(event.target) || !(event.metaKey||event.ctrlKey) || event.altKey || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
      var key=event.key.toLowerCase(), redo=(key==='z'&&event.shiftKey)||(key==='y'&&!event.shiftKey);
      if((key==='z'||redo) && replayDocument(redo))event.preventDefault();
    });
    function saveDocument() { var snapshot=JSON.stringify(documentState); if(snapshot!==lastSaved){closePublicationConfirmation(false);clearDownloadFallback();}autoPlacementPending=false; if(!replaying && lastSaved && snapshot!==lastSaved){history.push(lastSaved);if(history.length>50)history.shift();future=[];} lastSaved=snapshot; if (window.TeamCanvas && typeof TeamCanvas.setDocument === 'function') TeamCanvas.setDocument(JSON.parse(JSON.stringify(documentState))); }
    function editItem(item, key, value) {
      item=documentState && documentState.items.find(function(i){return i.id===item.id;}); if(!item)return;
      var dims=size(readSettings());
      if (key === 'caption') item.caption=String(value).slice(0,1000);
      else if (key === 'text') item.text=String(value).slice(0,2000);
      else if (key === 'color') { if (!/^#[0-9a-f]{6}$/i.test(value)) return; item.color=value; }
      else if (key==='fill'||key==='stroke'){if(value!=='none'&&!/^#[0-9a-f]{6}$/i.test(value))return;item[key]=value;}
      else if(key==='strokeWidth'||key==='radius'){item[key]=Math.max(0,Math.min(key==='radius'?100:20,Number(value)||0));}
      else if (key === 'fontSize') item.fontSize=Math.max(6,Math.min(72,Number(value)||12));
      else if (key === 'z') item.z=Math.max(0,Math.min(10000,Math.round(Number(value)||0)));
      else { value=Number(value); if (!Number.isFinite(value)) return; if(item.type==='figure' && aspectLocked && (key==='width'||key==='height')){var ratio=item.width/item.height;if(key==='width'){value=Math.max(20,Math.min(dims[0],dims[1]*ratio,value));item.height=value/ratio;}else{value=Math.max(20,Math.min(dims[1],dims[0]/ratio,value));item.width=value*ratio;}} item[key]=value; }
      item.width=Math.max(20,Math.min(dims[0],item.width)); item.height=Math.max(20,Math.min(dims[1],item.height));
      item.x=Math.max(0,Math.min(dims[0]-item.width,item.x)); item.y=Math.max(0,Math.min(dims[1]-item.height,item.y));
      saveDocument(); if(!selectionTransition)refresh(); return item;
    }
    function showInspector(force) {
      if(layout.value!=='free'){inspector.hidden=true;editorBody.classList.add('tc-document-readonly');return;}
      inspector.hidden=false;editorBody.classList.remove('tc-document-readonly');
      var item=documentState && documentState.items.find(function(i){return i.id===selected;});
      if(!item)selected=null;
      // Keep an active field stable while its change is rendered; selection switches rebuild it.
      if(!force && inspectorItemId===selected && inspector.firstChild && inspector.dataset.structure===(documentState?documentState.items.map(function(i){return i.id;}).join('|'):'')){
        inspector.querySelectorAll('[data-item-key]').forEach(function(input){if(item && input!==document.activeElement)input.value=item[input.dataset.itemKey];});
        var u=inspector.querySelector('[data-history="undo"]'),r=inspector.querySelector('[data-history="redo"]');if(u)u.disabled=!history.length;if(r)r.disabled=!future.length;var title=inspector.querySelector('.tc-object-name');if(title&&item)title.textContent=itemName(item);inspector.querySelectorAll('.tc-layer-row').forEach(function(row){var live=documentState.items.find(function(i){return i.id===row.dataset.layerId;});if(live){row.querySelector('.tc-layer-name').textContent=itemName(live);row.setAttribute('aria-label','Select '+itemName(live));}});return;
      }
      var selectionChanged=inspectorItemId!==selected;inspector.replaceChildren();inspectorItemId=selected;if(selectionChanged)inspector.scrollTop=0;inspector.dataset.structure=documentState?documentState.items.map(function(i){return i.id;}).join('|'):'';
      function element(tag,cls,text,parent){var el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;(parent||inspector).appendChild(el);return el;}
      function button(text,fn,parent){var el=element('button','',text,parent);el.type='button';el.addEventListener('click',fn);return el;}
      var tools=element('div','tc-inspector-tools');
      var undo=button('Undo',function(){replayDocument(false);},tools);undo.dataset.history='undo';undo.disabled=!history.length;
      var redo=button('Redo',function(){replayDocument(true);},tools);redo.dataset.history='redo';redo.disabled=!future.length;
      var header=element('div','tc-object-header');element('span','tc-object-eyebrow',item?'SELECTED OBJECT':'PROPERTIES',header);
      var heading=element('h4','tc-object-name',item?itemName(item):'Select an object',header);heading.id='tc-object-name';
      if(item){var node=itemNode(item);element('span','tc-object-type',item.type==='text'?'Text':item.type==='shape'?'Shape':node&&node.kind==='illustration'?'Illustration':'Plot',header);
        if(node && safeImage(node.finished.url)){var thumb=element('img','tc-object-thumbnail');thumb.src=node.finished.url;thumb.alt='Selected: '+itemName(item);}
        element('p','tc-object-scope',item.type==='shape'?'Edit this shape independently. Add text as a separate object.':item.type==='text'?'Edit this text and its placement on the page.':'Changes below affect this object on the page. Edit the original plot or illustration in Workspace.');
      }else element('p','tc-object-scope','Click a shape, figure or text on the page, or choose it from Layers below.',header);
      function group(title){var box=element('fieldset','tc-property-group');element('legend','',title,box);return box;}
      if(item){
        var geometry=group('Position & size'),content=group(item.type==='text'?'Text style':item.type==='shape'?'Shape style':'Caption');
        if(item.type==='figure'){var lockLabel=element('label','tc-property-check',undefined,geometry),lock=document.createElement('input');lock.type='checkbox';lock.checked=aspectLocked;lockLabel.appendChild(lock);lockLabel.appendChild(document.createTextNode('Lock proportions'));lock.addEventListener('change',function(){aspectLocked=lock.checked;});}
        (item.type==='text'?['x','y','width','height','z','text','fontSize','color']:item.type==='shape'?['x','y','width','height','z','strokeWidth'].concat(item.shape==='rectangle'?['radius']:[]):['x','y','width','height','z','caption']).forEach(function(key){
          var label=element('label',key==='caption'||key==='text'?'tc-property-wide':'',undefined,['text','fontSize','color','caption','strokeWidth','radius'].includes(key)?content:geometry),input=document.createElement(key==='text'?'textarea':'input');
          var name=key==='strokeWidth'?'Border width (pt)':key==='radius'?'Corner radius (pt)':key==='fontSize'?'Font size (pt)':key==='z'?'Layer':key.charAt(0).toUpperCase()+key.slice(1)+(['caption','text','color','z'].includes(key)?'':' (pt)');label.appendChild(document.createTextNode(name));
          if(key!=='text')input.type=key==='color'?'color':key==='caption'?'text':'number';else input.maxLength=2000;
          input.value=item[key];input.dataset.itemKey=key;input.setAttribute('aria-label',name);input.addEventListener('input',function(){if(input.dataset.draft==='1'||selected!==item.id||input.value==='')return;editItem(item,key,input.value);});input.addEventListener('change',function(){if(selected!==item.id)return;var live=documentState && documentState.items.find(function(i){return i.id===item.id;});if(live && String(live[key])===input.value)return;var updated=editItem(item,key,input.value);if(updated)input.value=updated[key];});input.addEventListener('blur',function(){if(selected!==item.id)return;var live=documentState&&documentState.items.find(function(i){return i.id===item.id;});if(live&&String(live[key])!==input.value){var updated=editItem(live,key,input.value);if(updated)input.value=updated[key];}});label.appendChild(input);
        });
        if(item.type==='shape') ['fill','stroke'].forEach(function(key){
          if(key==='fill' && ['line','arrow'].includes(item.shape))return;
          var label=element('label','tc-property-wide',key==='fill'?'Fill':'Border',content),picker=element('input','',undefined,label);picker.type='color';picker.value=item[key]==='none'?'#315c89':item[key];picker.setAttribute('aria-label',key==='fill'?'Shape fill':'Shape border');picker.addEventListener('input',function(){editItem(item,key,picker.value);});
          var none=button(item[key]==='none'?'Restore color':'No color',function(){editItem(item,key,item[key]==='none'?picker.value:'none');showInspector(true);},label);none.setAttribute('aria-label',key==='fill'?'Toggle shape fill':'Toggle shape border');
        });
        var actions=element('div','tc-object-actions');
        button('Bring forward',function(){var sorted=documentState.items.slice().sort(function(a,b){return a.z-b.z;}),at=sorted.findIndex(function(i){return i.id===item.id;});if(at<sorted.length-1){var next=sorted[at+1];sorted[at+1]=sorted[at];sorted[at]=next;sorted.forEach(function(i,z){i.z=z;});saveDocument();refresh();}},actions);
        button('Send backward',function(){var sorted=documentState.items.slice().sort(function(a,b){return a.z-b.z;}),at=sorted.findIndex(function(i){return i.id===item.id;});if(at>0){var prev=sorted[at-1];sorted[at-1]=sorted[at];sorted[at]=prev;sorted.forEach(function(i,z){i.z=z;});saveDocument();refresh();}},actions);
        if(item.type!=='figure')button('Duplicate',function(){if(documentState.items.length>=80)return;var copy=JSON.parse(JSON.stringify(item)),dims=size(readSettings());copy.id='copy-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);copy.x=Math.min(dims[0]-copy.width,copy.x+16);copy.y=Math.min(dims[1]-copy.height,copy.y+16);copy.z=Math.min(10000,Math.max.apply(null,documentState.items.map(function(i){return i.z;}))+1);documentState.items.push(copy);selected=copy.id;saveDocument();refresh();},actions);
        if(item.type==='shape')button('Remove shape',function(){documentState.items=documentState.items.filter(function(i){return i.id!==item.id;});selected=null;saveDocument();refresh();},actions);
        if(item.type==='text')button('Remove text',function(){documentState.items=documentState.items.filter(function(i){return i.id!==item.id;});selected=null;saveDocument();refresh();});
      }
      var layers=element('details','tc-object-layers');layers.open=true;element('summary','', 'Layers · '+(documentState?documentState.items.length:0),layers);var list=element('div','tc-layer-list',undefined,layers);
      if(documentState)documentState.items.slice().sort(function(a,b){return b.z-a.z;}).forEach(function(layer){var node=itemNode(layer),row=button('',function(){selectItem(layer.id);var target=pages.querySelector('.tc-free-item.selected');if(target)target.scrollIntoView({block:'nearest',inline:'nearest'});},list);row.className='tc-layer-row';row.dataset.layerId=layer.id;row.addEventListener('mouseenter',function(){pages.querySelectorAll('.tc-free-item').forEach(function(el){el.classList.toggle('tc-layer-hover',el.dataset.itemId===layer.id);});});row.addEventListener('mouseleave',function(){pages.querySelectorAll('.tc-layer-hover').forEach(function(el){el.classList.remove('tc-layer-hover');});});row.setAttribute('aria-pressed',String(layer.id===selected));row.setAttribute('aria-label','Select '+itemName(layer));
        element('span','tc-layer-icon',layer.type==='text'?'T':layer.type==='shape'?'◇':node&&node.kind==='illustration'?'◇':'▥',row);element('span','tc-layer-name',itemName(layer),row);
      });
      var guideLabel=element('label','tc-property-check'),guideInput=document.createElement('input');guideInput.type='checkbox';guideInput.checked=guides;guideLabel.appendChild(guideInput);guideLabel.appendChild(document.createTextNode('Page guides'));guideInput.addEventListener('change',function(){guides=guideInput.checked;if(current)render(current);});
    }
    function model(captured) {
      var dimensions = size(captured.settings), width = dimensions[0], height = dimensions[1], margin = 46, top = 66, bottom = 52;
      var nodes = captured.state.nodes, result = [];
      function page(items) { return {width:width,height:height,items:items}; }
      if (captured.settings.layout === 'free') {
        result.push(page(captured.document.items.slice().sort(function(a,b){return a.z-b.z;}).map(function(item){ var index=nodes.findIndex(function(n){return n.id===item.nodeId;}); return Object.assign({},item,{node:nodes[index],index:index}); })));
      } else if (captured.settings.layout === 'figure1') {
        var w=width-2*margin,h=height-top-100,slots=[],pcaIndex=nodes.findIndex(function (n) { return n.id==='results_dashboard-plot_pca' || n.id==='qc_pca_tab-pca2dPlot'; });
        function slot(caption,note,x,y,sw,sh,index) { slots.push({caption:caption,note:note,node:index>=0?nodes[index]:null,index:index,x:margin+x*w,y:top+y*h,width:sw*w,height:sh*h}); }
        var art=nodes.map(function(n,i){return {n:n,i:i};}).filter(function(a){return a.n.kind==='illustration';});
        if (!art.length) slot('A / Study workflow · illustration','Add and finish illustrations in Workspace',0,0,1,.18,-1);
        else { var columns=Math.min(4,art.length),rows=Math.ceil(art.length/columns);art.forEach(function(a,j){slot((j===0?'A / ':'')+a.n.label+' · schematic', '',(j%columns)/columns,Math.floor(j/columns)*.18/rows,.96/columns,.17/rows,a.i);}); }
        slot('B / PCA'+(pcaIndex>=0?' · '+nodes[pcaIndex].label:''),'Finish a 2D PCA in Workspace',0,.22,.4,.43,pcaIndex);
        ['LPA','LPC','LPI','CL'].forEach(function (name,i) { slot('C / '+name,'Log2FC method pending',.44+(i%2)*.29,.22+Math.floor(i/2)*.225,.27,.205,-1); });
        ['AA (Sn2) target','PE 18:0_20:4','PC 16:0_20:4','PC 18:0_20:4'].forEach(function (name,i) { slot('D / '+name,i?'Selection and scale pending':'AA definition and sn position pending',i*.255,.7,.235,.3,-1); });
        var draft=page(slots);draft.draft=true;draft.legend='DRAFT · A: '+(art.length?'schematic, not to scale; review workflow.':'illustration pending.')+' C: class Log2FC and model pending. D: targets, scale and sn-position evidence pending.';result.push(draft);
      } else if (captured.settings.layout === 'pages') {
        nodes.forEach(function (node, i) { result.push(page([{node:node,index:i,x:margin,y:top,width:width-2*margin,height:height-top-bottom}])); });
      } else {
        var minX = Math.min.apply(null,nodes.map(function (n) { return n.x; })), minY = Math.min.apply(null,nodes.map(function (n) { return n.y; }));
        var maxX = Math.max.apply(null,nodes.map(function (n) { return n.x+n.width; })), maxY = Math.max.apply(null,nodes.map(function (n) { return n.y+n.height; }));
        var scale = Math.min((width-2*margin)/(maxX-minX),(height-top-bottom)/(maxY-minY));
        result.push(page(nodes.map(function (node,i) { return {node:node,index:i,x:margin+(node.x-minX)*scale,y:top+(node.y-minY)*scale,width:node.width*scale,height:node.height*scale}; })));
      }
      return result;
    }
    function render(captured) {
      renderedState=captured.state;
      pages.replaceChildren();
      model(captured).forEach(function (page, pageIndex, collection) {
        var sheet = document.createElement('article'); sheet.className = 'tc-paper'+(page.draft?' tc-paper-draft':''); sheet.style.aspectRatio = page.width + ' / ' + page.height; sheet.dataset.previewWidth=page.width;sheet.dataset.previewHeight=page.height;
        if(guides && captured.settings.layout==='free') sheet.classList.add('tc-paper-guides');
        sheet.setAttribute('aria-label', 'Page ' + (pageIndex+1) + ' of ' + collection.length);
        if(page.draft || captured.settings.showPageFurniture){var heading = document.createElement('div'); heading.className = 'tc-paper-heading'; heading.textContent = page.draft ? 'FIGURE 1 / DRAFT — PENDING PANELS' : 'FIGURE CANVAS'; sheet.appendChild(heading);}
        page.items.forEach(function (item) {
          var figure = document.createElement('figure'); figure.className = 'tc-paper-figure';
          figure.style.left = (item.x/page.width*100) + '%'; figure.style.top = (item.y/page.height*100) + '%'; figure.style.width = (item.width/page.width*100) + '%'; figure.style.height = (item.height/page.height*100) + '%';
          if (captured.settings.layout === 'free') {
            figure.classList.add('tc-free-item'); figure.dataset.objectName=itemName(item);figure.dataset.itemId=item.id;figure.tabIndex=0; figure.setAttribute('aria-label', 'Move '+(item.type==='text'?'text':itemName(item))); if (selected===item.id) figure.classList.add('selected');
            figure.addEventListener('focus',function(){commitPendingField();selected=item.id;pages.querySelectorAll('.tc-free-item').forEach(function(el){el.classList.toggle('selected',el===figure);});showInspector(true);selectionDecorations();});
            figure.addEventListener('click',function(){selected=item.id;pages.querySelectorAll('.tc-free-item').forEach(function(el){el.classList.toggle('selected',el===figure);});showInspector(false);selectionDecorations();});
            figure.addEventListener('dblclick',function(event){if(item.type!=='text')return;event.preventDefault();selectItem(item.id);var field=inspector.querySelector('[data-item-key="text"]');if(!field)return;field.dataset.draft='1';var original=field.value;function cancelText(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();field.blur();return;}if(e.key!=='Escape')return;e.preventDefault();e.stopPropagation();field.value=original;delete field.dataset.draft;field.removeEventListener('keydown',cancelText);pages.focus({preventScroll:true});}field.addEventListener('keydown',cancelText);field.addEventListener('blur',function(){delete field.dataset.draft;field.removeEventListener('keydown',cancelText);},{once:true});field.focus();field.select();});
            figure.addEventListener('keydown',function(event){var delta=event.shiftKey?10:1, dx=event.key==='ArrowLeft'?-delta:event.key==='ArrowRight'?delta:0, dy=event.key==='ArrowUp'?-delta:event.key==='ArrowDown'?delta:0; if(dx||dy){event.preventDefault(); var live=documentState.items.find(function(i){return i.id===item.id;}); if(selected!==item.id){selected=item.id;showInspector(true);}live.x+=dx; editItem(live,'y',live.y+dy);var active=pages.querySelector('.tc-free-item.selected');if(active)active.focus({preventScroll:true});}});
            figure.addEventListener('pointerdown',function(event){ if(event.button!==0)return;commitPendingField(); event.preventDefault(); selected=item.id;pages.querySelectorAll('.tc-free-item').forEach(function(el){el.classList.toggle('selected',el===figure);});showInspector(true);selectionDecorations(); var live=documentState.items.find(function(i){return i.id===item.id;}), startX=event.clientX,startY=event.clientY, x=live.x,y=live.y,w=live.width,h=live.height, resize=event.target.classList.contains('tc-free-resize'), rect=sheet.getBoundingClientRect(); figure.setPointerCapture(event.pointerId);
              function move(e){live=documentState.items.find(function(i){return i.id===item.id;});if(!live)return;var dx=(e.clientX-startX)*page.width/rect.width,dy=(e.clientY-startY)*page.height/rect.height; if(resize){if(live.type==='figure' && aspectLocked){var scale=Math.max(20/w,20/h,Math.min((page.width-x)/w,(page.height-y)/h,1+dx/w));live.width=w*scale;live.height=h*scale;}else{live.width=Math.max(20,Math.min(page.width-x,w+dx));live.height=Math.max(20,Math.min(page.height-y,h+dy));}}else{live.x=Math.max(0,Math.min(page.width-w,x+dx));live.y=Math.max(0,Math.min(page.height-h,y+dy));} figure.style.left=live.x/page.width*100+'%';figure.style.top=live.y/page.height*100+'%';figure.style.width=live.width/page.width*100+'%';figure.style.height=live.height/page.height*100+'%';}
              function up(){figure.removeEventListener('pointermove',move);figure.removeEventListener('pointerup',up);figure.removeEventListener('pointercancel',up);if(live && (live.x!==x||live.y!==y||live.width!==w||live.height!==h)){saveDocument();refresh();}} figure.addEventListener('pointermove',move);figure.addEventListener('pointerup',up);figure.addEventListener('pointercancel',up);
            });
          }
          if(item.type==='shape'){figure.classList.add('tc-paper-shape');figure.appendChild(shapeSVG(item));}else if(item.type==='text'){var text=document.createElement('div');text.className='tc-paper-text';text.textContent=wrapText(item).join('\n');text.style.fontSize=(item.fontSize/page.width*100)+'cqw';text.style.color=item.color;figure.appendChild(text);} else {
          var caption = document.createElement('figcaption'); caption.textContent = captured.settings.layout === 'free' ? item.caption : item.caption || String(item.index+1).padStart(2,'0') + ' / ' + item.node.label + (item.node.kind==='illustration'?' · schematic':''); caption.style.fontSize = ((page.draft?8:Math.min(10,Math.max(8,item.width/30)))/page.width*100) + 'cqw'; caption.style.flexBasis = (Math.min(18,item.height*0.15)/item.height*100) + '%'; if (captured.settings.layout !== 'free' || item.caption) figure.appendChild(caption);
          if (item.node) { var image = document.createElement('img'); image.src = item.node.finished.url; image.alt = item.node.label + (item.node.kind==='illustration'?' · schematic':''); figure.appendChild(image); }
          else { var placeholder=document.createElement('div');placeholder.className='tc-paper-placeholder';var pending=document.createElement('strong');pending.textContent='PENDING';var note=document.createElement('span');note.textContent=item.note;placeholder.appendChild(pending);placeholder.appendChild(note);figure.appendChild(placeholder); }
          }
          if (captured.settings.layout === 'free') { var handle=document.createElement('span');handle.className='tc-free-resize';handle.setAttribute('aria-hidden','true');figure.appendChild(handle); }
          sheet.appendChild(figure);
        });
        if (page.draft) { var legend=document.createElement('p');legend.className='tc-paper-draft-legend';legend.textContent=page.legend;sheet.appendChild(legend); }
        if(page.draft || captured.settings.showPageFurniture){var footer = document.createElement('div'); footer.className = 'tc-paper-footer'; footer.textContent = (page.draft ? draftReviewNote+(captured.archived?' · Workspace includes saved snapshots':'') : (captured.archived ? 'Includes saved checkpoint figures' : 'Finished figure snapshots')) + ' · ' + (pageIndex+1) + ' / ' + collection.length; sheet.appendChild(footer);}
        pages.appendChild(sheet);
      });
      showInspector();
      selectionDecorations();
      applyPreviewZoom();
    }
    function controls(ready) { if(!ready)closePublicationConfirmation(false);panel.querySelectorAll('.tc-add-shape').forEach(function(b){b.disabled=!ready||exporting||layout.value!=='free';}); var publicationTrigger=panel.querySelector('.tc-preview-stephania');if(publicationTrigger)publicationTrigger.disabled=!ready || exporting; panel.querySelector('.tc-preview-svg').disabled = !ready || exporting || layout.value !== 'free'; panel.querySelector('.tc-preview-add-text').disabled = !ready || exporting || layout.value !== 'free'; pdfButton.disabled = !ready || exporting || !(window.jspdf && window.jspdf.jsPDF); printButton.disabled = !ready || exporting; }
    function persistNewPlacement(captured,epoch){
      if(!autoPlacementPending||captured.settings.layout!=='free')return;
      queueMicrotask(function(){
        if(!autoPlacementPending||epoch!==generation||current!==captured||panel.hidden||exporting)return;
        try{
          unchanged(captured,epoch);
          if(JSON.stringify(documentState)!==JSON.stringify(captured.document))return;
          replaying=true;try{saveDocument();}finally{replaying=false;}
          current=capture();
        }catch(error){current=null;controls(false);tell(error.message||'The workspace changed before the new placement could be saved. Try again after the workspace settles.');}
      });
    }
    // Nothing to compose yet: say why on the page itself and offer the way back,
    // instead of a blank grey area.
    function backToCanvas() { var t = root.querySelector('#tc-workspace-tab'); if (t) t.click(); }
    function emptyState(message) {
      var box = document.createElement('div'); box.className = 'tc-preview-empty';
      var h = document.createElement('h4'); h.textContent = /^(Finish live plots|Finish every canvas plot|Add plots in Workspace|Add a plot or drawing|Independent plots are still loading|The analysis is updating|Queued add|Saved plots are waiting|The canvas is not ready|A finished figure (needs review|is stale))/.test(message || '') ? 'Nothing to compose yet' : 'This page could not be composed';
      var p = document.createElement('p'); p.textContent = message || 'Finish the plots on the canvas to compose them here.';
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Back to canvas'; b.addEventListener('click', backToCanvas);
      box.append(h, p, b); return box;
    }
    function refresh(silent) {
      closePublicationConfirmation(false);clearTimeout(refreshTimer); exportFailed = false; generation++; current = null;
      try {
        current = capture(); render(current); controls(true); persistNewPlacement(current,generation);
        if(!silent && !errorNotice)tell(placementNotice+(current.settings.layout==='figure1'?'Draft template: illustrations populate A; a finished 2D PCA populates B. C/D remain pending; other plots are omitted. ':'') + model(current).length + ' page' + (model(current).length === 1 ? '' : 's') + ' ready. ' + (current.archived ? (current.settings.layout==='figure1'?'Workspace includes saved checkpoint figures; review the PCA source before use. ':'Includes saved checkpoint figures; edit them to regenerate with current data. ') : '') + (current.settings.layout === 'arrangement' ? 'Canvas positions are preserved on one page. ' : '') + (!(window.jspdf && window.jspdf.jsPDF) ? 'Use Print to save a PDF in your browser.' : ''));
      } catch (error) { if (!busy) pages.replaceChildren(emptyState(error.message)); controls(false); tell(error.message); }
    }
    function invalidate() {
      // Global Shiny output traffic includes click tracing and unrelated controls.
      // Only changed/invalid canonical figure state invalidates an active export.
      if (panel.hidden) { clearDownloadFallback();generation++;current=null;controls(false);clearTimeout(refreshTimer);return; }
      if (busy) return;
      try { if (current && !exportFailed && capture().signature === current.signature) return; } catch (error) { /* A scientific readiness failure invalidates the preview. */ }
      generation++; controls(false); current = null;
      clearTimeout(refreshTimer);
      if (!panel.hidden && !exporting) refreshTimer = setTimeout(refresh,80);
    }
    function unchanged(captured, epoch) {
      if (epoch !== generation || capture().signature !== captured.signature) throw new Error('The workspace changed during export. Try the export again after the workspace settles.');
    }
    async function settled() {
      var deadline = Date.now() + 15000;
      while (busy) {
        if (Date.now() > deadline) throw new Error('The analysis is still updating. Wait for it to finish and retry the export.');
        await new Promise(function (resolve) { setTimeout(resolve,25); });
      }
    }
    async function decoded(captured, epoch) {
      return Promise.all(captured.state.nodes.map(async function (node) {
        var image = new Image(); image.src = node.finished.url;
        await image.decode(); await settled(); unchanged(captured,epoch);
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 16000 || image.naturalHeight > 16000 || image.naturalWidth * image.naturalHeight > 64000000) throw new Error('A finished image has unusable dimensions. Resize and finish it again.');
        return image;
      }));
    }
    function fit(image, item) {
      var caption = item.type === 'figure' && !item.caption ? 0 : Math.min(18, item.height*0.15), ratio = Math.min(item.width/image.naturalWidth, (item.height-caption)/image.naturalHeight);
      return {x:item.x+(item.width-image.naturalWidth*ratio)/2,y:item.y+caption+(item.height-caption-image.naturalHeight*ratio)/2,width:image.naturalWidth*ratio,height:image.naturalHeight*ratio};
    }

    function shapePath(item){
      var p=Math.min(item.strokeWidth/2+0.1,Math.min(item.width,item.height)/2-0.1),w=item.width,h=item.height,r=Math.min(item.radius||0,(w-2*p)/2,(h-2*p)/2);
      if(item.shape==='rectangle')return 'M '+(p+r)+' '+p+' H '+(w-p-r)+' Q '+(w-p)+' '+p+' '+(w-p)+' '+(p+r)+' V '+(h-p-r)+' Q '+(w-p)+' '+(h-p)+' '+(w-p-r)+' '+(h-p)+' H '+(p+r)+' Q '+p+' '+(h-p)+' '+p+' '+(h-p-r)+' V '+(p+r)+' Q '+p+' '+p+' '+(p+r)+' '+p+' Z';
      if(item.shape==='ellipse'){var rx=(w-2*p)/2,ry=(h-2*p)/2;return 'M '+p+' '+h/2+' a '+rx+' '+ry+' 0 1 0 '+(2*rx)+' 0 a '+rx+' '+ry+' 0 1 0 '+(-2*rx)+' 0 Z';}
      var tip=w-p,cy=h/2,head=Math.min(h/2-p,w/3,Math.max(8,item.strokeWidth*4));
      return 'M '+p+' '+cy+' H '+tip+(item.shape==='arrow'?' M '+(tip-head)+' '+(cy-head)+' L '+tip+' '+cy+' L '+(tip-head)+' '+(cy+head):'');
    }
    function shapeSVG(item){var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');svg.setAttribute('xmlns',ns);svg.setAttribute('viewBox','0 0 '+item.width+' '+item.height);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');path.setAttribute('d',shapePath(item));path.setAttribute('fill',['line','arrow'].includes(item.shape)?'none':item.fill);path.setAttribute('stroke',item.stroke);path.setAttribute('stroke-width',item.strokeWidth);path.setAttribute('stroke-linejoin','round');svg.appendChild(path);return svg;}
    function drawShape(context,item){context.save();context.translate(item.x,item.y);var path=new Path2D(shapePath(item));context.lineWidth=item.strokeWidth;context.lineJoin='round';if(!['line','arrow'].includes(item.shape)&&item.fill!=='none'){context.fillStyle=item.fill;context.fill(path);}if(item.stroke!=='none'&&item.strokeWidth>0){context.strokeStyle=item.stroke;context.stroke(path);}context.restore();}

    function wrapText(item) {
      var context=document.createElement('canvas').getContext('2d');context.font=item.fontSize+'px Arial, sans-serif';var lines=[];
      item.text.split('\n').forEach(function(paragraph){
        if(!paragraph){lines.push('');return;} var line='';
        Array.from(paragraph).forEach(function(ch){var candidate=line+ch;if(line && context.measureText(candidate).width>item.width){lines.push(line);line=ch;}else line=candidate;});lines.push(line);
      });return lines;
    }
    function inlineSVG(url, box, index, group, image) {
      var comma=url.indexOf(','),prefix=url.slice(0,comma),encoded=url.slice(comma+1),markup=/;base64$/i.test(prefix)?atob(encoded):decodeURIComponent(encoded);
      var source=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement, all=[source].concat(Array.from(source.querySelectorAll('*'))), ids={};
      all.forEach(function(node){var id=node.getAttribute('id');if(id)ids[id]='embedded'+index+'-'+id;});
      function replaceRefs(value){return value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,function(match,quote,id){return ids[id]?'url(#'+ids[id]+')':match;}).replace(/^#(.+)$/,function(match,id){return ids[id]?'#'+ids[id]:match;});}
      all.forEach(function(node){Array.from(node.attributes).forEach(function(attr){if(attr.name==='id' && ids[attr.value]) node.setAttribute('id',ids[attr.value]);else {var v=replaceRefs(attr.value);if(v!==attr.value)node.setAttribute(attr.name,v);}});if(node.localName==='style'){var css=replaceRefs(node.textContent);Object.keys(ids).forEach(function(id){css=css.replace(new RegExp('#'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w-])','g'),'#'+ids[id]);});node.textContent=css;}});
      source.setAttribute('x',box.x);source.setAttribute('y',box.y);source.setAttribute('width',box.width);source.setAttribute('height',box.height);
      if(!source.hasAttribute('viewBox'))source.setAttribute('viewBox','0 0 '+image.naturalWidth+' '+image.naturalHeight);
      group.appendChild(document.importNode(source,true));
    }
    function markExportFailure() {
      errorNotice=true;
      var transient = busy || (window.Shiny && Shiny.shinyapp && document.documentElement.classList.contains('shiny-busy'));
      exportFailed = !transient;
      if (transient) current = null;
    }
    function clearDownloadFallback(){if(downloadFallback){downloadFallback.link.remove();URL.revokeObjectURL(downloadFallback.url);downloadFallback=null;}}
    function requestBlobDownload(blob,name,captured,epoch,message){
      clearDownloadFallback();
      var url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.textContent='Download '+name;link.className='tc-preview-download-fallback';
      link.addEventListener('click',function(event){try{unchanged(captured,epoch);}catch(error){event.preventDefault();clearDownloadFallback();tell(error.message);}});
      tell(message+' Download requested. If it did not start, use the download link. ');status.appendChild(link);downloadFallback={url:url,link:link};link.click();
    }
    function exportBusyBegin(label){try{return window.TeamBusy && TeamBusy.begin(label);}catch(e){return null;}}
    function exportBusyEnd(token,error){try{if(window.TeamBusy){if(error&&typeof TeamBusy.fail==='function')TeamBusy.fail(token,error);if(typeof TeamBusy.end==='function')TeamBusy.end(token);}}catch(e){}}
    async function downloadSVG() {
      if(exporting) return;
      errorNotice=false;var busyToken=exportBusyBegin('Preparing SVG'),busyError=null;
      try {
        var captured=capture(), epoch=generation; if(captured.settings.layout!=='free') return;
        closePublicationConfirmation(false);exporting=true;controls(false);tell('Preparing SVG…'); var images=await decoded(captured,epoch);unchanged(captured,epoch);
        var page=model(captured)[0], ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
        svg.setAttribute('xmlns',ns);svg.setAttribute('width',page.width+'pt');svg.setAttribute('height',page.height+'pt');svg.setAttribute('viewBox','0 0 '+page.width+' '+page.height);
        function el(name,attrs,parent){var e=document.createElementNS(ns,name);Object.keys(attrs).forEach(function(k){e.setAttribute(k,String(attrs[k]));});(parent||svg).appendChild(e);return e;}
        el('rect',{x:0,y:0,width:page.width,height:page.height,fill:'#fff'});if(captured.settings.showPageFurniture){var heading=el('text',{x:46,y:35,'font-family':'Arial, sans-serif','font-size':8,fill:'#687579'});heading.textContent='FIGURE CANVAS';}
        var defs=el('defs',{});
        page.items.forEach(function(item,index){
          var clip=el('clipPath',{id:'clip'+index},defs);el('rect',{x:item.x,y:item.y,width:item.width,height:item.height},clip);
          var group=el('g',{'clip-path':'url(#clip'+index+')'});
          if(item.type==='shape'){var shape=shapeSVG(item);shape.setAttribute('x',item.x);shape.setAttribute('y',item.y);shape.setAttribute('width',item.width);shape.setAttribute('height',item.height);group.appendChild(shape);return;}
          if(item.type==='text'){wrapText(item).forEach(function(line,i){var t=el('text',{x:item.x,y:item.y+item.fontSize*(i+1),'font-family':'Arial, sans-serif','font-size':item.fontSize,fill:item.color},group);t.textContent=line;});return;}
          var fontSize=Math.min(10,Math.max(8,item.width/30));if(item.caption){var t=el('text',{x:item.x,y:item.y+fontSize,'font-family':'Arial, sans-serif','font-size':fontSize,fill:'#23343a'},group);t.textContent=item.caption;}
          var box=fit(images[item.index],item),url=item.node.finished.url;if(/^data:image\/svg\+xml/i.test(url))inlineSVG(url,box,index,group,images[item.index]);else el('image',{x:box.x,y:box.y,width:box.width,height:box.height,href:url},group);
        });
        if(captured.settings.showPageFurniture){var footer=el('text',{x:46,y:page.height-28,'font-family':'Arial, sans-serif','font-size':8,fill:'#687579'});footer.textContent=(captured.archived?'Includes saved checkpoint figures':'Finished figure snapshots')+' · 1 / 1';}
        unchanged(captured,epoch);var blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});requestBlobDownload(blob,'figure-canvas.svg',captured,epoch,'Your figure SVG was created.');
      } catch(error){busyError=error.message||'The SVG could not be created.';markExportFailure();tell(busyError);} finally {exportBusyEnd(busyToken,busyError);exporting=false;if(!current&&!panel.hidden)refreshTimer=setTimeout(function(){refresh(true);},80);try{controls(!!current && capture().signature===current.signature);}catch(e){controls(false);}}
    }
    async function downloadPDF() {
      if (exporting) return;
      errorNotice=false;var busyToken=exportBusyBegin('Preparing PDF'),busyError=null;
      var captured, epoch;
      try {
        captured = capture(); current = captured; clearTimeout(refreshTimer); epoch = generation; closePublicationConfirmation(false);exporting = true; controls(false); tell('Preparing your figure pages…');
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF export is unavailable. Use Print to save a PDF in your browser.');
        var images = await decoded(captured,epoch), collection = model(captured);
        var dimensions=size(captured.settings), pdfFormat=captured.settings.paper==='custom'?dimensions:captured.settings.paper, pdfOrientation=captured.settings.paper==='custom'?(dimensions[0]>dimensions[1]?'landscape':'portrait'):captured.settings.orientation;
        var pdf = new window.jspdf.jsPDF({orientation:pdfOrientation,unit:'pt',format:pdfFormat,compress:true});
        collection.forEach(function (page,index) {
          unchanged(captured,epoch);
          if (index) pdf.addPage(pdfFormat,pdfOrientation);
          // Rasterize the page with browser fonts so scientific / Unicode labels survive PDF export.
          var canvas = document.createElement('canvas'), resolution = 3;
          canvas.width = Math.round(page.width*resolution); canvas.height = Math.round(page.height*resolution);
          var context = canvas.getContext('2d'); if (!context) throw new Error('The page could not be prepared.');
          context.scale(resolution,resolution); context.fillStyle = '#fff'; context.fillRect(0,0,page.width,page.height);
          context.fillStyle = '#687579'; context.font = '8px Arial, sans-serif'; if(page.draft || captured.settings.showPageFurniture) context.fillText(page.draft?'FIGURE 1 / DRAFT — PENDING PANELS':'FIGURE CANVAS',46,35);
          page.items.forEach(function (item) {
            if(item.type==='shape'){drawShape(context,item);return;}
            if(item.type==='text'){context.save();context.beginPath();context.rect(item.x,item.y,item.width,item.height);context.clip();context.fillStyle=item.color;context.font=item.fontSize+'px Arial, sans-serif';wrapText(item).forEach(function(line,i){context.fillText(line,item.x,item.y+item.fontSize*(i+1));});context.restore();return;}
            var image = images[item.index], fontSize = page.draft?8:Math.min(10,Math.max(8,item.width/30));
            context.fillStyle = '#23343a'; context.font = fontSize + 'px Arial, sans-serif';
            var label = captured.settings.layout === 'free' ? item.caption : item.caption || String(item.index+1).padStart(2,'0') + ' / ' + item.node.label + (item.node.kind==='illustration'?' · schematic':'');
            if (context.measureText(label).width > item.width) {
              while (label.length && context.measureText(label + '…').width > item.width) label = label.slice(0,-1);
              label += '…';
            }
            if (label) context.fillText(label,item.x,item.y+fontSize);
            if (item.node) { var box=fit(image,item);context.drawImage(image,box.x,box.y,box.width,box.height); }
            else {
              var y=item.y+18,ph=item.height-18;context.fillStyle='#fafbf9';context.fillRect(item.x,y,item.width,ph);
              context.strokeStyle='#cdd6d2';context.setLineDash([3,3]);context.strokeRect(item.x,y,item.width,ph);context.setLineDash([]);
              context.textAlign='center';context.fillStyle='#687579';context.font='bold 8px Arial, sans-serif';context.fillText('PENDING',item.x+item.width/2,y+ph/2-4);
              context.font=Math.min(7,item.width/19)+'px Arial, sans-serif';context.fillText(item.note,item.x+item.width/2,y+ph/2+9,item.width-8);context.textAlign='left';
            }
          });
          context.fillStyle = '#687579'; context.font = '8px Arial, sans-serif';
          if (page.draft) { context.font='7px Arial, sans-serif';context.fillText(page.legend,46,page.height-68);context.font='8px Arial, sans-serif'; }
          if(page.draft || captured.settings.showPageFurniture) context.fillText((page.draft ? draftReviewNote+(captured.archived?' · Workspace includes saved snapshots':'') : (captured.archived ? 'Includes saved checkpoint figures' : 'Finished figure snapshots')) + ' · ' + (index+1) + ' / ' + collection.length,46,page.height-28);
          pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,page.width,page.height,undefined,'FAST');
        });
        unchanged(captured,epoch);var filename=captured.settings.layout==='figure1'?'figure-1-draft.pdf':'figure-canvas.pdf';if(typeof pdf.output==='function')requestBlobDownload(pdf.output('blob'),filename,captured,epoch,'Your figure PDF was created.');else{pdf.save(filename);tell('PDF download requested.');}
      } catch (error) { busyError=error.message || 'The PDF could not be created.'; markExportFailure(); clearTimeout(refreshTimer); tell(busyError); }
      finally { exportBusyEnd(busyToken,busyError); exporting = false; if(!current&&!panel.hidden)refreshTimer=setTimeout(function(){refresh(true);},80); try { controls(!!current && capture().signature === current.signature); } catch (e) { controls(false); } }
    }
    async function printPages() {
      if (exporting) return;
      errorNotice=false;var busyToken=exportBusyBegin('Preparing print'),busyError=null;
      var frame;
      try {
        var captured = capture(), epoch = generation; closePublicationConfirmation(false);exporting = true; controls(false); tell('Preparing pages for print…');
        await decoded(captured,epoch); unchanged(captured,epoch); render(captured);
        frame = document.createElement('iframe'); frame.className = 'tc-print-frame'; frame.title = 'Figure print document'; frame.setAttribute('aria-hidden','true'); document.body.appendChild(frame);
        var doc = frame.contentDocument; doc.open(); doc.write('<!doctype html><html lang="en"><head><title>Figure canvas</title></head><body></body></html>'); doc.close();
        var dimensions = size(captured.settings), style = doc.createElement('style');
        style.textContent = '@page{size:' + dimensions[0] + 'pt ' + dimensions[1] + 'pt;margin:0}body{margin:0;font-family:Arial,sans-serif;color:#23343a}.tc-paper{position:relative;width:' + dimensions[0] + 'pt;height:' + dimensions[1] + 'pt;break-after:page;overflow:hidden;background:white;box-sizing:border-box;container-type:inline-size}.tc-paper:last-child{break-after:auto}.tc-paper-heading{position:absolute;left:7.52%;top:3.2%;font-size:8pt;letter-spacing:2pt;color:#687579}.tc-paper-figure{position:absolute;margin:0;display:flex;flex-direction:column;overflow:hidden}.tc-paper-figure figcaption{font-size:10pt;line-height:1;flex:0 0 18pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tc-paper-figure img{display:block;width:100%;height:0;flex:1 1 0;object-fit:contain;min-height:0}.tc-paper-footer{position:absolute;left:7.52%;bottom:3%;font-size:8pt;color:#687579}.tc-paper-shape>svg{display:block;width:100%;height:100%;flex:1;min-height:0}.tc-paper-text{white-space:pre;overflow:hidden;line-height:1}.tc-paper-placeholder{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6pt;border:1px dashed #cdd6d2;background:#fafbf9;color:#687579;text-align:center;font-size:1.1cqw}.tc-paper-placeholder strong{font-size:1.3cqw;letter-spacing:.1em}.tc-paper-draft-legend{position:absolute;left:7.52%;right:7.52%;bottom:7%;font-size:7pt;color:#687579}';
        doc.head.appendChild(style); Array.from(pages.children).forEach(function (sheet) { var clone=sheet.cloneNode(true); clone.style.removeProperty('width');clone.style.removeProperty('height'); clone.querySelectorAll('.tc-free-resize,.tc-selection-label').forEach(function(el){el.remove();}); doc.body.appendChild(clone); });
        await Promise.all(Array.from(doc.images).map(function (image) { return image.decode(); })); unchanged(captured,epoch);
        frame.contentWindow.addEventListener('afterprint',function () { frame.remove(); setTimeout(function () { if (!panel.hidden && !printButton.disabled) printButton.focus({preventScroll:true}); },0); },{once:true});
        frame.contentWindow.focus(); frame.contentWindow.print(); tell('Print dialog opened. Select Save as PDF for a browser PDF.');
        setTimeout(function () { if (frame && frame.isConnected) frame.remove(); },60000);
      } catch (error) { busyError=error.message || 'The print pages could not be prepared.'; markExportFailure(); clearTimeout(refreshTimer); if (frame) frame.remove(); tell(busyError); }
      finally { exportBusyEnd(busyToken,busyError); exporting = false; if(!current&&!panel.hidden)refreshTimer=setTimeout(function(){refresh(true);},80); try { controls(!!current && capture().signature === current.signature); } catch (e) { controls(false); } }
    }
    var publicationConfirmation=null;
    function closePublicationConfirmation(focusTrigger){
      if(publicationConfirmation){publicationConfirmation.remove();publicationConfirmation=null;}
      var trigger=panel.querySelector('.tc-preview-stephania');
      if(focusTrigger){if(trigger&&trigger.isConnected&&!trigger.disabled)trigger.focus();else{status.setAttribute('tabindex','-1');status.focus();}}
    }
    function requestPublicationStyle(){
      if(exporting)return;
      closePublicationConfirmation(false);
      var captured;try{captured=capture();}catch(error){tell(error.message);return;}
      var epoch=generation,box=document.createElement('div'),heading=document.createElement('strong'),description=document.createElement('p'),apply=document.createElement('button'),cancel=document.createElement('button');
      box.className='tc-publication-confirmation';box.setAttribute('role','alertdialog');box.setAttribute('aria-modal','false');box.setAttribute('aria-labelledby','tc-publication-confirm-title');box.setAttribute('aria-describedby','tc-publication-confirm-description');box.style.padding='12px 26px';
      heading.id='tc-publication-confirm-title';heading.textContent='Arrange this page for publication?';
      description.id='tc-publication-confirm-description';description.textContent='Figures and annotations will be rearranged. You can undo this change.';
      apply.type='button';apply.className='tc-publication-apply';apply.textContent='Apply layout';cancel.type='button';cancel.textContent='Cancel';
      apply.addEventListener('click',function(){if(exporting){closePublicationConfirmation(true);tell('Wait for the export to finish before arranging the page.');return;}closePublicationConfirmation(false);try{unchanged(captured,epoch);stephaniaStyle();}catch(error){tell(error.message);}closePublicationConfirmation(true);});
      cancel.addEventListener('click',function(){closePublicationConfirmation(true);});
      box.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePublicationConfirmation(true);}});
      box.append(heading,description,apply,cancel);status.before(box);publicationConfirmation=box;cancel.focus();
    }
    function stephaniaStyle() {
      if(exporting)return;
      var captured;try {captured=capture();}catch(error){tell(error.message);return;}
      if(!documentState){syncDocument(captured.state,captured.settings);}
      var nodes=captured.state.nodes, old=documentState.items, figures=nodes.map(function(n,index){var item=old.find(function(i){return i.type==='figure'&&i.nodeId===n.id;});return item?Object.assign({},item):{id:'figure-'+index+'-'+n.id.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,130),nodeId:n.id,type:'figure',caption:'',z:index};});
      function generatedLabel(i){var match=i.type==='text' && /^stephania-panel-([A-Z]+)(?:-\d+)?$/.exec(i.id);return !!match && i.text===match[1];}
      var existingShapes=old.filter(function(i){return i.type==='shape';}).map(function(i){return Object.assign({},i);});
      var existingText=old.filter(function(i){return i.type==='text' && !generatedLabel(i);}).map(function(i){return Object.assign({},i);}), placed=[];
      function take(test){var at=figures.findIndex(function(i){return test(nodes.find(function(n){return n.id===i.nodeId;}));});return at<0?null:figures.splice(at,1)[0];}
      function put(item,x,y,w,h){if(!item)return;item.x=x;item.y=y;item.width=w;item.height=h;item.z=placed.length;placed.push(item);}
      // Retain the user's print composition, including independent labels/connectors.
      var illustrations=figures.filter(function(i){var n=nodes.find(function(n){return n.id===i.nodeId;});return n&&n.kind==='illustration';});
      figures=figures.filter(function(i){return !illustrations.includes(i);});
      // Publication composition is generic: a compact visual header followed by
      // the available real analyses in a balanced two-column grid. Nothing is
      // fabricated when a panel is missing, and every object remains editable.
      illustrations.forEach(function(item,index){
        var n=nodes.find(function(n){return n.id===item.nodeId;});
        if(!['x','y','width','height'].every(function(k){return Number.isFinite(item[k]);})){Object.assign(item,{x:n.x,y:n.y,width:n.width,height:n.height});}
        placed.push(item);
      });
      var annotations=existingShapes.concat(existingText),preserved=illustrations.slice(),gap=16;
      function overlaps(x,y,w,h,i,padding){return x<i.x+i.width+padding&&x+w+padding>i.x&&y<i.y+i.height+padding&&y+h+padding>i.y;}
      function collisions(x,y,w,h){return preserved.filter(function(i){return overlaps(x,y,w,h,i,gap);});}
      var primaryY=illustrations.length?Math.max.apply(null,illustrations.map(function(i){return i.y+i.height;}))+gap:45;
      var extraY=primaryY,cursorY=extraY,column=0,rowHeight=0;
      figures.forEach(function(item){
        var w=439.5,h=280,header=28;
        var fullRow=/heatmap|network|pathway/i.test(item.nodeId),
          useW=fullRow?895:w,useH=fullRow?520:h;
        if(fullRow&&column){cursorY+=rowHeight+gap;column=0;rowHeight=0;}
        var x=fullRow?45:45+column*(w+gap),blocked=collisions(x,cursorY,useW,useH+header);
        while(blocked.length){cursorY=Math.max.apply(null,blocked.map(function(i){return i.y+i.height+gap;}));column=0;rowHeight=0;x=45;blocked=collisions(x,cursorY,useW,useH+header);}
        put(item,x,cursorY+header,useW,useH);rowHeight=Math.max(rowHeight,useH+header);if(fullRow||column===1){cursorY+=rowHeight+gap;column=0;rowHeight=0;}else column=1;
      });
      if(column)cursorY+=rowHeight+gap;
      // Move the existing annotation cluster as one unit below the figures.
      // Relative geometry, content and stacking remain unchanged, and Undo
      // restores its original position together with the entire layout.
      if(annotations.length){var annotationTop=Math.min.apply(null,annotations.map(function(i){return i.y;})),offset=cursorY-annotationTop;annotations.forEach(function(i){i.y+=offset;});}
      preserved=illustrations.concat(annotations);
      var publicationHeight=Math.max(850,cursorY+20,preserved.reduce(function(m,i){return Math.max(m,i.y+i.height+20);},0));
      if(publicationHeight>3000||preserved.some(function(i){return i.x<0||i.y<0||i.width<20||i.height<20||i.x+i.width>980||i.y+i.height>3000;})){tell('These figures need more than one publication page. Choose One plot per page or remove an object. The current layout was kept.');return;}
      var labels=[],labelIndex=0;
      function panelName(n){var name='';do{name=String.fromCharCode(65+n%26)+name;n=Math.floor(n/26)-1;}while(n>=0);return name;}
      if(illustrations.length) {
        var artY=Math.min.apply(null,illustrations.map(function(i){return i.y;})),artX=20;
        if(preserved.some(function(i){return overlaps(artX,artY,20,28,i,0);})||figures.some(function(i){return overlaps(artX,artY,20,28,{x:i.x,y:i.y-28,width:20,height:28},0);})){
          var spot=null;for(var sy=0;sy+28<=publicationHeight && !spot;sy+=30)for(var sx=0;sx+20<=980;sx+=25)if(!preserved.some(function(i){return overlaps(sx,sy,20,28,i,0);})&&!figures.some(function(i){return overlaps(sx,sy,20,28,i,0)||overlaps(sx,sy,20,28,{x:i.x,y:i.y-28,width:20,height:28},0);})) {spot=[sx,sy];break;}
          if(!spot){tell('Publication labels would overlap an existing object. The current layout was kept.');return;}artX=spot[0];artY=spot[1];
        }
        labels.push([panelName(labelIndex++),artX,artY]);
      }
      figures.forEach(function(item){labels.push([panelName(labelIndex++),item.x,item.y-28]);});
      if(placed.length+existingText.length+existingShapes.length+labels.length>80){tell('The style needs room for the panel labels. Remove some objects first.');return;}
      if(labels.some(function(l){return preserved.some(function(i){return overlaps(l[1],l[2],20,28,i,0);});})){tell('Publication labels would overlap an existing object. The current layout was kept. Move the labels manually or choose One plot per page.');return;}
      var ids=new Set(placed.concat(existingText,existingShapes).map(function(i){return i.id;}));labels.forEach(function(label){var id='stephania-panel-'+label[0],suffix=1;while(ids.has(id))id='stephania-panel-'+label[0]+'-'+suffix++;ids.add(id);placed.push({id:id,type:'text',x:label[1],y:label[2],width:20,height:28,text:label[0],fontSize:22,color:'#000000',z:placed.length});});
      placed.push.apply(placed,existingText);placed.push.apply(placed,existingShapes);
      documentState={version:'1',layout:'free',paper:'custom',orientation:'landscape',paperWidth:980,paperHeight:publicationHeight,showPageFurniture:false,items:placed};selected=null;applyDocumentSettings(documentState);saveDocument();refresh();tell('Page arranged. Additional plots continue below the primary panels. You can move or resize any item.');
    }

    var shapeMenu=document.createElement('details');shapeMenu.className='tc-shape-menu';var shapeSummary=document.createElement('summary');shapeSummary.textContent='Add shape';shapeMenu.appendChild(shapeSummary);panel.querySelector('.tc-preview-add-text').before(shapeMenu);
    var drawButton=document.createElement('button');drawButton.type='button';drawButton.className='tc-draw-primitives';drawButton.textContent='Shapes & text';drawButton.addEventListener('click',function(){select(root.querySelector('#tc-preview-tab'),false);shapeMenu.open=true;shapeSummary.focus();});var workspaceTools=root.querySelector('.tc-toolbar');if(workspaceTools)workspaceTools.appendChild(drawButton);
    var shapeChoices=document.createElement('div');shapeChoices.className='tc-shape-choices';shapeMenu.appendChild(shapeChoices);
    [['rectangle','Rectangle','▭'],['rounded','Rounded rectangle','▢'],['ellipse','Circle / ellipse','○'],['line','Line','╱'],['arrow','Arrow','→']].forEach(function(choice){var b=document.createElement('button');b.type='button';b.className='tc-add-shape';b.setAttribute('aria-label','Add '+choice[1]);var icon=document.createElement('span');icon.textContent=choice[2];icon.setAttribute('aria-hidden','true');b.appendChild(icon);b.appendChild(document.createTextNode(choice[1]));b.addEventListener('click',function(){if(layout.value!=='free'||exporting)return;var captured;try{captured=capture();}catch(e){tell(e.message);return;}if(documentState.items.length>=80){tell('A document can contain up to 80 items.');return;}var dims=size(readSettings()),kind=choice[0]==='rounded'?'rectangle':choice[0],w=kind==='ellipse'?64:160,h=kind==='ellipse'?64:['line','arrow'].includes(kind)?30:80;w=Math.min(w,dims[0]-20);h=Math.min(h,dims[1]-20);var item={id:'shape-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),type:'shape',shape:kind,x:Math.min(46,dims[0]-w),y:Math.min(46,dims[1]-h),width:w,height:h,z:Math.min(10000,documentState.items.reduce(function(m,i){return Math.max(m,i.z);},0)+1),fill:['line','arrow'].includes(kind)?'none':'#eaf3f8',stroke:'#315c89',strokeWidth:2};if(!['line','arrow'].includes(kind))item.radius=choice[0]==='rounded'?12:0;documentState.items.push(item);selected=item.id;shapeMenu.open=false;saveDocument();refresh();});shapeChoices.appendChild(b);});
    shapeMenu.addEventListener('keydown',function(e){if(e.key==='Escape'){e.stopPropagation();shapeMenu.open=false;shapeSummary.focus();}});

    panel.querySelector('.tc-preview-stephania').addEventListener('click',requestPublicationStyle);
    panel.querySelector('.tc-preview-add-text').addEventListener('click',function(){if(!documentState || documentState.items.length>=80){tell('A document can contain up to 80 items.');return;} var id='text-'+Date.now()+'-'+Math.random().toString(36).slice(2,8); var below=documentState.items.reduce(function(m,i){var b=(+i.y||0)+(+i.height||0);return Number.isFinite(b)?Math.max(m,b):m;},0);/* New text goes under what is already on the page, not over the figure titles. */var pageH=current&&current.settings?size(current.settings)[1]:792,textY=below?Math.round(below+16):46;if(textY+50>pageH-24)textY=46;/* no room below: top margin */documentState.items.push({id:id,type:'text',x:46,y:textY,width:220,height:50,text:'Text',fontSize:16,color:'#172d4b',z:documentState.items.reduce(function(m,i){return Math.max(m,i.z);},0)+1});selected=id;saveDocument();refresh();});
    panel.querySelector('.tc-preview-svg').addEventListener('click',downloadSVG);
    window.addEventListener('team-canvas-changed',invalidate);
    [layout,paper,orientation,customWidth,customHeight,furniture].forEach(function (control) { control.addEventListener('change',function(){ updatePaperControls();refresh(); if(documentState && current){syncDocument(current.state,current.settings);documentState.layout=layout.value;documentState.showPageFurniture=furniture.checked;documentState.paper=paper.value;documentState.orientation=orientation.value;if(paper.value==='custom'){documentState.paperWidth=current.settings.paperWidth;documentState.paperHeight=current.settings.paperHeight;}else{delete documentState.paperWidth;delete documentState.paperHeight;}saveDocument();} }); });
    pdfButton.addEventListener('click',downloadPDF); printButton.addEventListener('click',printPages);
    window.addEventListener('team-document-restored',function(){documentState=null;restored=false;lastSaved=null;history=[];future=[];restoreDocument();if(!panel.hidden){if(exporting){generation++;current=null;controls(false);}else refresh();}});
    window.addEventListener('team-preparation-state',function (event) {
      var state = event.detail, signature = JSON.stringify(state ? [state.ready,state.pending,state.running,state.revision] : null);
      if (signature === preparationSignature) return;
      preparationSignature = signature; generation++; current = null; controls(false);
      clearTimeout(refreshTimer);
      if (!exporting && !panel.hidden) refreshTimer = setTimeout(refresh,80);
    });
    var idleReconcilePending=false;
    function setPreviewIdle(){if(!busy)return;busy=false;invalidate();if(current&&!exporting)controls(true);}
    function reconcileIdle(){if(!busy||idleReconcilePending||!window.Shiny||!Shiny.shinyapp)return;idleReconcilePending=true;queueMicrotask(function(){queueMicrotask(function(){idleReconcilePending=false;if(busy&&!document.documentElement.classList.contains('shiny-busy'))setPreviewIdle();});});}
    window.addEventListener('team-canvas-idle',function(){reconcileIdle();});
    if (window.jQuery) jQuery(document).on('shiny:busy',function () { busy = true;controls(false);reconcileIdle(); }).on('shiny:idle',setPreviewIdle).on('shiny:error shiny:value',invalidate);
    if(window.Shiny&&Shiny.shinyapp)new MutationObserver(reconcileIdle).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
