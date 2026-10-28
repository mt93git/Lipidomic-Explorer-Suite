#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
PILOT_ROOT="$PWD"
RESTORE_ROOT="${RESTORE_TARGET:-${PILOT_ROOT}-restore}"
[ ! -e "$RESTORE_ROOT" ] || { echo 'Restore directory already exists; refusing overwrite'; exit 1; }
mkdir -p "$RESTORE_ROOT"
# A unique authenticated backup, with its recovery key kept separately.
python3 backup.py > "$RESTORE_ROOT/backup-run.log"
BACKUP_DIR="$(tail -n 1 "$RESTORE_ROOT/backup-run.log")"
[ -f "$BACKUP_DIR/COMPLETE" ]
cp compose.yml bootstrap.sql setup_env.py renew_infrastructure_tokens.py verify.py permissions.sql "$RESTORE_ROOT/"
chmod 644 "$RESTORE_ROOT/bootstrap.sql"
mkdir "$RESTORE_ROOT/recovered"
python3 backup.py --decrypt "$BACKUP_DIR/pilot-backup.enc" --key "$PILOT_ROOT/backup-keys/$(basename "$BACKUP_DIR").key" --output "$RESTORE_ROOT/recovered/payload.tar"
tar -C "$RESTORE_ROOT/recovered" -xf "$RESTORE_ROOT/recovered/payload.tar"
python3 - "$RESTORE_ROOT" <<'PY'
from pathlib import Path
import sys
r=Path(sys.argv[1]);s=(r/'recovered/recovery.env').read_text().replace('REST_PORT=55431','REST_PORT=55441').replace('STORAGE_PORT=55432','STORAGE_PORT=55442');s=s.rstrip()+'\nAUTH_PORT=55443\n';(r/'.env').write_text(s);(r/'.env').chmod(0o600)
PY
cd "$RESTORE_ROOT"
python3 renew_infrastructure_tokens.py
mkdir data
tar -C data -xzf recovered/objects.tar.gz
docker compose -p lipidomic-pilot-restore -f compose.yml up -d db
for i in $(seq 1 30); do
 if docker compose -p lipidomic-pilot-restore -f compose.yml exec -T db pg_isready -U postgres >/dev/null; then break; fi
 sleep 2
done
docker compose -p lipidomic-pilot-restore -f compose.yml exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists --exit-on-error < recovered/database.dump
docker compose -p lipidomic-pilot-restore -f compose.yml exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/migrations/99-pilot.sql
docker compose -p lipidomic-pilot-restore -f compose.yml exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < permissions.sql
docker compose -p lipidomic-pilot-restore -f compose.yml up -d --wait
for i in $(seq 1 30); do
 if curl -fsS http://127.0.0.1:55442/status >/dev/null; then break; fi
 sleep 2
done
python3 verify.py --read-only --output restored-evidence.json
# Restore remains stopped, not removed, for inspection. Never stop unrelated services.
docker compose -p lipidomic-pilot-restore -f compose.yml stop
cp restored-evidence.json "$PILOT_ROOT/"
echo 'Encrypted backup restored and HTTP/hash checks passed.'
