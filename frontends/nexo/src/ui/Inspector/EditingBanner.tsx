import { useEffect, useState } from 'react';
import { getAwareness } from '../../collab/provider';
import { others, type Person } from '../../collab/awareness';
// Prototype scene 2 (soft lock): someone else's awareness `editing` (SchemaForm focus) names the selected card.
// Nothing is locked: changes still apply in the project's one order and the later one wins.
export const editorOf = (people: Person[], nodeId: string) => people.find(p => p.editing?.nodeId === nodeId);
export function Banner({ person }: { person: Person }) {
  const kind = person.kind === 'staff' ? 'Lab' : person.kind === 'client' ? 'Client' : null;
  return <div className="editing-banner" role="status" style={{ margin: '10px 16px', padding: '8px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${person.colour || '#7256b5'}`, background: '#fff8f5' }}>
    <b>{person.displayName || 'Collaborator'} is editing this card</b>{kind && <span className="editing-kind"> · {kind}</span>}
    <div>You can still change it; changes are applied in one order, the later one wins and both of you see the result.</div>
  </div>;
}
export function EditingBanner({ nodeId }: { nodeId: string }) {
  const [person, setPerson] = useState<Person>();
  useEffect(() => {
    let cleanup = () => {};
    const connect = () => { cleanup(); const awareness = getAwareness(); if (!awareness) return; const update = () => setPerson(editorOf(others(awareness), nodeId)); awareness.on('change', update); update(); cleanup = () => awareness.off('change', update); };
    window.addEventListener('nexo-awareness', connect); connect();
    return () => { window.removeEventListener('nexo-awareness', connect); cleanup(); };
  }, [nodeId]);
  return person ? <Banner person={person}/> : null;
}
