---
name: lab-preflight
description: Run the lab's guardrails by hand on the current branch before a commit or a push. Checks the branch and base, the scope of the diff (Classic, science, Team and Nexo in step, migrations, files that stay out), privacy, commit messages, test first, and which tests to run. Use when the user types /lab-preflight, or says "revisa antes de hacer commit", "puedo hacer push?", "check my branch" or "revisa que cumpla las reglas".
---

# /lab-preflight: the guardrails, on demand

Talk to the user in Spanish. This skill only reads and reports; it changes nothing and never pushes. The Git hooks in `.githooks` enforce the same rules at commit and push, and `CLAUDE.md` is the source of the rules. Report each item as OK or with the exact problem and the fix.

## 1. Branch and base
- `git config core.hooksPath` is `.githooks`; otherwise tell the user and point to the lab-setup skill.
- `git branch --show-current` is `anapau/<short-english-topic>`; never `main`, `integration/*`, `lab/*`.
- `git fetch origin`, then `git merge-base --is-ancestor origin/lab/main HEAD`. If it fails: `git merge origin/lab/main` (merge, never rebase), then run the tests again.
- One topic per branch. If the diff mixes unrelated topics, say so and offer to split it.

## 2. Scope (`git diff --name-only origin/lab/main...HEAD`)
Show the list; every file must be one the user meant to change.
- **Classic**: `git diff --name-only origin/lab/main...HEAD -- R/frontends/classic app.R DESCRIPTION` prints nothing, and nothing changed in `www/` outside `www/team/`.
- **Science**: if `R/modules` changed, it is a science change. It must be alone in its branch (no `frontends/`, `R/frontends/` or `www/` files), have a test with synthetic data, and the PR needs one sentence for the maintainer on what result changes and why. A presentation change never changes a computed value.
- **Team and Nexo in step**: if `R/frontends/team` or `www/team` changed, `frontends/nexo` must carry the same behaviour with a vitest (team-to-nexo-port skill).
- **Migrations**: files under `db/admin/migrations` are only new, named `00NN_<name>.sql`, with the next free number (admin-migration skill). No existing one is edited.
- **Files that stay out**: no data or office files outside `tests/**/fixtures`, no ZIP of checkpoints, no `pr.md`, no screenshots under `docs/integration/`, nothing larger than 5 MB.

## 3. Privacy
Run the privacy grep of the lab-pr-checklist skill on `git diff origin/lab/main...HEAD`, and explain every hit. Synthetic data only: no real samples, studies, people's names or emails, server paths, host names, the server address (the skills read it from `LAB_SITE`), passwords, tokens or keys.

## 4. Commits (`git log --format=%s origin/lab/main..HEAD`)
- One English line per commit: `type(area): what changed`, imperative, no final period, at most 100 characters.
- Every `feat` and `fix` commit carries its test (`git show --stat <sha>`). A test must have failed before the change.
- No `--no-verify`. Files were added one by one.

## 5. Which tests to run
List the commands that match the files changed, and offer to run them (never skip or delete a failing test):
- `frontends/nexo` changed or Team changed: `cd frontends/nexo && npx vitest run && npx tsc --noEmit && npm run build`.
- `frontends/admin` or `packages/admin-ingest` changed: build `packages/admin-ingest`, then in `frontends/admin` `npx tsc --noEmit && npx vitest run`.
- `frontends/nexo-api` or R code changed: `Rscript --vanilla tests/dual-ui/test_api_*.R` for the area, plus `Rscript --vanilla tests/test_recursive_syntax.R` and `tests/test_restore_helper.R`.
- Git rules or hooks changed: `bash tests/test_git_guardrails.sh` must end with `failed=0`.

## 6. Verdict
Say "lista para push" only if every item is OK. Then offer the lab-pr-checklist skill to write the PR; push, PR and merge each need the user's explicit yes.
