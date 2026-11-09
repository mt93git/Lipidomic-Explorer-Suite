# Nexo chart audit: every plot, one by one (Opus 5.5 + Fable 5.1, adversarial Astra)

Goal: for each of the 58 catalog plots, prove in a real browser against the real API that (1) it draws and looks
like Team's plot with the same inputs, (2) every control Team offers for it can be changed in Nexo's Inspector and
the plot redraws with the change, and (3) its presentation is as clean as it can be. A plot closes only when the
auditor (Opus 5.5) and the adversary (Codex gpt-6-astra) both sign that its report is true.

## Where it runs

- Agents: Fabric on the M1, project LipidomicExplorer. Auditor and designer on account **claude-b**
  (`profile: claude-b`; Opus 5.5 = `claude-opus-5-5`, Fable 5.1 = `fable`). Adversary on `codex-a`, `gpt-6-astra`.
- Branch: `nexo/chart-audit` on the M1 clone, cut from `nexo/phase1`. Commits on the branch only: no push, no `gh`.
  This session merges it into `nexo/phase1`, deploys and re-checks.
- API: two extra, synthetic-only API instances on the RTX (`lipidomic-api-audit` on port 3961 for auditors,
  `lipidomic-api-audit2` on 3962 for the designer), each with its own storage folder holding only
  `nexo-complete-synthetic`. The M1 reaches them at `http://127.0.0.1:3961` and `:3962` through tunnels. Real pilot
  data is not reachable from the M1 and must never be used.
- App: `cd frontends/nexo && NEXO_AUDIT_PORT=<batch port> npx vite --config ../../tests/dual-ui/chart-audit/vite.audit.config.mjs`,
  then open `http://127.0.0.1:<port>/nexo/?checkpoint=nexo-complete-synthetic`. One Vite port per batch
  (`tests/dual-ui/chart-audit/batches.json`). Playwright: `tests/browser/ci` (Chromium; WebKit for the final pass).
- The API holds at most two live sessions. At most two agents use it at the same time (one auditor, one designer).
  A `409 session_lost` means another agent evicted the session: reopen the checkpoint and continue.

## The three roles, per batch (12 batches, 3–7 plots each)

1. **Audit (claude-b · Opus 5.5).** For each plot in the batch: add it from the Library (or select it on the
   synthetic canvas), then work through the checklist below in a real browser. Every check gets PASS / FAIL / N/A
   with evidence: a screenshot path and, for FAIL, the exact message or the visible defect. A FAIL that is a Nexo
   bug is fixed in the same task, test first (red commit, then green), in `frontends/nexo/` or `R/frontends/api/`.
   A FAIL that is Team's own behaviour is recorded as such and not "fixed".
2. **Design (claude-b · Fable 5.1).** After the audit of that batch: review each plot as drawn in the card and in
   the Inspector, and propose and implement presentation improvements (see "What design may change"). Before and
   after screenshots for each change.
3. **Adversarial review (codex-a · gpt-6-astra).** Reads the batch report, the diff and the screenshots, and checks
   each PASS and each claim against the code (schema, `api/`, `cards.ts`, `PlotEditor/`, the module markup behind
   the catalog). Verdict per plot: AGREE, or DISAGREE with the reason and the file:line. Astra cannot run a browser
   (sandbox); it judges code, tests and images.

A DISAGREE sends that plot back to the auditor (a new claude-b Opus task on the same branch, with Astra's
objections pasted in). The loop ends for a plot when both have signed AGREE in the report, or after three rounds,
when the disagreement goes to Gerardo with both positions.

## Checklist per plot (auditor)

| # | Check | How |
|---|---|---|
| 1 | Draws | Card shows the plot (no "Couldn't bring back", no error badge) in Draft at 100 % and as an image when zoomed out |
| 2 | Matches Team | Same inputs, same plot: compare with the catalog defaults and the module's own output (`POST …/render`); report anything cropped, squashed, unreadable or empty |
| 3 | Size | Resize the card larger and smaller: it redraws at the new size, stays readable, nothing overflows |
| 4 | Data tab | Every control Team offers for this plot is present (compare `GET /catalog` `allowedInputs`, tabs, shownBy with the Inspector). Change each control at least once: the plot redraws with the change; invalid values are refused with a clear message |
| 5 | Appearance tab | Title, axis titles, font size and colour, background, palette (all six), Healthy in grey, legend position, grid, orientation, Reset, Undo/Redo — for plotly plots on the plot itself; for image plots, what Team supports and nothing that silently does nothing |
| 6 | Statistics tab | Only where Team has statistics (violin, group comparison): run, review, confirm, results, CSV |
| 7 | Export tab | PNG/SVG/PDF of the card; "More downloads from this analysis" files open and are non-empty |
| 8 | Finish | Finish, the snapshot matches the live plot, Edit figure returns to the live plot |
| 9 | Duplicate / remove / undo | Duplicate keeps inputs and appearance; remove + undo restores it |
| 10 | Save and reopen | Save a checkpoint named `audit-<batch>-synthetic`, reopen it in a new page: the plot comes back with its inputs and appearance; delete only that checkpoint at the end |
| 11 | Console | 0 console errors during the plot's checks |

## What design may change (Fable)

Never: the science (data, statistics, what is plotted), anything under `R/modules`, `R/server.R`, `R/global.R`,
`R/ui.R`, `R/frontends/team`, `R/frontends/classic`, `www`. Team's plot as Team draws it stays one click away.

May change, in Nexo only:
- Card and Inspector presentation for the plot: title, empty and loading states, spacing, the order and wording
  of controls, grouping, help text, so that every control reads well for this plot.
- Plotly plots: a "Nexo" presentation preset in Appearance (font family and sizes, axis and grid weight, legend
  placement, margins, palette) applied by `editor/applyEditor`, with "Team original" kept as a preset.
- Image plots: render sharpness (device pixel ratio), the size requested for the card, how the image sits in the
  card (no squashing, no letterboxing that wastes the card). Changes to the ggplot itself are written up as
  proposals for Max's modules, not implemented.

Every design change gets a test (unit or E2E) and before/after screenshots.

## Reports and evidence (synthetic only)

- `docs/integration/chart-audit/<batch>.md`: one section per plot with the checklist table, findings, fixes
  (commit SHAs), design changes, and the signature lines `Auditor (Opus 5.5): AGREE|…` and
  `Adversary (Astra): AGREE|DISAGREE …`.
- `docs/integration/chart-audit/<batch>/`: screenshots (`<source>-<check>.png`, PNG ≤ 400 KB each).
- `docs/integration/chart-audit/summary.md`: one row per plot: draws, matches Team, inspector complete, design
  changes, signatures.

## Order

Wave pipeline, so the API never has more than two live agents: at step k the auditor works on batch k, the designer
on batch k−1, Astra reviews batch k−2. Rework tasks go in front of new batches. This session dispatches each step
when the previous one reports, merges, runs the 14 mock suites and vitest, deploys, and re-checks a sample of the
batch on the real checkpoint privately.

## Done

All 58 plots signed AGREE by both (or escalated with both positions), the summary table complete, the 14 mock
suites, vitest and the R API suites green, and a live sweep of the complete synthetic checkpoint with every card
drawn and 0 console errors in Chromium and WebKit.
