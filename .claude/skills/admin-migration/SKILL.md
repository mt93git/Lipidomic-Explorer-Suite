---
name: admin-migration
description: Add a database migration for Admin the safe way. A new file db/admin/migrations/00NN_<name>.sql with the next free number, never editing an existing one, with a test and the deploy order in mind. Use when the user types /admin-migration, or says "necesito una migración", "añade una columna/tabla en Admin", "cambia la base de datos de Admin".
---

# /admin-migration: a new Admin database migration

Talk to the user in Spanish. Write the SQL, the test, commit messages and PR text in English. `CLAUDE.md` rules apply: topic branch from `lab/main`, test first, nothing pushed or merged without the user's yes. Run the lab-preflight skill when done.

## 1. Understand the change
- Restate it in one sentence: which table or column, why, and what Admin screen or API needs it.
- Existing migrations are never edited, renamed or deleted, even to fix a mistake: a mistake gets a new migration that corrects it.
- Anything destructive (`DROP`, `DELETE`, `TRUNCATE`, changing a column type, removing a column) needs the user's explicit yes and a note for Gerardo in the PR. The server backs up the whole Admin database just before production applies a migration, but a revert of the code does not undo it.
- Synthetic data only: no real people, samples or emails in SQL or tests.

## 2. Branch and number
- `git fetch origin`, then `git switch -c anapau/<short-topic> origin/lab/main` (or stay on your topic branch for this change).
- `ls db/admin/migrations`: the new file takes the next number, four digits, lowercase name with underscores: `db/admin/migrations/00NN_<what_it_does>.sql`. Count the highest number on `origin/lab/main` and on your branch. If another branch took the same number, take the next one after merging `origin/lab/main`.
- Write migrations so running twice is harmless when the database allows it (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), and add a comment line with the reason.

## 3. Test first
- Look at how the existing Admin tests treat migrations and the schema (`frontends/admin`, `packages/admin-ingest`) and copy that style. Write the test that needs the new column or table and see it fail.
- Then add the migration and the smallest code that uses it, and see the test pass.

## 4. Checks
- `cd packages/admin-ingest && npm ci && npm run build`, then `cd frontends/admin && npm ci && npx tsc --noEmit && npx vitest run`. Paste the results; a failing test is never skipped.
- `git diff --name-status origin/lab/main...HEAD -- db/admin/migrations` shows only `A` lines.

## 5. Commit, and how it reaches production
- Add the files one by one. Message: `feat(admin): add <what>` with its test in the same commit, or `chore(admin): ...`.
- Say in the PR: staging applies the migration first, about 10 minutes after the merge; production applies it only after staging did, and only through `/publicar`, after the database backup. Check staging at `$LAB_SITE/admin-staging/` (the lab-deploy-status skill reads `deploy-status.json`) before publishing.
- Push, PR and merge only after the user's explicit yes.
