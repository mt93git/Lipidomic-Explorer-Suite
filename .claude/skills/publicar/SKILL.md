---
name: publicar
description: Publish to production what is already working on staging, for both Nexo and Admin. Checks that staging is on the commit, pushes that commit to lab/production after the user's yes, and follows the production deploy until it is live or rolled back. Also takes production back to an earlier commit. Use when the user types /publicar, or says "publica", "pásalo a producción", "deploy to production" or "vuelve producción atrás".
---

# /publicar: staging → production

Talk to the user in Spanish. `$LAB_SITE` is the lab's server address, set on this computer as the guide explains. If it is empty, ask the user for it. Never write it into the repository.

How production works: the server deploys `lab/production` by itself within about 10 minutes. It only takes a commit that staging has already deployed, and only database migrations that staging has already applied. Before deploying it backs up the code, the Nexo client, the collaboration data and, if there are migrations, the Admin database. If Nexo or Admin does not come up, it puts the previous code back by itself.

## 1. What is on staging
- `curl -s $LAB_SITE/nexo-staging/deploy-status.json`. It must say `"state": "deployed"`. Note its `commit` (C) and `subject`.
- If it says `checking` or `deploying`, wait and look again. If it says `failed`, `rolled-back` or `broken`, stop: show the `step` and the end of `log_tail`, and offer `/arreglar`.
- `git fetch origin` and show `git log --oneline origin/lab/production..C`: these are the changes that will reach production. If the list is empty, production already has them: say so and stop.
- Ask the user whether they tried these changes on staging ($LAB_SITE/nexo-staging/ and $LAB_SITE/admin-staging/). If not, stop here.

## 2. Publish (only after the user's explicit yes)
- `git push origin C:refs/heads/lab/production`.
- If git refuses because it is not a fast-forward, stop and tell the user. Never force push.

## 3. Follow it
- Every minute, for up to 20 minutes: `curl -s $LAB_SITE/nexo/deploy-status.json`.
  - `waiting`: the commit is not on staging yet. Go back to step 1.
  - `checking` or `deploying`: say which `step` it is on.
  - `deployed` with `commit` C: tell the user production has it ($LAB_SITE/nexo/ and $LAB_SITE/admin/). Done.
  - `failed`: a check failed before deploying, so production did not change. Show the `step` and the end of `log_tail`.
  - `rolled-back`: it was deployed, did not come up, and production went back to the previous version by itself. Show `log_tail`.
  - `broken`: tell the user to call Gerardo now, and show `log_tail`.

## Going back to an earlier version
Production never moves backwards with a force push. Go forward with an undo instead:
1. With `/arreglar`, make a branch from `origin/lab/main` and `git revert` the bad merge (`git revert -m 1 <merge commit>`). Run the checks, open the PR into `lab/main` and merge it, each after the user's yes.
2. Wait until staging shows `deployed` with that commit.
3. Run `/publicar` again.

A database migration is not undone by a revert. If one went wrong, tell Gerardo: the server keeps a full backup of the database from just before it.
