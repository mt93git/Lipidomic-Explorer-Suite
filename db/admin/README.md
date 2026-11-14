# Admin database (`admin` schema)

Plain SQL migrations for the Lipidomic Explorer Admin schema, plus a PGlite test suite.

## What exists

| File | Content |
|---|---|
| `migrations/0001_tables.sql` | Schema `admin` and its 20 tables: client, client_member, lab_staff, instrument, panel, order, shipment, sample, aliquot, box_position, exclusion, batch, batch_version, injection, result_file, name_map, dataset, signature, audit_event, job. uuid ids, `created_at`, `archived_at` + `archived_reason` (both or neither). Composite FKs `(x_id, client_id)` stop rows being attached to another client's parent. |
| `migrations/0002_helpers.sql` | `admin.lab_role`, `admin.is_lab_staff`, `admin.is_client_member` (plus `client_role`, `batch_has_my_injection`): SECURITY DEFINER with `search_path = pg_catalog, admin`. Wrappers `can_read_client`, `is_lab_manager`, `is_lab_writer`, `can_submit`. |
| `migrations/0003_rules.sql` | No hard delete (DELETE and TRUNCATE triggers on every table), append-only `audit_event` written by an AFTER INSERT/UPDATE trigger on every other table, frozen rows (per-table triggers), two-signer release, `ORD{nnn}-S{nnn}` sample codes. |
| `migrations/0004_policies.sql` | RLS on all 20 tables, policies, grants for `authenticated` (signature and dataset grants narrowed by 0006). |
| `migrations/0005_wave2.sql` | Wave 2 contract (`docs/admin/admin-wave2-brief.md`): the six write functions, table `release_policy` (21st table), columns `batch.imported`, `result_file.order_id` and `summary`, `dataset.project_id` and `companion_path`; `guard_dataset` replaced to allow those two only in the release update. |
| `migrations/0006_wave2_fixes.sql` | Fixes from `docs/admin/wave2-review.md` (findings 1-7, 10); 0005 is applied on staging and never edited. Signing only via `sign_dataset` (no `INSERT` on `signature`; retraction = update of `archived_at`/`archived_reason` only, never undone; unique index `signature_one_live_per_person`). Release only via the six-argument `release_dataset` (no table `UPDATE` on `dataset`, a column whitelist instead; `release_dataset(uuid)` dropped; the trigger counts eligible signers against the policy). Team owners only from currently eligible signers. Dataset file manifest `analysis_sha256`/`analysis_size_bytes`/`companion_sha256`/`companion_size_bytes`: needed to sign, matched at release. `register_samples` only at `received`/`registered`. Bucket `admin-files` with staff-only policies. Unique index `name_map_lab_wide_export_name`. |
| `migrations/0007_release.sql` | Wave 2b, release side (`docs/admin/admin-wave2b-brief.md`): `build_dataset` (Operator+, next version per order, file manifest recorded at once, stage → `excel_built`), `withdraw_dataset` and `supersede_dataset` (eligible signers; the released row is retired with `archived_at` + `archived_reason`; Team rows untouched), and the storage policy `case_files_release_insert` that lets an eligible signer stage the analysis file in Team's bucket `case-files` at `<project_id>/<analysis_sha256>` before `release_dataset` creates the project (no service role in the app). |
| `migrations/0008_wave2b_fixes.sql` | Fixes from `docs/admin/wave2b-review.md` (findings 1, 3, 7; 2, 4, 6, 8 are in the app); 0005-0007 are never edited. No `INSERT` on `admin.dataset` for the app role (policy `dataset_insert` dropped) and, of its columns, only `archived_at`/`archived_reason` updatable; `guard_dataset` refuses any content change (source results file, order, client, version, format, value type, path, digests, sizes) for every writer, archiving a released row without retiring it, and retiring without archiving. `build_dataset` gains `p_expected_version` (the 8-argument version is dropped) and binds the workbook path to `<client_id>/<order_code>/datasets/<p_sha256>/<name>.xlsx`. `supersede_dataset` locks both rows by id and needs a live (unarchived) released replacement. |
| `migrations/0009_nexo_reader.sql` | Open a released dataset in Nexo (`docs/integration/admin-nexo-open.md`). Role `nexo_reader` (NOLOGIN, granted to `authenticator`, member of nothing): `EXECUTE` on `admin.nexo_dataset(p_dataset_id uuid) → TABLE (dataset_id, order_code, version, storage_path, sha256)` (SECURITY DEFINER, pinned `search_path`; a row only for a `released`, unarchived dataset) and on its policy helper `admin.is_nexo_object(text)`, `USAGE` on schemas `admin` and `storage`, `SELECT` on `storage.objects` with one policy `admin_files_nexo_read` (bucket `admin-files`, name = `storage_path` of a released, current dataset). No table, no other function, no write. `authenticated` and `anon` cannot call either function. |
| `migrations/0010_nexo_caller.sql` | Admin accounts in Nexo (`docs/integration/admin-identity.md`). `admin.nexo_dataset_for_caller(p_dataset_id uuid) → TABLE (dataset_id, order_code, version, storage_path, sha256, client_id, caller, caller_view)`: SECURITY DEFINER, pinned `search_path`, `EXECUTE` to `authenticated` only (not `PUBLIC`, `anon` or `nexo_reader`). Called by the Nexo API through PostgREST with the signed-in user's own token. A row only for a `released`, unarchived dataset of an unarchived order, and only when `auth.uid()` is lab staff (`caller_view = 'staff'`, wins when both) or an active member of the dataset's client (`'client'`); otherwise no row, so "not yours" and "does not exist" are the same answer. Grants nothing in Storage (the download stays on 0009's `nexo_reader` path). |
| `migrations/0011_nexo_caller_scope.sql` | Nexo's store per client (`docs/integration/nexo-store-scope.md`). `admin.nexo_caller() → TABLE (caller, caller_view, client_id)`: SECURITY DEFINER, pinned `search_path`, `EXECUTE` to `authenticated` only (not `PUBLIC`, `anon` or `nexo_reader`). Called by the Nexo API through PostgREST with the signed-in user's own token to pick checkpoint workspaces. Lab staff: one row (`caller_view = 'staff'`, `client_id` null; wins when both). A client member: one row per active membership of an unarchived client (`'client'`). Anyone else (lab member, no role, archived, no subject): no rows. Grants nothing else. |
| `migrations/0012_storage_orphan_cleanup.sql` | Cleanup after a failed `build_dataset` or `release_dataset` with the caller's own token (no service role). Function `admin.is_referenced_admin_file(text)` (SECURITY DEFINER, pinned `search_path`, `EXECUTE` to `authenticated` only): the name is a dataset's `storage_path` or `companion_path`, a results file's `storage_path`, or lies in a `datasets/<digest>/` folder whose digest any dataset records (`sha256`, `analysis_sha256`, `companion_sha256`); every dataset counts, archived, withdrawn and superseded included. Policy `admin_files_orphan_delete` (DELETE, `authenticated`): bucket `admin-files`, `admin.is_lab_writer()`, `admin.is_admin_files_path(name)` and not referenced. Policies `case_files_pending_read` (SELECT) and `case_files_pending_delete` (DELETE) on Team's `case-files`: `admin.is_pending_analysis_path(name)`, 0007's insert condition. Team's own policies unchanged; still no UPDATE policy. Applied to staging 2026-11-09. |
| `migrations/0013_orders.sql` | New order (round 1 contract, `docs/admin/admin-wave3-brief.md`). `admin.create_order(p_client_id, p_panel_id, p_title, p_matrix, p_expected_samples, p_billing_ref, p_notes) → uuid`: SECURITY DEFINER, pinned `search_path`, `EXECUTE` to `authenticated` only. `admin.require_lab_writer` (Owner, Admin, Operator); inserts `admin."order"` at stage `request` with `requested_by = auth.uid()`, audited by `zz_audit`. Refuses an unknown or archived client, an unknown or archived panel, a blank title and a negative expected count; a null panel is allowed; blank text is stored as null. Not applied anywhere (Gerardo gate). |
| `migrations/0016_batches.sql` | Batches (wave 3 round 2). RLS would already let lab writers insert batch rows, but a batch is several rows, a name, aliquots and the orders' stage that must change together, so the writes are SECURITY DEFINER functions (pinned `search_path`, `admin.require_lab_writer`, `EXECUTE` to `authenticated` only, audited by `zz_audit`). Adds `batch_version.rules jsonb`. `admin.create_batch(p_name, p_panel_id, p_rules, p_injections) → uuid`: p_name null = next free `B<yyyy>-<nnn>` of the year (same advisory lock as `accept_result_file`), otherwise it must match the table's rule and be unused; p_injections is the ordered `{seq, sample_type, sample_name, sample_id, plate, vial}` array (seq 1..n, Unknown needs a sample, controls take none, no repeated name or sample); uses each sample's live aliquot or records one (extracted now, by the caller); refuses an archived/unknown panel or sample, an order outside Registered..Acquired, a sample already in another planned batch; all or nothing; orders move to `in_batch` (never back). `admin.mark_batch_exported(p_batch_id, p_sequence_sha256)`: planned only, 64 lowercase hex, freezes the current version through the existing triggers, batch and orders to `sequence_exported`. `admin.mark_batch_acquired(p_batch_id)`: exported only; injections, batch and orders to `acquired`. Helpers `lock_batch` and `advance_batch_orders` are not granted. Not applied anywhere (Gerardo gate). |
| `migrations/0024_nexo_members_prepare.sql` | Nexo's own entry (2026-11-10). `admin.client.members_prepare boolean NOT NULL DEFAULT false`: whether a client's members may prepare datasets and upload their own Excel in Nexo; changed only by `admin.set_client_members_prepare(p_client_id, p_enabled)` (lab Owner or Admin; turning it on needs `nexo_access` on, 55000 otherwise; audited by the client's `zz_audit`), not writable directly. `admin.nexo_datasets_for_caller() → TABLE (dataset_id, order_code, version, client_id, client_name, released_at, members_prepare)`: the list form of `nexo_dataset_for_caller` (lab staff: every released dataset of an unarchived order; a client member: those of their clients with `nexo_access` on; no e-mail), same definer/`search_path`/grants. `nexo_dataset_for_caller` and `nexo_caller` are dropped and recreated with a last column `members_prepare` (same rows and grants). In every row `members_prepare` is the row's client's `nexo_access AND members_prepare`; `nexo_caller`'s staff row has no client, so NULL. Tests: `test/nexo_members_prepare.test.js` (15). |
| `migrations/0035_instrument_profiles.sql` | Instrument profiles (Instruments & panels, 2026-11-13). `admin.instrument_profile`: name (unique), `instrument_id` (an active instrument; the profile's panels are that instrument's panels), the settings (software, batch file, bench sheet, plates, sample name pattern, results parser) and the blank and QC rules (`blanks_at_start`, `start_blank_note`, `blanks_between` after every `blanks_between_every` samples, `pooled_qc_every`, `pooled_qc_note`, `qc_thresholds`; counts 0..96). At most one `is_active` (partial unique index); the first profile is made active. Written only by `create_instrument_profile`, `update_instrument_profile`, `set_instrument_profile_rules`, `activate_instrument_profile`, `archive_instrument_profile` (SECURITY DEFINER, lab Owner or Admin via `require_lab_manager_for_catalog`; the active profile cannot be archived); read by lab staff; no delete; `zz_audit`. Batch builder pre-fills blanks at the start, blanks between samples (since 2026-11-14) and pooled QC every N from the active profile. Tests: `test/instrument_profiles.test.js` (10). |
| `migrations/0039_batch_hold_and_instrument_archive.sql` | Batch hold and instrument archive (2026-11-14). `create_batch` (0016, redefined) refuses a sample whose live aliquot is in a live version of a live batch of any status (planned, sequence exported, acquired, ...), not only a planned one; archiving the batch or its version frees the sample, as Batch builder lists them. Same signature, grants, SECURITY DEFINER, pinned search_path. `archive_instrument` (0026, redefined) is also refused while a live (not archived) instrument profile points at the instrument ("is used by profile X; archive or move the profile first"). Tests: `test/batches.test.js`, `test/instruments_panels.test.js`. |
| `migrations/0040_notification_audience.sql` | Who hears about what, corrected (2026-11-14; depends on 0036). Lab-only events: `order_requested`, `gate_failed`, `results_missing` and `access_requested` never have a client cell (cells turned off first, then CHECK `notification_rule_lab_only`; `set_notification_rule` refuses them, 22023). New `notification_rule.client_members` (every active member of the order's client, viewers too; default false, true for `dataset_released`; client-facing events only). `set_notification_rule(p_kind, p_lab_roles, p_step_owner, p_client_admin, p_requester, p_client_members, p_days)` replaces the six-argument function. The results check keeps unsent emails: `notification_event.claimed_at` (15-minute lease) and `sent_at` (earlier rows count as sent); `claim_results_missing` also hands out unsent claims whose lease ran out (order still Acquired), and `mark_results_missing_sent(p_order_id)` (service role only) closes one after the app's send. A receipt discrepancy is emailed by the app under `shipment_received` (no new kind). Tests: `test/notification_audience.test.js` (8), `test/notification_matrix.test.js` adapted. |
| `migrations/0041_freezers_aliquot_kind_slots.sql` | Storage and receiving fixes (2026-11-14). (1) Freezer catalog: `admin.freezer` (name unique, `temperature` text, `note`), `admin.freezer_rack` (name unique per freezer) and `admin.storage_box_location` (one row per box label: `freezer_id`, optional `rack_id` of that freezer; both null = not set). Lab staff read; `create_freezer`, `create_freezer_rack`, `archive_freezer` (archives its racks), `archive_freezer_rack` for the Owner or Admin (`require_freezer_manager`); `set_box_location` for lab writers. A freezer or rack still holding a box cannot be archived. SECURITY DEFINER, pinned `search_path`, no delete, `zz_audit`. (2) `admin.aliquot.kind` (`original` / `re_extraction`; existing rows original): `assign_aliquot_code` now also sets it when the insert does not: the sample's first aliquot is the original, later ones re-extractions. (3) One slot, one holder: trigger `one_slot` (`refuse_shared_slot`) on `box_position` and `shipment_tube` refuses a live box + position (trimmed, any case) the other table holds (PT409), with an advisory lock per slot. Tests: `test/freezers_aliquot_slots.test.js` (10). |
| `test/auth_stub.sql` | Test-only stand-in for Supabase: `auth.users`, `auth.uid()` reading `request.jwt.claim.sub`, roles `authenticated`, `anon` and `authenticator`. **Do not apply to Supabase.** |
| `test/pilot_stub.sql` | Test-only copy of Team's `pilot_projects`, `pilot_members`, `pilot_files` with their RLS and grants, verbatim from `pilot/supabase/schema.sql`. **Do not apply to Supabase.** |
| `test/storage_stub.sql` | Test-only stand-in for Supabase Storage's `storage.buckets` and `storage.objects` (unique `(bucket_id, name)`, RLS on objects, privileges for `authenticated`) so the `admin-files` policies run in PGlite, plus Team's bucket `case-files` and its two object policies verbatim from `pilot/supabase/schema.sql` (0007 adds a policy next to them). **Do not apply to Supabase.** |
| `test/helpers.js`, `test/admin.test.js` | Fresh in-memory PGlite per test, synthetic seed of two clients covering every table, 45 tests (wave 2 contract, the three-signature denial cases, removed signer, file manifest, stale registry, bucket `admin-files`, name dictionary). |
| `test/wave2b_fixes.test.js` | 10 tests for 0008: effective privileges (no INSERT, only the archive columns updatable, no INSERT policy), the review's direct-insert probe refused to every lab role, every content column refused before signing (app role: permission denied; migration owner: the trigger), the workbook path rule, stale/missing expected version (PT409), the 8-argument function gone, a released row not archivable through the archive columns, an archived or withdrawn replacement refused, supersede's lock order. |
| `test/release.test.js` | 7 tests for 0007: grants and `search_path`, build (manifest, version numbering, stage, audit), build refusals (outsiders, another order's file, a file not accepted, bad or incomplete manifest, nothing inserted), build → sign ×2 → release, withdraw, supersede, and the pre-release upload to `case-files` (eligible signer only, recorded digest only, unused project id only, not once released; Team's own rule still applies after); since 0012 the signer reads the pending object back, an Operator cannot read or remove it, and once released nobody removes it. |
| `test/nexo_reader.test.js` | 12 tests for 0009: the role's attributes and memberships, `nexo_dataset`'s definer/`search_path`/grants and result type, no privilege on any `admin` or Team table, sequence or other function, storage privileges (read objects only); `nexo_dataset` returns the released current version and nothing for built, withdrawn, superseded, unknown or null ids, and stops answering once withdrawn; the app role cannot call it; `nexo_reader` (even with a lab owner's id as subject) cannot read admin/Team tables or call staff RPCs; storage: sees exactly the current workbook in `admin-files` (not other objects, not `case-files`), loses it when withdrawn, cannot insert/update/delete; staff and client rules unchanged. |
| `test/nexo_caller.test.js` | 15 tests for 0010: definer/`search_path`/grants/result type, `nexo_reader` still limited to its two functions; staff (any client) → `staff`; client admin, requester, viewer → `client`; a member of another client, a lab member and a stranger → no row; built, withdrawn, superseded, unknown, null → no row; withdrawn after release, archived order, archived membership/client/lab staff → no row; staff who are also members → `staff`; no subject → no row; `anon` and `nexo_reader` refused; `caller` is `auth.uid()`. |
| `test/nexo_caller_scope.test.js` | 11 tests for 0011: definer/`search_path`/grants/no argument/result type, `nexo_reader` still limited to its two functions; staff → one `staff` row with null `client_id`; client admin, requester, viewer → one `client` row; a member of two clients → two rows; lab member, stranger, no subject → none; archived membership drops that client, archived client drops its rows, archived lab staff → none (or member rows if still a member); staff who are members of two clients → one `staff` row; `anon` and `nexo_reader` refused. |
| `test/storage_cleanup.test.js` | 7 tests for 0012: the helper's definer/`search_path`/grants; the exact list of `storage.objects` policies (Team's two unchanged, no UPDATE); `admin-files`: each lab writer removes an unrecorded build file and an unaccepted TXT; nobody removes a file a dataset records (workbook, derived analysis/companion paths, `companion_path` set at release, 0007's single-folder layout, any object under a recorded digest folder; released then withdrawn, archived and built versions) or a results file records; client members, a lab member, `anon` and `nexo_reader` remove nothing; nothing under an archived order. `case-files`: an eligible signer reads back and removes a pending object, an Operator, client members and `anon` cannot; nobody removes a released project's file, a digest that is no longer pending or unrecorded, other path shapes, or a pending digest under an existing project. |
| `test/orders.test.js` | 7 tests for 0013: Operator/Admin/Owner create an order with every field at `request`, `requested_by` the caller; blank text → null and the audit row (actor, client); refusals: lab member and every client role, archived and unknown client, archived and unknown panel (null panel allowed), blank title, negative expected count; definer/`search_path`/grants (`authenticated` yes, `anon` no). |
| `test/batches.test.js` | 18 tests for 0016: staff create a planned batch (rules, injections, reused and new aliquots, orders In batch, audit actor); numbering and an explicit name; refusals (bad or taken name, non-writers, panel, rules, empty/ill-numbered/blank/repeated injections, Unknown without a sample, control with one, unknown or archived sample, a sample in another planned batch, orders not yet registered or already processed); all-or-nothing; an Acquired order stays Acquired; export freezes the sequence (and later edits are refused); acquisition; each refusal of the two marks; definer/`search_path`/grants. |
| `test/staging.integration.mjs` | The same rules against the real staging stack (GoTrue + PostgREST + Storage + Postgres): 10 wave-1 checks, 15 wave-2 checks through `rpc/` with real tokens (one for 0008: the dataset is created only by `build_dataset`; a direct insert, a content change and a stale expected version are refused), 5 checks for 0006 (old release paths denied under a three-signature policy, a removed signer gets no Team ownership, a substituted analysis file refused, an Operator TXT upload to `admin-files` read back byte-exact, client token / overwrite / wrong-client path refused), 8 checks for 0007/0008 (`build_dataset` → the analysis file staged in `case-files` with the signer's token → sign ×2 → `release_dataset` → version 2 → an Operator cannot archive the released version → `supersede_dataset` → `withdraw_dataset`, with the refusals and the audit actors), and 7 checks for 0009 with a `nexo_reader` JWT minted from the stack's `JWT_SECRET` (HS256, 10 minutes, never printed): `nexo_dataset` returns the released version and nothing for built, withdrawn, superseded and unknown ids; the workbook downloads byte-exact, nothing else does (built version, another `admin-files` object, a `case-files` object, a list, an upload); no `admin.order`/`admin.dataset`/Team read and no staff RPC; withdrawn → no row, no download; and 7 checks for 0010 through `rpc/nexo_dataset_for_caller` with real tokens: staff get the released version as `staff`, a member of its client as `client`, a member of another client nothing; built, withdrawn, superseded and unknown ids nothing; `anon` and the `nexo_reader` token refused (42501); a token signed with another secret and an expired one are 401; after supersede/withdraw nothing; and 4 checks for 0011 through `rpc/nexo_caller`: staff one `staff` row with null `client_id`, a member of two clients two rows, a member whose only membership is archived nothing, `anon` refused (42501); and 2 checks for 0012 through Storage's bulk remove (`DELETE /object/<bucket>` with `prefixes`, what supabase-js `remove()` sends): an Operator removes an `admin-files` object it just uploaded that no dataset records (a client token cannot) and cannot remove a recorded dataset workbook; an eligible signer removes a pending analysis file it staged in `case-files` for a built version 3 (an Operator cannot) and cannot remove the released project's file; and 2 checks for 0013 through `rpc/create_order`: an Operator creates an order (stage `request`, `requested_by`, audit), a client requester (42501), an archived client and an archived panel are refused. Needs `STORAGE_PORT` and `JWT_SECRET` in the stack's `.env`. Run by the coordinator on the lab server only; the 0007, 0008, 0009 and 0010 checks are written, not yet run; the 0011 checks are written, not yet run (0011 needs Gerardo's OK before staging); the 0012 checks are written, not yet run (0012 needs Gerardo's OK before staging; run them only once it is applied); the 0013 checks are written, not yet run (0013 needs Gerardo's OK before staging); the 0016 checks (a separate block at the end: create → refuse a repeat → export → frozen → acquire through `rpc/`, with a client requester refused and RLS on what was written) are written, not yet run. At the end, failed runs included, it retires what it created under its two clients: released datasets withdrawn with a run signer's token (`withdraw_dataset`), then the other datasets, the orders and the clients archived (`archived_reason = '<run> staging test run finished'`); an order or client whose released dataset could not be withdrawn stays live and is reported. It then restores the release policy that was live before the run (or archives the run policy as postgres, with an audit event and a check that no policy remains live, to restore the implicit two-signature Owner/Admin default). Users still named in a live policy are reported and kept active. It then archives the created users' `lab_staff` and `client_member` rows, and bans each GoTrue account for 876000 hours. Users are tracked immediately after creation, so partially failed seeds are covered. Auth users are never deleted (audit actors keep their references); Team projects stay. Membership retirement uses the existing SQL connection; only GoTrue banning uses the service key. Each teardown failure is reported and fails the run, while later teardown steps are still attempted. |
| `test/archive-staging-test-data.mjs` | One-off cleanup of leftovers by name: `<run id> Client A/B` clients of earlier integration runs with their orders and datasets, and the per-run `E2E live …` orders of the fixed `E2E Live Client A/B`. Dry run by default, `--apply` acts; same retirement rules as above. Refuses to run unless `NEXT_PUBLIC_SUPABASE_URL` is exactly `ADMIN_STAGING_GATEWAY_URL`; signs in as a lab owner or admin (`ADMIN_CLEANUP_EMAIL`/`_PASSWORD`), who must be an eligible signer to withdraw. Optional `--retire-users` also selects only `<run>-<label>@example.test` accounts, where run matches `/^it[a-z0-9]+$/` and label is lowercase alphanumeric words separated by hyphens. It archives each live `client_member`/`lab_staff` row of theirs through `rpc/archive_member` with the signed-in token (0015: no direct membership writes), then bans their GoTrue accounts for 876000 hours; no auth deletion. This option requires `SUPABASE_SERVICE_ROLE_KEY` from env for GoTrue admin listing/banning only, never admin rows. Omit `--apply` to preview both data cleanup and user retirement. Fixed pilot/live personas are excluded. Retiring lab-staff throwaway users requires an Owner cleanup account (`archive_member` lab staff is Owner only), and the lab's last active Owner is never archived. Each user is banned only after a re-read finds none of their memberships live; a refusal or a shortfall keeps that user unbanned and fails the command. `test/archive-staging-test-data.test.js`: 14 tests for guard, selection, dry run, pagination and token boundaries; `test/retire-users.test.js`: 4 tests for matching, retirement order and failure reporting. |

### Wave 2 contract functions

All six are `SECURITY DEFINER`, `search_path = pg_catalog, admin`, check the caller inside, are executable by
`authenticated` and not by `PUBLIC`. Call them with `supabase.schema('admin').rpc(name, { p_...: ... })`.
Stages only move forward (`advance_stage`); a function never moves an order back.

| Function | Who | Effect and errors |
|---|---|---|
| `receive_shipment(p_order_id, p_carrier, p_tracking_number, p_condition, p_box_count, p_notes) → uuid` | owner/admin/operator | shipment with `received_at = now()`, `received_by = auth.uid()`; stage → `received`. |
| `register_samples(p_order_id, p_shipment_id, p_samples jsonb) → setof admin.sample` | owner/admin/operator | only while the locked order is at `received` or `registered` (0006: `ORD041 is at stage request; receive the shipment …` / `ORD041 is at stage processed; its sample registry is closed`, SQLSTATE 55000); inserts in array order (codes by the existing trigger); all-or-nothing; `duplicate full_name in order ORD041: a, b` covers duplicates inside the payload and against the order; `p_shipment_id` may be NULL but must belong to the order; stage → `registered`. |
| `accept_result_file(p_order_id, p_storage_path, p_sha256, p_sciex_os_version, p_processing_method, p_summary) → uuid` | owner/admin/operator | batch = the one the order's injections or earlier accepted files point to; none → new batch `B<year>-<nnn>`, `imported = true`, `status = processed`; an order in several batches is refused (the contract has no batch argument). Inserts `result_file` as `accepted` with `order_id` and `summary`; stage → `processed`. |
| `set_release_policy(p_eligible_signers uuid[], p_required_signatures int) → void` | lab owner only | archives the current row (`archived_reason = 'replaced'`) and inserts the new one; `required >= 2`; listed people must be lab staff and at least as many as required; empty list = any lab owner or admin. No row at all behaves as empty list with 2. |
| `sign_dataset(p_dataset_id, p_role, p_note) → uuid` | eligible signer | refuses non-eligible callers, datasets that are not `built`, datasets without their file manifest (`… record the analysis and companion files (sha256 and size) first`), and a second live signature by the same person. The only way to sign (0006). |
| `release_dataset(p_dataset_id, p_analysis_object_path, p_analysis_sha256, p_analysis_size_bytes, p_analysis_name, p_companion_path) → uuid` | eligible signer | counts distinct live signers **eligible under the current policy**; refuses below the count. Refuses an analysis file whose sha256 or size differs from the dataset's recorded `analysis_sha256`/`analysis_size_bytes` (`this is not the analysis file recorded and signed …`). Inserts one `pilot_projects` (name `<order code> <title>`), `pilot_members` (signers still eligible under the current policy `owner`, live client members `viewer`) and one `pilot_files` row; sets the dataset `released` with `project_id` and `companion_path` (then frozen); stage → `released`; returns the project id. Only inserts into Team tables, never updates or deletes them. The only way to release (0006). |

### Release side (0007)

| Function | Who | Effect and errors |
|---|---|---|
| `build_dataset(p_order_id, p_result_file_id, p_expected_version, p_storage_path, p_sha256, p_analysis_sha256, p_analysis_size_bytes, p_companion_sha256, p_companion_size_bytes) → uuid` (0008; the 0007 form without `p_expected_version` is dropped) | owner/admin/operator | the only way a dataset is created. Locks the order; the results file must be live, `accepted`, and accepted for that order (`results file … was not accepted for order ORD041`); the combined workbook's path/sha256 and the manifest of both files are required (`a built dataset records the combined workbook and both files it is split into (sha256 and size)`, the table's CHECKs validate the digests); `p_storage_path` must be `<client_id>/<order_code>/datasets/<p_sha256>/<name>.xlsx`; `p_expected_version` must be the order's highest version + 1 (retired versions count), else `version 2 is next for order ORD041, but these files were built for version 1; build them again` (SQLSTATE PT409, rebuild the files); stage → `excel_built`. A released order may get a new version (for a supersede). |
| `withdraw_dataset(p_dataset_id, p_reason) → void` | eligible signer | needs a non-blank reason; the dataset must be `released` (`dataset … is built; only a released dataset can be withdrawn`); sets `status = 'withdrawn'`, `archived_at = now()`, `archived_reason = reason`. The order stays at `released` and the Team project stays. |
| `supersede_dataset(p_dataset_id, p_new_dataset_id) → void` | eligible signer | locks both rows together in id order (0008); both datasets of the same order, the old one `released`, the new one `released`, not archived (0008) and with a higher version; sets the old one `superseded`, `archived_reason = 'superseded by version N (<new id>)'`. Both Team projects stay. |

**Project id and storage.** The app server generates the project id and uploads the analysis file (Abundance +
Metadata only) to bucket `case-files` at `<project_id>/<sha256>` with the **signed-in signer's own token**:
0007's policy `case_files_release_insert` allows that insert while the path's digest is the recorded
`analysis_sha256` of a built, live dataset, the caller is an eligible signer, and no `pilot_projects` row has that
id yet (`admin.is_pending_analysis_path`). Then the app calls `release_dataset` with that path; the function checks
the path shape and that its second part equals `p_analysis_sha256`, and takes the project id from it. It does not
check that the object exists in storage. If the call fails, the app removes the object it staged with the same
token (0012: `case_files_pending_read` and `case_files_pending_delete`, the same condition as
`case_files_release_insert`; a DELETE only reaches rows its SELECT policies let it see, hence the read policy). A
retry stages a new copy under a new project id. Once released the digest is no longer pending and only Team's
membership rule applies to that bucket, so no signer can remove a released project's file, also when the release
committed but its answer was lost. Team's two policies are unchanged. No service role is used by the app.

**File manifest (0006).** Whoever builds a dataset records, on `admin.dataset`, the sha256 and size of the two
files the combined workbook is split into: the analysis file (`analysis_sha256`, `analysis_size_bytes`; Abundance +
Metadata, the one that goes to `pilot_files`) and the companion file (`companion_sha256`, `companion_size_bytes`;
Internal_Standards, QC_Injections, Provenance). Signing is refused until all four are set, and the first live
signature freezes them with the rest of the row. `release_dataset` refuses an analysis sha256/size other than the
recorded one. The companion is bound by its recorded digest only: the release receives just its path, which the
database cannot check against the content.

**Bucket `admin-files` (0006).** Private bucket for Admin's own files (results TXT, companion files), created like
Team's `case-files`. Lab staff read; lab writers (owner, admin, operator) upload with their own token to
`<client_id>/<order_code>/<more>` where the order is live and belongs to that client
(`admin.is_admin_files_path`). There is no UPDATE policy, so an object is never overwritten (an upsert needs
UPDATE). Client users and lab members cannot read or write it. Since 0012 a lab writer may delete an object under a
live order's folder that no admin row refers to (`admin_files_orphan_delete`, see the table above): when
`build_dataset` fails (a stale version included) or an upload fails closed, the app removes the objects that call
wrote, with the same token, and never an identical object that was already there. A file any dataset or results
file records, whatever its status, stays undeletable.

### Rules

- **Who sees what.** Lab staff = lab role owner, admin or operator: they read everything. A lab `member` is not staff
  and only sees clients it belongs to. Client members read their own clients' rows only. In a mixed batch each client
  sees only its own injections (QC and blank injections have `client_id` NULL and are staff-only); a client sees a batch
  name only if the batch holds one of its injections. Clients see datasets only once released. `result_file`
  (holds every client of a batch), `instrument` and `audit_event` are staff-only. Every signed-in user can read `panel`.
- **Who writes what.** Owner/admin: clients, memberships, lab staff (only an owner can make an owner), instruments,
  panels. Owner/admin/operator: everything operational (aliquots, boxes, exclusions, batches, versions, injections,
  result files, name map, datasets, jobs; plus orders/shipments/samples). Since 0006 signatures are created only by
  `sign_dataset` and datasets released only by `release_dataset`: the app role has no `INSERT` on `signature`, may
  update only `archived_at`/`archived_reason` of its own signature (retraction, never undone), and may update only
  `result_file_id, version, dataset_format, value_type, storage_path, sha256`, the four manifest columns and the
  archive columns of `dataset` (not `status`, `released_at`, `project_id`, `companion_path` or identity). Client admin and requester:
  orders, shipments and sample metadata of their own client; client admins also manage their own client's members.
  Viewers and lab members are read-only.
- **No hard delete** anywhere: `DELETE`/`TRUNCATE` are not granted and triggers refuse them even for the owner.
  Retire rows with `archived_at` + `archived_reason`.
- **Audit**: every INSERT/UPDATE on the 20 other tables (including `release_policy`) writes `audit_event` (actor = `auth.uid()`, client_id, before,
  after). `audit_event` cannot be inserted, updated or deleted by the app role, and triggers refuse UPDATE/DELETE/TRUNCATE
  even for the owner.
- **Frozen rows**: an exported `batch_version` (only archiving allowed) and the injections in it (only `status` and
  archiving may change, no new injections); an accepted `result_file` (may only become `superseded`); a released
  `dataset` (may only become `superseded` or `withdrawn`) and its signatures. A dataset with a live signature cannot
  change content.
- **Release**: a dataset is born `built`, only by `build_dataset` (0008), and its content never changes after that, for
  any writer; the app role may only archive a discarded build. `released` requires live signatures by as many different people eligible
  under the current release policy as the policy requires (at least two; enforced by a trigger for any caller,
  including the owner, and by `release_dataset`). People sign only as themselves, once per dataset (unique index).
  A released dataset moves only through `withdraw_dataset` (with a reason) or `supersede_dataset` (by a newer, live
  released version); both retire the row (`archived_at` + `archived_reason`) and leave Team's rows alone. A released
  row is never archived without being retired, nor retired without being archived (0008).
- **Uniqueness**: `full_name` per order, `sample_name` per batch version, `sample_code` globally, one live lab-wide
  `name_map` entry per `export_name` (client-scoped entries are separate).
- **Codes**: `order.code` = `ORD` + order number (`ORD041`), sample code = order code + `-S` + per-order number
  (`ORD041-S037`), assigned by trigger; callers cannot choose or change them. No client name is ever part of a code.

## Run the tests

```sh
cd db/admin
npm install
npm test
```

The tests boot PGlite (Postgres 17 in WASM), apply `test/auth_stub.sql` and `migrations/*.sql` in order, seed
synthetic data as the superuser, then `SET ROLE authenticated` and set `request.jwt.claim.sub` per test user, so RLS
applies (the first tests assert `current_user = authenticated`, not superuser, no BYPASSRLS). No lab data is used.

## Apply to Supabase (staging)

Apply `migrations/*.sql` in filename order with `psql -v ON_ERROR_STOP=1` as the migration owner. On staging,
0001-0006 are already applied: apply `0007_release.sql` then `0008_wave2b_fixes.sql` (0008 drops the 0007
`build_dataset` signature, so deploy the app that passes `p_expected_version` with it; built, unsigned datasets
made before 0008 keep their old single-folder file layout, which the app no longer reads: archive them and build
again). 0007 needs Team's `public.pilot_projects` and Supabase
Storage's schema; bucket `case-files` is Team's and is not created here, so the new policy is inert until Team's
schema is in place). 0006 notes, for a stack still at 0005: It needs Supabase Storage's schema (bucket
`admin-files`), and its two unique indexes fail if staging already holds two live signatures by one person on a
dataset or two live lab-wide `name_map` entries with one export name (archive the extra row first). Built datasets
created before 0006 have no file manifest: record it before they can be signed; a signed one without a manifest
cannot be released (build a new version). Supabase provides
`auth.users`, `auth.uid()` and `authenticated`. The SECURITY DEFINER helpers and triggers rely on the owner bypassing
RLS (Supabase's `postgres` role does); the application must connect as `authenticated`, never as the owner or service
role. Expose the `admin` schema in the API settings if PostgREST is used.

0012 was applied to staging on 2026-11-09 with Gerardo's OK: `staging.integration.mjs` 64/64, both 0012 checks
included; on the Storage volume the removed orphan's bytes are gone and the recorded dataset file stays. It needs
Storage's schema and Team's `public.pilot_projects` (through 0007's `admin.is_pending_analysis_path`); it adds three
policies on `storage.objects` and changes no existing one.

0009 needs Supabase's `authenticator` role (PostgREST connects as it; Storage connects as `supabase_storage_admin`,
which Supabase's image grants `authenticator`, so both can switch to `nexo_reader`), Storage v1.81.0 or later (its
policy reads the per-request `storage.operation` setting) and Storage's schema; the migration
owner must be able to create a role and grant it to `authenticator` (Supabase's `postgres` can). The Nexo API's
token is a JWT with `"role": "nexo_reader"` signed with the stack's JWT secret, minted at deploy time and kept in
the Nexo host's environment (`LIPIDOMIC_ADMIN_NEXO_TOKEN`); it is never committed. Give it an expiry and rotate it
with the JWT secret.

The local Node CLI `tools/nexo-reader-token.mjs` needs no dependencies. The coordinator runs it on the Nexo
staging host (paths below are placeholders; do not commit either env file):

```sh
# Metadata health check: prints only role, issued/expiry dates and days left.
node db/admin/tools/nexo-reader-token.mjs --check /path/to/nexo-staging.env
# Replace only LIPIDOMIC_ADMIN_NEXO_TOKEN; defaults to 90 days. Prints only the new expiry.
node db/admin/tools/nexo-reader-token.mjs --rotate /path/to/nexo-staging.env \
  --jwt-secret-file /path/to/admin-stack/.env
# Optional lifetime:
node db/admin/tools/nexo-reader-token.mjs --rotate /path/to/nexo-staging.env \
  --jwt-secret-file /path/to/admin-stack/.env --days 90
```

`--check` exits 1 below 14 days remaining (including expired tokens), or on malformed/missing values;
otherwise it exits 0, so cron/health checks can use its status. It decodes metadata and checks the expected
role/algorithm, but does not verify the signature. Rotation reads `JWT_SECRET` from the Admin stack `.env`,
mints an HS256 JWT with only `role: nexo_reader`, `iat` and `exp`, and atomically replaces the token assignment
while preserving the env file's mode and every other line. Missing or duplicate assignments are refused.
Neither operation prints the token or secret. After rotating, the coordinator must **restart the Nexo staging
service** so it loads the new environment. When rotating the Admin JWT secret, use the new secret for this token.
`test/nexo-reader-token.test.js` exercises the CLI using temporary files and a fake secret only.

## What is left

- `0007_release.sql` and `0008_wave2b_fixes.sql` are tested on PGlite only (with the Storage stub); their checks in
  `staging.integration.mjs` (the script now builds every dataset through `build_dataset`, and checks the refused
  direct insert, content change, stale version and archive of a released row) are written but have not been run
  against staging.
- Supersede's lock order is checked in the function source; PGlite runs one session, so the two-session
  interleaving itself is not exercised.
- Column-level limits: a requester can edit any column of its client's orders and samples (e.g. `stage`); restrict with
  column grants or an RPC once the app's flows are fixed.
- Stage transitions (going back explicitly and logged) are not enforced in SQL; only the stage list is.
- Project roles (Lead, Analyst, Submitter, Viewer) have no table yet.
- The SECURITY DEFINER helpers take a `uid` argument, so a signed-in user can ask about another user's membership.
  Low risk; switch them to `auth.uid()` internally if that matters.
- Withdrawing a dataset does not move the order back from `released` (stages never move back by themselves);
  the Datasets screen shows the version's status. An explicit, logged "go back" is still to be designed.
- Live reads for the pipeline and order detail (review finding 8) are the next wave.
- `0009_nexo_reader.sql` is tested on PGlite only (the Storage stub models the per-request `storage.operation`
  setting, not Storage's HTTP routes). `nexo_reader` sees its object only during an authenticated download
  (`storage.object.get_authenticated`): signing (a signed URL would outlive withdrawal and supersession), listing and
  object info see nothing. Whether the deployed Storage downloads with a custom role claim, refuses signing and
  cuts access on supersede and withdraw is what the 0009 checks in `staging.integration.mjs` prove; they are
  written, not yet run. The token has no per-dataset scope: anyone holding
  it can read every released, current dataset's workbook (by design for now; Nexo has no user identity yet).
- `accept_result_file` does not supersede an earlier accepted file for the same order.
- `0012_storage_orphan_cleanup.sql` is tested on PGlite only, as plain `DELETE ... RETURNING` on the Storage stub.
  What only staging can settle: that Storage's bulk remove deletes exactly the rows the caller's token may delete
  under RLS and answers 200 with those (not an error for the rest), that it then removes the bytes from its backend
  for those rows only, and that its newer schema (e.g. `storage.prefixes` and its triggers, if the deployed version
  has them) does not need further privileges for the caller. A lab writer can, by calling Storage directly, delete
  another writer's upload in the moment between its upload and its `build_dataset`/`accept_result_file` (the app
  itself only removes what its own failed call wrote); the function then records a path with no object behind it.
  The results upload in `data/results.ts` does not clean up after a failed `accept_result_file` yet; 0012 already
  allows it.

## Clients, wave 3 round 1

`0014_clients.sql` adds the contracted `create_client`, `update_client` and `archive_client` RPCs.
Only active lab Owners/Admins may call them. Names are trimmed and retain the existing case-sensitive,
all-record uniqueness constraint (including archived clients); duplicate create/update requests get a clear
23505 message. Billing may be null. Archive requires a reason and refuses any non-archived, non-released
order. Existing audit triggers record every successful mutation. Updates and repeated archival of archived
clients are refused. No member-management or invitation functions are added.

Run `npm test` here; `test/clients.test.js` covers the three functions, grants/search paths, refusals and audit
with synthetic PGlite fixtures. The clearly separated 0014 block in `test/staging.integration.mjs` checks
real RPCs, RLS reads with embedded members/orders, refusal codes and archival, and retires its own synthetic
client/orders in a `finally` block. The coordinator must run staging after Gerardo approves/applies the
migration. This task never applies migrations to a persistent database.

## People, invitations and roles, wave 3 round 2

`0015_people.sql` adds table `admin.invitation` (RLS on; readable by lab Owners/Admins without the
`token_sha256` column; no write grants; `refuse_delete`/`refuse_truncate` like every table; its `zz_audit` uses
`record_invitation_audit`, which is `record_audit` without the `token_sha256` key, since Operators read the audit) and the
contracted functions, all SECURITY DEFINER with `search_path = pg_catalog, admin` and nothing granted to PUBLIC:

| Function | Executable by | Rule |
|---|---|---|
| `create_invitation(p_email, p_lab_role, p_client_id, p_client_role) → text` | `authenticated` | exactly one target; lab roles: lab Owner; client roles: Owner/Admin; refuses an email already holding that role (via `auth.users.email`), an archived client and a duplicate pending link; stores `sha256(token)` and `expires_at = now() + 7 days`; returns the raw token once |
| `invitation_preview(p_token) → (email, target, expires_at, has_account)` | `anon`, `authenticated` | valid, unexpired, unaccepted, unrevoked token of a live client only; otherwise no row. `target` is plain words (`Lab Operator`, `Requester at <client>`); `has_account`: the invited email already has an auth account (contract change, security review finding 4) |
| `accept_invitation(p_token, p_user_id)` | `service_role` only | refuses unknown/revoked/used/expired links, an unknown user and a user whose email differs; inserts `lab_staff` or `client_member` (a person who left comes back on the same row); marks the link accepted |
| `accept_my_invitation(p_token)` | `authenticated` | the same, for the signed-in caller (`auth.uid()`): an existing account accepts without touching its password; the caller's auth email must be the invited one (new, security review finding 4) |
| `revoke_invitation(p_invitation_id)` | `authenticated` | same people as create; a used or revoked link is refused |
| `set_lab_role(p_user_id, p_role)` | `authenticated` | lab Owner; never demotes the last active Owner (the trigger below) |
| `set_client_member_role(p_member_id, p_role)` | `authenticated` | lab Owner/Admin |
| `archive_member(p_kind, p_id, p_reason)` | `authenticated` | `lab_staff` (Owner; never the last Owner) or `client_member` (Owner/Admin); reason required; never deletes |

Memberships change only through these functions: 0015 drops the 0004 write policies of `lab_staff` and
`client_member` and revokes `INSERT`/`UPDATE` on both tables from `authenticated` (reads are unchanged). The
`keep_an_owner` trigger (AFTER UPDATE on `lab_staff`, SECURITY DEFINER, locks the Owner rows) refuses any change that
leaves no active Owner, whatever the path (functions, service role, migration owner). Seeds and staging checks that
insert memberships use the service role or the database owner and keep working.

It grants `USAGE` on schema `admin` to `anon` (only `invitation_preview` is executable by it; it reads no table) and
to `service_role`. Tokens are 2 × `gen_random_uuid()` (244 random bits, no pgcrypto). The test stub
(`test/auth_stub.sql`) gained `auth.users.email` and the `service_role` role; the seed (`test/helpers.js`) gives each
synthetic user `<key>@example.test` and one pending invitation.

`test/people.test.js` (21 tests) covers every function and its refusals, the grants (anon/authenticated/service_role),
that the raw token is stored nowhere (invitation and audit rows) and that no audit row holds the digest, the closed
direct writes (an Admin promoting an Operator, a client admin promoting a member) and the last-Owner trigger. The separate 0015 block in
`test/staging.integration.mjs` checks the same through PostgREST; the accept step uses the stack's `SERVICE_KEY`.
Not applied anywhere (Gerardo gate).
