/* Team-only navigation. World coordinates and scientific/checkpoint state stay unchanged. */
(function () {
  'use strict';
  var api = window.TeamCanvasViewport = { scale: 1 };
  api.mount = function (root, board) {
    var scroll = board.closest('.tc-scroll');
    if (!scroll || root.querySelector('.tc-navigation')) return;
    var scale = 1, queued = false, dragging = false;
    // The camera is always a transform. Card layout, Plotly and Shiny retain logical pixels.
    var zoomSupported = !!(window.CSS && CSS.supports('transform','scale(1)'));
    var spacer = document.createElement('div'); spacer.className = 'tc-world-space';
    board.before(spacer); spacer.appendChild(board); board.classList.add('tc-world-board');
    var shell=document.createElement('div');shell.className='tc-viewport-shell';scroll.before(shell);shell.appendChild(scroll);
    var nav = document.createElement('div'); nav.className = 'tc-navigation'; nav.setAttribute('aria-label','Canvas navigation');
    nav.innerHTML = '<details class="tc-map" open><summary>Minimap</summary><svg tabindex="0" role="img" aria-label="Canvas minimap. Click or drag to navigate; use arrow keys to pan." preserveAspectRatio="none"><g class="tc-map-nodes"></g><rect class="tc-map-window"/></svg></details><div class="tc-zoom-controls" role="group" aria-label="Canvas zoom"><button type="button" class="tc-zoom-out" aria-label="Zoom out" title="Zoom out (−)"><svg class="tc-zoom-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 8h9"/></svg></button><button type="button" class="tc-zoom-reset" aria-label="Reset canvas zoom to 100%" title="Reset to 100%">100%</button><button type="button" class="tc-zoom-in" aria-label="Zoom in" title="Zoom in (+)"><svg class="tc-zoom-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.5 8h9M8 3.5v9"/></svg></button><button type="button" class="tc-zoom-fit" aria-label="Fit all" title="Fit all (Shift+1)"><svg class="tc-zoom-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg><span class="tc-zoom-fit-label">Fit</span></button></div>';
    // Screen chrome is a sibling of the scrollport, never a child of the world spacer/board.
    shell.appendChild(nav);
    // Collapsed or open, the minimap keeps the person's last choice in this browser.
    var MAP_OPEN_KEY='team.canvas.minimap.open',mapDetails=nav.querySelector('.tc-map');
    try{if(localStorage.getItem(MAP_OPEN_KEY)==='closed')mapDetails.open=false;}catch(e){}
    mapDetails.addEventListener('toggle',function(){try{localStorage.setItem(MAP_OPEN_KEY,mapDetails.open?'open':'closed');}catch(e){}});
    // The minimap can be moved anywhere inside the canvas; its place is remembered
    // per browser and pulled back inside when the canvas gets smaller.
    var grip=document.createElement('button');grip.type='button';grip.className='tc-map-grip';grip.textContent='⠿';
    grip.setAttribute('aria-label','Move minimap (drag, or use arrow keys)');grip.title='Drag to move the zoom controls and minimap';
    // Its own segment at the left edge of the zoom pill: it never sits over a button.
    grip.textContent='';grip.innerHTML='<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" focusable="false"><circle cx="3" cy="4" r="1.2"/><circle cx="7" cy="4" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="7" cy="8" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg>';
    var zoomRow=nav.querySelector('.tc-zoom-controls');zoomRow.insertBefore(grip,zoomRow.firstChild);
    // `home` is where the person put the box ([x,y] in shell pixels; null = its CSS corner). It is
    // shown there unless that would cover a card (placeNav() below), and only `home` is ever saved.
    // v2: the redesigned zoom pill starts docked bottom-left; places saved for the old, taller box are not reused.
    var MAP_KEY='team.canvas.minimap.position.v2',home=null;
    function setPos(x,y){[['left',x+'px'],['top',y+'px'],['bottom','auto'],['right','auto']].forEach(function(p){if(nav.style.getPropertyValue(p[0])!==p[1]||nav.style.getPropertyPriority(p[0])!=='important')nav.style.setProperty(p[0],p[1],'important');});}
    function clearPos(){['left','top','bottom','right'].forEach(function(p){if(nav.style.getPropertyValue(p))nav.style.removeProperty(p);});}
    function placeMap(x,y,save){
      // A hidden canvas (compose view, 3D cell) measures 0: never clamp or save then.
      if(!shell.clientWidth||!shell.clientHeight||!nav.offsetWidth)return;
      var maxX=Math.max(0,shell.clientWidth-nav.offsetWidth-4),maxY=Math.max(0,shell.clientHeight-nav.offsetHeight-4);
      x=Math.round(Math.max(4,Math.min(maxX,x)));y=Math.round(Math.max(4,Math.min(maxY,y)));
      // Never over the floating toolbar: drop below it when the rectangles would meet.
      var tb=root.querySelector('.tc-toolbar'),sr=shell.getBoundingClientRect();
      if(tb&&tb.offsetParent){var t=tb.getBoundingClientRect(),l=t.left-sr.left,tp=t.top-sr.top;if(x<l+t.width&&x+nav.offsetWidth>l&&y<tp+t.height&&y+nav.offsetHeight>tp)y=Math.min(maxY,Math.round(tp+t.height+8));}
      // While moved aside, placeNav() decides on the next frame whether the new place is free (no flicker).
      home=[x,y];if(!nav.classList.contains('tc-nav-moved')||nav.classList.contains('is-dragging'))setPos(x,y);nav.classList.add('is-placed');
      if(save){try{localStorage.setItem(MAP_KEY,JSON.stringify({x:x,y:y}));}catch(e){}}
      scheduleNav();
    }
    function restoreMap(){var saved=null;try{saved=JSON.parse(localStorage.getItem(MAP_KEY)||'null');}catch(e){}
      if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)&&shell.clientWidth)placeMap(saved.x,saved.y,false);}
    grip.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();grip.setPointerCapture(e.pointerId);
      var start={x:e.clientX,y:e.clientY,l:nav.offsetLeft,t:nav.offsetTop},moved=false;nav.classList.add('is-dragging');
      function move(ev){if(Math.abs(ev.clientX-start.x)+Math.abs(ev.clientY-start.y)<3&&!moved)return;moved=true;placeMap(start.l+ev.clientX-start.x,start.t+ev.clientY-start.y,false);}
      function end(){grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',end);grip.removeEventListener('pointercancel',end);nav.classList.remove('is-dragging');if(moved)placeMap(nav.offsetLeft,nav.offsetTop,true);}
      grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);});
    grip.addEventListener('keydown',function(e){var d={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(!d)return;e.preventDefault();placeMap(nav.offsetLeft+d[0],nav.offsetTop+d[1],true);});
    // Pull a placed minimap back inside when the visible canvas shrinks.
    if(window.ResizeObserver)new ResizeObserver(function(){if(home)placeMap(home[0],home[1],false);else restoreMap();scheduleNav();}).observe(shell);
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
    document.addEventListener('keydown',function(event){if(event.key==='Escape'&&!event.defaultPrevented&&root.classList.contains('tc-focus-mode')){event.preventDefault();setFocusMode(false);var back=[focusButton].concat(Array.from(root.querySelectorAll('[aria-label="More figure options"],[aria-label="More canvas actions"]'))).find(function(b){return b.getClientRects().length;});if(back)back.focus();}});
    var minus=nav.querySelector('.tc-zoom-out'), plus=nav.querySelector('.tc-zoom-in'), reset=nav.querySelector('.tc-zoom-reset'), map=nav.querySelector('svg'), nodes=nav.querySelector('.tc-map-nodes'), frame=nav.querySelector('.tc-map-window');
    function bounds() { return {w:board.offsetWidth,h:board.offsetHeight}; }
    // paint() runs on every scroll/drag frame. Write only real changes: on this page any
    // DOM insertion/removal or text change re-evaluates its many :has() rules, which is a
    // full-document style recalc (40 ms here, ~150 ms at 4x CPU throttling) per frame.
    function setStyle(el,prop,value){if(el.style[prop]!==value)el.style[prop]=value;}
    function setAttr(el,name,value){value=String(value);if(el.getAttribute(name)!==value)el.setAttribute(name,value);}
    function sizeSpace() {
      var b=bounds();
      setStyle(spacer,'width',Math.max(scroll.clientWidth,b.w*scale)+'px');
      setStyle(spacer,'height',Math.max(scroll.clientHeight,b.h*scale)+'px');
      setStyle(board,'transform','scale('+scale+')');
      // Grid tile follows the zoom (22 world px); far out, every 2nd/4th... dot keeps it legible.
      var tile=22*scale;while(tile<11)tile*=2;tile=Math.round(tile*1000)/1000+'px';
      if(scroll.style.getPropertyValue('--tc-grid-size')!==tile)scroll.style.setProperty('--tc-grid-size',tile);
    }
    function fitViewport() {
      if(!scroll.getClientRects().length)return;
      if(root.classList.contains('tc-focus-mode')){scroll.style.removeProperty('height');return;}
      // Document position keeps ordinary page scrolling from changing the board height.
      var top=scroll.getBoundingClientRect().top+window.scrollY;
      var viewport=window.visualViewport?window.visualViewport.height:window.innerHeight;
      // The shell shows canvas status as a floating notice, so no bottom strip to reserve.
      // A band reserved for the navigation box (placeNav) comes out of the board, not the page.
      var height=Math.max(300,viewport-top-(root.classList.contains('ts-shell')?8:42)-navInset);
      var value=Math.round(height)+'px';if(scroll.style.height!==value)scroll.style.height=value;
    }
    var mapDirty=true;
    function paint() {
      queued=false;fitViewport();
      if(catalog && scroll.clientHeight){
        setStyle(catalog,'height',Math.max(180,scroll.clientHeight-12)+'px');
        var tools=root.querySelector('.tc-toolbar');if(tools)setStyle(catalog,'top',(tools.offsetHeight+6)+'px');
        var layout=root.querySelector('.tc-layout');if(close && layout && close.parentElement!==layout)layout.insertBefore(close,catalog);
      }
      if(!scroll.clientWidth || !scroll.clientHeight)return;
      if(restoreNeedsFocus&&restorePlan)focusRestoredNode();
      sizeSpace(); var b=bounds(), w=Math.max(b.w,scroll.clientWidth/scale), h=Math.max(b.h,scroll.clientHeight/scale);
      setAttr(map,'viewBox','0 0 '+w+' '+h);
      // Minimap rectangles are reused and updated in place; only a change in the number
      // of cards adds or removes one.
      if(mapDirty){
        mapDirty=false;
        var cards=board.querySelectorAll('.tc-node:not(.tc-tab-hidden)');
        while(nodes.childElementCount>cards.length)nodes.lastElementChild.remove();
        while(nodes.childElementCount<cards.length){
          var rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('rx',12);
          rect.appendChild(document.createElementNS('http://www.w3.org/2000/svg','title'));nodes.appendChild(rect);
        }
        cards.forEach(function(n,i){
          var r=nodes.children[i];
          setAttr(r,'x',n.offsetLeft);setAttr(r,'y',n.offsetTop);setAttr(r,'width',n.offsetWidth);setAttr(r,'height',n.offsetHeight);
          var label=(n.querySelector('strong')||n).textContent.slice(0,150);if(r.firstChild.textContent!==label)r.firstChild.textContent=label;
        });
        prime();
      }
      // Navigation is screen chrome, including above 100%. The user's disclosure choice
      // is the only thing that folds the minimap; zoom must never hide it.
      setAttr(frame,'x',scroll.scrollLeft/scale);setAttr(frame,'y',scroll.scrollTop/scale);setAttr(frame,'width',Math.min(w,scroll.clientWidth/scale));setAttr(frame,'height',Math.min(h,scroll.clientHeight/scale));
      // The label's text node is edited in place: replacing it is a DOM insertion (see setStyle above).
      var percent=Math.round(scale*100)+'%';if(reset.textContent!==percent){var label=reset.firstChild;if(label&&label.nodeType===3&&!label.nextSibling)label.nodeValue=percent;else reset.textContent=percent;}
      var low=!zoomSupported||scale<=.05,high=!zoomSupported||scale>=2;if(minus.disabled!==low)minus.disabled=low;if(plus.disabled!==high)plus.disabled=high;
    }
    // While a gesture moves the camera the navigation box is placed once, at its end (endGesture).
    function refresh(){if(!queued){queued=true;requestAnimationFrame(paint);}if(!root.classList.contains('tc-gesturing'))scheduleNav();}
    // The navigation box never covers a card's header (title, status badge) or its action toolbar,
    // selected or not, and it is never hidden: zoom, Reset, Fit and move stay usable. Where its own
    // place would meet one, it is shown (unsaved) in the first free corner of the canvas. When no
    // corner is free the canvas reserves a band at its bottom for it (.tc-nav-inset): the cards end
    // above the band and scroll clear of it. It goes back once its place is free; not while dragged.
    var navQueued=false,navInset=0,cssOwn=null;
    function meets(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
    // Screen rectangles to keep clear: each card's header strip, plus room for its action toolbar
    // above it (card_figure.js puts it there, or under the header at the canvas top edge). Hover-only
    // toolbars count too, since hovering any card shows them. Toolbar and library handle as well.
    // Open card popovers count too: RC4's ⋯ menu opens above the footer, outside the bar's box, and so
    // does any disclosure a card control has open (aria-expanded + aria-controls).
    // Cards only move with the canvas scroll between changes, so their rectangles are measured once per
    // change (cards, their style or class, a toolbar mode, a menu opening, a size, the zoom) and shifted by
    // the scroll since. A toolbar floating outside its card (fixed, re-placed by card_figure.js) is read live.
    var obsCache=null;
    function dropObstacles(){obsCache=null;}
    function popups(scope,skip){
      var out=[];
      scope.querySelectorAll('[aria-expanded="true"][aria-controls]').forEach(function(t){
        if(skip&&skip(t))return;
        var p=document.getElementById(t.getAttribute('aria-controls'));
        if(!p||p.hidden||!p.getClientRects().length)return;var r=p.getBoundingClientRect();if(r.width&&r.height)out.push(r);
      });
      return out;
    }
    function shown(el){var cs=getComputedStyle(el);return cs.visibility!=='hidden'&&cs.display!=='none';}
    function cardObstacles(ox,oy,key){
      if(obsCache&&obsCache.key===key)return obsCache;
      var cards=[],live=[],rel=function(r){return {left:r.left-ox,right:r.right-ox,top:r.top-oy,bottom:r.bottom-oy};};
      board.querySelectorAll('.tc-node:not(.tc-tab-hidden)').forEach(function(n){
        var r=n.getBoundingClientRect();if(!r.width||!r.height)return;
        var head=n.querySelector(':scope > .tc-node-head'),h=head&&head.getBoundingClientRect(),hb=h&&h.height?h.bottom:r.top+36;
        var entry={left:r.left-ox,right:r.right-ox,top:r.top-oy,hb:hb-oy,rects:[]};
        var bar=head&&head.querySelector(':scope > .tc-card-actions'),floating=bar&&!bar.classList.contains('tc-card-docked');
        if(floating)live.push(bar);
        else if(bar&&shown(bar)){var b=bar.getBoundingClientRect();if(b.width&&b.height)entry.rects.push(rel(b));}
        // RC4's card footer (card_frame.js .tc-card-foot), where that bar is painted as Edit · Duplicate · ⋯.
        var foot=n.querySelector(':scope > .tc-card-foot'),f=foot&&foot.getBoundingClientRect();if(f&&f.width&&f.height)entry.rects.push(rel(f));
        popups(n,function(t){return floating&&bar.contains(t);}).forEach(function(p){entry.rects.push(rel(p));});
        cards.push(entry);
      });
      obsCache={key:key,cards:cards,live:live};
      return obsCache;
    }
    // grow: the band's height while it is reserved. A bar floating along the view's lower edge
    // (card_figure.js) follows that edge, so leaving the band would bring it back down by up to `grow`:
    // it counts there too, or the box would hop in and out of the band on its own.
    function obstacles(areaTop,grow){
      var out=[],ACT=34,sr=scroll.getBoundingClientRect(),ox=sr.left-scroll.scrollLeft,oy=sr.top-scroll.scrollTop;
      var c=cardObstacles(ox,oy,[scale,sr.width,sr.height,scroll.scrollWidth,scroll.scrollHeight].join());
      c.cards.forEach(function(e){
        var top=e.top+oy;
        out.push({left:e.left+ox,right:e.right+ox,top:top-ACT,bottom:e.hb+oy+(top-ACT<areaTop+2?ACT:0)});
        e.rects.forEach(function(r){out.push({left:r.left+ox,right:r.right+ox,top:r.top+oy,bottom:r.bottom+oy});});
      });
      c.live.forEach(function(bar){
        if(!bar.isConnected)return;
        if(shown(bar)){var b=bar.getBoundingClientRect();if(b.width&&b.height){out.push(b);
          var vb=Math.min(window.innerHeight,sr.bottom),n=grow&&b.bottom>=vb-6&&bar.closest('.tc-node');
          if(n){var d=Math.min(n.getBoundingClientRect().bottom,window.innerHeight,vb+grow)-vb;if(d>0)out.push({left:b.left,right:b.right,top:b.top+d,bottom:b.bottom+d});}}}
        popups(bar).forEach(function(p){out.push(p);});
      });
      root.querySelectorAll('.tc-toolbar,.tc-layout>.tc-library-edge-toggle').forEach(function(c){if(c.offsetParent)out.push(c.getBoundingClientRect());});
      // Never under the companion (it floats above the page): a place it covers is not free.
      var dock=document.getElementById('lipidomic-companion');
      if(dock&&!dock.hidden&&dock.getClientRects().length&&getComputedStyle(dock).visibility!=='hidden'){var d=dock.getBoundingClientRect();if(d.width&&d.height)out.push(d);}
      return out;
    }
    var bandHold=false,bandLeftAt=-1e9;window.addEventListener('resize',function(){bandHold=false;});
    function placeNav(){
      navQueued=false;
      if(dragging||nav.classList.contains('is-dragging')||!shell.clientWidth||!shell.clientHeight||!nav.offsetWidth)return;
      var sr=shell.getBoundingClientRect(),W=Math.min(shell.clientWidth,window.innerWidth-sr.left),H=Math.min(shell.clientHeight,window.innerHeight-sr.top),w=nav.offsetWidth,h=nav.offsetHeight,m=window.innerWidth<=720?6:12;
      // Own place: the saved one, or the stylesheet corner, measured without the temporary move. While
      // moved, the measure is reused until a size changes (no style writes on every scroll frame).
      var own=home;
      if(!own){if(!cssOwn||!nav.classList.contains('tc-nav-moved')||[W,H,w,h].join()!==cssOwn[2]){clearPos();cssOwn=[nav.offsetLeft,nav.offsetTop,[W,H,w,h].join()];}own=cssOwn;}
      var top=m,tb=root.querySelector('.tc-toolbar');
      if(tb&&tb.offsetParent){var t=tb.getBoundingClientRect();if(t.bottom>sr.top&&t.top<sr.top+H)top=Math.max(top,Math.round(t.bottom-sr.top+8));}
      var right=Math.max(m,W-w-m-(scroll.offsetWidth-scroll.clientWidth)),bottom=Math.max(top,H-h-m-(navInset?0:scroll.offsetHeight-scroll.clientHeight));
      // H is the whole shell, band included: the same cards meet the same places in both modes.
      // Fixed: its own place (the stylesheet's bottom-left corner, or where the person dragged it), clamped
      // inside the view. Cards, zoom, pan and selection no longer move it to another corner or into a band
      // (people read the jumps as the canvas moving on its own). Only an open ⋯ menu or disclosure under it
      // moves it aside while open, or the box would take the click meant for Remove.
      var list=[own,[m,bottom],[right,bottom],[right,top],[m,top]],obs=popups(board),pick=null;
      for(var i=0;i<list.length&&!pick;i++){
        var x=Math.max(m,Math.min(right,list[i][0])),y=Math.max(top,Math.min(bottom,list[i][1]));if(x!==list[i][0]||y!==list[i][1])list[i]=[x,y];var box={left:sr.left+x-4,top:sr.top+y-4,right:sr.left+x+w+4,bottom:sr.top+y+h+4};
        if(!obs.some(function(o){return meets(o,box);}))pick=list[i];
      }
      if(!pick)pick=list[0];
      // Leaving the band grows the board's view; if that would pull the scroll back, the cards would
      // slide under the box again: keep the band until the person pans.
      if(pick&&navInset){var ch=scroll.clientHeight+navInset;if(scroll.scrollTop>Math.max(ch,board.offsetHeight*scale)-ch+.5)pick=null;}
      // Never flap: if leaving the band brought it straight back (the view could not grow into it),
      // keep the band until the window is resized. The minimap is always shown, so this can happen.
      if(pick&&navInset&&bandHold)pick=null;
      var inset=pick?0:h+2*m;
      if(inset&&!navInset&&performance.now()-bandLeftAt<300)bandHold=true;
      if(!inset&&navInset)bandLeftAt=performance.now();
      if(inset!==navInset){
        navInset=inset;shell.classList.toggle('tc-nav-inset',!!inset);
        if(inset)shell.style.setProperty('padding-bottom',inset+'px');else shell.style.removeProperty('padding-bottom');
        fitViewport();sizeSpace();refresh();H=Math.min(shell.clientHeight,window.innerHeight-sr.top);
        // The view's lower edge moved without a scroll or a resize: card_figure.js re-places the
        // floating card action bars that sit along it.
        window.dispatchEvent(new CustomEvent('team-canvas-nav-inset',{detail:{inset:inset}}));
      }
      if(!pick)pick=[Math.max(m,Math.min(W-w-m,own[0])),H-h-m];
      nav.classList.toggle('tc-nav-moved',pick!==own);
      if(pick===own&&!home&&own[0]>=m&&own[1]>=top&&own[0]<=right&&own[1]<=bottom)clearPos();else setPos(Math.round(pick[0]),Math.round(pick[1]));
    }
    function scheduleNav(){if(!navQueued){navQueued=true;requestAnimationFrame(placeNav);}}
    // ux40 gesture mode. Safari lags when wheel, pinch or pan moves a board full of live Plotly SVG. From the first
    // such event (or zoom) until 150 ms after the last, the root carries .tc-gesturing: a plot with a cached bitmap of
    // its last render shows that bitmap instead of its live DOM, card toolbars and resize grips hide
    // (canvas_viewport.css), and card_figure.js stops re-placing toolbars. Only the camera moves; the live plots are
    // never touched and come back as they were at the end.
    var gestureEnd=0;
    function gesture(){if(!root.classList.contains('tc-gesturing')){prime();root.classList.add('tc-gesturing');}clearTimeout(gestureEnd);gestureEnd=setTimeout(endGesture,150);}
    function endGesture(){root.classList.remove('tc-gesturing');prime();pump();dropObstacles();scheduleNav();window.dispatchEvent(new CustomEvent('team-canvas-gesture-end'));}
    // Each card plot's bitmap: Plotly.toImage of its drawn layout, made when the browser is idle after the plot first
    // draws and again only after it re-renders (plotly_afterplot). Held as a decoded blob URL in the plot's --tc-bitmap
    // (no DOM is added to the card); a plot whose bitmap is not current keeps showing its live DOM.
    var idle=window.requestIdleCallback||function(f){return setTimeout(f,50);},toCapture=new Set(),capturing=false,cached=new Set();
    function stale(gd){gd._tcBitmapRev=(gd._tcBitmapRev||0)+1;if(gd.classList.contains('tc-has-bitmap'))gd.classList.remove('tc-has-bitmap');toCapture.add(gd);pump();}
    // Plotly.purge (a data/settings redraw) drops the listener and newPlot gives the plot a new gd.on, after its
    // afterplot already fired: listening again on a new gd.on also makes the bitmap again.
    function prime(){board.querySelectorAll('.tc-node:not(.tc-finished) .js-plotly-plot').forEach(function(gd){
      var hooked=gd._tcBitmapHooked;
      if(gd.on&&hooked!==gd.on){gd._tcBitmapHooked=gd.on;gd.on('plotly_afterplot',function(){stale(gd);});}
      if(hooked&&hooked!==gd.on||gd._tcBitmapRev===undefined&&gd._fullLayout)stale(gd);
    });}
    // One capture at a time, never during a gesture (toImage holds the main thread).
    function pump(){if(capturing||!toCapture.size||root.classList.contains('tc-gesturing'))return;capturing=true;
      // The queue can empty before this runs (its card removed): nothing to capture. A capture that throws still
      // ends (a rejection), or capturing would stay set and stop every later capture.
      idle(function(){if(root.classList.contains('tc-gesturing')||!toCapture.size){capturing=false;return;}var gd=toCapture.values().next().value;toCapture.delete(gd);
        Promise.resolve(gd).then(capture).catch(function(){}).then(function(){capturing=false;pump();});},{timeout:2000});}
    function blobUrl(url){
      var i=url.indexOf(','),head=url.slice(5,i),body=url.slice(i+1),data=body;
      if(/;base64$/.test(head)){var bin=atob(body);data=new Uint8Array(bin.length);for(var k=0;k<bin.length;k++)data[k]=bin.charCodeAt(k);}else data=decodeURIComponent(body);
      return URL.createObjectURL(new Blob([data],{type:head.split(';')[0]||'image/png'}));
    }
    function capture(gd){
      var L=gd._fullLayout,rev=gd._tcBitmapRev;
      if(!gd.isConnected||!board.contains(gd)||!L||!(L.width>1)||!(L.height>1)||!window.Plotly||!Plotly.toImage)return Promise.resolve();
      return Promise.resolve(Plotly.toImage(gd,{format:'png',width:L.width,height:L.height,scale:Math.min(2,window.devicePixelRatio||1)})).then(function(url){
        var img=new Image();img.src=blobUrl(url);
        return (img.decode?img.decode():Promise.resolve()).then(function(){
          if(gd._tcBitmapRev!==rev||!board.contains(gd)){URL.revokeObjectURL(img.src);return;}
          if(gd._tcBitmap)URL.revokeObjectURL(gd._tcBitmap.src);gd._tcBitmap=img;cached.add(gd); // kept: its decoded pixels stay ready
          // The bitmap is laid over the plot's own box (no offsets: a static plot made relative does not move).
          if(getComputedStyle(gd).position==='static')gd.style.position='relative';
          gd.style.setProperty('--tc-bitmap','url("'+img.src+'")');gd.style.setProperty('--tc-bitmap-w',L.width+'px');gd.style.setProperty('--tc-bitmap-h',L.height+'px');
          gd.classList.add('tc-has-bitmap');
        },function(){URL.revokeObjectURL(img.src);});
      });
    }
    // A plot that left the board (card removed or returned, Return all) gives its bitmap back; a later render recaptures it.
    function dropBitmaps(){cached.forEach(function(gd){if(board.contains(gd))return;cached.delete(gd);toCapture.delete(gd);
      URL.revokeObjectURL(gd._tcBitmap.src);gd._tcBitmap=null;gd._tcBitmapRev++;gd.classList.remove('tc-has-bitmap');gd.style.removeProperty('--tc-bitmap');});}
    api.bitmapCount=function(){return cached.size;};
    api.gesturing=function(){return root.classList.contains('tc-gesturing');};
    function zoom(next) {
      stopGlide();
      next=zoomSupported?Math.max(.05,Math.min(2,next)):1; if(!Number.isFinite(next)||next===scale)return;
      gesture();
      var x=(scroll.scrollLeft+scroll.clientWidth/2)/scale,y=(scroll.scrollTop+scroll.clientHeight/2)/scale;
      scale=next;api.scale=scale;
      sizeSpace();scroll.scrollLeft=x*scale-scroll.clientWidth/2;scroll.scrollTop=y*scale-scroll.clientHeight/2;
      paint();scheduleNav();
    }
    // Compatibility for camera callers: there is no deferred layout to commit.
    function commitZoom() {}
    api.commitZoom=commitZoom;
    // Put a newly-created node in the middle of the visible work area.  This is
    // deliberately an imperative operation: restoring a checkpoint must retain
    // its saved positions and must not steal focus one node at a time.
    function focusNode(node, options) {
      if (!node || !node.isConnected || node.classList.contains('tc-tab-hidden') || !scroll.clientWidth || !scroll.clientHeight) return;
      board.querySelectorAll('.tc-node.tc-camera-target').forEach(function(other){other.classList.remove('tc-camera-target');});
      node.classList.add('tc-camera-target');
      var body=node.querySelector('.tc-content');
      if(body && !body.hasAttribute('tabindex')) { body.tabIndex=0; body.setAttribute('aria-label','Scrollable plot content'); }
      focusRect({x:node.offsetLeft,y:node.offsetTop,width:node.offsetWidth,height:node.offsetHeight}, node, options);
    }
    // Camera only. `node` (optional) refines the result from its painted rectangle.
    function focusRect(r, node, options) {
      if (!scroll.clientWidth || !scroll.clientHeight) return;
      commitZoom(); // camera moves measure the real zoom, even when no zoom change follows
      var width=r.width, height=r.height;
      var readable=!!(options&&options.readable);
      var fit=readable?Math.min(1,(scroll.clientWidth-64)/Math.max(1,width)):Math.min(1, (scroll.clientWidth-64)/Math.max(1,width), (scroll.clientHeight-64)/Math.max(1,height));
      if (zoomSupported && (readable || fit < scale)) zoom(Math.max(.05, fit));
      // Leave a half viewport of world space beyond the target so centering is
      // possible even when the node was placed near an original board edge.
      var marginX=scroll.clientWidth/(2*scale), marginY=scroll.clientHeight/(2*scale);
      board.style.width=Math.max(board.offsetWidth,r.x+r.width+marginX)+'px';
      board.style.height=Math.max(board.offsetHeight,r.y+r.height+marginY)+'px';
      sizeSpace();
      if (options && options.topLeft) { scroll.scrollLeft=0; scroll.scrollTop=0; refresh(); return; }
      scroll.scrollLeft=Math.max(0,(r.x+r.width/2)*scale-scroll.clientWidth/2);
      // A floating toolbar covers the top of the viewport: keep the card's header below it.
      var top=toolbarReserve();
      scroll.scrollTop=readable?Math.max(0,r.y*scale-top):Math.max(0,(r.y+r.height/2)*scale-scroll.clientHeight/2);
      if (!node) { refresh(); return; }
      // Borders and scrollbars can make offset metrics differ from painted pixels;
      // correct once from the actual rectangles after applying the scroll.
      var sr=scroll.getBoundingClientRect(), nr=node.getBoundingClientRect();
      scroll.scrollLeft=Math.max(0,scroll.scrollLeft+(nr.left+nr.width/2-(sr.left+sr.width/2)));
      scroll.scrollTop=Math.max(0,scroll.scrollTop+(readable?nr.top-sr.top-top:nr.top+nr.height/2-(sr.top+sr.height/2)));
      refresh();
    }
    // Restore positions are data; adjust only the camera once a restored node
    // is available, and only if it does not fit in the visible viewport.
    var restoreNeedsFocus=false, restorePlan=null, pendingTimer=null, pendingShown=0;
    // A restored workspace is framed from its saved geometry, before its plots render
    // (they arrive one by one from the server). Until that camera is applied the view is
    // hidden, so it opens already at its final zoom/position instead of jumping there.
    function reveal(){restorePlan=null;clearInterval(pendingTimer);pendingTimer=null;shell.classList.remove('tc-camera-pending');}
    function hideUntilFramed(){
      shell.classList.add('tc-camera-pending');pendingShown=0;clearInterval(pendingTimer);
      // Fallback: never leave the canvas invisible. Once it has been on screen for ~1 s,
      // frame what is known and show it whatever else failed. While the Canvas screen is
      // not shown there is nothing to see, so the check simply keeps waiting (4 cheap ticks/s).
      pendingTimer=setInterval(function(){
        if(!shell.classList.contains('tc-camera-pending')){reveal();return;}
        if(scroll.getClientRects().length&&scroll.clientWidth)pendingShown++;
        if(pendingShown>=4){try{focusRestoredNode();}catch(e){}reveal();}
      },250);
    }
    function savedRects(){return restorePlan?restorePlan.concat(nodeRects()):nodeRects();}
    function focusRestoredNode() {
      if (!restoreNeedsFocus || !scroll.clientWidth || !scroll.clientHeight) return;
      if (restorePlan && restorePlan.length) {
        restoreNeedsFocus=false; var rects=savedRects();
        if (restorePlan.length > 1) {
          // Several figures: open showing all of them, framed once from the saved geometry.
          // No delayed re-fit: the camera moves later only when the person asks (Fit).
          fitRects(rects);
        } else {
          var r=rects[0], left=r.x*scale-scroll.scrollLeft, top=r.y*scale-scroll.scrollTop;
          if (left < 0 || top < 0 || left+r.width*scale > scroll.clientWidth || top+r.height*scale > scroll.clientHeight) focusRect(r, null);
        }
        reveal(); return;
      }
      var target=board.querySelector('.tc-node.is-selected') || board.querySelector('.tc-node:not(.tc-tab-hidden)');
      if (!target) { reveal(); return; }
      restoreNeedsFocus=false;
      // Several figures: open showing all of them, once and at once (no delayed re-fit).
      if (board.querySelectorAll('.tc-node:not(.tc-tab-hidden)').length > 1 && !board.querySelector('.tc-node.is-selected')) {
        fitAll();
        reveal(); return;
      }
      var viewport=scroll.getBoundingClientRect(), rect=target.getBoundingClientRect();
      if (rect.left < viewport.left || rect.top < viewport.top || rect.right > viewport.right || rect.bottom > viewport.bottom) focusNode(target);
      reveal();
    }
    window.addEventListener('team-canvas-restored',function(event){
      var nodes=event.detail&&Array.isArray(event.detail.nodes)?event.detail.nodes.filter(function(n){return n&&[n.x,n.y,n.width,n.height].every(Number.isFinite);}).map(function(n){return {x:n.x,y:n.y,width:n.width,height:n.height};}):null;
      restoreNeedsFocus=true;restorePlan=nodes&&nodes.length?nodes:null;
      if(restorePlan)hideUntilFramed();else reveal();
      // Frame as soon as the canvas has a size: now if it is on screen, otherwise when it is shown.
      if(scroll.clientWidth&&scroll.clientHeight)focusRestoredNode();
      requestAnimationFrame(function(){requestAnimationFrame(focusRestoredNode);});
    });
    api.focusNode=focusNode;
    api.setScale=zoom;
    api.focusNodeForPanel=function(node,panelWidth){
      if(!node||!node.isConnected||!scroll.clientWidth||!scroll.clientHeight)return;
      commitZoom();
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
    // ux40: a single click on an unselected card selects it and opens the inspector (canvas_inspector.js,
    // inspector_toggle.js); the camera then glides (~200 ms; at once with reduced motion) to centre and fit the card
    // in the part of the view left of the inspector. A click on the selected card, the end of a drag, a card control
    // (⋯, Remove, Edit) or Move mode leaves the camera alone. Esc, a click on empty canvas or closing the inspector
    // glides back to the view before the first such click.
    var press=null,priorView=null,glide=0;
    function cameraView(){return {scale:scale,x:scroll.scrollLeft,y:scroll.scrollTop};}
    function stopGlide(){cancelAnimationFrame(glide);glide=0;}
    api.gliding=function(){return !!glide;};
    function setView(v){scale=v.scale;api.scale=scale;sizeSpace();scroll.scrollLeft=v.x;scroll.scrollTop=v.y;}
    function glideTo(to){
      cancelAnimationFrame(glide);
      // The world point at the view's centre moves in a straight line while the scale changes.
      var from=cameraView(),cx=scroll.clientWidth/2,cy=scroll.clientHeight/2,t0=null;
      var p0=[(from.x+cx)/from.scale,(from.y+cy)/from.scale],p1=[(to.x+cx)/to.scale,(to.y+cy)/to.scale],low=Math.min(from.scale,to.scale);
      // Camera only: room in the world for every point of the path.
      board.style.width=Math.max(board.offsetWidth,Math.ceil(Math.max(p0[0],p1[0])+cx/low))+'px';
      board.style.height=Math.max(board.offsetHeight,Math.ceil(Math.max(p0[1],p1[1])+cy/low))+'px';
      var reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
      function step(now){
        if(t0===null)t0=now;var k=reduce?1:Math.min(1,(now-t0)/200),e=k<.5?2*k*k:1-Math.pow(2-2*k,2)/2,s=from.scale+(to.scale-from.scale)*e;
        gesture();
        if(k<1){setView({scale:s,x:(p0[0]+(p1[0]-p0[0])*e)*s-cx,y:(p0[1]+(p1[1]-p0[1])*e)*s-cy});glide=requestAnimationFrame(step);}
        else{glide=0;setView(to);refresh();}
      }
      if(reduce)step(0);else glide=requestAnimationFrame(step);
    }
    // The card centred and fitted (never above 100%) in the view left of the inspector, 24 px clear.
    function cardView(node){
      var sr=scroll.getBoundingClientRect(),left=sr.left+scroll.clientLeft,top=sr.top+scroll.clientTop,right=left+scroll.clientWidth,bottom=top+scroll.clientHeight;
      root.querySelectorAll('.tc-layout>.ts-inspector-column,#tc-selection-inspector').forEach(function(p){
        if(p.hidden||p.inert||!p.getClientRects().length||getComputedStyle(p).visibility==='hidden')return;
        var r=p.getBoundingClientRect();if(r.left>left+120&&r.left<right&&r.top<bottom&&r.bottom>top)right=r.left;
      });
      var w=right-left-48,h=bottom-top-48,s=Math.max(.05,Math.min(1,w/Math.max(1,node.offsetWidth),h/Math.max(1,node.offsetHeight)));
      if(!zoomSupported)s=scale;
      var cx=(left+right)/2-left,cy=(top+bottom)/2-top;
      return {scale:s,x:Math.max(0,(node.offsetLeft+node.offsetWidth/2)*s-cx),y:Math.max(0,(node.offsetTop+node.offsetHeight/2)*s-cy)};
    }
    function restoreView(){if(!priorView)return;var v=priorView;priorView=null;glideTo(v);}
    var CONTROL='button,a,input,select,textarea,label,summary,[role="menu"],[role^="menuitem"],.selectize-control,.tc-node-resize';
    scroll.addEventListener('pointerdown',function(e){
      cancelAnimationFrame(glide);
      var card=e.target.closest('.tc-node');
      press=e.button===0?{x:e.clientX,y:e.clientY,card:card,selected:!!(card&&card.classList.contains('is-selected')),view:cameraView()}:null;
    },true);
    // Bubble phase on the document: after the click selected the card and showed the inspector.
    document.addEventListener('click',function(e){
      var p=press;press=null;
      if(!p||e.detail!==1||e.button!==0||!scroll.contains(e.target)||root.classList.contains('tc-figure-mode')||Math.abs(e.clientX-p.x)+Math.abs(e.clientY-p.y)>4)return;
      if(!p.card){if(!e.target.closest('.tc-node'))restoreView();return;}
      var card=e.target.closest('.tc-node');
      if(card!==p.card||p.selected||e.target.closest(CONTROL)||!card.classList.contains('is-selected')||!scroll.clientWidth)return;
      if(!priorView)priorView=p.view;
      glideTo(cardView(card));
    });
    window.addEventListener('team-canvas-inspector-closed',restoreView);
    var layoutEl=root.querySelector('.tc-layout');
    if(layoutEl)new MutationObserver(function(){if(layoutEl.classList.contains('ts-inspector-collapsed'))restoreView();}).observe(layoutEl,{attributes:true,attributeFilter:['class']});
    minus.addEventListener('click',function(){zoom(scale/1.25);});plus.addEventListener('click',function(){zoom(scale*1.25);});reset.addEventListener('click',function(){zoom(1);});
    var fitButton=nav.querySelector('.tc-zoom-fit');fitButton.disabled=!zoomSupported;
    if(!zoomSupported)fitButton.title='Zoom is unavailable in this browser. Scroll to pan.';
    nav.querySelector('.tc-zoom-fit').addEventListener('click',function(){fitAll();});
    // Shortcuts: + / − zoom, Shift+1 fits all. Only while this canvas is on screen, never while typing
    // or inside a dialog, and never with Ctrl/Cmd/Alt (browser zoom keeps its keys).
    document.addEventListener('keydown',function(e){
      if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||!zoomSupported||!scroll.clientWidth||!scroll.getClientRects().length)return;
      var t=e.target;if(t&&t.closest&&t.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.modal,[role="dialog"]'))return;
      if(document.querySelector('.modal.show,.modal.in'))return;
      var r=scroll.getBoundingClientRect();if(r.bottom<=0||r.top>=innerHeight)return;
      if(e.key==='+'||e.key==='='){e.preventDefault();zoom(scale*1.25);}
      else if(e.key==='-'||e.key==='−'){e.preventDefault();zoom(scale/1.25);}
      else if(e.shiftKey&&e.code==='Digit1'){e.preventDefault();fitAll();}
    });
    // Height covered at the top of the viewport by the floating toolbar plus room for its notices.
    function toolbarReserve(){var bar=root.querySelector('.tc-toolbar');return bar&&getComputedStyle(bar).position==='absolute'?bar.offsetTop+bar.offsetHeight+48:16;}
    function nodeRects(){return Array.from(board.querySelectorAll('.tc-node:not(.tc-tab-hidden)')).map(function(n){return {x:n.offsetLeft,y:n.offsetTop,width:n.offsetWidth,height:n.offsetHeight};});}
    function fitAll(){fitRects(nodeRects());}
    function fitRects(items){
      stopGlide();
      if(!scroll.clientWidth||!scroll.clientHeight)return;
      if(!items.length){zoom(1);scroll.scrollLeft=0;scroll.scrollTop=0;refresh();return;}
      var x=Math.min.apply(null,items.map(function(n){return n.x;})),y=Math.min.apply(null,items.map(function(n){return n.y;}));
      var right=Math.max.apply(null,items.map(function(n){return n.x+n.width;})),bottom=Math.max.apply(null,items.map(function(n){return n.y+n.height;})),padding=32;
      // Camera only: the board may have been sized while hidden (cards measure 0 there),
      // so make room for the framed cards before scrolling to them.
      if(board.offsetWidth<right+40)board.style.width=(right+40)+'px';if(board.offsetHeight<bottom+40)board.style.height=(bottom+40)+'px';
      // Keep the fitted figures clear of the minimap (its height at the bottom).
      // ...and below the floating toolbar and its notice area, so no card header sits under them.
      // Reserve the same navigation height at every zoom so Fit and Reset keep it reachable.
      var mapH=mapDetails.getClientRects().length?mapDetails.offsetHeight:96,controls=nav.offsetParent?nav.offsetHeight+12-(mapDetails.getClientRects().length?mapH:0):0,top=toolbarReserve();
      function fitScale(reserve){return Math.min(1,(scroll.clientWidth-padding*2)/(right-x),Math.max(120,scroll.clientHeight-padding-top-reserve)/(bottom-y));}
      var next=fitScale(controls+mapH);
      zoom(next);scroll.scrollLeft=Math.max(0,(x+(right-x)/2)*scale-scroll.clientWidth/2);
      var padTop=parseFloat(getComputedStyle(scroll).paddingTop)||0;scroll.scrollTop=Math.max(0,padTop+y*scale-top);refresh();
    }
    api.fitAll=function(){fitAll();};
    function navigate(e){
      stopGlide();
      var rect=map.getBoundingClientRect(), box=map.viewBox.baseVal;
      if(!rect.width||!rect.height)return;
      scroll.scrollLeft=(e.clientX-rect.left)/rect.width*box.width*scale-scroll.clientWidth/2;
      scroll.scrollTop=(e.clientY-rect.top)/rect.height*box.height*scale-scroll.clientHeight/2;refresh();
    }
    map.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();dragging=true;map.focus();map.setPointerCapture(e.pointerId);navigate(e);});
    map.addEventListener('pointermove',function(e){if(dragging)navigate(e);});
    ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){map.addEventListener(name,function(){dragging=false;scheduleNav();});});
    map.addEventListener('keydown',function(e){var dx=e.key==='ArrowRight'?80:e.key==='ArrowLeft'?-80:0,dy=e.key==='ArrowDown'?80:e.key==='ArrowUp'?-80:0;if(dx||dy){e.preventDefault();stopGlide();scroll.scrollLeft+=dx;scroll.scrollTop+=dy;refresh();}});
    scroll.addEventListener('scroll',function(){gesture();refresh();},{passive:true});
    // Wheel (trackpad pan, Ctrl/pinch) and Safari's pinch start the gesture before the first scroll frame.
    // They also stop a card glide (ux40, below): the person's own camera move wins.
    ['wheel','gesturestart','gesturechange'].forEach(function(name){scroll.addEventListener(name,function(){cancelAnimationFrame(glide);gesture();},{passive:true});});window.addEventListener('resize',refresh);if(window.visualViewport)window.visualViewport.addEventListener('resize',refresh);nav.querySelector('details').addEventListener('toggle',function(){refresh();if(home)requestAnimationFrame(function(){placeMap(home[0],home[1],false);});});
    // A card popover opening or closing (card_frame.js ⋯: `hidden` on the menu, aria-expanded on its toggle).
    function popupChange(e){return e.type==='attributes'&&(e.attributeName==='hidden'||e.attributeName==='aria-expanded');}
    var observer=new MutationObserver(function(events){if(events.some(function(e){return (e.target===board&&e.type==='childList') || (e.target.classList && e.target.classList.contains('tc-node'));})){mapDirty=true;dropBitmaps();dropObstacles();refresh();if(restoreNeedsFocus)requestAnimationFrame(focusRestoredNode);}
      // card_figure.js places a card's action toolbar (style, docked or floating class) after panning or selection,
      // or a card menu opened: re-check the navigation box.
      else if(events.some(function(e){return popupChange(e)||(e.target.classList && e.target.classList.contains('tc-card-actions'));})){dropObstacles();scheduleNav();}});
    observer.observe(board,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden','aria-expanded']});
    // When the board's view gets shorter (the inspector row opening under it on narrow screens, the
    // navigation band, the docked companion row), a selected card whose header was in view stays in view
    // down to its footer (RC4's Edit · Duplicate · ⋯ at the card's bottom edge): scroll by what was cut,
    // never past the header's top, so a card taller than the view keeps its header.
    var viewH=0;
    function keepSelectedInView(){
      var h=scroll.clientHeight,before=viewH;viewH=h;if(!before||h>=before)return;
      var head=board.querySelector('.tc-node.is-selected:not(.tc-tab-hidden) > .tc-node-head');if(!head)return;
      var top=scroll.getBoundingClientRect().top+scroll.clientTop,r=head.getBoundingClientRect(),end=Math.max(r.bottom,head.parentNode.getBoundingClientRect().bottom);
      if(r.top<top||r.top>=top+before)return;
      var cut=end+8-(top+h);if(cut>0)scroll.scrollTop+=Math.min(cut,r.top-top);
    }
    // Shown for the first time (size 0 -> N): frame a restored workspace before this frame paints.
    window.addEventListener('resize',dropObstacles);
    if(window.ResizeObserver){var ro=new ResizeObserver(function(){mapDirty=true;dropObstacles();keepSelectedInView();if(restoreNeedsFocus&&restorePlan)focusRestoredNode();refresh();});ro.observe(scroll);ro.observe(board);var intro=root.querySelector('.tc-intro');if(intro)ro.observe(intro);var tools=root.querySelector('.tc-toolbar');if(tools)ro.observe(tools);}
    var visibility=new MutationObserver(refresh);visibility.observe(root,{attributes:true,attributeFilter:['class']});var panel=root.querySelector('#tc-workspace-panel');if(panel)visibility.observe(panel,{attributes:true,attributeFilter:['hidden']});
    api.refresh=function(){mapDirty=true;dropObstacles();refresh();};refresh();
  };
})();
