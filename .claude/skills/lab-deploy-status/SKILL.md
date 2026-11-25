---
name: lab-deploy-status
description: Say what is deployed on staging and on production (Nexo and Admin) from their deploy-status.json files, explain what each state means and what to do. Read-only. Use when the user types /lab-deploy-status, or says "qué hay en staging", "ya se desplegó?", "por qué falló el despliegue", "está en producción?".
---

# /lab-deploy-status: what is deployed where

Talk to the user in Spanish. Read only; never push, merge or change anything. `$LAB_SITE` is the lab's server address, set on this computer (see the lab-setup skill). If it is empty, ask the user for it and never write it into the repository.

## 1. Read both files
```bash
curl -s $LAB_SITE/nexo-staging/deploy-status.json
curl -s $LAB_SITE/nexo/deploy-status.json
```
Each one has `commit`, `subject`, `state`, `step` and, on a problem, `log_tail`. Show a short table: environment, commit (7 characters), subject, state.

## 2. Compare with the branches
`git fetch origin`, then:
- `git log --oneline <staging commit>..origin/lab/main`: merged into `lab/main` but not yet on staging (staging looks every 5 minutes and deploys about 10 minutes after a merge).
- `git log --oneline origin/lab/production..<staging commit>`: what `/publicar` would bring to production.

## 3. What each state means
| state | meaning | what to do |
|---|---|---|
| `deployed` | It is deployed. | Try it on staging: `$LAB_SITE/nexo-staging/` and `$LAB_SITE/admin-staging/`. |
| `checking` / `deploying` | On its way; `step` says where. | Wait a few minutes and look again. |
| `waiting` (production only) | The commit published is not on staging yet. | Wait for staging, then `/publicar` again. |
| `failed` | A check failed; nothing was deployed. `step` says which, `log_tail` shows the end of the log. | Show `step` and `log_tail`; offer `/arreglar` on a new branch. |
| `rolled-back` | It was deployed, did not start, and went back to the previous version by itself. | Show `log_tail`; offer `/arreglar`. |
| `broken` | It did not start, not even with the previous version. | Tell the user to call Gerardo now. |

If the problem is a database migration, say so: a `git revert` does not undo a migration, but the server keeps a backup of the Admin database from just before it. Ask Gerardo.

## 4. Next step
Staging `deployed` on the commit the user wants and tried: offer `/publicar`. Otherwise name the single next action.
