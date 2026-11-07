---
name: lipidomic-repo-workflow
description: How to change code in the Lipidomic Explorer repo (mt93git/Lipidomic-Explorer-Suite). Use for any branch, commit, pull request, review, release, tag or production deploy in this repo, and before touching R/modules, R/global.R, R/server.R, R/core or any scientific default.
---

# Lipidomic Explorer: how we work in the repo

Max, Gerardo and Paula can each change any part of the code. Three habits keep that safe:

1. **One path to production.** Every change goes through a branch, then a PR into integration, then a weekly release into main. Production is deployed only from a tag on main.
2. **A second person reviews every PR.** The author never approves their own work, and neither does an AI agent working for the author.
3. **Automatic checks.** CI runs on every PR. If CI is not green, the PR is not merged.

Full proposal, with diagrams: https://claude.ai/artifact/9Fu8sz64MCTV9uHxXnKkNA

## Branches

| Branch | Role | Who writes to it |
| --- | --- | --- |
| `main` | Released code. Every release is tagged (`v13.0.0`, `v13.1.0`, ...). | Only the weekly release PR |
| `integration/libreros-guided-workflow` | Work that is ready for the next release | Only merged PRs |
| `fix/<topic>`, `feat/<topic>`, `hotfix/<topic>` | One short-lived branch per change | The author |

- Always branch from the latest `integration/libreros-guided-workflow`.
- A branch should live for days, not weeks.
- Never push directly to `main` or to integration. Never force-push a branch someone else is working on.

## The life of a change

1. **Short branch** from integration, with a name that says what it does (`fix/volcano-labels`).
2. **Small PR**: one topic, ideally under 400 lines. Fill in the PR template (`references/pr-template.md`).
3. **CI checks**: lint, unit tests, Classic scientific parity, and the Team acceptance suite. Run the same checks locally before pushing (see `.github/workflows/`).
4. **Review**: one of the other two people, within 2 working days. Review comments stay on GitHub.
5. **Merge into integration**: the author merges once CI is green and the PR is approved. Stacked PRs are merged from the bottom up.
6. **Weekly release**: the person on duty merges integration into main through a release PR and tags it.
7. **Deploy**: the person on duty deploys production from the tag, with a backup and the rollback ready.
8. **Validate**: Paula checks her test project on production, and a short email says what shipped.

If CI is red or changes are requested, fix the problem and push to the same branch, then go back to step 3.

## Three kinds of change

Find the kind of change before you write code. State it in the PR.

| Kind | Examples | Needs |
| --- | --- | --- |
| **Normal** | Interface, text, speed, bug fixes, tests | 1 approval from either of the other two, and green CI |
| **Touches the shared core** | `R/modules/`, `R/global.R`, `R/server.R`, `R/core/` (analysis modules, data loading, hooks) | 1 approval. Classic output must stay identical to the reference ("scientific parity"); if it changes, the PR says so and explains why. |
| **Changes a scientific result** | Default parameters, statistics, sample exclusion, normalization | 2 approvals (both other people), plus a before/after check in the PR |
| **Changes project rules** | `.github/workflows/`, `DESCRIPTION`, `CITATION.cff`, `LICENSE`, this skill (`SKILL.md` and its folder, both copies) | 2 approvals (both other people) |

When in doubt, pick the stricter kind.

Team code lives in `R/frontends/team/`. It reaches the core only through the named hooks in `R/core/hooks.R`, and those hooks do nothing in Classic. Keep it that way: a Team change must not alter Classic output.

## Eight rules

1. Production only from tags on main.
2. CI runs on every PR, whatever the target branch.
3. `main` and integration are protected: changes enter only by PR, with green CI and another person's approval.
4. Package versions will be pinned in a shared `renv.lock` (to be added by the repo-setup PR), so the Macs, the server and CI run the same versions. Until then, CI is the reference machine.
5. No test is disabled or deleted to get green. A test is skipped only when it needs private data that cannot be in the repo, and the PR says so.
6. No real data or secrets in the repo. Use synthetic fixtures only. Keys, Supabase URLs, passwords and environment values live on the server.
7. Scientific changes need two approvals and a before/after check. Changes to CI workflows, `DESCRIPTION`, `CITATION.cff`, `LICENSE` or this skill also need two approvals.
8. Every PR explains itself: what changes, which areas it touches, how it was tested, and the effect on Classic. Reviews happen in writing.

## Rules for AI agents

These apply to Claude Code, Codex, Antigravity and any other agent working in this repo.

- **Never change a scientific parameter, a statistical method or a default, and never exclude a sample, without written confirmation from a person.** Ask first, and say what would change.
- Never push, open or merge a PR, tag, or deploy unless the person you work for asked for that specific action.
- Never approve a PR. Approval comes from a person other than the author.
- Never disable, skip or loosen a test to get green. Find the cause. If the failure is real, fix the code; if it depends on the environment, say so in the PR.
- Never commit data files with patient or sample data, credentials, `.env` files or server keys. Check `git diff --cached` before every commit.
- Keep each PR to one topic. If you find an unrelated problem, note it in the PR description or open an issue; do not fix it in the same PR.
- Before you finish, report what you changed, which of the three kinds it is, which checks you ran and their results, and anything you could not verify.

## Releases and deploys

The full checklist is in `references/release-checklist.md`. In short:

- Release once a week (Thursday by default). Release duty rotates: Max, then Gerardo, then Paula.
- The person on duty opens the release PR and tags main. The deploy needs access to the Yale server: on Max's weeks, Max does the release PR and the tag, and Gerardo runs the production deploy from that tag.
- Release PR: integration into main, with green CI and one approval.
- Tag main with the next version (`vMAJOR.MINOR.PATCH`) and deploy production from that tag, never from a branch.
- Keep a backup and a tested rollback command before switching production.
- Urgent fix: use a `hotfix/<topic>` branch and ask for a fast review. It still goes into main and gets a tag (a patch version) before it is deployed.

## Coordination

- Before you start something large, say so in one line in an issue or in the weekly email ("I'm working on the volcano module"), so PRs don't collide.
- Discuss code on GitHub. Use email for announcements and decisions.
