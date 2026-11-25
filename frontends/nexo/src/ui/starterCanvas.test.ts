import { describe, expect, it, vi } from 'vitest';
import catalog from '../mock/catalog.json';
import type { CatalogEntry } from '../api/types';
import { validateNexo } from '../state/nexo';
import { fromDoc, toDoc } from '../collab/schema';
import { validate } from '../state/tabs';
import { newCardSize } from '../catalog';
import { openStarter, seedStarter, starterOpen, starterSources } from './starterCanvas';

const outputs = catalog.outputs as unknown as CatalogEntry[];
const empty = () => ({ canvas: { nodes: [] as { id: string }[] }, nexo: null as ReturnType<typeof validateNexo> | null });
const fakeHandle = () => ({ addCard: vi.fn(async (_source: string, _signal?: AbortSignal, _position?: { x: number; y: number }) => {}) });
// What a reload reads back: the saved Nexo member goes through JSON and the client's validation.
const reload = (nexo: unknown) => validateNexo(JSON.parse(JSON.stringify(nexo)));

describe('the starter canvas (PCA, Composition overview, PCA score analysis)', () => {
  it('names the three dashboard cards in order', () => {
    expect(starterSources).toEqual(['results_dashboard-plot_pca', 'results_dashboard-plot_comp', 'results_dashboard-plot_pcascore']);
  });

  it('an empty canvas after Data and Review gets exactly the three cards, side by side at their default sizes, once', async () => {
    const session = empty(), handle = fakeHandle();
    expect(openStarter(session, 'alone', false)).toBe(true);
    await seedStarter(handle, async () => ({ version: 1, outputs }));
    expect(handle.addCard.mock.calls.map(c => c[0])).toEqual([...starterSources]);
    const spots = handle.addCard.mock.calls.map(c => c[2]!);
    expect(new Set(spots.map(p => p.y)).size).toBe(1);
    const sizes = starterSources.map(id => newCardSize(outputs.find(e => e.id === id)!));
    for (let i = 1; i < spots.length; i++) expect(spots[i].x).toBe(spots[i - 1].x + sizes[i - 1].width + 40);
    // The same board, opened again on this page: never a second set.
    expect(openStarter(session, 'alone', false)).toBe(false);
  });

  it('adds one card at a time, in order', async () => {
    const order: string[] = []; let busy = false;
    const handle = { addCard: vi.fn(async (source: string) => { expect(busy).toBe(false); busy = true; await Promise.resolve(); order.push(source); busy = false; }) };
    await seedStarter(handle, async () => ({ version: 1, outputs }));
    expect(order).toEqual([...starterSources]);
  });

  it('a canvas that already has cards gets nothing', () => {
    const session = { canvas: { nodes: [{ id: 'results_dashboard-plot_violin' }] }, nexo: null };
    expect(openStarter(session, 'alone', false)).toBe(false);
    expect(session.nexo).toBeNull();
  });

  it('a seeded canvas the user emptied is not seeded again after a reload', () => {
    const first = empty();
    expect(openStarter(first, 'alone', false)).toBe(true);
    const again = { canvas: { nodes: [] }, nexo: reload(first.nexo) };
    expect(openStarter(again, 'alone', false)).toBe(false);
  });

  it('before Data and Review are done (a checkpoint, a re-prepared board) nothing is added', () => {
    expect(starterOpen({ kind: 'checkpoint', collaborating: false, created: false })).toBe('none');
    expect(starterOpen({ kind: 'dataset', collaborating: false, created: false, reprepared: true })).toBe('none');
    expect(openStarter(empty(), 'none', false)).toBe(false);
  });

  it('a view-only page never seeds', () => {
    expect(openStarter(empty(), 'alone', true)).toBe(false);
  });

  it('a shared board is seeded once: by the page that created the project, never by a joiner', async () => {
    expect(starterOpen({ kind: 'dataset', collaborating: false, created: false })).toBe('alone');
    const creator = starterOpen({ kind: 'dataset', collaborating: true, created: true });
    const joiner = starterOpen({ kind: 'dataset', collaborating: true, created: false });
    expect([creator, joiner]).toEqual(['created', 'joined']);
    const handle = fakeHandle(), boards = [empty(), empty()];
    for (const [i, open] of [creator, joiner].entries()) if (openStarter(boards[i], open, false)) await seedStarter(handle, async () => ({ version: 1, outputs }));
    expect(handle.addCard).toHaveBeenCalledTimes(3);
  });

  it('the shared document keeps the seeded mark', () => {
    const board = empty(); openStarter(board, 'created', false);
    const doc = toDoc({ version: '1', libraryHidden: false, nodes: [], document: null }, validate(undefined, []), board.nexo!);
    expect(fromDoc(doc).nexo.starter).toBe(true);
  });
});

describe('the starter canvas when a card fails', () => {
  it('still adds the other cards, shows the row, and reports the failure', async () => {
    const handle = { addCard: vi.fn(async (source: string) => { if (source === 'results_dashboard-plot_comp') throw new Error('synthetic failure'); }), fit: vi.fn() };
    await expect(seedStarter(handle, async () => ({ version: 1, outputs }))).rejects.toThrow('synthetic failure');
    expect(handle.addCard.mock.calls.map(c => c[0])).toEqual([...starterSources]);
    expect(handle.fit).toHaveBeenCalledTimes(1);
  });
});

describe('the starter canvas on a shared board (an uploaded workbook, a released dataset)', () => {
  it('a shared board is seeded only once it is joined: no card is sent before the board is there', async () => {
    let join!: (value: { cards: number }) => void;
    const handle = { ...fakeHandle(), ready: vi.fn(() => new Promise<{ cards: number }>(resolve => { join = resolve; })) };
    const seeding = seedStarter(handle, async () => ({ version: 1, outputs }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(handle.addCard).not.toHaveBeenCalled();
    join({ cards: 0 }); await seeding;
    expect(handle.addCard.mock.calls.map(c => c[0])).toEqual([...starterSources]);
  });

  it('a joined board that already has cards, or one that could not be joined, gets nothing', async () => {
    for (const opened of [{ cards: 2 }, undefined]) {
      const handle = { ...fakeHandle(), ready: async () => opened };
      await seedStarter(handle, async () => ({ version: 1, outputs }));
      expect(handle.addCard).not.toHaveBeenCalled();
    }
  });

  it('a shared board is seeded only once it is joined: no card is sent before the board is there', async () => {
    let join!: (value: { cards: number }) => void;
    const handle = { ...fakeHandle(), ready: vi.fn(() => new Promise<{ cards: number }>(resolve => { join = resolve; })) };
    const seeding = seedStarter(handle, async () => ({ version: 1, outputs }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(handle.addCard).not.toHaveBeenCalled();
    join({ cards: 0 }); await seeding;
    expect(handle.addCard.mock.calls.map(c => c[0])).toEqual([...starterSources]);
  });

  it('a joined board that already has cards, or one that could not be joined, gets nothing', async () => {
    for (const opened of [{ cards: 2 }, undefined]) {
      const handle = { ...fakeHandle(), ready: async () => opened };
      await seedStarter(handle, async () => ({ version: 1, outputs }));
      expect(handle.addCard).not.toHaveBeenCalled();
    }
  });
});
