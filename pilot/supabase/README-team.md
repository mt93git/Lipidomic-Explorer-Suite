# Team project library — isolated candidate

Enabled only for Team with `LIPIDOMIC_PROJECT_LIBRARY=1`. Classic's presentation files are unchanged, and the feature is off by default. The common ZIP import/export bodies were factored into callable helpers without changing their processing; the original Classic handlers call the same helpers. The persistence-input filter also excludes every `team_library_*` field to prevent credential leakage.

## Running candidate

RTX directory `/home/gjb47/lipidomic-team-library-candidate`, loopback port 3945. Local SSH-forwarded preview: http://127.0.0.1:3945/ . Existing team service on 3877 is not replaced.

Set these non-secret server environment values:

- `LIPIDOMIC_INTERFACE=team`
- `LIPIDOMIC_PROJECT_LIBRARY=1`
- `LIPIDOMIC_AUTH_URL=http://127.0.0.1:55433`
- `LIPIDOMIC_REST_URL=http://127.0.0.1:55431`
- `LIPIDOMIC_STORAGE_URL=http://127.0.0.1:55432`

Only user access/refresh tokens enter the Shiny session. Neither service key nor JWT signing secret is configured in the app. The library validates the user online before operations and refreshes expired access tokens. Logout revokes the refresh session and reloads Shiny to clear loaded scientific data. Supabase access JWTs retain their normal bounded expiry; immediate global access-token revocation is not claimed.

## User workflow

1. Sign in with an operator-provisioned individual account.
2. Choose a shared project and checkpoint, then **Resume checkpoint**.
3. Review Design and Quality. Explicitly confirm before **Prepare data**; no calculation is automatically applied by restore.
4. Use **Save current analysis** to store a new private ZIP checkpoint. Pending scientific edits must be applied or reverted, as required by the existing ZIP serializer.
5. Sign out to clear the session. Sign in again to resume the checkpoint without re-uploading files.

Viewers can resume but cannot save. Accounts without membership see an empty-state message, not project names. Project creation, membership administration, invitations, password recovery and SSO are operator tasks or future UI work; public self-signup is disabled. The current accounts are isolated pilot test accounts, not actual lab-member enrollment. Credentials are kept outside the repository.

A checkpoint preserves source files and analysis settings, not a running R process. Restoring deliberately requires scientific review before recomputation. It is not autosave. Start a fresh session before opening another checkpoint to avoid replacing unsaved work.

## Evidence

- 59/59 final R acceptance jobs, including Classic/Team state roundtrips, reference mathematical parity, and the new credential-filter boundary test.
- 23 HTTP/archive checks using real GoTrue password identities: owner/viewer/outsider visibility, denied wrong password and public signup, checkpoint integrity, no library fields/passwords in ZIP state, source-data parity and refresh rejection after logout.
- Browser: owner sign-in → resume original case → save checkpoint → reload/sign in → resume saved checkpoint; logout clears loaded data; outsider sees no projects.
- Simulated mobile 390×844: viewer login/resume, save button absent, document width 390 (no horizontal overflow). Physical phone remains pending.
- Encrypted database/object backup after adding Auth and the UI-created checkpoint: 46 restored-instance assertions passed for seven files. Restored real owner identity could sign in and see seven records.

The first acceptance run had one architecture-test failure from a feature-flag helper unavailable to an isolated hook test. Fixed with a direct opt-in flag at the hook boundary; the complete final run is green. The first Auth-inclusive recovery test exposed a blank-line environment-parser error; fixed and the restored instance was then tested successfully.

## Remaining operational limits

Keep this instance private and separate from production. Before enrolling lab accounts: establish invitation/reset delivery, operator ownership, monitoring, token/key rotation and approved HTTPS deployment. Infrastructure tokens were renewed for one year; user access tokens expire after 15 minutes and use per-session refresh. Key rotation remains an operator responsibility; this candidate is not an unattended production service. Upload and catalog commit are separate operations: an interrupted catalog commit may leave an unlisted object requiring reconciliation. No continuous autosave, conflict-merging or scheduled disaster recovery is claimed.
