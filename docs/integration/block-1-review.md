# Integration block 1: preserve sample identity

Status: proposed changes for Max's review. No deployment or merge to `main`.

The first block transfers two narrowly scoped scientific safeguards from the guided application into the existing shared pipeline. It preserves the classic interface and all preparation defaults. Metadata upload, guided navigation, dashboards, companion and 3D remain subsequent blocks.

## Changes to review

1. **Paired local tests:** when observations are missing at different positions, remove incomplete pairs together. Previously, removing missing values separately could pair different subjects and produce a plausible but incorrect p-value. Unequal input lengths now return `NA`, because the function cannot establish a positional match. Independent tests and complete pairs retain their existing behavior. This changes the local t-test / Wilcoxon helper, not limma's differential-expression implementation.
2. **Explicit QC removal:** `remove` takes precedence over global averaged substitution. Previously, a removed sample could reappear as the mean of its peers when global substitution was enabled. Explicit `average`, unchecked-sample substitution, undo/keep and the pre-QC view remain available.

Only `R/modules/1_shared_data_module.R` and `R/modules/utils_stats.R` change application behavior. The rest is tests, a frozen comparison fixture, CI and review documentation.

## Reproducible references

- Original repository: `mt93git/Lipidomic-Explorer-Suite`.
- Pinned upstream: `d48933ca20e59e67def18f29bc3cf035b81e1ca2` (v12.1).
- Candidate: the commit containing this document on `integration/libreros-guided-workflow`.
- Guided source: eight production function assignments frozen in `tests/integration/guided_snapshot.R`; original source-file SHA-256 and function hashes are in `guided-source-manifest.csv`. The runner verifies function hashes before comparing.
- Fixture: 120 artificial features × 12 artificial samples, two groups of six, with deterministic missingness. Generated algebraically by `synthetic_fixture()`; not patient data or a clinical result.
- Runtime recorded in `evidence/sessionInfo.txt` (R 4.4.3 on Linux for the recorded run). Exact cross-version floating-point equality is not promised; comparison tolerance is `1e-10`.

The harness extracts and executes the real preparation and statistics functions. Only session/input access, logging and reactive-value setters are replaced. It does not execute Shiny observers or simulate browser clicks.

## Identical parameters, not identical defaults

Six scenarios: normalization **none / median / PQN**, each with imputation **off / QRILC**. Seed 42, all samples selected, detection threshold 0%, no all-absent removal, no per-file zero substitution, no residual-NA-to-zero substitution and no outlier treatment. The same prepared matrix goes into the real limma and Wilcoxon functions; contrast is Comparison minus Control.

The guided app adds detection controls, fail-closed QRILC handling, different missing-value defaults and study-design gates. This comparison explicitly aligns settings; it does **not** claim that default runs of the full applications are equivalent. Those additional changes require later review.

## Recorded results

| Check | Result |
|---|---|
| Prepared matrices, both comparisons, six scenarios | 12/12 PASS; maximum absolute difference 0 |
| limma log2FC, raw p, BH-adjusted p and t statistic | 12/12 PASS; maximum absolute difference 0 |
| Wilcoxon log2FC, raw p and BH-adjusted p | 12/12 PASS; maximum absolute difference 0 |
| Repeat preparation, all three versions | 18/18 identical, including QRILC |
| Reverse limma contrast | 18/18: sign reverses; raw and adjusted p-values unchanged |
| Existing suites on pinned upstream | 6/6 PASS |
| Existing suites on candidate | 6/6 PASS |
| New safeguard regression suite | PASS |

Intentional differences, checked against independent base-R tests:

| Asymmetric missingness in paired test | Original | Candidate / guided / correct complete pairs |
|---|---:|---:|
| Local paired t-test p-value | 0.03668199 | 0.06627560 |
| Local paired Wilcoxon p-value | 0.05447404 | 0.09751254 |

With explicit `remove` plus global averaged substitution, the original reintroduces S02; both the candidate and guided snapshot keep it excluded. These values describe artificial test data only.

CSV summaries and test transcripts are in `evidence/` (trailing whitespace trimmed; the local R-environment path redacted). Both versions emit the same harmless locale warning because `en_US.UTF-8` is not installed; the tests run under `C.UTF-8`. The runner also emits the artificial input, all prepared matrices and statistical outputs for inspection. CI retains these as an artifact.

## Repeat the comparison

From the repository root, with dependencies available:

```bash
mkdir -p /tmp/lipidomic-block1-baseline
git archive d48933ca20e59e67def18f29bc3cf035b81e1ca2 | tar -x -C /tmp/lipidomic-block1-baseline
Rscript --vanilla tests/test_integration_safeguards.R
Rscript --vanilla tests/integration/compare_versions.R /tmp/lipidomic-block1-baseline /tmp/lipidomic-block1-evidence
```

Required comparison packages: shiny, dplyr, tibble, tidyr, digest, limma, statmod and imputeLCMD (with dependencies). The new CI workflow installs these explicitly. The complete existing app suites require the repository's normal application environment.

Existing suites executed separately for **both** source trees: recursive syntax, restore helper, pathway logic, statistical engine, targeted fallback simulation, session roundtrip simulation. The ZIP suite is a serialization/hydration simulation; it is **not** evidence of a new browser download/restore test in this block.

## Decisions for Max

- Approve `remove` taking precedence over global averaging and the complete-pair policy.
- Confirm that callers supply paired observations in matching subject order. This patch prevents missing-value misalignment; it cannot reconstruct subject identities from two unnamed vectors.
- Agree on the next block: metadata contract and preparation/QC state, including which settings invalidate prepared results and how synthetic samples are represented.
- Review guided-only policies separately: detection filtering, QRILC failure behavior, design confirmation and synthetic-sample restrictions. No silent statistical-policy migration.

## Continuous synchronization and remaining work

Keep this draft PR reviewable. Bring later `main` commits into the integration branch, rerun this pinned-baseline comparison and all affected tests, resolve conflicts explicitly and review before merging. Update the pinned baseline only in a separately reviewed change. After initial integration, use short branches and small PRs into the same `main`, with agreed release tags.

- [x] Freeze comparison sources and synthetic fixture.
- [x] Transfer two scientific safeguards with regression evidence.
- [x] Compare preparation, limma and Wilcoxon under matched settings.
- [x] Run existing suites against upstream and candidate in an isolated directory.
- [ ] Max's review and agreement on scientific policies.
- [ ] Metadata and guided QC integration.
- [ ] Guided interface, plots/exports, companion and 3D integration.
- [ ] Browser regression of the integrated interface and real ZIP roundtrip.
- [ ] Physical-phone testing (previously deferred).

The team service was not restarted, deployed or modified. No sample uploads, credentials, API keys or application runtime configuration are included in this PR.
