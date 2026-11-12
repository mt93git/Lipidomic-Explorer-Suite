# Working in this repository (rules for every contributor and every AI assistant)

These rules apply to every change, with or without a skill. If a request conflicts with them, stop and ask.

## Before the first change of a session
- `git config core.hooksPath` must print `.githooks`. If it does not, tell the user and offer `git config core.hooksPath .githooks` (once per clone). The hooks refuse commits on `main` and `integration/*`, new data files outside test fixtures, private keys and tokens, R files that do not parse, pushes to `main` or `integration/*`, force pushes, and a push that breaks the Nexo client checks.
- `git fetch origin` and `git status`. Never start with uncommitted changes you did not make: ask first.

## Branches
- `main` is the maintainer's. Work reaches `integration/libreros-guided-workflow` through small pull requests.
- Never commit on `main`, `integration/*` or another person's branch. Never force push, never rebase a pushed branch.
- One topic per branch: `git switch -c <your-name>/<topic> origin/<base>`. The base is `integration/libreros-guided-workflow` unless a stacked pull request that the change builds on is still open: then branch from that pull request's branch and say so in the new pull request.
- Before pushing, bring the base in with `git merge origin/<base>` (merge, not rebase), resolve conflicts, and run the tests again.
- Commit messages: one line, imperative, `type(area): what changed` (for example `fix(nexo-editor): keep the hidden PCA group hidden`).
- Add files one by one. Never `git add .` or `git add -A`.

## Scope
- Classic (the default interface, `R/frontends/classic` and `www/` outside `www/team/`) does not change by a single byte.
- One scientific backend: `R/modules`. A change there is a science change: its own pull request, with tests and a sentence for the maintainer on what result changes and why.
- A presentation change (looks, labels, warnings, exports) never changes a computed value.
- Team (`R/frontends/team`, `www/team`) and Nexo (`frontends/nexo`) must not diverge: a Team presentation change gets the same behaviour in Nexo, with a vitest.

## Tests (test first)
- A bug: write a test that reproduces it and fails, then fix it. A feature: write the test first.
- Nexo client, in `frontends/nexo`: `npx vitest run`, `npx tsc --noEmit`, `npm run build`.
- R: `Rscript --vanilla tests/test_recursive_syntax.R`, `Rscript --vanilla tests/test_restore_helper.R`, and the `tests/dual-ui/test_*.R` of every area you touched.
- Guardrails: `bash tests/test_git_guardrails.sh`.
- Paste the commands and their results in the pull request. A failing test is never skipped or deleted to get green.

## Privacy
- Synthetic data only. No real samples, studies, clients, people's names or emails, server paths, host names, passwords, tokens or keys in commits, tests, screenshots or pull requests.
- Browser suites leave screenshots in `docs/integration/`: do not commit them unless the change is about them.

## Pull requests
- Fill `.github/pull_request_template.md`. Never push, open, merge or retarget a pull request without the user's explicit yes.
