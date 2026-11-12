import { strings as s } from '../strings';
import {useEffect,useRef,useState} from 'react';
import {violinStatistics,type Node,type ViolinPolicy,type ViolinReply} from '../../api';
import {cardInstanceId} from '../../api/instance';
import {GroupComparisonSection} from './GroupComparisonSection';
import {PcaScoreSection,hasPcaScore} from './PcaScoreSection';
import type {CanvasHandle} from '../../canvas/handle';
import type {Statistics} from '../../state/document';
import {TESTS,CORRECTIONS,SCOPES,EFFECTS,DEFAULT_SETTINGS,DEFAULT_PRESENTATION,sanitizeSettings,sanitizePresentation,diffSettings,effectAllowedFor,statusFor,pairKey,type Settings,type Presentation,type Pair} from '../../statistics/settings';
import {rowsForDisplay,methodsNote,formatP,stars,nLabel} from '../../statistics/result';
import {statisticsCsv} from '../../statistics/csv';
import {StatsDiff} from './StatsDiff';
import {collab} from '../../collab/mode';
export function stagedAfter(applied:Settings,change:Partial<Settings>):Settings{return sanitizeSettings({...applied,...change});}
export function canDiscard(staged: Settings, baseline: Settings) { return diffSettings(sanitizeSettings(baseline), sanitizeSettings(staged)).length > 0; }
export function canConfirm(staged:Settings,applied:Settings|null,policy:ViolinPolicy|undefined){return !!policy?.allowed&&staged.comparisons.length>0&&diffSettings(applied,sanitizeSettings(staged)).length>0;}
function saved(p:Presentation,a:Settings|null,r:Statistics['result']):Statistics{
 return {version:'1',presentation:{...p,hidden:p.hidden.map(({a,b})=>[a,b])},applied:a?{...a,comparisons:a.comparisons.map(({a,b})=>[a,b])} as Statistics['applied']:null,result:r};
}
export function StatisticsTab({node,handle}:{node:Node;handle:CanvasHandle}){
 const [,refresh]=useState(0);
 useEffect(()=>handle.onChange(()=>refresh(n=>n+1)),[handle]);
 const current=handle.getSession().canvas.nodes.find(n=>n.id===node.id)??node;
 const statistics=current.statistics, applied=statistics?.applied?sanitizeSettings(statistics.applied):null;
 const presentation=sanitizePresentation(statistics?.presentation),result=statistics?.result;
 const [staged,setStaged]=useState(()=>applied??sanitizeSettings({...DEFAULT_SETTINGS,effect:'hedges_g'}));
 const [reply,setReply]=useState<ViolinReply>(),[description,setDescription]=useState<ViolinReply['describe']>(),[policy,setPolicy]=useState<ViolinPolicy>(),[busy,setBusy]=useState(false),[review,setReview]=useState(false),[message,setMessage]=useState('');
 // UX review 2, group 5: who last changed this card or the whole board (meta.lastChange), for the invalidation text.
 const [changedBy,setChangedBy]=useState<string>();
 useEffect(()=>{if(collab())void import('../../collab/provider').then(m=>{const c=m.getProvider()?.document.getMap('meta').get('lastChange') as {nodeId?:string|null;displayName?:string}|undefined;setChangedBy(c&&(!c.nodeId||c.nodeId===node.id)?c.displayName:undefined);});},[reply,node.id]);
 const mounted=useRef(true),generation=useRef(0);
 // Cards added in this session keep their id in instance.instanceId; cardInstanceId reads both shapes and the
 // legacy dashboard nodes, which the server renders through a fixed v0 instance (tcinstance_v0_<output>).
 const legacy=/^results_dashboard-plot_(pca|violin|dist|comp|heat)$/.test(node.id);
 const sessionId=handle.getSession().sessionId,instanceId=cardInstanceId(node);
 const source=node.instance?.source??(legacy?node.id:undefined);
 const eligible=source==='results_dashboard-plot_violin';
 async function inspect(mode:'check'|'verify'='check'){
  const ticket=++generation.current;setBusy(true);setMessage('');
  try{
   const d=await violinStatistics(sessionId,instanceId,{mode:'describe'});
   if(!mounted.current||ticket!==generation.current)return;
   setDescription(d.describe);setPolicy(d.policy);setReply(d);
   if(!statistics?.applied){const groups=d.describe?.groups??[];const comparisons=groups.flatMap((g,i)=>groups.slice(i+1).map(h=>({a:g.group,b:h.group})));setStaged(s=>stagedAfter(s,{comparisons}));}
   if(result){const checked=await violinStatistics(sessionId,instanceId,{mode,settings:applied??undefined,dataFingerprint:result.dataFingerprint});
    if(!mounted.current||ticket!==generation.current)return;
    setReply(checked);
    if(mode==='verify'&&checked.status==='ok'&&checked.result&&checked.settings)handle.setStatistics(node.id,saved(presentation,sanitizeSettings(checked.settings),checked.result));
    if(((checked.status==='invalidated'||checked.status==='unchanged')&&(checked.dataFingerprint??checked.result?.dataFingerprint)!==result.dataFingerprint)||checked.status==='blocked')handle.setStatistics(node.id,saved(presentation,applied,null));
   }
  }catch(e){if(mounted.current)setMessage(String(e));}finally{if(mounted.current&&ticket===generation.current)setBusy(false);}
 }
 useEffect(()=>{mounted.current=true;if(eligible)void inspect();return()=>{mounted.current=false;generation.current++;};},[sessionId,instanceId,eligible]);
 function stage(change:Partial<Settings>){setStaged(s=>stagedAfter(s,change));setReview(false);}
 function present(change:Partial<Presentation>){handle.setStatistics(node.id,saved(sanitizePresentation({...presentation,...change}),applied,result));}
 async function apply(){
  setBusy(true);setReview(false);setMessage('');
  try{const settings=sanitizeSettings(staged),r=await violinStatistics(sessionId,instanceId,{mode:'apply',settings});if(!mounted.current)return;setReply(r);setPolicy(r.policy);
   if(r.status==='ok'&&r.result){const confirmed=sanitizeSettings(r.settings??settings);handle.setStatistics(node.id,saved(presentation,confirmed,r.result));setStaged(confirmed);}
  }catch(e){if(mounted.current)setMessage(String(e));}finally{if(mounted.current)setBusy(false);}
 }
 const select=(label:string,value:string,options:Record<string,string>,onChange:(v:string)=>void)=><label style={{display:'block',margin:'8px 0'}}>{label}<select aria-label={label} style={{display:'block',width:'100%'}} value={value} onChange={e=>onChange(e.target.value)}>{Object.entries(options).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
 const pairs:Pair[]=(description?.groups??[]).flatMap((g,i,groups)=>groups.slice(i+1).map(h=>({a:g.group,b:h.group})));
 const baseline = applied??sanitizeSettings({...DEFAULT_SETTINGS,comparisons:pairs,effect:'hedges_g'});
 if(hasPcaScore(source))return <PcaScoreSection node={current} source={source} handle={handle}/>;
 if(source?.includes('group_comparison'))return <GroupComparisonSection node={current} handle={handle} instanceId={node.instance?.instanceId??instanceId}/>;
 if(!eligible)return <><p>Statistics are available for independent violin copies.</p>{message&&<p role="alert">{message}</p>}</>;
 const status=result&&(reply?.status==='unchanged'||reply?.status==='invalidated')?statusFor({...reply,matchesCurrent:(reply.dataFingerprint??reply.result?.dataFingerprint)===result.dataFingerprint},changedBy):result?statusFor(reply??{status:'ok'}):reply?.status==='ok'?statusFor(null):statusFor(reply,changedBy);
 return <section aria-label="Violin statistics" style={{padding:8}}>
  <p role="status" data-statistics-status={reply?.status??'none'}>{busy?'Checking or computing statistics…':message||status}</p>
  {(message||reply?.status==='error'||reply?.status==='invalidated'||reply?.status==='blocked')&&<button disabled={busy} onClick={()=>void inspect('verify')}>Retry check</button>}
  {policy&&!policy.allowed&&<p>{policy.reason}</p>}
  <fieldset disabled={busy||!policy?.allowed}><legend>Analysis <small>confirm before computing</small></legend><p>{s.analysisHelp}</p>
   {select('Test',staged.test,TESTS,v=>stage({test:v as Settings['test']}))}
   {select('Multiple-testing correction',staged.correction,CORRECTIONS,v=>stage({correction:v as Settings['correction']}))}
   {select('Correction family',staged.scope,SCOPES,v=>stage({scope:v as Settings['scope']}))}
   <fieldset><legend>Comparisons (B vs A)</legend>{pairs.map(p=><label key={pairKey(p)} style={{display:'block'}}><input type="checkbox" checked={staged.comparisons.some(c=>pairKey(c)===pairKey(p))} onChange={e=>stage({comparisons:e.target.checked?[...staged.comparisons,p]:staged.comparisons.filter(c=>pairKey(c)!==pairKey(p))})}/>{p.b} vs {p.a}</label>)}</fieldset>
   {select('Effect size',staged.effect,{none:EFFECTS.none,[effectAllowedFor(staged.test)]:EFFECTS[effectAllowedFor(staged.test)]},v=>stage({effect:v as Settings['effect']}))}
   <button className="primary" disabled={!canConfirm(staged,result?applied:null,policy)} onClick={()=>setReview(true)}>Review and confirm…</button>
   <button disabled={!canDiscard(staged,baseline)} onClick={()=>{setStaged(baseline);setReview(false);}}>{s.discardChanges}</button>
   {review&&<div role="group" aria-label="Confirm statistical analysis"><h4>Confirm statistical analysis</h4><StatsDiff applied={applied} staged={staged}/>
    <p>p-values are computed on the values drawn: log10 of positive, finite prepared abundances. Missing, zero and negative values are excluded.</p>
    <p>Normalization: {description?.normalization??'Unknown'}; imputation: {description?.imputation??'Unknown'}. Imputed values are tested as measured.</p>
    <p>{description?.participantIds==='unique'?'Every sample has a distinct participant ID.':'Independence relies on the confirmed design and eligibility of the declared comparison groups.'}</p>
    <p>{staged.scope==='displayed'?'This family covers the displayed lipid only; correction does not account for selecting this lipid after inspecting others.':'Correction covers every lipid in the current scope.'} Hiding annotations does not change the correction family.</p>
    {staged.correction==='none'&&<p>No multiple-testing correction is applied.</p>}
    {staged.effect!=='none'&&<p>{EFFECTS[staged.effect]} is an effect size, with no confidence interval provided.</p>}
    <button disabled={!canConfirm(staged,result?applied:null,policy)} onClick={()=>void apply()}>Confirm and compute</button><button onClick={()=>setReview(false)}>Cancel</button>
   </div>}
  </fieldset>
  <fieldset><legend>Display <small>updates immediately</small></legend>
   <label><input type="checkbox" checked={presentation.show} onChange={e=>present({show:e.target.checked})}/>Show significance annotations</label>
   {select('P value shown',presentation.pValue,{adjusted:'Adjusted',raw:'Unadjusted'},v=>present({pValue:v as Presentation['pValue']}))}
   {select('Label',presentation.label,{both:'Stars and exact value',exact:'Exact value',stars:'Stars'},v=>present({label:v as Presentation['label']}))}
   {select('Group size labels',presentation.nDisplay,{samples:'Samples',participants:'Participants',both:'Both',hidden:'Hidden'},v=>present({nDisplay:v as Presentation['nDisplay']}))}
   {([['Annotation font size','fontSize',8,28,1],['Bracket spacing','spacing',.03,.3,.01],['Bracket tip length','tip',0,.1,.005]] as const).map(([label,key,min,max,step])=><label key={key} style={{display:'block'}}>{label}<input type="number" value={presentation[key]} min={min} max={max} step={step} onChange={e=>{if(e.target.value!==''&&e.target.validity.valid)present({[key]:Number(e.target.value)});}}/></label>)}
   <fieldset><legend>Comparisons shown on the plot</legend>{(result?.rows??[]).map(p=><label key={pairKey(p)}><input type="checkbox" checked={!presentation.hidden.some(c=>pairKey(c)===pairKey(p))} onChange={e=>present({hidden:e.target.checked?presentation.hidden.filter(c=>pairKey(c)!==pairKey(p)):[...presentation.hidden,{a:p.a,b:p.b}]})}/>{p.b} vs {p.a}</label>)}</fieldset>
  </fieldset>
  <h4>Results for the displayed lipid</h4>
  <table aria-label="Results for the displayed lipid"><thead><tr>{['Comparison','Group sizes','p','Adjusted p','Significance','Effect','Note'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{result&&rowsForDisplay(result,{...presentation,hidden:[]},applied??DEFAULT_SETTINGS).map(r=><tr key={pairKey(r)}><th>{r.b} vs {r.a}</th><td>{nLabel(result.groups.find(g=>g.group===r.a),presentation.nDisplay).replaceAll('<br>','; ')}; {nLabel(result.groups.find(g=>g.group===r.b),presentation.nDisplay).replaceAll('<br>','; ')}</td><td>{formatP(r.p)}</td><td>{formatP(r.pAdj)}</td><td>{stars(r.value)}</td><td>{r.effect??'n/a'}</td><td>{r.note}</td></tr>)}</tbody></table>
  <p>{methodsNote(result,applied??DEFAULT_SETTINGS,presentation)}</p>
  <button disabled={!result||!applied} onClick={()=>{if(!result||!applied)return;const url=URL.createObjectURL(new Blob([statisticsCsv(result,applied,presentation)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='statistics.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Statistics CSV</button>
 </section>;
}
