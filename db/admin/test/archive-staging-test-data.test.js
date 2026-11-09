// The one-off staging cleanup (archive-staging-test-data.mjs): its target guard and what it would archive.
// Pure functions only; the script itself is never run against a stack from here. Synthetic data only.
import { describe, expect, test } from 'vitest';
import { assertStagingTarget, plan } from './archive-staging-test-data.mjs';

describe('target guard', () => {
  const staging = 'https://admin-staging.example.test';
  test('runs only against the staging gateway named in env', () => {
    expect(() => assertStagingTarget(staging, staging)).not.toThrow();
    expect(() => assertStagingTarget(`${staging}/`, staging)).not.toThrow();
  });
  test('refuses another origin, a missing staging gateway and a missing target', () => {
    expect(() => assertStagingTarget('https://admin.example.test', staging)).toThrow(/not the staging gateway/);
    expect(() => assertStagingTarget(`${staging}.evil.test`, staging)).toThrow(/not the staging gateway/);
    expect(() => assertStagingTarget(staging, '')).toThrow(/ADMIN_STAGING_GATEWAY_URL/);
    expect(() => assertStagingTarget(staging, undefined)).toThrow(/ADMIN_STAGING_GATEWAY_URL/);
    expect(() => assertStagingTarget('', staging)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
  test('never prints credentials embedded in a URL', () => {
    expect(() => assertStagingTarget('https://user:secret@admin.example.test', staging)).toThrow(/^(?!.*secret).*$/s);
  });
});

describe('plan', () => {
  const clients = [
    { id: 'c-run-a', name: 'itmw1a2b3c Client A' }, { id: 'c-run-b', name: 'itmw1a2b3c Client B' },
    { id: 'c-live-a', name: 'E2E Live Client A' }, { id: 'c-live-b', name: 'E2E Live Client B' },
    { id: 'c-real', name: 'Cedar Lab' }, { id: 'c-near', name: 'itmw1a2b3c Client C' }, { id: 'c-pilot', name: 'Pilot Simulation Client (synthetic)' },
  ];
  const orders = [
    { id: 'o1', code: 'ORD101', title: 'itmw1a2b3c order A', client_id: 'c-run-a' },
    { id: 'o2', code: 'ORD102', title: 'anything', client_id: 'c-run-b' },
    { id: 'o3', code: 'ORD103', title: 'E2E live 2026-11-09 10:15', client_id: 'c-live-a' },
    { id: 'o4', code: 'ORD104', title: 'E2E live own 2026-11-09 10:15', client_id: 'c-live-b' },
    { id: 'o5', code: 'ORD105', title: 'Lipid panel', client_id: 'c-live-a' }, // not a seeded title: kept
    { id: 'o6', code: 'ORD106', title: 'E2E live 2026-11-09 10:15', client_id: 'c-real' }, // a real client: kept
    { id: 'o7', code: 'ORD107', title: 'Pilot order', client_id: 'c-pilot' },
  ];
  const datasets = [
    { id: 'd1', order_id: 'o1', status: 'released', version: 1 },
    { id: 'd2', order_id: 'o1', status: 'built', version: 2 },
    { id: 'd3', order_id: 'o2', status: 'built', version: 1 },
    { id: 'd4', order_id: 'o6', status: 'released', version: 1 },
  ];
  test('takes the run clients and their orders, and only the seeded orders of the fixed E2E Live clients', () => {
    const p = plan({ clients, orders, datasets });
    expect(p.archiveClients.map(c => c.id)).toEqual(['c-run-a', 'c-run-b']);
    expect(p.archiveOrders.map(o => o.code)).toEqual(['ORD101', 'ORD102', 'ORD103', 'ORD104']);
  });
  test('withdraws released versions (0008: never archived through the columns) and archives the others', () => {
    const p = plan({ clients, orders, datasets });
    expect(p.withdraw.map(d => d.id)).toEqual(['d1']);
    expect(p.archiveDatasets.map(d => d.id)).toEqual(['d2', 'd3']);
  });
  test('nothing to do without matching names', () => {
    expect(plan({ clients: [{ id: 'c', name: 'Cedar Lab' }], orders: [{ id: 'o', code: 'ORD1', title: 'x', client_id: 'c' }], datasets: [] }))
      .toEqual({ withdraw: [], archiveDatasets: [], archiveOrders: [], archiveClients: [] });
  });
});
