# Pilot persistence reliability

Scope: isolated Team candidate on `pilot/supabase-project-library`. No Classic, main, PR #5 or production Team release changes.

## Interrupted saves

`team_library_commit` reconciles an object uploaded before a lost response and a catalog insert committed before a lost response. Every successful result requires an exact SHA-256 match and a catalog record. Retries of identical bytes are idempotent. The UI retains the exported ZIP in the current Shiny session and provides **Retry saved checkpoint**; it does not rerun preparation or silently change scientific settings. A pending save must be retried before another version is created.

`test_interrupted.R` injects four failures around actual HTTP writes. Each case retries twice, checks exactly one catalog record and verifies downloaded bytes. A browser test separately stops the pilot Storage service, attempts Save, restarts Storage, and clicks Retry. Screenshots record the incomplete and recovered messages.

Limitation: the pending local ZIP is session-scoped, not a durable upload queue. Closing the session or crashing Shiny before commit requires returning to the last saved checkpoint. An already uploaded orphan object is retained and can be reconciled by retrying the same bytes; automatic cross-session orphan discovery/recovery remains an activation gate. No orphan garbage collection is enabled.

## Backups

`backup.py` creates unique timestamped directories under `backups/`. It locks concurrent executions, checks spare disk capacity, briefly stops only pilot REST/Storage/Auth for a consistent database/object boundary, and restores service readiness in a finally block. It includes the database (users/memberships), object files and recovery environment. AES-256-GCM authenticates the encrypted archive. Keys are stored separately under mode-restricted `backup-keys/`; never commit either data or keys.

A COMPLETE marker is created only after encryption, authenticated decrypt/roundtrip comparison and healthy service restart. Failed attempts remain incomplete; no old backup is overwritten or deleted. Retention/capacity alerts and automatic external replication still need operational policy. The systemd unit also restores readiness in ExecStopPost if Python exits unexpectedly; whole-host loss still requires checking recovery. For a manual interruption, inspect service status and run `docker compose -p lipidomic-pilot -f compose.yml up -d --wait` before retrying. Do not treat this pilot scheduler as a production backup service yet.

`test_backup.py` checks roundtrip, wrong-key rejection, ciphertext tampering rejection, no unverified plaintext output, and refusal to overwrite. `restore_test.sh` decrypts only after authentication and restores into separate containers/ports. It reapplies minimal grants before verification.

## RTX scheduler

User systemd units in `systemd/` run nightly at 03:30 America/New_York with up to five minutes jitter; Persistent=true catches missed runs. The service was actually invoked successfully before enabling the timer. User lingering is enabled so logout does not stop scheduling. `sg docker` selects the operator's already-existing Docker group; no new group membership was granted. The Python process is capped at 256 MiB; pilot containers retain their independent limits.

Inspect: `systemctl --user status lipidomic-pilot-backup.timer` and `journalctl --user -u lipidomic-pilot-backup.service`. Pause: `systemctl --user disable --now lipidomic-pilot-backup.timer`.

An authenticated backup was restored with 62 storage/permission checks and 43 real-account/archive checks. A separate encrypted copy and recovery key were transferred to private, separate Mac directories; ciphertext SHA-256 matches the remote manifest. External sync is manual, not scheduled.

## Remaining activation gates

Approved team roster/roles and mail sender; invitation/password recovery screens; public HTTPS/WebSocket tests; durable cross-session upload recovery; backup failure alerts, retention and automatic off-host copies; restart/host recovery rehearsal; phone hardware test. No real users were created or invited during this work.
