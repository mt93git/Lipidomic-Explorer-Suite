/* Team-only navigation. World coordinates and scientific/checkpoint state stay unchanged. */
(function () {
  'use strict';
  var api = window.TeamCanvasViewport = { scale: 1 };
  api.mount = function (root, board) {
    var scroll = board.closest('.tc-scroll');
    if (!scroll || root.querySelector('.tc-navigation')) return;
    var scale = 1, queued = false, dragging = false;
    // Shiny1.14 corrects image measurements for currentCSSZoom, but not transforms.
    // Without that DOM support keep logical size at100%; panning remains available.
    var zoomSupported = Number.isFinite(board.currentCSSZoom) && board.currentCSSZoom > 0 && window.CSS && CSS.supports('zoom','1');
    var spacer = document.createElement('div'); spacer.className = 'tc-world-space';
    board.before(spacer); spacer.appendChild(board); board.classList.add('tc-world-board');
    var shell=document.createElement('div');shell.className='tc-viewport-shell';scroll.before(shell);shell.appendChild(scroll);
    var nav = document.createElement('div'); nav.className = 'tc-navigation'; nav.setAttribute('aria-label','Canvas navigation');
    nav.innerHTML = '<details class="tc-map" open><summary>Minimap</summary><svg tabindex="0" role="img" aria-label="Canvas minimap. Click or drag to navigate; use arrow keys to pan." preserveAspectRatio="none"><g class="tc-map-nodes"></g><rect class="tc-map-window"/></svg></details><div class="tc-zoom-controls" role="group" aria-label="Canvas zoom"><button type="button" class="tc-zoom-out" aria-label="Zoom out">−</button><button type="button" class="tc-zoom-reset" aria-label="Reset canvas zoom to 100%" title="Reset to 100%">100%</button><button type="button" class="tc-zoom-in" aria-label="Zoom in">+</button><button type="button" class="tc-zoom-fit">Fit all</button></div>';
    shell.appendChild(nav);
    // The minimap can be moved anywhere inside the canvas; its place is remembered
    // per browser and pulled back inside when the canvas gets smaller.
    var grip=document.createElement('button');grip.type='button';grip.className='tc-map-grip';grip.textContent='⠿';
    grip.setAttribute('aria-label','Move minimap (drag, or use arrow keys)');grip.title='Drag to move the minimap';nav.appendChild(grip);
    var MAP_KEY='team.canvas.minimap.position';
    function placeMap(x,y,save){
      // A hidden canvas (compose view, 3D cell) measures 0: never clamp or save then.
      if(!shell.clientWidth||!shell.clientHeight||!nav.offsetWidth)return;
      var maxX=Math.max(0,shell.clientWidth-nav.offsetWidth-4),maxY=Math.max(0,shell.clientHeight-nav.offsetHeight-4);
      x=Math.round(Math.max(4,Math.min(maxX,x)));y=Math.round(Math.max(4,Math.min(maxY,y)));
      nav.style.setProperty('left',x+'px','important');nav.style.setProperty('top',y+'px','important');
      nav.style.setProperty('bottom','auto','important');nav.style.setProperty('right','auto','important');nav.classList.add('is-placed');
      if(save){try{localStorage.setItem(MAP_KEY,JSON.stringify({x:x,y:y}));}catch(e){}}
    }
    function restoreMap(){var saved=null;try{saved=JSON.parse(localStorage.getItem(MAP_KEY)||'null');}catch(e){}
      if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)&&shell.clientWidth)placeMap(saved.x,saved.y,false);}
    grip.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();grip.setPointerCapture(e.pointerId);
      var start={x:e.clientX,y:e.clientY,l:nav.offsetLeft,t:nav.offsetTop},moved=false;nav.classList.add('is-dragging');
      function move(ev){if(Math.abs(ev.clientX-start.x)+Math.abs(ev.clientY-start.y)<3&&!moved)return;moved=true;placeMap(start.l+ev.clientX-start.x,start.t+ev.clientY-start.y,false);}
      function end(){grip.removeEventListener('pointermove',move);nav.classList.remove('is-dragging');if(moved)placeMap(nav.offsetLeft,nav.offsetTop,true);}
      grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',end,{once:true});grip.addEventListener('pointercancel',end,{once:true});});
    grip.addEventListener('keydown',function(e){var d={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(!d)return;e.preventDefault();placeMap(nav.offsetLeft+d[0],nav.offsetTop+d[1],true);});
    // Pull a placed minimap back inside when the visible canvas shrinks.
    if(window.ResizeObserver)new ResizeObserver(function(){if(nav.classList.contains('is-placed'))placeMap(nav.offsetLeft,nav.offsetTop,false);else restoreMap();}).observe(shell);
    requestAnimationFrame(function(){requestAnimationFrame(restoreMap);});
    var focusButton=document.createElement('button');focusButton.type='button';focusButton.className='tc-focus-toggle';focusButton.textContent='Expand canvas';focusButton.setAttribute('aria-pressed','false');
    var toolbar=root.querySelector('.tc-mode-tabs')||root.querySelector('.tc-toolbar')||nav;toolbar.appendChild(focusButton);
    // Keep explanations available without reserving a second work area below the board.
    var help=root.querySelector('.tc-save-help'), footnote=root.querySelector('.tc-footnote');
    if(help){
      var summary=help.querySelector('summary');if(summary)summary.textContent='Canvas help';
      if(footnote)help.appendChild(footnote);
      var content=document.createElement('div');content.className='tc-help-content';
      Array.from(help.children).forEach(function(child){if(child!==summary)content.appendChild(child);});help.appendChild(content);
      var tools=root.querySelector('.tc-toolbar');if(tools)tools.appendChild(help);
    }
    var status=root.querySelector('.tc-status');if(status){status.tabIndex=0;status.setAttribute('aria-label','Canvas status');}
    var catalog=root.querySelector('.tc-catalog');
    if(catalog){
      var close=root.querySelector('.tc-library-toggle');
      if(close){close.classList.add('tc-library-edge-toggle');close.setAttribute('aria-controls',catalog.id || 'tc-library-panel');if(!catalog.id)catalog.id='tc-library-panel';root.querySelector('.tc-layout').insertBefore(close,catalog);}
      catalog.addEventListener('keydown',function(e){if(e.key==='Escape'){if(close){e.stopPropagation();close.click();close.focus();}}});
      catalog.addEventListener('click',function(e){var action=e.target.closest('.tc-catalog-action');if(window.innerWidth<=720 && action && !action.disabled && close){close.click();close.focus();}});
    }
    var previousLibraryHidden=null, libraryChangedByUser=false, automaticToggle=false;
    var libraryToggle=root.querySelector('.tc-library-toggle');
    if(libraryToggle)libraryToggle.addEventListener('click',function(){if(root.classList.contains('tc-focus-mode')&&!automaticToggle)libraryChangedByUser=true;});
    function toggleLibrary(){automaticToggle=true;try{libraryToggle.click();}finally{automaticToggle=false;}}
    function setFocusMode(enabled) {
      var layout=root.querySelector('.tc-layout');
      if(enabled){previousLibraryHidden=layout?layout.classList.contains('tc-library-hidden'):null;libraryChangedByUser=false;if(layout && libraryToggle && !previousLibraryHidden)toggleLibrary();}
      else if(layout && libraryToggle && previousLibraryHidden!==null && !libraryChangedByUser && layout.classList.contains('tc-library-hidden')!==previousLibraryHidden)toggleLibrary();
      root.classList.toggle('tc-focus-mode',enabled);focusButton.textContent=enabled?'Exit expanded canvas':'Expand canvas';focusButton.setAttribute('aria-pressed',String(enabled));refresh();window.dispatchEvent(new Event('resize'));
    }
    focusButton.addEventListener('click',function(){setFocusMode(!root.classList.contains('tc-focus-mode'));});
    document.addEventListener('keydown',function(event){if(event.key==='Escape'&&root.classList.contains('tc-focus-mode')){event.preventDefault();setFocusMode(false);focusButton.focus();}});
    var minus=nav.querySelector('.tc-zoom-out'), plus=nav.querySelector('.tc-zoom-in'), reset=nav.querySelector('.tc-zoom-reset'), map=nav.querySelector('svg'), nodes=nav.querySelector('.tc-map-nodes'), frame=nav.querySelector('.tc-map-window');
    function bounds() { return {w:board.offsetWidth,h:board.offsetHeight}; }
    function sizeSpace() {
      var b=bounds();
      spacer.style.width=Math.max(scroll.clientWidth,b.w*scale)+'px';
      spacer.style.height=Math.max(scroll.clientHeight,b.h*scale)+'px';
      if(board.style.transform)board.style.removeProperty('transform');
      var zoom=zoomSupported?String(scale):'';if(board.style.zoom!==zoom)board.style.zoom=zoom;
    }
    function fitViewport() {
      if(!scroll.getClientRects().length)return;
      if(root.classList.contains('tc-focus-mode')){scroll.style.removeProperty('height');return;}
      // Document position keeps ordinary page scrolling from changing the board height.
      var top=scroll.getBoundingClientRect().top+window.scrollY;
      var viewport=window.visualViewport?window.visualViewport.height:window.innerHeight;
      // The shell shows canvas status as a floating notice, so no bottom strip to reserve.
      var height=Math.max(300,viewport-top-(root.classList.contains('ts-shell')?8:42));
      var value=Math.round(height)+'px';if(scroll.style.height!==value)scroll.style.height=value;
    }
    function paint() {
      queued=false;fitViewport();
      if(catalog && scroll.clientHeight){
        catalog.style.height=Math.max(180,scroll.clientHeight-12)+'px';
        var tools=root.querySelector('.tc-toolbar');if(tools)catalog.style.top=(tools.offsetHeight+6)+'px';
        var layout=root.querySelector('.tc-layout');if(close && layout && close.parentElement!==layout)layout.insertBefore(close,catalog);
      }
      if(!scroll.clientWidth || !scroll.clientHeight)return;
      sizeSpace(); var b=bounds(), w=Math.max(b.w,scroll.clientWidth/scale), h=Math.max(b.h,scroll.clientHeight/scale);
      map.setAttribute('viewBox','0 0 '+w+' '+h); nodes.replaceChildren();
      board.querySelectorAll('.tc-node').forEach(function(n){
        var r=document.createElementNS('http://www.w3.org/2000/svg','rect');
        r.setAttribute('x',n.offsetLeft);r.setAttribute('y',n.offsetTop);r.setAttribute('width',n.offsetWidth);r.setAttribute('height',n.offsetHeight);r.setAttribute('rx',12);
        var title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=(n.querySelector('strong')||n).textContent.slice(0,150);r.appendChild(title);nodes.appendChild(r);
      });
      frame.setAttribute('x',scroll.scrollLeft/scale);frame.setAttribute('y',scroll.scrollTop/scale);frame.setAttribute('width',Math.min(w,scroll.clientWidth/scale));frame.setAttribute('height',Math.min(h,scroll.clientHeight/scale));
      reset.textContent=Math.round(scale*100)+'%';minus.disabled=!zoomSupported||scale<=.05;plus.disabled=!zoomSupported||scale>=2;
    }
    function refresh(){if(!queued){queued=true;requestAnimationFrame(paint);}}
    function zoom(next) {
      next=zoomSupported?Math.max(.05,Math.min(2,next)):1; if(!Number.isFinite(next))return;
      var x=(scroll.scrollLeft+scroll.clientWidth/2)/scale,y=(scroll.scrollTop+scroll.clientHeight/2)/scale;
      scale=next;api.scale=scale;sizeSpace();scroll.scrollLeft=x*scale-scroll.clientWidth/2;scroll.scrollTop=y*scale-scroll.clientHeight/2;paint();
      // Plots keep their logical size; re-check them once the zoom settles.
      clearTimeout(api.zoomFitTimer);api.zoomFitTimer=setTimeout(function(){if(window.TeamCanvas&&TeamCanvas.fitAllPlots)TeamCanvas.fitAllPlots();},120);
    }
    // Put a newly-created node in the middle of the visible work area.  This is
    // deliberately an imperative operation: restoring a checkpoint must retain
    // its saved positions and must not steal focus one node at a time.
    function focusNode(node, options) {
      if (!node || !node.isConnected || !scroll.clientWidth || !scroll.clientHeight) return;
      board.querySelectorAll('.tc-node.tc-camera-target').forEach(function(other){other.classList.remove('tc-camera-target');});
      node.classList.add('tc-camera-target');
      var body=node.querySelector('.tc-content');
      if(body && !body.hasAttribute('tabindex')) { body.tabIndex=0; body.setAttribute('aria-label','Scrollable plot content'); }
      var width=node.offsetWidth, height=node.offsetHeight;
      var readable=!!(options&&options.readable);
      var fit=readable?Math.min(1,(scroll.clientWidth-64)/Math.max(1,width)):Math.min(1, (scroll.clientWidth-64)/Math.max(1,width), (scroll.clientHeight-64)/Math.max(1,height));
      if (zoomSupported && (readable || fit < scale)) zoom(Math.max(.05, fit));
      // Leave a half viewport of world space beyond the target so centering is
      // possible even when the node was placed near an original board edge.
      var marginX=scroll.clientWidth/(2*scale), marginY=scroll.clientHeight/(2*scale);
      board.style.width=Math.max(board.offsetWidth,node.offsetLeft+node.offsetWidth+marginX)+'px';
      board.style.height=Math.max(board.offsetHeight,node.offsetTop+node.offsetHeight+marginY)+'px';
      sizeSpace();
      if (options && options.topLeft) { scroll.scrollLeft=0; scroll.scrollTop=0; refresh(); return; }
      scroll.scrollLeft=Math.max(0,(node.offsetLeft+node.offsetWidth/2)*scale-scroll.clientWidth/2);
      scroll.scrollTop=readable?Math.max(0,node.offsetTop*scale-16):Math.max(0,(node.offsetTop+node.offsetHeight/2)*scale-scroll.clientHeight/2);
      // CSS zoom can make offset metrics differ slightly from painted pixels;
      // correct once from the actual rectangles after applying the scroll.
      var sr=scroll.getBoundingClientRect(), nr=node.getBoundingClientRect();
      scroll.scrollLeft=Math.max(0,scroll.scrollLeft+(nr.left+nr.width/2-(sr.left+sr.width/2)));
      scroll.scrollTop=Math.max(0,scroll.scrollTop+(readable?nr.top-sr.top-16:nr.top+nr.height/2-(sr.top+sr.height/2)));
      refresh();
    }
    // Restore positions are data; adjust only the camera once a restored node
    // is available, and only if it does not fit in the visible viewport.
    var restoreNeedsFocus=false, userMoved=false;
    ['wheel','pointerdown','keydown'].forEach(function(name){scroll.addEventListener(name,function(){userMoved=true;},{passive:true});});
    nav.addEventListener('click',function(){userMoved=true;});
    function focusRestoredNode() {
      if (!restoreNeedsFocus || !scroll.clientWidth || !scroll.clientHeight) return;
      var target=board.querySelector('.tc-node.is-selected') || board.querySelector('.tc-node');
      if (!target) return;
      restoreNeedsFocus=false;
      // Several figures: open showing all of them. Cards settle their size as
      // plots render, so fit again once unless the user has moved the view.
      if (board.querySelectorAll('.tc-node').length > 1 && !board.querySelector('.tc-node.is-selected')) {
        fitAll(); userMoved=false;
        setTimeout(function(){ if(!userMoved) fitAll(); }, 2500);
        return;
      }
      var viewport=scroll.getBoundingClientRect(), rect=target.getBoundingClientRect();
      if (rect.left < viewport.left || rect.top < viewport.top || rect.right > viewport.right || rect.bottom > viewport.bottom) focusNode(target);
    }
    window.addEventListener('team-canvas-restored',function(){restoreNeedsFocus=true;requestAnimationFrame(function(){requestAnimationFrame(focusRestoredNode);});});
    api.focusNode=focusNode;
    api.setScale=zoom;
    api.focusNodeForPanel=function(node,panelWidth){
      if(!node||!node.isConnected||!scroll.clientWidth||!scroll.clientHeight)return;
      var width=Math.max(180,scroll.clientWidth-panelWidth-48),height=Math.max(180,scroll.clientHeight-32);
      var fit=Math.min(scale,width/Math.max(1,node.offsetWidth),height/Math.max(1,node.offsetHeight));
      if(zoomSupported&&fit<scale)zoom(Math.max(.05,fit));
      // Camera only: never change a saved plot's left/top, dimensions or data.
      board.style.width=Math.max(board.offsetWidth,node.offsetLeft+node.offsetWidth+(panelWidth+48)/scale)+'px';
      board.style.height=Math.max(board.offsetHeight,node.offsetTop+node.offsetHeight+32/scale)+'px';sizeSpace();
      scroll.scrollLeft=Math.max(0,node.offsetLeft*scale-16);scroll.scrollTop=Math.max(0,node.offsetTop*scale-16);
      var sr=scroll.getBoundingClientRect(),nr=node.getBoundingClientRect();
      scroll.scrollLeft=Math.max(0,scroll.scrollLeft+nr.left-sr.left-16);
      scroll.scrollTop=Math.max(0,scroll.scrollTop+nr.top-sr.top-16);refresh();
    };
    minus.addEventListener('click',function(){zoom(scale/1.25);});plus.addEventListener('click',function(){zoom(scale*1.25);});reset.addEventListener('click',function(){zoom(1);});
    var fitButton=nav.querySelector('.tc-zoom-fit');fitButton.disabled=!zoomSupported;
    if(!zoomSupported)fitButton.title='Zoom is unavailable in this browser. Use the minimap to pan.';
    nav.querySelector('.tc-zoom-fit').addEventListener('click',function(){fitAll();});
    function fitAll(){
      if(!scroll.clientWidth||!scroll.clientHeight)return;
      var items=Array.from(board.querySelectorAll('.tc-node'));if(!items.length){zoom(1);scroll.scrollLeft=0;scroll.scrollTop=0;refresh();return;}
      var x=Math.min.apply(null,items.map(function(n){return n.offsetLeft;})),y=Math.min.apply(null,items.map(function(n){return n.offsetTop;}));
      var right=Math.max.apply(null,items.map(function(n){return n.offsetLeft+n.offsetWidth;})),bottom=Math.max.apply(null,items.map(function(n){return n.offsetTop+n.offsetHeight;})),padding=32;
      // Keep the fitted figures clear of the minimap (its height at the bottom).
      var reserve=nav.offsetParent?nav.offsetHeight+12:0,usableH=Math.max(120,scroll.clientHeight-padding*2-reserve);
      zoom(Math.min(1,(scroll.clientWidth-padding*2)/(right-x),usableH/(bottom-y)));scroll.scrollLeft=Math.max(0,(x+(right-x)/2)*scale-scroll.clientWidth/2);scroll.scrollTop=Math.max(0,(y+(bottom-y)/2)*scale-(usableH/2+padding));refresh();
    }
    api.fitAll=fitAll;
    function navigate(e){
      var rect=map.getBoundingClientRect(), box=map.viewBox.baseVal;
      if(!rect.width||!rect.height)return;
      scroll.scrollLeft=(e.clientX-rect.left)/rect.width*box.width*scale-scroll.clientWidth/2;
      scroll.scrollTop=(e.clientY-rect.top)/rect.height*box.height*scale-scroll.clientHeight/2;refresh();
    }
    map.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();dragging=true;map.focus();map.setPointerCapture(e.pointerId);navigate(e);});
    map.addEventListener('pointermove',function(e){if(dragging)navigate(e);});
    ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){map.addEventListener(name,function(){dragging=false;});});
    map.addEventListener('keydown',function(e){var dx=e.key==='ArrowRight'?80:e.key==='ArrowLeft'?-80:0,dy=e.key==='ArrowDown'?80:e.key==='ArrowUp'?-80:0;if(dx||dy){e.preventDefault();scroll.scrollLeft+=dx;scroll.scrollTop+=dy;refresh();}});
    scroll.addEventListener('scroll',refresh,{passive:true});window.addEventListener('resize',refresh);if(window.visualViewport)window.visualViewport.addEventListener('resize',refresh);nav.querySelector('details').addEventListener('toggle',refresh);
    var observer=new MutationObserver(function(events){if(events.some(function(e){return e.target===board || (e.target.classList && e.target.classList.contains('tc-node'));})){refresh();if(restoreNeedsFocus)requestAnimationFrame(focusRestoredNode);}});
    observer.observe(board,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
    if(window.ResizeObserver){var ro=new ResizeObserver(refresh);ro.observe(scroll);ro.observe(board);var intro=root.querySelector('.tc-intro');if(intro)ro.observe(intro);var tools=root.querySelector('.tc-toolbar');if(tools)ro.observe(tools);}
    var visibility=new MutationObserver(refresh);visibility.observe(root,{attributes:true,attributeFilter:['class']});var panel=root.querySelector('#tc-workspace-panel');if(panel)visibility.observe(panel,{attributes:true,attributeFilter:['hidden']});
    api.refresh=refresh;refresh();
  };
})();
