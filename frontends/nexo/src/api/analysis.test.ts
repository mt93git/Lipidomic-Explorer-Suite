import { createImageCache } from '../imageCache';
import { afterEach, expect, it, vi } from 'vitest';
import { useAdminTokenFetch } from './adminToken';
useAdminTokenFetch(async () => new Response('{}', {status: 401}));
import { getAnalysis, updateAnalysis } from '../api';
import { analysisCacheKey, analysisGeneration, onAnalysisChange } from '../analysisGeneration';
import fixture from './mock/analysis.json';
afterEach(()=>vi.unstubAllGlobals());
it('fetches analysis and PATCHes only the supplied draft diff, invalidating render subscribers after success', async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);
 await expect(getAnalysis('analysis/session')).resolves.toMatchObject({sections:fixture.sections});
 const before=analysisGeneration('analysis/session'), refresh=vi.fn(), off=onAnalysisChange('analysis/session',refresh);
 await updateAnalysis('analysis/session',{log2fcThreshold:2});
 expect(fetch.mock.calls[1][0]).toBe('/api/v1/sessions/analysis%2Fsession/analysis');
 expect(fetch.mock.calls[1][1]).toMatchObject({method:'PATCH',body:JSON.stringify({inputs:{log2fcThreshold:2}})});
 expect(analysisGeneration('analysis/session')).toBe(before+1);expect(refresh).toHaveBeenCalledOnce();off();
});
it('preserves the API error and cached generation on a rejected draft',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'bad_input',message:'Unknown setting'}),{status:400,headers:{'Content-Type':'application/json'}})));
 const before=analysisGeneration('rejected');await expect(updateAnalysis('rejected',{unknown:1})).rejects.toThrow('Unknown setting');expect(analysisGeneration('rejected')).toBe(before);
});

it('refetches identical card inputs and size after Apply instead of reusing the image render',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture),{headers:{'Content-Type':'application/json'}})));
 const cache=createImageCache(), render=vi.fn().mockResolvedValue({url:'data:image/png;base64,AA',bytes:1});
 const key=()=>analysisCacheKey('cache-session',{card:'a',inputs:{},width:400,height:300});
 await cache.load(key(),render);await cache.load(key(),render);expect(render).toHaveBeenCalledTimes(1);
 await updateAnalysis('cache-session',{log2fcThreshold:2});
 await cache.load(key(),render);expect(render).toHaveBeenCalledTimes(2);
});
