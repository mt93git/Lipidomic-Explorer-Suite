# Nexo staging auto-deploy

Keeps Nexo **staging** on the latest commit of the branch under review, so a contributor can try a merged change on the
server a few minutes later. Production is never touched; it is still deployed by hand.

Every 5 minutes, `autodeploy.sh`:

1. **Picks the branch.** It follows pull request `NEXO_AUTODEPLOY_PR`'s head branch while the PR is open, then its base
   branch once it closes. A branch name in `~/staging-auto/branch` overrides this.
2. **Looks for a new commit** on GitHub (public, no key needed).
3. **Checks it**, in about a minute:
   - client types (`tsc`);
   - client unit tests (vitest);
   - client build;
   - R syntax (`tests/test_recursive_syntax.R`);
   - collaboration-service tests.
4. **Deploys it to staging:** both staging checkouts move to the commit, the client goes to the staging web root, and the
   two staging units restart.
5. **Checks that staging is up:** the API health reports the commit, the collaboration service answers, and nginx
   serves `/nexo-staging/`.
6. **Rolls back** to the previous commit if staging does not come up. The failed commit is not retried until a new one
   arrives (or `--force`).

It skips a run when less than 8 GB of memory is available. Runs never overlap.

## Install (as the user that runs staging)

```bash
mkdir -p ~/staging-auto ~/.config/systemd/user
cp autodeploy.sh ~/staging-auto/
cp autodeploy.env.example ~/.config/nexo-staging-autodeploy.env   # then fill it in
cp nexo-staging-autodeploy.service nexo-staging-autodeploy.timer ~/.config/systemd/user/
systemctl --user daemon-reload
bash ~/staging-auto/autodeploy.sh --check-only                   # the checks only, no deploy
systemctl --user enable --now nexo-staging-autodeploy.timer
```

`loginctl enable-linger` keeps user timers running without a login session.

## Where to look

- `/nexo-staging/deploy-status.json` (public, without server paths):
  - `state`: `checking`, `deploying`, `deployed`, `failed`, `rolled-back` or `broken`;
  - `commit` and `subject`;
  - `step`;
  - `log_tail`.
- `~/staging-auto/history.tsv`: one line per step.
- `~/staging-auto/runs/<time>-<sha>/log.txt`: the last 30 runs.

## Commands

```bash
bash ~/staging-auto/autodeploy.sh --check-only                 # checks only
bash ~/staging-auto/autodeploy.sh --force                      # retry a commit that failed
echo <branch> > ~/staging-auto/branch                          # follow another branch; rm the file to go back
systemctl --user disable --now nexo-staging-autodeploy.timer   # turn it off
```
