---
name: lab-setup
description: Check, and with the user's yes repair, this computer's development environment for the lab repository (Git guardrails, branch, Node 22, GitHub CLI, R packages, Nexo and Admin dependencies, LAB_SITE, old personal skills). Use when the user types /lab-setup, or says "prepara mi entorno", "verifica mi setup", "los hooks no funcionan", "no me deja hacer push" or starts on a new computer.
---

# /lab-setup: is this computer ready?

Talk to the user in Spanish. Run every check, then show one table: item, state (OK / falta / distinto), and the fix. Fix a missing item only after the user's yes. Never write passwords, tokens or the server address into the repository.

## 1. Guardrails (the part that protects the repository)
- `git config core.hooksPath` must print `.githooks`. Fix: `git config core.hooksPath .githooks`.
- `git config core.longpaths` must be `true` (the repository has paths of about 150 characters). Fix: `git config --global core.longpaths true`.
- `git config lab.name` should print the user's name (`anapau`): the pre-commit hook then requires the branch prefix `anapau/`. Fix: `git config --local lab.name anapau`.
- `bash tests/test_git_guardrails.sh` must end with `failed=0`.
- `.githooks/commit-msg` exists and is executable (`ls -l .githooks`). Without it commit messages are not checked.

## 2. Branch and base
- `git fetch origin` and `git status --short`. If there are changes you did not make, ask before anything else.
- `lab/main` is the base. `git branch --show-current` must be `lab/main` (to start) or a topic branch `anapau/<topic>`. Not `main`, `integration/*`, `candidate/*`, `lab/production` or an old branch such as `Mods-anapau`.
- `git merge-base --is-ancestor origin/lab/main HEAD` says whether the branch has the current base.

## 3. Tools
| Tool | Check | Fix (offer, run after the yes) |
|---|---|---|
| Git | `git --version` | `winget install --id Git.Git -e` |
| GitHub CLI | `gh --version`, `gh auth status` | `winget install --id GitHub.cli -e`, then the user runs `gh auth login` (GitHub.com, HTTPS, browser) and `gh auth setup-git` |
| Node 22.23.2 | `node -v` | `winget install --id OpenJS.NodeJS.22 --version 22.23.2 -e` |
| R 4.4 | `Rscript --version` | install R 4.4.x; CI uses 4.4.3 |
| R packages | `Rscript -e "sapply(c('plumber','callr','png','svglite'), requireNamespace, quietly=TRUE)"` | `install.packages(c('plumber','callr','png','svglite'))` |
| Nexo dependencies | `ls frontends/nexo/node_modules` | `cd frontends/nexo && npm ci` |
| Plotly and vis-network for Nexo | `ls frontends/nexo/public/vendor` | in Git Bash: `sh scripts/vendor-plotly.sh` and `sh scripts/vendor-visnetwork.sh` |
| Admin dependencies | `ls frontends/admin/node_modules` | `cd packages/admin-ingest && npm ci && npm run build`, then `cd frontends/admin && npm ci` |

After installing with winget, the user must close and reopen the terminal and Claude Code so the PATH is refreshed.

## 4. Server address and old skills
- `LAB_SITE` must be set on this computer (PowerShell: `[Environment]::GetEnvironmentVariable("LAB_SITE","User")`). Fix: `setx LAB_SITE "<the lab's server address>"`; ask the user for the address if the guide is not at hand, and never put it in a file of the repository.
- Personal copies of the lab skills hide the repository's. `~/.claude/skills/{arreglar,crear,lab-pr-checklist,nexo-local-dev,team-to-nexo-port}` must not exist; offer to remove them.

## 5. Report
End with: what is ready, what the user still has to do by hand (for example `gh auth login`), and the next command to run. Do not start any code change from this skill.
