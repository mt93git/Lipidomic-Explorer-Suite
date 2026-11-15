# Admin audit log screen: brief for the agent

`/audit-log` is a placeholder. The data already exists: `admin.audit_event` (0001) is written by the audit trigger
on every INSERT/UPDATE of the admin tables (0003), cannot be changed or deleted, and lab staff can read it
(`audit_event_read`, 0004). Staging has about 650 rows; a release is an UPDATE of `dataset` with
`before.status = built`, `after.status = released` and the signer as `actor`. **No migration**: if you believe one is
needed, stop and say why in your report.

Read first: `docs/admin/admin-wave2b-brief.md`, `docs/admin/admin-pilot-simulation.md`,
`frontends/admin/src/lib/data/release.ts` (the live/demo seam style) and `e2e/live/pilot.spec.ts` (step 7 is a
`test.fixme` waiting for this screen).

## What the screen does (Pareto)

- Lab staff only (a client member gets the same refusal the other staff screens give). Newest first, 50 per page
  with an "Older" link (keyset on `id`, no offset).
- Each row: when (local time), who (lab staff display name, else the user's email, else "System"), and a one-line
  human summary built from `entity`, `action`, `before` and `after`, e.g. `Dataset ORD080 v1 released`,
  `Signature added to ORD080 v1 (Approved)`, `Order ORD080 moved to Registered`, `Release policy changed: 2 of
  Paula (simulated), Stephania (simulated)`. Unknown shapes fall back to `<Entity> <inserted|updated>`. A row expands
  to show the changed fields (before → after) only, never whole JSON blobs.
- Filters: entity (select) and order code (text; matches events of that order and of its samples, shipments,
  result files, datasets and signatures). Filters live in the URL.
- Demo mode: the same screen over a few events derived from the demo store, so the demo E2E and the layout work
  without Supabase. Keep it small.

## Files you own

`src/app/(workspace)/audit-log/` (new route, replacing the catch-all placeholder for this path),
`src/lib/data/audit.ts`, `src/lib/audit*.ts` (the summary and diff functions), their tests, one demo E2E
`e2e/audit.spec.ts`, and in `e2e/live/pilot.spec.ts` only step 7 (turn the `fixme` into the real check: the release of
the pilot's order appears with Stephania as actor; screenshot `14-audit-log.png`). Update the "Gaps" section of
`docs/admin/admin-pilot-simulation.md` and the README you touch. Do not edit `navigation.ts` beyond the entry's
phase text if needed.

## Practice

TDD (red first) for the summary/diff functions and the data query shape, one demo E2E, Pareto, no speculative
abstractions. Paste the output of tsc, lint, `npm test`, the demo Playwright suite, and proof that the pilot spec is
still skipped without `ADMIN_E2E_PILOT=1`. You cannot reach staging; the coordinator runs the pilot there. No push, no
`gh`, no secrets, synthetic data only, English in code and docs. Do not touch `db/admin/migrations`, `R/`,
`frontends/nexo/` or Classic files.
