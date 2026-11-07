(function(){
 'use strict';
 // Rendering runs on every DOM change; write only real changes to avoid restyling loops.
 function attr(el,k,v){if(el&&el.getAttribute(k)!==v)el.setAttribute(k,v);}
 function hide(el,h){if(el&&el.hidden!==h)el.hidden=h;}
 var cards=new Map(),notes=new Map(),seq=0,queued=false,registered=false;
 function set(el,v){if(el.textContent!==v)el.textContent=v;}
 function validNote(n){
  if(!n||typeof n!=='object'||typeof n.paragraph!=='string'||!n.paragraph.length||n.paragraph.length>1800||/[<>]/.test(n.paragraph)||typeof n.context_label!=='string'||!n.context_label.length||n.context_label.length>1000||typeof n.searched_at!=='string'||!n.searched_at.length||n.searched_at.length>80||typeof n.fingerprint!=='string'||!/^[a-f0-9]{64}$/i.test(n.fingerprint)||typeof n.stale!=='boolean'||!Array.isArray(n.sources)||n.sources.length>3)return null;
  if(n.sources.some(function(s){return !s||typeof s.pmid!=='string'||!/^[1-9][0-9]{0,9}$/.test(s.pmid)||typeof s.title!=='string'||!s.title.length||s.title.length>500||/[<>]/.test(s.title)||typeof s.year!=='string'||!/^([0-9]{4})?$/.test(s.year)||s.url!=='https://pubmed.ncbi.nlm.nih.gov/'+s.pmid+'/';}))return null;
  return JSON.parse(JSON.stringify(n));
 }
 function getNote(id){if(window.TeamCanvas&&typeof TeamCanvas.getInsight==='function'){var n=TeamCanvas.getInsight(id);if(n!==undefined)return validNote(n);}return notes.get(id)||null;}
 function setNote(id,n){var v=n===null?null:validNote(n);if(n!==null&&!v)return false;try{if(window.TeamCanvas&&typeof TeamCanvas.setInsight==='function'&&TeamCanvas.setInsight(id,v)){notes.delete(id);return true;}if(v===null)notes.delete(id);else notes.set(id,v);return true;}catch(_){return false;}}
 var nodeIndex=null;/* scan() indexes the canvas nodes once instead of querying the document per plot */
 function frozen(id){var n=nodeIndex?nodeIndex.get(id):document.querySelector('.tc-node[data-plot-id="'+CSS.escape(id)+'"]');return !!(n&&(n.classList.contains('tc-finished')||n.querySelector('.tc-snapshot')));}
 function sources(c,items){var ul=c.querySelector('ul'),signature=JSON.stringify(items);if(ul.dataset.signature!==signature){ul.dataset.signature=signature;ul.replaceChildren();items.forEach(function(s){var li=document.createElement('li'),a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='[PMID:'+s.pmid+'] '+s.title;li.appendChild(a);ul.appendChild(li);});}c.querySelector('details').hidden=!items.length;}
 function status(c,text,error){var s=c.querySelector('.team-insight-status');set(s,text||'');hide(s,!text);attr(s,'role',error?'alert':'status');}
 function unsupportedInstance(id){return id.indexOf('tcinstance_')===0&&!(window.TeamCanvas&&TeamCanvas.insightSupported&&TeamCanvas.insightSupported(id));}
 function render(c){
  var id=c.dataset.plotId,n=getNote(id),loading=c.classList.contains('is-loading'),b=c.querySelector('.team-insight-action');
  set(b,n?'Update insight':'✧ Scientific insight');attr(b,'aria-label',n?'Update insight':'Scientific insight');b.disabled=loading||(frozen(id)&&!n)||unsupportedInstance(id);
  if(unsupportedInstance(id)){b.title='Literature research is not yet connected to independent plot settings.';status(c,'Literature research is not yet connected to this independent plot’s data settings.');}
  hide(c.querySelector('.team-insight-remove'),!n);hide(c.querySelector('.team-insight-result'),!n);
  if(n){set(c.querySelector('.team-insight-body'),n.paragraph);set(c.querySelector('.team-insight-meta'),n.context_label+' · '+n.searched_at);sources(c,n.sources);var caution=c.querySelector('.team-insight-caution');set(caution,n.stale?'The figure may have changed. This is the previous note; update it to check the current context.':c.dataset.restored==='1'?'Saved literature note. Update it to check the current context.':'');caution.hidden=!caution.textContent;}
  else if(!loading&&!c.querySelector('.team-insight-status').textContent&&frozen(id))status(c,'Edit this figure to research its current data.');
 }
 function invalidate(id){var c=cards.get(id);if(!c)return;c.completedResponse=null;c.dataset.requestId='';c.classList.remove('is-loading');var n=getNote(id);if(n&&!n.stale){n.stale=true;setNote(id,n);}status(c,n?'':'The figure changed. Research the current figure again.');render(c);}
 function response(p){if(!p)return;var c=cards.get(p.plot_id);if(!c||!p.request_id)return;
  if(p.status==='stale'&&c.completedResponse&&p.request_id===c.completedResponse.requestId){var saved=getNote(p.plot_id);if(saved&&saved.fingerprint===c.completedResponse.fingerprint&&JSON.stringify(saved)===c.completedResponse.signature)invalidate(p.plot_id);return;}
  if(p.request_id!==c.dataset.requestId)return;
  if(p.status==='loading'){status(c,'Searching PubMed and preparing a short note…');return;}
  c.classList.remove('is-loading');c.dataset.requestId='';
  if(p.status==='ready'){var n=validNote({paragraph:p.paragraph,context_label:p.context_label,searched_at:p.searched_at,fingerprint:p.fingerprint,stale:false,sources:(p.sources||[]).map(function(s){return {pmid:s.pmid,title:s.title,url:s.url,year:typeof s.year==='string'?s.year:''};})});
   if(n&&setNote(p.plot_id,n)){c.completedResponse={requestId:p.request_id,fingerprint:n.fingerprint,signature:JSON.stringify(n)};c.dataset.restored='0';status(c,'Insight updated.');}else status(c,'The returned insight could not be saved. The previous note is unchanged.',true);
  }else{var prior=getNote(p.plot_id);status(c,(p.message||'The literature service is unavailable. Try again.')+(prior?' Showing the saved note from '+prior.searched_at+'.':''),true);}
  render(c);
 }
 function make(id){
  var c=document.createElement('section');c.className='team-scientific-insight';c.dataset.plotId=id;
  c.innerHTML='<div class="team-insight-actions"><button type="button" class="team-insight-action">✧ Scientific insight</button><button type="button" class="team-insight-remove" hidden>Remove insight</button><button type="button" class="team-insight-undo" hidden>Undo removal</button></div><div class="team-insight-status" role="status" hidden></div><div class="team-insight-result" hidden><p class="team-insight-caution" role="status" hidden></p><p class="team-insight-body"></p><small class="team-insight-meta"></small><details class="team-insight-sources" hidden><summary>Sources</summary><ul></ul></details><small>AI-assisted summary of selected PubMed abstracts, not a systematic review or evidence of a mechanism in your data. Saved with the plot in your checkpoint; not included in PDF/SVG figure exports.</small></div>';
  var b=c.querySelector('.team-insight-action'),undo=c.querySelector('.team-insight-undo');
  b.addEventListener('click',async function(){var old=getNote(id);if(unsupportedInstance(id)||frozen(id)&&!old)return;if(!window.Shiny||!Shiny.setInputValue){status(c,'Reconnect to the app and try again.',true);return;}
   var rid=(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+(++seq));c.completedResponse=null;c.dataset.requestId=rid;c.classList.add('is-loading');undo.hidden=true;c.removedNote=null;status(c,'Searching PubMed and preparing a short note…');render(c);
   try{if(frozen(id)&&window.TeamCanvas&&typeof TeamCanvas.checkpoint==='function')await TeamCanvas.checkpoint();if(c.dataset.requestId!==rid)return;Shiny.setInputValue('team_scientific_insight',{plot_id:id,request_id:rid,refresh:!!old,fingerprint:old&&old.fingerprint},{priority:'event'});}
   catch(_){if(c.dataset.requestId!==rid)return;c.dataset.requestId='';c.classList.remove('is-loading');status(c,'Save could not be confirmed. The previous insight is unchanged; reconnect and try again.',true);render(c);}
  });
  c.querySelector('.team-insight-remove').addEventListener('click',function(){var old=getNote(id);c.completedResponse=null;c.dataset.requestId='';c.classList.remove('is-loading');if(!setNote(id,null)){status(c,'The insight could not be removed. Try again.',true);return;}c.removedNote=old;undo.hidden=!old;status(c,'Insight removed.');render(c);});
  undo.addEventListener('click',function(){if(c.removedNote&&setNote(id,c.removedNote)){c.removedNote=null;undo.hidden=true;status(c,'Insight restored.');render(c);}});
  cards.set(id,c);return c;
 }
 function mount(plot,id,node){var c=cards.get(id)||make(id),isFrozen=frozen(id);if(c.dataset.wasFrozen==='1'&&!isFrozen)invalidate(id);attr(c,'data-was-frozen',isFrozen?'1':'0');if(node){var host=node.querySelector('.tc-snapshot')||node.querySelector('.tc-content')||node;/* The inspector's Data tab may hold it while the card is selected. */if(c.parentElement!==host&&!c.closest('#tc-selection-inspector'))host.appendChild(c);}else if(plot&&plot.nextElementSibling!==c)plot.after(c);render(c);}
 function scan(){queued=false;nodeIndex=new Map();document.querySelectorAll('.tc-node[data-plot-id]').forEach(function(n){if(!nodeIndex.has(n.dataset.plotId))nodeIndex.set(n.dataset.plotId,n);});try{scanAll();}finally{nodeIndex=null;}}
 function scanAll(){document.querySelectorAll('.shiny-plot-output[id],.plotly.html-widget-output[id]').forEach(function(p){if(!p.closest('.publication-canvas-frame,.tc-instance-host'))mount(p,p.id,p.closest('.tc-node'));});document.querySelectorAll('.tc-node[data-plot-id]').forEach(function(n){mount(null,n.dataset.plotId,n);});if(!registered&&window.Shiny&&Shiny.addCustomMessageHandler){registered=true;Shiny.addCustomMessageHandler('team_scientific_insight',response);}}
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(scan);}
 window.TeamScientificInsight={invalidate:invalidate,scan:scan};
 function start(){scan();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});window.addEventListener('team-canvas-restored',function(){notes.clear();cards.forEach(function(c){c.completedResponse=null;c.dataset.requestId='';c.dataset.restored='1';c.removedNote=null;c.querySelector('.team-insight-undo').hidden=true;c.classList.remove('is-loading');status(c,'');render(c);});schedule();});if(window.jQuery)jQuery(document).on('shiny:value.teamInsight',function(e){invalidate(e.name||e.target.id);schedule();}).on('shiny:connected.teamInsight',schedule);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
