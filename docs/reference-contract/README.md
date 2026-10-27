# Reference mathematics and common metadata · review package

This branch starts independently at upstream v12.1, `d48933ca20e59e67def18f29bc3cf035b81e1ca2`. It does not contain the fixes from PR #1, modify application runtime files, alter committed reference CSVs, or deploy anything. [PR #1](https://github.com/mt93git/Lipidomic-Explorer-Suite/pull/1) remains a separate review.

## Reproduce

Run from this repository root in an isolated checkout. The public demo workbook is the only abundance input; the metadata examples are synthetic.

```sh
Rscript --vanilla tools/reference_contract/compare.R reference-evidence
Rscript --vanilla tests/reference-contract/test_metadata.R reference-evidence
Rscript --vanilla tests/test_recursive_syntax.R
```

Use R 4.4.3 with `shiny`, `dplyr`, `tibble`, `tidyr`, `readxl`, `digest`, `statmod`, `imputeLCMD` and `limma`. Exact validation environment: `evidence/sessionInfo.txt`. CI installs these dependencies and retains full outputs as an artifact. The small evidence files in this directory are from the isolated RTX run. Absolute differences can look larger for very large intensities; checks also require maximum element-wise scaled error <= 1e-10, matching IDs/dimensions and missing/infinite masks.

The runner extracts actual functions from the parsed R source, replacing only Shiny/session I/O. It never sources application startup or the proof script's auto-execution. It refuses to write into `docs/proof_artifacts`. Both imputeLCMD and limma are mandatory: no simulated substitute is accepted. The guided function snapshot and its SHA-256 manifest are frozen from the same snapshot reviewed in PR #1; this is reproducible comparison code, not a second application engine.

## Findings

- The public Excel fixture has **747 lipids × 24 samples**. All five committed CSV artifacts reproduce within numerical tolerance. The preparation matrices from the proof, upstream hub, and guided snapshot agree exactly in the tested QRILC seed-42 / median-normalization / no-detection-filter scenario.
- Limma and Wilcoxon fold changes, raw p-values and BH-adjusted p-values agree on identical matrices. End-to-end limma also agrees within floating-point tolerance. This supplements PR #1's six-scenario synthetic comparison; it does not claim every study design or app tool is covered.
- CPI and eight shared cellular index formulas agree when supplied **identical annotations**. The simplified proof annotator differs from the production annotator for **469 subclasses and 409 double-bond counts**. It takes the first colon's number and uses a limited, case-sensitive prefix map. Example: `CER(d18:1/18:1)+H` is `Other / 1` in the proof versus `SP_Cer / 2` in the app. Neither parser is thereby independently validated against a curated lipid annotation standard.
- This is consequential: on the same prepared matrix, CPI ranges from **24.19–120.49** with proof annotations versus **93.54–246.03** with production annotations. These are algorithm outputs for the public demo, not measurements of cellular stress or a sickle-cell finding. See per-sample and per-lipid evidence.
- The proof constructs Control/Treated from sample-name regexes; it combines different non-Vehicle treatments into one group. The demo includes Huh7/Vehicle/TNFa/ACSM5 and time points. This reproduces the reference fixture, not a validated biological contrast. Real studies need explicitly confirmed metadata.
- The default app omics PCA uses `log2(x + 1)`; the proof PCA accepts the supplied `log2(x)` matrix. The runner tests the actual app PCA: the same transformation matches; the original transformation differs. The near-zero variance cutoffs also differ (1e-9 in the proof, 1e-10 in the app); the tested demo does not exercise that boundary. Class PCA aggregates linear subclass abundances and uses NIPALS; it is a different analysis and is not covered by the proof PCA parity check.
- The workbook contains 8,442 textual `N/A` missing markers. The proof emits 24 coercion warnings; the runner saves every affected input cell in `raw-text-to-missing.csv`. Review missingness semantics rather than treating every missing value as proven left censoring.

## Boundaries to agree before integration

1. **Reference annotations:** publish a reviewed annotation table with explicit resolution/unknowns, then generate reference cellular indices from it. Do not change the app to mimic the demonstration parser.
2. **Reference study design:** replace filename guesses with an explicit fixture metadata table and documented contrast. Preserve current reference artifacts as historical evidence.
3. **PCA transformation:** decide whether the scientific contract is log2(x), log2(x+1), or an explicit selectable mode; compare only the same mode, aggregation and filtering.
4. **Failure semantics:** the proof has a random substitute if imputeLCMD is absent; app/guided failure behavior differs. This runner fails closed on missing dependencies. Zero-residual-df / failed-model handling and paired designs remain separate from the successful unpaired comparisons here.
5. **QC interpretation:** the proof hardcodes a 20% CV flag and returns zero CV for non-positive means. The arithmetic test does not approve a universal QC threshold or those edge-case semantics; agree these with Usman.
6. **Metadata integration:** review [contract v0.1](metadata-v0.1.md) and the standalone adapters before modifying the hub or ZIP schema. Metadata fields do not themselves implement standard normalization, batch adjustment, or donor blocking.

## Review scope

Ask Max to review the annotated differences, reference group construction, PCA choice, common field mapping, and the required versus expected-difference checks. Ask Stephania/Usman for biological units, extraction/acquisition batches, internal standards, pooled QCs, technical replicates and time semantics. No clinical interpretation, anatomical reconstruction, or new biological behavior is asserted by this numerical comparison.

## Recorded validation

RTX R 4.4.3: 19 matching numerical comparisons, one asserted/disclosed PCA difference, three matching automatic-route scenarios, seven arithmetic checks, 38 metadata checks and the recursive syntax audit passed. Metadata checks also passed locally with R 4.4.2. Full regenerated matrices, DE tables, input-cell coercions and logs are CI artifacts, not new golden references. The checked-in summaries describe this run only.
