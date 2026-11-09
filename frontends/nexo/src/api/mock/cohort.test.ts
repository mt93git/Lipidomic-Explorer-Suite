import { afterEach, expect, it, vi } from 'vitest';
import checkpoints from '../../mock/checkpoints.json';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
it('serves the cohort, rejects unknown lipids with 400, bumps the analysis generation, and travels with a save',async()=>{
 vi.stubEnv('VITE_API_MOCK','1');vi.stubGlobal('window',{});const memory=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)});vi.resetModules();
 const api=await import('../../api'), {analysisGeneration}=await import('../../analysisGeneration');
 const session=await api.openSession(checkpoints[0].id), id=session.sessionId;
 const first=await api.getCohort(id);
 expect(first.active).toBe(false);expect(new Set(first.available.map(a=>a.class)).size).toBeGreaterThan(2);
 const before=analysisGeneration(id);
 expect(await api.setCohort(id,['TG(52:2)','TG(52:2)','PC(16:0/18:1)'])).toMatchObject({active:true,lipids:['TG(52:2)','PC(16:0/18:1)']});
 expect(analysisGeneration(id)).toBe(before+1);
 await expect(api.setCohort(id,['Not a lipid'])).rejects.toMatchObject({status:400,message:'Unknown lipid: Not a lipid'});
 expect((await api.getCohort(id)).lipids).toEqual(['TG(52:2)','PC(16:0/18:1)']);
 const {toCanvasV1}=await import('../../state/serialize'),{initial}=await import('../../state/tabs');
 const document={...session.canvas,nodes:session.canvas.nodes.filter(n=>n.kind==='plot')};
 const ack=await api.validateCanvas(id,'cohort',toCanvasV1(document,initial(document.nodes.map(n=>n.id))));expect(ack.ok).toBe(true);
 const record=await api.saveCheckpoint(id,'Cohort mock',{token:'cohort',state:ack.state});
 // A reload is a new page: the module state is gone, the saved member is not.
 vi.resetModules();const reloaded=await import('../../api');const reopened=await reloaded.openSession(record.id);
 expect((await reloaded.getCohort(reopened.sessionId)).lipids).toEqual(['TG(52:2)','PC(16:0/18:1)']);
 expect((await reloaded.setCohort(reopened.sessionId,[])).active).toBe(false);
});
