#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
PILOT_ROOT="$PWD"
RESTORE_ROOT="${RESTORE_TARGET:-${PILOT_ROOT}-restore}"
[ ! -e "$RESTORE_ROOT" ] || { echo 'Restore directory already exists; refusing overwrite'; exit 1; }
mkdir -p backup "$RESTORE_ROOT"
# Quiesce this pilot only: object files and catalog share a consistent backup boundary.
docker compose -p lipidomic-pilot -f compose.yml stop rest storage
trap 'docker compose -p lipidomic-pilot -f compose.yml start rest storage >/dev/null' EXIT
docker compose -p lipidomic-pilot -f compose.yml exec -T db pg_dump -U supabase_admin -d postgres -Fc > backup/database.dump
tar -C data -czf backup/objects.tar.gz objects
cp .env backup/recovery.env
openssl rand -hex 32 > backup/recovery.key
tar -C backup -cf - database.dump objects.tar.gz recovery.env | openssl enc -aes-256-cbc -salt -pbkdf2 -pass file:backup/recovery.key -out backup/pilot-backup.enc
sha256sum backup/pilot-backup.enc > backup/encrypted-sha256.txt
docker compose -p lipidomic-pilot -f compose.yml start rest storage
trap - EXIT
cp compose.yml bootstrap.sql setup_env.py verify.py permissions.sql "$RESTORE_ROOT/"
chmod 644 "$RESTORE_ROOT/bootstrap.sql"
mkdir "$RESTORE_ROOT/recovered"
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:backup/recovery.key -in backup/pilot-backup.enc | tar -C "$RESTORE_ROOT/recovered" -xf -
python3 - "$RESTORE_ROOT" <<'PY'
from pathlib import Path
import sys
r=Path(sys.argv[1]);s=(r/'recovered/recovery.env').read_text().replace('REST_PORT=55431','REST_PORT=55441').replace('STORAGE_PORT=55432','STORAGE_PORT=55442');(r/'.env').write_text(s);(r/'.env').chmod(0o600)
PY
cd "$RESTORE_ROOT"
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
docker compose -p lipidomic-pilot-restore -f compose.yml up -d
for i in $(seq 1 30); do
 if curl -fsS http://127.0.0.1:55442/status >/dev/null; then break; fi
 sleep 2
done
python3 verify.py --read-only --output restored-evidence.json
# Restore remains stopped, not removed, for inspection. Never stop unrelated services.
docker compose -p lipidomic-pilot-restore -f compose.yml stop
cp restored-evidence.json "$PILOT_ROOT/"
echo 'Encrypted backup restored and HTTP/hash checks passed.'
