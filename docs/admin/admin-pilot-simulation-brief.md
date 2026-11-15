# Admin pilot by simulation: brief for the agent

Paula and Stephania cannot run the Admin pilot, so we simulate it with two synthetic personas, the way the Nexo
pilot was simulated (`tests/dual-ui/pilot/pilot_figure1.cjs`, `docs/integration/nexo-pilot-simulation.md`). The
goal is evidence that the whole release flow works **through the screens**, by the people the lab named, against
the real Admin staging stack and the Nexo staging API. Read first: `docs/admin/admin-wave2b-brief.md`,
`docs/integration/admin-nexo-open.md`, `frontends/admin/e2e/live/live.spec.ts` and `seed.mjs`.

## The story (one serial Playwright spec, every step in the UI)

Personas: **Stephania (simulated)**, lab staff role Owner; **Paula (simulated)**, lab staff role Admin.

1. Steph signs in and, on **Release policy**, sets eligible signers = Paula and Steph, required signatures = 2.
2. Paula signs in, and for a fresh synthetic order of a synthetic client: **Receive shipment**, **Sample registry**
   (samples whose names match the injections of `packages/admin-ingest/test/fixtures/sciex-synthetic.txt`, two
   groups), **Ingest results** (upload that TXT, accept it), then **Release → Build dataset v1**.
3. Paula signs (Prepared). The page says one more signature by a different person is needed; Paula cannot release.
4. Steph signs in, signs (Approved) and **Releases**. The order is Released; the Team project id is shown.
5. Steph clicks **Open in Nexo**: the Prepare dataset dialog lists the samples with Team's defaults; she confirms;
   the canvas title is `<ORDER> · v1` and shows the lipid and sample counts; she adds one plot and it renders
   (no error toast, no console errors other than the expected 422 of the first call).
6. Checks that matter: Datasets lists the version with both signer names; the audit log has the release.

Take a full-page screenshot at each step into `frontends/admin/e2e/live/pilot-evidence/` (gitignored), named
`01-policy.png` … so the coordinator can show them.

## Files you own

- `frontends/admin/e2e/live/pilot.spec.ts` (new) and `frontends/admin/e2e/live/pilot-seed.mjs` (new).
- `pilot-seed.mjs`: with the stack's service key from env, create (idempotently) the two personas as GoTrue users
  `paula.sim@admin-staging.test` and `steph.sim@admin-staging.test` with display names, insert their
  `admin.lab_staff` rows, create the synthetic client, and write their generated passwords to a file given by
  `ADMIN_PILOT_CREDENTIALS` (mode 600). Never print a password or key. Archive nothing, delete nothing.
- The spec reads credentials from that file, the base URL from `ADMIN_PILOT_BASE_URL` (one origin that serves
  `/admin` and `/nexo-staging`; the coordinator provides it), and is skipped unless `ADMIN_E2E_PILOT=1`. When it
  runs it must not start the demo dev server (adjust `playwright.config.ts` minimally for that case only).
- `docs/admin/admin-pilot-simulation.md` (new): what is simulated, how to run it, what each step proves, and
  what is **not** covered (human judgement on whether the screens fit the lab's practice; real data).
- `frontends/admin/.gitignore` for the evidence folder and any local credentials file.

You cannot reach staging: make the spec correct against the code (selectors from the real pages, roles and
labels, no brittle text where a role exists), run `npx tsc --noEmit`, lint and the existing `npm test` and demo
Playwright suite (they must stay green), and confirm the pilot spec is skipped without the env. The coordinator
runs it against staging. If a screen cannot do a step of the story in live mode, do not work around it: write the
gap in the doc and in your report.

## Practice

Pareto, no speculative abstractions, synthetic data only, English in code and docs, no secrets in git or output,
no push, no `gh`. Do not touch `db/admin/migrations`, `R/`, `frontends/nexo/` or Classic files. Paste the output
of every command in your report.
