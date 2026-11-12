---
name: crear
description: Build something new in Lipidomic-Explorer-Suite (a new option, card, plot style, label or export in Nexo, or the same in Team) the safe way. Agree on what it does, start from the right base branch, write the tests first, build it small, keep Team and Nexo in step, run every check, and commit with good Git practice, never pushing or merging without the user's yes. Use when the user types /crear, or says "crea", "añade", "quiero una opción nueva", "add a feature" or "new card".
---

# /crear: a new feature with every guardrail on

Talk to the user in Spanish. Write code, tests, commit messages and PR text in English. The repository's `CLAUDE.md` rules always apply; this skill adds the order of the steps. Report the result of each step in one line. Stop and ask whenever a step fails or needs a decision.

## 0. Preflight (always, before touching code)
1. You are in the repository root (`git rev-parse --show-toplevel`).
2. Run `git config core.hooksPath`. If it does not print `.githooks`, say so and run `git config core.hooksPath .githooks` after the user says yes.
3. Run `git status --short`. If there are changes the user did not mention, stop and ask what to do with them. Never discard them.
4. Run `git fetch origin`. BASE is `lab/main`, the lab's branch: staging follows it, and production follows `lab/production` (see `CLAUDE.md`, section Deploys).

## 1. Agree on what to build (before any code)
Write back to the user, in a few lines, and wait for their OK:
- **What they will see:** where it appears (card, tab, inspector section, export) and what it does.
- **Whether it is saved in the checkpoint.** If yes, give the key and its allowed values. Nexo must not save a field Team rejects, so check `R/frontends/team/canvas_state.R` and say whether Team accepts it.
- **Presentation or science:**
  - Presentation (looks, labels, warnings, exports) never changes a computed value.
  - If it needs a new computed value (`R/modules`), it is a science change. It goes in its own PR, with a sentence for Max on what result changes and why.
- **Where it is built:** build it in Nexo first (`frontends/nexo`). If it is also wanted in Team, Team gets the same behaviour and the same saved field, with tests on both sides (team-to-nexo-port skill).
- **Classic:** `R/frontends/classic` and `www/` outside `www/team/` are never touched.
- **The smallest version that is useful.** Leave extras for later PRs.

## 2. Branch
- If you are already on the user's own topic branch for this same feature, stay there. Otherwise run `git switch -c anapau/<short-topic> origin/<BASE>`.
- Never work on `main`, `integration/*`, `lab/main`, `lab/production`, `candidate/*`, or on a branch with an open PR by someone else.

## 3. Red: the tests first
- Find where similar features live and copy their pattern:
  - `frontends/nexo/src/editor/` (`editorState.ts`, `applyEditor.ts`, `teamPresentation.test.ts`);
  - `src/ui/PlotEditor/` and `src/ui/Inspector/`;
  - `src/ui/strings.ts` for every visible text.
- Write the vitest (and the R test if the API or Team changes). It describes the agreed behaviour:
  - the figure shows it;
  - an out-of-range value is dropped;
  - if it is saved, it survives open → edit → save unchanged.
- Run those tests. They must FAIL because the feature is missing. Show the user the failing output.

## 4. Green: build it small
- Write only what the tests need. Add no new libraries, no generic layers and no helpers "for later".
- Run the new tests until they PASS.
- Show the user how to see it locally: the nexo-local-dev skill, with synthetic data only.

## 5. All the checks (paste the outputs)
- **Nexo client:** in `frontends/nexo`, run `npx vitest run`, `npx tsc --noEmit` and `npm run build`.
- **Admin, if you touched it:** build `packages/admin-ingest` once (`cd packages/admin-ingest && npm ci && npm run build`), then in `frontends/admin` run `npm ci`, `npx tsc --noEmit` and `npx vitest run`. A new database migration is a new file `db/admin/migrations/00NN_<name>.sql` with the next number; existing migrations are never edited.
- **R:**
  - from the root, `Rscript --vanilla tests/test_recursive_syntax.R` and `Rscript --vanilla tests/test_restore_helper.R`;
  - every `tests/dual-ui/test_*.R` of the area you touched.
- **If something fails,** fix the cause. Never skip, weaken or delete a test to get green. If a failure is not yours (it fails the same on `origin/<BASE>`), show the proof and tell the user.

## 6. Scope and privacy
- `git diff --name-only origin/<BASE>...HEAD` lists only files the feature needs.
- `git diff --name-only origin/<BASE>...HEAD -- R/frontends/classic app.R DESCRIPTION` prints nothing. `R/modules` appears only if the user agreed to a science change.
- Run the privacy step of the lab-pr-checklist skill. Synthetic data only; no names, emails, paths, hosts, passwords or tokens.
- Leave out the browser-suite screenshots in `docs/integration/`.

## 7. Commit
- Add files one by one (`git add <file>`), never `git add .` or `-A`.
- Use small commits, each green: `feat(<area>): <what the user sees>`, plus `test: ...` if a test stands alone. If the hooks refuse a commit, fix the reason. Never use `--no-verify`.

## 8. Bring in the base, then stop
- `git fetch origin` and `git merge origin/<BASE>` (merge, not rebase). Resolve any conflict keeping both sides' intent, then run step 5 again.
- Show the user a summary in Spanish:
  - what was built;
  - where to see it;
  - the tests;
  - the check results;
  - the branch name;
  - what was left for later.
- Then offer to publish it, step by step, each only after the user's explicit yes in chat:
  1. `git push -u origin <branch>`;
  2. the PR, with the lab-pr-checklist skill (base `lab/main`);
  3. merge it: `gh pr merge <number> --merge --delete-branch`.
- After the merge, tell the user in Spanish (`$LAB_SITE` is the lab's server address, set on this computer as the guide explains; if it is empty, ask the user for it): staging (Nexo and Admin) updates by itself in about 10 minutes, at $LAB_SITE/nexo-staging/ and $LAB_SITE/admin-staging/. $LAB_SITE/nexo-staging/deploy-status.json shows `deployed` when it is there, or which check failed. When they have tried it on staging, `/publicar` takes it to production. Never force push.
