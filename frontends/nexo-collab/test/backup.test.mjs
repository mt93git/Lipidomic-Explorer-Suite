import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const script = new URL('../scripts/backup.mjs', import.meta.url).pathname;
const run = (...args) => execFileSync(process.execPath, [script, ...args]);

test('backup restores an open WAL database and store bytes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'collab-backup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = new DatabaseSync(join(dir, 'live.sqlite'));
  t.after(() => db.close());
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE items (value TEXT); INSERT INTO items VALUES (\'synthetic\')');
  mkdirSync(join(dir, 'store', 'nested'), { recursive: true });
  const bytes = Buffer.from([0, 1, 127, 255]);
  writeFileSync(join(dir, 'store', 'nested', 'blob'), bytes);
  run('backup', join(dir, 'live.sqlite'), join(dir, 'store'), join(dir, 'backups'));
  const backup = join(dir, 'backups', readdirSync(join(dir, 'backups'))[0]);
  run('restore', backup, join(dir, 'scratch'));
  const restored = new DatabaseSync(join(dir, 'scratch', 'collab.sqlite'));
  assert.equal(restored.prepare('SELECT value FROM items').get().value, 'synthetic');
  restored.close();
  assert.deepEqual(readFileSync(join(dir, 'scratch', 'store', 'nested', 'blob')), bytes);
});

test('prune keeps the newest 14 backups', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'collab-prune-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (let i = 0; i < 16; i++) mkdirSync(join(dir, `2026-01-${String(i + 1).padStart(2, '0')}T00-00-00.000Z`));
  run('prune', dir, '14');
  const remaining = readdirSync(dir).sort();
  assert.equal(remaining.length, 14);
  assert.equal(remaining[0], '2026-01-03T00-00-00.000Z');
});
