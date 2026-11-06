(function () {
  'use strict';
  var states = new Map(), pending = new Map();
  function arr(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
  function rows(x) {
    if (Array.isArray(x)) return x;
    var keys=Object.keys(x||{}), n=keys.length ? arr(x[keys[0]]).length : 0;
    return Array.from({length:n},function(_,i){var r={};keys.forEach(function(k){r[k]=arr(x[k])[i];});return r;});
  }
  function colorHex(c) { if(typeof c!=='string')return null;if(/^#[0-9a-f]{6}$/i.test(c))return c.toLowerCase();var m=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,[^)]*)?\s*\)$/i.exec(c);return m?'#'+m.slice(1,4).map(function(v){return Math.min(255,Number(v)).toString(16).padStart(2,'0');}).join(''):null; }
  // Production's wrapping (84a24e5 legendLabel): a <br> every 18 characters, so a long condition name never runs past the card.
  function barLabel(value) { var chars=Array.from(String(value)), lines=[];while(chars.length)lines.push(chars.splice(0,18).join('').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));return lines.join('<br>'); }
  function darker(c,f) { var v=/^#([0-9a-f]{6})$/i.exec(c||''); if(!v)return '#333333'; var n=parseInt(v[1],16); return '#'+[n>>16,(n>>8)&255,n&255].map(function(x){return Math.round(x*(1-f)).toString(16).padStart(2,'0');}).join(''); }
  function button(parent,label,pressed,fn) { var b=document.createElement('button');b.type='button';b.className='tc-chip';b.textContent=label;b.setAttribute('aria-pressed',String(pressed));b.onclick=fn;parent.appendChild(b);return b; }
  function section(parent,title) { var div=document.createElement('div'), strong=document.createElement('strong');strong.textContent=title;div.className='gc-section';div.appendChild(strong);parent.appendChild(div);return div; }
  function snapshot(s) { var off={}, styles={};Object.keys(s.panelOff).forEach(function(c){off[c]=Array.from(s.panelOff[c]);});Object.keys(s.styles).forEach(function(c){styles[c]=s.styles[c];});return {features:Array.from(s.enabled),hiddenConditions:Array.from(s.off),panelOff:off,panelStyles:styles}; }
  function persist(s) { if(window.TeamCanvas && TeamCanvas.setGroupComparison)TeamCanvas.setGroupComparison(s.id+'-comparisonPlot',snapshot(s)); }
  function change(root,s) { persist(s);draw(root,s); }
  function selected(s,c,g) { return s.enabled.has(c) && !s.off.has(g) && !(s.panelOff[c]||new Set()).has(g); }
  function setInput(id,key,value) { var el=document.getElementById(id+'-'+key); if(el&&el.selectize)el.selectize.setValue(value);else if(el&&window.jQuery){var binding=jQuery(el).data('shiny-input-binding');if(binding&&binding.receiveMessage)binding.receiveMessage(el,{value:value});} if(window.Shiny) Shiny.setInputValue(id+'-'+key,value,{priority:'event'}); }
  function setting(parent,s,label,key,options,current) {
    var row=section(parent,label), select=document.createElement('select');select.setAttribute('aria-label',label);
    if(!current){var placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose…';placeholder.disabled=true;select.appendChild(placeholder);}
    options.forEach(function(pair){var o=document.createElement('option');o.value=pair[1];o.textContent=pair[0];select.appendChild(o);});
    if(!options.length) { select.disabled=true; row.appendChild(select); return; } select.value=String(current||''); select.onchange=function(){setInput(s.id,key,select.value);};row.appendChild(select);
  }
  // One group -> colour map for the whole figure: the shared top legend is the only colour key (condition
  // tick labels are hidden), so a group must have the same colour in every panel, whatever subset a panel
  // shows. Colour edits are stored once, in the style of the first class (features[0]); older states with
  // per-panel colours resolve to the first class that has one, so every panel still agrees.
  function sharedColor(s,g,kind){for(var i=0;i<s.features.length;i++){var st=s.styles[s.features[i]],v=st&&st[kind]&&st[kind][g];if(v)return v;}return null;}
  function setSharedColor(s,g,kind,value){s.features.forEach(function(f){var st=s.styles[f];if(st&&st[kind])delete st[kind][g];});if(!value||!s.features.length)return;var key=s.features[0],st=s.styles[key]||(s.styles[key]={colors:{},lines:{},points:true,box:true});if(!st[kind])st[kind]={};st[kind][g]=value;}
  function clearSharedColors(s){s.features.forEach(function(f){var st=s.styles[f];if(st){st.colors={};st.lines={};}});}
  function clearEditorColors(s){if(window.TeamCanvas&&TeamCanvas.clearGroupComparisonPanelColors)s.features.forEach(function(f){TeamCanvas.clearGroupComparisonPanelColors(s.id+'-comparisonPlot',f);});}
  function lineFor(s,g){return sharedColor(s,g,'lines')||darker(colorFor(s,g),.45);}
  function colorFor(s,g) {
    var override=sharedColor(s,g,'colors');if(override)return override;if(s.paletteColors&&s.paletteColors[g])return s.paletteColors[g];if(s.conditionColors&&colorHex(s.conditionColors[g]))return colorHex(s.conditionColors[g]);
    if (/^healthy(?:$|[_ -])/i.test(g)) return '#7A7A7A';
    var palette=(window.TeamPlotEditor&&TeamPlotEditor.palettes&&TeamPlotEditor.palettes['Gelato Days'])||['#BCD8EC','#FFCBE1','#D6E5BD','#DCCCEC','#FFDAB4','#F9E1A8'];
    return palette[Math.max(0,s.groups.slice().sort().indexOf(g))%palette.length];
  }
  function csv(s) {
    var cols=['Sample','GroupingVal','X_Grp','Facet_Grp','Feature','Plot_Value','P_Value','Significance','Is_Baseline','Feature_Selected','Condition_Enabled','Panel_Condition_Enabled','Displayed','Test_Selection','Test_Applied','P_Adjustment','Inference_Allowed','Reference','Baseline','Scale','Significance_Display'];
    function quote(x){if(x==null)x='';else if(typeof x==='string'&&/^[\s\u0000-\u001f]*[=+@-]/.test(x))x="'"+x;return '"'+String(x).replace(/"/g,'""')+'"';}
    var text=[cols.map(quote).join(',')].concat(s.rows.map(function(r){var c=r.Feature,g=r.GroupingVal, panelOn=!(s.panelOff[c]||new Set()).has(g),row=Object.assign({},r,{
      Feature_Selected:s.enabled.has(c),Condition_Enabled:!s.off.has(g),Panel_Condition_Enabled:panelOn,Displayed:selected(s,c,g),
      Test_Selection:s.settings.method||'',Test_Applied:s.settings.test||'',P_Adjustment:s.settings.correction||'none',Inference_Allowed:s.inferenceAllowed==null?'unknown':s.inferenceAllowed,Reference:s.settings.comparison||'',Baseline:JSON.stringify(s.baseline),Scale:s.settings.scale||'',Significance_Display:s.settings.significance||''});return cols.map(function(k){return quote(row[k]);}).join(',');})).join('\r\n');
    var a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='lipidomic-group-comparison.csv';a.click();setTimeout(function(){URL.revokeObjectURL(url);},60000);
  }
  function inferenceNotice(s) { if (s.inferenceAllowed===false&&s.inferenceReason) return s.inferenceReason; return s.inferenceAllowed===false?'Unpaired statistical tests are not enabled for the current study design or preparation. Review the study design and preparation before interpreting comparisons.':s.inferenceAllowed===true?'Unpaired inference is enabled. Individual p-values can still be unavailable when data or a test are insufficient.':'Inference eligibility is unavailable; the reason for missing p-values could not be determined.'; }
  function report(s) {
    var v=s.settings||{}, lines=['GROUP COMPARISON — LOCAL STATISTICS',
      'Test selection: '+(v.method||'automatic'), 'Test applied: '+(v.test||'not available'),
      'P-value adjustment: none (raw local pairwise p-values)', inferenceNotice(s),
      'Reference strategy: '+(v.comparison||'not selected'), 'Baseline: '+(s.baseline.join(', ')||'not selected'),
      'Scale: '+(v.scale||'not selected'), 'Significance display: '+(v.significance||'star'),
      'Metadata grouping: '+arr(v.grouping).join(', '),
      'Presentation hides do not exclude observations or recompute tests.',
      'The table below includes all computed classes and groups; visibility is indicated separately.'];
    if(s.baseline.length>1) lines.push('The reference combines multiple baseline groups; brackets are omitted because no single baseline position represents that pooled reference.');
    s.groups.forEach(function(g){var n=new Set(s.rows.filter(function(r){return r.GroupingVal===g;}).map(function(r){return r.Sample;})).size;lines.push('Group '+g+': '+n+' samples in data');});
    s.features.forEach(function(c){lines.push('\n'+c+(s.enabled.has(c)?' [shown]':' [hidden]'));s.groups.forEach(function(g){var rr=s.rows.filter(function(r){return r.Feature===c&&r.GroupingVal===g;}),first=rr[0];if(!first)return;var visible=selected(s,c,g)?'shown':'hidden', n=rr.filter(function(r){return r.Plot_Value!==null&&r.Plot_Value!==undefined&&Number.isFinite(Number(r.Plot_Value));}).length;if(first.Is_Baseline){lines.push('  '+g+': reference; n = '+n+' ('+visible+')');return;}var p=first.P_Value;lines.push('  '+g+': '+(p!==null&&p!==undefined&&Number.isFinite(Number(p))?'p = '+Number(p).toPrecision(6):(s.inferenceAllowed===false?'p unavailable — unpaired inference is not enabled':s.inferenceAllowed===true?'p unavailable — insufficient usable data, zero variation, or test failure':'p unavailable — inference status unknown'))+'; n = '+n+' ('+visible+')');});});
    return lines.join('\n');
  }
  // Plotly's export clone may recompute auto margins differently from the live
  // graph. Freeze the already measured margins only during capture, then put
  // the exact original layout back; editor state and legend anchors are intact.
  // Plotly sizes its legend clip with live-font metrics. A different SVG
  // export font can be wider, so retain vertical clipping while adding
  // horizontal room to the capture's legend clip only.
  function widenLegendClip(url) {
    if(typeof url!=='string'||!/^data:image\/svg\+xml/i.test(url))return url;
    var comma=url.indexOf(','),header=url.slice(0,comma),body=url.slice(comma+1);
    var markup=/;base64/i.test(header)?new TextDecoder().decode(Uint8Array.from(atob(body),function(c){return c.charCodeAt(0);})):decodeURIComponent(body);
    var doc=new DOMParser().parseFromString(markup,'image/svg+xml');
    if(!doc.documentElement||doc.documentElement.localName!=='svg')throw new Error('Invalid SVG plot');
    doc.querySelectorAll('g.legend g.scrollbox[clip-path]').forEach(function(box){
      var m=/url\(\s*['\"]?#([^)'\"\s]+)['\"]?\s*\)/.exec(box.getAttribute('clip-path')||'');if(!m)return;
      var clip=doc.getElementById(m[1]),rect=clip&&clip.querySelector('rect');if(!rect)return;
      var width=Number(rect.getAttribute('width'));if(!Number.isFinite(width)||width<0)return;
      var maxFont=12;box.querySelectorAll('text.legendtext').forEach(function(t){var hit=/font-size:\s*([0-9.]+)px/i.exec(t.getAttribute('style')||'');if(hit)maxFont=Math.max(maxFont,Number(hit[1])||0);});
      rect.setAttribute('width',String(width+Math.max(16,Math.ceil(maxFont*2.5))));
    });
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(doc.documentElement));
  }
  async function rasterFromSvg(url,width,height,format) {
    var img=new Image();await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=function(){reject(new Error('Could not render exported SVG'));};img.src=url;});
    var canvas=document.createElement('canvas');canvas.width=Math.round(width*3);canvas.height=Math.round(height*3);var ctx=canvas.getContext('2d');
    if(format==='jpg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return await new Promise(function(resolve,reject){canvas.toBlob(function(blob){if(blob)resolve(blob);else reject(new Error('Could not encode image'));},format==='jpg'?'image/jpeg':'image/png',.92);});
  }
  var exportQueues=new WeakMap();
  function withExportGeometry(gd,callback) {
    if(!gd||typeof gd!=='object')return Promise.resolve().then(callback);
    var previous=exportQueues.get(gd)||Promise.resolve();
    var current=previous.catch(function(){}).then(async function(){
      var size=gd._fullLayout&&gd._fullLayout._size;
      if(!size||!window.Plotly)return widenLegendClip(await callback());
      var margin=JSON.parse(JSON.stringify(gd.layout.margin||{}));
      try {
        await Plotly.relayout(gd,{'margin.l':size.l,'margin.r':size.r,'margin.t':size.t,'margin.b':size.b,'margin.autoexpand':false});
        return widenLegendClip(await callback());
      } finally { await Plotly.relayout(gd,{margin:margin}); }
    });
    exportQueues.set(gd,current);
    current.then(function(){if(exportQueues.get(gd)===current)exportQueues.delete(gd);},function(){if(exportQueues.get(gd)===current)exportQueues.delete(gd);});
    return current;
  }
  async function download(gd,format,status) {
    try {
      // Test mode (canvas.js lazy mount): throws if gd is a Canvas card not mounted and clean.
      if(window.TeamCanvas&&typeof window.TeamCanvas.assertClean==='function')window.TeamCanvas.assertClean(gd);
      // The Canvas card's revision now; the file is published only if it is unchanged.
      var token=window.TeamCanvas&&typeof window.TeamCanvas.exportRevision==='function'?window.TeamCanvas.exportRevision(gd):null;
      var w=Math.max(100,gd.clientWidth),h=Math.max(100,gd.clientHeight),url=await withExportGeometry(gd,function(){return Plotly.toImage(gd,{format:'svg',width:w,height:h});}), blob;
      if(format==='pdf') {
        if(window.TeamPdf)TeamPdf.ensureMinusFix();
        var text=decodeURIComponent(url.slice(url.indexOf(',')+1));var svg=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
        var pdf=new window.jspdf.jsPDF({orientation:w>=h?'landscape':'portrait',unit:'pt',format:[w,h]});await pdf.svg(svg,{x:0,y:0,width:w,height:h});blob=pdf.output('blob');
      } else if(format==='jpg'||format==='png') blob=await rasterFromSvg(url,w,h,format); else blob=await (await fetch(url)).blob();
      if(token&&!window.TeamCanvas.exportCurrent(token)){status.textContent='Plot changed \u2014 export again.';return;}
      var link=document.createElement('a'),local=URL.createObjectURL(blob);link.href=local;link.download='lipidomic-group-comparison.'+format;link.click();setTimeout(function(){URL.revokeObjectURL(local);},60000);status.textContent=format.toUpperCase()+' ready';
    } catch(e){status.textContent='Export failed: '+e.message;}
  }
  function controls(root,s,target,compact) {
    var box=target||root.querySelector('.gc-controls');box.replaceChildren();
    if(!compact){var stats=document.createElement('details');stats.className='gc-statistics';stats.open=!!s.statsOpen;stats.ontoggle=function(){s.statsOpen=stats.open;};var summary=document.createElement('summary');summary.textContent='Statistics';stats.appendChild(summary);box.appendChild(stats);
    var settings=s.settings||{};
    setting(stats,s,'Test','localStatMethod', [['Automatic','auto'],["Student’s t-test",'parametric'],['Wilcoxon','non_parametric']],settings.method);
    setting(stats,s,'Reference','comparisonStrategy',[['Global','Global (Combined Reference)'],['Faceted','Faceted (Intra-group Reference)']],settings.comparison);
    var baselines = settings.comparison==='Faceted (Intra-group Reference)' && arr(settings.grouping).length>1 && s.rows.length ? Array.from(new Set(s.rows.map(function(r){return r.X_Grp;}).filter(Boolean))) : s.groups;
    setting(stats,s,'Baseline','selectedBaseline',baselines.map(function(g){return [g,g];}),s.baseline.length===1?s.baseline[0]:null);
    setting(stats,s,'Scale','scaleMode',[['Log2FC','log2fc'],['Fold change','fc'],['Proportion difference','delta']],settings.scale);
    setting(stats,s,'Show','sigDisplayType',[['Stars','star'],['P-values','pvalue']],settings.significance);
    var note=document.createElement('p');note.textContent='Local comparison: '+(settings.test||'selected test')+'; unadjusted p-values. '+inferenceNotice(s);stats.appendChild(note);
    var reportButton=button(stats,s.reportOpen?'Hide full statistical report':'Show full statistical report',!!s.reportOpen,function(){s.reportOpen=!s.reportOpen;change(root,s);});if(s.reportOpen){var pre=document.createElement('pre');pre.className='gc-report';pre.textContent=report(s);stats.appendChild(pre);}
    }
    var body=box;if(!compact){var disclosure=document.createElement('details'),caption=document.createElement('summary');caption.textContent='Display controls';disclosure.open=!!s.displayOpen;disclosure.ontoggle=function(){s.displayOpen=disclosure.open;};disclosure.appendChild(caption);box.appendChild(disclosure);body=disclosure;}
    var f=section(body,'Lipid classes');button(f,'All',false,function(){s.enabled=new Set(s.features);change(root,s);});button(f,'None',false,function(){s.enabled.clear();change(root,s);});
    ['Glycerophospholipids','Sphingolipids','Glycerolipids','Sterol Lipids','Fatty Acyls','Other'].forEach(function(family){var classes=s.features.filter(function(c){var key=Object.keys(s.families||{}).find(function(k){return c===k || c.indexOf(k+' (')===0;});return ((s.families||{})[key]||'Other')===family;});if(!classes.length)return;var row=section(f,family);classes.forEach(function(c){button(row,c,s.enabled.has(c),function(){if(s.enabled.has(c))s.enabled.delete(c);else {s.enabled.add(c);s.panelOpen=s.panelOpen||{};s.panelOpen[c]=true;}change(root,s);});});});
    if(!compact){var groups=section(body,'Conditions');s.groups.forEach(function(g){button(groups,g,!s.off.has(g),function(){s.off.has(g)?s.off.delete(g):s.off.add(g);change(root,s);});});
    } var panel=section(body,compact?'Colors & settings per panel':'Per panel');s.features.filter(function(c){return s.enabled.has(c);}).forEach(function(c){
      var details=document.createElement('details'),sum=document.createElement('summary');sum.textContent=c;details.appendChild(sum);details.open=!!(s.panelOpen&&s.panelOpen[c]);details.ontoggle=function(){s.panelOpen=s.panelOpen||{};s.panelOpen[c]=details.open;};panel.appendChild(details);var row=document.createElement('div');details.appendChild(row);
      s.groups.forEach(function(g){button(row,g,selected(s,c,g),function(){var off=s.panelOff[c]||(s.panelOff[c]=new Set());if(off.has(g)){off.delete(g);if(window.TeamCanvas&&TeamCanvas.clearGroupComparisonPanelVisibility)TeamCanvas.clearGroupComparisonPanelVisibility(s.id+'-comparisonPlot',c,g);}else off.add(g);change(root,s);});
        var label=document.createElement('label');label.textContent=g+' ';var color=document.createElement('input');color.type='color';color.value=colorFor(s,g);color.title='Colour of '+g+' in every panel and in the legend';color.onchange=function(){clearEditorColors(s);setSharedColor(s,g,'colors',color.value);change(root,s);};label.appendChild(color);details.appendChild(label);});
      var style=s.styles[c]||(s.styles[c]={colors:{},lines:{},points:true,box:true});
      button(details,'Points',style.points,function(){style.points=!style.points;change(root,s);});button(details,'Inner box',style.box,function(){style.box=!style.box;change(root,s);});button(details,'Reset colors',false,function(){clearEditorColors(s);clearSharedColors(s);change(root,s);});
    });
    // .gc-download marks the downloads for the inspector's Export tab (canvas_inspector_export.js mirrors them; the chips stay here).
    if(!compact){var exports=section(box,'Download plot · as shown (SVG/PDF are vector)'), status=document.createElement('span');exports.classList.add('gc-exports');exports.appendChild(status);var dl=function(b,label){b.classList.add('gc-download');b.dataset.exportLabel=label;};dl(button(exports,'Download data CSV',false,function(){csv(s);}),'Download data CSV');['png','jpg','svg','pdf'].forEach(function(fmt){dl(button(exports,fmt.toUpperCase(),false,function(){download(root.querySelector('.gc-plot'),fmt,status);}),'Download '+fmt.toUpperCase());});}
  }
  // Keep a restored legend anchor intact while reserving enough drawable
  // margin for its text. This adjusts effective layout only, never saved edits.
  // Under the horizontal top legend bar, only the previous automatic right-side
  // anchor, exactly {x 1.02, xanchor left, y 1, yanchor top} (carried by figures
  // saved before the top bar), is reset to the top-left anchor, in one relayout. draw() always anchors
  // the bar at x 0, so any other position comes from the user's saved editor
  // state and is kept; only the margins are fitted to it.
  function staleDefaultLegend(gd){var l=(gd.layout&&gd.layout.legend)||{};return l.x===1.02&&l.xanchor==='left'&&l.y===1&&l.yanchor==='top';}
  function fitLegend(gd,s) {
    if(s.legendFitScheduled)return;s.legendFitScheduled=true;
    requestAnimationFrame(function(){s.legendFitScheduled=false;if(!gd.isConnected||!gd._fullLayout||!window.Plotly)return;
      var bar=gd._fullLayout.legend;if(bar&&bar.orientation==='h'&&staleDefaultLegend(gd)){Plotly.relayout(gd,{'legend.x':0,'legend.xanchor':'left','legend.y':1,'legend.yanchor':'bottom'});return;}
      var figure=gd.getBoundingClientRect(), labels=Array.from(gd.querySelectorAll('.legendtext'));if(!labels.length)return;
      var boxes=labels.map(function(el){return el.getBoundingClientRect();}),padding=Math.max(16,Math.ceil(Math.max.apply(null,labels.map(function(el){return parseFloat(getComputedStyle(el).fontSize)||12;}))*2.5)),left=Math.max(0,figure.left-Math.min.apply(null,boxes.map(function(b){return b.left;}))),right=Math.max(0,Math.max.apply(null,boxes.map(function(b){return b.right;}))+padding-figure.right);
      if(left<=1&&right<=1)return;var full=gd._fullLayout, margin=full.margin||{}, x=Number(full.legend&&full.legend.x);if(!Number.isFinite(x))x=1;
      var l=Number(margin.l)||0,r=Number(margin.r)||0,maxTotal=Math.max(0,gd.clientWidth-140),nextL=l,nextR=r;
      // A horizontal bar the user placed past the plot (x>1) rewraps as the plot narrows, so the measured
      // overflow stays small and the margin would creep up a few pixels per relayout. Reserve room for its
      // widest item in one step; the bar wraps into it and any remainder is fitted below.
      if(right>1&&x>1&&bar&&bar.orientation==='h'){var W=gd.clientWidth,row=Array.from(gd.querySelectorAll('g.legend g.traces')).reduce(function(widest,el){return Math.max(widest,el.getBoundingClientRect().width+10);},0)+padding,need=Math.ceil(W-l-(W-row-l)/x),cap=Math.max(r,maxTotal-l);need=Math.min(need,cap);if(need>r+1){Plotly.relayout(gd,{'margin.r':need});return;}}
      // A horizontal bar anchored at x<=0 cannot be fitted by a right margin. Should it still run past the card, the
      // condition tick labels are shown again (s.legendOverflow), so every distribution stays identifiable.
      if(right>1&&x<=0&&bar&&bar.orientation==='h'){if(!s.legendOverflow&&gd.__gcRoot){s.legendOverflow=true;var r0=gd.__gcRoot;setTimeout(function(){change(r0,s);},0);}return;}
      if(left>1&&x<1)nextL+=Math.ceil((left+8)/Math.max(.1,1-x));if(right>1&&x>0)nextR+=Math.ceil((right+8)/Math.max(.1,x));
      var room=Math.max(0,maxTotal-l-r),dl=Math.max(0,nextL-l),dr=Math.max(0,nextR-r),total=dl+dr;if(total>room&&total>0){dl=Math.floor(dl*room/total);dr=Math.floor(dr*room/total);}
      if(dl||dr)Plotly.relayout(gd,{'margin.l':l+dl,'margin.r':r+dr});
    });
  }
  // A replayed editor state may still hold a per-trace colour from before the lock (one panel only). The
  // first panel's colour for that group becomes the shared colour, the per-trace copies are cleared, and
  // the figure is redrawn once, so the legend never shows a colour that a panel contradicts.
  function enforceColorLock(root,gd,s){
    // A replayed palette (for example after a restore in a fresh page, where the editor does not announce it as a
    // palette batch) recolours the legend entries as well as the violins. Those colours are palette colours, not
    // manual edits: they go to s.paletteColors, so a later palette recolours them. Groups with a manual override
    // keep it (their legend entry is derived from the map again by syncLegendToMap).
    var replayed={};(gd.data||[]).forEach(function(t){var m=t.meta||{};if(m.teamRole!=='legend'||!m.teamCondition||sharedColor(s,m.teamCondition,'colors'))return;var now=colorHex(t.marker&&t.marker.color),drawn=colorHex(m.teamDrawFill);if(now&&drawn&&now!==drawn)replayed[m.teamCondition]=now;});
    var paletteChanged=false;if(Object.keys(replayed).length){var next=Object.assign({},s.paletteColors||{},replayed);if(JSON.stringify(next)!==JSON.stringify(s.paletteColors||{})){s.paletteColors=next;paletteChanged=true;}}
    var adopt={},conflict=false;(gd.data||[]).forEach(function(t){var m=t.meta||{};if(t.type!=='violin'||!m.teamPanel||!m.teamCondition)return;var fill=colorHex(t.fillcolor),drawn=colorHex(m.teamDrawFill);if(fill&&drawn&&fill!==drawn&&fill!==replayed[m.teamCondition]){conflict=true;if(!adopt[m.teamCondition])adopt[m.teamCondition]=fill;}});
    if(!conflict&&!paletteChanged){s.lockRepairs=0;return false;}if((s.lockRepairs=(s.lockRepairs||0)+1)>3)return false;
    if(conflict){clearEditorColors(s);Object.keys(adopt).forEach(function(g){setSharedColor(s,g,'colors',adopt[g]);});}setTimeout(function(){change(root,s);},0);return true;
  }
  // The group colour map read by colorFor (manual overrides in s.styles, then the applied palette in s.paletteColors)
  // is the single source of truth. Applying a palette in the plot editor recolours every group without a manual
  // override: the palette colour the editor gave that group's legend entry (grey for healthy* groups when that
  // option is on) becomes its map colour. Manual overrides are kept, in the violins and in the legend alike. The
  // figure is then redrawn from the map, so violins, legend and exports agree.
  function adoptPalette(root,gd,s){
    var map={};(gd.data||[]).forEach(function(t){var m=t.meta||{};if(m.teamRole!=='legend'||!m.teamCondition)return;var c=colorHex(t.marker&&t.marker.color);if(c)map[m.teamCondition]=c;});
    if(!Object.keys(map).length)return false;
    // A new palette: redraw from the map once, so every trace's draw-time colour is the palette colour (a later
    // replay then never mistakes it for a per-panel edit). The same palette replayed: only the legend entries of
    // overridden groups, which the editor recoloured, are derived from the map again (no redraw, so no loop).
    var changed=JSON.stringify(s.paletteColors||null)!==JSON.stringify(map);s.paletteColors=map;
    if(changed){setTimeout(function(){change(root,s);},0);return true;}
    syncLegendToMap(gd,s);return false;
  }
  // After an editor replay the legend entries are derived from the map again: a replayed legend patch (for example
  // from a palette applied before a later colour edit) never contradicts the panels.
  function syncLegendToMap(gd,s){
    if(!window.Plotly)return;var idx=[],colors=[],lines=[];
    (gd.data||[]).forEach(function(t,i){var m=t.meta||{};if(m.teamRole!=='legend'||!m.teamCondition)return;var want=colorFor(s,m.teamCondition);if(colorHex(t.marker&&t.marker.color)!==colorHex(want)){idx.push(i);colors.push(want);lines.push(lineFor(s,m.teamCondition));}});
    if(idx.length)Plotly.restyle(gd,{'marker.color':colors,'marker.line.color':lines},idx);
  }
  function draw(root,s) {
    if(!window.Plotly || !root.isConnected) return;
    var status=root.querySelector('.gc-status');if(!status){status=document.createElement('div');status.className='gc-status';status.setAttribute('role','status');root.prepend(status);}status.replaceChildren();
    if(s.waiting||s.pending){var message=document.createElement('span');message.textContent=s.pending?'Updating analysis…':s.baseline.length===1?'Suggested baseline: '+s.baseline[0]+'. Confirm this reference, or choose another in Statistics.':'Choose exactly one baseline in Statistics, then confirm it.';status.appendChild(message);if(s.waiting&&!s.pending&&s.confirmationToken){var confirm=button(status,'Confirm baseline',false,function(){var token=s.confirmationToken;s.pending=true;draw(root,s);setInput(s.id,'gc_baseline_confirmation',token);});}}
    controls(root,s);if(s.inspector&&s.inspector.isConnected)controls(root,s,s.inspector,true);
    var plot=root.querySelector('.gc-plot');plot.style.display=s.waiting||s.pending?'none':'';if(s.waiting||s.pending){if(plot.data&&window.Plotly.purge)Plotly.purge(plot);plot.__gcBound=false;root.querySelectorAll('.gc-controls button').forEach(function(b){if(/^(PNG|JPG|SVG|PDF|Download data CSV|Show full statistical report)$/.test(b.textContent))b.disabled=true;});return;}
    var active=s.features.filter(function(c){return s.enabled.has(c);}), nrow=Math.max(1,Math.ceil(active.length/2)), data=[],legendRowsList=s.groups.reduce(function(rows,g){var n=Array.from(String(g)).length,w=Math.min(18,n)*7.2+50,lines=Math.max(1,Math.ceil(n/18)),last=rows[rows.length-1],avail=Math.max(240,(plot.clientWidth||720)-90);if(!last||(last.w+w>avail&&last.w>0)){rows.push({w:w,lines:lines});}else{last.w+=w;last.lines=Math.max(last.lines,lines);}return rows;},[]),legendHeight=Math.max(26,legendRowsList.reduce(function(h,r){return h+26+(r.lines-1)*15;},0)+(legendRowsList.length>1?10:0)),layout={height:(active.length>1?Math.max(420,nrow*420):380)+legendHeight-26,margin:{l:70,r:20,t:34+legendHeight,b:55},showlegend:s.legendHidden!==true,legend:{orientation:'h',groupclick:'togglegroup',x:0,xanchor:'left',y:1,yanchor:'bottom',bgcolor:'#F6F7F9',bordercolor:'#D8DCE2',borderwidth:1},annotations:[],shapes:[],meta:{teamConditions:s.groups,teamGroupComparison:true}};
    // The shared legend is the colour key only while it is shown and every displayed group has its own colour. When
    // two displayed groups share one (a palette that wraps after six groups, or several healthy* groups in grey), or
    // the legend is hidden (editor "Show legend" off, s.legendHidden), the figure keeps production's condition tick
    // labels and axis title so each distribution stays identifiable.
    var shownGroups=s.groups.filter(function(g){return active.some(function(c){return selected(s,c,g);});}),shownColors=shownGroups.map(function(g){return colorHex(colorFor(s,g))||String(colorFor(s,g)).toLowerCase();}),repeatedColors=new Set(shownColors).size<shownColors.length||s.legendHidden===true||s.legendOverflow===true;
    active.forEach(function(c,i){
      var axis=i?String(i+1):'', x='x'+axis,y='y'+axis, column=i%2,row=Math.floor(i/2),visible=s.groups.filter(function(g){return selected(s,c,g);});
      layout['xaxis'+axis]=repeatedColors?{domain:active.length===1?[0,.98]:[column*.58,column*.58+.42],anchor:y,type:'category',categoryorder:'array',categoryarray:visible,tickangle:active.length>1?-45:0,automargin:true,title:{text:column===0?'Condition':''},showline:true,mirror:true,linecolor:'#000',ticks:'outside'}
        :{domain:active.length===1?[0,.98]:[column*.58,column*.58+.42],anchor:y,type:'category',categoryorder:'array',categoryarray:visible,showticklabels:false,automargin:true,title:{text:''},showline:true,mirror:true,linecolor:'#000',ticks:''};
      layout['yaxis'+axis]={domain:[1-(row+1)/nrow+.06/nrow,1-row/nrow-.10/nrow],anchor:x,title:{text:column===0?(({log2fc:'Log2 fold change',fc:'Fold change',delta:'Proportion difference',log2:'Log2 abundance',linear:'Abundance'})[s.settings.scale]||'Value'):''},automargin:true,showline:true,mirror:true,linecolor:'#000',ticks:'outside',gridcolor:'#ddd',griddash:'dot',zeroline:false};
      layout.annotations.push({name:'team-panel-title:'+c,xref:'paper',yref:'paper',x:active.length===1?.49:column*.58+.21,y:1-row/nrow-.02/nrow,text:c,showarrow:false});
      var vals=s.rows.filter(function(r){return r.Feature===c && Number.isFinite(Number(r.Plot_Value)) && r.Plot_Value!==null;}).map(function(r){return Number(r.Plot_Value);});
      var lo=vals.length?Math.min.apply(null,vals):0, hi=vals.length?Math.max.apply(null,vals):1, span=Math.max(hi-lo,Math.abs(hi)*.05,.01), level=0;
      s.groups.forEach(function(g){var rr=s.rows.filter(function(r){return r.Feature===c && r.GroupingVal===g && r.Plot_Value!==null && Number.isFinite(Number(r.Plot_Value));}),fill=colorFor(s,g),style=s.styles[c]||{colors:{},lines:{},points:true,box:true};
        data.push({type:'violin',name:g+' · '+c,legendgroup:g,showlegend:false,visible:selected(s,c,g)?true:false,x:rr.map(function(){return g;}),y:rr.map(function(r){return Number(r.Plot_Value);}),xaxis:x,yaxis:y,points:style.points?'all':false,jitter:.3,pointpos:0,marker:{color:'#000000',size:5,opacity:1},fillcolor:fill,line:{color:lineFor(s,g),width:1.2},box:{visible:style.box,width:.22,fillcolor:darker(fill,.15),line:{color:darker(fill,.6)}},meanline:{visible:false},spanmode:'hard',hovertemplate:'%{y}<extra>'+g+'</extra>',meta:{teamSourceKey:'group-comparison:'+JSON.stringify([c,g,'violin']),teamPanel:c,teamCondition:g,teamPanelColorOverride:!!(sharedColor(s,g,'colors')||sharedColor(s,g,'lines')),teamDrawFill:fill}});
      });
      if(s.baseline.length===1)visible.forEach(function(g){var r=s.rows.find(function(z){return z.Feature===c && z.GroupingVal===g && !z.Is_Baseline && z.P_Value!==null && Number.isFinite(Number(z.P_Value));});if(!r)return;var baseRow=s.rows.find(function(z){return z.Feature===c && z.Is_Baseline && visible.indexOf(z.GroupingVal)>=0 && (!r.Facet_Grp || z.Facet_Grp===r.Facet_Grp);});if(!baseRow)return;var base=baseRow.GroupingVal,b=visible.indexOf(base),k=visible.indexOf(g),top=hi+span*(.12*(++level));[[b,top-span*.035,b,top],[b,top,k,top],[k,top,k,top-span*.035]].forEach(function(v){layout.shapes.push({type:'line',xref:x,yref:y,x0:v[0],y0:v[1],x1:v[2],y1:v[3],line:{color:'#111',width:1}});});layout.annotations.push({xref:x,yref:y,x:(b+k)/2,y:top+span*.025,text:settingsLabel(s,r),showarrow:false});});
      layout['yaxis'+axis].range=[lo-span*.1,hi+span*(.18+level*.12)];
    });
    s.groups.forEach(function(g){var on=active.some(function(c){return selected(s,c,g);}),fill=colorFor(s,g);data.push({type:'scatter',mode:'markers',x:[null],y:[null],name:barLabel(g),legendgroup:g,showlegend:on,visible:true,hoverinfo:'skip',marker:{symbol:'circle',size:12,color:fill,line:{color:lineFor(s,g),width:1.5}},meta:{teamSourceKey:'group-comparison:'+JSON.stringify([g,'legend']),teamCondition:g,teamRole:'legend',teamDrawFill:fill}});});
    var gd=root.querySelector('.gc-plot');gd.__gcRoot=root;gd.style.height=layout.height+'px';var signature=JSON.stringify(data.map(function(t){return t.meta&&t.meta.teamSourceKey;})), structureChanged=gd.__gcSignature && gd.__gcSignature!==signature; gd.__gcSignature=signature; Plotly.react(gd,data,layout,{responsive:true,displaylogo:false}).then(function(){if(structureChanged && window.TeamPlotEditor && TeamPlotEditor.resetSource)TeamPlotEditor.resetSource(gd);if(!gd.__gcBound){gd.__gcBound=true;gd.on('plotly_afterplot',function(){var h=Number(gd.layout&&gd.layout.height);if(Number.isFinite(h)&&h>0&&Math.abs(gd.clientHeight-h)>1)gd.style.height=Math.round(h)+'px';fitLegend(gd,s);});gd.addEventListener('team-plot-editor-palette',function(e){s.paletteBatch=e.detail&&e.detail.batchId;});gd.addEventListener('team-plot-editor-applied',function(e){if(s.paletteBatch&&e.detail&&e.detail.batchId===s.paletteBatch){s.paletteBatch=null;adoptPalette(root,gd,s);}});gd.on('plotly_relayout',function(ev){if(!ev||!Object.prototype.hasOwnProperty.call(ev,'showlegend'))return;var hidden=ev.showlegend===false;if(hidden!==(s.legendHidden===true)){s.legendHidden=hidden;setTimeout(function(){change(root,s);},0);}});gd.on('plotly_legendclick',function(e){var g=e.data[e.curveNumber].legendgroup;s.off.add(g);change(root,s);return false;});gd.on('plotly_restyle',function(event){if(s.replaying||s.paletteBatch)return;var update=event[0]||{}, indexes=event[1]||[], changed=false;indexes.forEach(function(i){var t=gd.data[i],m=t&&t.meta;if(!m||!m.teamPanel||!m.teamCondition)return;var c=m.teamPanel,g=m.teamCondition;if(update.visible==='legendonly'||update.visible===false||Array.isArray(update.visible)&&(update.visible[0]==='legendonly'||update.visible[0]===false)){(s.panelOff[c]||(s.panelOff[c]=new Set())).add(g);changed=true;}var st=s.styles[c]||(s.styles[c]={colors:{},lines:{},points:true,box:true});if(!st.lines)st.lines={};if(Object.prototype.hasOwnProperty.call(update,'fillcolor')){var fill=colorHex(t.fillcolor);if(fill){setSharedColor(s,g,'colors',fill);changed=true;}}if(Object.prototype.hasOwnProperty.call(update,'line.color')){var line=colorHex(t.line&&t.line.color);if(line){setSharedColor(s,g,'lines',line);changed=true;}}if(Object.prototype.hasOwnProperty.call(update,'points')){st.points=!!t.points;changed=true;}if(Object.prototype.hasOwnProperty.call(update,'box.visible')){st.box=!!t.box.visible;changed=true;}});if(changed)setTimeout(function(){change(root,s);},0);});}if(root.closest('.tc-node') && window.TeamCanvas && TeamCanvas.reapplyGroupComparisonEditor){s.replaying=true;Promise.resolve(TeamCanvas.reapplyGroupComparisonEditor(s.id+'-comparisonPlot')).catch(function(error){console.error('Group comparison editor replay failed',error);}).finally(function(){s.replaying=false;if(!enforceColorLock(root,gd,s)){syncLegendToMap(gd,s);fitLegend(gd,s);}});}else fitLegend(gd,s);});
  }
  function settingsLabel(s,r){return s.settings.significance==='pvalue'?'p = '+Number(r.P_Value).toPrecision(3):r.Significance||'ns';}
  function receive(m){var s=states.get(m.id), signature=JSON.stringify([m.rows,m.groups,m.baseline,m.settings,m.conditionColors,m.requiresConfirmation,m.inferenceAllowed]);if(s&&s.scienceSignature&&s.scienceSignature!==signature&&window.TeamCanvas&&TeamCanvas.invalidateGroupComparison)TeamCanvas.invalidateGroupComparison(m.id+'-comparisonPlot');if(s)s.scienceSignature=signature;pending.set(m.id,m);mount(m.id);}
  function mount(id){var m=pending.get(id),root=document.querySelector('[data-gc-instance="'+id+'"]');if(!m||!root)return;if(!window.Plotly){setTimeout(function(){mount(id);},200);return;}var data=rows(m.rows),features=Array.from(new Set(data.map(function(r){return r.Feature;}).filter(Boolean))),groups=arr(m.groups).filter(Boolean).map(String);if(!groups.length)groups=Array.from(new Set(data.map(function(r){return r.GroupingVal;}).filter(Boolean)));
    var s=states.get(id);if(!s){s={id:id,enabled:new Set(features.slice(0,1)),initialized:!!features.length,off:new Set(),panelOff:{},styles:{}};states.set(id,s);}if(s.root!==root){s.root=root;s.restored=false;s.inspector=null;}if(!s.initialized && features.length){s.enabled.add(features[0]);s.initialized=true;}s.scienceSignature=JSON.stringify([m.rows,m.groups,m.baseline,m.settings,m.conditionColors,m.requiresConfirmation,m.inferenceAllowed]);s.waiting=!!m.requiresConfirmation;s.pending=false;s.inferenceAllowed=typeof m.inferenceAllowed==='boolean'?m.inferenceAllowed:null;s.inferenceReason=typeof m.inferenceReason==='string'?m.inferenceReason:null;s.confirmationToken=m.confirmationToken||null;s.provenanceSignature=m.scienceSignature||null;s.rows=data;s.families=m.families||{};s.conditionColors=m.conditionColors||{};s.features=features;s.groups=groups;s.baseline=arr(m.baseline);s.settings=m.settings||{};pending.delete(id);draw(root,s);restoreWhenMounted(root,s);}
  function restoreWhenMounted(root,s){ if(s.restored)return; if(window.TeamCanvas&&TeamCanvas.getGroupComparison&&root.closest('.tc-node')){var settings=root.closest('.tc-node').querySelector('.tc-settings');if(settings){s.inspector=document.createElement('div');s.inspector.className='gc-inspector';settings.appendChild(s.inspector);controls(root,s,s.inspector,true);}var saved=TeamCanvas.getGroupComparison(s.id+'-comparisonPlot');if(saved){s.enabled=new Set(saved.features);s.off=new Set(saved.hiddenConditions);s.panelOff={};Object.keys(saved.panelOff||{}).forEach(function(k){s.panelOff[k]=new Set(saved.panelOff[k]);});s.styles=saved.panelStyles||{};draw(root,s);}s.restored=true;return;} if(root.isConnected)setTimeout(function(){restoreWhenMounted(root,s);},300); }
  window.TeamGroupComparison=window.TeamGroupComparison||{};window.TeamGroupComparison.withExportGeometry=withExportGeometry;
  window.TeamGroupComparison.forPlot=function(gd){var root=gd&&gd.closest('.gc-root'),s=root&&states.get(root.dataset.gcInstance);if(!root||!s||s.waiting)return null;
    function info(index){var t=gd.data&&gd.data[index];if(!t)return null;var meta=t.meta||{};return {feature:meta.teamPanel||null,condition:meta.teamCondition||t.legendgroup||null};}
    function clear(c,g){if(window.TeamCanvas&&TeamCanvas.clearGroupComparisonPanelVisibility)TeamCanvas.clearGroupComparisonPanelVisibility(s.id+'-comparisonPlot',c,g);}
    return {isSelected:function(index){var m=info(index);if(!m||!m.condition)return false;return m.feature?selected(s,m.feature,m.condition):s.features.some(function(c){return selected(s,c,m.condition);});},
      setSeries:function(index,visible){var m=info(index);if(!m||!m.condition)return Promise.resolve(false);if(m.feature){var off=s.panelOff[m.feature]||(s.panelOff[m.feature]=new Set());if(visible){s.off.delete(m.condition);off.delete(m.condition);clear(m.feature,m.condition);}else off.add(m.condition);}else{if(visible){s.off.delete(m.condition);s.features.forEach(function(c){if(s.panelOff[c])s.panelOff[c].delete(m.condition);clear(c,m.condition);});}else s.off.add(m.condition);}change(root,s);return Promise.resolve(true);},
      showAll:function(){s.off.clear();s.features.forEach(function(c){s.groups.forEach(function(g){clear(c,g);});});s.panelOff={};change(root,s);return Promise.resolve(true);}};
  };
  // The comparison is held back until its baseline is confirmed on the card: that is
  // a decision the card asks for, not a redraw in progress.
  window.TeamGroupComparison.awaitingConfirmation=function(outputId){var suffix='-comparisonPlot';if(typeof outputId!=='string'||!outputId.endsWith(suffix))return false;var s=states.get(outputId.slice(0,-suffix.length));return !!(s&&s.waiting&&!s.pending&&s.root&&s.root.isConnected);};
  window.TeamGroupComparison.provenance=function(outputId){var suffix='-comparisonPlot';if(typeof outputId!=='string'||!outputId.endsWith(suffix))return null;var s=states.get(outputId.slice(0,-suffix.length));if(!s||s.waiting||s.pending||!s.rows.length||!/^[a-f0-9]{64}$/i.test(s.provenanceSignature||''))return null;var v=s.settings||{}, p={gcTest:v.test||'',gcBaseline:s.baseline.join(', '),gcScale:v.scale||'',gcReference:v.comparison||'',gcAdjustment:'none',gcSignature:s.provenanceSignature};return Object.values(p).every(function(x){return typeof x==='string'&&x.length>0&&x.length<=1000;})?p:null;};
  function start(){if(window.Shiny)Shiny.addCustomMessageHandler('team-group-comparison-data',receive);
    if(window.jQuery)jQuery(document).on('shiny:inputchanged',function(e){
      if(typeof e.name!=='string')return;states.forEach(function(s){var prefix=s.id+'-';if(e.name.indexOf(prefix)!==0)return;var key=e.name.slice(prefix.length).replace(/:[A-Za-z][A-Za-z0-9_.]*$/,''), map={selectedBaseline:'baseline',groupingMetadata:'grouping',comparisonStrategy:'comparison',localStatMethod:'method',scaleMode:'scale',sigDisplayType:'significance',featureLevel:'feature_level',classLabelFormat:'classLabelFormat',additiveFiltering:'additiveFiltering',adv_sat:'adv_sat',adv_len:'adv_len',gran_activate:'gran_activate',gran_use1:'gran_use1',gran_use2:'gran_use2',gran_nC1:'gran_nC1',gran_nC2:'gran_nC2',gran_DB1:'gran_DB1',gran_DB2:'gran_DB2',gran_order:'gran_order'};
        if(!map[key])return;if(JSON.stringify(arr(e.value))===JSON.stringify(arr(s.settings&&s.settings[map[key]])))return;
        var root=document.querySelector('[data-gc-instance="'+s.id+'"]');if(!root)return;s.pending=true;if(['selectedBaseline','groupingMetadata','comparisonStrategy'].includes(key)){s.waiting=true;s.confirmationToken=null;}if(window.TeamCanvas&&TeamCanvas.invalidateGroupComparison)TeamCanvas.invalidateGroupComparison(s.id+'-comparisonPlot');draw(root,s);
      });
    });new MutationObserver(function(){pending.forEach(function(_,id){mount(id);});}).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
