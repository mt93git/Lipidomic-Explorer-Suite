# Admin, phase 1, wave 1: shared brief for agents

Read this whole file before starting. Every wave-1 task works on branch `admin/phase1`.

## What Admin is

Lipidomic Explorer **Admin** is the lab's back office for the lipidomics service of the Libreros lab
(Yale): clients and their people, orders, sample arrival and metadata, the batch the SCIEX Triple Quad
7500 (with a Shimadzu LC-40R) runs, the results TXT that SCIEX OS exports, quality review, and the signed
dataset (Excel) that the analysis app opens. Today all of this is done by hand in Excel and OneDrive.

The analysis side is **Nexo** (TypeScript canvas in `frontends/nexo` + R Plumber API in
`R/frontends/api`) and **Team** (R Shiny, `R/frontends/team`). Admin never changes scientific values: it
delivers raw peak areas; normalisation, imputation and statistics stay in the R backend.

Ten pipeline stages, each with a visible gate:
Request → Received → Registered → Extracted → In batch → Sequence exported → Acquired → Processed →
QC checked → Excel built → Released. Going back is allowed but explicit and logged.

## Decisions already taken

- Admin is a **Next.js** app (App Router, TypeScript) served under `basePath: '/admin'`, behind the same
  gateway as Team and Nexo on the RTX server.
- Same **Supabase** sign-in and Postgres as the rest of the suite. Admin owns its own schema `admin`;
  other schemas are never touched.
- Data is separated by **client** (a PI's lab, an internal group, a company). Every table holding client
  data carries `client_id`; row-level security filters on it. Lab staff (Owner, Admin, Operator) see all
  clients. Sample IDs never contain a client name (`ORD041-S037`; injection names
  `B2026-031_017_ORD041-S037`).
- Lab roles (one per person): Owner, Admin, Operator, Member. Project roles: Lead, Analyst, Submitter,
  Viewer. Client roles: Client admin, Requester, Viewer. A person may belong to several clients.
- Append-only audit (a trigger writes `audit_event`), no hard delete anywhere (`archived_at` +
  `archived_reason`), frozen versions (exported batch version, accepted results file, released dataset),
  release needs two signatures by **different** people, `full_name` unique per order, `sample_name`
  unique per batch version.
- Visual language = Team's tokens: navy `#162230` top bar, lab blue `#2d5f8a` actions/selection, light
  blue `#78afe0` focus on dark, paper `#fafaf8` page, tint `#eaf1f7` selected rows, muted `#526477`
  secondary text. Fonts: Cormorant Garamond (page titles, big numbers), Nunito Sans (everything read),
  IBM Plex Mono (IDs, sample names, lipid names, small labels).

## Where code goes (wave 1)

| Path | Owner task |
|---|---|
| `frontends/admin/` | Next.js app scaffold |
| `db/admin/` | SQL migrations, RLS, audit, tests |
| `packages/admin-ingest/` | SCIEX OS TXT parser + dataset v1 Excel builder (pure TS library) |
| `R/frontends/api/` (new files + route registration only) | Nexo endpoint: session from a dataset |

Do not edit outside your own paths. Never edit: `R/modules/`, `R/core/`, `R/server.R`, `R/ui.R`, Classic
files, `www/`, `frontends/nexo/` (read it for reference only). Classic must stay byte-identical.

## The SCIEX OS results TXT (real shape, measured on a real export)

Tab-delimited, UTF-8 (may carry a BOM):
- Row 1: `Sample Name` then one column per injection (67 in the real file, e.g. `SCDC018_S1`).
- Row 2: `Sample Type` then `Unknown`, `Blank` or `Quality Control` per column.
- Then one row per MRM: column 1 the analyte name exactly as SCIEX writes it (`PC(14:0_16:0)+AcO`,
  `CE 24:4 +NH4`, `Cer(d19:1/20:0)+ H`), then raw peak areas (1.4e3 to 3.7e8) or the text `N/A`.
- Real file: 2,378 analyte rows; 97 internal-standard rows, recognised by the name ending in `.IS`
  (`…_Ultimate_SPLASH_ONE.IS`, `…_SPLASH.IS`, `…_SphingoSPLASH_ONE.IS`, `…_Sigma.IS`) **or** containing
  `(IS)` (`Cer(d18:1/17:0) (IS)`); one duplicate isomer row ending in ` b` (`DAG(20:0_20:4)+NH4 b`) that the
  operator dropped by hand; 64.8 % of cells are `N/A`.
- How the lab builds today's Excel from it (verified: 152,760 cells, 0 differences): delete row 2, delete
  every IS row, delete the listed duplicate rows; every other value is copied unchanged, `N/A` kept. A
  second version only renames the sample headers to group labels (the metadata `FullName`).

**Lab data never goes into git or into tests.** Build synthetic fixtures with the same shape (a few
samples, a few dozen analytes, IS rows of both kinds, a ` b` duplicate, `N/A` cells, one `Blank`). The
coordinator runs the real golden comparison privately afterwards.

## Dataset v1 (`dataset_format = 1`), the contract with Nexo and Team

Excel workbook, sheets in this order:
1. `Abundance`: column A header `Lipid`, then one column per included sample headed by its `FullName`
   (or by Sample Name when no metadata is given); values numeric or empty (NA). Lipid names as SCIEX
   wrote them in v1; a name dictionary may add a clean name on another sheet but must not change column A
   unless explicitly enabled.
2. `Metadata`: exactly `FullName, Group1Term, Group2Term, ReplicateTerm, PatientTerm, TimePointTerm`
   (see `docs/01_input_data_specification.md`).
3. `Internal_Standards`: the IS rows, same columns as Abundance.
4. `QC_Injections`: pooled QC and blank columns, kept apart from samples.
5. `Provenance`: key/value rows: `dataset_format`, dataset version, source TXT sha256, SCIEX OS version,
   processing method, value type (`raw peak area`), filters, exclusions, signatures.

## Working rules for every task

- TDD: write the failing test first, see it red, make it green. Report the commands you ran and their
  output.
- Commit on the branch as you go (small commits). If `git commit` fails inside your sandbox, that is
  expected: keep working; Fabric commits your work. **No push, no `gh`, no PRs.**
- Pin dependency versions; prefer well-known libraries. Do not rewrite `package-lock.json` files that
  you do not own.
- No secrets, keys, real emails, or lab data in the repo. Use `.env.example` with placeholders.
- Write English in code and docs. End with a short `README.md` in your folder: what exists, how to run
  the tests, what is left.
