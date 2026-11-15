import './styles.css';
import { getCheckpoints, openSession } from './api';
import { mountCanvas } from './canvas';
const root = document.querySelector<HTMLElement>('#app')!;
async function open(id: string) {
  root.textContent = 'Opening checkpoint…';
  try { mountCanvas(root, await openSession(id)); }
  catch (e) { error(e); }
}
function error(e: unknown) {
  root.replaceChildren(); const p = document.createElement('p'); p.setAttribute('role', 'alert'); p.textContent = e instanceof Error ? e.message : String(e);
  const retry = document.createElement('button'); retry.textContent = 'Choose checkpoint'; retry.onclick = picker; root.append(p, retry);
}
async function picker() {
  root.textContent = 'Loading checkpoints…';
  try {
    const checkpoints = await getCheckpoints(); root.replaceChildren();
    const panel = document.createElement('section'); panel.className = 'picker'; const heading = document.createElement('h1'); heading.textContent = 'Nexo · Choose a checkpoint'; panel.append(heading);
    for (const checkpoint of checkpoints) { const button = document.createElement('button'); button.textContent = `${checkpoint.name} (${checkpoint.sizeBytes} bytes)`; button.onclick = () => { const url = new URL(location.href); url.searchParams.set('checkpoint', checkpoint.id); history.replaceState(null, '', url); void open(checkpoint.id); }; panel.append(button); }
    if (!checkpoints.length) panel.append('No checkpoints available.'); root.append(panel);
  } catch (e) { error(e); }
}
const checkpoint = new URLSearchParams(location.search).get('checkpoint');
if (checkpoint) void open(checkpoint); else void picker();
