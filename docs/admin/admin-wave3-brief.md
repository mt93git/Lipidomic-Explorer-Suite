# Admin, phase 1, waves 2 (rest) and 3: shared brief for agents

Read `docs/admin/admin-wave1-brief.md` and `docs/admin/admin-wave2-brief.md` first (what Admin is, data rules,
the UI ↔ database contract style). This file adds what the rest of wave 2 and wave 3 build. Work on the ref you
were given (`admin/phase1` tip). The app is on Next 16 (Turbopack); links go through `@/components/app-link`.

## Practice (keep it simple)

- TDD: write the test first, see it red, then make it green. Small commits, each green.
- One test per boundary, not more: unit tests for logic, PGlite tests (`db/admin/test/*.test.js`, `npm test` in
  `db/admin`) for every new SQL function including its refusals, and **one** Playwright demo spec for the happy
  path of a new screen (`frontends/admin/e2e/`, `NEXT_PUBLIC_NEXO_URL=https://nexo.example.test npx playwright test`).
- Append checks for new functions to `db/admin/test/staging.integration.mjs` in its existing style. Agents
  cannot reach staging; the coordinator runs it.
- Pareto: reuse the existing page shell, `.field`, `.notice`, `ActionForm`, `ErrorSummary`, tokens. No new
  dependencies, no speculative abstractions, no screens or options beyond your task.
- Synthetic data only. Repo files in English. Never edit Team, Nexo, R, `pilot/`, Classic or another task's files.
  Do not edit `src/lib/navigation.ts` (the coordinator marks screens ready when merging).
- Migrations are a Gerardo gate: write them and their tests; never apply them anywhere.
- Commit only on your own task branch; never on `admin/phase1`; no push.

Checks before each commit: `cd frontends/admin && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
(and `cd db/admin && npm test` when SQL changed). Build `packages/admin-ingest` first (`npm ci && npm run build`).

## Decisions (Gerardo, 2026-11-09)

- Batch export without Usman's blank SCIEX OS template: a generic CSV sequence + bench sheet now; every SCIEX OS
  specific column lives in one adapter file, to be filled when the template arrives.
- Invitations (round 2): an Owner creates a 7-day link and copies it; the app sends no email.
- Out of scope (phase 2): the freezer box map (Storage screen), the Instruments & panels screen (the batch builder
  reads seeded `admin.instrument` / `admin.panel` rows), and a second approver for granting Admin/Owner.

## Round 1 contract

| Function (`SECURITY DEFINER`, `search_path` pinned, granted to `authenticated`) | Who | Effect |
|---|---|---|
| `create_order(p_client_id uuid, p_panel_id uuid, p_title text, p_matrix text, p_expected_samples int, p_billing_ref text, p_notes text) returns uuid` | `admin.require_lab_writer` | inserts `admin."order"` at stage `request`, `requested_by = auth.uid()`; refuses an archived client or panel; audited by the existing trigger. Migration `0013_orders.sql`. |
| `create_client(p_name text, p_kind text, p_billing_method text, p_notes text) returns uuid` | `admin.is_lab_manager()` | inserts `admin.client`; duplicate name refused with a clear message. Migration `0014_clients.sql`. |
| `update_client(p_client_id uuid, p_name text, p_kind text, p_billing_method text, p_notes text) returns void` | `admin.is_lab_manager()` | edits those fields only. |
| `archive_client(p_client_id uuid, p_reason text) returns void` | `admin.is_lab_manager()` | refuses while the client has an order that is not archived or released; sets `archived_at`/`archived_reason`. |

## Where code goes (round 1)

| Task | Paths it owns |
|---|---|
| New order | `db/admin/migrations/0013_orders.sql`, `db/admin/test/orders.test.js`, `src/app/(workspace)/new-order/`, a `createOrder` in `src/lib/data/orders.ts`, `e2e/new-order.spec.ts` |
| Sample detail | `src/app/(workspace)/samples/[code]/`, a reader in `src/lib/data/samples.ts`, the link from registry rows, `e2e/sample-detail.spec.ts` |
| Clients | `db/admin/migrations/0014_clients.sql`, `db/admin/test/clients.test.js`, `src/app/(workspace)/clients/` (list + `[id]`), `src/lib/data/clients.ts`, `e2e/clients.spec.ts` |
| Batch engine | `frontends/admin/src/lib/batch/` and its tests only (pure TypeScript, no UI, no database) |

Shared files that more than one task may touch (`src/lib/data/demo-store.ts`, `staging.integration.mjs`): add
your own clearly separated block; the coordinator resolves merges.

## Report (in Spanish)

Exact model id; done / partly / skipped and why; every command you ran with its result (test counts, Playwright);
any contract change you needed (say it, do not silently diverge); branch and commits.

## Round 2 contract: People, invitations, roles (migration `0015_people.sql`)

Facts: staging GoTrue has `GOTRUE_DISABLE_SIGNUP: 'true'` (no self sign-up), so an invited person's auth user is
created by the Admin app server with the service-role key (`SUPABASE_SERVICE_ROLE_KEY`, a new **server-only**
env var; never sent to the browser, never `NEXT_PUBLIC_`). Lab roles already require two-step sign-in
(`src/lib/session.ts`, `src/lib/auth-service.ts`); keep that path for invited lab staff.

| Function | Who | Effect |
|---|---|---|
| `create_invitation(p_email text, p_lab_role text, p_client_id uuid, p_client_role text) returns text` | lab Owner for lab roles; lab Owner/Admin for client roles | exactly one of (lab role) or (client + client role); new table `admin.invitation` stores email, role target, `token_sha256`, `expires_at = now() + 7 days`, `created_by`; returns the raw token once (only its hash is stored); refuses an email that already holds that role |
| `invitation_preview(p_token text) returns table(email text, target text, expires_at timestamptz)` | `anon`, `authenticated` | valid, unexpired, unaccepted, unrevoked token only; otherwise no row |
| `accept_invitation(p_token text, p_user_id uuid) returns void` | `service_role` only | inserts `admin.lab_staff` or `admin.client_member` for that user; marks the invitation accepted; refuses an expired/used/revoked token or a user whose email differs |
| `revoke_invitation(p_invitation_id uuid) returns void` | same as create | marks revoked |
| `set_lab_role(p_user_id uuid, p_role text) returns void` | lab Owner | refuses to remove or demote the last active Owner |
| `set_client_member_role(p_member_id uuid, p_role text)` / `archive_member(p_kind text, p_id uuid, p_reason text)` | Owner/Admin (lab staff: Owner only) | change or archive a membership; never deletes |

Screens: `/people` (lab staff and client members in one list with role, client, two-step status if readable,
pending invitations with copy-link / revoke; "Invite" form), `/invite/[token]` (public: shows who is invited for
what, the person sets a password, the server creates the user and accepts; then "Sign in →"), `/roles-permissions`
(read-only matrix in plain lab words: one source in TypeScript, plus a test that checks it against the role
helpers' rules where practical). The app sends no email; the Owner copies the link.

## Round 2: batch and run screens (no migration unless strictly needed)

Use `src/lib/batch/` (the engine from round 1). `/batch-builder`: pick registered samples of one or more orders
(lab staff), set the rules and seed, preview the sequence and plate map with the run time, save as a planned
batch with version 1 (existing tables `admin.batch`, `admin.batch_version`, `admin.injection`; write through new
SECURITY DEFINER functions if RLS does not allow the insert — then it is a migration `0016_batches.sql`). `/batch-run/[name]`
(or the batch page): download the sequence CSV and bench sheet, "Mark exported" (freezes the version through the
existing `freeze_batch_version` trigger and moves the orders to `sequence_exported`), "Mark acquired" (orders to
`acquired`). The results ingest then works as today.

## Correction (2026-11-10): injection names

Unknown injections are named by the **sample code** (`ORD041-S037`), never by the client's FullName: sample and
injection names never carry client-written text (wave 1 rule). The release matcher (`src/lib/release.ts`,
`matchSamples`) already accepts the code, or `<anything>_<code>`. FullName stays in the bench sheet for people,
with spreadsheet formula characters neutralized.
