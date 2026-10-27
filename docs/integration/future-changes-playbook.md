# Integrating future changes without splitting the project

Status: proposed team working agreement; subject to Max’s review. Based on PR #5 head ed296d57b8fd41186ac5bcca5cd3f26ea31f2225. This document does not authorize merges or deployments.

## One project, two shells

Classic remains the default. Team is selected with LIPIDOMIC_INTERFACE=team in a separate R process. Both create one shared_data_server per Shiny session. Shared preparation owns the applied request, matrix, metadata and QC decisions; a frontend must not create its own second preparation pipeline.

| Change | Primary location | Review and verification |
| --- | --- | --- |
| Preparation, filtering, imputation, QC or statistics | R/modules, R/utils_preparation.R, R/ux_preparation.R | Both interfaces, numerical parity and explicit scientific review |
| Metadata or persistence | R/utils_sample_metadata.R, R/utils_session_archive.R, shared hub | Exact IDs, validation, legacy ZIP and cross-interface round trips |
| Classic presentation | R/frontends/classic and Classic assets | Classic browser flow; Team startup/shared-contract smoke test |
| Team presentation | R/frontends/team, www/team | Team workflow/mobile viewport; Classic startup/shared-contract smoke test |
| Team dashboard or 3D calculations | R/results_dashboard.R, R/cell_show.R | Independent numerical oracle where applicable; measured/interpreted/simulated labels; no hidden preparation mutation |
| Dependencies or CI | DESCRIPTION, .github/workflows | Fresh hosted CI, both launches, no implicit runtime installs |

## While PR #5 is under review

Keep review/shared-backend-dual-ui stable. Start follow-up work from its pinned head on a new branch/worktree. Do not push to its head, the integration branch or main as part of a follow-up. If Max changes the target branch, fetch and test that combination on a disposable reconciliation branch; propose the resulting patch for review. Do not silently resolve scientific conflicts with “ours” or “theirs”.

## After an agreed integration

Agree one development base (normally main after the reviewed release). Both contributors create short-lived topic branches from that base. Frontend-only changes and backend changes use the same repository and review process. No permanent second scientific fork.

1. Record the starting commit, baseline artifact version and intended behavior before editing.
2. Fetch origin and inspect incoming changes. On your topic branch, merge the agreed base or rebase only an unpublished branch. Avoid rewriting shared review branches.
3. Classify conflicts: presentation, shared contract, scientific algorithm or reference artifact. Scientific/reference conflicts require an explicit decision and before/after evidence.
4. Add a regression that fails for the actual bug or an independent numerical oracle for changed math. Do not regenerate expected values merely to make tests pass.
5. Run the complete acceptance suite and relevant browser scenarios on the combined revision. Record both branch heads and the tested commit.
6. Request review with exact behavior changes, numerical deltas, intentional policy differences, ZIP compatibility and rollout notes. Merge only after agreement and passing checks.
7. Deployment is a separate decision: use an isolated staging process first, preserve the previous release/configuration and check restore compatibility before touching the team service.

## Required gates for shared changes

- Classic empty selection means all numeric columns before QC removals; Team explicit-none must remain empty. All-excluded cohorts must fail safely.
- Pending edits must not replace the applied scientific state without explicit Run/confirmation. Restoring ZIP invalidates preparation and requires review/preparation.
- Same explicit accepted request and seed must produce matching prepared matrices. Different frontend defaults are not evidence of a numerical regression.
- Default individual-lipid PCA uses log2(pmax(x,0)+1), complete finite rows, variance cutoff 1e-10, centering and unit-variance scaling. Explicit exploratory alternatives and class-level NIPALS must remain labeled separately.
- Metadata IDs remain exact strings; duplicate/missing mapping is surfaced. Sidecar schema changes need migration and legacy tests.
- No secrets, human study data or private logs in the repository or CI artifacts. Use synthetic/public fixtures.

## Reproducible acceptance

Run from an isolated candidate checkout with dependencies installed explicitly; keep evidence outside the checkout:

```sh
BASELINE_DIR=$(mktemp -d)
EVIDENCE_DIR=$(mktemp -d)
git archive d48933ca20e59e67def18f29bc3cf035b81e1ca2 | tar -x -C "$BASELINE_DIR"
R_PROFILE_USER=/dev/null R_ENVIRON_USER=/dev/null LIPIDOMIC_COMPANION_AI=0 LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL=0 Rscript --vanilla tests/dual-ui/run_acceptance.R "$BASELINE_DIR" "$EVIDENCE_DIR"
node tests/dual-ui/test_shown_layout_reentrancy.cjs
```

The pinned baseline is historical; changing it requires a documented reference decision. The workflow tests GitHub’s temporary merge revision, not just a contributor’s isolated branch. Archive run-info, sessionInfo, manifest, stdout/stderr and comparison CSVs. A passing CI is not proof of every UI or physical-device interaction.

## Browser checklist for each release candidate

Record commit, browser/viewport, fixture hash and explicit settings. In both shells: upload, verify metadata/design, prepare, inspect QC, cancel then confirm an exclusion, rerun, inspect Results, download real CSV and figure files, export ZIP, restore into a fresh session, verify pending state, rerun and compare exported data. Test Team-to-Classic and Classic-to-Team restoration. For Team also inspect the seven-step navigation, local companion, 3D labels and narrow viewport. Physical-phone keyboard validation remains an explicit separate gate.

## Review template

Problem and resulting behavior; shared or frontend-only scope; base/head commits; tests and CI URL; data/reference differences; browser evidence; legacy ZIP behavior; known limits; requested reviewer decisions; deployment/rollback requirements. Never state “fully verified” when scenarios are pending.
