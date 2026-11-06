// DOM mock for camera math and scheduling, runnable without Chromium. This measures JS only;
// test_team_canvas_zoom_transform.cjs checks actual CSS layout, input hit-testing and exported files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const {execFileSync} = require('node:child_process');
const baseline = process.argv.includes('--baseline');
const source = name => baseline ? execFileSync('git', ['show', 'HEAD:www/team/js/' + name], {encoding:'utf8'}) : fs.readFileSync('www/team/js/' + name, 'utf8');
function fixture(width) {
  const all = [], frames = [], timers = new Set(); let refits = 0, refitAt=0;
  class El {
    constructor(cls = '') {
      this.className = cls; this.children = []; this.attrs = {}; this.events = {}; this._width = 0; this._height = 0;
      const values = {}, priorities = {};
      this.style = new Proxy({setProperty(k,v,p){values[k]=v;priorities[k]=p||'';},getPropertyValue:k=>values[k]||'',getPropertyPriority:k=>priorities[k]||'',removeProperty(k){delete values[k];delete priorities[k];}}, {get:(o,k)=>k in o?o[k]:values[k]||'',set:(o,k,v)=>(values[k]=v,true)});
      this.classList = {contains:c=>this.className.split(' ').includes(c),add:c=>{if(!this.classList.contains(c))this.className+=' '+c;},remove:c=>{this.className=this.className.split(' ').filter(x=>x!==c).join(' ');},toggle:(c,on)=>{on=on===undefined?!this.classList.contains(c):on;this.classList[on?'add':'remove'](c);return on;}};
      this.scrollLeft = this.scrollTop = this.clientLeft = this.clientTop = 0;this.isConnected = true;all.push(this);
    }
    set innerHTML(html) { // The navigation markup is the only HTML parsed by this fixture.
      if(!html.includes('tc-zoom-controls'))return;
      const details = new El('tc-map');details.tagName='DETAILS';details.open=true;
      const map = new El();map.tagName='SVG';map._width=178;map._height=80;
      const group = new El('tc-map-nodes'), rect = new El('tc-map-window');map.appendChild(group);map.appendChild(rect);details.appendChild(map);this.appendChild(details);
      const row = new El('tc-zoom-controls');this.appendChild(row);
      for(const cls of ['tc-zoom-out','tc-zoom-reset','tc-zoom-in','tc-zoom-fit']){const b=new El(cls);b.tagName='BUTTON';b.textContent=cls==='tc-zoom-reset'?'100%':'';row.appendChild(b);}
      this._width=220;this._height=142;
    }
    set textContent(v){this._text=v;this.firstChild={nodeType:3,nodeValue:v};}
    get textContent(){return this.firstChild?(this.firstChild.nodeType===3?this.firstChild.nodeValue:this.firstChild.textContent):this._text||'';}
    get parentElement(){return this.parentNode;}
    get childElementCount(){return this.children.length;}
    get lastElementChild(){return this.children.at(-1);}
    appendChild(n){if(n.parentNode)n.remove();this.children.push(n);this.firstChild=this.children[0];n.parentNode=this;return n;}
    insertBefore(n,b){if(n.parentNode)n.remove();this.children.splice(this.children.indexOf(b),0,n);n.parentNode=this;}
    before(n){this.parentNode.insertBefore(n,this);}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
    contains(n){return n===this||this.children.some(c=>c.contains(n));}
    matches(s){if(s==='svg'||s==='details')return this.tagName===s.toUpperCase();if(s==='strong')return this.tagName==='STRONG';const cls=/\.([\w-]+)/.exec(s);return !!cls&&this.classList.contains(cls[1])&&(!s.includes(':not(.tc-tab-hidden)')||!this.classList.contains('tc-tab-hidden'));}
    querySelectorAll(s){if(s.includes('aria-expanded')||s.includes(','))return [];const direct=s.startsWith(':scope > ');s=s.replace(':scope > ','');return this.children.flatMap(n=>[...(n.matches(s)?[n]:[]),...(direct?[]:n.querySelectorAll(s))]);}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
    closest(s){return this.matches(s)?this:this.parentNode?.closest(s)||null;}
    get offsetWidth(){return parseFloat(this.style.width)||this._width;}
    get offsetHeight(){return parseFloat(this.style.height)||this._height;}
    get clientWidth(){return this.classList.contains('tc-viewport-shell')?width:this.offsetWidth;}
    get clientHeight(){return this.classList.contains('tc-viewport-shell')?scroll.clientHeight+(parseFloat(this.style.getPropertyValue('padding-bottom'))||0):this.offsetHeight;}
    get offsetLeft(){return this.classList.contains('tc-navigation')?(parseFloat(this.style.getPropertyValue('left'))||12):parseFloat(this.style.left)||0;}
    get offsetTop(){return this.classList.contains('tc-navigation')?(parseFloat(this.style.getPropertyValue('top'))||this.parentNode.clientHeight-this.offsetHeight-12):parseFloat(this.style.top)||0;}
    get scrollWidth(){return board.offsetWidth*context.TeamCanvasViewport.scale;}
    get scrollHeight(){return board.offsetHeight*context.TeamCanvasViewport.scale;}
    get offsetParent(){return this.parentNode;}
    getBoundingClientRect(){let left=this.offsetLeft,top=this.offsetTop,w=this.offsetWidth,h=this.offsetHeight;const z=context?.TeamCanvasViewport?.scale||1;if(this===shell){w=width;h=this.clientHeight;}if(this===board||board.contains(this)){left=left*z-scroll.scrollLeft;top=top*z-scroll.scrollTop;w*=z;h*=z;}return {left,top,right:left+w,bottom:top+h,width:w,height:h};}
    getClientRects(){return [this.getBoundingClientRect()];}
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k]||null;}
    hasAttribute(k){return k in this.attrs;}
    addEventListener(k,f){(this.events[k] ||= []).push(f);}
    removeEventListener(k,f){this.events[k]=(this.events[k]||[]).filter(x=>x!==f);}
    emit(k,e={}){for(const f of [...this.events[k]||[]])f({target:this,button:0,pointerId:1,preventDefault(){},stopPropagation(){},...e});}
    setPointerCapture(){}
    focus(){}
  }
  const root=new El(),host=new El(),scroll=new El('tc-scroll'),board=new El('tc-board');root.appendChild(host);host.appendChild(scroll);scroll.appendChild(board);scroll._width=width;scroll._height=700;board._width=4000;board._height=3000;board.currentCSSZoom=1;
  for(let i=0;i<16;i++){const card=new El('tc-node');card.style.left=30+i%4*650+'px';card.style.top=30+Math.floor(i/4)*650+'px';card._width=620;card._height=600;const label=new El();label.tagName='STRONG';label.textContent='Plot '+i;card.appendChild(label);board.appendChild(card);}
  const document=new El();document.createElement=()=>new El();document.createElementNS=()=>new El();document.getElementById=()=>null;
  const context=vm.createContext({console,performance,Number,Math,Array,Event:class{},CustomEvent:class{},CSS:{supports:()=>true},localStorage:{getItem:()=>null,setItem(){}},getComputedStyle:()=>({position:'static',visibility:'visible',display:'block',paddingTop:'0',minWidth:'330',minHeight:'250'}),document,innerHeight:800,requestAnimationFrame:f=>frames.push(f),MutationObserver:class{observe(){}},setTimeout:(f,ms)=>{const id=setTimeout(()=>{timers.delete(id);f();},ms);timers.add(id);return id;},clearTimeout:id=>{clearTimeout(id);timers.delete(id);},setInterval:()=>0,clearInterval(){}});
  context.window=context;context.innerWidth=width;context.scrollY=0;context.addEventListener=()=>{};context.dispatchEvent=()=>{};context.TeamCanvas={fitAllPlots:()=>{refits++;refitAt=performance.now();}};
  vm.runInContext(source('canvas_viewport.js'),context);context.TeamCanvasViewport.mount(root,board);
  const shell=scroll.parentNode;
  function flush(){for(let i=0;frames.length&&i<20;i++){const batch=frames.splice(0);for(const f of batch)f();}assert(frames.length===0,'animation frames settle');}
  flush();
  return {context,board,scroll,shell,root,flush,El,refits:()=>refits,refitAt:()=>refitAt,dispose:()=>timers.forEach(clearTimeout)};
}
(async()=>{
  const metrics=[];
  for(const width of [1280,1440]){
    const f=fixture(width),{context:c,board,scroll}=f;
    try{
      for(const z of [.25,.5,1,1.25,1.5,2]){
        const t=performance.now();c.TeamCanvasViewport.setScale(z,true);f.flush();const immediate=performance.now()-t;
        if(baseline)await new Promise(r=>setTimeout(r,400));
        metrics.push({width,z,jsMs:+immediate.toFixed(3),settledMs:+(baseline?f.refitAt()-t:performance.now()-t).toFixed(3),mapOff:f.root.querySelector('.tc-navigation').classList.contains('tc-map-off')});
        const nav=f.root.querySelector('.tc-navigation'),n=nav.getBoundingClientRect(),s=f.shell.getBoundingClientRect();
        assert(!board.contains(nav)&&nav.parentNode===f.shell,'navigation outside transformed world');
        assert(n.left>=s.left&&n.right<=s.right&&n.top>=s.top&&n.bottom<=s.bottom,'navigation stays in its screen viewport');
        if(!baseline){assert.equal(board.style.zoom,'');assert.equal(board.style.transform,'scale('+z+')');assert(!nav.classList.contains('tc-map-off'),'no automatic hiding');assert(immediate<50);}
        const window=f.root.querySelector('.tc-map-window');assert.equal(+window.getAttribute('x'),scroll.scrollLeft/z);assert.equal(+window.getAttribute('width'),scroll.clientWidth/z);
      }
      if(!baseline){await new Promise(r=>setTimeout(r,400));f.flush();assert.equal(f.refits(),0,'zoom never fits any plot, including after idle');assert.equal(board.style.zoom,'','no delayed CSS zoom commit');}
      if(!baseline){
        c.TeamCanvasViewport.setScale(1);f.flush();
        c.document.emit('keydown',{key:'+'});f.flush();assert.equal(c.TeamCanvasViewport.scale,1.25,'+ shortcut');
        c.document.emit('keydown',{key:'-'});f.flush();assert.equal(c.TeamCanvasViewport.scale,1,'- shortcut');
        const svg=f.root.querySelector('svg');svg.viewBox={baseVal:{width:4000,height:3000}};
        svg.emit('pointerdown',{clientX:89,clientY:40});svg.emit('pointerup');f.flush();
        assert.equal(scroll.scrollLeft,2000-scroll.clientWidth/2,'minimap click uses world coordinates');
        const previous=scroll.scrollLeft;svg.emit('keydown',{key:'ArrowLeft'});f.flush();assert.equal(scroll.scrollLeft,previous-80);
        c.TeamCanvasViewport.focusNode(board.children[0]);f.flush();assert(c.TeamCanvasViewport.scale<=1,'scroll-to-card keeps a fitting scale');
      }
      // Exercise production drag/resize and export sizing helpers at all supported camera scales.
      const canvas=source('canvas.js');
      vm.runInContext(canvas.slice(canvas.indexOf('  function moveNode('),canvas.indexOf('  function expandBoard('))+'\nthis.attachMove=moveNode;'+(baseline?'':'this.attachResize=resizeNode;'),c);
      c.board=board;c.expandBoard=()=>{};c.changed=()=>{};
      const card=board.children[0],head=new f.El('tc-node-head');card.appendChild(head);c.attachMove(card,head);
      if(!baseline)c.attachResize(card);
      const exports=source('plot_exports.js');vm.runInContext(exports.slice(exports.indexOf('  function plotSize('),exports.indexOf('  function mountStatic('))+'\nthis.plotSize=plotSize;',c);
      const gd=new f.El();gd._width=580;gd._height=500;gd._fullLayout={width:580,height:500};gd.data=[{x:[1,2,3],y:[2,3,4]}];card.appendChild(gd);
      const bytes=[];
      c.Plotly={toImage:async(g,options)=>JSON.stringify({data:g.data,options})};
      c.fetch=async image=>({blob:async()=>Buffer.from(image)});c.saveBlob=blob=>bytes.push(blob.toString('hex'));
      vm.runInContext(exports.slice(exports.indexOf('  async function exportPlot('),exports.indexOf('  function saveBlob('))+'\nthis.exportPlot=exportPlot;',c);
      for(const z of [.5,1,1.5,2]){
        c.TeamCanvasViewport.setScale(z);f.flush();card.style.left='100px';card.style.top='100px';
        head.emit('pointerdown',{clientX:200,clientY:200});head.emit('pointermove',{clientX:280,clientY:240});scroll.scrollLeft+=20;scroll.scrollTop+=10;head.emit('pointermove',{clientX:280,clientY:240});head.emit('pointerup');
        assert(Math.abs(parseFloat(card.style.left)-100-100/z)<1e-8,'drag x follows pointer');assert(Math.abs(parseFloat(card.style.top)-100-50/z)<1e-8,'drag y follows pointer');
        if(!baseline){const handle=card.querySelector('.tc-node-resize');card.style.width='620px';card.style.height='600px';handle.emit('pointerdown',{clientX:300,clientY:300});handle.emit('pointermove',{clientX:360,clientY:340});handle.emit('pointerup');assert.equal(parseFloat(card.style.width),620+60/z);assert.equal(parseFloat(card.style.height),600+40/z);}
        // Exercise exportPlot -> plotSize -> mock Plotly.toImage -> saved bytes.
        await c.exportPlot(gd,'SVG','plot',null);
      }
      assert(bytes.every(b=>b===bytes[0]),'mock export bytes identical at 50/100/150/200%');
      if(!baseline){
        // CSSOM rounds zoom reciprocals: repeated toolbar placement must become a no-op,
        // or its own style observer creates a permanent layout/placement loop.
        const figure=source('card_figure.js');
        vm.runInContext(figure.slice(figure.indexOf('  function setStyle('),figure.indexOf('  function start('))+'\nthis.placeToolbar=place;',c);
        let writes=0;const values={},bar=new f.El('tc-card-actions'),toolbarStyle={getPropertyValue:k=>values[k]||'',setProperty(k,v){writes++;values[k]=v;}};
        Object.defineProperty(toolbarStyle,'zoom',{get:()=>values.zoom,set:v=>{writes++;values.zoom=v?String(Math.round(Number(v)*1e6)/1e6):'';}});bar.style=toolbarStyle;
        const parent={clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0})};
        const card={classList:{contains:()=>true},clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0,
          querySelector:s=>s.includes('tc-card-actions')?bar:{getBoundingClientRect:()=>({bottom:80+36*c.TeamCanvasViewport.scale})},
          closest:()=>parent,getBoundingClientRect:()=>({left:100,right:100+620*c.TeamCanvasViewport.scale,top:80,bottom:80+380*c.TeamCanvasViewport.scale,width:620*c.TeamCanvasViewport.scale,height:380*c.TeamCanvasViewport.scale})};
        bar.getBoundingClientRect=()=>({width:parseFloat(values.width)||240,height:30});
        for(const z of [.5,1,1.25,1.5,2]){c.TeamCanvasViewport.scale=z;c.placeToolbar(card,{left:0,top:0,right:1280,bottom:900});const before=writes;for(let i=0;i<5;i++)c.placeToolbar(card,{left:0,top:0,right:1280,bottom:900});assert.equal(writes,before,'toolbar style writes settle at '+z);}
      }

    }finally{f.dispose();}
  }
  console.log(JSON.stringify({mode:baseline?'HEAD baseline':'transform',metrics},null,2));
  console.log('PASS camera DOM mock (JS timing only): overlay bounds, world drag/resize, minimap, export sizing');
})().catch(e=>{console.error(e);process.exitCode=1;});
