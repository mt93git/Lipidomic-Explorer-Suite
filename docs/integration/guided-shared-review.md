# Guided presentation connected to the shared hub

This is an **opt-in integration preview**, based on `integration/shared-preparation-qc`. Start with `LIPIDOMIC_INTERFACE=guided Rscript -e 'shiny::runApp(".")'`; omitting that environment variable retains Classic. This branch does not change the team's deployed app or main.

## What is connected

The seven-step presentation uses the existing hub, QC controls, preparation controller and analytical modules. It moves existing bound controls instead of cloning IDs. The scientific engine is not forked. Results links open the native analytical tools, including violins. The existing reference-cell viewer reads the same prepared matrix through a read-only adapter. The companion AI backend and the full production dashboard styling are not ported in this block; this preview is not a replacement for the deployed guided application.

## Decisions incorporated from Max

- Exact `SampleID` matching and explicit metadata mapping. Descriptive fields (including Batch and SampleType) stay outside the scientific factor table unless mapped explicitly.
- Confirmed uploads go directly to the hub and bypass the legacy SHIELD token parser.
- Extra master-study metadata rows are omitted with a preview warning. Missing or ambiguous matrix identifiers remain errors.
- Incomplete longitudinal visits and more than two conditions are warnings at ingestion, not study rejection. Optional hub columns always exist; alphanumeric timepoints are preserved. This does not establish that every downstream model accepts every timepoint representation.
- Classic retains zero detection filtering, `dropNonDetected=FALSE`, remaining-NA cleanup, the production multi-chain annotation parser, and individual-lipid PCA `log2(x + 1)` with its existing variance cutoff. No alternate guided PCA engine is introduced.
- A clean synthetic Control/Treatment fixture is included. It contains no human-subject data and no filename-regex study inference.

## ZIP boundary and confirmation

New archives retain `state.json` and original files, adding `shared-state-v1.json` with metadata contract 0.1 and the applied preparation record. Mapping target names are explicitly serialized as an object: the browser roundtrip caught and fixed JSON's loss of named character-vector keys.

Restoring a ZIP hydrates files and settings but **requires review and Run Analysis before recomputation**. A Shiny server flush does not prove that client widgets have settled. Guided design confirmation is session-local, reset on restoration, and checked against the current data, selection and mapping at execution time. Legacy ZIPs without a sidecar remain supported; Classic metadata can be previewed and reconfirmed in guided mode.

Archive extraction rejects absolute/traversal/noncanonical paths, duplicate entries and excessive sizes before extraction. Entries are streamed into regular files without restoring symlinks or filesystem attributes; actual streamed sizes are checked as well. Restorations and uploads use session-specific directories, so identically named files cannot overwrite another session's matrix. Invalid files are rejected before hydration. Metadata subgroup labels are JSON-encoded before insertion into click handlers.

## Evidence and reproduction

Run:

```sh
Rscript --vanilla tests/guided-shared/test_metadata.R
Rscript --vanilla tests/guided-shared/test_hub_adapter.R
Rscript --vanilla tests/block2/test_preparation.R
Rscript --vanilla tests/block2/test_hub.R
Rscript --vanilla tests/integration/compare_versions.R PATH_TO_PINNED_BASELINE parity-evidence
Rscript --vanilla tests/block2/compare_references.R reference-evidence
```

The first test exercises actual ZIP serialization and extraction; the second runs the real Shiny hub and download handler. Browser evidence is separately recorded, not inferred from these tests. Download hashes cover a fresh guided session with detection 5%, normalization none and QRILC disabled, and a legacy archive produced by the unmodified Classic baseline with its defaults. Both restored matrices matched the corresponding original download byte for byte.

The historical standalone-proof PCA/annotation disagreements remain explicitly disclosed in the reference comparison. The production-matched PCA check passes. Updating the standalone proof itself belongs to the separate reference work, not this presentation adapter.

## Review before consolidation

1. Confirm the intentional-empty-selection policy: uninitialized selection uses defaults, but an explicit Unselect All must not silently reinclude samples.
2. Review the new restore review barrier (including Classic) and metadata sidecar versioning.
3. Review the adapter boundary and determine the next production presentation components to migrate.
4. Consolidate the reviewed commits onto `integration/libreros-guided-workflow` only after agreement. No merge is performed by this task.

The physical-phone keyboard check remains pending, as requested. Numerical parity on the stated fixtures is not a claim of universal scientific validity or a complete visual audit of every advanced tool.

## Adversarial review follow-up

Opus 5.5 (Libreros Lab, Fabric task `t-20261026-232941-69ba`) reviewed candidate 6186ffc statically. Its first verdict was **do not consolidate yet**. No executable tests were performed by that reviewer. The implementation now addresses its findings as follows:

- H1: both subgroup buttons JSON-encode labels; action/approval inputs are excluded from session state.
- H2/H5: invalid staging is a recoverable validation result; optional mappings start empty; approval is bound to the reviewed token and reset on every restoration. Automated actual guided-server checks include a stale checked-box attempt.
- H3: ordinary uploads, missing-file recovery and restored files use private directories; duplicate basenames receive distinct paths.
- H4: reconfirming unchanged native Classic metadata preserves native clusters, timepoint grouping and display labels. Explicit remapping is a separate scientific change.
- H6/H9: unmapped descriptive SampleType/TimeValue labels warn rather than reject ingestion. Explicit numeric time mapping still validates values and units. Longitudinal design warnings are surfaced without choosing a statistical model automatically.
- H7: CI runs metadata/archive, actual guided-server and focused production-hub suites. Full application bootstrap is additionally exercised on the isolated RTX runtime.
- H8: the 3D adapter receives the full applied matrix, matching Share; filenames never infer a study label in this integration branch.
- H10: default-launch/navigation/QC paths cannot bypass guided approval or the restored-session review barrier.
- H11: token uses the hub's cached data identity. Selection changes intentionally still require review; whether to relax that remains a review decision.

Additional validation found that zip_list permission bits do not reliably identify symbolic links. Archive entries now stream to regular files with both declared and actual byte limits. A restore clears prior prepared results. Failed hydration stages stop rather than reporting success. A matrix/metadata mismatch is now a recoverable validation error and blocks preparation.

This does not certify all historical Classic controls or the full production guided UX. Physical-phone validation remains pending. No main merge, production deployment, or team service restart is part of this PR.
