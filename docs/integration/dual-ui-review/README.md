# Shared-backend review evidence

## Purpose
Keep Classic and the Team seven-step interface in one project, backed by one session-local preparation hub and shared analytical modules. Backend improvements can serve both interfaces while presentation changes remain isolated. Classic is the default; `LIPIDOMIC_INTERFACE=team` selects Team in a separate R process.

## Changes
- Route both shells through one shared data hub; separate Classic and Team presentation hooks/assets.
- Capture preparation requests, applied revisions, detection filters, QC decisions and invalidation. Preserve distinct Classic/Team missing-value policies.
- Add confirmed explicit metadata mapping and versioned ZIP persistence with legacy restoration and cross-interface round trips. Restoration requires explicit preparation.
- Connect Team workflow, dashboard, companion and lipidomics-informed 3D views to applied data. Additional view calculations do not mutate the scientific preparation state.
- Fix advanced-view output IDs, ZIP accordion hydration, first-render plots and premature plot-event warnings.
- Harden archive/CSV/logging boundaries, disable implicit runtime package installation, and pin math rendering entry assets with integrity checks.

## Max's review decisions implemented
1. **Classic empty selection:** NULL or an empty widget selection resolves to all numeric sample columns on the next explicit Run. The UI explains this. QC removals apply afterward; an empty post-QC cohort fails instead of restoring excluded samples. Team deliberately retains explicit-none semantics and design confirmation.
2. **Metadata and reference design:** exact ID mapping, safe optional columns, extra master-metadata rows handled with a warning, alphanumeric visits, direct hub adapter and versioned sidecar. The proof now uses an explicit Control/Treatment metadata fixture, not filename regex pooling; fixture labels are generic reproducibility assignments, not biological claims.
3. **Annotations:** the standalone proof loads the production multi-chain parser's pure assignments; the single-colon stub is removed. An independent Cer(d18:1/18:1) oracle requires SP_Cer and two double bonds.
4. **PCA:** Classic, reference and default Team individual-lipid PCA use log2(pmax(x,0)+1), cutoff 1e-10, centering and unit-variance scaling. Team's explicitly selected log10/linear or centered-only alternatives remain labeled. Class-level NIPALS remains separate.
5. **CI:** the workflow now calls the complete acceptance runner, installs declared/test dependencies and retains all evidence even on failure. Hosted GitHub execution is pending publication; local execution is not described as a green GitHub check.

## New verification
Tested runtime: `dfcbba4bace5e924a946e9775d37c2c57d314b2c`.
Documentation-only packaging HEAD: `9adebb42666f46059d6d1904cee3006191d3be77`.

- **57/57 acceptance jobs passed** on isolated RTX Linux, R 4.4.3, with stdout/stderr/combined logs.
- **36/36 version comparisons exactly match** for the declared preparation/limma/Wilcoxon scenarios.
- **19/19 required reference comparisons match.** The former optional PCA mismatch is replaced by a required canonical comparison. Annotation disagreements: zero.
- The default standalone proof runs successfully from an isolated minimal copy with explicit metadata.
- Tests exercise the actual dashboard PCA reactive on a rectangular fixture with zeros, constant and incomplete lipids; scores, loadings, variance and centered-only metadata are checked.
- Raw and prepared reference matrices remain byte-identical. Regenerated DE differs by at most ~1.01e-13 numerically; CPI/stress changes intentionally reflect the corrected parser. See the before/after artifact inventory.
- YAML parsing, CI dependency/wiring regression, patch reconstruction and package integrity checks pass. No dependencies were installed automatically by the application.

Historical browser ZIP evidence is retained with its original commit labels: four byte-identical prepared CSVs, 12 synthetic lipids × 8 samples. The existing screenshots are real historical captures, not new captures of this revision. This follow-up does not claim exhaustive new browser/physical-device coverage.

## Review request
Please review the single-hub architecture and the explicit policy boundary: Classic retains empty-widget compatibility while Team enforces explicit selection/design review. Confirm the explicit-run/pending-state UX, inspect intentional regenerated reference artifacts, and review Team-only views and dependency/media footprint.

Metadata, canonical parser and Classic PCA decisions were already agreed; they are not reopened here. This draft targets `integration/libreros-guided-workflow` from the isolated `review/shared-backend-dual-ui` branch. It consolidates the shared-backend/dual-interface candidate without large historical evidence dumps. Existing stacked drafts remain unchanged. The two intentionally regenerated canonical reference CSVs and small fixtures/manifests required by tests are included.

Before merge, recheck the target branch, run required GitHub checks on the integrated revision and obtain Max's review. This is a draft for review only; no merge or team deployment is part of this change.

## Known limits
- `HOST-IAB-MUTATIONOBSERVER` remains a separately tracked probable browser-preload issue; exact throwing call unconfirmed. It is not hidden or marked fixed.
- Physical-phone validation remains deferred; advanced UI evidence is scenario-specific.
- Live AI/provider privacy and production auth/TLS, quotas, retention/backups, full dependency locking and network/CSP policy remain deployment gates.
- Metadata CSV formula protection is not guaranteed lossless re-import; legacy ZIPs without checksums cannot prove original file identity.
- Inherited whitespace findings remain recorded; original logs/vendor assets were not reformatted simply to hide diagnostics.

## Reproduce
Use a disposable checkout with dependencies already installed. `reproduce.sh` in the review packet creates an isolated baseline from pinned `d48933c`, runs all acceptance jobs with companion AI disabled, and writes evidence outside the checkout.

```sh
Rscript --vanilla tests/dual-ui/run_acceptance.R /path/to/baseline /path/to/new-evidence
LIPIDOMIC_INTERFACE=classic LIPIDOMIC_COMPANION_AI=0 Rscript --vanilla -e 'shiny::runApp(".", host="127.0.0.1", port=3926, launch.browser=FALSE)'
# Separate terminal, separate available port:
LIPIDOMIC_INTERFACE=team LIPIDOMIC_COMPANION_AI=0 Rscript --vanilla -e 'shiny::runApp(".", host="127.0.0.1", port=3927, launch.browser=FALSE)'
```

Integration base: `06baf3a9ea776b581ed6f8f817921dedf7f020cb`. Publication branch: `review/shared-backend-dual-ui`. All 166 implementation files were SHA-256 verified against the tested candidate before publication. Concise evidence is in [docs/integration/dual-ui-review](docs/integration/dual-ui-review); hosted CI will retain full logs as a downloadable artifact.
