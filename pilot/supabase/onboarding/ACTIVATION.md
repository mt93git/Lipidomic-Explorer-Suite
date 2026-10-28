# Team enrollment and controlled activation

Status: prepared, not executed. Classic, main and PR #5 are excluded. The Team preview remains a pilot until the gates below pass. Do not send invitations or grant memberships from this document alone.

## Decisions needed

- Approved roster: exact email, project and owner/editor/viewer role per person. Proposed discussion list: Gerardo, Stephania, Ana Pau, Usman and Max; no access is inferred from this list. Max's GitHub collaborator access is not study-data access.
- Email/auth route: approved SMTP sender for Supabase invitations and recovery, or institutional identity integration. The current app only implements password sign-in. Invitation acceptance/password setup and recovery callbacks still require implementation and end-to-end testing; configuring SMTP alone is not enough.
- Operational owner and backup custodian; approved public Team hostname and permitted study data. Reuse the existing Team hostname only after checking its HTTPS/proxy configuration. Never publish Supabase database/REST/Storage administrative ports.

## Prepared now

`prepare.py` validates a private roster offline. It refuses the pilot project ID, test-domain accounts, unapproved roles, duplicate emails, missing owners and credential fields. It outputs only a summary and gates; it has no network calls or mutation path. Eight boundary tests are provided in `test_prepare.py`.

Private roster format (keep outside Git):

```json
{"project_id":"NEW-UUID","project_name":"Approved study","members":[{"email":"REAL-EMAIL","role":"owner","approved":true}]}
```

Validate with `python3 pilot/supabase/onboarding/prepare.py /private/path/roster.json`. Rejection is expected for this illustrative template. Mark `approved` true only after Gerardo confirms the exact address, role and project.

## Implementation sequence

1. **Identity lifecycle in staging.** Configure mail credentials outside Git; no service key in Shiny. Add invitation acceptance and recovery routes with exact redirect allowlist, one-time token handling and an English password-setting screen. No tokens in query logs/ZIPs/companion context. Keep signup disabled. Test successful/expired/reused links and wrong-recipient attempts with controlled accounts before sending any real invitation.
2. **Separate real project.** Create a new UUID, copy only approved case artifacts and checkpoints, recompute/check hashes, and seed only approved memberships. Do not rename the existing pilot into production or reuse its permissions. Verify all pilot test identities receive no rows, files or signed URLs for the real project. Verify owner/editor/viewer via both HTTP and Team. Invite membership activation only for the intended verified identity.
3. **Close persistence failure gap.** Make object/catalog commits retryable and reconcile orphan objects. Fault-inject interruption after upload and before catalog commit, then retry without duplicate or missing checkpoints. Keep saved scientific state immutable and require explicit preparation review on restore.
4. **Operational staging.** Test HTTPS and Shiny WebSocket reconnect with the existing proxy; retain loopback-only Supabase services. Configure service startup, readiness monitoring, capacity limits, scheduled encrypted DB+object backups and external backup verification. Rehearse recovery with users and memberships. Physical-phone test remains pending; document it separately.
5. **Controlled Team activation.** Pin a reviewed commit and immutable release directory. Record current Team service config, executable, environment, PID and release path. Take a consistent backup. Drain active sessions or use an agreed maintenance window; do not restart a live analysis without notice. Switch only Team to the candidate release with the library feature flag and three non-secret service URLs. Smoke-test individual login, save, sign-out, resume and a denied outsider. No Classic release or Git branch merge is part of this operation.

## Rollback

First restore the previous Team release/service configuration and disable `LIPIDOMIC_PROJECT_LIBRARY`. Do not roll back or delete the database: new checkpoints and memberships must remain recoverable. Preserve the failed release/logs privately. If the old app cannot read new checkpoints, provide the verified ZIP portability route. Verify the previous Team workflow and Classic availability. Record the activation/rollback timestamps and identifiers without credentials.

## Completion evidence required

- Approved roster summary and role tests (addresses stay private).
- Invitation acceptance, password recovery and token reuse/expiry tests.
- Team UI screenshots; no test account can see the real project.
- Save/reopen same data hashes; scientific settings unchanged until confirmation.
- Interrupted upload recovery; restart and DB/object/user restore.
- HTTPS/WebSocket check, memory observation and rollback rehearsal.

Existing evidence: 59 R acceptance jobs, 23 real-auth/archive checks and 46 restored-instance assertions are baseline pilot evidence, not proof that real-team enrollment or production activation has happened.
