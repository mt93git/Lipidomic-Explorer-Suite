import type { Awareness } from 'y-protocols/awareness';

// Phase 6 as cut (docs/integration/nexo-collab-plan.md): following adopts another person's awareness `view` (active tab
// and camera, published by provider.ts) on every change, until Stop, this person's own pan or zoom, or the leader
// leaving. A summon (stateless {type: 'summon', from}, relayed by the sidecar to the project) starts following `from`.
// Who I follow is my awareness `following` (a client id), so the presenter can count followers and avatars show it.
export type Camera = { x: number; y: number; scale: number };
export type View = { activeTab: string; camera: Camera; viewport?: { width: number; height: number } };

/** The camera that shows the leader's visible canvas rectangle in a viewport of `size`: centred, fitted. */
export function followCamera({ camera, viewport }: View, size: { width: number; height: number }): Camera {
  if (!viewport?.width || !viewport.height) return { x: camera.x, y: camera.y, scale: camera.scale };
  const scale = camera.scale * Math.min(size.width / viewport.width, size.height / viewport.height);
  const cx = (viewport.width / 2 - camera.x) / camera.scale, cy = (viewport.height / 2 - camera.y) / camera.scale;
  return { x: size.width / 2 - cx * scale, y: size.height / 2 - cy * scale, scale };
}

export function createFollow(awareness: Awareness, on: { size(): { width: number; height: number }; apply(view: { activeTab: string; camera: Camera }): void; changed(name: string | null): void }) {
  let target: number | null = null, seen = '', applied = '', applying = false;
  const state = () => (target === null ? undefined : awareness.getStates().get(target)) as { view?: View; displayName?: string } | undefined;
  function stop() { if (target === null) return; target = null; seen = applied = ''; awareness.setLocalStateField('following', null); on.changed(null); }
  function adopt() {
    const leader = state();
    if (!leader) { stop(); return; }
    const key = JSON.stringify(leader.view ?? null);
    if (!leader.view || key === seen) return;
    seen = key;
    const view = { activeTab: leader.view.activeTab, camera: followCamera(leader.view, on.size()) };
    applied = JSON.stringify(view); applying = true;
    try { on.apply(view); } finally { applying = false; }
  }
  const change = () => { if (target !== null) adopt(); };
  awareness.on('change', change);
  return {
    start(id: number) {
      if (id === awareness.clientID || !awareness.getStates().has(id)) return;
      target = id; seen = applied = ''; awareness.setLocalStateField('following', id); on.changed(state()?.displayName || 'Collaborator'); adopt();
    },
    stop,
    /** Every draw: a view other than the one adopted is this person's own pan, zoom or tab switch. */
    moved(activeTab: string, { x, y, scale }: Camera) {
      if (target !== null && !applying && applied && JSON.stringify({ activeTab, camera: { x, y, scale } }) !== applied) stop();
    },
    get target() { return target; },
    destroy() { awareness.off('change', change); },
  };
}

/** How many people (one per userId, whatever their tabs) publish that they follow me. */
export function followers(awareness: Awareness) {
  const people = new Set<unknown>();
  for (const [id, state] of awareness.getStates()) if (id !== awareness.clientID && state.following === awareness.clientID) people.add(state.userId ?? id);
  return people.size;
}

/** provider.ts hook (onStateless): a summon starts following its sender. */
export function summonHandler(start: (from: number) => void) {
  return (payload: string) => {
    let message: { type?: string; from?: unknown } | null;
    try { message = JSON.parse(payload); } catch { return; }
    if (message?.type === 'summon' && typeof message.from === 'number') start(message.from);
  };
}
