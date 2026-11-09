/** `dpr` as the API (cards.R): a PNG of width*dpr x height*dpr pixels showing the same picture. */
export function mockPng(label: string, width: number, height: number, fill = '#176b73', dpr = 1): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr);
  ctx.fillStyle = '#f3f8fa'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fill;
  for (let i = 0; i < 8; i++) ctx.fillRect(30 + i * (width - 60) / 8, height * .35 + i % 3 * 20, (width - 80) / 10, height * .3);
  ctx.font = '16px sans-serif'; ctx.fillStyle = '#253b47'; ctx.fillText(label, 20, 35, width - 40);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG generation failed')), 'image/png'));
}

/** Static Phase 1 representation of JSON network/HTML responses. */
export function jsonImage(label: string, width: number, height: number, figure: unknown): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height); ctx.fillStyle = '#253b47'; ctx.font = '16px sans-serif'; ctx.fillText(label,20,30,width-40);
  const value = figure as {nodes?: {id: string | number; label?: string}[]; edges?: {from: string | number; to: string | number}[]; data?: {requiresConfirmation?: boolean}; html?: string};
  if (Array.isArray(value?.nodes)) {
    const points = new Map(value.nodes.map((node,i) => [node.id, {x:width/2 + Math.cos(i*2*Math.PI/value.nodes!.length)*(width*.3), y:height/2 + Math.sin(i*2*Math.PI/value.nodes!.length)*(height*.25)}]));
    ctx.strokeStyle = '#9ab1bb';
    for (const edge of value.edges ?? []) { const a=points.get(edge.from), b=points.get(edge.to); if (a && b) {ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();} }
    for (const node of value.nodes) { const point=points.get(node.id)!; ctx.fillStyle='#176b73';ctx.beginPath();ctx.arc(point.x,point.y,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#253b47';ctx.fillText(node.label ?? String(node.id),point.x+12,point.y+5,width*.4); }
  } else {
    // Render HTML as plain text, never execute server-supplied markup.
    const parsed = new DOMParser().parseFromString(value?.html ?? '', 'text/html');
    const text = value?.data?.requiresConfirmation ? 'Requires confirmation' : parsed.body.textContent?.trim() || 'Preview unavailable';
    ctx.fillText(text,20,70,width-40);
  }
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image generation failed')), 'image/png'));
}
