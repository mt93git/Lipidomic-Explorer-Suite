import type {ViolinRequest,ViolinReply} from '../api/types';
const groups=[{group:'Control',nSamples:5,nExcluded:0,nParticipants:5},{group:'Case',nSamples:5,nExcluded:0,nParticipants:5}];
export const mockViolinPolicy={allowed:true};
// Fingerprints are sha256 hex on the server and the canvas validator requires 64 hex characters, so the mock
// derives a deterministic 64-hex print from its label (FNV-1a with eight seeds).
export function mockHex64(label:string):string{let out='';for(let seed=0;seed<8;seed++){let h=(0x811c9dc5^seed*0x9e3779b1)>>>0;for(let i=0;i<label.length;i++){h^=label.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}out+=h.toString(16).padStart(8,'0');}return out;}
export async function mockViolinStatistics(instanceId:string,request:ViolinRequest,dataLabel='mock-data'):Promise<ViolinReply>{
 const dataFingerprint=mockHex64(dataLabel);
 await new Promise(r=>setTimeout(r,300));
 return {dataFingerprint,requestId:crypto.randomUUID(),instanceId,mode:request.mode,status:request.mode==='check'||request.mode==='verify'?'unchanged':'ok',policy:mockViolinPolicy,
 describe:{groups,normalization:'None',imputation:'None',participantIds:'unique'},settings:request.settings,
 ...(request.mode==='describe'?{}:{result:{fingerprint:mockHex64(`mock-statistics:${dataLabel}:${JSON.stringify(request.settings??null)}`),dataFingerprint:request.mode==='check'||request.mode==='verify'?(request.dataFingerprint??dataFingerprint):dataFingerprint,computedAt:'2026-11-06T10:00:00Z',lipid:'PC(16:0/18:1)',grouping:'Group1',family:{m:1,features:1,comparisons:1,untestable:0},groups,
 rows:[{a:'Control',b:'Case',nA:5,nB:5,statistic:2.4,df:8,p:.03,pAdj:.03,effect:.6,note:''}],provenance:{method:request.settings?.test==='wilcoxon'?'Wilcoxon rank-sum test.':'Welch t-test.',transformation:'log10',normalization:'None',imputation:'None',participantIds:'unique',design:'Independent samples.'}}})};
}
