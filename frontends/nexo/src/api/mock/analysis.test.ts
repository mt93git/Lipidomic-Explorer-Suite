import { afterEach, expect, it, vi } from 'vitest';
import checkpoints from '../../mock/checkpoints.json';
import fixture from './analysis.json';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
it('serves the synthetic fixture, applies values, rejects unknown ids with 400 atomically',async()=>{
 vi.stubEnv('VITE_API_MOCK','1');vi.stubGlobal('window',{});vi.resetModules();
 const {openSession,getAnalysis,updateAnalysis}=await import('../../api');
 const session=await openSession(checkpoints[0].id);
 expect(await getAnalysis(session.sessionId)).toEqual(fixture);
 const result=await updateAnalysis(session.sessionId,{log2fcThreshold:2});
 expect(result.sections[0].controls.find(c=>c.id==='log2fcThreshold')?.value).toBe(2);
 await expect(updateAnalysis(session.sessionId,{log2fcThreshold:3,unknown:true})).rejects.toMatchObject({status:400});
 expect((await getAnalysis(session.sessionId)).sections[0].controls.find(c=>c.id==='log2fcThreshold')?.value).toBe(2);
});
