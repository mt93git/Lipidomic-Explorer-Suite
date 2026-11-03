> Phase 2: Team login and checkpoint library are now available in the isolated candidate. See [README-team.md](README-team.md). The following describes the original backend-only milestone.

# Isolated Supabase persistence pilot

This is a backend feasibility pilot, not an enabled application feature. It does not change scientific processing or either UI. No production credentials or datasets belong in Git.

## Boundary

- Independent Compose project `lipidomic-pilot`, network and bind volumes on the RTX Linux filesystem.
- Postgres, PostgREST and Supabase Storage only. No Studio, public gateway, Realtime or GoTrue.
- REST `127.0.0.1:55431`, Storage `127.0.0.1:55432`; Postgres has no host port.
- Hard memory limits: 768 + 192 + 384 MiB = 1344 MiB; CPU limits total 2 cores.
- Test identities are signed only by the local verification harness. This does NOT verify real login, SSO, token revocation, Shiny session isolation or production authorization.
- Shared team login is not sufficient to activate multi-user persistence. No harness identity or service credential may be exposed through Shiny.

## Reproduce on a new isolated host directory

1. Copy tracked files into a private directory; put authorized case files under `inputs/` (never Git).
2. Run `python3 setup_env.py`; keep `.env` mode 0600. Keys are pilot-only and initially expire after 24 hours. A real auth/rotation lifecycle is not implemented.
3. Ensure `bootstrap.sql` is readable by the database container (`chmod 644 bootstrap.sql`; it contains no secrets).
4. Run `docker compose -p lipidomic-pilot -f compose.yml up -d` and wait for Storage `/status` and REST readiness.
5. Apply schema as the administrative maintenance role, never as an app user:
   `docker compose -p lipidomic-pilot -f compose.yml exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < schema.sql`
6. Run `python3 verify.py`. This initial upload test requires an empty pilot catalog; it refuses duplicate commits.
7. Run `bash restore_test.sh`. The target directory must not exist. For another clean test set `RESTORE_TARGET` to a fresh private directory. The script stops only this pilot's HTTP services for a consistent backup, then restarts them. Restore services stop after successful verification.
8. Run `python3 verify.py --read-only --output restart-evidence.json` after restarting the pilot to verify persistence and negative authorization tests. Despite its name, read-only mode attempts denied writes to test protections; it must never be pointed at production.

## What was tested (2026-10-27)

Six actual previously used sickle-cell artifacts: two source Excel workbooks, sample manifest, verified 352-lipid session ZIP, prepared matrix CSV and volcano CSV. Raw contents and names are excluded from tracked evidence. All six SHA256 and byte sizes match after encrypted full restore and container restart.

- Initial test: 52 passed assertions.
- Expanded restored-instance test: 42 passed assertions.
- Expanded restart test: 42 passed assertions.
- These are repeated assertions across phases, not 136 distinct functionalities.
- Owner and viewer reads, outsider catalog/list/download/sign denial, anonymous private-object denial, denied uploads, membership escalation, mutation and duplicate record rejection.
- Scientific calculations were not rerun. Byte-identical preservation of the existing artifacts was verified; no new mathematical parity claim is made.

## Fixes discovered empirically

1. Minimal stack lacks GoTrue's migration of `auth.uid()`: updated helper to read current PostgREST `request.jwt.claims`, retaining legacy fallback.
2. Restored bootstrap script inherited mode 0600 and was unreadable inside the container: restored code file is now 0644 (secrets remain 0600).
3. Supabase default grants can widen privileges when tables are recreated. Restore now explicitly reapplies `permissions.sql`, resets local role passwords from the recovery environment and reruns authorization assertions. RLS prevented row disclosure in the failing attempt, but the extra privilege was still corrected.

## Backup and recovery

The encrypted archive contains a logical database dump, private storage objects and recovery environment. A separate key is required. Recovery is tested against an independent database/object volume with original instance intact. Encrypted backup and key were copied to restricted separate directories on the Mac; their custody should be formalized before production. This is an off-host recovery copy, not an independently administered disaster-recovery service. The temporary plaintext dumps/recovery files stay inside private operator directories; none are served or committed.

No machine reboot, Windows sleep recovery, concurrent heavy analyses, long-duration load, institutional approval or physical-phone testing is claimed. Backend hash roundtrip is not yet a Shiny ZIP restoration test.

## Before app integration

Implement individual authentication and per-session user-token isolation, shared R storage adapter, upload validation/atomic catalog commit, metadata versioning, applied-run records and draft conflict handling. `pilot_runs` is a schema placeholder; this pilot saves the existing ZIP as an artifact rather than reconstructing runtime state. Do not activate persistence through a shared privileged service key. Real sample metadata still resides in its versionable file; normalized metadata editing is pending.

Schema/API are deliberately prefixed `pilot_`; no production schema migration is implied. The team service was observed active with PID 1715767 before and after testing. PR #5 and main were not modified.
