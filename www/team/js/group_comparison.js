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
  function legendLabel(value) { var chars=Array.from(String(value)), lines=[];while(chars.length)lines.push(chars.splice(0,18).join('').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));return lines.join('<br>'); }
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
  function colorFor(s,g,c) {
    var override=s.styles[c]&&s.styles[c].colors[g];if(override)return override;if(s.conditionColors&&colorHex(s.conditionColors[g]))return colorHex(s.conditionColors[g]);
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
      var w=Math.max(100,gd.clientWidth),h=Math.max(100,gd.clientHeight),url=await withExportGeometry(gd,function(){return Plotly.toImage(gd,{format:'svg',width:w,height:h});}), blob;
      if(format==='pdf') {
        if(window.TeamPdf)TeamPdf.ensureMinusFix();
        var text=decodeURIComponent(url.slice(url.indexOf(',')+1));var svg=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
        var pdf=new window.jspdf.jsPDF({orientation:w>=h?'landscape':'portrait',unit:'pt',format:[w,h]});await pdf.svg(svg,{x:0,y:0,width:w,height:h});blob=pdf.output('blob');
      } else if(format==='jpg'||format==='png') blob=await rasterFromSvg(url,w,h,format); else blob=await (await fetch(url)).blob();
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
        var label=document.createElement('label');label.textContent=g+' ';var color=document.createElement('input');color.type='color';color.value=colorFor(s,g,c);color.onchange=function(){if(window.TeamCanvas&&TeamCanvas.clearGroupComparisonPanelColors)TeamCanvas.clearGroupComparisonPanelColors(s.id+'-comparisonPlot',c);var style=s.styles[c]||(s.styles[c]={colors:{},lines:{},points:true,box:true});style.colors[g]=color.value;change(root,s);};label.appendChild(color);details.appendChild(label);});
      var style=s.styles[c]||(s.styles[c]={colors:{},lines:{},points:true,box:true});
      button(details,'Points',style.points,function(){style.points=!style.points;change(root,s);});button(details,'Inner box',style.box,function(){style.box=!style.box;change(root,s);});button(details,'Reset colors',false,function(){if(window.TeamCanvas&&TeamCanvas.clearGroupComparisonPanelColors)TeamCanvas.clearGroupComparisonPanelColors(s.id+'-comparisonPlot',c);style.colors={};style.lines={};change(root,s);});
    });
    if(!compact){var exports=section(box,'Download plot · as shown (SVG/PDF are vector)'), status=document.createElement('span');exports.appendChild(status);button(exports,'Download data CSV',false,function(){csv(s);});['png','jpg','svg','pdf'].forEach(function(fmt){button(exports,fmt.toUpperCase(),false,function(){download(root.querySelector('.gc-plot'),fmt,status);});});}
  }
  // Keep a restored legend anchor intact while reserving enough drawable
  // margin for its text. This adjusts effective layout only, never saved edits.
  function fitLegend(gd,s) {
    if(s.legendFitScheduled)return;s.legendFitScheduled=true;
    requestAnimationFrame(function(){s.legendFitScheduled=false;if(!gd.isConnected||!gd._fullLayout||!window.Plotly)return;
      var figure=gd.getBoundingClientRect(), labels=Array.from(gd.querySelectorAll('.legendtext'));if(!labels.length)return;
      var boxes=labels.map(function(el){return el.getBoundingClientRect();}),padding=Math.max(16,Math.ceil(Math.max.apply(null,labels.map(function(el){return parseFloat(getComputedStyle(el).fontSize)||12;}))*2.5)),left=Math.max(0,figure.left-Math.min.apply(null,boxes.map(function(b){return b.left;}))),right=Math.max(0,Math.max.apply(null,boxes.map(function(b){return b.right;}))+padding-figure.right);
      if(left<=1&&right<=1)return;var full=gd._fullLayout, margin=full.margin||{}, x=Number(full.legend&&full.legend.x);if(!Number.isFinite(x))x=1;
      var l=Number(margin.l)||0,r=Number(margin.r)||0,maxTotal=Math.max(0,gd.clientWidth-140),nextL=l,nextR=r;
      if(left>1&&x<1)nextL+=Math.ceil((left+8)/Math.max(.1,1-x));if(right>1&&x>0)nextR+=Math.ceil((right+8)/Math.max(.1,x));
      var room=Math.max(0,maxTotal-l-r),dl=Math.max(0,nextL-l),dr=Math.max(0,nextR-r),total=dl+dr;if(total>room&&total>0){dl=Math.floor(dl*room/total);dr=Math.floor(dr*room/total);}
      if(dl||dr)Plotly.relayout(gd,{'margin.l':l+dl,'margin.r':r+dr});
    });
  }
  function draw(root,s) {
    if(!window.Plotly || !root.isConnected) return;
    var status=root.querySelector('.gc-status');if(!status){status=document.createElement('div');status.className='gc-status';status.setAttribute('role','status');root.prepend(status);}status.replaceChildren();
    if(s.waiting||s.pending){var message=document.createElement('span');message.textContent=s.pending?'Updating analysis…':s.baseline.length===1?'Suggested baseline: '+s.baseline[0]+'. Confirm this reference, or choose another in Statistics.':'Choose exactly one baseline in Statistics, then confirm it.';status.appendChild(message);if(s.waiting&&!s.pending&&s.confirmationToken){var confirm=button(status,'Confirm baseline',false,function(){var token=s.confirmationToken;s.pending=true;draw(root,s);setInput(s.id,'gc_baseline_confirmation',token);});}}
    controls(root,s);if(s.inspector&&s.inspector.isConnected)controls(root,s,s.inspector,true);
    var plot=root.querySelector('.gc-plot');plot.style.display=s.waiting||s.pending?'none':'';if(s.waiting||s.pending){if(plot.data&&window.Plotly.purge)Plotly.purge(plot);plot.__gcBound=false;root.querySelectorAll('.gc-controls button').forEach(function(b){if(/^(PNG|JPG|SVG|PDF|Download data CSV|Show full statistical report)$/.test(b.textContent))b.disabled=true;});return;}
    var active=s.features.filter(function(c){return s.enabled.has(c);}), nrow=Math.max(1,Math.ceil(active.length/2)), data=[],longest=Math.min(18,Math.max(0,...s.groups.map(function(g){return Array.from(g).length;}))),legendMargin=Math.max(115,Math.ceil(longest*8+55)),layout={height:active.length>1?Math.max(420,nrow*420):380,margin:{l:70,r:legendMargin,t:40,b:active.length>1?140:105},showlegend:true,legend:{groupclick:'togglegroup',x:1.02,xanchor:'left',y:1,yanchor:'top'},annotations:[],shapes:[],meta:{teamConditions:s.groups,teamGroupComparison:true}};
    active.forEach(function(c,i){
      var axis=i?String(i+1):'', x='x'+axis,y='y'+axis, column=i%2,row=Math.floor(i/2),visible=s.groups.filter(function(g){return selected(s,c,g);});
      layout['xaxis'+axis]={domain:active.length===1?[0,.98]:[column*.58,column*.58+.42],anchor:y,type:'category',categoryorder:'array',categoryarray:visible,tickangle:active.length>1?-45:0,automargin:true,title:{text:column===0?'Condition':''},showline:true,mirror:true,linecolor:'#000',ticks:'outside'};
      layout['yaxis'+axis]={domain:[1-(row+1)/nrow+.06/nrow,1-row/nrow-.10/nrow],anchor:x,title:{text:column===0?(({log2fc:'Log2 fold change',fc:'Fold change',delta:'Proportion difference',log2:'Log2 abundance',linear:'Abundance'})[s.settings.scale]||'Value'):''},automargin:true,showline:true,mirror:true,linecolor:'#000',ticks:'outside',gridcolor:'#ddd',griddash:'dot',zeroline:false};
      layout.annotations.push({name:'team-panel-title:'+c,xref:'paper',yref:'paper',x:active.length===1?.49:column*.58+.21,y:1-row/nrow-.02/nrow,text:c,showarrow:false});
      var vals=s.rows.filter(function(r){return r.Feature===c && Number.isFinite(Number(r.Plot_Value)) && r.Plot_Value!==null;}).map(function(r){return Number(r.Plot_Value);});
      var lo=vals.length?Math.min.apply(null,vals):0, hi=vals.length?Math.max.apply(null,vals):1, span=Math.max(hi-lo,Math.abs(hi)*.05,.01), level=0;
      s.groups.forEach(function(g){var rr=s.rows.filter(function(r){return r.Feature===c && r.GroupingVal===g && r.Plot_Value!==null && Number.isFinite(Number(r.Plot_Value));}),fill=colorFor(s,g,c),style=s.styles[c]||{colors:{},lines:{},points:true,box:true};
        data.push({type:'violin',name:g+' · '+c,legendgroup:g,showlegend:false,visible:selected(s,c,g)?true:false,x:rr.map(function(){return g;}),y:rr.map(function(r){return Number(r.Plot_Value);}),xaxis:x,yaxis:y,points:style.points?'all':false,jitter:.3,pointpos:0,marker:{color:'#000000',size:5,opacity:1},fillcolor:fill,line:{color:(style.lines&&style.lines[g])||darker(fill,.45),width:1.2},box:{visible:style.box,width:.22,fillcolor:darker(fill,.15),line:{color:darker(fill,.6)}},meanline:{visible:false},spanmode:'hard',hovertemplate:'%{y}<extra>'+g+'</extra>',meta:{teamSourceKey:'group-comparison:'+JSON.stringify([c,g,'violin']),teamPanel:c,teamCondition:g,teamPanelColorOverride:!!(style.colors[g]||(style.lines&&style.lines[g]))}});
      });
      if(s.baseline.length===1)visible.forEach(function(g){var r=s.rows.find(function(z){return z.Feature===c && z.GroupingVal===g && !z.Is_Baseline && z.P_Value!==null && Number.isFinite(Number(z.P_Value));});if(!r)return;var baseRow=s.rows.find(function(z){return z.Feature===c && z.Is_Baseline && visible.indexOf(z.GroupingVal)>=0 && (!r.Facet_Grp || z.Facet_Grp===r.Facet_Grp);});if(!baseRow)return;var base=baseRow.GroupingVal,b=visible.indexOf(base),k=visible.indexOf(g),top=hi+span*(.12*(++level));[[b,top-span*.035,b,top],[b,top,k,top],[k,top,k,top-span*.035]].forEach(function(v){layout.shapes.push({type:'line',xref:x,yref:y,x0:v[0],y0:v[1],x1:v[2],y1:v[3],line:{color:'#111',width:1}});});layout.annotations.push({xref:x,yref:y,x:(b+k)/2,y:top+span*.025,text:settingsLabel(s,r),showarrow:false});});
      layout['yaxis'+axis].range=[lo-span*.1,hi+span*(.18+level*.12)];
    });
    s.groups.forEach(function(g){var on=active.some(function(c){return selected(s,c,g);}),fill=colorFor(s,g,active[0]);data.push({type:'scatter',mode:'markers',x:[null],y:[null],name:legendLabel(g),legendgroup:g,showlegend:on,visible:true,hoverinfo:'skip',marker:{symbol:'circle',size:12,color:fill,line:{color:darker(fill,.45),width:1.5}},meta:{teamSourceKey:'group-comparison:'+JSON.stringify([g,'legend']),teamCondition:g,teamRole:'legend'}});});
    var gd=root.querySelector('.gc-plot');gd.style.height=layout.height+'px';var signature=JSON.stringify(data.map(function(t){return t.meta&&t.meta.teamSourceKey;})), structureChanged=gd.__gcSignature && gd.__gcSignature!==signature; gd.__gcSignature=signature; Plotly.react(gd,data,layout,{responsive:true,displaylogo:false}).then(function(){if(structureChanged && window.TeamPlotEditor && TeamPlotEditor.resetSource)TeamPlotEditor.resetSource(gd);if(!gd.__gcBound){gd.__gcBound=true;gd.on('plotly_afterplot',function(){var h=Number(gd.layout&&gd.layout.height);if(Number.isFinite(h)&&h>0&&Math.abs(gd.clientHeight-h)>1)gd.style.height=Math.round(h)+'px';fitLegend(gd,s);});gd.addEventListener('team-plot-editor-palette',function(e){s.paletteBatch=e.detail&&e.detail.batchId;});gd.addEventListener('team-plot-editor-applied',function(e){if(s.paletteBatch&&e.detail&&e.detail.batchId===s.paletteBatch)s.paletteBatch=null;});gd.on('plotly_legendclick',function(e){var g=e.data[e.curveNumber].legendgroup;s.off.add(g);change(root,s);return false;});gd.on('plotly_restyle',function(event){if(s.replaying||s.paletteBatch)return;var update=event[0]||{}, indexes=event[1]||[], changed=false;indexes.forEach(function(i){var t=gd.data[i],m=t&&t.meta;if(!m||!m.teamPanel||!m.teamCondition)return;var c=m.teamPanel,g=m.teamCondition;if(update.visible==='legendonly'||update.visible===false||Array.isArray(update.visible)&&(update.visible[0]==='legendonly'||update.visible[0]===false)){(s.panelOff[c]||(s.panelOff[c]=new Set())).add(g);changed=true;}var st=s.styles[c]||(s.styles[c]={colors:{},lines:{},points:true,box:true});if(!st.lines)st.lines={};if(Object.prototype.hasOwnProperty.call(update,'fillcolor')){var fill=colorHex(t.fillcolor);if(fill){st.colors[g]=fill;changed=true;}}if(Object.prototype.hasOwnProperty.call(update,'line.color')){var line=colorHex(t.line&&t.line.color);if(line){st.lines[g]=line;changed=true;}}if(Object.prototype.hasOwnProperty.call(update,'points')){st.points=!!t.points;changed=true;}if(Object.prototype.hasOwnProperty.call(update,'box.visible')){st.box=!!t.box.visible;changed=true;}});if(changed)setTimeout(function(){change(root,s);},0);});}if(root.closest('.tc-node') && window.TeamCanvas && TeamCanvas.reapplyGroupComparisonEditor){s.replaying=true;Promise.resolve(TeamCanvas.reapplyGroupComparisonEditor(s.id+'-comparisonPlot')).catch(function(error){console.error('Group comparison editor replay failed',error);}).finally(function(){s.replaying=false;fitLegend(gd,s);});}else fitLegend(gd,s);});
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
