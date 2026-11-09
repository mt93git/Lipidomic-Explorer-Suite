# Nexo vs Team canvas: feature gap audit

Read-only audit, 2026-11-06, on branch `router/20261106-103015-44d72d` (base `5a5025f0`).
Inventory taken from Team's code (`www/team/js/**`, `R/frontends/team/**`), then each item
located in `frontends/nexo/src/**` (and `R/frontends/api/**` where Nexo relies on the API).
Intended design differences listed in the brief (one Export dialog, Figure page on the same
canvas, no camera move on add, no Expand canvas, no mascot, no Analysis tools / Save & export…
toolbar items, no offscreen parking, Data/Review link to Team, phones/tablets view-only, no
Companion AI or review/foreground flow) are not reported as gaps.

Conventions. "Team evidence" is `file:line` in Team. "Nexo evidence" is `file:line` under
`frontends/nexo/src/` when something was found; when nothing was found it gives the grep run
(always `grep -rnE '<pattern>' --include='*.ts' --include='*.tsx' frontends/nexo/src`, test
files and `mock/` excluded) and "no match". Impact is on redoing Figure 1 entirely in Nexo:
P1 blocks it, P2 slows it, P3 cosmetic. Effort: S (hours), M (a day or two), L (several days).
Nothing was run: no R on this machine, no browser session; verdicts are from code reading.


## 0. Status after H8 (2026-11-06, afternoon; verified by suites, not by re-auditing every row)

Closed since this audit, each with a test:

| Gap | Was | Closed by | Test |
|---|---|---|---|
| Group comparison controls and statistics | P1 | H8c (live card, inspector section, CSV) | `test_nexo_group_comparison.cjs`; live `h8/gc-live.txt` |
| Copy plot / Paste plot (menu, toolbar, Ctrl/Cmd+C/V) | P2 | H8d afd1a0f | `clipboard.test.ts`, `test_nexo_canvas_edit.cjs` |
| Aspect lock for figure panels | P2 | H8d 1bda935 | `figure/model.test.ts`, `test_nexo_figure_page.cjs` |
| Retry after a failed checkpoint open | P2 | a7ae1c4 ("Try again") | `test_nexo_save.cjs` H8 |
| Bring forward / send backward, duplicate object, double-click text | P3 | H8d 1bda935 | same as aspect lock |
| Shift+1 fit, Shift+0 and "100%" reset | P3 | H8d 4ac030a | `test_nexo_canvas_edit.cjs` |
| Rail "Palettes" / "Text & shapes" | P3 | H8d 877d06a | `railActions.test.ts` |
| Top bar shows the open checkpoint, neutral account button | P3 | H8d c11ea62 | `topBarLabel.test.ts` |
| Tab toasts; delete dialog states the card count | P3 | f2c3757 | `test_nexo_canvas_tabs.cjs` H8 |

Still open (all P3): cancel a queued add; checkpoint near-size-limit warning; canvas help panel (a shortcuts
dialog exists); draggable zoom controls/minimap; "Study design" badge action on a card; "Enlarge plot";
condition-named colour swatches; illustration PNG/SVG download; rounded
rectangle shape; per-tab grouping and reset order in the Figure page plot list; per-card restore progress
messages; "Plot changed — export again." notice; page guides.

## 1. Summary

127 Team features inventoried (one table row each). **101 done, 12 partial, 14 missing.** The Nexo canvas already
covers the core loop (open checkpoint, add from the catalog, Data tab driven by the API schema,
plot editor, violin statistics, finish/edit, illustrations, tabs, Figure page, unified export,
checkpoints, autosave). The one P1 gap is **Group comparison**: Nexo shows the report as raw
JSON and has no controls for test, reference, baseline, scale, significance display, lipid
classes, conditions or per-panel colours, although the saved settings round-trip
(`state/validate.ts:79`). The remaining gaps are P2/P3: copy/paste of a plot, Figure-page
object tools (aspect lock, z-order, duplicate), restore retry, and feedback messages.

| Area | Done | Partial | Missing |
|---|---|---|---|
| Top bar & save | 4 | 1 | 2 |
| Library | 7 | 1 | 1 |
| Tabs | 9 | 1 | 1 |
| Toolbar & menus | 6 | 1 | 1 |
| Canvas gestures & shortcuts | 10 | 1 | 2 |
| Card anatomy & states | 9 | 1 | 1 |
| Card ⋯ menu | 5 | 0 | 1 |
| Inspector Data | 2 | 0 | 0 |
| Inspector Appearance / plot editor | 9 | 1 | 0 |
| Statistics (violin) | 9 | 0 | 0 |
| Group comparison | 0 | 1 | 1 |
| Finish / snapshots | 4 | 1 | 1 |
| Illustrations | 4 | 0 | 0 |
| Figure page | 7 | 2 | 2 |
| Export | 6 | 0 | 0 |
| Checkpoints | 4 | 0 | 0 |
| Messages / toasts / confirmations | 2 | 1 | 1 |
| Accessibility | 4 | 0 | 0 |
| **Total** | **101** | **12** | **14** |


## 2. Tables by area

### Top bar & save

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Steps nav (Data / Review / Canvas) | `R/frontends/team/ui.R:148`; `www/team/js/card_status.js:126` "Open Review" | done (links to Team by design) | `ui/TopBar.tsx:6` | — | — |
| Save state pill (saving / saved / unsaved / failed) | `www/team/js/autosave.js:44` | done | `ui/TopBar.tsx:7`, `state/autosave.ts:17-28` | — | — |
| Autosave with retry and timeout | `www/team/js/autosave.js:44` "Save response timed out." | done | `state/autosave.ts:22`, `ui/App.tsx:142` | — | — |
| Unsaved-changes guard on leave / flush on hide | `www/team/js/autosave.js:151,167` | done | `ui/App.tsx:147-149` | — | — |
| Project / checkpoint switcher shows the real project | `R/frontends/team/project_library.R:151`; `www/team/js/project_records.js:1` | partial: button label is the fixed string "Demo project ▾" | `ui/strings.ts:3`, `ui/TopBar.tsx:5` | P3 | S |
| Checkpoint near size-limit warning | `www/team/js/autosave.js:61` | missing | grep `size limit\|near the` → no match | P3 | S |
| "Retry saved workspace" after a failed restore | `www/team/js/canvas.js:3110-3115` | missing | grep `Retry` → only `ui/Inspector/StatisticsTab.tsx:60`, `state/autosave.ts:17` (save retry, not restore) | P2 | M |

### Library

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Grouped plot catalog | `www/team/js/canvas_catalog.js:6-22` | done | `catalog.ts:2`, `ui/Library/Library.tsx:63` | — | — |
| Search with "no match" message | `www/team/js/canvas_catalog.js:271` | done | `ui/Library/Library.tsx:60,78` | — | — |
| State "Add" | `www/team/js/canvas_catalog.js:240,246` | done | `ui/Library/rows.tsx:16` | — | — |
| State "Added" (count on canvas) | `www/team/js/canvas_catalog.js:241` | done | `ui/Library/Library.tsx:69` | — | — |
| State "Queued" | `www/team/js/canvas_catalog.js:242` | done | `ui/Library/rows.tsx:15` | — | — |
| Cancel a queued add | `www/team/js/canvas_catalog.js:242` "Cancel"; `www/team/js/canvas.js:1223` | missing | grep `Cancel` in `ui/Library` → no match | P3 | S |
| State "Requires configuration" + confirm study design | `www/team/js/canvas_catalog.js:250` | done | `ui/Library/rows.tsx:12`, `ui/Dialogs/DesignDialog.tsx:26` | — | — |
| State "Unavailable" with reason | `www/team/js/canvas_catalog.js:238`; `www/team/js/canvas.js:1705` | done | `catalog.ts:7-9`, `ui/Library/Library.tsx:70` | — | — |
| Rail "Palettes" / "Text & shapes" entries open a matching panel | `www/team/js/palette_editor.js:12`; `www/team/js/figure_toolbar.js:57-59` | partial: the rail buttons set `library: 'palettes'/'text'`, but the library only renders plots or illustrations, so they show the plot list | `ui/Rail.tsx:22`, `ui/Library/Library.tsx:47` | P3 | S |

### Tabs

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Add tab | `www/team/js/canvas_tabs.js:375` | done | `ui/TabsBar.tsx:37` | — | — |
| Rename (double-click, F2/Enter, max length) | `www/team/js/canvas_tabs.js:138,146` | done | `ui/TabsBar.tsx:28,33-34` | — | — |
| Duplicate tab (copies cards) | `www/team/js/canvas_tabs.js:159,202` | done | `ui/TabsBar.tsx:40`, `ui/App.tsx:200` | — | — |
| Move tab left / right | `www/team/js/canvas_tabs.js:203-204` | done | `ui/TabsBar.tsx:43-44` | — | — |
| Drag to reorder tabs | `www/team/js/canvas_tabs.js:220` | done | `ui/TabsBar.tsx:22-27` | — | — |
| Delete tab, move cards or remove them | `www/team/js/canvas_tabs.js:169-179` | done | `ui/TabsBar.tsx:45-51`, `ui/tabsWiring.ts` | — | — |
| Last tab cannot be deleted | `www/team/js/canvas_tabs.js:166` | done | `state/tabs.ts:99`, `ui/TabsBar.tsx:45` | — | — |
| Move / copy a card to a tab | `www/team/js/canvas_tabs.js:237,271,307` | done | `cards.ts:112`, `ui/App.tsx:182-192` | — | — |
| Keyboard tab navigation (arrows / Home / End) | `www/team/js/canvas_tabs.js:123-127` | done | `ui/TabsBar.tsx:35` | — | — |
| Delete dialog states what the tab holds ("It holds …", "The tab is empty. You can undo this.") | `www/team/js/canvas_tabs.js:172,178` | partial: dialog has the move/remove choice but no count and no undo hint | grep `It holds\|is empty` → no match; `ui/TabsBar.tsx:47` | P3 | S |
| Tab operation toasts ("Added tab", "Renamed to", "Duplicated as", "Moved tab", "Deleted tab", "Copied") | `www/team/js/canvas_tabs.js:129,133,146,159,187,307` | missing | grep `Moved tab\|Added tab\|Renamed\|Duplicated as\|Deleted tab\|Copied` → no match | P3 | S |

### Toolbar & menus

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Add plot | `www/team/js/figure_toolbar.js:60` | done | `ui/Toolbar.tsx:27` | — | — |
| Tidy up | `www/team/js/canvas.js:1440` | done | `ui/Toolbar.tsx:28`, `canvas/tidy.ts` | — | — |
| Undo / Redo buttons | `www/team/js/canvas.js:3148-3153` | done | `ui/Toolbar.tsx:29` | — | — |
| Draft ↔ Figure page toggle | `www/team/js/figure_toolbar.js:87` | done | `ui/Toolbar.tsx:33` | — | — |
| Export menu | `www/team/js/figure_toolbar.js:88-89` | done (unified by design) | `ui/Toolbar.tsx:30,34` | — | — |
| Remove all, with confirmation and Undo | `www/team/js/canvas.js:3166-3200`; `www/team/js/canvas_feedback.js:55` | done | `ui/Toolbar.tsx:38`, `canvas.ts:121,425` | — | — |
| Paste plot | `www/team/js/canvas.js:3126`, `:451` | missing: menu item shows "This action is not available yet." | `ui/Toolbar.tsx:36`, `ui/strings.ts:18` | P2 | M |
| Canvas help | `www/team/js/canvas_viewport.js:64`; `www/team/js/pointer_mode.js:54` | partial: one-line toast instead of a help panel | `ui/Toolbar.tsx:36`, `ui/strings.ts:19` | P3 | S |

### Canvas gestures & shortcuts

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Select (V) / Move (H) modes | `www/team/js/pointer_mode.js:36-37,120` | done | `ui/Rail.tsx:16,23` | — | — |
| Hold Space to pan | `www/team/js/pointer_mode.js:109,132` | done | `canvas.ts:370` | — | — |
| Zoom with + / − | `www/team/js/canvas_viewport.js:504-505` | done | `canvas.ts:385` | — | — |
| Zoom buttons and percentage | `www/team/js/canvas_viewport.js:15` | done | `ui/ZoomPill.tsx:15` | — | — |
| Fit all button | `www/team/js/canvas_viewport.js:15` | done | `ui/ZoomPill.tsx:15` | — | — |
| Fit all shortcut Shift+1 | `www/team/js/canvas_viewport.js:506` | missing | grep `Digit1` → no match | P3 | S |
| Reset zoom to 100% | `www/team/js/canvas_viewport.js:15` | partial: 100% preset only in the legacy hidden HUD select, not in the shell pill | `canvas.ts:33`, `ui/ZoomPill.tsx:15` | P3 | S |
| Pinch / trackpad zoom | `www/team/js/canvas_viewport.js:495` | done | `canvas.ts:43` | — | — |
| Minimap click / drag navigation | `www/team/js/canvas_viewport.js:15` | done | `canvas.ts:38,367` | — | — |
| Undo / redo Ctrl/Cmd+Z, Shift+Z, Y | `www/team/js/canvas.js:3148-3153` | done | `canvas.ts:376` | — | — |
| Arrow keys move and resize the selection | `www/team/js/canvas.js:1544,1725`; `www/team/js/canvas_viewport.js:541` | done | `canvas.ts:380-384`, `canvas/editing.ts:9` | — | — |
| Drop settles overlaps (one undo step) | `www/team/js/canvas.js:3135-3145` | done | `canvas.ts:118` (`settleDrop`), `canvas/settle.ts` | — | — |
| Draggable zoom controls / minimap | `www/team/js/canvas_viewport.js:25` | missing | grep `Drag to move the zoom` → no match | P3 | S |

### Card anatomy & states

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Status badge: Up to date / Updating / Changes pending / Needs data / Needs settings / Could not update | `www/team/js/card_status.js:13-21` | done | `cards.ts:45-46` | — | — |
| Status badge: Finished / Finished · out of date | `www/team/js/card_status.js:17-18` | done | `cards.ts:46` | — | — |
| Status badge: Saved image broken | `www/team/js/card_status.js:19` | done (as "Snapshot unavailable") | `cards.ts:154` | — | — |
| Badge action buttons (Review / Edit figure / Data & settings) | `www/team/js/card_status.js:38,50-51` | done | `cards.ts:136-140` | — | — |
| Badge action "Study design" | `www/team/js/card_status.js:47` | partial: design is confirmed from the library row only, not from a card | grep `Study design` → only `illustrations/assets.ts:46,65`; `ui/Library/Library.tsx:40` | P3 | S |
| Loading skeleton | `www/team/js/card_status.js:74` | done | `cards.ts:152` | — | — |
| Full title on hover when cut | `www/team/js/canvas.js:3131` | done | `cards.ts:127` (`title.title`) | — | — |
| Resize handle | `www/team/js/canvas.js:1544` | done | `canvas.ts:88` | — | — |
| Card label and background colour | `www/team/js/canvas.js:1740-1743` | done | `ui/Inspector/AppearanceTab.tsx:28` | — | — |
| 40-card limit | `www/team/js/canvas.js:1711` | done | `canvas.ts:128`, `ui/App.tsx:162` | — | — |
| "Enlarge plot" for the heatmap | `www/team/js/canvas.js:1730`; `www/team/js/card_frame.js:10` | missing (manual resize works) | grep `Enlarge` → only `export/finalize.ts:8` (comment) | P3 | S |

### Card ⋯ menu

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Data & settings | `www/team/js/canvas.js:1731` | done | `cards.ts:112` | — | — |
| Duplicate | `www/team/js/canvas.js:1732` | done | `cards.ts:119`, `ui/App.tsx:90` | — | — |
| Finish plot / Edit figure | `www/team/js/canvas.js:1733` | done | `cards.ts:112,209` | — | — |
| Remove | `www/team/js/canvas.js:1736` | done | `cards.ts:112`, `canvas.ts:121` | — | — |
| Plot data (CSV) | `www/team/js/canvas.js:1752` | done (in Export dialog by design) | `ui/Dialogs/ExportDialog.tsx:7` | — | — |
| Copy (to clipboard, for Paste plot) | `www/team/js/canvas.js:1732`, `:446` | missing: only "Copy to tab…" exists | grep `clipboard` → only `canvas.ts:162` / `ui/Inspector/ExportTab.tsx:20` (Copy figure JSON) | P2 | M |

### Inspector Data

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Per-copy data controls | `www/team/js/canvas.js:423` (`openInstanceControls`); `www/team/js/canvas_inspector.js:66` | done (schema from API, same allowed inputs as Team: `R/frontends/api/schema.R:92-94`) | `ui/Inspector/DataTab.tsx:16`, `ui/forms/SchemaForm.tsx` | — | — |
| Finished card hides data controls, offers Edit | `www/team/js/canvas_inspector.js:15-16` | done | `ui/Inspector/Inspector.tsx:27,37` | — | — |

Per-plot completeness of each schema was not verified (needs R).

Nexo-only features not counted (no Team counterpart found): view-only disabling of inspector
fields (`ui/Inspector/Inspector.tsx:41`), checkpoint download/delete in the Checkpoints dialog
(`ui/Dialogs/CheckpointsDialog.tsx:21-25`; grep `Delete checkpoint|delete_checkpoint` in
`R/frontends/team` → no match), marquee multi-select (`canvas.ts:43`), Ctrl/Cmd+D duplicate
(`ui/App.tsx:90`), Change orientation in the plot editor (`ui/PlotEditor/Toolbar.tsx:6`).

### Inspector Appearance / plot editor

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Title and fonts | `www/team/js/plot_editor.js:322,335` | done | `ui/PlotEditor/TitleFonts.tsx`, `ui/PlotEditor/Fields.tsx:6` | — | — |
| Axis title, tick label, tick angle, axis line width | `www/team/js/plot_editor.js:323` | done | `editor/editorState.ts:14-15`, `ui/PlotEditor/AxisSection.tsx:9` | — | — |
| Grid & zero lines (colour, width) | `www/team/js/plot_editor.js:323,338` | done | `editor/editorState.ts:10`, `ui/PlotEditor/PlotEditor.tsx:22` | — | — |
| Legend and legend position | `www/team/js/plot_editor.js:339-340` | done | `ui/PlotEditor/Legend.tsx:4` | — | — |
| Conditions | `www/team/js/plot_editor.js:343` | done | `ui/PlotEditor/Conditions.tsx:3` | — | — |
| Series (label, marker, fill, line) | `www/team/js/plot_editor.js:305,345-346` | done | `ui/PlotEditor/Series.tsx`, `ui/PlotEditor/Fields.tsx:6` | — | — |
| Text annotations (up to 30) | `www/team/js/plot_editor.js:373` | done | `ui/PlotEditor/Annotations.tsx:3`, `editor/editorState.ts:46` | — | — |
| Publication style / Reset presentation (with confirm) | `www/team/js/plot_editor.js:328` | done | `ui/PlotEditor/Toolbar.tsx:6-7` | — | — |
| Palette chooser | `www/team/js/palette_editor.js:12` | done | `ui/PlotEditor/PaletteSection.tsx:9`, `state/document.ts:59` | — | — |
| Group colours from the palette editor per condition | `www/team/js/palette_editor.js:12` "Choose color for …" | partial: palette applies to all series; per-group colour is per series in Series, no condition-named swatches | `ui/PlotEditor/PaletteSection.tsx:9`, `ui/PlotEditor/Series.tsx` | P3 | S |

### Statistics (violin)

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Test: Welch / Wilcoxon | `www/team/js/canvas_statistics.js:8` | done | `statistics/settings.ts:2` | — | — |
| Correction and correction family | `www/team/js/canvas_statistics.js:53,549` | done | `statistics/settings.ts:3-4,72` | — | — |
| Comparisons (B vs A), limits | `www/team/js/canvas_statistics.js:13,53` | done | `ui/Inspector/StatisticsTab.tsx:66`, `statistics/settings.ts:54` | — | — |
| Effect size | `www/team/js/canvas_statistics.js:51` | done | `statistics/settings.ts:5` | — | — |
| Review and confirm before computing | `www/team/js/canvas_statistics.js:16` | done | `ui/Inspector/StatisticsTab.tsx:68-77` | — | — |
| Display: show, adjusted/raw p, exact/stars/both | `www/team/js/canvas_statistics.js:60` | done | `ui/Inspector/StatisticsTab.tsx:81-83` | — | — |
| Display: group sizes, font size, bracket spacing / tip | `www/team/js/canvas_statistics.js:60` | done | `ui/Inspector/StatisticsTab.tsx:84-86` | — | — |
| Results table / "No current results." | `www/team/js/canvas_statistics.js:588` | done | `ui/Inspector/StatisticsTab.tsx:88-89`, `statistics/result.ts:47` | — | — |
| Stale check against current data, retry, CSV with provenance | `www/team/js/canvas_statistics.js:81-108` | done | `statistics/settings.ts:31-34`, `ui/Inspector/StatisticsTab.tsx:60,91`, `statistics/csv.ts:8` | — | — |

### Group comparison

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Statistics: Test (Automatic / Student / Wilcoxon), Reference (Global / Faceted), Baseline, Scale (Log2FC / FC / Δ), Show (stars / p), local-comparison note, full report toggle | `www/team/js/group_comparison.js:127-136`; `www/team/js/canvas_inspector.js:82-83` | partial: a "Show Group comparison report" button prints the API report as raw JSON plus "Confirm reference group"; none of the settings can be changed | `ui/Inspector/StatisticsTab.tsx:55-56`; grep `Student\|Automatic\|Faceted\|Log2FC` → no UI match | P1 | L |
| Display controls: lipid classes (All / None / families), conditions, per-panel group visibility, per-group colours | `www/team/js/group_comparison.js:138-145` | missing in UI (saved shape `features/hiddenConditions/panelOff/panelStyles` is validated only) | `state/document.ts:62`, `state/validate.ts:79-81`; grep `panelOff` in `ui/` → no match | P1 | L |

### Finish / snapshots

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Finish plot freezes a snapshot | `www/team/js/canvas.js:1733` | done | `canvas.ts:435-438`, `export/finalize.ts` | — | — |
| Edit figure unfreezes | `www/team/js/canvas_inspector.js:16` | done | `ui/Inspector/Inspector.tsx:37` | — | — |
| Out-of-date marker | `www/team/js/card_status.js:18` | done | `ui/Inspector/Inspector.tsx:30`, `cards.ts:46` | — | — |
| Download the finished figure | `www/team/js/canvas_inspector_export.js:42,88` | done | `ui/Inspector/ExportTab.tsx`, `canvas.ts:162` | — | — |
| "More downloads from this analysis" | `www/team/js/canvas_inspector_export.js:88,94` | closed: the Export tab lists the module's own download buttons next to the plot (API `GET …/cards/{instanceId}/downloads`) with Team's labels | `test_api_export.R`; `test_nexo_export.cjs` H8; live L7 | P3 | S |
| Illustration snapshot download (PNG / SVG) | `www/team/js/canvas.js:1898` | missing: illustrations get only the Appearance tab | `ui/Inspector/Inspector.tsx:27` | P3 | S |

### Illustrations

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Library by category with search | `www/team/js/illustration_library.js:20-22` | done | `ui/Library/Library.tsx:49,81`, `illustrations/assets.ts:46-83` | — | — |
| Add by click (Nexo also allows drag) | `www/team/js/illustration_library.js:14` | done | `ui/Library/Library.tsx:81` | — | — |
| Label and accent colour | `www/team/js/canvas.js:1880-1882` | done | `ui/Inspector/AppearanceTab.tsx:28` | — | — |
| Finish / Edit illustration | `www/team/js/canvas.js:1888-1900` | done | `cards.ts:209,234` | — | — |

### Figure page

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Add text | `www/team/js/figure_toolbar.js:57` | done | `ui/FigurePage/FigurePage.tsx:27` | — | — |
| Add shape (rectangle, rounded rectangle, ellipse, arrow) | `www/team/js/figure_toolbar.js:58-59` | partial: rectangle / ellipse / line / arrow; no rounded rectangle | `ui/FigurePage/FigurePage.tsx:24,27`; grep `Rounded\|rounded` → no figure match | P3 | S |
| Layout presets (free / pages / publication) | `www/team/js/figure_toolbar.js:62` | done | `ui/FigurePage/FigurePage.tsx:28` | — | — |
| Page setup: paper, orientation, custom size | `www/team/js/canvas_preview.js:59,110,221` | done | `ui/FigurePage/FigurePage.tsx:28` | — | — |
| Page header / footer toggle | `www/team/js/figure_toolbar.js:99` | done ("Page furniture") | `ui/FigurePage/FigurePage.tsx:28` | — | — |
| Plots in this figure: include, order | `www/team/js/canvas_preview.js:77,98` | done | `ui/FigurePage/FigurePage.tsx:28` (Plots tab) | — | — |
| "Select all in tab" and "Reset order (tab order)" | `www/team/js/canvas_preview.js:84,97` | partial: flat list, no per-tab grouping, no reset order | grep `Reset order` → no match | P3 | S |
| Pending placeholders; only finished plots placed | `www/team/js/figure_toolbar.js:109`; `www/team/js/canvas_preview.js:405` | done | `figure/exportPage.ts:17`, `ui/FigurePage/FigurePage.tsx:28` ("· not finished") | — | — |
| Object position, size, text, font size, colours | `www/team/js/canvas_preview.js:268-298` | done | `ui/FigurePage/FigurePage.tsx:26-28`, `figure/page.ts:13-14` | — | — |
| Aspect lock when resizing a figure panel | `www/team/js/canvas_preview.js:62,298` | missing | grep `aspect` → only `canvas/tidy.ts:2` | P2 | S |
| Bring forward / send back, duplicate object, double-click text to edit, page guides | `www/team/js/canvas_preview.js:341,343,395`; `www/team/js/figure_toolbar.js:100` | missing | grep `bring\|Bring\|dblclick\|guides` in `figure/`, `ui/FigurePage/` → no match | P2 | M |

### Export

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Journal presets | `R/frontends/team/export_studio_adapter.R:242` | done | `ui/Dialogs/ExportDialog.tsx:106`, `export/presets.ts` | — | — |
| Size in mm, DPI | `R/frontends/team/export_studio_adapter.R:5,176` | done | `ui/Dialogs/ExportDialog.tsx:82-86` | — | — |
| Base font and font family | `R/frontends/team/export_studio_adapter.R:131,136` | done | `ui/Dialogs/ExportDialog.tsx:110-113` | — | — |
| Formats PNG / SVG / TIFF / PDF / CSV / bundle | `www/team/js/plot_exports.js:98` | done | `ui/Dialogs/ExportDialog.tsx:7,116`, `ui/strings.ts:24-25` | — | — |
| Figure page SVG / PDF / print | `www/team/js/figure_toolbar.js:88-89` | done | `ui/Toolbar.tsx:30`, `figure/exportPage.ts` | — | — |
| Checkpoint ZIP download | `www/team/js/canvas_checkpoint.js:71-76` | done | `ui/Toolbar.tsx:30`, `ui/App.tsx:153` | — | — |

### Checkpoints

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Open a checkpoint | `R/frontends/team/project_library.R:181` (restore token) | done | `main.ts:6-20` | — | — |
| Save a named checkpoint | `www/team/js/canvas_checkpoint.js:24-53` | done | `ui/Dialogs/CheckpointsDialog.tsx:14-15`, `ui/App.tsx:39-45` | — | — |
| Upload ZIP | `R/frontends/team/project_library.R:48` | done | `ui/Dialogs/CheckpointsDialog.tsx:17` | — | — |
| Canvas validated by server before save | `www/team/js/canvas_checkpoint.js:30` | done | `ui/App.tsx:42` | — | — |

### Messages / toasts / confirmations

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Removal toast with Undo | `www/team/js/canvas_feedback.js:55,129` | done | `canvas.ts:121`, `ui/Toast.tsx:19` | — | — |
| Toast pauses on hover/focus, dismiss | `www/team/js/canvas_feedback.js:61-72` | done | `ui/Toast.tsx:10-19` | — | — |
| Restore progress ("Some saved figures will appear once…", "Restoring …", "Couldn't bring back …") | `www/team/js/canvas.js:918`; `www/team/js/canvas_feedback.js:99-106` | partial: "Opening checkpoint…" only, no per-card restore messages | `main.ts:6`; grep `Couldn\|bring back\|Restoring` → no match | P3 | S |
| "Plot changed — export again." / "Updating figures…" notices | `www/team/js/group_comparison.js:121`; `www/team/js/card_status.js:155-156` | missing | grep `export again\|Updating figures` → no match | P3 | S |

### Accessibility

| Feature | Team evidence | Nexo status | Nexo evidence | Impact | Effort |
|---|---|---|---|---|---|
| Roving tab focus on tabs and library tabs | `www/team/js/canvas_tabs.js:123` | done | `ui/TabsBar.tsx:33-35`, `ui/Library/Library.tsx:54-57` | — | — |
| Visible focus ring | `www/team/css/canvas.css` (focus styles per component) | done | `ui/shell.css:1`, `ui/PlotEditor/plotEditor.css:11` | — | — |
| Live regions for status | `www/team/js/canvas_feedback.js:61` | done | `ui/StatusBand.tsx:5`, `ui/TopBar.tsx:7` | — | — |
| Escape closes menus, then inspector | `www/team/js/canvas_viewport.js:75,89` | done | `ui/Menu.tsx:14`, `ui/App.tsx:72-77`, `canvas.ts:371` | — | — |

Two Team affordances are not counted in the totals because Nexo has an alternative: the card
head "Move X with arrow keys" focus target (`www/team/js/canvas.js:1725`; Nexo moves the
selection with arrows, `canvas.ts:380`, but grep `arrow keys` → no aria label), and minimap
arrow-key panning (`www/team/js/canvas_viewport.js:15`; Nexo minimap is pointer only,
`canvas.ts:367`). Both are worth an aria pass (S).

## 3. Top 15 gaps to close (ranked)

1. **P1 · Group comparison statistics controls** (L). Add a Group comparison section to `ui/Inspector/StatisticsTab.tsx` (Test, Reference, Baseline, Scale, Show), posting to the existing `groupComparison` / `confirmGroupComparison` client in `api.ts:129`; render the report as a table, not `<pre>` JSON.
2. **P1 · Group comparison display controls** (L). New `ui/Inspector/GroupComparisonDisplay.tsx` editing `features / hiddenConditions / panelOff / panelStyles` (`state/document.ts:62`) through a history command in `state/visualCommands.ts`, so the saved shape already validated in `state/validate.ts:79` becomes editable.
3. **P2 · Figure page aspect lock** (S). In `ui/FigurePage/FigurePage.tsx` `field()`/`update()`, keep `width/height` ratio for `type==='figure'` items (default on) and in the drag-resize of `figure/page.ts:13-14`.
4. **P2 · Figure page z-order** (S). Add Bring forward / Send back buttons to the Object tab in `ui/FigurePage/FigurePage.tsx`, reusing `nextZ` from `figure/model.ts`.
5. **P2 · Copy / Paste plot** (M). Keep a clipboard of `{source, inputs, visual}` in `ui/model.ts`, add "Copy" to the card menu in `cards.ts:112`, and replace the stub in `ui/Toolbar.tsx:36` with the `createCard` path already used by `copy()` in `ui/App.tsx:159`.
6. **P2 · Retry a failed restore** (M). Surface a "Retry saved workspace" action when a card restore fails, in `canvas.ts` restore path with a status in `ui/StatusBand.tsx`.
7. **P2 · Duplicate object and double-click to edit text on the Figure page** (S). `ui/FigurePage/FigurePage.tsx` (duplicate with new id, ≤80 items) and a dblclick handler in `figure/page.ts` that focuses the Text field.
8. **P3 · Page guides on the Figure page** (S). Toggle in the Page tab of `ui/FigurePage/FigurePage.tsx`, drawn in `figure/page.ts`.
9. **P3 · Rail Palettes / Text & shapes buttons** (S). In `ui/Rail.tsx:22` route "text" to the Figure page add controls and "palettes" to the Appearance tab palette section, or hide them until wired.
10. **P3 · Plots list: per-tab grouping, Select all in tab, Reset order** (S). Plots tab of `ui/FigurePage/FigurePage.tsx`, grouping by `state/tabs.ts`.
11. **P3 · Illustration snapshot download** (S). Allow the Export tab for finished illustrations in `ui/Inspector/Inspector.tsx:27` and serve the SVG from `illustrations/assets.ts` `dataUrl`.
12. **P3 · Feedback toasts for tabs, restore and stale exports** (S). Call `notify()` from `ui/tabsWiring.ts` / `ui/App.tsx` tab handlers and from `canvas.ts` restore; add the tab card count to the delete dialog in `ui/TabsBar.tsx:47`.
13. **P3 · Cancel a queued add** (S). Cancel button on Queued rows in `ui/Library/Library.tsx:74`, aborting the pending `addCard`.
14. **P3 · Zoom shortcuts and 100% reset** (S). Shift+1 → `fit()` and a 100% button in `ui/ZoomPill.tsx` / keydown in `canvas.ts:385`.
15. **P3 · Real project name and size-limit warning in the top bar** (S). Pass the checkpoint/project name from the session into `ui/TopBar.tsx:5` and show the checkpoint size warning next to the save pill.
