// SQLite through node:sqlite (Node 22.13+, no flag). Migrations are migrations/NNN_*.sql, applied in order at open,
// all pending ones inside one transaction; PRAGMA user_version is the number of the last one applied.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultMigrations = fileURLToPath(new URL('../migrations/', import.meta.url));

/** Opens (or creates) the database and applies pending migrations; throws, applying none, if one fails. */
export function openDatabase(path, migrationsDir = defaultMigrations) {
  const db = new DatabaseSync(path);
  try {
    const files = readdirSync(migrationsDir).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
    const applied = db.prepare('PRAGMA user_version').get().user_version;
    const pending = files.filter(f => Number(f.slice(0, 3)) > applied);
    if (pending.length) {
      db.exec('BEGIN');
      try {
        for (const f of pending) db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
        db.exec(`PRAGMA user_version = ${Number(pending.at(-1).slice(0, 3))}`);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
    return { db, migrations: db.prepare('PRAGMA user_version').get().user_version };
  } catch (e) {
    db.close();
    throw e;
  }
}
