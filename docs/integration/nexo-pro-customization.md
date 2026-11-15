# Nexo "pro" plot customization — ranked, buildable proposal

Role: designer (Fable 5.1). Product decision (Gerardo): Nexo goes beyond Team's canvas. Besides Team's
controls it lets a scientist size and customize plots "like a pro". This document is the proposal, not code.
Nothing under `R/modules`, `R/frontends/team`, `www` or the science changes (chart audit plan, lines 59–72).

Evidence and mockups: `docs/integration/nexo-pro-customization/` (today's inspector screenshots from the mock
build, `mockups.html` and its PNGs). Line numbers are from this branch (`router/20261106-222959-580f4a`).

Counts used below are the brief's: 16 live Plotly cards, 33 ggplot cards that arrive as PNG from R, 1 visNetwork,
1 group comparison. The mock catalog on this branch classifies 59 outputs (42 png, 15 plotly, 1 visnetwork,
1 html) and the audit plan speaks of 58; the proposal does not depend on the exact split.

## 1. What exists today, per render kind

Render kinds are decided in `R/frontends/api/catalog.R:64-78` (`renderPlotly` → plotly, `renderPlot`/`renderImage`
→ png, `renderVisNetwork` → visnetwork, `renderUI` → html) and mapped to two renderers in
`frontends/nexo/src/cards.ts:41-42` (`plotly` and `image`; group comparison is `plotly` + `groupComparison`,
visNetwork is `image` + `network`). The Appearance tab (`src/ui/Inspector/AppearanceTab.tsx:28`) shows Label and
Background for every plot and mounts the plot editor only when `handle.figureOf(id)` returns a figure
(`src/canvas.ts:507`), i.e. only for cards whose renderer holds Plotly JSON.

| Area | Plotly (16) | ggplot PNG (33) | visNetwork (1) | Group comparison (1) |
|---|---|---|---|---|
| Label, card background | Yes — `AppearanceTab.tsx:28`; background painted on the card element `canvas.ts:117` | Yes, same | Yes, same | Yes, same |
| Card size and position | Drag/resize grips; arrows nudge 10 px, Alt 1 px, Shift+arrows resize (`canvas.ts:492`, `canvas/editing.ts:13-17`); align/distribute of a selection (`ui/Toolbar.tsx:43`, `canvas/handle.ts:22`). No numeric W/H/X/Y in the inspector (part A adds a basic Size section; not on this branch) | Same; the PNG is re-requested from R at the card's pixel size 160 ms after a resize (`cards.ts:253-254`, `cards.ts:296-302`), R caps 100–4000 px (`R/frontends/api/cards.R:216`) | Same; vis-network redraws | Same; figure rebuilt at card width (`cards.ts:374`) |
| Undo/redo, publication style, reset, orientation | `ui/PlotEditor/Toolbar.tsx:5-6`; editor history of 50 steps (`editor/editorState.ts:74-95`) | Not shown (no figure) | Not shown | Shown; applies through `applyEditor` (`cards.ts:387`) |
| Palette (6 named), "Healthy in grey", per-condition colours | `PlotEditor/PaletteSection.tsx:15` | No — colours come from the module | No | Condition colours, points, inner box per panel in the Statistics tab (`Inspector/GroupComparisonSection.tsx:36-43`, stored in `visual.groupComparison`, `canvas_state.R:309`) |
| Title and fonts (family from 8, size, colour, title position) | `PlotEditor/TitleFonts.tsx:4`; keys `editorState.ts:8-12` | No | No | Yes, same keys |
| Axes: title, colours, tick font size, tick angle, lines, tick labels, grid/zero lines, category labels | `PlotEditor/AxisSection.tsx:9-10`, `PlotEditor.tsx:22` | No | No | Yes |
| Legend: 3×3 placement, orientation, anchors, font, background, show/hide | `PlotEditor/Legend.tsx:4` | No | No | Yes |
| Series: show/hide, name, fill/marker/line colour, line width, marker size, opacity, violin points/box, heat scale low/mid/high | `PlotEditor/Series.tsx:5-12`, `HeatScale.tsx:4-8`, `Conditions.tsx:3-6` | No | No | Yes |
| Text annotations (≤30, paper-anchored, no arrow) | `PlotEditor/Annotations.tsx:3`; arrows stripped on save `editorState.ts:46-50` | No | No | Yes |
| Inline double-click editing of titles on the plot | No (Team has it: `www/team/js/plot_editor.js:312`) | No | No | No |
| Export | PNG/SVG at card size at 300 DPI, Copy figure JSON, dialog with mm, DPI (`Inspector/ExportTab.tsx:9-36`, `Dialogs/ExportDialog.tsx:61,87-102`) | PNG of the image at card size; SVG disabled with reason (`ExportTab.tsx:30`) | PNG from the vis canvas (`cards.ts:215`) | As Plotly |
| Team's own `visual.plotTitle/xTitle/yTitle/fontSize/fontColor/markColor` | Team applies them to Plotly only (`www/team/js/canvas.js:1782-1788`, `canvas.js:2516-2535`); Nexo does not expose them (the editor's layout keys cover them) | Team: not applied ("Plotly plots only") | Not applied | Not applied |

What Team accepts when it reopens a Nexo checkpoint (`R/frontends/team/canvas_state.R`): `team_canvas_object`
rejects any unknown name (lines 14–17), so a new key anywhere in `visual`, `editor`, `editor.layout` or a trace
patch fails the whole checkpoint. The allow-lists: `visual` keys line 567; `editor` keys line 250; layout keys lines
257–265 (checked at 268–270: texts ≤500 chars, hex colours, sizes 6–72, positions −2..3, widths 0–10, angles
−180..180, font family from 8 names); trace keys line 275 (colours hex, `lineWidth` ≤20, `markerSize` ≤100,
opacity ≤1); annotations lines 285–289 (`xref`/`yref` must be `paper`, `showarrow` must be `FALSE`); category
labels 292–305; node `x`,`y` 0–1e6 and `width` 240–4000, `height` 220–4000 (603–605). Nexo mirrors this in
`src/state/validate.ts` and projects the editor through `serializeEditor` (`editorState.ts:26-60`), so today only
allow-listed keys are ever saved.

Where Nexo could keep Nexo-only data: not inside `team-canvas-v1.json`. The checkpoint zip is written by
`R/modules/1_shared_data_module.R:5279-5281` after `team_canvas_validate`, and the reader looks only for
`team-canvas-v1.json` (`R/utils_session_archive.R:119-120`); whether an extra zip member would be tolerated by
every reader is unverified and `R/modules` is off limits anyway. A Nexo sidecar therefore has to be stored by the
Nexo API next to the checkpoint (`R/frontends/api/storage_files.R`), not in the archive. This is the dividing line
between the first wave (Team fields only) and the second (sidecar).

## 2. Candidate features

Value: 3 = a demanding user expects it in any pro tool, 2 = strong, 1 = nice. Effort: S ≤ 1 day, M 2–4 days,
L > 1 week. "Team field" = stored in a field `team_canvas_validate` already accepts (round trip green).
"Sidecar" = needs the Nexo-only store described above; Team opens the checkpoint but shows the card without it.

| # | Feature | Value | Render kinds and how | Storage | Effort | Risk |
|---|---|---|---|---|---|---|
| F1 | Exact size in mm/px, aspect lock, journal column presets (extends part A's Size section, does not duplicate it) | 3 | All four. Plotly: card resize → Plotly.react at new size; PNG: re-requested at the new pixel size (`cards.ts:253`); mm ↔ px at 96 px/in as the export tab already does (`ExportTab.tsx:9`). Presets from the export presets the API already serves (`single_col_mm`, `double_col_mm`, `src/mock/exportPresets.json`, `R/frontends/api/export.R:20`) | `node.width/height` (Team, 240–4000, `canvas_state.R:604-605`). Unit choice and lock are UI preferences (browser) | S | Science 1-col 55 mm = 208 px < Team's 240 px minimum: chip disabled with the reason, Export dialog still exports 55 mm |
| F2 | Exact X/Y of the card, next to align/distribute (which exist, `ui/Toolbar.tsx:43`) | 2 | All four; moves the node like a drag | `node.x/y` (Team, 0–1e6, `canvas_state.R:603-604`) | S | None |
| F3 | Typography panel: one family, base size and a size scale per element (title, axis titles, ticks, legend); "Match fonts across tab" | 3 | Plotly and group comparison via `applyEditor` (`editor/applyEditor.ts:86`). PNG and visNetwork: impossible — fonts are rasterised by R; the only font lever R exposes is `basePt` for the publication bundle (`export.R:41`), not for cards | Team layout keys `font.family/size`, `title.font.*`, `legend.font.*`, `xaxis/yaxis.title.font.size`, `tickfont.size` (`canvas_state.R:257-259`); family limited to the 8 names at line 265 | S | Weights not storable (no key) — second wave |
| F4 | Copy style / Paste style between cards | 3 | Plotly/GC: whole `visual.editor` (layout, palette, legend, annotations) plus width/height; trace patches only when the target has the same `sourceKey`s (`editor/applyEditor.ts:17`), otherwise layout + palette only. PNG/visNetwork: size and background only | Nothing new: the clipboard is in memory (mirrored to `localStorage` for cross-tab paste); paste writes through `setAppearance` (`state/visualCommands.ts:5`) | S | Pasting onto a different chart type: keys that do not apply are ignored by Plotly; the editor's own serializer drops anything invalid |
| F5 | Apply a style to all cards of a tab | 3 | Same as F4 over `tabs.tabs[active].nodes` (`state/tabs.ts:28`); finished cards skipped; image cards get size only | Nothing new | M | Needs one batched undo command (today `setAppearance` is per node); many Plotly.react calls on a big tab — rAF-coalesced like the renderer |
| F6 | Saved style presets ("My lab style"), JSON import/export | 3 | Plotly/GC full; image cards size only | Browser `localStorage` + JSON file. Never in the checkpoint: an extra `visual` key is rejected (`canvas_state.R:567`) | M | Presets are per browser unless exported; say so in the UI |
| F7 | Colour-blind check: simulate deuteranopia/protanopia/tritanopia/greyscale on the card, palette report with ΔE between series colours | 2 | All four: an SVG `feColorMatrix` filter on the card element works on Plotly SVG, PNG `<img>` and the vis canvas alike. The palette report only for Plotly cards with editable series colours (`applyEditor.ts:29`) | None (view state) | M | Simulation is approximate (Machado 2009 matrices); label it "simulation" |
| F8 | High-DPI export preview at 100 % | 2 | Plotly: `Plotly.toImage` at export scale, shown 1:1 in a dialog; PNG: ask R for the image at export pixel size (cap 4000, `cards.R:216`); visNetwork: screen resolution only, say so | None | M | Memory for 4000 px images; one preview at a time |
| F9 | Crisp image cards: request PNG cards at 2× the card size and draw at CSS size (the audit plan allows "render sharpness (device pixel ratio)") | 2 | PNG only (visNetwork is already vector on canvas) | None, or a browser preference | S–M | Doubles R render time and the 48 MB image cache pressure (`cards.ts:301`); default on only for cards ≤ 1000 px wide |
| F10 | Heat scale presets (viridis, magma, cividis, blue-white-red, grey) | 2 | Plotly heatmaps that pass `supportsHeatScale` (`HeatScale.tsx:5`) | `scaleLow/scaleMid/scaleHigh` (Team, `canvas_state.R:275-279`) | S | Three stops approximate viridis; call it "viridis (3-stop)" |
| F11 | Inline double-click editing of plot title, axis titles and legend names on the card (Team parity, `plot_editor.js:312`) | 2 | Plotly/GC | Team keys `title.text`, `xaxis/yaxis.title.text`, trace `name` | S–M | Hit-testing Plotly's text elements; Team's implementation is the reference |
| F12 | Legend presets: inside corner, outside right, below horizontal, hidden | 2 | Plotly/GC | Team keys `legend.x/y/xanchor/yanchor/orientation`, `showlegend` (positions −2..3, `canvas_state.R:260`) | S | Outside placements need margin room — Plotly auto-margins, no key needed |
| F13 | Axis ranges and log scale | 3 | Plotly only (`relayout` `xaxis.range`, `xaxis.type`) | Sidecar: not in the layout list (`canvas_state.R:257-265`), `team_canvas_object` at 268 would fail | M + sidecar | Log of ≤0 values; a range hides data — keep "Team original" one click away and badge the card "Nexo-only style" |
| F14 | Tick format and tick count (`tickformat`, `nticks`, `dtick`) | 2 | Plotly only | Sidecar (same reason) | S + sidecar | Low |
| F15 | Reference lines and shaded bands (`layout.shapes`) | 3 | Plotly only; data-anchored lines/rects | Sidecar | M + sidecar | Low |
| F16 | Annotations with arrows, anchored to data | 2 | Plotly only | Sidecar: the validator forces `xref/yref = paper` and `showarrow = FALSE` (`canvas_state.R:287`) | M + sidecar | Low |
| F17 | Per-series marker symbol and line dash; legend order (`legend.traceorder`) | 2 | Plotly only | Sidecar: trace keys fixed at `canvas_state.R:275` | S + sidecar | Low |
| F18 | Font weight per element (bold title, bold axis titles) | 2 | Plotly only (`font.weight`, Plotly ≥ 2.30); check the Plotly build Team ships before promising it | Sidecar | S + sidecar | Older Plotly ignores it silently |
| F19 | Margins and inner padding | 1 | Plotly only (`layout.margin`) | Sidecar | S + sidecar | Low |
| F20 | Overlay title/caption on image cards (Nexo draws a title bar over PNG/visNetwork cards and burns it into the snapshot at Finish, `cards.ts:221`) | 2 | PNG and visNetwork | Team fields `visual.plotTitle/fontSize/fontColor` (accepted for any plot, `canvas_state.R:567,572-576`) which Team itself applies only to Plotly (`canvas.js:1788`) | M | Team shows the card without the overlay: must be badged "Nexo only" on the card |
| F21 | Transparent background on export | 1 | Plotly (`paper_bgcolor` rgba at export time only); PNG: no (R draws the background) | None (applied at export) | S | None |
| F22 | "Nexo" presentation preset next to "Publication style" and "Team original" (audit plan lines 67–68) | 2 | Plotly/GC | Team layout keys only | S | None |

## 3. Waves

### First wave (ranked by "pro" feel per effort; Team round trip stays green)

| Rank | Feature | Why first | Effort |
|---|---|---|---|
| 1 | F1 Size pro (mm/px, aspect lock, journal presets) + F2 exact X/Y, one "Size & position" section | The first thing a scientist does for a figure; everything is a Team field | S |
| 2 | F3 Typography panel + "Match fonts across tab" | Consistent fonts is the most visible difference between a draft and a paper figure | S |
| 3 | F4 Copy style / Paste style | Turns 10 minutes of clicking per card into two keystrokes | S |
| 4 | F5 Apply style to all cards of the tab | Same, for a whole figure | M |
| 5 | F6 Saved style presets (My lab style) | Reuse across checkpoints; pairs with 3–4 | M |
| 6 | F7 Colour-blind check | Reviewers ask for it; works on every render kind | M |
| 7 | F8 High-DPI preview + F9 crisp image cards | What you see is what the journal gets | M |
| 8 | F10 Heat scale presets | Cheap, big effect on 5 heatmap cards | S |

Round-trip guard: every first-wave write goes through `serializeEditor` or sets `x/y/width/height`. Add one vitest
that feeds each feature's output to `validateState` (`src/state/validate.ts`) and one API test that posts such a
checkpoint and reopens it with `team_canvas_validate` (pattern: `tests/dual-ui/test_api_*.R`).

### Second wave

1. Team-safe extras: F11 inline editing, F12 legend presets, F22 Nexo preset, F21 transparent export, F20 overlay
   titles on image cards (badge the card; the only way to title 33 PNG plots without touching R).
2. Sidecar group: F13 axis range/log, F14 ticks, F15 reference lines and bands, F16 arrows, F17 symbols/dash/legend
   order, F18 weights, F19 margins. One design for all of them: a `nexo-style-v1` JSON per node, stored by the
   Nexo API beside the checkpoint (`R/frontends/api/storage_files.R`, new `GET/PUT /sessions/{id}/nodes/{node}/style`),
   applied by a pure `applyNexoStyle(figure, style)` after `applyEditor`, burnt into finished snapshots, and shown
   on the card as a "Nexo-only style" badge with a "Show as Team draws it" toggle. Effort L for the plumbing, then
   S–M per feature. Team opens the checkpoint untouched and shows its own version of the card.

## 4. Interaction design, first wave

### Appearance tab layout (Plotly card) — mockup A

Order, top to bottom (`mockups.html`, `mockup-a.png`):

1. Style bar: Undo · Redo │ Copy style · Paste style · Apply to tab ▾ │ Presets ▾. One row, wraps at 320 px.
2. "Presentation only…" hint, now also showing the two shortcuts.
3. **Size & position** (open by default): Units mm|px segmented; Width; Height; Aspect ratio lock (shows the ratio);
   one line with canvas px and px at 300 DPI; journal chips (Nature 1-col 89, Nature 2-col 180, Cell 85/174,
   Science 55 disabled with reason); Position X/Y px. Replaces part A's basic Size section in place.
4. **Typography** (open): Family (8 names), Base size, a boxed scale (Title, Axis titles, Tick labels, Legend),
   "Match fonts across tab", "Reset scale". Changing Base size rescales the four proportionally; editing one of
   the four breaks the proportion for that element only.
5. **Colour palette** (collapsed; summary shows the swatch strip and the palette name).
6. **Colour-blind check** (collapsed by default; open in the mockup): chips Normal/Deuteranopia/Protanopia/
   Tritanopia/Greyscale; one result line (green when all series pairs have ΔE ≥ 15, amber warning otherwise).
7. Legend, Axes (horizontal + vertical + grid merged under one header with sub-fieldsets), Series, Text
   annotations — collapsed, each summary carries a one-line state ("top right · vertical", "2 shown").
8. Footer actions: Preview export at 300 DPI…, Publication style, Reset presentation.

Section summaries carry state so a collapsed inspector still tells the user what is set — today's summaries are
bare titles (`today-appearance-plotly-collapsed.png`).

### Image (ggplot PNG) card — mockup B

Same chrome and order. Controls that cannot work are shown **off with the reason**, not hidden, so the user learns
once why ("Fonts are part of the image R draws"). Size & position is fully live and gains "Sharp render (2×)".
Copy style is off ("nothing to copy but size"); Paste style stays on and applies size only, the confirmation line
says so. Colour-blind check works on the image. Legend/axes/series/annotations collapse into one off row.

### Presets, apply to tab, colour-blind report — mockup C

Presets popover: list (applied one highlighted), Apply per row, Save current as…, Import JSON, Export JSON,
"Stored in this browser only" note; empty state with a primary Save. Apply-to-tab confirmation names the source
card, the tab, how many Plotly cards get the full style, how many image cards get size only, how many finished
cards are skipped, and "One undo step". Colour-blind report: four swatch rows and an amber warning naming the
two series that collide and a fix.

### Keyboard

Existing shortcuts stay (`src/ui/strings.ts:52-55`). New, all on the canvas with a card selected:

| Keys | Action | Note |
|---|---|---|
| Ctrl/⌘ + Alt + C | Copy style | Ctrl/⌘ + C keeps copying the plot (source + inputs + visual) as today |
| Ctrl/⌘ + Alt + V | Paste style onto the selection (one or many cards) | Multi-selection = one undo step |
| Ctrl/⌘ + Alt + Shift + V | Apply style to the whole tab | Opens the confirmation; Enter confirms |
| ↑ / ↓ in a size or position field | ±1 unit; with Shift ±10 | Enter commits, Esc restores the field |
| Alt + L while a size field is focused | Toggle the aspect lock | Lock state is per browser |

No single-letter keys are added (I, H, ? are taken). Shortcuts are listed in the Help dialog.

### Undo

- Size/position fields commit on Enter or blur, one main-history step per committed value (same draft pattern as
  `PlotEditor/Fields.tsx:22-28`), so arrow-key stepping does not flood the history.
- Typography edits are editor actions: the editor's Undo (toolbar) reverts them step by step; the main Ctrl/⌘+Z
  reverts the debounced `setVisual` write as today (`AppearanceTab.tsx:25`).
- Paste style and Presets go through one `replace` action (`editorState.ts:71,90`) plus one size command, batched
  into a single main-history step. Apply to tab is one batched command over all affected nodes (new command in
  `state/commands.ts`, inverted node by node).
- Colour-blind check and the export preview change nothing and are not in history.

### Empty and disabled states (reason always shown)

| State | Shown as |
|---|---|
| Paste style with an empty clipboard | Button disabled, title "Copy a style first (Ctrl/⌘ + Alt + C)" |
| Apply to tab when the tab has no other plot | Disabled, "This tab has no other plots." |
| Apply to tab when some cards are finished | Enabled; confirmation says "n finished plots are skipped" |
| Journal preset below Team's minimum (Science 55 mm) | Chip disabled, line "below Team's 240 px card minimum (63 mm). Set 55 mm in Export instead." |
| Width/height typed outside 240–4000 / 220–4000 px | Field clamps on commit, line "Team cards are 63–1058 mm wide" |
| Typography on an image card | Section off, "Fonts are part of the image R draws. Pasting a style keeps size and position only." |
| Palette on an image card | Section off, "Colours are set by the module. Open Data → look for a palette or colour control." |
| Heat scale presets on a non-heatmap | Hidden (the Series fieldset already explains continuous scales) |
| Presets with nothing saved | "No saved styles yet. Save the current style to reuse it…" + primary Save |
| Preview at DPI on a visNetwork card | Enabled at screen resolution, line "Network cards export at screen resolution" |
| Read-only session (`?mode=view`) | Whole tab disabled as today (`Inspector.tsx:44`); colour-blind check stays enabled (view only) |
| Finished card | Appearance hidden as today (`AppearanceTab.tsx:27`); Export keeps the preview |

### Visual language

Team tokens from `src/tokens.css`: Nunito Sans, navy `#162230`, accent `#2d5f8a` for borders, selected chips and
focus rings, line `#e3e7ec`. For AAA text the mockups use `#27547b` for accent-coloured text (7.9:1 on white) and
`#4a5563` for muted text (7.3:1) instead of `#2d5f8a` (6.8:1) and `#5a6878` (5.9:1); if adopted, these are two
new tokens (`--accent-text`, `--muted-text`) and no change to the existing ones.

## 5. How the evidence was made

Mock build: `cd frontends/nexo && npm ci && VITE_API_MOCK=1 npm run build && npx vite preview --port 5199`
(the mock is selected by `VITE_API_MOCK=1`, `src/api.ts:43`, not by a Vite mode). Plotly was copied from
`~/nexo-vendor/plotly.min.js` into `public/vendor/` (git-ignored). Screenshots with Playwright from
`tests/browser/ci` (Chromium), `?checkpoint=demo`, violin card for Plotly, "Sample correlation" added from the
Library for PNG. Mockups are `mockups.html` rendered at 2× (panels) and 1× (overview); all PNGs ≤ 320 KB.
