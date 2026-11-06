# Proposal: compact Team run history (not implemented)

Status: proposal only. It needs Gerardo's approval, because it changes how new records are written and could change how existing records are rewritten on their next save.

## Problem

`team-project-records-v1.json` stores every run in full. Each run includes `keep`, a per-lipid logical list, and `sample_ids`.

With 2,280 lipids, one run costs about 4,730 of the validator's 100,000 nodes. So a checkpoint holds at most about 21 runs.

The fix in 4cd9194 stops resumes from adding duplicate runs. Records that already carry duplicates stay close to the bound, though. The QA copy, for example, sits at about 99.5k nodes. After a few more real runs, saves are refused again. They now fail visibly, but they still fail.

## Proposal: version 2 of the records sidecar

1. **Shared payloads, stored once.**
   - Add a top-level `payloads` map: `{ "<sha256>": <keep list or sample_ids list> }`.
   - In each run, `keep` and `sample_ids` become references such as `{ "$ref": "<sha256>" }`.
   - Runs with the same settings share one payload. The 20 QA runs would shrink from about 94.6k nodes to about 4.7k plus 20 small rows.
2. **Read path.**
   - `team_project_records_read` accepts both v1 and v2.
   - v2 references are resolved and checked before `validate`. Each hash must exist and match its payload.
   - Unknown references fail closed.
   - The in-memory record keeps the v1 shape, so import, the UI and methods export are unchanged.
3. **Write path.**
   - New checkpoints are written as v2.
   - Old v1 checkpoints stay readable and are never modified in storage.
   - A v1 checkpoint is converted only when the user saves a new checkpoint from it. Every checkpoint is a new object, so nothing is rewritten in place.
4. **Bounds.**
   - Keep the 100,000-node and 4 MiB bounds, measured on the stored form.
   - Add a separate bound on the resolved form, for example 2,000,000 nodes, so a crafted file cannot expand without limit.
5. **No record is dropped.** Every run row is preserved, and only identical payloads are shared. A round-trip test asserts that v1 → v2 → resolved equals the original v1 field by field.

## Optional, separate decision

Collapse consecutive identical archived runs into one row with `repeats: n` and the list of times. This changes what the run history displays, so it needs its own approval. The v2 payload sharing alone already removes the size problem.

## Cost and risk

- About half a day, plus a cross-version test: a v1 checkpoint is resumed on v2 code, saved, and resumed again on v2 code.
- Classic is unaffected, since the sidecar is Team-only.
- Rollback: v2 code reads v1. v1 code reads only checkpoints that v2 code has not saved. So a rollback after v2 saves needs the v1 reader to be able to skip the sidecar, or the rollback must come before any v2 save. This must be decided before shipping.
