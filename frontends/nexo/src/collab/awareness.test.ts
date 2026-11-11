import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { createPresence, deviceOf, editingTag, nameTag } from './awareness';

describe('presence', () => {
  it('propagates selection and editing and removes a departed cursor', () => {
    const a = new Awareness(new Y.Doc()), b = new Awareness(new Y.Doc());
    const presence = createPresence(a);
    presence.selection(['card']); presence.editing({ nodeId: 'card', field: 'name' }); presence.cursor({ x: 2, y: 3 });
    applyAwarenessUpdate(b, encodeAwarenessUpdate(a, [a.clientID]), 'test');
    expect(b.getStates().get(a.clientID)).toMatchObject({ selection: ['card'], editing: { nodeId: 'card', field: 'name' }, cursor: { x: 2, y: 3 } });
    removeAwarenessStates(b, [a.clientID], 'test');
    expect(b.getStates().has(a.clientID)).toBe(false);
    presence.destroy(); a.destroy(); b.destroy();
  });
  it('throttles cursor updates and sends the latest position', () => {
    vi.useFakeTimers();
    const a = new Awareness(new Y.Doc()), presence = createPresence(a);
    presence.cursor({ x: 1, y: 1 }); presence.cursor({ x: 2, y: 2 });
    expect(a.getLocalState()?.cursor).toEqual({ x: 1, y: 1 });
    vi.advanceTimersByTime(50);
    expect(a.getLocalState()?.cursor).toEqual({ x: 2, y: 2 });
    presence.destroy(); a.destroy(); vi.useRealTimers();
  });
  it('publishes the device the page was opened on', () => {
    const a = new Awareness(new Y.Doc()), presence = createPresence(a, 'phone');
    expect(a.getLocalState()?.device).toBe('phone');
    presence.destroy(); a.destroy();
  });
  it('a narrow touch screen is a phone, anything else a desktop', () => {
    expect(deviceOf(390, true)).toBe('phone');
    expect(deviceOf(390, false)).toBe('desktop');
    expect(deviceOf(1440, true)).toBe('desktop');
  });
  it('a name tag says Lab for staff and Client for a client member', () => {
    expect(nameTag({ displayName: 'Tomás', kind: 'staff' })).toBe('Tomás · Lab');
    expect(nameTag({ displayName: 'Dr. Lee', kind: 'client' })).toBe('Dr. Lee · Client');
  });
  it('the editing chip names the person and the field they are in', () => {
    expect(editingTag({ displayName: 'Tomás', editing: { nodeId: 'n1', field: 'violin_lipid' } })).toBe('Tomás is editing · Violin lipid');
    expect(editingTag({ editing: { nodeId: 'n1', field: 'results_dashboard-color_by' } })).toBe('Collaborator is editing · Color by');
  });
});
