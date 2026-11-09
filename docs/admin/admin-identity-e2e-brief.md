# Identity E2E as repo specs: brief for the agent

The coordinator proved the shared identity (`docs/integration/admin-identity.md`) and Nexo's store per client
(`docs/integration/nexo-store-scope.md`) on staging with four scratch scripts, now in
`frontends/admin/e2e/live/identity-scratch/` (read them first; each "Staging run" section says what they proved):

- `identity-seed.mjs`: two synthetic client members (alice.sim@ on ORD078's client, bob.sim@ on ORD082's), passwords
  written to a 600 file, never printed. Runs on the staging host (docker psql + GoTrue admin with the service key).
- `identity-api.mjs`: real GoTrue tokens -> Nexo API: own dataset 422 (authorized), other client 404, staff both,
  no token / forged token 401.
- `scope-e2e.mjs`: checkpoints per client, 24 checks, deletes what it saves.
- `identity-browser.mjs`: Admin sign-in as a member, Open in Nexo, other client's dataset refused, signed-out prompt.

Make them first-class, skipped-by-default live specs, the way `e2e/live/pilot.spec.ts` + `pilot-seed.mjs` are:

1. `frontends/admin/e2e/live/identity-seed.mjs`: the seed, with paths and datasets from env
   (`ADMIN_IDENTITY_CREDENTIALS` output file; the two order codes as `ADMIN_IDENTITY_ORDERS=ORD078,ORD082` or the
   first two released datasets of different clients when unset). Idempotent, never prints a password or key, archives
   and deletes nothing.
2. `frontends/admin/e2e/live/identity.spec.ts`, skipped unless `ADMIN_E2E_IDENTITY=1`: reads
   `ADMIN_IDENTITY_CREDENTIALS` and the staff persona from `ADMIN_PILOT_CREDENTIALS`, base URL `ADMIN_PILOT_BASE_URL`
   (one origin serving `/admin`, `/nexo-staging` and `/nexo-staging/api`), GoTrue at `ADMIN_IDENTITY_AUTH_URL` with
   `ADMIN_IDENTITY_ANON_KEY`. Three serial groups: the API checks of `identity-api.mjs` and `scope-e2e.mjs` (through
   Playwright's `request`, via `/nexo-staging/api/v1`), then the browser checks of `identity-browser.mjs`. Same
   assertions, same cleanup. Screenshots to `e2e/live/identity-evidence/` (gitignored).
3. `playwright.config.ts`: the identity mode like the pilot mode (no dev server; testMatch only the identity spec).
   Extend `tests/playwright-config.test.ts` for it.
4. Delete `e2e/live/identity-scratch/`. Add a "How to run" paragraph to `docs/admin/admin-pilot-simulation.md` or a
   short `docs/admin/admin-identity-e2e.md` (env vars, the seed command, what each group proves, what it does not:
   real people, session ids as capabilities).

You cannot reach staging: make the spec correct against the scripts and the real pages (roles and labels from the code),
run `npx tsc --noEmit`, lint, `npm test` and the demo Playwright suite, and show the identity spec is skipped without
the env. The coordinator runs it on staging. TDD where it applies (the config test red first). Pareto, no speculative
abstractions, synthetic data only, English, no secrets in git or output, no push, no gh. Do not touch
`db/admin/migrations`, `R/`, `frontends/nexo/` or Classic files.
