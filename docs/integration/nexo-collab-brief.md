# Nexo Phase 1B (real-time collaboration): common brief for every task

Read this first, then the section of `docs/integration/nexo-collab-plan.md` (revision 2) your task cites. The plan is the
contract: it says *what* to build and which `file:line` it touches. Your task prompt says which slice is yours.
Decisions D1–D14 (plan section 10) were approved as recommended on 2026-11-09; do not reopen them.

## Branch

Integration branch: `nexo/collab` (from `nexo/phase1`). Your task runs on its own branch from the `ref` it was given.
Commit on that branch. Never `git push`, never `gh`, never open a PR.

## How to work

1. **TDD.** First commit: the failing test, with its literal failing output pasted in the commit message. Next commit:
   the smallest change that makes it pass. One commit per green step (a task can be cut at any time; only commits survive).
2. **Keep it simple.** Build exactly what the cited contract asks. No generic layers, no new frameworks, no helpers
   "for later", no configuration nobody reads. A new function exists because a test uses it. If the contract looks wrong
   or bigger than needed, stop and say so in your report instead of building around it.
3. **Keep tests simple.** One behaviour per test case, named after the case (`viewer update is refused`). Synthetic data
   inline or the existing fixtures (`tests/dual-ui/fixtures/*synthetic*`, `frontends/nexo/src/mock`). Fakes only at the
   edge, one file each and reused: the fake PostgREST (`frontends/nexo-collab/test/fake-postgrest.mjs`) and the fake R API
   (`frontends/nexo-collab/test/fake-r.mjs`, created by the first task that needs it, then reused). No snapshot files,
   no sleeps where an event can be awaited.
4. **Only the existing test tools:**
   - client: vitest (`cd frontends/nexo && npx vitest run <file>`);
   - sidecar: `node:test` (`cd frontends/nexo-collab && node --test`; Node 22, the server runtime, does not accept a bare
     directory argument, so let it discover `**/*.test.mjs` or name the files);
   - R API: `Rscript --vanilla tests/dual-ui/test_api_<name>.R` (prints `PASS <case>`, exits non-zero on failure;
     packages outside DESCRIPTION must `SKIP` cleanly, wall-clock budgets only with `NEXO_API_PERF=1`);
     where a task prompt says `[R]`, the machine-specific way to run R (interpreter, library paths, container) is in
     `~/nexo-r-run.md` on the host you run on, outside the repo: read it and follow it;
   - browser: `node tests/dual-ui/test_nexo_collab_<name>.cjs`, Chromium and WebKit, Playwright from `tests/browser/ci`
     (same skeleton as `tests/dual-ui/test_nexo_canvas_open.cjs`).
5. **Flag off stays identical.** With collaboration off (`VITE_COLLAB_URL` unset or `?collab=0`) single-user Nexo must
   behave exactly as today: `createHistory`, `createAutosave`, client recovery and direct PATCH unchanged, no `yjs` chunk
   loaded. Run the existing vitest suite before you report.

## Never touch

`R/modules`, `R/server.R`, `R/global.R`, `R/ui.R`, `R/frontends/team`, `R/frontends/classic`, `www`, `DESCRIPTION`, and
Admin migrations `0001`–`0011`. Zero science change: every plot, statistic and export still comes from Team's R code.
R changes live in `frontends/nexo-api/` only and are additive.

## Privacy

Synthetic data only. No real lab data, checkpoint names, tokens, passwords, keys or machine-specific paths in any file
or commit message (write `<repo>`, `<home>`, `<tmp>` instead). Secrets come from environment files that are never
committed. Do not kill processes you did not start and do not restart services.

## Report

Branch, last SHA, the literal red and green lines of your tests, the full list of suites you ran with their result, and
anything in the contract you found wrong or could not do.
