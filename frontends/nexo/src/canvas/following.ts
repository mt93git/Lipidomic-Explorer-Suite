import type { Awareness } from 'y-protocols/awareness';
import { createFollow, followers, type Camera } from '../collab/follow';
import { notify } from '../ui/model';

// Phase 6 as cut: the "Following <name> · Stop following" bar over the canvas. An avatar click (event 'nexo-follow') or a
// summon ('nexo-summon'; detail = the leader's awareness client id) starts following; `adopt` shows the leader's tab and
// camera here. Stop following, Esc and my own pan or zoom stop it with a toast; a summon says who brought everyone and
// offers Stay here. Being followed, the bar says how many people follow me.
export function mountFollowing(awareness: Awareness, stage: HTMLElement, on: { size(): { width: number; height: number }; adopt(view: { activeTab: string; camera: Camera }): void }) {
  const bar = document.createElement('div'), label = document.createElement('span'), stop = document.createElement('button');
  bar.className = 'follow-bar'; bar.setAttribute('role', 'status'); bar.hidden = true;
  bar.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:20;padding:4px 10px;border-radius:14px;background:#7256b5;color:#fff;font:500 13px system-ui';
  stop.type = 'button'; stop.textContent = 'Stop following';
  stop.style.cssText = 'margin-left:6px;border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer;font:inherit';
  stage.append(bar);
  let leader = '';
  function show() {
    const count = followers(awareness);
    bar.hidden = !leader && !count;
    label.textContent = leader ? `Following ${leader}` : count === 1 ? '1 person is following you' : `${count} people are following you`;
    if (leader) bar.replaceChildren(label, ' · ', stop); else bar.replaceChildren(label);
  }
  const follow = createFollow(awareness, { size: on.size, apply: on.adopt,
    changed: name => { if (!name && leader) notify(`You stopped following ${leader}`); leader = name ?? ''; show(); } });
  awareness.on('change', show);
  stop.onclick = () => follow.stop();
  addEventListener('nexo-follow', e => follow.start((e as CustomEvent<number>).detail));
  addEventListener('nexo-summon', e => {
    const from = (e as CustomEvent<number>).detail; follow.start(from);
    if (follow.target === from) notify(`${leader} brought everyone here`, false, () => follow.stop(), 'Stay here');
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && follow.target !== null) follow.stop(); });
  return follow;
}
