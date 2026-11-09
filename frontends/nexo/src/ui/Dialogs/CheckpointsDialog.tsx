import { strings as s, phrases as p, datasetStrings as d } from '../strings';
import { useEffect,useRef,useState } from 'react';
import { listCheckpoints,uploadCheckpoint,checkpointDownload,deleteCheckpoint,knownAdminView,adminSignInUrl,AdminSignInRequired,type Checkpoint } from '../../api';
import { uploadAllowed } from '../uploadAccess';
import { Confirm } from './Confirm';
import { notify } from '../model';
import { checkpointRows } from '../checkpointList';
import { isReadOnly } from '../../state/readonly';
export function CheckpointsDialog({onClose,save}:{onClose:()=>void;save:(label:string)=>Promise<Checkpoint>}) {
 const ref=useRef<HTMLDialogElement>(null),[records,setRecords]=useState<Checkpoint[]>([]),[label,setLabel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[deleting,setDeleting]=useState<Checkpoint|null>(null);
 const [loaded,setLoaded]=useState(false),[signIn,setSignIn]=useState(false);
 const refresh=async()=>{setRecords(await listCheckpoints());setLoaded(true);};
 useEffect(()=>{const previous=document.activeElement as HTMLElement;const dialog=ref.current!;dialog.showModal();void refresh().catch(e=>{setSignIn(e instanceof AdminSignInRequired);setError(e instanceof AdminSignInRequired?e.message:String(e));});return()=>{dialog.close();previous?.focus();};},[]);
 const open=(id:string)=>{const url=new URL(location.href);url.searchParams.set('checkpoint',id);location.assign(url);};
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setSignIn(false);try{await fn();}catch(e){setSignIn(e instanceof AdminSignInRequired);setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 // Journey review 8.3: the open checkpoint first (marked Current), then Team's, named saves and autosaves, newest first.
 const current=new URL(location.href).searchParams.get('checkpoint'),order=checkpointRows(records).map(r=>r.id);
 const ordered=[...records].sort((a,b)=>Number(b.id===current)-Number(a.id===current)||order.indexOf(a.id)-order.indexOf(b.id));
 const valid=Array.from(label.trim()).length>=1&&Array.from(label.trim()).length<=80,readOnly=isReadOnly();
 return <dialog ref={ref} aria-label={s.checkpoints} onCancel={e=>{e.preventDefault();onClose();}} style={{width:'min(760px,90vw)'}}><h2>{s.checkpoints}</h2>
  {!readOnly&&<><form onSubmit={e=>{e.preventDefault();if(valid)void run(async()=>{const record=await save(label.trim());notify(p.savedAs(record.name));onClose();});}}>
   <label>{s.newCheckpoint}<input autoFocus value={label} onChange={e=>setLabel(e.target.value)} required maxLength={160}/></label>
   <button disabled={busy||!valid}>{s.saveCurrent}</button>
  </form>
  {uploadAllowed(knownAdminView(),readOnly)&&<label>{s.uploadZip}<input type="file" accept=".zip" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{const record=await uploadCheckpoint(file,label.trim()||file.name.replace(/\.zip$/i,'').slice(0,80));open(record.id);});}}/></label>}</>}
  <p role="alert">{error}</p>{signIn&&<a className="primary sign-in" href={adminSignInUrl(location.href)}>{d.signIn}</a>}<h3>{s.savedCheckpoint}</h3>
  <div aria-busy={busy}>{loaded&&!records.length&&<p>{s.empty}</p>}{ordered.map(record=><article className="library-row" key={record.id} aria-current={record.id===current||undefined}><span><strong>{record.name==='autosave'?s.autosave:record.name}{record.id===current&&<span className="current-chip">{s.currentCheckpoint}</span>}</strong><small>{new Date(record.createdAt).toLocaleString()} · {record.sizeBytes.toLocaleString()} bytes · {record.source}</small></span>
   <button disabled={busy} onClick={()=>open(record.id)}>{s.open}</button>
   <button disabled={busy} onClick={()=>void run(async()=>{const a=document.createElement('a');a.href=await checkpointDownload(record.id);a.download=`${record.name}.zip`;a.click();if(a.href.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(a.href),1000);})}>{s.download}</button>
   {record.source==='store'&&!readOnly&&<button disabled={busy} onClick={()=>setDeleting(record)}>{s.deleteLabel}</button>}
  </article>)}</div>
  <button onClick={onClose}>{s.exportClose}</button>
  {deleting&&<Confirm title={s.deleteCheckpoint} onCancel={()=>setDeleting(null)} onConfirm={()=>{const id=deleting.id;setDeleting(null);void run(async()=>{await deleteCheckpoint(id);await refresh();});}}><p>{p.deleteNamed(deleting.name)}</p></Confirm>}
 </dialog>;
}
