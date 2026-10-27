# Unattended browser CI

This runner launches real Classic and Team Shiny servers and exercises Chromium through Playwright. It needs no CUA extension, human file picker, account, API credential or patient dataset. It complements (does not replace) the 58-job numerical/contract acceptance suite.

## Run locally or on an isolated Linux runner

Install the R Imports/Suggests declared by DESCRIPTION, plus statmod, as in `.github/workflows/browser-regression.yml`. Put Rscript 4.4.3 on PATH. Use Node 22 and Python 3.

```sh
cd tests/browser/ci
npm ci
npx playwright install --with-deps chromium
npm test
```

`npm test` deterministically builds the ZIP from the committed synthetic fixture, starts Classic at 127.0.0.1:43230 and Team at :43231, runs two comprehensive scenarios with no retries, and shuts down its own servers. Occupied ports fail instead of reusing another app. Never use production for testing. CI refuses external-server mode.

For development only, `UI_TEST_EXTERNAL_SERVERS=1 npm test` can use pre-existing isolated Classic :3936 / Team :3935 processes on localhost. This is not how CI runs.

## Assertions

- Classic import must show pending restoration and Run Analysis before preparation; the explicit run reaches Re-run Pipeline.
- Classic document/Analytical Ensemble bounds at 390 and 320 px, expanding menu, cohort Edit control.
- Team restoration requires all three Design items; explicit review precedes preparation.
- QC cancellation does not schedule removal; confirmation schedules it while the applied eight-sample run stays unchanged; Undo restores ready state.
- Correct Control/Treatment palette groups and fitting grid at 390/320, visual color-picker activation.
- Browser page errors fail either scenario. No retries hide flakes.

Shiny acknowledgement of the exclusion reason is read only; tests never inject scientific state into the server. All actions use the real UI or native file input. The snapshot fixture contains synthetic S01–S08, Control/Treatment groups and artificial abundance values; no real patient measurements or credentials. `prepare-fixture.py` builds a deterministic ZIP and prints its SHA-256.

## Evidence and CI safety

HTML/JSON reports, explicit screenshots, failure videos/traces and source SHA are retained as artifacts for 14 days. Job permissions are contents:read. Uses pull_request (not pull_request_target) and workflow_dispatch; no push/merge/deploy step or secrets. Changes remain local until separately authorized publication. A hosted CI run cannot be claimed until GitHub actually executes the workflow on a published branch/PR.

This is functional/layout regression coverage, not a pixel-perfect visual baseline or full tool/3D/download audit. Viewport tests do not certify physical touch or soft-keyboard behavior. Physical-phone verification remains pending.

Sources: https://playwright.dev/docs/ci and https://playwright.dev/docs/test-webserver
