// Validation rules and messages ported from www/team/js/canvas.js.
// Dynamic checkpoint records stay internal; public entry points accept unknown.
import { sanitizeEditor, sanitizeStatistics } from './validate-support';
const illustrationIds: any = new Set('cohort-donor whole-blood serum-vial pipette microplate extraction-tubes centrifuge cold-storage lc-ms lipid-bilayer neutrophil macrophage workflow-arrow workflow-overview lipid-class-taxonomy study-workflow-scd donor-person cohort-label connector-arrow lipid-class-chip sample-vial-component'.split(' '));
function illustrationEntry(id: any): any { return illustrationIds.has(id); }
function instanceSupported(id: any): any { return /^cell_(lipid|profile|class|comparison)_plot$/.test(id) || /^(results_dashboard|qc_pca_tab|barchart|heatmap_barchart_tab|volcano_tab|lsea_tab|structural_tab|structural_grid_tab|logratio_tab|group_comparison_tab|fla_tab|longitudinal_tab|pathway_tab|cellular_org_tab)-/.test(id); }
  function unsafeSvgReference(value: any): any {
    // Strip only exact, local URL references. Optional-quote negative
    // lookaheads can backtrack and reject safe url('#id') references.
    var withoutLocal: any = value.replace(/url\(\s*(['"]?)#[A-Za-z0-9_.:-]+\1\s*\)/gi, '');
    return /[\\@]|\/\*/.test(value) || /url\s*\(/i.test(withoutLocal) || /javascript:/i.test(value);
  }
  function checkedImage(url: any): any {
    if (typeof url !== 'string' || url.length > 4 * 1024 * 1024) return false;
    if (/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(url)) {
      try { var binary: any = atob(url.slice(url.indexOf(',') + 1)); return binary.length >= 33 && binary.slice(0,8) === '\x89PNG\r\n\x1a\n' && binary.slice(12,16) === 'IHDR'; } catch (e) { return false; }
    }
    if (!/^data:image\/svg\+xml(?:;charset=utf-8)?(?:;base64)?,/i.test(url)) return false;
    try {
      var comma: any=url.indexOf(','), header: any=url.slice(0,comma), payload: any=url.slice(comma+1), markup: any = /;base64$/i.test(header) ? atob(payload) : decodeURIComponent(payload);
      var doc: any = new DOMParser().parseFromString(markup, 'image/svg+xml');
      if (doc.documentElement.localName !== 'svg' || doc.querySelector('parsererror, script, foreignObject, iframe, object, embed')) return false;
      if (Array.from(doc.querySelectorAll('style')).some(function (el: any): any { return unsafeSvgReference(el.textContent); })) return false;
      return Array.from(doc.querySelectorAll('*')).every(function (el: any): any {
        return Array.from(el.attributes).every(function (a: any): any {
          var name: any = a.name.toLowerCase(), value: any = a.value.trim();
          if (name.indexOf('on') === 0) return false;
          if (name === 'href' || name === 'xlink:href') return value.charAt(0) === '#' || /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value);
          return !unsafeSvgReference(value);
        });
      });
    } catch (e) { return false; }
  }
  function documentValue(value: any,nodes: any): any {
    function fail(): any{throw new Error('Invalid saved document layout.');}
    function object(v: any,keys: any): any{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(function(k: any): any{return !keys.includes(k);}))fail();}
    function number(v: any,min: any,max: any): any{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail();return v;}
    function text(v: any,max: any): any{if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))fail();return v;}
    object(value,['version','layout','paper','orientation','items','paperWidth','paperHeight','showPageFurniture']);
    if(value.version!=='1'||!['free','pages','arrangement','figure1'].includes(value.layout)||!['letter','a4','custom'].includes(value.paper)||!['portrait','landscape'].includes(value.orientation)||!Array.isArray(value.items)||value.items.length>80)fail();
    if(value.showPageFurniture!==undefined && typeof value.showPageFurniture!=='boolean')fail();
    var dims: any;if(value.paper==='custom')dims=[number(value.paperWidth,100,3000),number(value.paperHeight,100,3000)];else {if(value.paperWidth!==undefined||value.paperHeight!==undefined)fail();dims=value.paper==='a4'?[595.28,841.89]:[612,792];if(value.orientation==='landscape')dims.reverse();}
    var ids: any=new Set(),items: any=value.items.map(function(i: any): any{
      var keys: any=['id','type','x','y','width','height','z'];
      object(i,keys.concat(i.type==='text'?['text','fontSize','color']:i.type==='shape'?['shape','fill','stroke','strokeWidth','radius']:['nodeId','caption']));
      if(!['figure','text','shape'].includes(i.type)||typeof i.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,199}$/.test(i.id)||ids.has(i.id))fail();ids.add(i.id);
      var out: any={id:i.id,type:i.type,x:number(i.x,0,dims[0]),y:number(i.y,0,dims[1]),width:number(i.width,20,dims[0]),height:number(i.height,20,dims[1]),z:number(i.z,0,10000)};
      if(!Number.isInteger(out.z)||out.x+out.width>dims[0]+0.01||out.y+out.height>dims[1]+0.01)fail();
      if(i.type==='figure'){if(!nodes.some(function(n: any): any{return n.id===i.nodeId;}))fail();out.nodeId=i.nodeId;out.caption=text(i.caption,1000);}
      else if(i.type==='text') {out.text=text(i.text,2000);out.fontSize=number(i.fontSize,6,72);if(typeof i.color!=='string'||!/^#[0-9a-f]{6}$/i.test(i.color))fail();out.color=i.color;}
      else {
        if(!['rectangle','ellipse','line','arrow'].includes(i.shape))fail();
        ['fill','stroke'].forEach(function(key: any): any{if(typeof i[key]!=='string'||(i[key]!=='none'&&(i[key].length!==7||!/^#[0-9a-f]{6}$/i.test(i[key]))))fail();out[key]=i[key].toLowerCase();});
        out.shape=i.shape;out.strokeWidth=number(i.strokeWidth,0,20);
        if(i.radius!==undefined){out.radius=number(i.radius,0,100);if(['line','arrow'].includes(i.shape))fail();}
      }
      return out;
    });
    var output: any={version:'1',layout:value.layout,paper:value.paper,orientation:value.orientation,items:items};if(value.showPageFurniture!==undefined)output.showPageFurniture=value.showPageFurniture;if(value.paper==='custom'){output.paperWidth=dims[0];output.paperHeight=dims[1];}return output;
  }
  function validateInsight(value: any): any {
    function fail(): any{throw new Error('Invalid saved scientific insight.');}
    var fields: any=['paragraph','context_label','searched_at','fingerprint','sources','stale'];
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(function(k: any): any{return !Object.prototype.hasOwnProperty.call(value,k);}))fail();
    [['paragraph',1800],['context_label',1000],['searched_at',80],['fingerprint',64]].forEach(function(rule: any): any{var v: any=value[rule[0]];if(typeof v!=='string'||!v.length||v.length>rule[1])fail();});
    if(/[<>]/.test(value.paragraph)||!/^[a-f0-9]{64}$/i.test(value.fingerprint)||typeof value.stale!=='boolean'||!Array.isArray(value.sources)||value.sources.length>3)fail();
    var sources: any=value.sources.map(function(s: any): any{
      if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join(',')!=='pmid,title,url,year'||typeof s.pmid!=='string'||!/^[1-9][0-9]{0,9}$/.test(s.pmid)||typeof s.title!=='string'||!s.title.length||s.title.length>500||/[<>]/.test(s.title)||typeof s.year!=='string'||!/^([0-9]{4})?$/.test(s.year)||s.url!=='https://pubmed.ncbi.nlm.nih.gov/'+s.pmid+'/')fail();
      return {pmid:s.pmid,title:s.title,year:s.year,url:s.url};
    });
    return {paragraph:value.paragraph,context_label:value.context_label,searched_at:value.searched_at,fingerprint:value.fingerprint,sources:sources,stale:value.stale};
  }
  function validateGroupComparison(value: any): any {
    function fail(): any{throw new Error('Invalid saved group comparison settings.');}
    function object(x: any): any{return !!x && typeof x==='object' && !Array.isArray(x);}
    function name(x: any): any{return typeof x==='string' && x.length>0 && x.length<=500 && !/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x) && !['__proto__','prototype','constructor'].includes(x);}
    function list(x: any,max: any): any{if(!Array.isArray(x)||x.length>max||x.some(function(v: any): any{return !name(v);})||new Set(x).size!==x.length)fail();return x.slice();}
    function map(x: any,max: any): any{if(!object(x)||Object.keys(x).length>max||Object.keys(x).some(function(k: any): any{return !name(k);}))fail();}
    if(!object(value)||Object.keys(value).sort().join(',')!=='features,hiddenConditions,panelOff,panelStyles'||new TextEncoder().encode(JSON.stringify(value)).length>65536)fail();
    var out: any={features:list(value.features,500),hiddenConditions:list(value.hiddenConditions,100),panelOff:Object.create(null),panelStyles:Object.create(null)};
    map(value.panelOff,500); Object.keys(value.panelOff).forEach(function(k: any): any{out.panelOff[k]=list(value.panelOff[k],100);});
    map(value.panelStyles,500); Object.keys(value.panelStyles).forEach(function(k: any): any{var s: any=value.panelStyles[k];if(!object(s)||Object.keys(s).some(function(key: any): any{return !['box','colors','points','lines'].includes(key);})||!Object.prototype.hasOwnProperty.call(s,'colors')||typeof s.box!=='boolean'||typeof s.points!=='boolean')fail();function colorMap(m: any): any{map(m,100);var result: any=Object.create(null);Object.keys(m).forEach(function(c: any): any{if(typeof m[c]!=='string'||!/^#[0-9a-f]{6}$/i.test(m[c]))fail();result[c]=m[c];});return result;}var style: any={colors:colorMap(s.colors),points:s.points,box:s.box};if(s.lines!==undefined)style.lines=colorMap(s.lines);out.panelStyles[k]=style;});
    return out;
  }
  function stateValue(state: any): any {
    if (state == null) return {version:'1',libraryHidden:false,nodes:[]};
    if (typeof state !== 'object' || !['1',1].includes(state.version) || typeof state.libraryHidden !== 'boolean' || !Array.isArray(state.nodes) || state.nodes.length > 40) throw new Error('Invalid saved figure workspace.');
    var ids: any = new Set(), keys: any = ['plotTitle','xTitle','yTitle','fontSize','fontColor','markColor','background'];
    var nodes: any = state.nodes.map(function (n: any): any {
      if (!n || typeof n.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,159}$/.test(n.id) || ids.has(n.id) || typeof n.label !== 'string' || n.label.length > 512) throw new Error('Invalid saved plot identity.');
      ids.add(n.id);
      ['x','y','width','height'].forEach(function (key: any): any { if (!Number.isFinite(n[key]) || n[key] < 0 || n[key] > (key === 'x' || key === 'y' ? 1000000 : 4000)) throw new Error('Invalid saved figure size or position.'); });
      if (n.width < 240 || n.height < 220 || !n.visual || typeof n.visual !== 'object' || (Array.isArray(n.visual) && n.visual.length !== 0)) throw new Error('Invalid saved plot settings.');
      var kind: any = n.kind === 'illustration' ? 'illustration' : 'plot';
      var assetId: any = null, illustrationColor: any = null;
      if (kind === 'illustration') {
        if (n.assetVersion !== '1') throw new Error('Unsupported illustration asset version.');
        if (typeof n.assetId !== 'string' || !illustrationEntry(n.assetId) || typeof n.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(n.color)) throw new Error('Invalid saved illustration.');
        assetId = n.assetId; illustrationColor = n.color.toLowerCase();
      }
      var visual: any = {};
      keys.forEach(function (key: any): any {
        if (n.visual[key] == null) return;
        var value: any = n.visual[key];
        if (key === 'fontSize') { if (typeof value !== 'number' || !Number.isFinite(value) || value < 8 || value > 48) throw new Error('Invalid saved font size.'); }
        else if (typeof value !== 'string' || value.length > 1000 || (['fontColor','markColor','background'].includes(key) && !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value))) throw new Error('Invalid saved plot appearance.');
        visual[key] = value;
      });
      if (n.visual.editor != null) {
        if (kind !== 'plot') throw new Error('The saved plot editor is unavailable.');
        visual.editor = sanitizeEditor(n.visual.editor);
      }
      if (n.visual.groupComparison != null) {
        if (kind !== 'plot' || !n.instance || n.instance.source !== 'group_comparison_tab-comparisonPlot') throw new Error('Invalid group comparison owner.');
        visual.groupComparison=validateGroupComparison(n.visual.groupComparison);
      }
      var finished: any = null;
      if (n.finished != null) {
        if (!n.finished || typeof n.finished !== 'object' || !checkedImage(n.finished.url) || typeof n.finished.createdAt !== 'string' || n.finished.createdAt.length > 64 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n.finished.createdAt) || !Number.isFinite(Date.parse(n.finished.createdAt)) || typeof n.finished.stale !== 'boolean') throw new Error('Invalid saved figure image.');
        finished = {url:n.finished.url, createdAt:n.finished.createdAt, stale:n.finished.stale};
        if (kind === 'illustration' && n.finished.stale) throw new Error('Illustration snapshots cannot be stale.');
        if (n.finished.provenance != null) {
          var provenance: any = n.finished.provenance;
          if (typeof provenance !== 'object' || Array.isArray(provenance) || Object.keys(provenance).length > 16) throw new Error('Invalid saved figure provenance.');
          finished.provenance = {};
          Object.keys(provenance).forEach(function (key: any): any {
            var value: any = provenance[key];
            if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || !(value === null || typeof value === 'boolean' || (typeof value === 'string' && value.length <= 1000) || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15))) throw new Error('Invalid saved figure provenance.');
            finished.provenance[key] = value;
          });
        }
      }
      var normalized: any = {id:n.id,label:n.label,x:Math.round(n.x),y:Math.round(n.y),width:Math.round(n.width),height:Math.round(n.height),visual:visual,finished:finished};
      if(n.instance!=null){if(!n.instance||typeof n.instance.id!=='string'||!/^tcinstance_[a-z0-9_]{1,80}$/.test(n.instance.id)||(typeof n.instance.source !== 'string' || !instanceSupported(n.instance.source))||n.id!==n.instance.id+'-'+n.instance.source.slice(n.instance.source.indexOf('-')+1)||!n.instance.inputs||typeof n.instance.inputs!=='object'||Array.isArray(n.instance.inputs)||Object.keys(n.instance.inputs).length>250||JSON.stringify(n.instance.inputs).length>512*1024)throw new Error('Invalid independent plot settings.');normalized.instance=JSON.parse(JSON.stringify(n.instance));}
      if (n.statistics != null) { if (!normalized.instance || normalized.instance.source !== 'results_dashboard-plot_violin') throw new Error('Invalid saved violin statistics.'); try { normalized.statistics = sanitizeStatistics(n.statistics); } catch (e) { throw new Error('Invalid saved violin statistics.'); } }
      if (n.insight != null) { if(kind !== 'plot') throw new Error('Illustrations cannot have scientific insights.'); normalized.insight=validateInsight(n.insight); }
      if (kind === 'illustration') { normalized.kind = 'illustration'; normalized.assetVersion = '1'; normalized.assetId = assetId; normalized.color = illustrationColor; }
      return normalized;
    });
    var result: any={version:'1',libraryHidden:state.libraryHidden,nodes:nodes};
    if (state.document != null) result.document=documentValue(state.document,nodes);
    // Optional canvas tabs (versioned). A bad or unknown field falls back to one tab.
    if (state.tabs != null) { const tabs: any = serializeTabs(state.tabs, nodes.map(function(n: any): any{return n.id;})); if (tabs) result.tabs=tabs; }
    return result;
  }
  var VERSION: any = '1', MAX_TABS: any = 20, MAX_NAME: any = 40, DEFAULT_NAME: any = 'Canvas 1', FIRST_ID: any = 'tab-1';
  var ID: any = /^tab-[A-Za-z0-9_-]{1,40}$/, NODE: any = /^[A-Za-z][A-Za-z0-9_-]{0,159}$/;

  function clone(state: any): any { return JSON.parse(JSON.stringify(state)); }
  function uniqueIds(list: any, allowed?: any): any {
    var seen: any = Object.create(null), out: any = [];
    (Array.isArray(list) ? list : []).forEach(function (id: any): any {
      if (typeof id !== 'string' || !NODE.test(id) || seen[id] || (allowed && allowed.indexOf(id) < 0)) return;
      seen[id] = true; out.push(id);
    });
    return out;
  }
  // Any name: trimmed, at most 40 characters, no control characters. Returns null when empty.
  function cleanName(value: any): any {
    if (typeof value !== 'string') return null;
    // Count characters, not UTF-16 units, so a cut never splits an emoji or other astral character.
    var name: any = Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, MAX_NAME).join('').trim();
    return name ? name : null;
  }
  function initial(nodeIds: any): any {
    return {version: VERSION, active: FIRST_ID, tabs: [{id: FIRST_ID, name: DEFAULT_NAME, nodes: uniqueIds(nodeIds)}], figure: {deselected: [], order: []}};
  }
  // Lenient by design: a bad field never blocks opening a checkpoint, it falls back.
  function validate(raw: any, nodeIds: any): any {
    var ids: any = uniqueIds(nodeIds);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== VERSION || !Array.isArray(raw.tabs) || !raw.tabs.length || raw.tabs.length > MAX_TABS) return initial(ids);
    var seenTab: any = Object.create(null), owned: any = Object.create(null), tabs: any = [];
    for (var i: any = 0; i < raw.tabs.length; i++) {
      var t: any = raw.tabs[i];
      if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !ID.test(t.id) || seenTab[t.id]) return initial(ids);
      var name: any = cleanName(t.name); if (!name) return initial(ids);
      seenTab[t.id] = true;
      var nodes: any = uniqueIds(t.nodes, ids).filter(function (id: any): any { if (owned[id]) return false; owned[id] = true; return true; });
      tabs.push({id: t.id, name: name, nodes: nodes});
    }
    // Cards the field does not mention (e.g. added by an older reader) join the first tab.
    ids.forEach(function (id: any): any { if (!owned[id]) tabs[0].nodes.push(id); });
    var figure: any = raw.figure && typeof raw.figure === 'object' && !Array.isArray(raw.figure) ? raw.figure : {};
    return {version: VERSION, active: seenTab[raw.active] ? raw.active : tabs[0].id, tabs: tabs,
      figure: {deselected: uniqueIds(figure.deselected, ids), order: uniqueIds(figure.order, ids)}};
  }
  function prune(state: any, nodeIds: any): any {
    var ids: any = uniqueIds(nodeIds), s: any = clone(state);
    s.tabs.forEach(function (t: any): any { t.nodes = t.nodes.filter(function (id: any): any { return ids.indexOf(id) >= 0; }); });
    var owned: any = [].concat.apply([], s.tabs.map(function (t: any): any { return t.nodes; }));
    ids.forEach(function (id: any): any { if (owned.indexOf(id) < 0) tabOf(s, s.active).nodes.push(id); });
    s.figure.deselected = s.figure.deselected.filter(function (id: any): any { return ids.indexOf(id) >= 0; });
    s.figure.order = s.figure.order.filter(function (id: any): any { return ids.indexOf(id) >= 0; });
    return s;
  }
  function isDefault(state: any): any {
    return state.tabs.length === 1 && state.tabs[0].id === FIRST_ID && state.tabs[0].name === DEFAULT_NAME && state.active === FIRST_ID && !state.figure.deselected.length && !state.figure.order.length;
  }
  function serializeTabsValue(state: any, nodeIds: any): any {
    var s: any = prune(state, nodeIds);
    return isDefault(s) ? null : s;
  }
  function tabOf(state: any, id: any): any { return state.tabs.find(function (t: any): any { return t.id === id; }) || state.tabs[0]; }
  function tabForNode(state: any, nodeId: any): any { var t: any = state.tabs.find(function (t: any): any { return t.nodes.indexOf(nodeId) >= 0; }); return t ? t.id : null; }

// PUBLIC_BOUNDARY

export type Validation<T> = { ok: true; state: T } | { ok: false; message: string };
export interface ValidatedState { version: '1'; libraryHidden: boolean; nodes: import('./types').Node[]; document?: Record<string, unknown>; tabs?: Record<string, unknown> }
function result<T>(run: () => T, fallback: string): Validation<T> {
  try { return { ok: true, state: run() }; }
  catch (error) { return { ok: false, message: error instanceof Error && !(error instanceof TypeError) ? error.message : fallback }; }
}
export function validateState(value: unknown): Validation<ValidatedState> {
  return result(() => {
    const state = stateValue(value);
    if (new TextEncoder().encode(JSON.stringify(state)).length > 24 * 1024 * 1024) throw new Error('The figure workspace is too large to save. Remove or resize a saved figure.');
    return state;
  }, 'Invalid saved figure workspace.');
}
export function validateDocument(value: unknown, nodes: readonly import('./types').Node[]): Validation<Record<string, unknown>> {
  return result(() => documentValue(value, nodes), 'Invalid saved document layout.');
}
export function serializeTabs(value: unknown, nodeIds: readonly string[]): Record<string, unknown> | null {
  return serializeTabsValue(validate(value, nodeIds), nodeIds);
}
