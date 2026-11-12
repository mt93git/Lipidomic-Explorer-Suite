#!/bin/bash
# Lab auto-deploy for Nexo and Admin, run by lab-autodeploy@<env>.timer (systemd user units), env = staging | production.
# Each run: if the env's branch on GitHub (lab/main for staging, lab/production for production) has a new commit, check
# it (Nexo: client types, unit tests, build, R syntax, collaboration tests; Admin: types and unit tests), apply new Admin
# database migrations (after a database backup), deploy Nexo and Admin, check that both come up on that commit, and roll
# the code back to the previous commit if they do not.
# Production only takes a commit that staging has already deployed, and only migrations that staging has already applied.
# Settings: ~/.config/lab-autodeploy/<env>.env (see env.example). State, status and logs: $STATE (default ~/lab-deploy/<env>).
# The status is also copied, without server paths, to <Nexo client root>/deploy-status.json.
# Manual run: bash autodeploy.sh <env> [--force | --check-only]
set -uo pipefail
ENV_NAME=${1:?usage: autodeploy.sh staging|production [--force|--check-only]}
FORCE=${2:-}
CONFIG=$HOME/.config/lab-autodeploy/$ENV_NAME.env
[ -f "$CONFIG" ] || { echo "no $CONFIG"; exit 2; }
set -a; . "$CONFIG"; set +a
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH LC_ALL=C.UTF-8 LANG=C.UTF-8
: "${BRANCH:?}" "${HOST:?}" "${NEXO_DIR:?}" "${NEXO_DIST:?}" "${NEXO_BASE:?}" "${NEXO_API_PORT:?}" "${NEXO_COLLAB_PORT:?}"
: "${NEXO_UNITS:?}" "${ADMIN_DIR:?}" "${ADMIN_ENV_FILE:?}" "${ADMIN_UNIT:?}" "${ADMIN_PORT:?}" "${ADMIN_BASE:?}" "${ADMIN_DB:?}"
NEXO_COLLAB_DIR=${NEXO_COLLAB_DIR:-$NEXO_DIR}
REPO=${REPO:-https://github.com/mt93git/Lipidomic-Explorer-Suite}
ROOT=${LAB_DEPLOY_ROOT:-$HOME/lab-deploy}
A=$ROOT/$ENV_NAME
STAGING_STATE=$ROOT/staging
NGINX=${NGINX:-http://127.0.0.1}
RSCRIPT=${RSCRIPT:-Rscript}
MIN_FREE_GB=${MIN_FREE_GB:-8}
mkdir -p $A/runs
exec 9>$ROOT/lock          # one run at a time across both envs (memory)
flock -n 9 || exit 0

SHA=$(timeout 60 git ls-remote $REPO refs/heads/$BRANCH 2>/dev/null | cut -f1)
[ -n "$SHA" ] || exit 0    # GitHub not reachable: try again next run
[ "$SHA" = "$(cat $A/deployed-sha 2>/dev/null)" ] && [ -z "$FORCE" ] && exit 0
[ -z "$FORCE" ] && [ "$SHA" = "$(cat $A/failed-sha 2>/dev/null)" ] && exit 0
[ "$(free -g | awk '/Mem:/{print $7}')" -ge "$MIN_FREE_GB" ] || exit 0

RUN=$A/runs/$(date +%Y%m%d-%H%M%S)-${SHA:0:8}
LOG=$RUN/log.txt
BUILD=$A/build
mkdir -p $RUN
PREV=$(git -C $NEXO_DIR rev-parse HEAD)
PREV_ADMIN=$(git -C $ADMIN_DIR rev-parse HEAD)
SUBJECT=""

status() {  # state step [detail-file]
  python3 - "$1" "$2" "${3:-}" "$ENV_NAME" "$BRANCH" "$SHA" "$SUBJECT" "$PREV" "$RUN" > $A/status.json.tmp <<'PY'
import json, sys, datetime, os, getpass
state, step, detail, env, branch, sha, subject, prev, run = sys.argv[1:10]
tail = open(detail, errors="replace").read().splitlines()[-40:] if detail else []
# The status is served publicly: no server paths or account names in it.
tail = [l.replace(os.path.expanduser("~"), "~").replace(getpass.getuser(), "user") for l in tail]
print(json.dumps({"environment": env, "state": state, "step": step, "branch": branch, "commit": sha, "subject": subject,
                  "previous_commit": prev, "time": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                  "run": run.rsplit("/", 1)[-1], "log_tail": tail}, indent=2))
PY
  mv $A/status.json.tmp $A/status.json
  cp $A/status.json $NEXO_DIST/deploy-status.json 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\n' "$(date -Iseconds)" "${SHA:0:8}" "$1" "$2" >> $A/history.tsv
}
cleanup() { git -C $NEXO_DIR worktree remove --force $BUILD >/dev/null 2>&1; rm -rf "${BUILD:?}"; git -C $NEXO_DIR worktree prune; }
fail() { echo "$SHA" > $A/failed-sha; status failed "$1" $LOG; cleanup; exit 1; }
step() {  # name command...: run in a subshell, log everything, stop at the first failure
  local name=$1; shift
  echo "== $(date +%T) $name" >> $LOG
  status checking "$name"
  ( "$@" ) >> $LOG 2>&1 || fail "$name"
}

# Production: only what staging already runs.
if [ "$ENV_NAME" = production ] && ! grep -qx "$SHA" $STAGING_STATE/deployed-list 2>/dev/null; then
  status waiting "commit ${SHA:0:8} is not on staging yet; publish a commit that staging has deployed"
  exit 0
fi

fetch_code() {
  for d in $NEXO_DIR $ADMIN_DIR; do git -C $d fetch -q $REPO "+refs/heads/$BRANCH:refs/remotes/github/$BRANCH" || return 1; done
  git -C $NEXO_DIR cat-file -e "$SHA^{commit}"
}
step "fetch $BRANCH" fetch_code
SUBJECT=$(git -C $NEXO_DIR log -1 --format=%s $SHA)
echo "commit $SHA $SUBJECT (previous Nexo $PREV, Admin $PREV_ADMIN)" >> $LOG

# Admin migrations in this commit that this env has not applied yet (production: only ones staging applied).
NEW_MIGRATIONS=$(git -C $NEXO_DIR ls-tree --name-only $SHA db/admin/migrations/ | xargs -n1 basename | sort | grep -vxF -f $A/migrations-applied || true)
if [ "$ENV_NAME" = production ] && [ -n "$NEW_MIGRATIONS" ]; then
  for m in $NEW_MIGRATIONS; do grep -qx "$m" $STAGING_STATE/migrations-applied || fail "migration $m has not run on staging"; done
fi

prepare() {
  cleanup
  git -C $NEXO_DIR worktree add -q --detach $BUILD $SHA &&
    mkdir -p $BUILD/frontends/nexo/public/vendor &&
    { [ -z "${NEXO_VENDOR_DIR:-}" ] || cp -n $NEXO_VENDOR_DIR/* $BUILD/frontends/nexo/public/vendor/; } &&
    (cd $BUILD/frontends/nexo && npm ci --no-audit --no-fund --silent) &&
    (cd $BUILD/packages/admin-ingest && npm ci --no-audit --no-fund --silent && npm run build --silent) &&
    (cd $BUILD/frontends/admin && npm ci --no-audit --no-fund --silent)
}
step "prepare" prepare
step "Nexo types (tsc)" bash -c "cd $BUILD/frontends/nexo && npx tsc --noEmit"
step "Nexo tests (vitest)" bash -c "cd $BUILD/frontends/nexo && npx vitest run --reporter=dot --maxWorkers=4"
step "Nexo build" bash -c "cd $BUILD/frontends/nexo && env $NEXO_BUILD_ENV npx vite build --base $NEXO_BASE"
step "R syntax" bash -c "cd $BUILD && $RSCRIPT --vanilla tests/test_recursive_syntax.R"
step "collaboration tests" bash -c "cd $BUILD/frontends/nexo-collab && npm ci --no-audit --no-fund --silent && npm test"
step "Admin types (tsc)" bash -c "cd $BUILD/frontends/admin && npx tsc --noEmit"
step "Admin tests (vitest)" bash -c "cd $BUILD/frontends/admin && npx vitest run --reporter=dot --maxWorkers=4"

if [ "$FORCE" = "--check-only" ]; then status checked "all checks passed (not deployed)" $LOG; cleanup; exit 0; fi

# ---- deploy, keeping what is live now for a rollback
echo "== $(date +%T) deploy" >> $LOG
status deploying "backup"
BK=$A/backup; rm -rf "${BK:?}"; mkdir -p $BK
rsync -a --delete $NEXO_DIST/ $BK/nexo-dist/
rsync -a --delete $ADMIN_DIR/frontends/admin/.next/ $BK/admin-next/
[ -n "${COLLAB_DATA_DIR:-}" ] && tar czf $BK/collab-data.tgz -C "$(dirname $COLLAB_DATA_DIR)" "$(basename $COLLAB_DATA_DIR)"

migrate() {  # each new migration in one transaction, after a full database backup
  [ -n "$NEW_MIGRATIONS" ] || return 0
  docker exec $ADMIN_DB pg_dumpall -U postgres | gzip > $ROOT/db-backups/$ENV_NAME-$(date +%Y%m%d-%H%M%S)-before-${SHA:0:8}.sql.gz || return 1
  for m in $NEW_MIGRATIONS; do
    echo "applying $m"
    git -C $NEXO_DIR show $SHA:db/admin/migrations/$m | docker exec -i $ADMIN_DB psql -U postgres -v ON_ERROR_STOP=1 -1 -q || return 1
    echo "$m" >> $A/migrations-applied
  done
}
mkdir -p $ROOT/db-backups
status deploying "Admin database migrations"
migrate >> $LOG 2>&1 || { status broken "a database migration failed; nothing else was deployed (database backup in db-backups)" $LOG; echo "$SHA" > $A/failed-sha; cleanup; exit 1; }

put_nexo() {  # sha dist-dir
  for d in $NEXO_DIR $NEXO_COLLAB_DIR; do
    test -z "$(git -C $d status --short --untracked-files=no)" || { echo "uncommitted changes in $d"; return 1; }
  done
  if [ "$NEXO_COLLAB_DIR" != "$NEXO_DIR" ]; then
    git -C $NEXO_COLLAB_DIR fetch -q $NEXO_DIR "+refs/remotes/github/*:refs/remotes/github/*" || return 1
  fi
  git -C $NEXO_DIR checkout -q --detach $1 && git -C $NEXO_COLLAB_DIR checkout -q --detach $1 &&
    (cd $NEXO_COLLAB_DIR/frontends/nexo-collab && npm ci --no-audit --no-fund --silent) &&
    rsync -a --delete $2/ $NEXO_DIST/ &&
    systemctl --user restart $NEXO_UNITS
}
put_admin() {  # sha [next-dir to restore instead of building]
  git -C $ADMIN_DIR checkout -q -- frontends/admin/next-env.d.ts 2>/dev/null
  git -C $ADMIN_DIR checkout -q --detach $1 &&
    (cd $ADMIN_DIR/packages/admin-ingest && npm ci --no-audit --no-fund --silent && npm run build --silent) &&
    (cd $ADMIN_DIR/frontends/admin && npm ci --no-audit --no-fund --silent) &&
    if [ -n "${2:-}" ]; then rsync -a --delete $2/ $ADMIN_DIR/frontends/admin/.next/
    else (cd $ADMIN_DIR/frontends/admin && set -a && . $ADMIN_ENV_FILE && set +a && npm run build); fi &&
    systemctl --user restart $ADMIN_UNIT
}
wait_up() {  # sha: Nexo API on that commit, collaboration service, nginx serves Nexo, Admin answers its sign-in page
  for i in $(seq 1 100); do
    curl -fsS -m 5 http://127.0.0.1:$NEXO_API_PORT/api/v1/health 2>/dev/null | grep -q "\"commit\":\"$1" && break
    sleep 3
  done
  curl -fsS -m 5 http://127.0.0.1:$NEXO_API_PORT/api/v1/health | grep -q "\"commit\":\"$1" || { echo "Nexo API not on ${1:0:8}"; return 1; }
  curl -fsS -m 5 http://127.0.0.1:$NEXO_COLLAB_PORT/collab/health >/dev/null || { echo "collaboration service down"; return 1; }
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $HOST" $NGINX$NEXO_BASE)
  { [ "$code" = 200 ] || [ "$code" = 401 ]; } || { echo "nginx $NEXO_BASE answered $code"; return 1; }
  for i in $(seq 1 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$ADMIN_PORT$ADMIN_BASE/sign-in)" = 200 ] && return 0
    sleep 3
  done
  echo "Admin sign-in page did not answer 200"; return 1
}

status deploying "deploy Nexo and Admin"
if put_nexo $SHA $BUILD/frontends/nexo/dist >> $LOG 2>&1 && put_admin $SHA >> $LOG 2>&1 && wait_up $SHA >> $LOG 2>&1; then
  echo "$SHA" > $A/deployed-sha
  echo "$SHA" >> $A/deployed-list
  rm -f $A/failed-sha
  status deployed "$ENV_NAME is on ${SHA:0:8}" $LOG
  cleanup
  ls -1d $A/runs/* | head -n -30 | xargs -r rm -rf
  exit 0
fi

echo "== $(date +%T) $ENV_NAME did not come up on ${SHA:0:8}; rolling the code back" >> $LOG
echo "$SHA" > $A/failed-sha
put_nexo $PREV $BK/nexo-dist >> $LOG 2>&1
put_admin $PREV_ADMIN $BK/admin-next >> $LOG 2>&1
if wait_up $PREV >> $LOG 2>&1; then
  status rolled-back "$ENV_NAME did not come up on ${SHA:0:8}; it is back on ${PREV:0:8}" $LOG
else
  status broken "$ENV_NAME did not come up on ${SHA:0:8} nor after the rollback to ${PREV:0:8}" $LOG
fi
cleanup
exit 1
