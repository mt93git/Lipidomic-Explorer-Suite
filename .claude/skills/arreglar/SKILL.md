---
name: arreglar
description: Fix a bug in Lipidomic-Explorer-Suite (Nexo, Team or the R modules) the safe way. Start from the right base branch, write a test that reproduces the bug, apply the smallest fix, run every check, keep Team and Nexo in step, and commit with good Git practice, never pushing or merging without the user's yes. Use when the user types /arreglar, or says "arregla", "corrige", "fix this bug" or "esto no funciona".
---

# /arreglar: fix a bug with every guardrail on

Talk to the user in Spanish. Write code, tests, commit messages and PR text in English. The repository's `CLAUDE.md` rules always apply; this skill adds the order of the steps. Report the result of each step in one line. Stop and ask whenever a step fails or needs a decision.

## 0. Preflight (always, before touching code)
1. You are in the repository root (`git rev-parse --show-toplevel`).
2. Run `git config core.hooksPath`. If it does not print `.githooks`, say so and run `git config core.hooksPath .githooks` after the user says yes.
3. Run `git status --short`. If there are changes the user did not mention, stop and ask what to do with them. Never discard them.
4. Run `git fetch origin`. BASE is `lab/main`, the lab's branch: staging follows it, and production follows `lab/production` (see `CLAUDE.md`, section Deploys).

## 1. Understand the bug
- Restate it in one sentence: what the user did, what they expected, and what happened. If you cannot reproduce it from what they said, ask for the steps, the card or screen, and a screenshot.
- Find where it lives:
  - the Nexo client is `frontends/nexo`;
  - the Nexo API is `frontends/nexo-api`;
  - Team is `R/frontends/team` and `www/team`;
  - Admin (the back office and the client zone) is `frontends/admin`, with its database migrations in `db/admin/migrations`;
  - science is `R/modules`.
- **Science.** If the fix changes a computed value (`R/modules`), say so plainly. It is a science change: it needs its own PR, with a sentence for Max on what result changes and why.
- **Classic.** `R/frontends/classic` and `www/` outside `www/team/` are never touched. If the bug is there, stop and tell the user it goes to Max as an issue.

## 2. Branch
- If you are already on the user's own topic branch for this same bug, stay there. Otherwise run `git switch -c anapau/fix-<short-topic> origin/<BASE>`.
- Never work on `main`, `integration/*`, `lab/main`, `lab/production`, `candidate/*`, or on a branch with an open PR by someone else.

## 3. Red: a test that reproduces the bug
Put the test next to the code:
- **Nexo:** a vitest `*.test.ts`. Copy the style of a nearby test.
- **API or Team R:** `tests/dual-ui/test_*.R`.
- **Science:** a test under `tests/` with synthetic data.

Run only that test. It must FAIL, and fail for the reason of the bug. Show the user the failing output. If you cannot write a failing test, explain why and ask before going on.

## 4. Green: the smallest fix
- Change only what the bug needs: no refactors, no renames, no "while I'm here".
- **Team and Nexo stay in step.** If you fix Team's presentation, make the same fix in Nexo with its vitest (team-to-nexo-port skill), and the other way round.
- Run the test again. It must PASS.

## 5. All the checks (paste the outputs)
- **Nexo client:** in `frontends/nexo`, run `npx vitest run`, `npx tsc --noEmit` and `npm run build`.
- **Admin, if you touched it:** build `packages/admin-ingest` once (`cd packages/admin-ingest && npm ci && npm run build`), then in `frontends/admin` run `npm ci`, `npx tsc --noEmit` and `npx vitest run`. A new database migration is a new file `db/admin/migrations/00NN_<name>.sql` with the next number; existing migrations are never edited.
- **R:**
  - from the root, `Rscript --vanilla tests/test_recursive_syntax.R` and `Rscript --vanilla tests/test_restore_helper.R`;
  - every `tests/dual-ui/test_*.R` of the area you touched (see the nexo-local-dev skill for `R_LIBS_USER`).
- **Guardrails, if you touched them:** `bash tests/test_git_guardrails.sh`.
- **If something fails,** fix the cause. Never skip, weaken or delete a test to get green. If a failure is not yours (it fails the same on `origin/<BASE>`), show the proof and tell the user.

## 6. Scope and privacy
- `git diff --name-only origin/<BASE>...HEAD` lists only files the fix needs.
- `git diff --name-only origin/<BASE>...HEAD -- R/frontends/classic app.R DESCRIPTION` prints nothing. `R/modules` appears only if the user agreed to a science change.
- Run the privacy step of the lab-pr-checklist skill. Synthetic data only; no names, emails, paths, hosts, passwords or tokens.
- Leave out the browser-suite screenshots in `docs/integration/`.

## 7. Commit
- Add files one by one (`git add <file>`), never `git add .` or `-A`.
- Write one focused commit: `fix(<area>): <what the user will notice>`. If the hooks refuse it, fix the reason. Never use `--no-verify`.

## 8. Bring in the base, then stop
- `git fetch origin` and `git merge origin/<BASE>` (merge, not rebase). Resolve any conflict keeping both sides' intent, then run step 5 again.
- Show the user a summary in Spanish:
  - the bug;
  - the cause;
  - the fix;
  - the test that reproduces it;
  - the check results;
  - the branch name.
- Then offer to publish it, step by step, each only after the user's explicit yes in chat:
  1. `git push -u origin <branch>`;
  2. the PR, with the lab-pr-checklist skill (base `lab/main`);
  3. merge it: `gh pr merge <number> --merge --delete-branch`.
- After the merge, tell the user in Spanish (`$LAB_SITE` is the lab's server address, set on this computer as the guide explains; if it is empty, ask the user for it): staging (Nexo and Admin) updates by itself in about 10 minutes, at $LAB_SITE/nexo-staging/ and $LAB_SITE/admin-staging/. $LAB_SITE/nexo-staging/deploy-status.json shows `deployed` when it is there, or which check failed. When they have tried it on staging, `/publicar` takes it to production. Never force push.
