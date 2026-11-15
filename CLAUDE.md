# Working in this repository (rules for every contributor and every AI assistant)

These rules apply to every change, with or without a skill. If a request conflicts with them, stop and ask.

## Before the first change of a session
- `git config core.hooksPath` must print `.githooks`. If it does not, tell the user and offer `git config core.hooksPath .githooks` (once per clone). The hooks refuse commits on `main` and `integration/*`, new data files outside test fixtures, private keys and tokens, R files that do not parse, pushes to `main` or `integration/*`, force pushes, and a push that breaks the Nexo client checks.
- `git fetch origin` and `git status`. Never start with uncommitted changes you did not make: ask first.

## Branches
- `main` is the maintainer's. The lab works on `lab/main`; the lab's work reaches `integration/libreros-guided-workflow` later, through pull requests from `lab/main` that the maintainer reviews.
- Never commit on `main`, `integration/*`, `lab/*` or another person's branch. Never force push, never rebase a pushed branch.
- One topic per branch: `git switch -c <your-name>/<topic> origin/lab/main`, then a pull request into `lab/main`. Its author may merge it once every check passes.
- Before pushing, bring the base in with `git merge origin/lab/main` (merge, not rebase), resolve conflicts, and run the tests again.
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
- Admin, in `frontends/admin` (after `npm ci && npm run build` in `packages/admin-ingest`): `npx tsc --noEmit`, `npx vitest run`.
- R: `Rscript --vanilla tests/test_recursive_syntax.R`, `Rscript --vanilla tests/test_restore_helper.R`, and the `tests/dual-ui/test_*.R` of every area you touched.
- Guardrails: `bash tests/test_git_guardrails.sh`.
- Paste the commands and their results in the pull request. A failing test is never skipped or deleted to get green.

## Privacy
- Synthetic data only. No real samples, studies, clients, people's names or emails, server paths, host names, passwords, tokens or keys in commits, tests, screenshots or pull requests.
- Browser suites leave screenshots in `docs/integration/`: do not commit them unless the change is about them.

## Pull requests
- Fill `.github/pull_request_template.md`. Never push, open, merge or retarget a pull request without the user's explicit yes.

## Deploys
- Staging (Nexo and Admin) deploys `lab/main` by itself, about 10 minutes after a merge, once its checks pass; it goes back to the previous version if it does not come up.
- Production deploys `lab/production` the same way, and only a commit that staging has already deployed. The `publicar` skill moves `lab/production`; never push to it by hand and never force push it.
- Admin database migrations go in a new file `db/admin/migrations/00NN_<name>.sql`; existing migrations are never edited. Staging applies a new migration first; production applies it only after staging did, after a database backup.
- Each environment's `deploy-status.json` (under its Nexo path) says what is deployed and which check failed.
