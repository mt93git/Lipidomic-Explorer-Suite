# Observed verification

All fixtures and temporary golden references in this run were synthetic.
Commands below were run from the repository root unless marked otherwise.

TDD red runs (before each implementation):

| Command | Real result |
| --- | --- |
| `npm test --prefix packages/admin-ingest -- test/parser.test.ts` | Exit 1: `Cannot find module '../src/index.js'`; `Test Files 1 failed (1)`, `Tests no tests` |
| `npm test --prefix packages/admin-ingest -- test/classify.test.ts` | Exit 1: `classify is not a function`; `Tests 5 failed (5)` |
| `npm test --prefix packages/admin-ingest -- test/checks.test.ts` | Exit 1: `checks is not a function`; `Tests 6 failed (6)` |
| `npm test --prefix packages/admin-ingest -- test/workbook.test.ts` | Exit 1: `buildDatasetV1 is not a function`; `Tests 6 failed (6)` |

Green steps:

| Command | Real result |
| --- | --- |
| `npm test --prefix packages/admin-ingest -- test/parser.test.ts` | Exit 0: `Tests 14 passed (14)` |
| `npm test --prefix packages/admin-ingest -- test/parser.test.ts test/classify.test.ts` | Exit 0: `Tests 19 passed (19)` |
| `npm test --prefix packages/admin-ingest -- test/parser.test.ts test/classify.test.ts test/checks.test.ts` | Exit 0: `Tests 25 passed (25)` |
| `npm test --prefix packages/admin-ingest` | Exit 0: `Test Files 4 passed \| 1 skipped (5)`, `Tests 31 passed \| 1 skipped (32)` |
| `npm run typecheck --prefix packages/admin-ingest` | Exit 0: `tsc --noEmit -p tsconfig.test.json`; no diagnostics |
| `npm run build --prefix packages/admin-ingest` | Exit 0: `tsc -p tsconfig.json`; no diagnostics |

The initial build caught TS7006 in the parser iterator; its generator return type
was corrected, and subsequent builds passed.

Golden harness, run inside `packages/admin-ingest/`, using independently generated
legacy-layout synthetic Excel (not the builder's output):

```sh
ADMIN_GOLDEN_TXT=/private/tmp/admin-ingest-golden-synthetic.txt \
ADMIN_GOLDEN_XLSX=/private/tmp/admin-ingest-golden-synthetic.xlsx \
npm test -- test/golden.test.ts
```

Observed output:

```text
Golden comparison: rows=34 columns=4 cells=136 numeric=68 null=31 differences=0
Classification counts: {"samplesByType":{"Unknown":3,"Blank":1,"Quality Control":1},"lipidsKept":33,"internalStandardsByKit":{"Ultimate_SPLASH_ONE":1,"SPLASH":1,"SphingoSPLASH_ONE":1,"Sigma":1,"other":2},"nullCellShare":0.31313131313131315,"lipidsNeverDetected":1,"detectedLipidsPerSample":{"min":16,"median":20,"max":32}}
Test Files  1 passed (1)
Tests  1 passed (1)
```

Dependency installation required the existing local npm cache because registry DNS
is unavailable in this sandbox. Recovery happened under `/private/tmp` only;
package dependency declarations and resolved lockfile URLs use the npm registry.
Optional native dependency lock entries cover other platforms as well as this Mac.
A real-data golden run remains the coordinator's task.

`git switch admin/phase1` and each attempted green-step `git add ... && git commit`
failed with exit 128:

```text
fatal: Unable to create '<repo>/.git/worktrees/router-20261107-172702-883392/index.lock': Operation not permitted
```

No push or gh commands were used. All repository writes stayed inside
`packages/admin-ingest/`.

A clean install also succeeded with exit 0 (`added 152 packages in 7s`):

```sh
npm ci --prefix packages/admin-ingest --offline --ignore-scripts \
  --no-audit --no-fund --cache /private/tmp/admin-ingest-npm-cache
```

A deliberate synthetic reference mismatch (`B2` increased by 1) was rejected:

```text
Golden comparison: rows=34 columns=4 cells=136 numeric=68 null=31 differences=1
B2: actual=1400.123456789 expected=1401.123456789
Test Files  1 failed (1)
Tests  1 failed (1)
```

One concurrent verification run hit Vitest's default 5000ms timeout during Excel
ZIP initialization (`1 failed | 30 passed | 1 skipped`). Test files now execute
sequentially with a 30-second timeout to accommodate shared-host load; no data
assertions were removed.

Final sequential suite after the timeout configuration change:

```text
Test Files  4 passed | 1 skipped (5)
Tests  31 passed | 1 skipped (32)
Duration  30.50s
```

The original independent synthetic golden reference was rerun after the deliberate
mismatch and passed again (`1 passed`, `differences=0`, 136 cells).
