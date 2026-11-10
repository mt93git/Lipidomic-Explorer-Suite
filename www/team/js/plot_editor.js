/* Presentation-only Plotly edits. No scientific coordinates enter this API. */
(function (root) {
  'use strict';
  var schema = {};
  var originalAnnotations = new WeakMap();
  var baselines = new WeakMap();
  // Marker shapes offered per series (Plotly symbol names), and their labels in the panel.
  var MARKER_SYMBOLS = ['circle','square','triangle-up','star','diamond'];
  var SYMBOL_LABELS = {'circle':'Circle','square':'Square','triangle-up':'Triangle','star':'Star','diamond':'Diamond','':'As plotted'};
  // Trace types whose points can take these shapes. 3D scatter only draws circle, square and diamond.
  var POINTER_SCATTER = ['scatter','scattergl','scatter3d','scatterpolar','scatterpolargl','scatterternary','scattergeo','scattercarpet'];
  var SYMBOLS_3D = ['circle','square','diamond'];
  function symbolChoices(trace){return (trace.type==='scatter3d'?SYMBOLS_3D:MARKER_SYMBOLS);}
  // 95% data ellipse: squared Mahalanobis radius of a chi-square with 2 degrees of freedom.
  var ELLIPSE_CHI2 = 5.991, ELLIPSE_STEPS = 72, ELLIPSE_PREFIX = 'team-ellipse:';
  function isEllipse(shape){return !!shape && typeof shape.name === 'string' && shape.name.indexOf(ELLIPSE_PREFIX) === 0;}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function selectionOwner(gd){return root.TeamDashboardSelection&&root.TeamDashboardSelection.forPlot(gd)||root.TeamGroupComparison&&root.TeamGroupComparison.forPlot&&root.TeamGroupComparison.forPlot(gd);}
  function scalar(value){return value==null||['string','number','boolean'].indexOf(typeof value)>=0;}
  function editableColor(trace,part){var obj=readPath(trace,part)||{};return scalar(obj.color)&&!obj.colorscale&&!obj.coloraxis;}
  // Plotly accepts unknown properties but silently ignores them for many trace
  // types. Offer only controls with a visible meaning for the source trace.
  function seriesCapabilities(trace){
    var type=trace.type || 'scatter', mode=String(trace.mode || '');
    var scatter=type==='scatter'||type==='scattergl';
    // Every trace that draws point markers: scatter-like traces in markers mode (2D, 3D, polar, ternary, geo, carpet),
    // and the sample points of a box or violin. Map traces (scattermapbox) use icon names, not these shapes.
    var scatterPoints=POINTER_SCATTER.indexOf(type)>=0 && mode.indexOf('markers')>=0;
    var boxPoints=(type==='box'&&trace.boxpoints!==false&&trace.boxpoints!=='false')||(type==='violin'&&trace.points!==false&&trace.points!=='false');
    return {marker:POINTER_SCATTER.indexOf(type)>=0 ? mode.indexOf('markers')>=0 : ['bar','histogram','box','violin','waterfall'].includes(type),
      pointer:scatterPoints||boxPoints,
      markerSize:scatterPoints||boxPoints,
      line:scatter ? mode.indexOf('lines')>=0 : ['box','violin','bar','histogram'].includes(type),
      fill:['box','violin','bar','histogram'].includes(type)||(scatter && trace.fill && trace.fill!=='none' && !trace.fillgradient),
      continuous:['heatmap','contour','histogram2d'].includes(type)};
  }
  // Three fixed stop labels are reliable only for an independent, non-reversed
  // scale with no special Plotly midpoint. Never replay such styles elsewhere.
  function supportsHeatScale(trace){
    return trace && trace.type==='heatmap' && !trace.coloraxis && trace.reversescale!==true && trace.zmid==null;
  }
  function fillPath(t){return ['bar','histogram'].includes(t.type)?'marker.color':'fillcolor';}
  function borderPath(t){return ['bar','histogram'].includes(t.type)?'marker.line':'line';}
  function fillEditable(t){return fillPath(t)!=='marker.color'||editableColor(t,'marker');}
  function alpha(v){var m=typeof v==='string'&&v.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([.\d]+)\s*\)$/);return m?Math.max(0,Math.min(1,Number(m[1]))):1;}
  function rgba(hex,a){return 'rgba('+[1,3,5].map(function(i){return parseInt(hex.slice(i,i+2),16);}).join(',')+','+a+')';}
  var colorbarWatches=new WeakMap();
  // Plotly can clear its gradient defs during a later resize/style pass while
  // leaving the colorbar's url reference in place. Redraw only broken scales,
  // using Plotly's own current data so the key and heat tiles stay identical.
  function watchHeatColorbars(gd){
    if(!gd||!gd.querySelectorAll||colorbarWatches.has(gd))return;
    var queued=false,repairing=false;
    function inspect(){
      queued=false;if(repairing||!gd.isConnected||!root.Plotly)return;
      var broken=Array.from(gd.querySelectorAll('.colorbar .cbfill')).some(function(rect){
        var fill=rect.style.fill||rect.getAttribute('fill')||'',m=fill.match(/url\(["']?#([^"')]+)["']?\)/);
        return m&&!Array.from(gd.querySelectorAll('linearGradient,radialGradient')).some(function(g){return g.id===m[1];});
      });
      if(!broken)return;repairing=true;
      Promise.resolve(root.Plotly.redraw(gd)).catch(function(){}).finally(function(){repairing=false;});
    }
    function schedule(){if(!queued&&!repairing){queued=true;requestAnimationFrame(inspect);}}
    var observer=new MutationObserver(schedule);observer.observe(gd,{childList:true,subtree:true});
    colorbarWatches.set(gd,observer);schedule();
  }
  function readPath(o,k){return k.split(".").reduce(function(v,p){return v == null ? undefined : v[p];},o);}
  function resetSource(gd){if(!gd)return;if(gd.dispatchEvent)gd.dispatchEvent(new CustomEvent('team-plot-editor-source-reset'));originalAnnotations.delete(gd);baselines.delete(gd);orientationStates.delete(gd);orientationGeometry.delete(gd);}
  function identity(t,i,data,legacy){
    // Server-owned semantic identity survives label edits, filtering and transpose.
    // Plotly-generated uid is intentionally ignored: it changes on fresh renders.
    var key=t.meta&&t.meta.teamSourceKey;
    if(!legacy&&typeof key==='string'&&key.length&&key.length<=450){
      return data.filter(function(a){return a.meta&&a.meta.teamSourceKey===key;}).length===1?'source:'+key:'';
    }
    var parts=[t.type||"scatter",t.name||"",t.legendgroup||""];var signature=JSON.stringify(parts);var matches=data.filter(function(a){return JSON.stringify([a.type||"scatter",a.name||"",a.legendgroup||""])===signature;}).length;if(matches!==1)return '';var occurrence=0;var hash=2166136261;for(var c=0;c<signature.length;c++){hash^=signature.charCodeAt(c);hash=Math.imul(hash,16777619);}return JSON.stringify([parts[0],String(parts[1]).slice(0,100),String(parts[2]).slice(0,100),hash>>>0,occurrence]);}
  function baseline(gd){if(!baselines.has(gd)){var layout={};Object.keys(schema).forEach(function(k){var v=readPath(gd.layout,k);layout[k]=v===undefined?null:v;});baselines.set(gd,{layout:layout,marginTop:gd.layout&&gd.layout.margin&&gd.layout.margin.t, categoryOriginal:{},categoryTouched:{},visibilityAxes:{},traces:(gd.data||[]).map(function(t,i){var n={sourceKey:identity(t,i,gd.data),legacySourceKey:identity(t,i,gd.data,true),group:t.legendgroup||'',condition:t.meta&&typeof t.meta.teamCondition==='string'?t.meta.teamCondition:null,panel:t.meta&&typeof t.meta.teamPanel==='string'?t.meta.teamPanel:null,visible:t.visible===undefined?true:t.visible,showlegend:t.showlegend,primarySeries:!['scatter','scattergl','scatter3d'].includes(t.type||'scatter')||String(t.mode||(gd._fullData&&gd._fullData[i]&&gd._fullData[i].mode)||'markers').includes('markers'),hasData:['x','y','z','values'].some(function(k){return (Array.isArray(t[k])||ArrayBuffer.isView(t[k]))&&t[k].length>0;})};["name","marker.color","marker.line.color","marker.line.width","fillcolor","line.color","line.width","marker.size","marker.symbol","box.fillcolor","box.line.color","opacity","colorscale","autocolorscale","points","box.visible"].forEach(function(k){var v=readPath(t,k);n[k]=v===undefined?null:v;});return n;}),touched:{}});originalAnnotations.set(gd,clone(((gd.layout||{}).annotations||[]).filter(function(a){return a.name!=='__presentation__'&&String(a.name||'').indexOf('tcstat-')!==0&&String(a.name||'').indexOf('team-bar-label:')!==0;})));}return baselines.get(gd);}
  function spec(key, type, min, max, choices) { schema[key] = {type:type,min:min,max:max,choices:choices}; }
  ['title.text','title.font.family','font.family','xaxis.title.text','yaxis.title.text','legend.font.family'].forEach(function(k){spec(k,'text');});
  ['title.font.family','font.family','legend.font.family'].forEach(function(k){schema[k].choices=['Arial','Helvetica','Verdana','Georgia','Times New Roman','Courier New','system-ui','sans-serif'];});
  ['paper_bgcolor','plot_bgcolor','font.color','title.font.color','legend.font.color','legend.bgcolor','xaxis.color','yaxis.color','xaxis.gridcolor','yaxis.gridcolor','xaxis.linecolor','yaxis.linecolor','xaxis.zerolinecolor','yaxis.zerolinecolor'].forEach(function(k){spec(k,'color');});
  ['font.size','title.font.size','legend.font.size','xaxis.title.font.size','yaxis.title.font.size','xaxis.tickfont.size','yaxis.tickfont.size'].forEach(function(k){spec(k,'number',6,72);});
  ['title.x','title.y','legend.x','legend.y'].forEach(function(k){spec(k,'number',-2,3);});
  ['xaxis','yaxis'].forEach(function(a){ ['showgrid','zeroline','showline','mirror','showticklabels'].forEach(function(k){spec(a+'.'+k,'boolean');}); ['gridwidth','zerolinewidth','linewidth'].forEach(function(k){spec(a+'.'+k,'number',0,10);}); spec(a+'.tickangle','number',-180,180); });
  spec('showlegend','boolean'); spec('legend.orientation','text',null,null,['h','v']);
  ['title.xanchor','legend.xanchor'].forEach(function(k){spec(k,'text',null,null,['left','center','right','auto']);});
  ['title.yanchor','legend.yanchor'].forEach(function(k){spec(k,'text',null,null,['top','middle','bottom','auto']);});
  function color(v){return typeof v==='string' && /^#[0-9a-f]{6}$/i.test(v);}
  function valid(v,s){return s.type==='number'?typeof v==='number'&&isFinite(v)&&v>=s.min&&v<=s.max:s.type==='boolean'?typeof v==='boolean':s.type==='color'?color(v):typeof v==='string'&&v.length<=500&&(!s.choices||s.choices.indexOf(v)>=0);}
  function clean(state){
    var out={layout:{},traces:[]}; state=state||{};if(typeof state.swapAxes==='boolean')out.swapAxes=state.swapAxes;if(PALETTES&&PALETTES[state.palette])out.palette=state.palette;if(typeof state.greyHealthy==='boolean')out.greyHealthy=state.greyHealthy;if(typeof state.groupEllipses==='boolean')out.groupEllipses=state.groupEllipses;
    Object.keys(schema).forEach(function(k){if(state.layout&&valid(state.layout[k],schema[k]))out.layout[k]=state.layout[k];});
    (Array.isArray(state.traces)?state.traces:[]).slice(0,100).forEach(function(t){if(!t||!Number.isInteger(t.index)||t.index<0||t.index>999)return; var n={index:t.index}; ['name','sourceKey','hidden','points','innerBox','color','fillColor','fillOpacity','lineColor','markerLineColor','markerLineWidth','lineWidth','markerSize','markerSymbol','opacity','scaleLow','scaleMid','scaleHigh'].forEach(function(k){var s=['hidden','points','innerBox'].includes(k)?{type:'boolean'}:k==='name'||k==='sourceKey'?{type:'text'}:k==='markerSymbol'?{type:'text',choices:MARKER_SYMBOLS}:['color','fillColor','lineColor','markerLineColor','scaleLow','scaleMid','scaleHigh'].includes(k)?{type:'color'}:{type:'number',min:0,max:['opacity','fillOpacity'].includes(k)?1:k==='lineWidth'||k==='markerLineWidth'?20:100};if(valid(t[k],s))n[k]=t[k];});if(!['scaleLow','scaleMid','scaleHigh'].every(function(k){return color(n[k]);})) ['scaleLow','scaleMid','scaleHigh'].forEach(function(k){delete n[k];});if(!n.sourceKey)delete n.hidden;out.traces.push(n);});
    // sourceKey owns the scientific mapping. Retain legacy index hints when
    // possible, but do not let an old hint collide with a newly rendered series
    // and make an otherwise valid checkpoint fail the strict server schema.
    var reservedIndices=new Set(out.traces.map(function(t){return t.index;})),usedIndices=new Set();out.traces.forEach(function(t){if(usedIndices.has(t.index)&&t.sourceKey){var spare=0;while(reservedIndices.has(spare)||usedIndices.has(spare))spare++;t.index=spare;reservedIndices.add(spare);}usedIndices.add(t.index);});
    if(Array.isArray(state.annotations)) out.annotations=state.annotations.slice(0,30).filter(function(a){return a&&typeof a.text==='string'&&a.text.length<=500&&Number.isFinite(a.x)&&a.x>=0&&a.x<=1&&Number.isFinite(a.y)&&a.y>=0&&a.y<=1;}).map(function(a){return {text:a.text,x:a.x,y:a.y,xref:'paper',yref:'paper',showarrow:false,font:{size:Math.max(6,Math.min(72,Number(a.size !== undefined ? a.size : a.font && a.font.size)||14)),color:color(a.color)?a.color:color(a.font && a.font.color)?a.font.color:'#17375e'}};});
    if(Array.isArray(state.categoryLabels)) {
      out.categoryLabels=[];
      state.categoryLabels.slice(0,2).forEach(function(a){
        if(!a||!['xaxis','yaxis'].includes(a.axis)||out.categoryLabels.some(function(v){return v.axis===a.axis;})||!Array.isArray(a.sourceKeys)||!a.sourceKeys.length||a.sourceKeys.length>100||a.sourceKeys.some(function(k){return typeof k!=='string'||!k.length||k.length>500;})||new Set(a.sourceKeys).size!==a.sourceKeys.length||!Array.isArray(a.values)||!Array.isArray(a.labels)||!a.values.length||a.values.length>100||a.values.length!==a.labels.length||a.values.some(function(v){return typeof v!=='string'||v.length>500;})||a.labels.some(function(v){return typeof v!=='string'||v.length>500;})||new Set(a.values).size!==a.values.length)return;
        out.categoryLabels.push({axis:a.axis,sourceKeys:a.sourceKeys.slice().sort(),values:a.values.slice(),labels:a.labels.slice()});
      });
    }
    return out;
  }
  // Match only explicit group labels from the immutable scientific source.
  function publicationGroup(label){
    var key=String(label||'').toLowerCase().replace(/[^a-z]/g,'');
    if(/^healthy(?:$|[_ -])/i.test(String(label||'')))return '#7A7A7A';
    if(['steady','steadystate','scsteadystate'].indexOf(key)>=0)return '#377eb8';
    if(['pain','crisis','paincrisis','scpaincrisis'].indexOf(key)>=0)return '#d82332';
    return null;
  }
  function publicationStyle(gd,state){
    var next=resolveTraceAliases(gd,state);if(!gd||!Array.isArray(gd.data)||!gd.layout)return next;
    var source=baseline(gd);
    // Publication style changes only: a full frame around the plot, black zero lines and Arial 10. Grid lines are removed; colors and backgrounds stay as they are.
    Object.assign(next.layout,{'font.family':'Arial','font.size':10,'title.font.family':'Arial','title.font.size':10,'legend.font.family':'Arial','legend.font.size':10});
    ['xaxis','yaxis'].forEach(function(axis){if(!readPath(gd._fullLayout||gd.layout,axis))return;Object.assign(next.layout,{[axis+'.showgrid']:false,[axis+'.showline']:true,[axis+'.mirror']:true,[axis+'.linecolor']:'#000000',[axis+'.linewidth']:1,[axis+'.zeroline']:true,[axis+'.zerolinecolor']:'#000000',[axis+'.zerolinewidth']:1,[axis+'.title.font.size']:10,[axis+'.tickfont.size']:10});});
    // Marker outline: 0.4 wide on every series drawn with points.
    source.traces.forEach(function(original,index){var trace=gd.data[index];if(!original.sourceKey||!trace||!seriesCapabilities(trace).pointer||['bar','histogram'].includes(trace.type))return;var patch=next.traces.find(function(t){return t.sourceKey===original.sourceKey;});if(!patch){patch={index:index,sourceKey:original.sourceKey};next.traces.push(patch);}patch.markerLineWidth=0.4;});
    return clean(next);
  }
  function safeText(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function categories(gd,axis){
    var a=readPath(gd&&gd._fullLayout,axis);
    if(!a||a.type!=='category'||!Array.isArray(a._categories)||!a._categories.length||a._categories.length>100||a._categories.some(function(v){return typeof v!=='string'||v.length>500;}))return null;
    return a._categories.slice();
  }
  function categoryDisplayLabels(gd,axis,values){var a=readPath(gd.layout,axis)||{},ticks=a.tickvals,labels=a.ticktext;if(!Array.isArray(ticks)||!Array.isArray(labels)||ticks.length!==labels.length)return values.slice();return values.map(function(v){var i=ticks.indexOf(v);return i>=0&&typeof labels[i]==='string'?labels[i]:v;});}
  function resolveTraceAliases(gd,state){var next=clean(state);if(!gd||!Array.isArray(gd.data)||!gd.layout)return next;var source=baseline(gd),mapped=[];next.traces.forEach(function(t){var match=t.sourceKey&&source.traces.find(function(v){return v.sourceKey===t.sourceKey||v.legacySourceKey===t.sourceKey;});if(match)t.sourceKey=match.sourceKey;var existing=t.sourceKey&&mapped.find(function(v){return v.sourceKey===t.sourceKey;});if(existing)Object.assign(existing,t);else mapped.push(t);});next.traces=mapped;return clean(next);}
  function desiredTraces(b,s,options){var desired={};s.traces.forEach(function(t){if(t.sourceKey){var matched=b.traces.findIndex(function(v){return v.sourceKey===t.sourceKey||v.legacySourceKey===t.sourceKey;});if(matched>=0)desired[matched]=Object.assign({},t,{index:matched});}else if(options.strictIdentity===false&&b.traces[t.index]&&b.traces[t.index].sourceKey)desired[t.index]=t;});return desired;}
  function hiddenIndices(b,desired){
    var hidden=new Set();Object.keys(desired).forEach(function(i){if(desired[i].hidden===true)hidden.add(Number(i));});
    // A legend group is one scientific series, including its companion layers.
    b.traces.forEach(function(t,i){if(!hidden.has(i)||!t.group)return;var group=b.traces.map(function(v,j){return v.group===t.group&&(!t.panel||v.panel===t.panel)?j:-1;}).filter(function(j){return j>=0;});if(group.every(function(j){return !!b.traces[j].sourceKey;}))group.forEach(function(j){hidden.add(j);});else group.forEach(function(j){hidden.delete(j);});});
    var candidates=b.traces.map(function(t,i){return t.hasData&&t.visible!==false&&t.visible!=='legendonly'?i:-1;}).filter(function(i){return i>=0;});
    var primary=candidates.filter(function(i){return b.traces[i].primarySeries;});if(primary.length)candidates=primary;
    var leaders=candidates.filter(function(i){return b.traces[i].showlegend!==false;});if(leaders.length)candidates=leaders;
    if(candidates.length&&candidates.every(function(i){return hidden.has(i);}))return new Set();
    return hidden;
  }
  // Hide categorical presentation slots only when their last source series is
  // hidden. Scientific coordinates and the complete source category order stay
  // available for exact restoration. Panel figures own their category/brackets.
  function visibilityLayout(gd,b,hidden,layout,state){
    if((gd.data||[]).some(function(t){return t.meta&&t.meta.teamPanel;}))return;
    ['xaxis','yaxis'].forEach(function(axis){
      var full=gd._fullLayout&&gd._fullLayout[axis];if(!full||full.type!=='category')return;
      var letter=axis[0],cache=b.visibilityAxes[axis];
      if(!cache){
        var source=gd.layout[axis]||{},cats=Array.isArray(full._categories)?full._categories.slice():[];
        if(!cats.length||cats.some(function(c){return typeof c!=='string';}))return;
        cache={categories:cats,original:{},touched:false};['categoryorder','categoryarray','tickmode','tickvals','ticktext','range','autorange'].forEach(function(k){cache.original[k]=source[k]===undefined?null:clone(source[k]);});b.visibilityAxes[axis]=cache;
      }
      var alias=(state.categoryLabels||[]).find(function(a){return a.axis===axis&&JSON.stringify(a.values)===JSON.stringify(cache.categories)&&JSON.stringify(a.sourceKeys)===JSON.stringify(b.traces.map(function(t){return t.sourceKey;}).sort());});
      if(!hidden.size){if(cache.touched){Object.keys(cache.original).forEach(function(k){layout[axis+'.'+k]=cache.original[k];});if(alias){var originalTicks=Array.isArray(cache.original.tickvals)&&cache.original.tickvals.every(function(v){return typeof v==='string';})?cache.original.tickvals:cache.categories;layout[axis+'.tickmode']='array';layout[axis+'.tickvals']=originalTicks;layout[axis+'.ticktext']=originalTicks.map(function(v){return safeText(alias.labels[alias.values.indexOf(v)]||v);});}cache.touched=false;}return;}
      var visible=new Set();(gd.data||[]).forEach(function(t,i){if(hidden.has(i)||b.traces[i].visible===false||b.traces[i].visible==='legendonly'||(t[axis]||letter)!==letter)return;var data=t[letter];if(Array.isArray(data))data.forEach(function(c){if(typeof c==='string')visible.add(c);});});
      var cats=cache.categories.filter(function(c){return visible.has(c);});if(!cats.length)return;
      var original=cache.original,ticks=Array.isArray(original.tickvals)&&original.tickvals.every(function(v){return typeof v==='string';})?original.tickvals.filter(function(v){return visible.has(v);}):cats.slice();
      if(!ticks.length)ticks=cats.slice();var labels=ticks.map(function(v){if(alias)return safeText(alias.labels[alias.values.indexOf(v)]||v);var i=Array.isArray(original.tickvals)?original.tickvals.indexOf(v):-1;return i>=0&&Array.isArray(original.ticktext)&&typeof original.ticktext[i]==='string'?original.ticktext[i]:v;});
      layout[axis+'.categoryorder']='array';layout[axis+'.categoryarray']=cats;layout[axis+'.tickmode']='array';layout[axis+'.tickvals']=ticks;layout[axis+'.ticktext']=labels;layout[axis+'.autorange']=true;layout[axis+'.range']=null;cache.touched=true;
    });
  }

  var paletteSignatures=new WeakMap(),applySerial=0;
  var PALETTES={'Gelato Days':['#BCD8EC','#FFCBE1','#D6E5BD','#DCCCEC','#FFDAB4','#F9E1A8'],'Lab':['#377EB8','#E41A1C','#4DAF4A','#984EA3','#FF7F00','#A65628'],'Okabe–Ito':['#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7'],'Nature (NPG)':['#E64B35','#4DBBD5','#00A087','#3C5488','#F39B7F','#8491B4','#91D1C2'],'Viridis':['#440154','#414487','#2A788E','#22A884','#7AD151','#FDE725'],'Pastel':['#66C5CC','#F6CF71','#F89C74','#DCB0F2','#87C55F','#9EB9F3','#FE88B1','#B3B3B3']};
  function darker(c,f){return '#'+[1,3,5].map(function(i){return Math.round(parseInt(c.slice(i,i+2),16)*(1-f)).toString(16).padStart(2,'0');}).join('');}
  function paletteStyle(gd,state,name,greyHealthy,recordAction){
    var next=resolveTraceAliases(gd,state),source=baseline(gd),colors=PALETTES[name];if(!colors)return next;
    var labels=Array.from(new Set((gd.layout.meta&&Array.isArray(gd.layout.meta.teamConditions)?gd.layout.meta.teamConditions:source.traces.map(function(t){return t.condition||t.group||t.name;})).filter(Boolean))).sort();
    source.traces.forEach(function(original,i){var trace=gd.data[i];if(!original.sourceKey||(trace.meta&&trace.meta.teamPanelColorOverride===true)||!editableColor(trace,'marker')||seriesCapabilities(trace).continuous)return;
      var label=original.condition||original.group||original.name;if(gd.layout.meta&&Array.isArray(gd.layout.meta.teamConditions)&&!gd.layout.meta.teamConditions.includes(label))return;var c=greyHealthy&&/^healthy(?:$|[_ -])/i.test(label)?'#7A7A7A':colors[Math.max(0,labels.indexOf(label))%colors.length];
      var patch=next.traces.find(function(t){return t.sourceKey===original.sourceKey;});if(!patch){patch={index:i,sourceKey:original.sourceKey};next.traces.push(patch);}
      var role=trace.meta&&trace.meta.teamRole;patch.color=trace.type==='violin'||role==='points'?'#000000':c;patch.lineColor=role==='inner-box'?darker(c,.60):trace.type==='violin'?darker(c,.45):c;
      if(seriesCapabilities(trace).fill&&fillEditable(trace)){patch.fillColor=role==='inner-box'?darker(c,.15):c;patch.fillOpacity=1;}
    });next.palette=name;next.greyHealthy=greyHealthy!==false;var cleaned=clean(next);if(recordAction!==false)paletteSignatures.set(gd,JSON.stringify(cleaned.traces));return cleaned;
  }
  // Group outlines: a dotted 95% data ellipse around the plotted points of each marker series, in the
  // series' own marker color. Presentation only: it is drawn from the coordinates already on the plot,
  // as layout shapes, and never changes a trace, a value or any statistic.
  function numericPoints(t){
    var xs=t.x,ys=t.y;if(!xs||!ys||(!Array.isArray(xs)&&!ArrayBuffer.isView(xs))||(!Array.isArray(ys)&&!ArrayBuffer.isView(ys)))return [];
    var out=[],n=Math.min(xs.length,ys.length);for(var i=0;i<n;i++){var x=Number(xs[i]),y=Number(ys[i]);if(typeof xs[i]!=='string'&&typeof ys[i]!=='string'&&isFinite(x)&&isFinite(y))out.push([x,y]);}
    return out;
  }
  function ellipsePath(points){
    var n=points.length;if(n<3)return null;
    var mx=0,my=0;points.forEach(function(p){mx+=p[0];my+=p[1];});mx/=n;my/=n;
    var sxx=0,syy=0,sxy=0;points.forEach(function(p){var dx=p[0]-mx,dy=p[1]-my;sxx+=dx*dx;syy+=dy*dy;sxy+=dx*dy;});sxx/=n-1;syy/=n-1;sxy/=n-1;
    var tr=sxx+syy,det=sxx*syy-sxy*sxy,disc=Math.sqrt(Math.max(0,tr*tr/4-det)),l1=tr/2+disc,l2=tr/2-disc;
    if(!(l1>0)||!(l2>1e-12*l1))return null;
    // Unit eigenvector of l1 (major axis); the minor axis is perpendicular.
    var vx,vy;if(Math.abs(sxy)>1e-12){vx=l1-syy;vy=sxy;}else if(sxx>=syy){vx=1;vy=0;}else{vx=0;vy=1;}
    var len=Math.hypot(vx,vy);vx/=len;vy/=len;
    var a=Math.sqrt(ELLIPSE_CHI2*l1),b=Math.sqrt(ELLIPSE_CHI2*l2),coords=[],xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    for(var k=0;k<ELLIPSE_STEPS;k++){var th=2*Math.PI*k/ELLIPSE_STEPS,u=a*Math.cos(th),v=b*Math.sin(th),x=mx+u*vx-v*vy,y=my+u*vy+v*vx;
      coords.push(x,y);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
    var path='M';for(var j=0;j<coords.length;j+=2)path+=(j?' L':'')+Number(coords[j].toPrecision(6))+','+Number(coords[j+1].toPrecision(6));
    return {path:path+' Z',bounds:{x:[xmin,xmax],y:[ymin,ymax]}};
  }
  // Marker series (one scatter trace with markers on the default axes) that can carry an outline.
  function ellipseSeries(gd){
    var out=[];(gd.data||[]).forEach(function(t,i){
      var full=(gd._fullData||[])[i]||t,caps=seriesCapabilities(Object.assign({},t,{mode:full.mode||t.mode}));
      if(!caps.markerSize||(t.type&&['scatter','scattergl'].indexOf(t.type)<0)||(t.xaxis&&t.xaxis!=='x')||(t.yaxis&&t.yaxis!=='y')||(t.meta&&t.meta.teamPanel))return;
      if(numericPoints(t).length>=3)out.push(i);
    });
    return out;
  }
  function ellipseShapes(gd,desired,b,hidden){
    var shapes=[],bounds={x:[Infinity,-Infinity],y:[Infinity,-Infinity]};
    ellipseSeries(gd).forEach(function(i){
      var t=gd.data[i],full=(gd._fullData||[])[i]||t,key=b.traces[i]&&b.traces[i].sourceKey;if(!key||hidden.has(i)||t.visible===false||t.visible==='legendonly')return;
      var chosen=desired[i]&&desired[i].color,marker=t.marker||{},fullMarker=full.marker||{},color=chosen||(typeof marker.color==='string'?marker.color:typeof fullMarker.color==='string'?fullMarker.color:null);
      if(!color)return;var e=ellipsePath(numericPoints(t));if(!e)return;
      shapes.push({type:'path',name:ELLIPSE_PREFIX+key,xref:'x',yref:'y',path:e.path,line:{color:color,width:1.5,dash:'dot'},fillcolor:'rgba(0,0,0,0)',layer:'above',editable:false});
      ['x','y'].forEach(function(a){bounds[a][0]=Math.min(bounds[a][0],e.bounds[a][0]);bounds[a][1]=Math.max(bounds[a][1],e.bounds[a][1]);});
    });
    return {shapes:shapes,bounds:bounds};
  }
  var orientationStates=new WeakMap(),orientationGeometry=new WeakMap();
  function orientationSupported(gd){return !!gd&&gd.data.every(function(t){return ['scatter','scattergl','bar','box','violin','heatmap','contour','histogram','histogram2d'].includes(t.type||'scatter')&&!t.transforms;})&&!(gd.layout.shapes||[]).some(function(s){return s.type==='path'&&!isEllipse(s);})&&!gd.layout.scene&&!gd.layout.polar;}
  function axisRef(value){return typeof value==='string'?value.replace(/^(x|y)(axis)?(\d*)( domain)?$/,function(_,a,b,n,d){return (a==='x'?'y':'x')+(b||'')+n+(d||'');}):value;}
  function swapFields(o,a,b){var av=o[a],bv=o[b];if(bv===undefined)delete o[a];else o[a]=bv;if(av===undefined)delete o[b];else o[b]=av;}
  function transpose(m){return Array.isArray(m)&&m.length&&m.every(function(r){return Array.isArray(r)&&r.length===m[0].length;})?m[0].map(function(_,i){return m.map(function(r){return r[i];});}):m;}
  function orientationTransform(gd,target){
    var data=clone(gd.data),layout=clone(gd.layout),geometry=orientationGeometry.get(gd);
    if(target&&!geometry){geometry={margin:clone(gd.layout.margin||{}),height:gd.layout.height,width:gd.layout.width,styleHeight:gd.style&&gd.style.height,domains:{},paper:{}};Object.keys(gd.layout).filter(function(k){return /^[xy]axis\d*$/.test(k);}).forEach(function(k){geometry.domains[k]=clone(gd.layout[k].domain||null);});(gd.layout.annotations||[]).forEach(function(a,i){if((a.xref||'paper')==='paper'&&(a.yref||'paper')==='paper'){var g={};['x','y','xanchor','yanchor','xshift','yshift'].forEach(function(k){g[k]=a[k];});geometry.paper[a.name||'index:'+i]=g;}});orientationGeometry.set(gd,geometry);}

    data.forEach(function(t){swapFields(t,'x','y');swapFields(t,'x0','y0');swapFields(t,'dx','dy');swapFields(t,'error_x','error_y');swapFields(t,'xbins','ybins');if(t.fill)t.fill=({tozeroy:'tozerox',tozerox:'tozeroy',tonexty:'tonextx',tonextx:'tonexty'})[t.fill]||t.fill;var xa=t.xaxis,ya=t.yaxis;t.xaxis=axisRef(ya||'y');t.yaxis=axisRef(xa||'x');
      if(['bar','box','violin','histogram'].includes(t.type)||t.stackgroup)t.orientation=t.orientation==='h'?'v':'h';
      if(['heatmap','contour','histogram2d'].includes(t.type)){['z','text','hovertext','customdata'].forEach(function(k){if(t[k])t[k]=transpose(t[k]);});}
      ['hovertemplate','texttemplate'].forEach(function(k){if(typeof t[k]==='string')t[k]=t[k].replace(/%\{([xy])(?=[:}])/g,function(_,a){return '%{'+(a==='x'?'y':'x');});});
    });
    Object.keys(gd.layout).filter(function(k){return /^[xy]axis\d*$/.test(k);}).forEach(function(k){delete layout[k];});
    Object.keys(gd.layout).filter(function(k){return /^[xy]axis\d*$/.test(k);}).forEach(function(k){var a=clone(gd.layout[k]);['anchor','overlaying','matches','scaleanchor'].forEach(function(p){if(a[p])a[p]=axisRef(a[p]);});layout[axisRef(k)]=a;});
    // Rotate each Cartesian panel within its physical cell. Axis domains are
    // placement, not data coordinates; exchanging them transposes the facet grid.
    var axisPartners={};(gd.data||[]).forEach(function(t){var x=t.xaxis||'x',y=t.yaxis||'y';(axisPartners[x]||(axisPartners[x]=new Set())).add(y);(axisPartners[y]||(axisPartners[y]=new Set())).add(x);});var sharedAxes=Object.keys(axisPartners).some(function(k){return axisPartners[k].size>1;});
    if(!sharedAxes)(gd.data||[]).forEach(function(t){var x=(t.xaxis||'x').replace(/^x/,'xaxis'),y=(t.yaxis||'y').replace(/^y/,'yaxis'),newX=axisRef(y),newY=axisRef(x);if(layout[newX]&&gd.layout[x]&&gd.layout[x].domain)layout[newX].domain=clone(gd.layout[x].domain);if(layout[newY]&&gd.layout[y]&&gd.layout[y].domain)layout[newY].domain=clone(gd.layout[y].domain);});
    if(layout.hovermode==='x'||layout.hovermode==='y')layout.hovermode=axisRef(layout.hovermode);else if(layout.hovermode==='x unified')layout.hovermode='y unified';else if(layout.hovermode==='y unified')layout.hovermode='x unified';
    if(layout.grid){swapFields(layout.grid,'rows','columns');swapFields(layout.grid,'xaxes','yaxes');if(layout.grid.subplots)layout.grid.subplots=transpose(layout.grid.subplots).map(function(row){return row.map(function(v){return typeof v==='string'?v.replace(/x(\d*)y(\d*)/g,function(_,x,y){return 'x'+y+'y'+x;}):v;});});}
    ['annotations','shapes','images'].forEach(function(k){(layout[k]||[]).forEach(function(a){var defaultRef=k==='shapes'?'x':'paper',defaultY=k==='shapes'?'y':'paper';if((a.xref||defaultRef)==='paper'&&(a.yref||defaultY)==='paper')return;swapFields(a,'x','y');swapFields(a,'x0','y0');swapFields(a,'x1','y1');swapFields(a,'ax','ay');swapFields(a,'sizex','sizey');swapFields(a,'xanchor','yanchor');var xr=a.xref,yr=a.yref;a.xref=axisRef(yr||'y');a.yref=axisRef(xr||'x');if(a.xanchor)a.xanchor=({bottom:'left',top:'right',middle:'center'})[a.xanchor]||a.xanchor;if(a.yanchor)a.yanchor=({left:'bottom',right:'top',center:'middle'})[a.yanchor]||a.yanchor;var axr=a.axref,ayr=a.ayref;if(axr||ayr){a.axref=axisRef(ayr);a.ayref=axisRef(axr);}});});
    if(!target&&geometry){layout.margin=clone(geometry.margin);if(geometry.height===undefined)delete layout.height;else layout.height=geometry.height;if(geometry.width===undefined)delete layout.width;else layout.width=geometry.width;Object.keys(geometry.domains).forEach(function(k){if(layout[k]){if(geometry.domains[k]===null)delete layout[k].domain;else layout[k].domain=clone(geometry.domains[k]);}});(layout.annotations||[]).forEach(function(a,i){var g=geometry.paper[a.name||'index:'+i];if(g)Object.keys(g).forEach(function(k){if(g[k]===undefined)delete a[k];else a[k]=g[k];});});if(gd.style)gd.style.height=geometry.styleHeight||'';orientationGeometry.delete(gd);}
    if(target&&layout.meta&&layout.meta.teamGroupComparison){
      var panels=[];(gd.data||[]).forEach(function(t){var panel=t.meta&&t.meta.teamPanel;if(panel&&!panels.some(function(p){return p.name===panel;}))panels.push({name:panel,x:axisRef((t.yaxis||'y').replace(/^y/,'yaxis')),y:axisRef((t.xaxis||'x').replace(/^x/,'xaxis'))});});
      var longest=0;data.forEach(function(t){if(t.meta&&t.meta.teamPanel)(t.y||[]).forEach(function(v){longest=Math.max(longest,String(v).length);});});var labelWidth=Math.ceil(longest*7),width=Number(layout.width)||gd.clientWidth||700,columns=width>=1100?2:1,rows=Math.max(1,Math.ceil(panels.length/columns)),height=Math.max(380,rows*300+100);
      layout.height=height;layout.margin=Object.assign({},layout.margin,{l:Math.max(90,labelWidth+58),r:30,t:55,b:65});if(gd.style)gd.style.height=height+'px';
      var plotHeight=height-layout.margin.t-layout.margin.b,rowGap=90/plotHeight,columnGap=columns===2?Math.min(.30,(labelWidth+55)/Math.max(200,width-layout.margin.l-160)):.05;
      panels.forEach(function(p,i){var row=Math.floor(i/columns),col=i%columns,x0=col*(1+columnGap)/columns,x1=x0+(1-columnGap)/columns,y0=1-(row+1)/rows+rowGap/2,y1=1-row/rows-rowGap/2;layout[p.x].domain=[x0,x1];layout[p.y].domain=[y0,y1];layout[p.x].automargin=true;layout[p.y].automargin=true;if(layout[p.x].title&&typeof layout[p.x].title==='object')layout[p.x].title.standoff=10;if(layout[p.y].title&&typeof layout[p.y].title==='object')layout[p.y].title.standoff=12;(layout.annotations||[]).forEach(function(a){if(a.name==='team-panel-title:'+p.name){a.x=(x0+x1)/2;a.y=y1;a.xref=a.yref='paper';a.xanchor='center';a.yanchor='bottom';a.yshift=14;}});});
    }
    return {data:data,layout:layout};
  }

  function apply(gd,state,options){
    options=options||{};watchHeatColorbars(gd);var batchId=++applySerial;if(gd&&gd.dispatchEvent&&paletteSignatures.get(gd)===JSON.stringify(clean(state).traces))gd.dispatchEvent(new CustomEvent('team-plot-editor-palette',{detail:{batchId:batchId,palette:state&&state.palette}}));
    if(gd&&root.Plotly&&orientationSupported(gd)&&!!orientationStates.get(gd)!==!!(state&&state.swapAxes)){
      var rotationBaseline=baseline(gd),previousAxes=rotationBaseline.visibilityAxes,previousAnnotations=clone(originalAnnotations.get(gd)||[]),previousGeometry=orientationGeometry.get(gd),previousStyleHeight=gd.style&&gd.style.height,swappedAxes={};Object.keys(rotationBaseline.visibilityAxes).forEach(function(k){swappedAxes[axisRef(k)]=rotationBaseline.visibilityAxes[k];});rotationBaseline.visibilityAxes=swappedAxes;var rotated=orientationTransform(gd,!!(state&&state.swapAxes));originalAnnotations.set(gd,clone((rotated.layout.annotations||[]).filter(function(a){return a.name!=='__presentation__'&&String(a.name||'').indexOf('tcstat-')!==0&&String(a.name||'').indexOf('team-bar-label:')!==0;})));orientationStates.set(gd,!!(state&&state.swapAxes));
      return Promise.resolve().then(function(){return root.Plotly.react(gd,rotated.data,rotated.layout);}).then(function(){return apply(gd,state,options);},function(error){orientationStates.set(gd,!(state&&state.swapAxes));rotationBaseline.visibilityAxes=previousAxes;originalAnnotations.set(gd,previousAnnotations);if(previousGeometry)orientationGeometry.set(gd,previousGeometry);else orientationGeometry.delete(gd);if(gd.style)gd.style.height=previousStyleHeight||'';if(gd.dispatchEvent)gd.dispatchEvent(new CustomEvent('team-plot-editor-applied',{detail:{batchId:batchId}}));throw error;});
    }
    if(!gd||!root.Plotly)return Promise.resolve();var s=resolveTraceAliases(gd,state), tasks=[],b=baseline(gd),layout={};if(s.palette){var defaults=paletteStyle(gd,{},s.palette,s.greyHealthy,false).traces;defaults.forEach(function(t){var existing=s.traces.find(function(saved){return saved.sourceKey===t.sourceKey;});if(!existing)s.traces.push(t);else Object.keys(t).forEach(function(k){if(existing[k]===undefined)existing[k]=t[k];});});}Object.keys(b.touched).forEach(function(k){layout[k]=b.layout[k];});Object.keys(s.layout).forEach(function(k){layout[k]=s.layout[k];b.touched[k]=true;});
    if(typeof s.layout['title.text']==='string'&&s.layout['title.text'].trim()){layout['margin.t']=Math.max(55,Number(b.marginTop)||0);b.titleMarginTouched=true;}else if(b.titleMarginTouched){layout['margin.t']=b.marginTop===undefined?null:b.marginTop;b.titleMarginTouched=false;}
    ['title.text','xaxis.title.text','yaxis.title.text'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(s.layout,k)&&typeof layout[k]==='string')layout[k]=safeText(layout[k]);});
    if(s.annotations||b.annotationsTouched){b.annotationsTouched=true;layout.annotations=clone(originalAnnotations.get(gd)).concat((s.annotations||[]).map(function(a){var n=clone(a);n.name='__presentation__';n.text=safeText(a.text);return n;}));}
    ['xaxis','yaxis'].forEach(function(axis){
      var patch=(s.categoryLabels||[]).find(function(a){return a.axis===axis;}),values=categories(gd,axis);
      if(!b.categoryOriginal[axis])b.categoryOriginal[axis]={tickmode:readPath(gd.layout,axis+'.tickmode'),tickvals:clone(readPath(gd.layout,axis+'.tickvals')||[]),ticktext:clone(readPath(gd.layout,axis+'.ticktext')||[])};
      if(b.categoryTouched[axis])['tickmode','tickvals','ticktext'].forEach(function(k){layout[axis+'.'+k]=b.categoryOriginal[axis][k]===undefined?null:b.categoryOriginal[axis][k];});
      if(patch&&values&&b.traces.length<=100&&b.traces.every(function(t){return !!t.sourceKey;})&&JSON.stringify(b.traces.map(function(t){return t.sourceKey;}).sort())===JSON.stringify(patch.sourceKeys)&&JSON.stringify(values)===JSON.stringify(patch.values)){var ticks=b.categoryOriginal[axis].tickmode==='array'&&b.categoryOriginal[axis].tickvals.length&&b.categoryOriginal[axis].tickvals.every(function(v){return typeof v==='string'&&patch.values.includes(v);})?b.categoryOriginal[axis].tickvals.slice():patch.values.slice();layout[axis+'.tickmode']='array';layout[axis+'.tickvals']=ticks;layout[axis+'.ticktext']=ticks.map(function(v){return safeText(patch.labels[patch.values.indexOf(v)]);});b.categoryTouched[axis]=true;}
    });
    var batches=new Map(),desired=desiredTraces(b,s,options),selection=selectionOwner(gd),hidden=selection?new Set():hiddenIndices(b,desired);
    if(!selection)visibilityLayout(gd,b,hidden,layout,s);
    // Group outlines: add/refresh/remove only our own shapes; any other shape of the plot stays as it is.
    var currentShapes=Array.isArray(gd.layout.shapes)?gd.layout.shapes:[],hadOutlines=currentShapes.some(isEllipse);
    if(s.groupEllipses===true||hadOutlines){
      var outlines=s.groupEllipses===true&&!selection?ellipseShapes(gd,desired,b,hidden):{shapes:[],bounds:null};
      layout.shapes=currentShapes.filter(function(sh){return !isEllipse(sh);}).concat(outlines.shapes);
      // Plotly does not autorange to shapes: widen each axis just enough to show the whole outline, and give the
      // axes back to autorange once the outlines are off.
      ['x','y'].forEach(function(a){var axis=a+'axis',full=gd._fullLayout&&gd._fullLayout[axis];if(!full||full.type!=='linear')return;
        if(outlines.bounds&&outlines.shapes.length){var range=Array.isArray(full.range)?full.range.slice():null;if(!range)return;var lo=Math.min(range[0],range[1]),hi=Math.max(range[0],range[1]),pad=(outlines.bounds[a][1]-outlines.bounds[a][0])*0.03,flipped=range[0]>range[1];
          lo=Math.min(lo,outlines.bounds[a][0]-pad);hi=Math.max(hi,outlines.bounds[a][1]+pad);layout[axis+'.range']=flipped?[hi,lo]:[lo,hi];layout[axis+'.autorange']=false;b.outlineAxes=b.outlineAxes||{};b.outlineAxes[axis]=true;}
        else if(b.outlineAxes&&b.outlineAxes[axis]){layout[axis+'.autorange']=true;delete b.outlineAxes[axis];}});
    }
    // A relayout whose every value already matches the plot is skipped (one changed key sends them all, so implied edits stay as before).
    if(Object.keys(layout).length&&!Object.keys(layout).every(function(k){var current=readPath(gd.layout,k);return (current==null&&layout[k]==null)||JSON.stringify(current)===JSON.stringify(layout[k]);}))tasks.push(root.Plotly.relayout(gd,layout));
    (gd.data||[]).forEach(function(source,index){var t=desired[index]||{index:index};var prior=b.traces[index];if(!prior)return;var u={};(prior.touched||[]).forEach(function(k){u[k]=(Array.isArray(prior[k])||ArrayBuffer.isView(prior[k])) ? [prior[k]] : prior[k];});
      var source=gd.data&&gd.data[t.index];if(!source)return;if(t.name!==undefined)u.name=safeText(t.name);
      if(selection){prior.visibilityTouched=false;}else if(hidden.has(index)){u.visible=false;prior.visibilityTouched=true;}else if(prior.visibilityTouched){u.visible=prior.visible;prior.visibilityTouched=false;}
      if(t.color&&(editableColor(source,'marker')||seriesCapabilities(source).pointer))u['marker.color']=t.color;
      var caps=seriesCapabilities(source), border=borderPath(source);
      if(t.lineColor&&editableColor(source,border))u[border+'.color']=t.lineColor;
      if(t.markerLineWidth!==undefined&&caps.pointer&&!['bar','histogram'].includes(source.type))u['marker.line.width']=t.markerLineWidth;
      if(t.markerLineColor&&caps.pointer&&!['bar','histogram'].includes(source.type))u['marker.line.color']=t.markerLineColor;
      if(t.lineWidth!==undefined)u[border+'.width']=t.lineWidth;
      if(caps.fill&&fillEditable(source)&&t.fillColor)u[fillPath(source)]=rgba(t.fillColor,t.fillOpacity===undefined?alpha(readPath((gd._fullData||[])[index]||source,fillPath(source))):t.fillOpacity);
      // The box inside a violin follows the violin's fill: the same color two shades darker (two 15% steps), with a darker outline.
      if(source.type==='violin'&&typeof t.fillColor==='string'&&/^#[0-9a-f]{6}$/i.test(t.fillColor)){u['box.fillcolor']=darker(t.fillColor,.30);u['box.line.color']=darker(t.fillColor,.60);}
      if(t.markerSize!==undefined&&scalar((source.marker||{}).size))u['marker.size']=t.markerSize;
      if(t.markerSymbol&&symbolChoices(source).indexOf(t.markerSymbol)>=0&&caps.pointer)u['marker.symbol']=t.markerSymbol;
      if(t.opacity!==undefined)u.opacity=t.opacity;if(source.type==='violin'){if(t.points!==undefined)u.points=t.points?'all':false;if(t.innerBox!==undefined)u['box.visible']=t.innerBox;}
      if(supportsHeatScale(source) && t.scaleLow && t.scaleMid && t.scaleHigh){
        u.colorscale=[[[0,t.scaleLow],[0.5,t.scaleMid],[1,t.scaleHigh]]];u.autocolorscale=false;
      }
      prior.touched=Object.keys(u).filter(function(k){return k!=='visible';});Object.keys(u).forEach(function(k){var intended=Array.isArray(u[k])?u[k][0]:u[k];if(JSON.stringify(readPath(source,k))===JSON.stringify(intended))delete u[k];});if(Object.keys(u).length){var keys=Object.keys(u).sort(),group=JSON.stringify(keys);if(!batches.has(group))batches.set(group,{keys:keys,traces:[],values:[]});batches.get(group).traces.push(t.index);batches.get(group).values.push(u);}
    });
    // One restyle per set of changed attributes instead of one per trace. A single-trace restyle
    // reads an array value as value[0] (Plotly takes value[i % length]); each trace's entry keeps that.
    batches.forEach(function(batch){var update={};batch.keys.forEach(function(k){update[k]=batch.values.map(function(u){return Array.isArray(u[k])?u[k][0]:u[k];});});tasks.push(root.Plotly.restyle(gd,update,batch.traces));});
    return Promise.all(tasks).then(function(result){if(gd.dispatchEvent)gd.dispatchEvent(new CustomEvent('team-plot-editor-applied',{detail:{batchId:batchId}}));return result;},function(error){if(gd.dispatchEvent)gd.dispatchEvent(new CustomEvent('team-plot-editor-applied',{detail:{batchId:batchId}}));throw error;});
  }
  function mount(options){
    var host=options.container, disposed=false, undoStack=[], redoStack=[], refreshPending=false, pendingFields=new Map(), boundPlot=null, inlineEditor=null, visibilityMessage=''; host.classList.add('tpe');
    function state(){return resolveTraceAliases(options.getPlot(),options.getState?options.getState():{});}
    function publish(next){if(!disposed&&options.onChange)options.onChange(clean(next));}
    function commit(next){if(options.isLocked&&options.isLocked()){if(options.onLocked)options.onLocked();return;}undoStack.push(state());if(undoStack.length>50)undoStack.shift();redoStack=[];publish(next);syncHistory();}
    function syncHistory(){var undo=host.querySelector('[data-history=undo]'),redo=host.querySelector('[data-history=redo]');if(undo)undo.disabled=!undoStack.length;if(redo)redo.disabled=!redoStack.length;}
    function el(tag,text){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
    function section(title){var d=el('details'),s=el('summary',title);d.appendChild(s);host.appendChild(d);return d;}
    function field(parent,label,key,owner,specification,change){var row=el('label'),input, s=Object.assign({},specification);if(/font\.family$/.test(key))s.choices=['Arial','Helvetica','Verdana','Georgia','Times New Roman','Courier New','system-ui','sans-serif'];row.appendChild(el('span',label));
      if(s.choices){input=el('select');s.choices.forEach(function(v){var o=el('option',s.labels&&s.labels[v]||(v==='h'?'Horizontal':v==='v'?'Vertical':v));o.value=v;input.appendChild(o);});}else{input=el('input');input.type=s.type==='boolean'?'checkbox':s.type==='number'?'number':s.type==='color'?'color':'text';if(s.type==='number'){input.min=s.min;input.max=s.max;input.step='any';}}
      var value=owner[key]; if(value===undefined){var gd=options.getPlot();value=readPath(gd&&gd._fullLayout,key);if(value===undefined)value=readPath(gd&&gd.layout,key);}
      if(s.choices&&s.choices.indexOf(value)<0){var families=String(value||'').split(',').map(function(v){return v.trim().replace(/^[\"']|[\"']$/g,'');});value=s.choices.find(function(choice){return families.some(function(family){return family.toLowerCase()===choice.toLowerCase();});})||s.choices[0];}
      if(s.type==='color'){var ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle='#52514e';if(typeof value==='string')ctx.fillStyle=value;var normalized=ctx.fillStyle;if(/^#[0-9a-f]{6}$/i.test(normalized))value=normalized;else{var rgb=normalized.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);value=rgb?'#'+rgb.slice(1,4).map(function(n){return Number(n).toString(16).padStart(2,'0');}).join(''):'#52514e';}}
      if(input.type==='checkbox')input.checked=!!value;else input.value=value===undefined?(s.type==='number'?(/font\.size$/.test(key)?12:/width$/.test(key)?1:0):''):value;
      var currentRaw=function(){return s.type==='boolean'?input.checked:input.value;};
      var entry={dirty:false,last:currentRaw(),commit:function(){
        var v=s.type==='boolean'?input.checked:s.type==='number'?Number(input.value):input.value;
        if((s.type==='number' && (input.value==='' || input.validity.badInput)) || !valid(v,s)) return false;
        if(entry.dirty || currentRaw()!==entry.last) change(v);entry.dirty=false;entry.last=currentRaw();return true;
      }};
      pendingFields.set(input,entry);
      input.addEventListener('input',function(){entry.dirty=true;});
      input.addEventListener('change',function(){entry.commit();});row.appendChild(input);parent.appendChild(row);
    }
    function tracePatch(next,index,gd){var key=baseline(gd).traces[index].sourceKey;if(!key)return null;var patch=next.traces.find(function(t){return t.sourceKey===key;});if(!patch){patch={index:index,sourceKey:key};next.traces.push(patch);}return patch;}
    function visibilityGroup(gd,index){var source=baseline(gd),group=source.traces[index].group,panel=source.traces[index].panel;return source.traces.map(function(t,i){return (group?t.group===group&&(!panel||t.panel===panel):i===index)?i:-1;}).filter(function(i){return i>=0;});}
    function setVisible(gd,index,visible){
      if(options.isLocked&&options.isLocked())return;var owned=selectionOwner(gd);if(owned){owned.setSeries(index,visible).then(render);return;}
      var members=visibilityGroup(gd,index),source=baseline(gd);
      if(members.some(function(i){return !source.traces[i].sourceKey;})){visibilityMessage='This group contains ambiguous companion series and cannot be hidden safely.';render();return;}
      var next=state();members.forEach(function(i){var patch=tracePatch(next,i,gd);if(visible)delete patch.hidden;else patch.hidden=true;});
      if(next.traces.length>100){visibilityMessage='This group exceeds the presentation editor limit.';render();return;}
      var intended=members.some(function(i){return next.traces.some(function(t){return t.sourceKey===source.traces[i].sourceKey&&t.hidden;});});
      if(intended&&!members.every(function(i){return hiddenIndices(source,desiredTraces(source,next,{})).has(i);})){visibilityMessage='Keep at least one scientific series visible.';render();return;}
      visibilityMessage='';commit(next);render();
    }
    function closeInline(focus){if(!inlineEditor)return;var current=inlineEditor;inlineEditor=null;current.dialog.remove();if(focus&&boundPlot&&boundPlot.isConnected){boundPlot.tabIndex=boundPlot.tabIndex<0?0:boundPlot.tabIndex;boundPlot.focus({preventScroll:true});}}
    function bindPlot(gd){
      if(gd&&gd.classList){gd.classList.add('tpe-editable-plot');gd.classList.toggle('tpe-category-x',!!categories(gd,'xaxis'));gd.classList.toggle('tpe-category-y',!!categories(gd,'yaxis'));}
      if(boundPlot===gd)return;
      if(boundPlot){if(boundPlot.classList)boundPlot.classList.remove('tpe-editable-plot','tpe-category-x','tpe-category-y');boundPlot.removeEventListener('dblclick',onDoubleClick,true);boundPlot.removeEventListener('team-plot-editor-source-reset',onSourceReset);boundPlot.removeEventListener('team-dashboard-selection',onSelection);if(boundPlot.removeListener){boundPlot.removeListener('plotly_legendclick',preventNativeLegend);boundPlot.removeListener('plotly_legenddoubleclick',preventNativeLegend);}}
      closeInline(false);boundPlot=gd;
      if(gd){gd.addEventListener('dblclick',onDoubleClick,true);gd.addEventListener('team-plot-editor-source-reset',onSourceReset);gd.addEventListener('team-dashboard-selection',onSelection);if(gd.on){gd.on('plotly_legendclick',preventNativeLegend);gd.on('plotly_legenddoubleclick',preventNativeLegend);}}
    }
    function onSelection(){var owned=selectionOwner(boundPlot);if(!owned)return;host.querySelectorAll('[data-team-series-index]').forEach(function(check){check.checked=owned.isSelected(Number(check.dataset.teamSeriesIndex));});}
    function preventNativeLegend(){return false;}
    function onSourceReset(){closeInline(false);}
    function onRestored(){closeInline(false);undoStack=[];redoStack=[];visibilityMessage='';syncHistory();}
    function textTarget(target,gd){
      var legendRow=target.closest&&target.closest('g.traces'),text=legendRow&&legendRow.querySelector('.legendtext')||target.closest&&target.closest('text');if(!text||!gd.contains(text))return null;
      var className=text.getAttribute('class')||'',layoutKey=className.split(/\s+/).includes('gtitle')?'title.text':className.split(/\s+/).includes('xtitle')?'xaxis.title.text':className.split(/\s+/).includes('ytitle')?'yaxis.title.text':null;
      if(layoutKey)return {label:labelFor(layoutKey),value:state().layout[layoutKey]===undefined?text.textContent:state().layout[layoutKey],change:function(next,value){next.layout[layoutKey]=value;}};
      if(text.classList.contains('legendtext')){
        var row=text.closest('g.traces'),datum=row&&row.__data__,trace=Array.isArray(datum)&&datum[0]&&datum[0].trace,index=trace&&trace.index;
        if(!Number.isInteger(index)||!baseline(gd).traces[index]||!baseline(gd).traces[index].sourceKey)return null;
        var key=baseline(gd).traces[index].sourceKey,patch=state().traces.find(function(t){return t.sourceKey===key;});
        return {label:'Series label',value:patch&&patch.name!==undefined?patch.name:baseline(gd).traces[index].name,change:function(next,value){tracePatch(next,index,gd).name=value;}};
      }
      var axis=text.closest('.xtick')?'xaxis':text.closest('.ytick')?'yaxis':null,values=axis&&categories(gd,axis),datum=text.__data__,index=datum&&datum.x;
      if(!values||baseline(gd).traces.length>100||baseline(gd).traces.some(function(t){return !t.sourceKey;})||!Number.isInteger(index)||index<0||index>=values.length)return null;
      var existing=(state().categoryLabels||[]).find(function(a){return a.axis===axis&&JSON.stringify(a.values)===JSON.stringify(values);});
      return {label:(axis==='xaxis'?'Horizontal':'Vertical')+' category label',value:existing?existing.labels[index]:text.textContent,change:function(next,value){next.categoryLabels=(next.categoryLabels||[]).filter(function(a){return a.axis!==axis;});var labels=existing?existing.labels.slice():categoryDisplayLabels(gd,axis,values);labels[index]=value;next.categoryLabels.push({axis:axis,sourceKeys:baseline(gd).traces.map(function(t){return t.sourceKey;}).sort(),values:values.slice(),labels:labels});}};
    }
    function onDoubleClick(event){
      if(disposed||!boundPlot||options.getPlot()!==boundPlot||boundPlot.closest('.tc-finished')||(options.isLocked&&options.isLocked()))return;
      var target=textTarget(event.target,boundPlot);if(!target)return;
      event.preventDefault();event.stopImmediatePropagation();closeInline(false);
      var gd=boundPlot,source=baseline(gd),dialog=el('form'),label=el('label',target.label+' '),input=el('input'),applyButton=el('button','Apply label'),cancel=el('button','Cancel');
      dialog.className='tpe-inline-label';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Edit '+target.label.toLowerCase());input.type='text';input.maxLength=500;input.value=String(target.value||'');label.appendChild(input);dialog.appendChild(label);applyButton.type='submit';cancel.type='button';dialog.append(applyButton,cancel);
      var rect=event.target.getBoundingClientRect();dialog.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-320))+'px';dialog.style.top=Math.max(8,Math.min(rect.bottom+5,window.innerHeight-130))+'px';document.body.appendChild(dialog);
      function save(){if(!inlineEditor||inlineEditor.dialog!==dialog||options.getPlot()!==gd||baselines.get(gd)!==source||!gd.isConnected){closeInline(false);return false;}var next=state();target.change(next,input.value);closeInline(true);commit(next);render();return true;}
      inlineEditor={dialog:dialog,save:save};dialog.addEventListener('submit',function(e){e.preventDefault();save();});cancel.onclick=function(){closeInline(true);};dialog.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeInline(true);}});input.focus();input.select();
    }
    var labels={'title.text':'Plot title','title.x':'Title horizontal position','title.y':'Title vertical position','font.family':'Chart font','font.size':'Chart font size','font.color':'Chart text color','paper_bgcolor':'Page background','plot_bgcolor':'Plot background','xaxis.zeroline':'X = 0 reference line','yaxis.zeroline':'Y = 0 reference line','xaxis.showgrid':'Vertical grid lines','yaxis.showgrid':'Horizontal grid lines','showlegend':'Show legend','name':'Series label','color':'Marker color','fillColor':'Fill color','fillOpacity':'Fill opacity','lineColor':'Border / line color','markerLineColor':'Marker outline color','markerLineWidth':'Marker outline width','xaxis.mirror':'Frame around plot (x)','yaxis.mirror':'Frame around plot (y)','xaxis.linecolor':'Axis line color (x)','yaxis.linecolor':'Axis line color (y)','lineWidth':'Border / line width','markerSize':'Marker size','markerSymbol':'Marker shape','opacity':'Opacity','text':'Text','x':'Horizontal position','y':'Vertical position','size':'Font size'};
    function labelFor(k){if(labels[k])return labels[k];var v=k.replace(/^(xaxis|yaxis)\./,'').replace(/^title\./,'Title ').replace(/^legend\./,'Legend ').replace(/title\.font\./,'Axis title ').replace(/tickfont\./,'Tick label ').replace(/font\./,'font ').replace(/showgrid/,'Show grid').replace(/showticklabels/,'Show tick labels').replace(/showline/,'Show axis line').replace(/zerolinecolor/,'Zero line color').replace(/zerolinewidth/,'Zero line width').replace(/zeroline/,'Show zero line').replace(/gridcolor/,'Grid color').replace(/gridwidth/,'Grid width').replace(/linewidth/,'Axis line width').replace(/tickangle/,'Tick label angle').replace(/xanchor/,'horizontal anchor').replace(/yanchor/,'vertical anchor').replace(/bgcolor/,'background color').replace(/\./g,' ');return v.charAt(0).toUpperCase()+v.slice(1);}
    // A text/axis/background color keeps the chart's own default (dark gray text) until the user picks another; once changed,
    // "Reset" removes the change and gives the original color back.
    function layoutSection(title,keys){var p=section(title),current=state();keys.forEach(function(k){field(p,labelFor(k),k,current.layout,schema[k],function(v){var n=state();n.layout[k]=v;commit(n);});
      if(schema[k]&&schema[k].type==='color'&&current.layout[k]!==undefined){var row=p.lastElementChild,reset=el('button','Reset');reset.type='button';reset.className='tpe-reset-color';reset.title='Back to the original color';reset.setAttribute('aria-label','Reset '+labelFor(k)+' to the original color');reset.disabled=!!(options.isLocked&&options.isLocked());
        reset.onclick=function(){if(options.isLocked&&options.isLocked())return;var n=state(),plot=options.getPlot();delete n.layout[k];commit(n);
          // The plot returns to its own color a moment later: redraw the panel once it has, so the field shows that color.
          if(plot&&plot.addEventListener){var done=function(){plot.removeEventListener('team-plot-editor-applied',done);if(!disposed)render();};plot.addEventListener('team-plot-editor-applied',done);}render();};row.appendChild(reset);}});return p;}
    function render(){var focusedEl=host.contains(document.activeElement)?document.activeElement:null,focusKey=focusedEl&&(focusedEl.getAttribute('aria-label')||focusedEl.textContent);renderBody();
      // Rebuilding the panel drops focus: return it to the same control (by label) for keyboard users.
      if(focusKey&&!host.contains(document.activeElement)){var again=Array.from(host.querySelectorAll('button,select,input')).find(function(b){return (b.getAttribute('aria-label')||b.textContent)===focusKey&&!b.disabled;});if(again)again.focus({preventScroll:true});}}
    function renderBody(){var openSections=Array.from(host.querySelectorAll('details')).filter(function(d){return d.open;}).map(function(d){return d.querySelector('summary').textContent;});host.replaceChildren();pendingFields.clear();var gd=options.getPlot();bindPlot(gd&&Array.isArray(gd.data)&&gd.layout?gd:null);if(!gd||!Array.isArray(gd.data)||!gd.layout){host.appendChild(el('p','Presentation controls require an interactive Plotly chart. Images, tables and other widgets cannot be edited here.'));return;}watchHeatColorbars(gd);var sourceBaseline=baseline(gd);if(!selectionOwner(gd)&&state().traces.some(function(t){return t.hidden;})&&!hiddenIndices(sourceBaseline,desiredTraces(sourceBaseline,state(),{})).size)host.appendChild(el('p','Saved visibility cannot be applied safely; original visibility is shown.'));if(state().traces.some(function(t){return !t.sourceKey||!sourceBaseline.traces.some(function(v){return v.sourceKey===t.sourceKey||v.legacySourceKey===t.sourceKey;});}))host.appendChild(el('p','Some saved series are absent from this chart. Their presentation changes were skipped. Duplicate or unidentified series cannot be edited safely.'));var toolbar=el('div');toolbar.className='tpe-toolbar';['Undo','Redo'].forEach(function(label){var button=el('button',label);button.type='button';button.dataset.history=label.toLowerCase();button.onclick=function(){if(options.isLocked&&options.isLocked())return;var from=label==='Undo'?undoStack:redoStack,to=label==='Undo'?redoStack:undoStack;if(!from.length)return;to.push(state());publish(from.pop());render();};toolbar.appendChild(button);});var preset=el('button','Publication style');preset.type='button';preset.title='White background, black Arial text, fine axes and recognized group colors. Scientific data stay unchanged.';preset.onclick=function(){commit(publicationStyle(gd,state()));render();};toolbar.appendChild(preset);var reset=el('button','Reset presentation');reset.type='button';reset.onclick=function(){if(toolbar.querySelector('[role=group]'))return;var confirm=el('div');confirm.setAttribute('role','group');confirm.setAttribute('aria-label','Confirm presentation reset');confirm.appendChild(el('span','Reset all presentation changes?'));var yes=el('button','Reset all'),cancel=el('button','Cancel');yes.type=cancel.type='button';yes.onclick=function(){commit({layout:{},traces:[],annotations:[]});render();};cancel.onclick=function(){confirm.remove();reset.focus();};confirm.appendChild(yes);confirm.appendChild(cancel);toolbar.appendChild(confirm);cancel.focus();};toolbar.appendChild(reset);var orient=el('button','Change orientation');orient.type='button';orient.disabled=!orientationSupported(gd);orient.title=orient.disabled?'Orientation is available for Cartesian plots without path shapes.':'Transpose data, axes, hover labels and decorations.';orient.onclick=function(){var n=state();n.swapAxes=!n.swapAxes;commit(n);render();};toolbar.appendChild(orient);host.appendChild(toolbar);syncHistory();host.appendChild(el('p','Presentation changes only. Double-click a rendered title, axis title, legend label or categorical tick to edit its text. Numeric ticks cannot be relabeled. Scientific coordinates and per-point colors are preserved.'));if(visibilityMessage){var message=el('p',visibilityMessage);message.setAttribute('role','status');host.appendChild(message);}
      var paletteSection=section('Color palette');
      // A chart drawn only with a continuous colour scale (heatmaps) has no series a
      // categorical palette could recolour: Apply palette did nothing there. Say so instead.
      var allContinuous=(gd.data||[]).length&&(gd.data||[]).every(function(t){return seriesCapabilities(t).continuous;}),recolourable=(gd.data||[]).some(function(t,i){var b=sourceBaseline.traces[i];return b&&b.sourceKey&&editableColor(t,'marker')&&!seriesCapabilities(t).continuous;});
      // No series a palette could recolour (continuous scales, per-point colours): Apply palette would do nothing.
      if(allContinuous)paletteSection.appendChild(el('p','This chart uses a continuous colour scale. Categorical palettes apply to charts with series or groups.'));else if((gd.data||[]).length&&!recolourable)paletteSection.appendChild(el('p','This chart has no series a palette can recolour: its colours are set per point. Categorical palettes apply to charts with series or groups.'));else{var paletteSelect=el('select');paletteSelect.setAttribute('aria-label','Color palette');Object.keys(PALETTES).forEach(function(name){var o=el('option',name);o.value=name;paletteSelect.appendChild(o);});paletteSelect.value=state().palette||'Gelato Days';paletteSection.appendChild(paletteSelect);var swatches=el('div');swatches.className='tpe-palette-swatches';function paintSwatches(){swatches.replaceChildren();PALETTES[paletteSelect.value].forEach(function(c){var chip=el('span');chip.style.backgroundColor=c;chip.title=c;swatches.appendChild(chip);});}paletteSelect.onchange=paintSwatches;paintSwatches();paletteSection.appendChild(swatches);var greyLabel=el('label'),grey=el('input');grey.type='checkbox';grey.checked=state().greyHealthy!==false;greyLabel.appendChild(el('span','Healthy in grey'));greyLabel.appendChild(grey);paletteSection.appendChild(greyLabel);var applyPalette=el('button','Apply palette');applyPalette.type='button';applyPalette.onclick=function(){var next=paletteStyle(gd,state(),paletteSelect.value,grey.checked);commit(next);render();};paletteSection.appendChild(applyPalette);}
      layoutSection('Title and fonts',Object.keys(schema).filter(function(k){return k.indexOf('title.')===0||k.indexOf('font.')===0;}));
      layoutSection('Chart background',['paper_bgcolor','plot_bgcolor']);
      if((gd.data||[]).some(function(t){return !t.type||['scatter','scattergl','bar','box','violin','heatmap','contour','histogram','histogram2d','waterfall'].indexOf(t.type)>=0;}))['xaxis','yaxis'].forEach(function(a){layoutSection(a==='xaxis'?'Horizontal axis':'Vertical axis',Object.keys(schema).filter(function(k){return k.indexOf(a+'.')===0&&!['showgrid','zeroline'].includes(k.slice(a.length+1));}));});
      if(readPath(gd._fullLayout||gd.layout,'xaxis'))layoutSection('Grid & zero lines',['xaxis.showgrid','yaxis.showgrid','xaxis.zeroline','yaxis.zeroline']);
      var legendSection=layoutSection('Legend',Object.keys(schema).filter(function(k){return k==='showlegend'||k.indexOf('legend.')===0;}));
      var positions=el('div');positions.className='tpe-positions';positions.setAttribute('aria-label','Legend position');['Top','Middle','Bottom'].forEach(function(vertical,row){['Left','Center','Right'].forEach(function(horizontal,col){var button=el('button',vertical+' '+horizontal);button.type='button';button.onclick=function(){var n=state();n.layout['legend.x']=[0,.5,1][col];n.layout['legend.y']=[1,.5,0][row];n.layout['legend.xanchor']=['left','center','right'][col];n.layout['legend.yanchor']=['top','middle','bottom'][row];commit(n);};positions.appendChild(button);});});legendSection.insertBefore(positions,legendSection.children[1]);
      if(!selectionOwner(gd)&&!(gd.data||[]).some(function(t){return t.meta&&t.meta.teamPanel;})){
        var conditionGroups=Array.from(new Set(sourceBaseline.traces.map(function(t){return t.group;}).filter(Boolean)));
        if(conditionGroups.length){var conditions=section('Conditions'),chips=el('div');chips.className='tpe-condition-chips';conditionGroups.forEach(function(name){var index=sourceBaseline.traces.findIndex(function(t){return t.group===name;}),members=visibilityGroup(gd,index),button=el('button',name),currentlyHidden=hiddenIndices(sourceBaseline,desiredTraces(sourceBaseline,state(),{}));button.type='button';button.setAttribute('aria-pressed',members.some(function(i){return currentlyHidden.has(i);})?'false':'true');button.disabled=!!(options.isLocked&&options.isLocked())||members.some(function(i){return !sourceBaseline.traces[i].sourceKey;})||!members.some(function(i){return sourceBaseline.traces[i].visible!==false&&sourceBaseline.traces[i].visible!=='legendonly';});button.onclick=function(){setVisible(gd,index,button.getAttribute('aria-pressed')==='false');};chips.appendChild(button);});conditions.appendChild(chips);}
      }
      var series=section('Series'),gd=options.getPlot(),showAll=el('button','Show all series');showAll.type='button';showAll.disabled=!!(options.isLocked&&options.isLocked());showAll.onclick=function(){if(options.isLocked&&options.isLocked())return;var owned=selectionOwner(gd);if(owned){owned.showAll().then(render);return;}var next=state();next.traces.forEach(function(t){delete t.hidden;});visibilityMessage='';commit(next);render();};
        // Group outlines toggle, to the left of "Show all series": a dotted ellipse around each group's points, in the group's marker color.
        var seriesActions=el('div'),outlinesOn=state().groupEllipses===true,outlinesAvailable=ellipseSeries(gd).length>0&&!selectionOwner(gd),outlines=el('button','Group outlines: '+(outlinesOn?'On':'Off'));
        seriesActions.className='tpe-series-actions';outlines.type='button';outlines.setAttribute('aria-pressed',outlinesOn?'true':'false');outlines.dataset.groupOutlines='true';
        outlines.disabled=!!(options.isLocked&&options.isLocked())||(!outlinesAvailable&&!outlinesOn);
        outlines.title=outlinesAvailable||outlinesOn?'Draw a dotted 95% ellipse around the points of each group, in the color of its markers. Presentation only: no values or statistics change.':'Group outlines need a scatter plot with at least 3 points per group.';
        outlines.onclick=function(){if(options.isLocked&&options.isLocked())return;var n=state();n.groupEllipses=!outlinesOn;commit(n);render();};
        seriesActions.appendChild(outlines);seriesActions.appendChild(showAll);series.appendChild(seriesActions);series.appendChild(el('p',selectionOwner(gd)?(gd.layout.meta&&gd.layout.meta.teamGroupComparison?'Show or hide conditions in this panel. This changes presentation only; values and statistical models stay unchanged.':'Choose the lipid classes shown. Visible classes are renormalized to 100% per sample; the same selection is saved and used in CSV downloads.'):'Visibility changes whole identified series and their companion layers. Categories stored inside one trace cannot be hidden separately; at least one scientific series must remain visible. Raster images cannot expose editable series.'));
      ((gd&&gd.data)||[]).forEach(function(t,i){var group=el('fieldset');group.appendChild(el('legend',t.name||'Series '+(i+1)));series.appendChild(group);if(!baseline(gd).traces[i].sourceKey){group.appendChild(el('p','This series shares its identity with another series. Series editing is unavailable to preserve the scientific mapping.'));return;}var current=Object.assign({name:t.name||'',color:typeof (t.marker||{}).color==='string'?t.marker.color:'#52514e',lineColor:typeof (t.line||{}).color==='string'?t.line.color:'#17375e',lineWidth:(t.line||{}).width===undefined?2:t.line.width,markerSize:typeof (t.marker||{}).size==='number'?t.marker.size:6,markerSymbol:typeof (t.marker||{}).symbol==='string'?t.marker.symbol:'circle',opacity:t.opacity===undefined?1:t.opacity},state().traces.find(function(v){return v.sourceKey?v.sourceKey===baseline(gd).traces[i].sourceKey:v.index===i;})||{});
        var members=visibilityGroup(gd,i),visibility=el('label'),check=el('input');check.type='checkbox';check.dataset.teamSeriesIndex=String(i);check.checked=!members.some(function(j){return hiddenIndices(baseline(gd),desiredTraces(baseline(gd),state(),{})).has(j);});var sourceVisible=members.some(function(j){return baseline(gd).traces[j].visible!==false&&baseline(gd).traces[j].visible!=='legendonly';});check.checked=check.checked&&sourceVisible;check.disabled=!sourceVisible||members.some(function(j){return !baseline(gd).traces[j].sourceKey;});if(!sourceVisible&&!selectionOwner(gd))group.appendChild(el('p','This series is hidden by the original analysis; presentation controls do not reveal it.'));visibility.appendChild(el('span',members.length>1?'Show group and companion series':'Show series'));var owned=selectionOwner(gd);if(owned){check.checked=owned.isSelected(i);check.disabled=!!(options.isLocked&&options.isLocked());}visibility.appendChild(check);check.onchange=function(){setVisible(gd,i,check.checked);};group.appendChild(visibility);
        var effective=(gd._fullData||[])[i] || t, caps=seriesCapabilities(Object.assign({},t,{mode:effective.mode || t.mode})),perPoint=!editableColor(t,'marker');
        var fp=fillPath(t),bp=borderPath(t);
        // Marker shape: the 5 shapes (3 in 3D). A series whose points already carry their own shapes shows "As plotted" until one is chosen.
        var origSymbol=baseline(gd).traces[i]['marker.symbol'],shapeChoices=symbolChoices(t),asPlotted=!(origSymbol===undefined||origSymbol===null||(typeof origSymbol==='string'&&shapeChoices.indexOf(origSymbol)>=0)),symbolOptions={choices:(asPlotted?['']:[]).concat(shapeChoices)};
        var patch=state().traces.find(function(v){return v.sourceKey===baseline(gd).traces[i].sourceKey;})||{};
        current.fillColor=patch.fillColor||readPath(effective,fp)||'#17375e';current.fillOpacity=patch.fillOpacity===undefined?alpha(readPath(effective,fp)):patch.fillOpacity;
        if(patch.markerSymbol===undefined)current.markerSymbol=asPlotted?'':(typeof origSymbol==='string'?origSymbol:'circle');
        current.markerLineColor=patch.markerLineColor||(typeof readPath(effective,'marker.line.color')==='string'?readPath(effective,'marker.line.color'):'#ffffff');
        current.markerLineWidth=patch.markerLineWidth===undefined?(typeof readPath(effective,'marker.line.width')==='number'?readPath(effective,'marker.line.width'):0):patch.markerLineWidth;
        current.lineColor=patch.lineColor||readPath(effective,bp+'.color')||'#17375e';current.lineWidth=patch.lineWidth===undefined?(readPath(effective,bp+'.width')||0):patch.lineWidth;
        if(caps.continuous && supportsHeatScale(t) && effective.reversescale!==true && effective.zmid==null){
          group.appendChild(el('p','Change the low, scale midpoint and high colors of this plot only. The midpoint is not necessarily zero. Numeric values and scale limits stay unchanged.'));
          var scale=effective.colorscale || t.colorscale || [], defaults=['#0047AB','#FFFFFF','#FF0000'];
          function scaleHex(position,fallback){
            var stop=scale.find(function(x){return Array.isArray(x)&&Number(x[0])===position;});
            if(!stop)return fallback;var ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle=fallback;ctx.fillStyle=stop[1];return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle)?ctx.fillStyle:fallback;
          }
          ['scaleLow','scaleMid','scaleHigh'].forEach(function(k,j){
            var owner={};owner[k]=current[k]||scaleHex([0,0.5,1][j],defaults[j]);
            field(group,['Low color','Scale midpoint color','High color'][j],k,owner,{type:'color'},function(v){
              var n=state(), tr=n.traces.find(function(a){return a.sourceKey===baseline(gd).traces[i].sourceKey;});
              if(!tr){tr={index:i,sourceKey:baseline(gd).traces[i].sourceKey};n.traces.push(tr);}
              ['scaleLow','scaleMid','scaleHigh'].forEach(function(key,q){if(!tr[key])tr[key]=current[key]||scaleHex([0,0.5,1][q],defaults[q]);});tr[k]=v;commit(n);
            });
          });
        } else if(caps.continuous)group.appendChild(el('p','This plot uses a continuous color scale that cannot be edited here. Group palettes do not change it.'));
        else if(caps.marker && perPoint && caps.pointer)group.appendChild(el('p','This plot colors each point by value. Choosing a marker color below gives every point of this series one color instead; Reset presentation restores the original colors.'));
        else if(caps.marker && perPoint)group.appendChild(el('p','Per-point / continuous colors are preserved; uniform marker color is unavailable.'));
        if(t.type==='violin')['points','innerBox'].forEach(function(key){var owner={};owner[key]=patch[key]===undefined?(key==='points'?effective.points!==false:!!(effective.box&&effective.box.visible)):patch[key];field(group,key==='points'?'Points':'Inner box',key,owner,{type:'boolean'},function(value){var n=state(),tr=tracePatch(n,i,gd);tr[key]=value;commit(n);});});
        ['name','fillColor','fillOpacity','color','markerLineColor','markerLineWidth','lineColor','lineWidth','markerSymbol','markerSize','opacity'].forEach(function(k){if(((k==='markerLineColor'||k==='markerLineWidth')&&(!caps.pointer||['bar','histogram'].includes(t.type)))||(k==='markerSymbol'&&!caps.pointer)||(['fillColor','fillOpacity'].includes(k)&&(!caps.fill||!fillEditable(t)))||(k==='color'&&(!caps.marker||(perPoint&&!caps.pointer)||['bar','histogram'].includes(t.type)))||((k==='lineColor'||k==='lineWidth')&&!caps.line)||(k==='lineColor'&&!editableColor(t,bp))||(k==='markerSize'&&(!caps.markerSize||!scalar((t.marker||{}).size))))return;var s=k==='name'?{type:'text'}:k==='markerSymbol'?{type:'text',choices:symbolOptions.choices,labels:SYMBOL_LABELS}:['color','fillColor','lineColor','markerLineColor'].includes(k)?{type:'color'}:{type:'number',min:0,max:['opacity','fillOpacity'].includes(k)?1:k==='lineWidth'||k==='markerLineWidth'?20:100};field(group,labelFor(k),k,current,s,function(v){var n=state(),tr=n.traces.find(function(a){return a.sourceKey?a.sourceKey===baseline(gd).traces[i].sourceKey:a.index===i;});if(!tr){tr={index:i,sourceKey:baseline(gd).traces[i].sourceKey};n.traces.push(tr);}tr.sourceKey=baseline(gd).traces[i].sourceKey;tr[k]=v;if(['fillColor','fillOpacity'].includes(k)){var f=group.querySelector('input[data-fill-color]');if(!tr.fillColor&&f)tr.fillColor=f.value;if(tr.fillOpacity===undefined)tr.fillOpacity=current.fillOpacity;}commit(n);});if(k==='fillColor'){var row=group.lastElementChild;row.querySelector('input').dataset.fillColor='true';}});
      });
      var notes=section('Text annotations'),add=el('button','Add annotation');add.type='button';notes.appendChild(add);add.disabled=(state().annotations||[]).length>=30;if(add.disabled)add.title='Up to 30 annotations per chart.';add.onclick=function(){var n=state();n.annotations=n.annotations||[];n.annotations.push({text:'Annotation',x:0.5,y:0.5});commit(n);render();};
      (state().annotations||[]).forEach(function(a,i){var group=el('fieldset');notes.appendChild(group);['text','x','y','size','color'].forEach(function(k){var owner={};owner[k]=k==='size'?a.font.size:k==='color'?a.font.color:a[k];var s=k==='text'?{type:'text'}:k==='color'?{type:'color'}:{type:'number',min:k==='size'?6:0,max:k==='size'?72:1};field(group,labelFor(k),k,owner,s,function(v){var n=state();n.annotations=n.annotations.map(function(b){return {text:b.text,x:b.x,y:b.y,size:b.font.size,color:b.font.color};});n.annotations[i][k]=v;commit(n);});});var remove=el('button','Remove annotation');remove.type='button';remove.onclick=function(){var n=state();n.annotations.splice(i,1);commit(n);render();};group.appendChild(remove);});
      Array.from(host.querySelectorAll('details')).forEach(function(d){d.open=openSections.indexOf(d.querySelector('summary').textContent)>=0;});
    }
    function refresh(){if(host.contains(document.activeElement)&&/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)){refreshPending=true;return;}refreshPending=false;render();}
    function onFocusOut(){if(refreshPending)setTimeout(function(){if(!disposed)refresh();},0);}
    host.addEventListener('focusout',onFocusOut);window.addEventListener('team-canvas-restored',onRestored);
    function flushPending(){
      for (var pair of pendingFields) {
        if (pair[1].dirty && !pair[1].commit()) { pair[0].focus(); return false; }
      }
      if(inlineEditor&&!inlineEditor.save())return false;
      return true;
    }
    render();return {refresh:refresh,flushPending:flushPending,destroy:function(){disposed=true;closeInline(false);bindPlot(null);window.removeEventListener('team-canvas-restored',onRestored);pendingFields.clear();host.removeEventListener('focusout',onFocusOut);host.replaceChildren();}};
  }
  root.TeamPlotEditor={mount:mount,apply:apply,publicationStyle:publicationStyle,resetSource:resetSource,sanitize:clean,layoutSchema:schema,palettes:PALETTES,paletteStyle:paletteStyle,darker:darker,orientationSupported:orientationSupported,isSwapped:function(gd){return !!orientationStates.get(gd);}};
})(window);
