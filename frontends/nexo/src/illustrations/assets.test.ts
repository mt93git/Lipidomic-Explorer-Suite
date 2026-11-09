import {expect,it} from 'vitest';
import {list,svg} from './assets';
const ids='cohort-donor whole-blood serum-vial pipette microplate extraction-tubes centrifuge cold-storage lc-ms lipid-bilayer neutrophil macrophage workflow-arrow workflow-overview lipid-class-taxonomy study-workflow-scd donor-person cohort-label connector-arrow lipid-class-chip sample-vial-component'.split(' ');
it('ports the server allowlist and safe accent SVGs',()=>{expect(list.map(a=>a.id).sort()).toEqual(ids.sort());for(const a of list){const s=svg(a.id,'#abcdef','A < B');expect(s).toMatch(/^<svg /);expect(s).toContain('</svg>');expect(s).not.toMatch(/<script|foreignObject|(?:href=)["']https?:/i);if(!['lipid-class-taxonomy','study-workflow-scd'].includes(a.id))expect(s).toContain('#abcdef');}});

it('every asset parses as XML with an SVG root',async()=>{
 const moduleName='node:child_process';
 const {execFileSync}=await import(moduleName) as {execFileSync:(file:string,args:string[],options:{input:string;encoding:string})=>string};
 const documents=list.map(a=>svg(a.id,'#abcdef','A < B & C'));
 const result=execFileSync('python3',['-c',"import json,sys,xml.etree.ElementTree as E; docs=json.load(sys.stdin); assert all(E.fromstring(s).tag == '{http://www.w3.org/2000/svg}svg' for s in docs); print(len(docs))"],{input:JSON.stringify(documents),encoding:'utf8'});
 expect(result.trim()).toBe('21');
});
it('rejects unknown assets and injected accents; escapes custom labels',()=>{
 expect(()=>svg('unknown')).toThrow();expect(()=>svg('lc-ms','red" onload="alert(1)')).toThrow();
 expect(svg('cohort-label','#abcdef','<script>&')).toContain('&lt;script&gt;&amp;');
});
it('matches Team artwork, titles and groups verbatim, including hidden restore assets',async()=>{
 const fsName='node:fs',vmName='node:vm';
 const fs=await import(fsName),vm=await import(vmName);
 const context={window:{}} as {window:{TeamIllustrations?:{list:typeof list;svg:typeof svg}}};
 for(const file of ['canvas_assets.js','illustrations.js'])vm.runInNewContext(fs.readFileSync(new URL(`../../../../www/team/js/${file}`,import.meta.url),'utf8'),context);
 expect(list).toEqual(context.window.TeamIllustrations!.list);
 for(const a of list)expect(svg(a.id,'#abcdef','Safe & label')).toBe(context.window.TeamIllustrations!.svg(a.id,'#abcdef','Safe & label'));
});
