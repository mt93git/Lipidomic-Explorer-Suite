import {afterEach,expect,it,vi} from 'vitest';
import checkpoints from '../../mock/checkpoints.json';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
it('saves, reopens and downloads a mock Nexo member while leaving Team canvas untouched',async()=>{
 vi.stubEnv('VITE_API_MOCK','1');vi.stubGlobal('window',{});const memory=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)});vi.resetModules();
 const api=await import('../../api');const session=await api.openSession(checkpoints[0].id);expect(session.nexo).toBeNull();
 const nexo={version:1 as const,nodes:{'results_dashboard-plot_violin':{style:{yaxis:{type:'log' as const,min:1,max:100}}}}};
 const {toCanvasV1}=await import('../../state/serialize');const {initial}=await import('../../state/tabs');const document={...session.canvas,nodes:session.canvas.nodes.filter(n=>n.kind==='plot')};const state=toCanvasV1(document,initial(document.nodes.map(n=>n.id)));const ack=await api.validateCanvas(session.sessionId,'test',state);expect(ack.ok).toBe(true);
 const record=await api.saveCheckpoint(session.sessionId,'Styled mock',{token:'test',state:ack.state},nexo);const reopened=await api.openSession(record.id);expect(reopened.nexo).toEqual(nexo);expect(reopened.canvas).toEqual(state);expect(reopened.canvas).not.toHaveProperty('nexo');
 const url=await api.checkpointDownload(record.id);const blob=await (await fetch(url)).blob();URL.revokeObjectURL(url);const {readCheckpointZip}=await import('../../mock/archive');expect(await readCheckpointZip(new File([blob],'styled.zip'),'nexo-canvas-v1.json')).toEqual(nexo);
 vi.resetModules();const reloaded=await import('../../api');expect((await reloaded.openSession(record.id)).nexo).toEqual(nexo);
 // Use the new page's session, just as the real reopen path does.
 const current=await reloaded.openSession(record.id);await reloaded.validateCanvas(current.sessionId,'invalid',state);
 await expect(reloaded.saveCheckpoint(current.sessionId,'Bad',{token:'invalid',state},{version:2} as never)).rejects.toMatchObject({status:400,error:'invalid_nexo'});
});
