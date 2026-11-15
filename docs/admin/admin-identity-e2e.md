# Identity E2E (live, skipped by default)

Repo spec for the shared Admin identity in Nexo (`docs/integration/admin-identity.md`) and Nexo's store per client
(`docs/integration/nexo-store-scope.md`). It replaces the coordinator's scratch scripts of the 2026-11-08 staging runs
(brief: `docs/admin/admin-identity-e2e-brief.md`), with the same assertions and the same cleanup, the way
`docs/admin/admin-pilot-simulation.md` runs the pilot.

Files (in `frontends/admin`):

- `e2e/live/identity-seed.mjs`: finds or creates two synthetic client members, **Alice (simulated client)**
  `alice.sim@admin-staging.test` and **Bob (simulated client)** `bob.sim@admin-staging.test`, each a `viewer` of the
  client of one released dataset (`ADMIN_IDENTITY_ORDERS=ORD078,ORD082`, or the first two released datasets of
  different clients when unset). Each run sets a new generated password for both and writes passwords, user, client
  and dataset ids, order codes and versions to `ADMIN_IDENTITY_CREDENTIALS` (mode 600). It checks everything before
  writing anything, prints no password or key, archives and deletes nothing, and changes no existing row: a member
  that is lab staff, is an active member of the other client, has an archived membership, or has a verified TOTP
  factor stops it with a message.
- `e2e/live/identity.spec.ts`: skipped unless `ADMIN_E2E_IDENTITY=1`; then `playwright.config.ts` runs only this spec,
  against `ADMIN_PILOT_BASE_URL`, with no dev server (`tests/playwright-config.test.ts`).

## How to run it (coordinator)

The origin in `ADMIN_PILOT_BASE_URL` serves Admin at `/admin` (live, `NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1`), the Nexo app
at `/nexo-staging` and its API at `/nexo-staging/api` (`LIPIDOMIC_ADMIN_REQUIRE_USER=1`, `LIPIDOMIC_ADMIN_*` for the
same stack). The spec sends no nginx password: use an origin without one (the scratch runs used one on the staging
host), since Nexo's calls carry the Admin token in `Authorization`, where Basic auth would also go. The staff persona is Stephania (simulated) from the pilot seed's file.

```sh
cd frontends/admin
export ADMIN_IDENTITY_CREDENTIALS=e2e/live/.identity-credentials.local.json   # git-ignored; or a path outside the repo
export ADMIN_PILOT_CREDENTIALS=e2e/live/.pilot-credentials.local.json         # from e2e/live/pilot-seed.mjs
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ADMIN_IDENTITY_ORDERS=ORD078,ORD082 node e2e/live/identity-seed.mjs
ADMIN_E2E_IDENTITY=1 ADMIN_PILOT_BASE_URL=https://… ADMIN_IDENTITY_AUTH_URL=<supabase url>/auth/v1 \
  ADMIN_IDENTITY_ANON_KEY=… npx playwright test
```

The seed's service key needs `USAGE` on schema `admin`, `SELECT` on `"order"`, `dataset`, `lab_staff` and
`SELECT, INSERT` on `client_member`; without a gateway set `ADMIN_E2E_AUTH_URL` / `ADMIN_E2E_REST_URL` as for the
other seeds. Run the seed again whenever the passwords may have changed (each run resets both). Screenshots land in
`frontends/admin/e2e/live/identity-evidence/` (git-ignored); the Playwright HTML report holds the trace of a failure.

## What each group proves

| Group | Checks | Proves |
|---|---|---|
| 1 · API: Nexo opens an Admin dataset as the caller | Each member opens its own client's dataset (422 `preparation_choices_required`: authorized and downloaded) and gets 404 `dataset_not_found` for the other client's; staff open both (422); no token and a forged token are 401 `admin_auth_required` | `admin.nexo_dataset_for_caller` through the Nexo API with real GoTrue tokens: a client member reaches only its own client's released datasets, staff reach all, and nothing opens without a valid Admin token |
| 2 · API: Nexo's checkpoint store per client | Alice, Bob and staff each open a dataset session and save a checkpoint (members' records carry their `clientId`, staff's none); each list shows its own and none of the others' (a member's list only its client); Alice gets 404 downloading or deleting Bob's or the staff's checkpoint and restoring Bob's, Bob 404 downloading Alice's; Alice restores her own; a member's ZIP and workbook uploads are 403 `staff_only`; no token lists 401; each deletes its own checkpoint | The store is scoped by `admin.nexo_caller()`: workspaces per client, staff unchanged, out-of-scope ids look unknown (404, not 403), uploads are staff-only. Every checkpoint saved is deleted, by the last test or, after a failure, by `afterAll` |
| 3 · Browser: Nexo opens datasets with the Admin session | Each member signs in to Admin, sees **Open in Nexo** on its own order, Nexo fetches `/admin/api/session-token` (200) and opens `<ORDER> · v<n>` after **Prepare dataset**; the other client's `?dataset=` shows "This dataset is not available to Nexo", no dialog and no **Upload ZIP**; Admin shows no Open in Nexo on the other order; signed out, Nexo shows the **Sign in to Admin** link (`/admin/sign-in?next=…`) and opens nothing | The Admin cookie never leaves `/admin`; Nexo acts as the signed-in person through the same-origin token route; the refusal is the same as for a dataset that does not exist |

## What it does not prove

- **Real people.** Two synthetic viewers and a simulated staff member; no client admin or requester role, no member of
  two clients, no TOTP, no real lab data or real client.
- **Session ids as capabilities.** Card routes under `/sessions/<id>/…` take no per-call token check
  (`nexo-store-scope.md`, out of scope): anyone holding a session id can use that session. The spec does not test it.
- Not exercised here: token expiry and refresh in a long Nexo session, Admin down (503), a digest mismatch (502),
  autosave.
- **Not run here.** Written against the scratch scripts and the real pages (labels from `frontends/admin` and the Nexo
  UI on `nexo/phase1`), checked with `tsc`, lint, the unit suite, the demo Playwright suite, and the API groups against
  a throwaway local mock; this sandbox cannot reach staging. The coordinator runs it there.
