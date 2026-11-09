// Minimal ZIP codec for mock checkpoints (stored output; stored/deflated input).
export function checkpointZip(state:unknown,label="",nexo?:import('../state/nexo').Nexo,team?:unknown):Blob {
 const entries:[string,unknown][]=[['team-canvas-v1.json',state]];
 if(nexo)entries.push(['nexo-canvas-v1.json',nexo]);
 // Pilot F1: Team's own session state member, here only its colour settings (state.json color_shape), when set.
 if(team)entries.push(['state.json',team]);
 const locals:Uint8Array<ArrayBuffer>[]=[],centrals:Uint8Array<ArrayBuffer>[]=[];let offset=0;
 for(const [filename,value] of entries){
 const name=new TextEncoder().encode(filename),data=new TextEncoder().encode(JSON.stringify(value));
 let crc=0xffffffff;for(const byte of data){crc^=byte;for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
 const local=new Uint8Array(30+name.length+data.length),l=new DataView(local.buffer);
 l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);local.set(name,30);local.set(data,30+name.length);
 const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);
 c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
 locals.push(local);centrals.push(central);offset+=local.length;
 }
 const comment=new TextEncoder().encode(label),end=new Uint8Array(22+comment.length),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centrals.reduce((n,c)=>n+c.length,0),true);e.setUint32(16,offset,true);e.setUint16(20,comment.length,true);end.set(comment,22);
 return new Blob([...locals,...centrals,end],{type:'application/zip'});
}
export async function readCheckpointZip(file:File,member='team-canvas-v1.json'):Promise<unknown> {
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer),decoder=new TextDecoder();
 for(let at=0;at+46<=bytes.length;at++){
  if(view.getUint32(at,true)!==0x02014b50)continue;
  const length=view.getUint16(at+28,true),name=decoder.decode(bytes.slice(at+46,at+46+length));
  if(name.split('/').pop()!==member)continue;
  const method=view.getUint16(at+10,true),size=view.getUint32(at+20,true),offset=view.getUint32(at+42,true);
  const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true),data=bytes.slice(start,start+size);
  if(member==='nexo-canvas-v1.json'&&view.getUint32(at+24,true)>2*1024**2)return null;
 try {
 if(method===0)return JSON.parse(decoder.decode(data));
  if(method===8){const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return JSON.parse(await new Response(stream).text());}
  throw Error('Unsupported ZIP compression');
 }catch(error){if(member==='nexo-canvas-v1.json')return null;throw error;}
 }
 if(member==='nexo-canvas-v1.json')return null;
 throw Error('ZIP has no team-canvas-v1.json');
}
