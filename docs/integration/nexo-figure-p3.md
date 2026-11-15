# Nexo Figure / Appearance / Export P3 pass

Verified against Nexo source and Team source on 2026-11-06. Team source was read only.

| Gap | Outcome | Coverage / evidence |
|---|---|---|
| Illustration PNG/SVG | Fixed: inspector Export tab, quick downloads and selected-illustration Export dialog. No CSV for illustrations. Current asset/label/accent can export without a mounted card. | `illustrations/download.test.ts`; `test_nexo_export.cjs` illustration-png-svg-dialog |
| Rounded rectangle | Fixed: Add rounded rectangle creates Team's `shape: rectangle, radius: 12`; existing renderer and saved schema already support radius. | `figure/panel.test.ts`; `test_nexo_figure_page.cjs` rounded-rectangle |
| Figure plot list grouping / Reset order | Fixed: groups by owning canvas tab; per-tab selection; reset to tab/node order preserves exclusions, positions, text and shapes. | `figure/plotList.test.ts`; `test_nexo_figure_page.cjs` figure-list-tab-groups-reset-order |
| Page guides | Fixed: transient, initially off, free-layout dashed inset matching Team. Separate from page furniture; never saved or exported. | `figure/panel.test.ts`; `test_nexo_figure_page.cjs` page-guides-view-only; Team `canvas_preview.js:351,385`, `canvas_preview.css:8` |
| Condition-named colour swatches | Fixed: study `teamConditions` / `teamCondition` metadata, with legend-group/name fallback; safely keyed matching scalar traces change together, preserving continuous/per-point colours. | `editor/PlotEditor.test.ts`; `editor/conditionColors.test.ts` |
| Journey 6.4 | Fixed: Text & shapes rail button reflects Figure mode through `aria-pressed`. Figure mode is already labelled by the toolbar and status band. | `ui/railFigureMode.test.ts` |
| Journey 6.5 | Kept as Team: Team uses Edit on the finished-card footer (`canvas.js:2149`) and Edit figure in the inspector (`canvas_inspector.js:16`); both reopen the plot. The footer is outside this task's editable area. | Read-only code verification; no card edits |
| Journey 7.4 | Kept as Team: Team's Export studio updates dimensions on preset selection but does not rewrite the selected journal after manual width/height edits (`R/modules/99_export_studio_module.R:676–711`). | Read-only code verification; existing `export/exportDialog.test.ts` covers preset/default/custom rules |

No changes to canvas.ts, cards.ts, Library, TopBar, App, autosave, R or www.

The sandbox denies localhost binding, so the two Playwright suites stop with SKIP before either browser runs. The linked worktree's Git index is outside the writable roots; `git add`, `git commit`, and the prescribed evidence checkout fail with `Operation not permitted`. Changes therefore remain uncommitted. No evidence files were changed by the skipped browser runs. No push or PR attempted.

Final vitest run after the rounded-shape type correction (Node 22, local vitest binary, four workers):

```text
 Test Files  48 passed (48)
      Tests  211 passed (211)
   Start at  18:27:28
   Duration  92.72s (transform 9.14s, setup 0ms, collect 30.03s, tests 9.64s, environment 66ms, prepare 69.95s)
```

Browser suite last lines:

```text
SKIP H6c Playwright: listen EPERM: operation not permitted 127.0.0.1
SKIP H6d Playwright: listen EPERM: operation not permitted 127.0.0.1
```

Final TypeScript check: local TypeScript compiler under Node 22, `--noEmit -p .`, exit 0, no diagnostics. `git diff --check` passed.
