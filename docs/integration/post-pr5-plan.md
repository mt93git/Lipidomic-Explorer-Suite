# Follow-up integration after PR #5

Proposal only. No push, PR creation, merge or deployment is authorized by this document.

## Pinned starting points

- PR #5 head: `ed296d57b8fd41186ac5bcca5cd3f26ea31f2225`.
- Reviewed follow-up candidate: `122f4615a8c3eaeeadc5946e048665d5def2a51a`.
- This automation/documentation work: `audit/dual-ui-replay-post-pr5`, branched from that candidate.
- Keep the production team service and PR #5 branch unchanged.

## Patch order and dependencies

| Commit | Scope | Dependency/review |
|---|---|---|
| 2697b1e | Unique metadata timepoint control, supported icon, contributor guide | PR #5 shared hub; review restored metadata behavior |
| 5f283b8 | Prevent nested layout-event recursion | Classic event handler; validate subsequent resizes still work |
| d342dfb | Document layout regression command | Depends on 5f283b8 test; documentation only |
| ef1664c | Keep Team palette renderer; contain Classic mobile layout | Shared hub from PR #5; distinguish Team and Classic policy |
| aee4c12 | Expanded mobile menu height | Follows ef1664c CSS |
| 122f461 | Wrap Analytical Ensemble caption/controls | Follows ef1664c CSS; 320/390 viewport evidence |
| New replay commit(s) | Browser scenarios and this plan | Test/docs only, after the six fixes |

Prefer preserving these commits, rather than squashing away the evidence mapping. The runtime fixes may be reviewed together; documentation and replay infrastructure can form a second review block. Do not cherry-pick the fixes again if Max has already incorporated equivalent changes.

## Reconciliation procedure (future, not executed)

1. Obtain Max's agreed target after PR #5 and record its exact SHA and merge strategy (merge, squash or rebase).
2. Fetch without changing existing branches. Create a new local reconciliation worktree at the agreed target.
3. Compare the six patches using `git range-diff` and `git cherry`; inspect equivalent changes when PR #5 was squashed. Apply only missing changes in dependency order.
4. Review conflicts in the shared hub manually. Never resolve scientific or metadata policy changes with blanket ours/theirs.
5. Run the 58-job acceptance suite on the reconciled revision against the pinned historical baseline; run the JavaScript layout regression and browser replays for both shells. Record commit, fixture hash, settings, screenshots, console messages and real download hashes.
6. Confirm empty-selection policy, explicit preparation after restore, and no scientific change without user confirmation. Require exact parity for unchanged math; explain intentional differences separately.
7. Review diff for credentials, patient data and unrelated files. Prepare a separate draft PR only on explicit authorization, including tested target/head SHAs and evidence.
8. Merge and deployment are separate approvals. Preserve a rollback revision and verify Classic/Team ZIP compatibility before any team-service change.

## Open gates

- Max's target/merge strategy and review of Classic behavior remain decisions, not assumed approvals.
- Hosted CI must run on the future combined revision; current local evidence cannot certify an unknown merge.
- Physical-phone touch/keyboard/chat confirmation tests remain deferred.
- Browser automation uses a CUA-capable runner. It is not yet a headless GitHub Actions browser job.
