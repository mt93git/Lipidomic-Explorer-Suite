#!/usr/bin/env bash
# Checks the contributor guardrails in .githooks on a throwaway repository.
# Run from the repository root: bash tests/test_git_guardrails.sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "PASS $1"; }
bad() { fail=$((fail+1)); echo "FAIL $1"; }
expect_ok()   { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }
expect_fail() { if "${@:2}" >/dev/null 2>&1; then bad "$1"; else ok "$1"; fi; }

cd "$WORK"
git init -q -b main repo && cd repo
git config user.email test@example.invalid; git config user.name test
git config core.hooksPath "$ROOT/.githooks"
echo base > README.md; git add README.md
LAB_ALLOW_PROTECTED=1 git commit -qm base

echo more >> README.md; git add README.md
expect_fail "commit on main is refused" git commit -qm on-main
git checkout -q -b integration/test
expect_fail "commit on integration/* is refused" git commit -qm on-integration
git checkout -q -b someone/topic
expect_ok "commit on a topic branch is allowed" git commit -qm topic

echo a,b > results.csv; git add results.csv
expect_fail "a new data file outside test fixtures is refused" git commit -qm data
git reset -q results.csv; rm results.csv
mkdir -p tests/fixtures && echo a,b > tests/fixtures/synthetic.csv; git add tests/fixtures/synthetic.csv
expect_ok "a synthetic test fixture is allowed" git commit -qm fixture

printf -- '-----BEGIN %s PRIVATE KEY-----\n' RSA > key.txt; git add key.txt
expect_fail "a private key is refused" git commit -qm key
git reset -q key.txt; rm key.txt

if command -v Rscript >/dev/null 2>&1; then
  echo 'f <- function( {' > broken.R; git add broken.R
  expect_fail "an R file that does not parse is refused" git commit -qm broken
  git reset -q broken.R; rm broken.R
fi

head=$(git rev-parse HEAD); old=$(git rev-parse HEAD~1); zero=0000000000000000000000000000000000000000
push() { printf '%s\n' "$1" | "$ROOT/.githooks/pre-push" origin https://example.invalid/repo.git; }
expect_fail "push to main is refused" push "refs/heads/someone/topic $head refs/heads/main $old"
expect_fail "push to integration/* is refused" push "refs/heads/someone/topic $head refs/heads/integration/x $old"
expect_ok   "push of a new topic branch is allowed" push "refs/heads/someone/topic $head refs/heads/someone/topic $zero"
expect_ok   "fast-forward push is allowed" push "refs/heads/someone/topic $head refs/heads/someone/topic $old"
expect_fail "force push (not a fast-forward) is refused" push "refs/heads/someone/topic $old refs/heads/someone/topic $head"

echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
