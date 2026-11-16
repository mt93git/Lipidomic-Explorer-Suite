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
add() { mkdir -p "$(dirname "$1")"; printf '%s\n' "${2:-x}" > "$1"; git add "$1"; }
undo() { git reset -q -- "$@" 2>/dev/null; rm -rf "$@"; }

cd "$WORK"
git init -q -b main repo && cd repo
git config user.email test@example.invalid; git config user.name test
git config core.hooksPath "$ROOT/.githooks"
echo base > README.md; git add README.md
LAB_ALLOW_PROTECTED=1 git commit -qm "chore: base"
base_sha=$(git rev-parse HEAD)
git update-ref refs/remotes/origin/lab/main "$base_sha"

# --- branches ---------------------------------------------------------------------------------
echo more >> README.md; git add README.md
expect_fail "commit on main is refused" git commit -qm "chore: on main"
git checkout -q -b integration/test
expect_fail "commit on integration/* is refused" git commit -qm "chore: on integration"
git checkout -q -b lab/main
expect_fail "commit on lab/main is refused" git commit -qm "chore: on lab main"
git checkout -q -b lab/production
expect_fail "commit on lab/production is refused" git commit -qm "chore: on lab production"
git checkout -q -b notopic
expect_fail "a branch without <name>/<topic> is refused" git commit -qm "chore: bad branch"
git checkout -q -b someone/topic
git config lab.name paula
expect_fail "a branch with another person's prefix is refused" git commit -qm "chore: wrong prefix"
git checkout -q -b paula/topic
expect_ok "commit on your own topic branch is allowed" git commit -qm "chore: topic"
git config --unset lab.name

# --- commit messages --------------------------------------------------------------------------
echo m1 >> README.md; git add README.md
expect_fail "a message without type(area) is refused" git commit -qm "update stuff"
expect_fail "a past-tense message is refused" git commit -qm "chore(docs): added a note"
expect_fail "a Spanish message is refused" git commit -qm "docs: añade una nota"
expect_ok   "type(area): imperative is allowed" git commit -qm "docs(readme): add a note"

# --- test first -------------------------------------------------------------------------------
add src/feature.txt
expect_fail "a feat without a test is refused" git commit -qm "feat(nexo-editor): add a toggle"
add tests/feature.test.ts
expect_ok   "a feat with its test is allowed" git commit -qm "feat(nexo-editor): add a toggle"
add src/bug.txt
expect_fail "a fix without a test is refused" git commit -qm "fix(nexo-editor): keep the group hidden"
add tests/test_bug.R
expect_ok   "a fix with its test is allowed" git commit -qm "fix(nexo-editor): keep the group hidden"

# --- data, private information, files that stay out --------------------------------------------
echo a,b > results.csv; git add results.csv
expect_fail "a new data file outside test fixtures is refused" git commit -qm "chore: data"
undo results.csv
add tests/fixtures/synthetic.csv "a,b"
expect_ok "a synthetic test fixture is allowed" git commit -qm "test: add a fixture"
add notes.docx
expect_fail "an office document is refused" git commit -qm "docs: add notes"
undo notes.docx
add pr.md "body"
expect_fail "pr.md inside the repository is refused" git commit -qm "docs: add pr text"
undo pr.md
add docs/integration/nexo-companion/shot.png
expect_fail "a browser-test screenshot is refused" git commit -qm "test: add a screenshot"
undo docs/integration
printf -- '-----BEGIN %s PRIVATE KEY-----\n' RSA > key.txt; git add key.txt
expect_fail "a private key is refused" git commit -qm "chore: key"
undo key.txt
add cfg.txt "host=https://lipidomics.experimentalhidalgolab.com/nexo/"
expect_fail "the server address is refused" git commit -qm "docs: add host"
undo cfg.txt
add cfg.txt "contact=someone@yale.edu"
expect_fail "a personal email is refused" git commit -qm "docs: add contact"
undo cfg.txt
add cfg.txt "path=C:\\Users\\someone\\Documents"
expect_fail "a user folder is refused" git commit -qm "docs: add path"
undo cfg.txt
add cfg.txt "mail=test@example.invalid"
expect_ok "a reserved example address is allowed" git commit -qm "docs: add example mail"

if command -v Rscript >/dev/null 2>&1; then
  echo 'f <- function( {' > broken.R; git add broken.R
  expect_fail "an R file that does not parse is refused" git commit -qm "chore: broken"
  undo broken.R
fi

# --- Classic stays untouched ------------------------------------------------------------------
add R/frontends/classic/ui.R "x <- 1"
expect_fail "a Classic file is refused" git commit -qm "chore: classic"
undo R/frontends/classic
add app.R "x <- 1"
expect_fail "app.R is refused" git commit -qm "chore: app"
undo app.R
add www/classic.js "x"
expect_fail "www/ outside www/team is refused" git commit -qm "chore: www"
undo www/classic.js
add www/team/js/x.js "x"
expect_ok "www/team is allowed" git commit -qm "style(team): tweak"

# --- Admin migrations -------------------------------------------------------------------------
add db/admin/migrations/0001_init.sql "select 1;"
expect_ok "the first migration is allowed" git commit -qm "chore(admin): add the first table"
add db/admin/migrations/0003_skip.sql "select 1;"
expect_fail "a migration that skips a number is refused" git commit -qm "chore: skip"
undo db/admin/migrations/0003_skip.sql
add db/admin/migrations/0002_Bad-Name.sql "select 1;"
expect_fail "a migration with a bad name is refused" git commit -qm "chore: bad name"
undo db/admin/migrations/0002_Bad-Name.sql
add db/admin/migrations/0002_more.sql "select 2;"
expect_ok "the next numbered migration is allowed" git commit -qm "chore(admin): add more"
echo "select 9;" >> db/admin/migrations/0001_init.sql; git add db/admin/migrations/0001_init.sql
expect_fail "editing an existing migration is refused" git commit -qm "chore: edit migration"
git checkout -q -- db/admin/migrations/0001_init.sql; git reset -q -- db/admin/migrations/0001_init.sql

# --- push -------------------------------------------------------------------------------------
head=$(git rev-parse HEAD); old=$(git rev-parse HEAD~1); zero=0000000000000000000000000000000000000000
push() { printf '%s\n' "$1" | "$ROOT/.githooks/pre-push" origin https://example.invalid/repo.git; }
publish() { printf '%s\n' "$1" | LAB_PUBLISH=1 "$ROOT/.githooks/pre-push" origin https://example.invalid/repo.git; }
git merge -q -m "Merge base" origin/lab/main 2>/dev/null
expect_fail "push to main is refused" push "refs/heads/paula/topic $head refs/heads/main $old"
expect_fail "push to integration/* is refused" push "refs/heads/paula/topic $head refs/heads/integration/x $old"
expect_fail "push to lab/main is refused" push "refs/heads/paula/topic $head refs/heads/lab/main $old"
expect_fail "push to lab/production is refused" push "refs/heads/paula/topic $head refs/heads/lab/production $old"
expect_ok   "publicar may move lab/production" publish "refs/heads/paula/topic $head refs/heads/lab/production $old"
expect_ok   "push of a new topic branch is allowed" push "refs/heads/paula/topic $head refs/heads/paula/topic $zero"
expect_ok   "fast-forward push is allowed" push "refs/heads/paula/topic $head refs/heads/paula/topic $old"
expect_fail "force push (not a fast-forward) is refused" push "refs/heads/paula/topic $old refs/heads/paula/topic $head"

# a branch that does not contain the current lab/main
git checkout -q --orphan stale; git rm -rfq . 2>/dev/null; echo s > s.txt; git add s.txt
LAB_ALLOW_PROTECTED=1 LAB_ALLOW_BRANCH=1 git commit -qm "chore: stale"
stale=$(git rev-parse HEAD)
expect_fail "a branch without the current lab/main is refused" push "refs/heads/paula/stale $stale refs/heads/paula/stale $zero"

# science mixed with interface work
git checkout -q -b paula/mixed "$base_sha"
add R/modules/stats.R "x <- 1"; add www/team/a.js "x"
git commit -qm "chore: mixed"
mixed=$(git rev-parse HEAD)
expect_fail "science mixed with interface work is refused" push "refs/heads/paula/mixed $mixed refs/heads/paula/mixed $zero"
git checkout -q -b paula/science "$base_sha"
add R/modules/stats.R "x <- 1"; add tests/test_stats.R "x"
git commit -qm "fix(stats): correct the median"
sci=$(git rev-parse HEAD)
expect_ok "a science change on its own is allowed" push "refs/heads/paula/science $sci refs/heads/paula/science $zero"

echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
