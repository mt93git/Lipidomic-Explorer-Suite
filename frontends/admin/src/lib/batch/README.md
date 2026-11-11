# Batch engine

Pure TypeScript planning and CSV export. No UI, database, I/O, or added dependencies.

`buildBatch(input: BatchInput): BatchResult` accepts:

- `samples`: `{ code, FullName, client_id, aliquot_id }[]`. FullName is the registry's
  `full_name`, supplied under the metadata spelling `FullName`. The lab-generated
  sample code becomes the Unknown injection name; client-written FullName stays
  separate for the bench sheet. IDs are opaque nonempty strings; callers supply
  the registry/aliquot relationship and lab-generated codes.
- `rules`: `{ blanksAtStart, pooledQcEvery, blankAfterQc, qcAtEnd, randomize, seed }`.
  Counts are non-negative safe integers; `pooledQcEvery: 0` disables interval QCs.
- `plateLayout`: `{ plate: "Plate 1", order: "column-major" | "row-major" }`.
- `minutesPerInjection`: a finite positive number, including fractions.

The result contains `injections`, `estimatedRunTimeMinutes`, and
`validationMessages` (`{ code, message }` errors). Invalid inputs return no
injections and zero minutes; there is no partial or truncated export. Empty
sample selections, duplicate trimmed codes, and overflow are rejected, along with
invalid counts, durations, empty names/IDs/codes, and invalid layouts. Null,
undefined, or non-string sample fields return `invalid_sample`. Randomization
without a nonempty string seed returns `invalid_rules` (including whitespace-only
seeds). Invalid durations, including run-time overflow, return `invalid_duration`.

## Placement and naming contract

1. Shuffle only the Unknown samples when enabled, then prepend `blanksAtStart` blanks.
2. Insert a pooled QC after each `pooledQcEvery` Unknowns. Controls do not count
   toward that interval. An incomplete last interval produces no periodic QC.
3. `qcAtEnd` adds a QC after the last Unknown unless an interval QC already goes
   there. `blankAfterQc` adds a blank after **every** QC, including the end QC;
   in that case the last injection is a blank.
4. Assign one distinct well per injection, including every blank and QC. Capacity
   is 96 total injections on one plate; control-vial reuse and additional plates
   are not supported. Column-major is A1, B1, …, H1, A2, …, H12; row-major is
   A1, A2, …, A12, B1, …, H12. Wells have no zero padding. Assignment follows
   final injection order, so the bench sheet describes how to load the plate.
5. `seq` starts at 1. Each Unknown's `sample_name` is its trimmed sample code
   (e.g. `ORD041-S037`), compatible with `release.ts`'s `matchSamples` code match.
   Sample and injection names never incorporate client-written text, following the
   coordinator's wave 1 decision. Each injection also has a separate `FullName`
   field, trimmed consistently with registry saves. Duplicate code comparison is
   case-sensitive across the whole batch, including clients. Different codes may
   share a FullName; order-level FullName uniqueness remains the registry's concern.
6. Controls use `Blank_001`, `Blank_002`, … and `QC_001`, `QC_002`, …, skipping names
   already used by any Unknown or control. Their `FullName`, `client_id` and
   `aliquot_id` are null. Unknown IDs and FullName stay attached during shuffling.

The seed is hashed with FNV-1a over JavaScript UTF-16 code units, then fed to
Mulberry32 and a descending Fisher–Yates shuffle. Identical inputs, including the
initial sample order and seed, yield identical results. Seeds are required only
when randomization is enabled; valid seeds are hashed as supplied, without trimming.
Inputs are never mutated and `Math.random` is not used. Different seeds may
coincidentally yield the same permutation, especially for small batches.

Estimated minutes = total injections × minutes per injection, without rounding.
Loading, equilibration, and other overhead are excluded. Non-finite totals fail
validation.

## CSV exports

Both exports accept `readonly Injection[]`, preserve the supplied order, return a
string with CRLF records and a trailing CRLF, and quote commas, quotes, CR, and LF
using RFC 4180 escaping. Nulls are empty cells; an empty list exports only headers.
Every text cell starting with `=`, `+`, `-`, `@`, tab, or carriage return gets a
single quote prefix before RFC 4180 escaping, neutralizing spreadsheet formulas.
This applies to both generic exports and the SCIEX adapter, including free-text
IDs and plate labels. Numeric cells are unchanged; injection objects are not
mutated. The sequence exports lab-generated names and omits FullName.

| Function | Columns, in order |
| --- | --- |
| `toSequenceCsv(list)` | `seq,sample_type,sample_name,client_id,aliquot_id,plate,vial` |
| `toBenchSheetCsv(list)` | `plate,vial,seq,sample_type,sample_name,FullName,client_id,aliquot_id` |

`sciex-adapter.ts` exports `toSciexBatchCsv(list)` separately. All SCIEX-specific
mapping is isolated there, with placeholder columns prefixed `PENDING_`.
**PENDING: Usman's blank SCIEX OS template**. This output is not a verified
instrument import. Replace the adapter mapping when the template arrives; the
generic exports and planning contract do not depend on it.

## Tests

From `frontends/admin`: `npx vitest run tests/batch.test.ts`.
The test lives in the existing `tests/` discovery path, so `npx vitest run` includes
it without configuration changes. All fixtures are synthetic. Full project checks:
`npx vitest run && npx tsc --noEmit && npm run lint && npm run build`.
Build `packages/admin-ingest` with `npm ci && npm run build` first, and run
`npm ci` in Admin if dependencies are absent.

Remaining work: verify the adapter against Usman's template. UI, persistence,
staging SQL checks, and browser demos are outside this pure-module task.
