# Admin ingest

Pure TypeScript/Node library for SCIEX OS results TXT → dataset format 1 Excel.
No app framework, database, filesystem access, normalization, or imputation in `src/`.
Requires Node 22+. Direct dependencies are pinned; this package owns its lockfile.

```sh
cd packages/admin-ingest
npm ci
npm test
npm run typecheck
npm run build
```

After building, import from `dist/index.js` (or the package export when integrated):

```ts
import { parseSciexTxt, checks, classify, buildDatasetV1 } from './dist/index.js';

const parsed = parseSciexTxt(sourceText);
const review = checks(parsed, [
  { name: 'S1', type: 'Unknown' },
  { name: 'Blank1', type: 'Blank' },
]);
// The caller presents review results and resolves stop gates before release.
const classified = classify(parsed);
const xlsx = await buildDatasetV1(classified, {
  headerMode: 'sampleName',
  provenance: {
    sourceText,                  // exact original text, including BOM and newlines
    datasetVersion: '1',
    sciexOsVersion: 'provided by operator',
    processingMethod: 'provided by operator',
    signatures: [],              // supplied audit data; no signing performed here
  },
}); // Node Buffer; the caller decides where to save it
```

`parseSciexTxt(text)` requires literal `Sample Name` and `Sample Type` first-column
headers. It handles UTF-8 BOM, LF/CRLF, and a final newline. Names and ordering stay
unchanged. Empty/whitespace-only cells and `N/A` become `null`; numeric zero stays
zero. Decimal/scientific notation is accepted; nonfinite numbers, other text,
empty names, and inconsistent row widths fail with row/column context. Interior
blank lines fail rather than disappearing. The line iterator avoids a second
whole-file line array; the returned matrix remains in memory.

`classify(parsed, { dropList? })` returns `samples` (Unknown only), `lipids`,
`internalStandards` (with `kit`), `qcInjections`, `droppedRows`, effective `rules`,
and `counts`. Blank and Quality Control columns retain their original names and
all non-dropped lipid **and IS** rows in `qcInjections`. Inputs are not mutated.
Unsupported Sample Types fail clearly. IS recognition is `.IS` at the end or
`(IS)` anywhere. Kits match `_Ultimate_SPLASH_ONE.IS`, `_SPLASH.IS`,
`_SphingoSPLASH_ONE.IS`, `_Sigma.IS` (also a bare kit suffix); other IS rows use
`other`. Only exact names in the data-driven drop list are excluded. The default
is `['DAG(20:0_20:4)+NH4 b']`; `dropList: []` disables it.

Counts include all injections by observed type, retained lipid rows, IS rows per
kit, null-cell fraction (0–1), lipids with no detections, and min/median/max
detected lipids per sample. The last three metrics use **retained lipids × Unknown
samples**, excluding IS and Blank/QC. A detection means non-null, including zero.
Empty sets return zero summary metrics. For an even count, median averages the
middle two values.

`checks(parsed, registry?)` returns stable `{ id, status, message }` results:
`header-rows`, `sample-names-unique`, `sample-registry`, `planned-sample-types`,
`pooled-qc`, `blank-detection`. The parser validates header literals; the header
check validates the parsed header/matrix structure. A registry is an array of
names or `{ name, type? }` planned injections, including Blank/QC when present.
Missing names/type conflicts stop; omitted registry/plans are explicitly reported
as unchecked. Zero pooled QC injections warns. A Blank with detections **at least
80% of the Unknown median** stops and names the column. This conservative gate
also catches blanks above the median. IS and default drop-list rows do not count.
No Unknown samples or a zero median makes that comparison unavailable. The
threshold is an exported constant, not a calibrated scientific acceptance limit.

`buildDatasetV1(classified, options)` asynchronously returns `Promise<Buffer>`:

| Sheet (in order) | Contents |
| --- | --- |
| Abundance | `Lipid`, then Unknown sample columns; numeric values or empty cells |
| Metadata | Exactly `FullName, Group1Term, Group2Term, ReplicateTerm, PatientTerm, TimePointTerm` |
| Internal_Standards | IS rows, same sample columns as Abundance |
| QC_Injections | `Lipid`, then original Blank/QC headers; retained lipid and IS rows |
| Provenance | `Key, Value` rows; format 1, version, SHA-256, OS/method, raw peak area, filters, exclusions, signatures, header mapping, QC types |

Metadata input is an array keyed by `sampleName`, with `FullName` and optional
other metadata fields (strings/numbers/null). Rows are aligned to sample order.
`headerMode: 'fullName'` requires a nonempty, unique FullName for every included
sample; duplicate metadata join keys also fail. `headerMode: 'sampleName'` uses
original names even when metadata is supplied. Metadata's FullName column always
matches exported sample headers. Without metadata, other metadata cells are empty.
Blank/QC headers are never renamed. Lipid names, zeros, and doubles stay unchanged;
null cells are empty, never zero. The SHA-256 hashes the exact UTF-8 source text,
not normalized text. Missing optional provenance fields say `not provided`;
signatures default to `[]`. The builder does not enforce review/signature policy.

Only synthetic data is checked in: five injections and 40 analytes, including six
IS rows across all kit categories, one exact drop row, empty/N/A cells, and zero.
Unit tests cover parsing, classifications/counts, review gates, metadata errors,
provenance, and ExcelJS round trips of all exported matrices.

For the coordinator's private golden comparison:

```sh
ADMIN_GOLDEN_TXT=/private/path/results.txt \
ADMIN_GOLDEN_XLSX=/private/path/reference.xlsx \
npm test -- test/golden.test.ts
```

It skips unless both variables are set. It compares sample headers, lipid names,
and all cells with sheet 1, using relative numeric tolerance `1e-9` and treating
empty/`N/A` as null. The legacy A1 label `Sample Name` is accepted as equivalent to
`Lipid`; all other strings compare exactly. Counts and up to ten differing cell
addresses are reported. Reference sheet 1 must contain the same Unknown columns
and drop rules; a reference retaining Blank/QC columns fails the dimension check.
No private files are copied into this package.

See `TESTING.md` for observed red/green results. Remaining integration work: run
the private real-file golden comparison, connect caller metadata/review/audit
flows, and obtain actual processing provenance/signatures from Admin. Commits
were attempted at green steps but blocked by sandbox Git index permissions;
Fabric/coordinator must commit the files.
