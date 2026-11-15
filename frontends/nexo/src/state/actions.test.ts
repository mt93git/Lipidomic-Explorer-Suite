import {describe,expect,it,vi} from 'vitest';
import {actionReplays,onReplayFailures,recordAction,recordedActions,replayFailures,replayRecorded,withPressed} from './actions';
import {validateNexo,type Nexo} from './nexo';
import type {Node} from '../api/types';
const doc=(nexo:Nexo)=>({nexo}) as never;
describe('recorded module presses (chart audit b07 F3)',()=>{
 it('keeps first-press order, drops repeats, download buttons and malformed ids, bounded to 20',()=>{
  expect(recordedActions(['runAnalysis','show_stats_detail','runAnalysis','downloadPlot','download_summary','1bad','x y',7])).toEqual(['runAnalysis','show_stats_detail']);
  expect(recordedActions(Array.from({length:30},(_,i)=>`a${i}`))).toHaveLength(20);
  expect(withPressed(['runAnalysis'],'runAnalysis')).toEqual(['runAnalysis']);
  expect(withPressed(['runAnalysis'],'downloadPdf')).toEqual(['runAnalysis']);
  expect(withPressed(undefined,'runAnalysis')).toEqual(['runAnalysis']);
 });
 it('is stored in Nexo\'s member node, beside style and inputs, and survives validation (save/reopen)',()=>{
  const start:Nexo={version:1,nodes:{n1:{style:{titleWeight:'bold'}}}};
  const after=recordAction('n1','runAnalysis').apply(doc(start)) as unknown as {nexo:Nexo};
  const twice=recordAction('n1','show_stats_detail').apply(after as never) as unknown as {nexo:Nexo};
  expect(twice.nexo.nodes.n1).toEqual({style:{titleWeight:'bold'},actions:['runAnalysis','show_stats_detail']});
  expect(validateNexo(JSON.parse(JSON.stringify(twice.nexo))).nodes.n1.actions).toEqual(['runAnalysis','show_stats_detail']);
  expect(validateNexo({version:1,nodes:{n2:{actions:['downloadPlot']}}}).nodes.n2).toBeUndefined();
 });
 it('lists the replays per Team card in canvas order; cards without presses or instance are skipped',()=>{
  const nodes=[{id:'a',kind:'plot',instance:{instanceId:'tcinstance_a',source:'s'}},{id:'b',kind:'plot',instance:{instanceId:'tcinstance_b',source:'s'}},{id:'c',kind:'plot'}] as unknown as Node[];
  const nexo:Nexo={version:1,nodes:{b:{actions:['runAnalysis','second']},a:{style:{}},c:{actions:['runAnalysis']}}};
  expect(actionReplays(nodes,nexo)).toEqual([{nodeId:'b',instanceId:'tcinstance_b',actions:['runAnalysis','second']}]);
 });
 it('replays the recorded actions in order in one request and records failures for the Inspector',async()=>{
  const replay=vi.fn(async (actions:string[])=>({replayed:actions.slice(0,1),failed:actions.slice(1)}));
  const seen:string[]=[];onReplayFailures(id=>seen.push(id));
  expect(await replayRecorded('n1',['runAnalysis','second','downloadPlot'],replay)).toEqual(['second']);
  expect(replay).toHaveBeenCalledTimes(1);expect(replay).toHaveBeenCalledWith(['runAnalysis','second']);
  expect(replayFailures('n1')).toEqual(['second']);expect(seen).toContain('n1');
  await replayRecorded('n1',['runAnalysis'],async()=>({failed:[]}));
  expect(replayFailures('n1')).toEqual([]);
  expect(await replayRecorded('n2',[],replay)).toEqual([]);expect(replay).toHaveBeenCalledTimes(1);
 });
 it('a request that fails marks every recorded action as to be pressed again',async()=>{
  expect(await replayRecorded('n3',['runAnalysis'],async()=>{throw new Error('500');})).toEqual(['runAnalysis']);
  expect(replayFailures('n3')).toEqual(['runAnalysis']);
 });
});
