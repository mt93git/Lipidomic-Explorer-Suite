# Shared identity: Admin accounts in Nexo (Phase 1B, identity part)

Admin owns the accounts (GoTrue on the Admin stack: email + password, TOTP, roles in the `admin` schema: lab staff
vs client member of one or more clients). Nexo has no accounts. This contract lets Nexo act **as the signed-in Admin
user**, so a client opens only its own released datasets. Real-time collaboration (another session) builds on the
same token: anything that needs "who is this" validates the Admin access token, never a Nexo-made identity.

Read first: `docs/integration/admin-nexo-open.md` (today's open path, staff only, with the `nexo_reader` token).

## Flow

1. The person is signed in to Admin (its cookie is scoped to `/admin`, so Nexo cannot read it).
2. Nexo (same origin) calls `GET /admin/api/session-token` with credentials. Admin answers
   `200 {"accessToken": "<GoTrue JWT>", "expiresAt": <unix s>, "userId": "<uuid>", "view": "staff" | "client"}` or
   `401 {"error": "signed_out"}`. Headers: `Cache-Control: no-store`; refused (403) unless the request is same-origin
   (`Sec-Fetch-Site: same-origin`, or no `Origin` header other than its own). Refreshes the session like any page.
3. Nexo sends `Authorization: Bearer <accessToken>` on `POST /api/v1/datasets/sessions` with `adminDatasetId`
   (and keeps fetching a fresh token before it expires; on 401 it shows "Sign in to Admin" linking to
   `/admin/sign-in?next=<current Nexo URL>`).
4. The Nexo API authorizes with **the user's token** and downloads with **its own**:
   - RPC `admin.nexo_dataset_for_caller(p_dataset_id uuid)` through PostgREST with `apikey: <anon>` and the user's
     `Authorization`. PostgREST verifies the JWT; an invalid or expired token is 401 there and
     `401 admin_auth_required` from Nexo. No row → `404 dataset_not_found` (same answer for "not yours" and "does not
     exist").
   - Then the existing `nexo_reader` path: download from `admin-files` and check the sha256 (502 on mismatch or a 4xx
     from Storage, 503 when Admin is down). The user's token is never stored, logged or sent to Storage.
5. The session records who opened it (`dataset.openedBy = {userId, view, clientId}` from the RPC row) for later
   (collaboration, saving per client). Nothing else changes in Nexo yet.

## Database (migration `0010_nexo_caller.sql`, Admin task; needs Gerardo's OK before staging)

`admin.nexo_dataset_for_caller(p_dataset_id uuid) RETURNS TABLE (dataset_id uuid, order_code text, version int,
storage_path text, sha256 text, client_id uuid, caller uuid, caller_view text)` — `SECURITY DEFINER`, pinned
`search_path`, `EXECUTE` to `authenticated` only. A row only when the dataset is `released`, not archived, its order
not archived, and `auth.uid()` is lab staff (`caller_view = 'staff'`) or an active member of the dataset's client
(`'client'`). Prove it in PGlite and in `db/admin/test/staging.integration.mjs` (staff yes; member of that client yes;
member of another client no; built/withdrawn no; anon no).

## Switch

`LIPIDOMIC_ADMIN_REQUIRE_USER=1` on the Nexo API makes the Bearer token mandatory for `adminDatasetId`. Unset, the
staff-only path of `admin-nexo-open.md` keeps working (no token needed), so rollout is: deploy, test, then switch on.
Admin shows **Open in Nexo** to client members only when `NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1`.

## Not in this step (written down on purpose)

- **Nexo's own store is not per client yet**: checkpoints and the project library are shared by everyone who reaches
  Nexo. Until they are scoped, client access stays off in production (`NEXT_PUBLIC_NEXO_CLIENT_ACCESS` unset) and the
  nginx password stays in front of `/nexo`. Scoping the store by `openedBy.clientId` is the next identity step.
- Collaboration (presence, comments, versions): the collab session's work; it consumes this token.

## Nexo's own entry (2026-11-10, ENTRY-3)

Nexo is a separate app with its own sign-in page on Admin's accounts: one password for both, and signed in to Admin
means signed in to Nexo (the same session cookie, scoped to Admin's base path: `/admin`, staging `/admin-staging`).
All on the same origin; every answer `Cache-Control: no-store`; 403 `{"error":"cross_origin"}` unless same-origin (the
session-token rule above), decided before anything else.

- `POST <base path>/api/sign-in`, JSON `{email, password, code?}`: the sign-in form's own `authenticate` and cookie
  (the client preference cookie is cleared, as the form does). `200 {"ok":true}`; `401 {"error":"invalid_credentials"}`;
  `401 {"error":"code_required"}` (two-step on, no code); `401 {"error":"invalid_code"}` (refused or not six digits);
  `400 {"error":"missing_fields"}` (no email or password, a non-string field, not a JSON object);
  `503 {"error":"unavailable"}` (GoTrue down or rate-limited, and always in the demo). The password and code go to
  GoTrue only: never logged, never echoed.
- `POST <base path>/api/sign-out`: `204`, ending the session exactly as Admin's Sign out (GoTrue local scope, client
  and view preferences cleared); `503 {"error":"unavailable"}` when GoTrue could not end it.
- `next=` on `<base path>/sign-in`, `/forgot-password` and `/invite/<token>`: a same-origin Nexo path,
  `/nexo/<path>` or `/nexo-staging/<path>` (with its query and fragment), exactly as the URL parser keeps it; nothing
  else new is accepted. Sign-in returns there with a full navigation; Forgot password carries it back to sign in (the
  emailed reset link cannot carry it, so after a reset the person signs in from Admin's page); the invitation carries it
  through Sign in to accept (`/invite/<token>?next=<encoded Nexo path>`) and continues there once accepted.

Database (`0024_nexo_members_prepare.sql`, not applied anywhere yet):

- `admin.client.members_prepare boolean NOT NULL DEFAULT false`: the client's members may prepare datasets and upload
  their own Excel in Nexo. Lab Owner or Admin, through `admin.set_client_members_prepare(uuid, boolean)`, in the
  client's settings next to the Nexo switch; turned on only while `nexo_access` is on; client members never change it.
- `admin.nexo_datasets_for_caller() → TABLE (dataset_id uuid, order_code text, version int, client_id uuid,
  client_name text, released_at timestamptz, members_prepare boolean)`: lab staff get every released dataset of an
  unarchived order; a client member those of their clients with `nexo_access` on; no e-mail. Grants as
  `nexo_dataset_for_caller` (`authenticated` only).
- `nexo_dataset_for_caller` and `nexo_caller` gain a last column `members_prepare boolean`, same rows and grants.
- `members_prepare` in every row is the row's client's `nexo_access AND members_prepare`. `nexo_caller`'s staff row has
  no client, so `NULL` there: lab staff are not gated by it.

## Staging run (2026-11-08)

0010 applied to Admin staging; `staging.integration.mjs` 57/57 (7 caller checks with real GoTrue tokens). Nexo staging
API on nexo/phase1 1dec64e4 with `LIPIDOMIC_ADMIN_REQUIRE_USER=1`; Admin staging with `NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1`
(staging only). Two synthetic client members, one per client (`alice.sim@` on ORD078, `bob.sim@` on ORD082):

- API, real tokens: each member opens its own dataset (422 preparation choices, i.e. authorized and downloaded), the
  other client's is 404; lab staff open both; no token and a forged token are 401 `admin_auth_required`.
- Browser, through Admin's session: each member signs in to Admin, sees **Open in Nexo** on its own order, Nexo
  fetches `/admin/api/session-token` and opens `<ORDER> · v1`; the other client's `?dataset=` shows the not-available
  message and opens nothing; Admin shows no Open in Nexo on the other order; signed out, Nexo offers "Sign in to Admin".
  9/9.

Seen on the way (the "not in this step" gap, confirmed): Nexo's refusal page still offers **Choose checkpoint**, which
lists the shared store. Scope the store by `openedBy.clientId` before `NEXT_PUBLIC_NEXO_CLIENT_ACCESS` goes anywhere
but staging.
