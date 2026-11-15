import { DatabaseSync, backup } from 'node:sqlite';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [command, ...args] = process.argv.slice(2);
if (command === 'backup' && args.length === 3) {
  const [sqlite, store, dest] = args;
  mkdirSync(dest, { recursive: true });
  const folder = join(dest, new Date().toISOString().replaceAll(':', '-'));
  mkdirSync(folder);
  const db = new DatabaseSync(sqlite, { readOnly: true });
  try {
    await backup(db, join(folder, 'collab.sqlite'));
    cpSync(store, join(folder, 'store'), { recursive: true });
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  } finally {
    db.close();
  }
} else if (command === 'restore' && args.length === 2) {
  const [folder, scratch] = args;
  mkdirSync(scratch, { recursive: true });
  cpSync(join(folder, 'collab.sqlite'), join(scratch, 'collab.sqlite'), { errorOnExist: true, force: false });
  cpSync(join(folder, 'store'), join(scratch, 'store'), { recursive: true, errorOnExist: true, force: false });
} else if (command === 'prune' && args.length === 2 && /^\d+$/.test(args[1])) {
  const [dest, count] = args;
  const backups = readdirSync(dest, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z$/.test(entry.name))
    .map((entry) => entry.name).sort().reverse();
  for (const name of backups.slice(Number(count))) rmSync(join(dest, name), { recursive: true });
} else {
  throw new Error('Usage: backup.mjs backup <sqlite-file> <store-dir> <dest-dir> | restore <backup-folder> <scratch-dir> | prune <dest-dir> <count>');
}
