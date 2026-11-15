// Pure port of Team's Group comparison card (www/team/js/group_comparison.js): rows(), colours, selected(),
// the Plotly figure draw() builds, csv() and report(). Display state is the saved node.visual.groupComparison.
import type {GroupComparison} from '../state/document';
type Row = {Sample?:unknown;GroupingVal?:string;X_Grp?:string|null;Facet_Grp?:string|null;Feature?:string;Plot_Value?:number|null;P_Value?:number|null;Significance?:string|null;Is_Baseline?:boolean;[k:string]:unknown};
export interface GcSettings {method?:string;test?:string;correction?:string;comparison?:string;scale?:string;significance?:string;grouping?:string|string[];[k:string]:unknown}
/** The team-group-comparison-data message (R/frontends/team/group_comparison.R). */
export interface GcMessage {
  id?:string; rows?:Row[]|Record<string,unknown>; groups?:string|string[]; baseline?:string|string[]; settings?:GcSettings;
  families?:Record<string,string>; conditionColors?:Record<string,string>; requiresConfirmation?:boolean; confirmationToken?:string;
  inferenceAllowed?:boolean|null; inferenceReason?:string|null; scienceSignature?:string;
}
type Style = GroupComparison['panelStyles'][string];
export interface GcState {
  rows:Row[]; features:string[]; groups:string[]; baseline:string[]; settings:GcSettings; families:Record<string,string>; conditionColors:Record<string,string>;
  inferenceAllowed:boolean|null; inferenceReason:string|null;
  enabled:Set<string>; off:Set<string>; panelOff:Record<string,Set<string>>; styles:Record<string,Style>;
}
export interface Trace {type:string;[k:string]:unknown}
export interface Figure {data:Trace[];layout:Record<string,unknown>}
const arr = <T,>(x: T|T[]|null|undefined): T[] => x == null ? [] : Array.isArray(x) ? x : [x];
export function rows(x: GcMessage['rows']): Row[] {
  if (Array.isArray(x)) return x;
  const keys = Object.keys(x ?? {}), n = keys.length ? arr((x as Record<string,unknown>)[keys[0]]).length : 0;
  return Array.from({length:n}, (_,i) => Object.fromEntries(keys.map(k => [k, arr((x as Record<string,unknown>)[k])[i]])) as Row);
}
export function colorHex(c: unknown): string|null {
  if (typeof c !== 'string') return null; if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,[^)]*)?\s*\)$/i.exec(c);
  return m ? '#'+m.slice(1,4).map(v => Math.min(255,Number(v)).toString(16).padStart(2,'0')).join('') : null;
}
// Production's wrapping (84a24e5 legendLabel): a <br> every 18 characters.
function barLabel(value: string) { const chars = Array.from(String(value)), lines: string[] = []; while (chars.length) lines.push(chars.splice(0,18).join('').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')); return lines.join('<br>'); }
export function darker(c: string, f: number) { const v = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!v) return '#333333'; const n = parseInt(v[1],16); return '#'+[n>>16,(n>>8)&255,n&255].map(x => Math.round(x*(1-f)).toString(16).padStart(2,'0')).join(''); }
const GELATO = ['#BCD8EC','#FFCBE1','#D6E5BD','#DCCCEC','#FFDAB4','#F9E1A8'];
/** Team's first-load state: the first class only, every condition on. */
export function defaultVisual(s: Pick<GcState,'features'>): GroupComparison { return {features:s.features.slice(0,1),hiddenConditions:[],panelOff:{},panelStyles:{}}; }
export function stateFrom(m: GcMessage, visual?: GroupComparison|null): GcState {
  const data = rows(m.rows), features = Array.from(new Set(data.map(r => r.Feature).filter((f): f is string => !!f)));
  let groups = arr(m.groups).filter(Boolean).map(String); if (!groups.length) groups = Array.from(new Set(data.map(r => r.GroupingVal).filter((g): g is string => !!g)));
  const v = visual ?? defaultVisual({features});
  return {rows:data, features, groups, baseline:arr(m.baseline).map(String), settings:m.settings ?? {}, families:m.families ?? {}, conditionColors:m.conditionColors ?? {},
    inferenceAllowed:typeof m.inferenceAllowed === 'boolean' ? m.inferenceAllowed : null, inferenceReason:typeof m.inferenceReason === 'string' ? m.inferenceReason : null,
    enabled:new Set(v.features), off:new Set(v.hiddenConditions), panelOff:Object.fromEntries(Object.entries(v.panelOff ?? {}).map(([k,l]) => [k,new Set(l)])),
    styles:structuredClone(v.panelStyles ?? {})};
}
export function selected(s: GcState, c: string, g: string) { return s.enabled.has(c) && !s.off.has(g) && !(s.panelOff[c]?.has(g)); }
// One group -> colour map for the whole figure; edits are stored once, in the style of the first class.
export function sharedColor(s: Pick<GcState,'features'|'styles'>, g: string, kind: 'colors'|'lines') { for (const f of s.features) { const v = s.styles[f]?.[kind]?.[g]; if (v) return v; } return null; }
export function colorFor(s: GcState, g: string): string {
  const override = sharedColor(s,g,'colors'); if (override) return override;
  const fixed = colorHex(s.conditionColors[g]); if (fixed) return fixed;
  if (/^healthy(?:$|[_ -])/i.test(g)) return '#7A7A7A';
  return GELATO[Math.max(0, s.groups.slice().sort().indexOf(g)) % GELATO.length];
}
const lineFor = (s: GcState, g: string) => sharedColor(s,g,'lines') || darker(colorFor(s,g),.45);
// Display-state commands: each returns a new saved GroupComparison (the shape validate.ts accepts).
const copy = (v: GroupComparison): GroupComparison => structuredClone(v);
const blankStyle = (): Style => ({colors:{},lines:{},points:true,box:true});
export function toggleFeature(v: GroupComparison, c: string) { const n = copy(v); n.features = n.features.includes(c) ? n.features.filter(f => f !== c) : [...n.features,c]; return n; }
export function setFeatures(v: GroupComparison, features: string[]) { const n = copy(v); n.features = features.slice(); return n; }
export function toggleCondition(v: GroupComparison, g: string) { const n = copy(v); n.hiddenConditions = n.hiddenConditions.includes(g) ? n.hiddenConditions.filter(x => x !== g) : [...n.hiddenConditions,g]; return n; }
export function togglePanel(v: GroupComparison, c: string, g: string) {
  const n = copy(v), off = n.panelOff[c] ?? [];
  n.panelOff[c] = off.includes(g) ? off.filter(x => x !== g) : [...off,g]; if (!n.panelOff[c].length) delete n.panelOff[c]; return n;
}
/** setSharedColor: clears the group from every class, then stores it on the first class (all features, enabled or not). */
export function setColor(v: GroupComparison, g: string, value: string, features: string[] = v.features, kind: 'colors'|'lines' = 'colors') {
  const n = copy(v); for (const f of features) { const st = n.panelStyles[f]; if (st?.[kind]) delete st[kind]![g]; }
  if (!value || !features.length) return n;
  const st = n.panelStyles[features[0]] ??= blankStyle(); (st[kind] ??= {})[g] = value.toLowerCase(); return n;
}
export function resetColors(v: GroupComparison) { const n = copy(v); for (const st of Object.values(n.panelStyles)) { st.colors = {}; st.lines = {}; } return n; }
export function setStyle(v: GroupComparison, c: string, patch: Partial<Pick<Style,'points'|'box'>>) { const n = copy(v); Object.assign(n.panelStyles[c] ??= blankStyle(), patch); return n; }
function settingsLabel(s: GcState, r: Row) { return s.settings.significance === 'pvalue' ? 'p = '+Number(r.P_Value).toPrecision(3) : r.Significance || 'ns'; }
const finite = (x: unknown) => x !== null && x !== undefined && Number.isFinite(Number(x));
const SCALE: Record<string,string> = {log2fc:'Log2 fold change',fc:'Fold change',delta:'Proportion difference',log2:'Log2 abundance',linear:'Abundance'};
/** draw()'s Plotly figure. Unlike Team, a hidden violin is omitted (Team keeps it with visible:false for its editor replay). */
export function figure(s: GcState, width = 720): Figure {
  const active = s.features.filter(c => s.enabled.has(c)), nrow = Math.max(1, Math.ceil(active.length/2)), data: Trace[] = [];
  const legendRows = s.groups.reduce<{w:number;lines:number}[]>((rs,g) => { const n = Array.from(String(g)).length, w = Math.min(18,n)*7.2+50, lines = Math.max(1,Math.ceil(n/18)), last = rs[rs.length-1], avail = Math.max(240,width-90); if (!last || (last.w+w > avail && last.w > 0)) rs.push({w,lines}); else { last.w += w; last.lines = Math.max(last.lines,lines); } return rs; }, []);
  const legendHeight = Math.max(26, legendRows.reduce((h,r) => h+26+(r.lines-1)*15, 0)+(legendRows.length > 1 ? 10 : 0));
  const annotations: Record<string,unknown>[] = [], shapes: Record<string,unknown>[] = [];
  const layout: Record<string,unknown> = {height:(active.length > 1 ? Math.max(420,nrow*420) : 380)+legendHeight-26, margin:{l:70,r:20,t:34+legendHeight,b:55}, showlegend:true,
    legend:{orientation:'h',groupclick:'togglegroup',x:0,xanchor:'left',y:1,yanchor:'bottom',bgcolor:'#F6F7F9',bordercolor:'#D8DCE2',borderwidth:1}, annotations, shapes, meta:{teamConditions:s.groups,teamGroupComparison:true}};
  // The shared legend is the only colour key unless two shown groups share a colour: then tick labels come back.
  const shownGroups = s.groups.filter(g => active.some(c => selected(s,c,g))), shownColors = shownGroups.map(g => colorHex(colorFor(s,g)) || colorFor(s,g).toLowerCase());
  const repeatedColors = new Set(shownColors).size < shownColors.length;
  active.forEach((c,i) => {
    const axis = i ? String(i+1) : '', x = 'x'+axis, y = 'y'+axis, column = i%2, row = Math.floor(i/2), visible = s.groups.filter(g => selected(s,c,g));
    const domain = active.length === 1 ? [0,.98] : [column*.58, column*.58+.42];
    layout['xaxis'+axis] = repeatedColors ? {domain,anchor:y,type:'category',categoryorder:'array',categoryarray:visible,tickangle:active.length > 1 ? -45 : 0,automargin:true,title:{text:column === 0 ? 'Condition' : ''},showline:true,mirror:true,linecolor:'#000',ticks:'outside'}
      : {domain,anchor:y,type:'category',categoryorder:'array',categoryarray:visible,showticklabels:false,automargin:true,title:{text:''},showline:true,mirror:true,linecolor:'#000',ticks:''};
    const yaxis: Record<string,unknown> = {domain:[1-(row+1)/nrow+.06/nrow, 1-row/nrow-.10/nrow],anchor:x,title:{text:column === 0 ? (SCALE[s.settings.scale ?? ''] || 'Value') : ''},automargin:true,showline:true,mirror:true,linecolor:'#000',ticks:'outside',gridcolor:'#ddd',griddash:'dot',zeroline:false};
    layout['yaxis'+axis] = yaxis;
    annotations.push({name:'team-panel-title:'+c,xref:'paper',yref:'paper',x:active.length === 1 ? .49 : column*.58+.21,y:1-row/nrow-.02/nrow,text:c,showarrow:false});
    const vals = s.rows.filter(r => r.Feature === c && finite(r.Plot_Value)).map(r => Number(r.Plot_Value));
    const lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1, span = Math.max(hi-lo, Math.abs(hi)*.05, .01); let level = 0;
    for (const g of visible) {
      const rr = s.rows.filter(r => r.Feature === c && r.GroupingVal === g && finite(r.Plot_Value)), fill = colorFor(s,g), style = s.styles[c] ?? blankStyle();
      data.push({type:'violin',name:g+' · '+c,legendgroup:g,showlegend:false,x:rr.map(() => g),y:rr.map(r => Number(r.Plot_Value)),xaxis:x,yaxis:y,points:style.points ? 'all' : false,jitter:.3,pointpos:0,
        marker:{color:'#000000',size:5,opacity:1},fillcolor:fill,line:{color:lineFor(s,g),width:1.2},box:{visible:style.box,width:.22,fillcolor:darker(fill,.15),line:{color:darker(fill,.6)}},meanline:{visible:false},spanmode:'hard',
        hovertemplate:'%{y}<extra>'+g+'</extra>',meta:{teamSourceKey:'group-comparison:'+JSON.stringify([c,g,'violin']),teamPanel:c,teamCondition:g,teamDrawFill:fill}});
    }
    if (s.baseline.length === 1) visible.forEach(g => {
      const r = s.rows.find(z => z.Feature === c && z.GroupingVal === g && !z.Is_Baseline && finite(z.P_Value)); if (!r) return;
      const baseRow = s.rows.find(z => z.Feature === c && z.Is_Baseline && visible.includes(String(z.GroupingVal)) && (!r.Facet_Grp || z.Facet_Grp === r.Facet_Grp)); if (!baseRow) return;
      const b = visible.indexOf(String(baseRow.GroupingVal)), k = visible.indexOf(g), top = hi+span*(.12*(++level));
      for (const v of [[b,top-span*.035,b,top],[b,top,k,top],[k,top,k,top-span*.035]]) shapes.push({type:'line',xref:x,yref:y,x0:v[0],y0:v[1],x1:v[2],y1:v[3],line:{color:'#111',width:1}});
      annotations.push({xref:x,yref:y,x:(b+k)/2,y:top+span*.025,text:settingsLabel(s,r),showarrow:false});
    });
    yaxis.range = [lo-span*.1, hi+span*(.18+level*.12)];
  });
  for (const g of s.groups) { const on = active.some(c => selected(s,c,g)), fill = colorFor(s,g);
    data.push({type:'scatter',mode:'markers',x:[null],y:[null],name:barLabel(g),legendgroup:g,showlegend:on,visible:true,hoverinfo:'skip',marker:{symbol:'circle',size:12,color:fill,line:{color:lineFor(s,g),width:1.5}},meta:{teamSourceKey:'group-comparison:'+JSON.stringify([g,'legend']),teamCondition:g,teamRole:'legend',teamDrawFill:fill}}); }
  return {data, layout};
}
const CSV_COLUMNS = ['Sample','GroupingVal','X_Grp','Facet_Grp','Feature','Plot_Value','P_Value','Significance','Is_Baseline','Feature_Selected','Condition_Enabled','Panel_Condition_Enabled','Displayed','Test_Selection','Test_Applied','P_Adjustment','Inference_Allowed','Reference','Baseline','Scale','Significance_Display'];
/** Every computed row with its visibility; text cells that could start a spreadsheet formula get a leading quote. */
export function csv(s: GcState): string {
  const quote = (x: unknown) => { if (x == null) x = ''; else if (typeof x === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(x)) x = "'"+x; return '"'+String(x).replace(/"/g,'""')+'"'; };
  return [CSV_COLUMNS.map(quote).join(','), ...s.rows.map(r => { const c = String(r.Feature), g = String(r.GroupingVal), row: Record<string,unknown> = {...r,
    Feature_Selected:s.enabled.has(c),Condition_Enabled:!s.off.has(g),Panel_Condition_Enabled:!s.panelOff[c]?.has(g),Displayed:selected(s,c,g),
    Test_Selection:s.settings.method||'',Test_Applied:s.settings.test||'',P_Adjustment:s.settings.correction||'none',Inference_Allowed:s.inferenceAllowed == null ? 'unknown' : s.inferenceAllowed,
    Reference:s.settings.comparison||'',Baseline:JSON.stringify(s.baseline),Scale:s.settings.scale||'',Significance_Display:s.settings.significance||''};
    return CSV_COLUMNS.map(k => quote(row[k])).join(','); })].join('\r\n');
}
export function inferenceNotice(s: GcState) { if (s.inferenceAllowed === false && s.inferenceReason) return s.inferenceReason; return s.inferenceAllowed === false ? 'Unpaired statistical tests are not enabled for the current study design or preparation. Review the study design and preparation before interpreting comparisons.' : s.inferenceAllowed === true ? 'Unpaired inference is enabled. Individual p-values can still be unavailable when data or a test are insufficient.' : 'Inference eligibility is unavailable; the reason for missing p-values could not be determined.'; }
const unavailable = (s: GcState) => s.inferenceAllowed === false ? 'p unavailable — unpaired inference is not enabled' : s.inferenceAllowed === true ? 'p unavailable — insufficient usable data, zero variation, or test failure' : 'p unavailable — inference status unknown';
export function report(s: GcState): string {
  const v = s.settings, lines = ['GROUP COMPARISON — LOCAL STATISTICS', 'Test selection: '+(v.method||'automatic'), 'Test applied: '+(v.test||'not available'),
    'P-value adjustment: none (raw local pairwise p-values)', inferenceNotice(s), 'Reference strategy: '+(v.comparison||'not selected'), 'Baseline: '+(s.baseline.join(', ')||'not selected'),
    'Scale: '+(v.scale||'not selected'), 'Significance display: '+(v.significance||'star'), 'Metadata grouping: '+arr(v.grouping).join(', '),
    'Presentation hides do not exclude observations or recompute tests.', 'The table below includes all computed classes and groups; visibility is indicated separately.'];
  if (s.baseline.length > 1) lines.push('The reference combines multiple baseline groups; brackets are omitted because no single baseline position represents that pooled reference.');
  for (const g of s.groups) lines.push('Group '+g+': '+new Set(s.rows.filter(r => r.GroupingVal === g).map(r => r.Sample)).size+' samples in data');
  for (const c of s.features) { lines.push('\n'+c+(s.enabled.has(c) ? ' [shown]' : ' [hidden]'));
    for (const g of s.groups) { const rr = s.rows.filter(r => r.Feature === c && r.GroupingVal === g), first = rr[0]; if (!first) continue;
      const visible = selected(s,c,g) ? 'shown' : 'hidden', n = rr.filter(r => finite(r.Plot_Value)).length;
      if (first.Is_Baseline) { lines.push('  '+g+': reference; n = '+n+' ('+visible+')'); continue; }
      lines.push('  '+g+': '+(finite(first.P_Value) ? 'p = '+Number(first.P_Value).toPrecision(6) : unavailable(s))+'; n = '+n+' ('+visible+')'); } }
  return lines.join('\n');
}
export interface ResultRow {feature:string;comparison:string;p:number|null;significance:string;shown:boolean}
/** One row per class and non-reference condition (the report's p-value lines, as a table). */
export function resultRows(s: GcState): ResultRow[] {
  const reference = s.baseline.join(' + ') || 'reference', out: ResultRow[] = [];
  for (const c of s.features) for (const g of s.groups) { const first = s.rows.find(r => r.Feature === c && r.GroupingVal === g); if (!first || first.Is_Baseline) continue;
    const p = finite(first.P_Value) ? Number(first.P_Value) : null;
    out.push({feature:c, comparison:`${g} vs ${reference}`, p, significance:p == null ? unavailable(s).replace(/^p unavailable — /,'unavailable: ') : first.Significance || 'ns', shown:selected(s,c,g)}); }
  return out;
}
