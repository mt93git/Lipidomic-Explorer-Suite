---
name: lab-pr-checklist
description: Prepare a pull request into the lab's branch `lab/main` on mt93git/Lipidomic-Explorer-Suite. Covers the base branch, Classic untouched, no science change, synthetic data only, a privacy grep of the diff, the filled PR template and test outputs. Use when the user says "prepare my PR", "is my branch ready", or "check nothing private is in my diff".
---

# Lab PR checklist

Work through every step and report each one as OK or with the problem found. Never push, open, merge the PR or change its base without the user's explicit yes in chat.

## 1. Base branch
- `git fetch origin`
- BASE is `lab/main`. Max reviews the lab's work later, in pull requests from `lab/main` into `integration/libreros-guided-workflow`.
- `git merge-base --is-ancestor origin/$BASE HEAD`. If this fails, offer `git merge origin/$BASE`, then re-run the tests.
- The branch name is `anapau/<topic>`, never `main`, `integration/*` or `lab/*`.

## 2. Scope
- Run `git diff --name-only origin/$BASE...HEAD` and show the list. Every file must be one the user meant to change.
- Classic is byte-identical and the science is untouched: `git diff --name-only origin/$BASE...HEAD -- R/frontends/classic R/modules app.R DESCRIPTION` prints nothing. Any change in `www/` outside `www/team/` is a Classic change: flag it.
- Presentation hooks (`R/frontends/team/hooks/`) may change looks, labels, warnings and exports, never a computed value.
- If `R/frontends/team` or `www/team` changed, Nexo (`frontends/nexo`) must carry the same change with a vitest. Otherwise point the user to the team-to-nexo-port skill.
- If `test_nexo_canvas_readonly.cjs` ran, `docs/integration/nexo-spike-evidence/` must show no change.

## 3. Privacy (synthetic data only)
```bash
git diff origin/$BASE...HEAD --name-only | grep -iE '\.(zip|xlsx|xls|csv|tsv|rds|rdata|sqlite|db|png|pdf)$'
git diff origin/$BASE...HEAD -U0 | grep '^+' | grep -inE 'password|passwd|secret|token|api[_-]?key|bearer |private key|supabase\.co|https?://[a-z0-9.-]+\.(com|org|net|edu|io)|[A-Za-z]:\\Users|/Users/|/home/|@[a-z0-9-]+\.(com|edu|org)'
```
- A binary or data file is allowed only if it is a synthetic fixture under `tests/` and the user confirms that.
- Every grep hit must be explained, for example a test that uses the literal word `token` with a fake value. Real values must be removed, and if they were committed, removed from history too, before any push.
- No real sample names, study names, client names, people's names or emails, server paths or host names.

## 4. Tests (paste the outputs)
- `cd frontends/nexo && npx vitest run && npx tsc --noEmit && npm run build`
- If `frontends/admin` changed: `cd packages/admin-ingest && npm ci && npm run build`, then `cd frontends/admin && npm ci && npx tsc --noEmit && npx vitest run`.
- Each touched R area, from the repo root: `Rscript --vanilla tests/dual-ui/test_api_<name>.R`. If Team changed, also run the Team `tests/dual-ui/test_*.R` that cover it.
- `CONTRIBUTING.md` checks: `Rscript --vanilla tests/test_recursive_syntax.R` and `Rscript --vanilla tests/test_restore_helper.R`.
- The PR template's AST check on each modified R file: `Rscript -e "invisible(parse('<file>'))"`.
- Browser suites: run them if possible, otherwise state "not run on Windows".

## 5. PR body (`.github/pull_request_template.md`)
Write it to a file outside the repo, for example `$TMP/pr.md`. Fill in:
- **Description**: what the user sees, why, and "Classic unchanged; no change to computed values; synthetic data only".
- **Type of Change**: tick one.
- **Verification Checklist**: tick only what was really done (AST parse, session export/import round trip, WYSIWYG sizing if applicable).
- **How to test / Results**: the exact commands and their PASS/FAIL/SKIP counts.

Then propose, and run each only after the user's yes: `git push -u origin <branch>`, `gh pr create --base lab/main --title "<subject>" --body-file "$TMP/pr.md"`, and `gh pr merge <number> --merge --delete-branch`.
Max's CI runs only on PRs into `main` or `integration/*`; for `lab/main` the checks are the ones above and the staging auto-deploy's own checks.
