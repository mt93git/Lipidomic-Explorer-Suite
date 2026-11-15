import type { Awareness } from 'y-protocols/awareness';
import { createPresence, deviceOf, editingTag, inkOn, nameTag, others } from '../collab/awareness';
import './presence.css';

export function mountPresence(awareness: Awareness, viewport: HTMLElement, world: HTMLElement, camera: { x: number; y: number; scale: number }, cards: () => { el: HTMLElement; node: { id: string } }[]) {
  const presence = createPresence(awareness, deviceOf(innerWidth, matchMedia('(pointer: coarse)').matches)), layer = document.createElement('div');
  layer.className = 'presence-layer'; world.append(layer);
  function render() {
    const people = others(awareness); layer.replaceChildren();
    // Tags keep their size on screen at any zoom (presence.css counter-scales them by this).
    world.style.setProperty('--presence-zoom', String(1 / camera.scale));
    for (const card of cards()) {
      const selected = people.find(p => p.selection?.includes(card.node.id));
      card.el.dataset.remoteSelected = String(!!selected);
      card.el.style.setProperty('--presence-colour', selected?.colour || '#7256b5'); card.el.style.setProperty('--presence-ink', inkOn(selected?.colour || '#7256b5'));
      card.el.querySelector('.presence-name')?.remove();
      if (selected) { const name = document.createElement('span'); name.className = 'presence-name'; name.textContent = selected.displayName || 'Collaborator'; card.el.append(name); }
      card.el.querySelector('.presence-editing')?.remove();
      const editor = people.find(p => p.editing?.nodeId === card.node.id);
      if (editor) { const chip = document.createElement('span'); chip.className = 'presence-editing'; chip.textContent = editingTag(editor); card.el.querySelector('header')?.append(chip); }
    }
    for (const person of people) if (person.cursor && Number.isFinite(person.cursor.x) && Number.isFinite(person.cursor.y)) {
      const cursor = document.createElement('span'); cursor.className = 'presence-cursor';
      cursor.style.left = `${person.cursor.x}px`; cursor.style.top = `${person.cursor.y}px`; cursor.style.setProperty('--presence-colour', person.colour || '#7256b5'); cursor.style.setProperty('--presence-ink', inkOn(person.colour || '#7256b5'));
      // Prototype scene 1: a pointer in the person's colour and a tag "Tomás · Lab".
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), tag = document.createElement('span');
      arrow.setAttribute('viewBox', '0 0 20 20'); arrow.setAttribute('aria-hidden', 'true'); arrow.innerHTML = '<path d="M3 2l13 7-5.5 1.5L8 16z"/>';
      tag.className = 'presence-tag'; tag.textContent = nameTag(person);
      cursor.append(arrow, tag); layer.append(cursor);
    }
  }
  awareness.on('change', render);
  viewport.addEventListener('pointermove', e => { const r = viewport.getBoundingClientRect(); presence.cursor({ x: (e.clientX - r.left - camera.x) / camera.scale, y: (e.clientY - r.top - camera.y) / camera.scale }); });
  viewport.addEventListener('pointerleave', () => presence.cursor(null));
  render();
  return { render, selection: presence.selection };
}
