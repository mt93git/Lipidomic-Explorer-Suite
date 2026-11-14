# Lab auto-deploy (Nexo and Admin)

Two environments on the lab's server, each following one branch:

| Environment | Branch | Who moves the branch |
| --- | --- | --- |
| staging | `lab/main` | merging a pull request into `lab/main` |
| production | `lab/production` | the `publicar` skill, with a commit staging already runs |

Every 5 minutes, for each environment, `autodeploy.sh <env>`:

1. **Looks for a new commit** on its branch (public GitHub, no key).
2. **Production only:** waits unless staging has already deployed that commit.
3. **Checks it:**
   - Nexo: `tsc`, vitest, build, R syntax and the collaboration-service tests;
   - Admin: `tsc` and vitest.
4. **Backs up:**
   - the Nexo client;
   - the built Admin;
   - in production, the collaboration data;
   - the whole database before applying migrations.
5. **Applies new Admin migrations** (`db/admin/migrations`), each in one transaction. Production applies only migrations that staging applied.
6. **Deploys:**
   - Nexo: API, collaboration service and client;
   - Admin: rebuilt with the environment's settings.
7. **Checks that it came up:** Nexo API health on that commit, the collaboration service, nginx, and Admin's sign-in page.
8. **If not, puts the previous code back.** Migrations are not undone; the database backup stays in `~/lab-deploy/db-backups`.

Runs never overlap, and a run is skipped when less than 8 GB of memory is available. `deploy-status.json` under each environment's Nexo path says what is deployed, which step failed and the end of the log, without server paths.

## Install (as the user that runs the services)

```bash
mkdir -p ~/lab-deploy/staging ~/lab-deploy/production ~/.config/lab-autodeploy ~/.config/systemd/user
cp autodeploy.sh ~/lab-deploy/
cp env.example ~/.config/lab-autodeploy/staging.env       # fill in; same for production.env
cp lab-autodeploy@.service lab-autodeploy@.timer ~/.config/systemd/user/
# list the migrations already applied in each database, one file name per line:
ls db/admin/migrations > ~/lab-deploy/staging/migrations-applied   # only if all are applied there
systemctl --user daemon-reload
bash ~/lab-deploy/autodeploy.sh staging --check-only
systemctl --user enable --now lab-autodeploy@staging.timer lab-autodeploy@production.timer
```

`loginctl enable-linger` keeps user timers running without a login session.

The service runs the script through `sg docker`: the systemd user manager keeps the groups it had when it started, so a
user added to `docker` later has no docker access from the timer (migrations fail with "permission denied … docker.sock"
and the environment shows *broken*). A manual run from a fresh login shell needs no `sg`. After a broken run, fix the
cause and retry with `--force`.

## Commands

```bash
bash ~/lab-deploy/autodeploy.sh staging --check-only         # checks only
bash ~/lab-deploy/autodeploy.sh production --force           # retry a commit that failed
systemctl --user disable --now lab-autodeploy@production.timer
```
