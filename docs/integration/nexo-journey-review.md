# Nexo journey UX review (H8g)

Branch `router/20261106-134002-a7ece7`, SHA `83240f53`. Mock build (`VITE_API_MOCK=1`, vite dev on 5199), Playwright 1.64 Chromium 1248, 1440×900 and 390×844 (touch, DPR 2). Captures: `nexo-phase1-evidence/h8/journeys/` (`j1-…j9-`). Real-content facts come from `nexo-phase1-evidence/h8/journeys-live/` (02…14) and the two live notes in the brief. This is a review of interaction flows only; no product code was changed. Severity: P1 blocks Paula redoing Figure 1, P2 slows or confuses, P3 polish. "Not verified" marks inferences.

Scripts used were disposable (`/tmp/jr/j*.cjs`, not committed); every step was a real pointer or keyboard action, and after each step the status band, save pill, toasts, dialogs, card status pills, inspector header and focus were dumped.

## 1. Open

Steps: start page (`j1-01-start`) → Tab focuses the only checkpoint button, Enter/click → "Opening checkpoint…" card (`j1-03-opening`, live `02-opening`) → canvas with library, inspector and cards (`j1-04-opened`; live `03-empty-canvas` for a checkpoint with no cards). Reload keeps `?checkpoint=…` and reopens the same checkpoint (`j1-05-reload`). Failed open: "Unknown checkpoint · Try again · Choose checkpoint" (`j8-07-failed-open`).

| # | severity | what the user experiences | where | proposed fix | effort |
|---|---|---|---|---|---|
| 1.1 | P2 | The start page lists checkpoints by name only. Live: five autosaves appear as five identical "autosave" buttons with no date, size or source, so Paula cannot tell which one is Figure 1 (live note in the brief; mock `j1-01-start`, `j8-06-start-after-save`). The Checkpoints dialog already has date · bytes · source per row (`j8-03-checkpoints-dialog`). | `src/ui/App.tsx` start page (buttons `Synthetic demo`, `Figure 1 draft`) vs `src/ui/Dialogs/CheckpointsDialog.tsx` rows | Reuse the dialog's row (name, saved date, source, size) on the start page, newest first, and label autosaves "Autosave · date". | S |
| 1.2 | P3 | "Opening checkpoint…" has no progress and no cancel; live opening with heavy modules takes seconds (live `02-opening`). The page then jumps from a centred card to the full shell with no transition. | `src/ui/strings.ts` `opening` | Keep the text; add "Try again / Choose checkpoint" after a timeout (same buttons as the failed state), so a hung open is not a dead end. | S |
| 1.3 | P3 | After opening, keyboard focus is on `body` (dump: `focus: BODY`), so a keyboard user's first Tab starts at the logo instead of the canvas or library. | `j1-04-opened` dump | Focus `#viewport` (or the empty-canvas "Add plot" button) when the document is ready. | S |
| 1.4 | P3 | The empty start page has no "Upload ZIP"; the `empty` string says "Upload a ZIP saved from Team" but the upload control lives only in the Checkpoints dialog, which is reachable only after opening a checkpoint. Not verified with zero checkpoints. | `src/ui/strings.ts` `empty`; `CheckpointsDialog.tsx` upload | Put the Upload ZIP button on the start page too. | S |

## 2. Add plots

Steps: click `+` on three Dashboard rows in a row (`j2-01-adding-1`, `j2-02-adding-3`, `j2-03-added-3`); open Differential and click a "Requires configuration" row (design dialog, `DesignDialog.tsx:26-34`); hover a Longitudinal "Unavailable" row; add Group comparison (`j4-06-gc-added`); search "heat" and click "Added · 1 on canvas" after scrolling away (`j2-10-search`, `j2-11-scrolled-away`, `j2-12-located`); new tab then toolbar "+ Add plot" (`j2-13-new-tab`, `j2-14-addplot-toolbar`).

| # | severity | what the user experiences | where | proposed fix | effort |
|---|---|---|---|---|---|
| 2.1 | P2 | Adding three plots in a row: each add selects the new card and switches the inspector, and the camera ends panned so the first two cards are clipped at the left edge with no "Fit" cue (`j2-03-added-3`). Paula adding five plots for Figure 1 ends looking at the last one only. In the mock the "Adding…" placeholder is never visible (create is instant); live it is ≈1 s plus up to 10 s first render. | `src/canvas.ts` addEntry/reveal; `j2-03-added-3` | Keep selection on the new card, but after the second consecutive add within a few seconds, pan only to keep the whole run of new cards visible, or show a status-band chip "3 added · Fit all" that calls Fit. | M |
| 2.2 | P2 | "Requires configuration" rows have a muted, borderless `+` that reads as disabled (design pass), yet clicking it is the only way to open the study-design dialog; the row's reason is only in a `title` tooltip (hover delay, nothing on touch/keyboard). | `src/ui/Library/Library.tsx:73-75`; `j2-10-search` rows "Filtered average heatmap" | Make the row text a link "Confirm study design…" (like the "Added · N" link) and show the reason as a one-line muted help text under the first gated row of a group. | S |
| 2.3 | P2 | "Unavailable" rows (time course): the `+` is disabled and the reason is again only a tooltip; nothing tells the user it will never become available for this checkpoint. | `Library.tsx:75` `disabled=…row.state==='Unavailable'`; `src/catalog.ts` availabilityReasons | Show the short reason inline ("Needs ≥2 time points in the metadata") and drop the `+` for these rows. | S |
| 2.4 | P2 | Group comparison lands with the pill "Needs settings · Data & settings" on the card and "Confirm reference group" in the card body, but the inspector opens on Data and says "This figure has no data controls" (`j4-06-gc-added`). The settings are on the Statistics tab (`StatisticsTab.tsx:56`), which nothing points to. | `src/ui/Inspector/Inspector.tsx:32` (tab reset to Data), `src/cards.ts:49-50` | When the status is `waiting` for a group-comparison source, open the inspector on Statistics, and make the card's "Data & settings" pill jump to the tab that holds the controls. | S |
| 2.5 | P3 | The library "Added · N on canvas" counts cards on every tab (`j2-13-new-tab`: Canvas 2 is empty but the rows still say Added), and the locate link then switches tabs silently. | `Library.tsx:67` `nodes.filter(...)` | Count per active tab and append "on Canvas 1" when the card is elsewhere. | S |
| 2.6 | P3 | Focus stays on the library `+` after adding (dump: `focus: BUTTON.library-add`), so Enter adds a second copy; the "Added · 1" state does not warn that the next click duplicates. | `j2-03-added-3` dump | Fine for mouse; for keyboard, move focus to the locate link after a successful add. | S |

## 3. Edit a plot

Steps: select the violin card → Data tab (`j3-01-data-tab`; live `04-added-violin-data-tab` shows the real form: selects, radios, checkboxes, tabs) → change the lipid select (`j3-02-updating`, `j3-03-updated`) → Ctrl+Z, toolbar Undo/Redo (`j3-04-after-toolbar-undo`) → Appearance: Color palette, Apply palette, Title and fonts, Legend (`j3-05-appearance`, `j3-06-palette-picked`, `j3-07-palette-applied`, `j3-08-title-fonts`; live `05-appearance-tab`) → Reset presentation (`j3-09-reset`).

| # | severity | what the user experiences | where | proposed fix | effort |
|---|---|---|---|---|---|
| 3.1 | P1 | A Data-tab change is not undoable: after changing the lipid select the toolbar Undo stays disabled (dump `undo disabled= true`) and Ctrl+Z leaves the new value. Paula who picks the wrong lipid has to find the previous one by hand; with the real forms (many controls, live `04`) this is the main editing loop. The Appearance editor, by contrast, enables both its own Undo and the toolbar Undo (`j3-07-palette-applied` dump), so two undo stacks coexist. | `src/ui/Inspector/DataTab.tsx` / `src/ui/forms/SchemaForm.tsx` (no `history.dispatch`), `src/canvas.ts:118-147` (history used for geometry/add/remove only) | Dispatch Data changes through `history` as a command carrying the previous inputs, so toolbar Undo/Redo and Ctrl+Z cover them; fold rapid edits of the same control. | M |
| 3.2 | P2 | While a Data change is being computed the card keeps "Up to date" in the mock (instant). Live, the update takes ≈1 s to 10 s; the `updating` status exists (`cards.ts:49`) but nothing in the inspector form itself (the control the user just touched) shows it is pending, and the form stays editable so a second change can race the first. Not verified live. | `Inspector.tsx:24-25`, `cards.ts:49` | Show "Updating…" next to the inspector status and disable the form (or queue) until the render returns; keep the card pill as is. | S |
| 3.3 | P2 | Appearance has two undo controls (editor Undo/Redo at the top of the tab, toolbar ↶ Undo) with different scopes, and "Reset presentation" sits next to "Publication style" with no confirmation or undo hint (`j3-09-reset`). | `src/ui/PlotEditor/Toolbar.tsx` (buttons list in dump) | Route editor changes through the same history as the canvas and drop the second pair; after Reset, show a status chip "Presentation reset · Undo". | M |
| 3.4 | P2 | Every Appearance section is a collapsed `<details>` (Color palette, Title and fonts, Legend, Conditions, Series…), so the palette needs three clicks (open section, pick, Apply) and the picked palette is not applied until "Apply palette" (`j3-06-palette-picked` vs `j3-07-palette-applied`). | `src/ui/PlotEditor/PaletteSection.tsx` | Apply on pick with Undo available, or keep Apply but open Color palette and Title and fonts by default. | S |
| 3.5 | P2 | Live Data tab shows raw Team values such as `__ALL__` in "Visible sample groups" (live note in the brief). | real schema, `src/ui/forms/schemaForm.ts` | Map known sentinels (`__ALL__` → "All groups") in `schemaForm.ts` option labels; keep the value sent to R unchanged. | S |
| 3.6 | P3 | Title and fonts: the title input has no visible label in the dump (`INPUT:=Feature distributions`), colour inputs are native pickers, and changes apply on blur, so the card updates only after Tab/click away. | `j3-08-title-fonts` | Label the title input and apply on input with debounce. | S |

## 4. Statistics

Steps: violin → Statistics tab (`j4-01-statistics`; live `06-statistics-tab`) → Review and confirm… (`j4-02-review`, settings diff table) → Confirm and compute (`j4-03-computing`: status band "Checking or computing statistics…") → results table and "Statistics match the values drawn in this plot." (`j4-04-results`). Group comparison: card body "Confirm the reference group to compute the comparison" + Confirm reference group button (`j4-06-gc-added`); the inspector-side confirm prompt (`.gc-confirm`) was not reached because the inspector opened on Data (finding 2.4).

| # | severity | what the user experiences | where | proposed fix | effort |
|---|---|---|---|---|---|
| 4.1 | P2 | The violin flow is good (review table, computing message, results), but the result lives only in the inspector: the card shows nothing (still "Up to date") and the status band message disappears when another card is selected. | `j4-04-results`; `src/ui/Inspector/StatisticsTab.tsx` | Add a small "p = 0.03 ✓" or "Statistics applied" marker to the card status pill or footer so Steph can see which plots carry statistics. | S |
| 4.2 | P2 | After results, changing the lipid on the Data tab: whether statistics are recomputed, stale or dropped was not verified (step timed out in the run). The inspector copy "Statistics match the values drawn" suggests a stale state exists; the transition should be captured and shown on the card. | `StatisticsTab.tsx` status line | Verify and, if stale, show "Statistics out of date · Recompute" in the status line and on the card pill. | S |
| 4.3 | P3 | "Analysis · confirm before computing" fieldset and "Display updates immediately" fieldset look the same; the first needs Review and confirm, the second applies live. | `j4-01-statistics` | Give the confirm-gated group a short help line and the primary button; make "Discard changes" secondary and disabled until a change exists. | S |
| 4.4 | P2 | Group comparison: the card asks to "Confirm reference group" in the body, the pill says "Needs settings · Data & settings", the inspector says no data controls. Three messages, one action, none linked (see 2.4). | `j4-06-gc-added` | One path: card button opens the inspector on Statistics with the confirm prompt focused. | S |

## 5. Arrange

Steps: header drag (`j5-01-dragging`, `j5-02-dropped`), resize handle (`j5-03-resizing`, `j5-04-resized`), Shift-click multi-select ("2 selected"), Canvas tools menu (`j5-05-canvas-tools`: Tidy up, Paste plot, Remove all, Canvas help, Keyboard shortcuts; no align), Tidy up (`j5-07-tidy`), add tab, Tab actions → Rename (`j5-09-rename`, `j5-10-renamed`, live region "Tab renamed to Figure 1"), card ⋯ → Move to tab… → picker (`j5-11-card-menu`, `j5-12-move-to-tab`, `j5-13-moved`), Ctrl+C / Ctrl+V (`j5-14-pasted`), zoom out, minimap click, Fit (`j5-15`–`j5-17`).

| # | severity | what the user experiences | where | proposed fix | effort |
|---|---|---|---|---|---|
| 5.1 | P2 | Move to tab: the card vanishes from the current tab with no message, no link to the destination and no undo hint (`j5-13-moved` dump: live region empty, inspector reset). Tab rename, by contrast, announces "Tab renamed to…". | `src/ui/App.tsx:223` picker, `src/canvas.ts:500` moveToTab | Notify "Moved to Canvas 2 · Show · Undo" through the same `notify` used for "Card removed" (`canvas.ts:125`). | S |
| 5.2 | P2 | The move/copy picker is a bare row of buttons ("Copy to tab… / Canvas 1 / Canvas 2 / Cancel") rendered as a `role=dialog` without a title; the current tab is listed as a target. | `App.tsx:223` | Title "Move to tab", omit or disable the current tab, mark it "(current)". | S |
| 5.3 | P2 | Paste: the new card appears selected but the "Copied plot settings" toast stays on screen and is duplicated in the status band (`j5-14-pasted`, `j6-02-finished` shows both). After paste there is no "Pasted" confirmation. | `src/clipboard.ts`, `src/ui/Toast.tsx`, `src/ui/StatusBand.tsx` | Replace the copy toast on paste with "Pasted as a new card"; show one surface, not two. | S |
| 5.4 | P2 | There is no align or distribute; Canvas tools offers only Tidy up, which rearranges everything. For a two-panel figure Paula aligns by eye (snap exists, `src/canvas/snap.ts`, not visible as guides in captures). Keyboard arrows move by 10 px / Alt 1 px (shortcuts list). | `j5-05-canvas-tools`; `src/canvas/align.ts` exists but is not in the menu (not verified why) | Expose Align left/top/centre and Distribute for 2+ selected cards in Canvas tools and the card ⋯ menu. | M |
| 5.5 | P3 | Resize handle is 16 px and only drawn on the selected card; the resize has no size readout while dragging (`j5-03-resizing`). | `src/canvas/handle.ts` | Show "440 × 330" near the handle during resize. | S |
| 5.6 | P3 | Minimap click re-centres without animation and the zoom pill "100%" button is both a label and a control (`j5-16-minimap-click`, `j5-17-fit`). | `src/ui/ZoomPill.tsx` | Keep; tooltip already says "Zoom to 100% (Shift+0)". | – |

## 6. Finish and Figure page

Steps: Finish plot from the inspector (`j6-01-finishing`, `j6-02-finished`: pill "Finished", inspector collapses to one Export tab with "Edit figure · Finished figure.", card footnote "…data remain available in Edit"; live `10-finished-card`) → Figure page (`j6-05-figure-page`, live `12-figure-page`): panel tabs Object / Plots · 3 / Page; Plots lists "Principal components · not finished" rows with ↑↓ (`j6-06-figure-tab-1`); Page has Layout free/pages/arrangement, Paper, Orientation, Export SVG/PDF/Print; ← Draft (`j6-07-back-to-draft`); rail "Text & shapes" jumps to the Figure page with focus on Add text (`j6-08-text-shapes`). Edit again / stale: the footer "Edit" click timed out in the run (the finished card had been panned off-screen), so the stale state was not exercised.

| # | severity | what the user experiences | where | proposed fix | effort |
|---|---|---|---|---|---|
| 6.1 | P2 | Finishing collapses the inspector to Export only; the Data, Appearance and Statistics tabs disappear and the only way back is the small "Edit figure" button. Paula who finished too early loses her bearings. | `Inspector.tsx:29-39`; `j6-02-finished` | Keep the tabs visible but read-only with a banner "Finished · Edit figure to change", so the state change is explained in place. | S |
| 6.2 | P2 | The Figure page "Plots" tab lists unfinished plots as "· not finished" with no action; nothing on the Draft tells how many plots are still pending before the figure is complete. | `src/ui/FigurePage/*` (`j6-06-figure-tab-1`) | Add a "Finish" button on each pending row and a count in the Draft chip ("Draft · 2 pending"). | S |
| 6.3 | P2 | "Figure page →" is a mode switch on the same canvas (v0 decision, respected): the tabs bar, library and inspector are replaced by the figure panel, but the status band still says "Draft: edit live plots…" (`j6-05-figure-page` dump). | `src/ui/StatusBand.tsx` hint | Status band text per mode: "Figure page: arrange finished plots, add text and shapes. ← Draft to edit plots." | S |
| 6.4 | P3 | Rail "Text & shapes" silently switches to the Figure page; the rail button does not look selected and the user may not realise the mode changed (`j6-08-text-shapes`). | `src/ui/Rail.tsx`, `railActions.ts` | Mark the Figure page state in the rail and tabs bar (the "Draft" pill could become "Figure page"). | S |
| 6.5 | P3 | Finished card keeps "Edit / Duplicate / ⋯" in the footer plus "Edit figure" in the menu: two edits with different meanings (Edit = reopen; Edit figure = same). Not verified which differs. | `j6-02-finished` footer dump | One label: "Edit figure" everywhere. | S |

## 7. Export

Steps: Export tab on a card (`j7-01-export-tab`: Plot data CSV, PNG, SVG, Copy figure JSON, More export options…) → Download PNG (`j7-02-after-png`, file "Principal components.png", no confirmation) → Export figure ▾ menu (`j7-03-export-menu`; live `11-export-menu`) → Publication export… dialog (`j7-04-export-dialog`) → Figure select "Volcano", Download bundle (`j7-05-preset-changed`, `j7-06-after-bundle`) → Figure page · SVG (`j7-07-after-page-svg`, file "figure-canvas-1.svg").

| # | severity | what the user experiences | where | proposed fix | effort |
|---|---|---|---|---|---|
| 7.1 | P1 | The Publication export dialog's "Figure" list is the fixed Export-studio list (PCA 2D Score Plot, Volcano, Top Lipid Class, Heatmap), not the cards on the canvas. Nothing says so; picking Volcano then Download bundle fails with "Confirm the study design before exporting the volcano plot." and no download (`j7-06-after-bundle`). Paula expects to export the figure she just built. | `src/ui/Dialogs/ExportDialog.tsx:104`, `src/export/presets.ts` | Rename the scope "Publication figure" to "Export studio figure (R-rendered)" with one help line; disable figures that are gated with the reason inline; make "Figure page" the first scope so the canvas figure is the default. | M |
| 7.2 | P2 | Downloads (PNG, SVG, bundle, page SVG) give no confirmation: the status band and toasts are unchanged after the file is saved (`j7-02-after-png`, `j7-07-after-page-svg`). | `src/ui/Inspector/ExportTab.tsx`, `src/figure/exportPage.ts` | Toast "Downloaded Principal components.png" via the existing notify. | S |
| 7.3 | P2 | The export menu mixes exports with saving (Publication export…, Export selected plot…, Save checkpoint…, Download ZIP, Figure page · SVG/PDF, Print) under "Export figure ▾" (`j7-03-export-menu`). | `src/ui/Toolbar.tsx` | Move Save checkpoint… and Download ZIP under the project (checkpoint) menu in the top bar. | S |
| 7.4 | P3 | Presets: changing the journal preset rewrites width/height but custom edits are not flagged as "Custom"; the px summary updates (good). DPI 600 default with 1200 available is fine. | `ExportDialog.tsx:40-47` | Switch the preset select to "Custom" when a dimension is edited. | S |

## 8. Save and reopen

Steps: arrow-key move → pill "Unsaved changes · Autosave on" (`j8-01-dirty`); still unsaved after 3.5 s (`j8-02-saved`; debounce is 15 s, max 60 s at `src/state/autosave.ts:29`); later "Saved · 01:47 PM" (`j2-12-located`) → project menu "Synthetic demo ▾" → Checkpoints dialog (`j8-03-checkpoints-dialog`) → name "Figure 1 draft", Save current analysis (`j8-04-saving`, `j8-05-saved-named`: new row with date · bytes · source, top bar now "Figure 1 draft", URL changes to the checkpoint hash) → Download (ZIP "Synthetic demo.zip") → reload keeps the new checkpoint → start page lists both → unknown checkpoint (`j8-07-failed-open`) → offline (`j8-08-offline`, blank browser error page). Upload ZIP has a file input and button; not exercised. During journey 5 the pill showed "Save failed · Retrying" (`j6-05-figure-page` dump); cause not verified.

| # | severity | what the user experiences | where | proposed fix | effort |
|---|---|---|---|---|---|
| 8.1 | P2 | "Save failed · Retrying" appears in the pill with no reason and no action; it retries every 5 s up to 24 times and then stops silently (`autosave.ts:17`). Paula cannot tell whether her work is safe. | `src/state/autosave.ts:17`; `j6-05-figure-page` dump | Pill click opens a line with the error and "Retry now / Download ZIP"; after the last retry, show a persistent toast. | S |
| 8.2 | P2 | "Unsaved changes · Autosave on" stays for up to 15 s after the last edit, with nothing that says when it will save; users who close the tab inside that window lose the edit (flush on `beforeunload` not verified). | `autosave.ts:29` | Shorten the debounce to ~3 s after geometry edits, flush on `visibilitychange`/`pagehide`, and say "Saving in a moment" instead of "Autosave on". | S |
| 8.3 | P2 | After "Save current analysis" the dialog stays open and the ZIP download named after the old checkpoint ("Synthetic demo.zip" while the top bar says "Figure 1 draft"); the Download button belongs to the row, but the first row is the original checkpoint. | `CheckpointsDialog.tsx` rows order; `j8-05-saved-named` | Put the current checkpoint first and mark it "current"; after saving, close the dialog with a toast "Saved checkpoint Figure 1 draft". | S |
| 8.4 | P3 | Saving a named checkpoint switches the URL and project name to the new checkpoint; autosaves then go to it. This is right, but nothing tells the user that the old one is now frozen. | `j8-05-saved-named` | One line in the dialog: "You are now working on Figure 1 draft." | S |
| 8.5 | P3 | Offline open shows the browser's own error page (`j8-08-offline`); the app cannot help there, but a cached shell (not verified) could show the "Try again" state. | – | Out of scope for v0. | – |

## 9. Phone (390×844)

Steps: start page (`j9-01-phone-start`), tap checkpoint (`j9-02-phone-opened`: "View only" pill, banner "View only on this device…", canvas fitted at 30 %), touch pan (`j9-03-phone-pan`), zoom + (`j9-04-phone-zoom`), tap a card (`j9-05-phone-tap-card`: card selected), tap the rail Inspector button (`j9-06-phone-inspector`), dismiss banner (`j9-07-phone-banner-dismissed`).

| # | severity | what the user experiences | where | proposed fix | effort |
|---|---|---|---|---|---|
| 9.1 | P2 | Tapping a card selects it (ring) but the inspector never opens: after tapping the rail Inspector button `#inspector` stays `data-open=false` and shows "Select a plot or object…" although the header already says "Principal components" (`j9-06-phone-inspector` dump). Steph on a phone cannot read a plot's settings or export it. | `src/ui/Inspector/Inspector.tsx:29-35`, phone layout in `shell.css` (inspector column hidden at narrow widths; not verified which rule) | On narrow screens open the inspector as a bottom sheet when a card is tapped; keep it read-only. | M |
| 9.2 | P2 | The view-only banner takes a third of the top of the screen above the canvas and pushes the content down; on a 390 px wide screen the cards sit under it at 30 % and the text is tiny (`j9-02-phone-opened`). | `src/ui/App.tsx:32` ReadOnlyBanner | Collapse the banner to one line under the pill, auto-dismiss after the first pan. | S |
| 9.3 | P3 | Rail still shows Select (V) and Move (H) with keyboard letters on a touch device; the card ⋯ button is visible but its menu actions are editing ones (not verified what remains). | `j9-02-phone-opened` dump | Hide the tool letters on coarse pointers; keep ⋯ only if it has view actions (export). | S |
| 9.4 | P3 | Pinch zoom exists but the help text (`helpText`) is only in Canvas help; no first-use hint on touch. | `strings.ts` `helpText` | Fine for v0. | – |

## Top 10

1. **3.1 P1** Data-tab changes are not undoable (toolbar Undo disabled, Ctrl+Z inert), while Appearance has its own second undo stack. Route Data edits through `history`.
2. **7.1 P1** Publication export lists Export-studio figures, not the canvas; gated figures fail after clicking Download bundle. Rename the scope, disable gated figures inline, make the Figure page the default scope.
3. **2.4 / 4.4 P2** Group comparison: card, pill and inspector give three different messages and the inspector opens on a tab with no controls. Open on Statistics with the confirm prompt.
4. **1.1 P2** Start page lists checkpoints by name only; five "autosave" buttons are indistinguishable. Reuse the Checkpoints dialog rows.
5. **5.1 / 5.2 P2** Move to tab: no confirmation, no link to the destination, untitled picker that lists the current tab.
6. **8.1 / 8.2 P2** Autosave: "Save failed · Retrying" has no reason or action; 15 s silent debounce with no flush cue.
7. **2.1 P2** Several adds in a row leave the earlier cards clipped off-screen with no Fit cue.
8. **9.1 P2** Phone: the read-only inspector cannot be opened by tapping a card or the rail button.
9. **6.1 / 6.2 P2** Finishing collapses the inspector to Export only; the Figure page lists "not finished" plots with no action or count.
10. **2.2 / 2.3 / 3.5 P2** Library gated rows look disabled and hide their reason in a tooltip; live Data forms show raw `__ALL__`.

## Not exercised

- Stale finished plot (edit again after Finish) and the Figure page with a stale plot: the footer Edit click timed out after the finished card was panned off-screen; not captured.
- Statistics after a Data change (4.2), Upload ZIP, Delete checkpoint, Shortcuts dialog (live `14-shortcuts` exists), align (no menu entry), drag of an illustration from the library.
- Real wait times and real Data forms: taken from the live captures and the brief, not reproduced in the mock.
- WebKit: Chromium only.

## Verification and follow-up (integration, after the review)

Every finding was checked against the code (and, where it mattered, the live API on the synthetic checkpoint)
before anything was changed. Fixed items have an E2E assertion in Chromium and WebKit, run red on the previous
code first (`nexo-phase1-evidence/h8/journey-fixes/`, `h8/selection/`).

| Finding | Verdict | Outcome |
|---|---|---|
| 3.1 P1 Data changes not undoable | Confirmed (`DataTab` patched the API without a history step) | Fixed 3035694: one undo step per confirmed change; undo/redo PATCHes the inputs back, re-renders the card and reloads the form |
| 7.1 P1 Publication export lists Export-studio figures | Confirmed; it is Team's Export studio by design (R draws 4 figures from the analysis) | Fixed 339143e: the scope says so and points to Figure page SVG/PDF; Volcano disabled until the design allows inference (the only gated figure in `99_export_studio_module.R`) |
| 2.4 / 4.4 Group comparison opens on Data | Confirmed | Fixed 339143e: opens on Statistics; the card's Data & settings action goes there too |
| 1.1 Start page lists names only | Confirmed | Fixed 60beb8b: grouped (Prepared in Team, Saved, Autosaves), date and source per row |
| 3.5 Raw `__ALL__` in Data forms | Confirmed live | Fixed fef14a4: Team selection bars render as a checklist and write Team's own encoding; checked on the RTX |
| 5.1 / 5.2 Move to tab silent, untitled picker | Confirmed | Fixed 339143e: titled picker without the current tab; "Moved to … · Undo" |
| 5.3 Paste keeps the copy toast | Confirmed | Fixed 339143e: "Pasted as a new card · Undo" |
| 7.2 No download confirmation | Confirmed | Fixed 339143e: "Downloaded <file>" for the export tab, export dialog and Figure page |
| 8.1 "Save failed · Retrying" without reason | Confirmed (non-busy errors retry every 5 s with no reason) | Fixed a33b9b6: error toast with the reason once; the pill becomes Retry now (title = reason) |
| 8.2 15 s debounce, flush on leave | Partly: 15 s / 60 s is Team's autosave rule; App already flushes on `visibilitychange` and warns on `beforeunload` | No change |
| 6.3 Status band says Draft on the Figure page | Confirmed | Fixed c5ecb4c |
| 2.2 / 2.3 Gated rows hide the reason | Confirmed | Fixed c5ecb4c: inline "Confirm study design…" link; short reason on Unavailable rows |
| 9.1 Phone inspector never opens | Not reproduced: tapping a card opens the read-only inspector as a bottom sheet (390×844 touch). The run then tapped the rail Inspector button, a toggle, which closed it | No change |
| 3.2 Second change races the first | Not confirmed: the inspector status shows "Updating…" and `SchemaForm` chains PATCHes in order | No change |
| 3.3 / 3.4 Appearance's own undo and Apply palette | Team's rule (the plot editor keeps its own stack; Apply palette); Appearance changes also reach the toolbar Undo | No change |
| 6.1 Finished plot shows only Export | Team's behaviour (Export + Edit figure) | No change |
| 7.3 Save items in the Export menu | Team's ⋯ menu also mixes them | No change |
| 2.1 Several adds leave earlier cards off screen | By design (Nexo v0: adding pans only when the new card is out of view, never zooms); the minimap marks the new card and the library's "Added · N" link finds every copy | No change |
| 4.2 Statistics after a Data change | Confirmed: re-checked only when the Statistics tab opened, so the card kept the previous lipid's brackets | Fixed 663be64: after each Data change the canvas asks the server (check); stale p-values are dropped in the same undo step, with a toast |
| 4.1 No statistics marker on the card | Confirmed | Fixed 663be64: "Statistics" on the card header, amber "Statistics out of date" when they need review |
| 5.4 No align or distribute | Confirmed (`align.ts` tested but not wired) | Fixed 00285ff: Canvas tools › Arrange selected cards (align edges, distribute), one undo step |
| 6.2 No pending count, no Finish on Figure page rows | Confirmed | Fixed ba703df: "Draft · N to finish", "n of N plots finished", Finish per row |
| 8.3 / 8.4 Checkpoints dialog order, stays open after save | Confirmed | Fixed 35f6f2f: open checkpoint first and marked Current; saving closes the dialog and says which checkpoint is now open |
| 9.2 Phone banner height | Partly (two lines, not a third of the screen) | Fixed 3bf8555: compact on phones, stays dismissed for the browser session |
| Found in the live check (not in the review) | A violin added from the Library could not get statistics: the Statistics tab and the recheck sent the node id, because added cards keep their id in `instance.instanceId`; the mock accepted any id | Fixed 91bfdd6: one `cardInstanceId` helper; the mock refuses unknown cards as the server does; live on the synthetic checkpoint in both engines |
| Still open (P3) | 1.2, 1.3, 1.4, 2.5, 2.6, 3.6, 4.3, 5.5, 5.6, 6.4, 6.5, 7.4, 8.4, 9.3, 9.4 | Next pass |
