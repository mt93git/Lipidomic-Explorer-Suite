#!/bin/bash
# Nexo staging auto-deploy, run every 5 minutes by nexo-staging-autodeploy.timer (systemd user unit).
# Each run: if the tracked branch on GitHub has a new commit, check it (client types, unit tests, build, R syntax,
# collaboration-service tests), deploy it to STAGING only, check that staging comes up on that commit, and roll back to
# the previous commit if it does not. Production is never touched.
#
# Tracked branch: the first line of $STATE/branch if that file exists; otherwise the head branch of pull request
# $NEXO_AUTODEPLOY_PR while it is open, then its base branch once it is closed (read from the public GitHub API).
# Settings: ~/.config/nexo-staging-autodeploy.env (see autodeploy.env.example). Status: $STATE/status.json, also copied to
# <staging dist>/deploy-status.json. Logs: $STATE/runs/ (the last 30).
# Manual run: bash autodeploy.sh [--force | --check-only]
#   --force retries a commit that failed before; --check-only runs the checks and does not deploy.
set -uo pipefail
CONFIG=${NEXO_AUTODEPLOY_CONFIG:-$HOME/.config/nexo-staging-autodeploy.env}
[ -f "$CONFIG" ] && { set -a; . "$CONFIG"; set +a; }
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH LC_ALL=C.UTF-8 LANG=C.UTF-8

: "${NEXO_STAGING_API_DIR:?set it in $CONFIG}" "${NEXO_STAGING_COLLAB_DIR:?set it in $CONFIG}"
: "${NEXO_STAGING_DIST:?set it in $CONFIG}" "${NEXO_STAGING_HOST:?set it in $CONFIG}"
A=${NEXO_AUTODEPLOY_STATE:-$HOME/staging-auto}
REPO=${NEXO_REPO:-https://github.com/mt93git/Lipidomic-Explorer-Suite}
GH_API=https://api.github.com/repos/${REPO#https://github.com/}
PR=${NEXO_AUTODEPLOY_PR:-23}
API=$NEXO_STAGING_API_DIR
COLLAB=$NEXO_STAGING_COLLAB_DIR
DIST=$NEXO_STAGING_DIST
HOST=$NEXO_STAGING_HOST
NGINX=${NEXO_STAGING_NGINX:-http://127.0.0.1}
API_PORT=${NEXO_STAGING_API_PORT:-3971}
COLLAB_PORT=${NEXO_STAGING_COLLAB_PORT:-3975}
UNITS=${NEXO_STAGING_UNITS:-nexo-admin-staging.service nexo-collab-staging.service}
VENDOR=${NEXO_VENDOR_DIR:-}           # optional: files for frontends/nexo/public/vendor that are not in git
RSCRIPT=${RSCRIPT:-Rscript}
MIN_FREE_GB=${NEXO_AUTODEPLOY_MIN_FREE_GB:-8}
FORCE=${1:-}

mkdir -p $A/runs
exec 9>$A/lock
flock -n 9 || exit 0

if [ -s $A/branch ]; then
  BRANCH=$(head -1 $A/branch)
else
  BRANCH=$(curl -fsS -m 20 $GH_API/pulls/$PR 2>/dev/null |
    python3 -c 'import sys,json; p=json.load(sys.stdin); print(p["head"]["ref"] if p["state"]=="open" else p["base"]["ref"])' 2>/dev/null)
  [ -n "$BRANCH" ] || exit 0  # GitHub not reachable: try again next run
fi
SHA=$(timeout 60 git ls-remote $REPO refs/heads/$BRANCH 2>/dev/null | cut -f1)
[ -n "$SHA" ] || exit 0
[ "$SHA" = "$(cat $A/deployed-sha 2>/dev/null)" ] && [ -z "$FORCE" ] && exit 0
[ -z "$FORCE" ] && [ "$SHA" = "$(cat $A/failed-sha 2>/dev/null)" ] && exit 0
# Keep the host's memory floor: wait for a later run if too little memory is available.
[ "$(free -g | awk '/Mem:/{print $7}')" -ge "$MIN_FREE_GB" ] || exit 0

RUN=$A/runs/$(date +%Y%m%d-%H%M%S)-${SHA:0:8}
LOG=$RUN/log.txt
BUILD=$A/build
mkdir -p $RUN
PREV=$(git -C $API rev-parse HEAD)
SUBJECT=""

status() {  # state step [detail-file]
  python3 - "$1" "$2" "${3:-}" "$BRANCH" "$SHA" "$SUBJECT" "$PREV" "$RUN" > $A/status.json.tmp <<'PY'
import json, sys, datetime, os, getpass
state, step, detail, branch, sha, subject, prev, run = sys.argv[1:9]
tail = open(detail, errors="replace").read().splitlines()[-40:] if detail else []
# The status is served publicly: no server paths or account names in it.
tail = [l.replace(os.path.expanduser("~"), "~").replace(getpass.getuser(), "user") for l in tail]
print(json.dumps({"state": state, "step": step, "branch": branch, "commit": sha, "subject": subject,
                  "previous_commit": prev, "time": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                  "run": run.rsplit("/", 1)[-1], "log_tail": tail}, indent=2))
PY
  mv $A/status.json.tmp $A/status.json
  cp $A/status.json $DIST/deploy-status.json 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\n' "$(date -Iseconds)" "${SHA:0:8}" "$1" "$2" >> $A/history.tsv
}
cleanup() { git -C $API worktree remove --force $BUILD >/dev/null 2>&1; rm -rf "${BUILD:?}"; git -C $API worktree prune; }
fail() { echo "$SHA" > $A/failed-sha; status failed "$1" $LOG; cleanup; exit 1; }
step() {  # name command...: run in a subshell, log everything, stop at the first failure
  local name=$1; shift
  echo "== $(date +%T) $name" >> $LOG
  status checking "$name"
  ( "$@" ) >> $LOG 2>&1 || fail "$name"
}
wait_up() {  # sha: the staging API reports that commit, the collaboration service answers, nginx serves the client
  for i in $(seq 1 100); do
    curl -fsS -m 5 http://127.0.0.1:$API_PORT/api/v1/health 2>/dev/null | grep -q "\"commit\":\"$1" && break
    sleep 3
  done
  curl -fsS -m 5 http://127.0.0.1:$API_PORT/api/v1/health | grep -q "\"commit\":\"$1" &&
    curl -fsS -m 5 http://127.0.0.1:$COLLAB_PORT/collab/health >/dev/null &&
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $HOST" $NGINX/nexo-staging/) &&
    { [ "$code" = 200 ] || [ "$code" = 401 ]; }
}
put_code() {  # sha dist-dir: both checkouts on sha, sidecar deps, client files, restart the staging units only
  for d in $API $COLLAB; do
    test -z "$(git -C $d status --short --untracked-files=no)" || { echo "uncommitted changes in $d"; return 1; }
  done
  git -C $COLLAB fetch -q $API "+refs/remotes/github/*:refs/remotes/github/*" &&
    git -C $API checkout -q --detach $1 && git -C $COLLAB checkout -q --detach $1 &&
    (cd $COLLAB/frontends/nexo-collab && npm ci --no-audit --no-fund --silent) &&
    rsync -a --delete $2/ $DIST/ &&
    systemctl --user restart $UNITS
}

fetch_code() {
  git -C $API fetch -q $REPO "+refs/heads/$BRANCH:refs/remotes/github/$BRANCH" &&
    git -C $API cat-file -e "$SHA^{commit}"
}
step "fetch $BRANCH" fetch_code
SUBJECT=$(git -C $API log -1 --format=%s $SHA)
echo "commit $SHA $SUBJECT (previous $PREV)" >> $LOG

prepare() {
  cleanup
  git -C $API worktree add -q --detach $BUILD $SHA &&
    mkdir -p $BUILD/frontends/nexo/public/vendor &&
    { [ -z "$VENDOR" ] || cp -n $VENDOR/* $BUILD/frontends/nexo/public/vendor/; } &&
    (cd $BUILD/frontends/nexo && npm ci --no-audit --no-fund --silent)
}
step "prepare" prepare
step "client types (tsc)" bash -c "cd $BUILD/frontends/nexo && npx tsc --noEmit"
step "client tests (vitest)" bash -c "cd $BUILD/frontends/nexo && npx vitest run --reporter=dot --maxWorkers=4"
step "client build" bash -c "cd $BUILD/frontends/nexo && VITE_API_BASE=/nexo-staging/api/v1 VITE_ADMIN_BASE=/admin-staging VITE_ADMIN_TOKEN_URL=/admin-staging/api/session-token VITE_COLLAB_URL=wss://$HOST/nexo-staging/collab npx vite build --base /nexo-staging/"
step "R syntax" bash -c "cd $BUILD && $RSCRIPT --vanilla tests/test_recursive_syntax.R"
step "collaboration tests" bash -c "cd $BUILD/frontends/nexo-collab && npm ci --no-audit --no-fund --silent && npm test"

if [ "$FORCE" = "--check-only" ]; then status checked "all checks passed (not deployed)" $LOG; cleanup; exit 0; fi

# Deploy, keeping what is live now for a rollback.
rsync -a --delete $DIST/ $A/prev-dist/
echo "== $(date +%T) deploy" >> $LOG
status deploying "deploy"
if put_code $SHA $BUILD/frontends/nexo/dist >> $LOG 2>&1 && wait_up $SHA >> $LOG 2>&1; then
  echo "$SHA" > $A/deployed-sha
  rm -f $A/failed-sha
  status deployed "staging is on ${SHA:0:8}" $LOG
  cleanup
  ls -1d $A/runs/* | head -n -30 | xargs -r rm -rf
  exit 0
fi

echo "== $(date +%T) staging did not come up on ${SHA:0:8}; rolling back to ${PREV:0:8}" >> $LOG
echo "$SHA" > $A/failed-sha
put_code $PREV $A/prev-dist >> $LOG 2>&1
if wait_up $PREV >> $LOG 2>&1; then
  status rolled-back "staging did not come up on ${SHA:0:8}; it is back on ${PREV:0:8}" $LOG
else
  status broken "staging did not come up on ${SHA:0:8} nor after the rollback to ${PREV:0:8}" $LOG
fi
cleanup
exit 1
