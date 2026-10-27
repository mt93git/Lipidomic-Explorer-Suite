# Classic / Team browser replay scenarios

Runner: documented CUA browser API, using `tab.playwright` locators, read-only DOM geometry, screenshots and file chooser. This is executable scenario automation, not a headless CI workflow. It complements the 58 R acceptance jobs and the JS layout-event regression.

## Safety and setup

Use fresh isolated test processes/sessions only. Never point these scenarios at the team production app. Disable external AI and runtime dependency installation. Use the synthetic 12-lipid/8-sample fixture (S01–S08; Control/Treatment; QRILC seed 7; normalization none), not patient data.

The audited Classic-exported ZIP has SHA-256 `2172c2f5b0f5d7bc3ea47d9c7ea33ffc43dcc75d51e4343da97e3f88962acc66`. Supply its absolute path as `zip`; it is in the external audit bundle, not committed to source. Do not silently substitute a different dataset. The same archive is restored in both shells to test cross-interface compatibility.

Import `replay.mjs` in a CUA-enabled Node session. Supply:

- `tab`: an isolated tab bound through CUA.
- `viewport`: the browser's documented viewport capability.
- `save(name, bytesOrText)`: writes artifacts to an external evidence directory.

Create/bind each intended tab before setting its viewport. Record the actual DOM width: a requested emulation size is not proof it applied. Always reset the viewport at the end.

## Repeatable scenarios

1. Classic: close the welcome dialog; wait until it disappears, set 390×844, open the sidebar if necessary. `await restore(classic, zip)`. Wait for `All (12)` and the restored-session message; capture pending state. Click `Run Analysis` explicitly and wait for `Re-run Pipeline`. Collapse the sidebar. `await classicMobile(classic, viewport, save)` asserts 390/320 page and label bounds, expanded menu height, and Edit opening the cohort editor.
2. Team: expand `Resume from a saved session ZIP instead` with an exact text locator (the native details summary may be exposed as generic, not button). `await restore(team, zip)`. Wait for the three missing Design items. `await reviewTeamDesign(team, save)` checks the required review state and fills only synthetic design information. The helper waits for server-rendered validation before checking the review box. Click `Prepare data` explicitly; wait for the sample selector.
3. Team scientific decision: select synthetic S01, fill `Reason for exclusion`, blur and inspect the resulting state before clicking `Review exclusion` (Shiny text inputs are debounced). Once the confirmation dialog is visible, `await teamConfirmation(team, save)` cancels, asserts no scheduled exclusion, reopens and confirms, then asserts **Changes pending + 8 samples**. The applied result must remain unchanged. Undo the pending decision before proceeding.
4. Team palettes: open Results → Colors & palettes with Control/Treatment group context. `await teamPalette(team, viewport, save)` verifies layout at 390/320 and that the Control visual picker opens. It does not apply colors or change scientific parameters.

Each helper throws on a failed assertion. Save that failure separately; do not mark the scenario PASS after catching an error. Capture console logs separately rather than assuming that passing layout assertions proves a clean console.

## Coverage boundaries

This set covers restore gates, design review, exclusion cancel/confirm, responsive navigation and palette rendering. It does not replace numerical parity, download-byte comparison, complete 3D testing, AI policy evaluation, or physical-phone keyboard testing. Initial exploratory selector/readiness failures are recorded in the external report; the final scenario functions were executed successfully. Running these scenarios still requires documented session setup; no unattended CI browser runner has been claimed.
