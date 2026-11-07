# Weekly release checklist (person on duty)

## 1. Release PR
- [ ] Every PR meant for this release is merged into `integration/libreros-guided-workflow`.
- [ ] CI is green on integration.
- [ ] Open the release PR: integration into `main`. List the merged PRs in its description.
- [ ] One approval from someone other than you, then merge.

## 2. Tag
- [ ] Pick the next version: patch for fixes only, minor for new features, major for breaking changes.
- [ ] Tag the merge commit on main: `git tag -a vX.Y.Z <sha> -m "vX.Y.Z"` and push the tag.

## 3. Deploy production from the tag
- [ ] Check out the tag, never a branch.
- [ ] Back up the current production release and its configuration.
- [ ] Write down the rollback command and make sure it works before switching.
- [ ] Deploy, keeping the server's configuration (environment values and keys live on the server, never in the repo).
- [ ] Check that the version shown in production matches the tag.

## 4. Check
- [ ] The app starts with no errors in the log.
- [ ] Team and Classic both load.
- [ ] Results on the QA copy match the previous release (same plots, same numbers).
- [ ] Autosave works.
- [ ] If anything fails, roll back first and investigate after.

## 5. Tell the team
- [ ] Short email: version, what shipped (PR list), anything to watch.
- [ ] Paula checks her test project on production.
