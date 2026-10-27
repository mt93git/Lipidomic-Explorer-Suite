# Proposed sample metadata contract · v0.1

**Review proposal, not a production migration.** The standalone prototype is in `prototypes/metadata-contract/contract.R`. Neither interface imports it. It changes no data, settings, models, or existing ZIP format.

## One matrix column, one metadata row

UTF-8 CSV with a header; every column is read as **text**. `SampleID` is the only universally required field. It must match an abundance matrix column exactly, including case and leading zeros. Never infer a donor, disease, tissue, time, or group from a filename. A donor may have several samples: `SubjectID` is not `SampleID`.

| Field | Meaning | Required when |
|---|---|---|
| SampleID | Exact abundance-column identifier | Always |
| Condition | Explicit analysis group; e.g. Control / Sickle cell | A group comparison is selected |
| SubjectID | Pseudonymized donor or biological unit ID | Paired / repeated-measures analysis |
| Tissue | Tissue, cell population, or specimen description | Study-dependent; review whether these need separate fields |
| ReplicateID | Technical replicate identifier, not another donor | Technical replicates exist |
| Batch | Acquisition or extraction batch; split into two fields if needed | Batch assessment/modeling is intended |
| TimeValue + TimeUnit | Numeric time as text plus explicit unit | Numeric time is supplied |
| SampleType | `study`, `pooled_qc`, `blank`, or `standard` | Recommended for QC; absence means unknown, not study |
| Additional columns | Display-only context unless explicitly mapped | Optional |

Use pseudonymous IDs rather than names, email addresses, or dates of birth. The example is explicitly synthetic. None of the public tests contain human study data.

## Preview → confirm → apply

1. Upload abundance matrix, then metadata. Validate IDs without modifying either file.
2. Show matched, missing, duplicate, and extra rows. This proposal blocks unmatched extra rows until the user explicitly selects/exports the intended subset. This is intentionally stricter than the guided importer, which currently reports unused rows but permits them.
3. Reorder only by exact `SampleID` to the matrix column order. Never repair case, whitespace, zeros, or guessed names silently.
4. Ask the user to map scientific fields and review pairing, time units, and potential batch confounding. Unmapped fields stay in a separate display table.
5. Require confirmation. The prototype returns a value; future UI integration must apply it through the hub, invalidate prepared results, and require re-preparation. No automatic rerun, outlier exclusion, model selection, or parameter change occurs here.

| Common source (explicit suggestion) | Shared hub target | Legacy parsed-term target |
|---|---|---|
| SampleID | FullName | FullName |
| Condition | Group1 | Group1Term |
| Tissue | Group2 | Group2Term |
| ReplicateID | Replicate | ReplicateTerm |
| SubjectID | PatientNumber | PatientTerm |
| TimeValue | TimePoint | TimePointTerm |

These are **suggestions, not fixed biological roles**. Users can choose another source column. `TimeUnit`, batch, sample type, and all other columns remain in `display_metadata`; returning these fields does not add a covariate or implement QC standards analysis. Mixed time units cannot be silently mapped to numeric TimePoint. Categorical visit labels require an explicit choice instead.

A call such as `confirm_metadata_v01(stage, confirmed=TRUE)` is the prototype boundary, not an authentication control. The UI must bind confirmation to the exact preview revision; changing the upload/mapping invalidates it. The prototype revalidates its payload at confirmation, but does not implement a UI revision token or server-side authorization.

## Compatibility and safety decisions

- Round-trip CSV reads preserve literal `NA`, accents, commas, quotes, and identifiers such as `001`.
- Extra columns cannot overwrite scientific fields: they live in a separate table keyed by SampleID. Never blindly merge an uploaded `Group1` or `FullName` into hub state.
- Max's legacy mapper replaces literal `SHIELD` with `_`. The parsed-term adapter rejects this lossy case; the direct hub adapter preserves it. Agree a migration/escaping rule before wiring a general importer to legacy parsing.
- Paired validation in this prototype supports exactly two conditions and one sample per donor per condition. Repeated visits or technical replicates require an explicit selection/aggregation/modeling decision; they are not globally invalid metadata.
- A repeated SubjectID in independent mode produces a warning; no model is silently selected. The confounding check is a screening warning, not a complete design-rank assessment.
- Strings remain untrusted data. Future cards must use escaped text and white backgrounds. Formula-safe spreadsheet downloads must escape a **display/export copy**, while the lossless machine-readable metadata remains separate. This prototype is not a web renderer or a safe spreadsheet-export implementation.
- Current ZIP/session formats are unchanged. Proposed future extension: a versioned metadata sidecar containing the original table, mappings, matrix identity/hash, confirmation revision and provenance. Keep a reader for old sessions; never restore metadata onto a different matrix based only on matching column names.

## Decisions requested from Max, Stephania and Usman

Agree the field names and biological unit, sample-type vocabulary and standards/QC workflow; resolve multiple injections per donor; decide extra-row handling and time representation; agree the shared hub mapping and ZIP migration. Confirm which fields are display-only versus scientific model terms. Only then integrate this prototype behind an explicit preview/confirmation UI.
