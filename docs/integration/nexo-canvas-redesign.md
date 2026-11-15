# Nexo canvas screen — visual redesign proposal

Role: designer (Fable 5.1). Product owner: Gerardo. Scope: the whole canvas screen of Nexo, chrome only.
Plots are drawn by R; nothing in the science, `R/`, `www/` or `frontends/nexo/src` changes with this document.
It stays consistent with the inspector proposal in `nexo-pro-customization.md` (the Appearance tab order,
Size & position, Typography, Copy/Paste style, "Team original").

Evidence, all in `docs/integration/nexo-canvas-redesign/`:

| File | What it is |
|---|---|
| `before-1440-default.png`, `before-1440-selected-inspector.png`, `before-1440-board24-fit.png`, `before-1440-board24-100.png`, `before-1024-*.png`, `before-390-phone.png` | Today's app, mock API (`VITE_API_MOCK=1`), Chromium 1248 |
| `prototype.html` | One self-contained interactive prototype, 7 scenes (reviewer bar at the top; `?bare=1&scene=…` hides it) |
| `after-*.png` | The prototype's scenes at 1440×900, 1024×768 and 390×844 |
| `icons.svg`, `icons-map.json` | Chart-type icon sprite (32 symbols) and the map for all 59 catalog ids |

Line numbers are from this branch (`router/20261107-011511-7a7a29`).

## 1. Diagnosis: what hurts today

**The two side panels eat the canvas.** At 1440 px the library (264 px) and the inspector (320 px) are both
open before the user has done anything, leaving 800 px for the board; the second dashboard card is cut by the
inspector edge (`before-1440-default.png`). The inspector column is reserved on every desktop whether or not
anything is selected: `ui/shell.css:60-63` puts `var(--width-inspector)` in the grid at `min-width:901px`
regardless of `inspectorOpen`, and the inspector then shows only "Select a plot or object to see its settings"
(`ui/Inspector/Inspector.tsx:38`). The library starts open on everything above 600 px (`ui/model.ts:7`
`libraryOpen: true`, `ui/App.tsx:78`). At 1024 px the board is 384 px wide (`before-1024-default.png`).

**The library is a wall of text.** Rows are label + state + a bordered `+`, no icon, no visual difference
between a PCA and a heatmap (`ui/Library/Library.tsx:74-81`). Thirteen uppercase group headers at 13 px bold
are louder than the rows. Plot rows cannot be dragged to the canvas; only illustrations can
(`Library.tsx:87` sets `application/nexo-illustration`, `Library.tsx:74` has no `draggable`).

**A real checkpoint does not fit on screen.** `canvas.ts:324` clamps zoom to 10 %–400 % and `canvas.ts:333`
floors `fit()` at 10 % with a 60 px margin; Team allows 5 %. The 24-card mock board fits at 31 %
(`before-1440-board24-fit.png`), but the fit leaves a 200 px empty band above and below the cards because the
viewport is squeezed by both panels, and the camera opens at `{x:24,y:24,scale:1}` (`ui/App.tsx:137`), so a
saved board of 30–40 cards opens showing two cards and the user must find "Fit". `fit()` is only called on
open for read-only devices (`canvas.ts:449`).

**Four bars before the board.** Top bar 48 px, canvas header 42 px, status band 34 px
(`ui/StatusBand.tsx:6`, `tokens.css --bar-status`), a 2 px focus outline around the viewport on load: 126 px
of chrome, with the status band repeating the same sentence forever ("Draft: edit live plots…",
`ui/strings.ts:17`). The tab name is truncated to "Canva" at 1440 px because the toolbar wins the width
(`shell.css .tabsbar{flex:1}` next to a 9-item toolbar, `before-1440-default.png`).

**Bottom-left pile-up.** The zoom pill (5 controls) and the 150×90 minimap stack in the same corner
(`shell.css #minimap{left:12px;bottom:64px}`, `.zoom-pill{left:12px;bottom:12px}`) and overlap the lower-left
card at 100 % (`before-1440-board24-100.png`). The minimap is always on, even when the whole board is on
screen and it has nothing to add (`before-1440-board24-fit.png`: the viewport box fills the minimap).

**Card chrome is heavy for what it says.** 40 px header + 40 px footer (`shell.css .card header`,
`.card-footer`) with text links "Edit · Duplicate · ⋯" on every card; the status is a green dot plus a hidden
label; the selection ring is a flat 2 px outline; the resize handle is invisible until found
(`before-1440-selected-inspector.png`).

**States are plain text.** A card that failed shows the raw R message in muted text (`cards.ts:379-382`);
rendering shows an empty body; the empty tab shows one sentence and one button (`ui/App.tsx:40-43`).

**Phone.** The read-only view keeps the rail (3 buttons for 2 actions), a tab badge, the ⋯ menu and
"Figure page →", and opens at 30 % with the cards in the top half (`before-390-phone.png`). The library panel
exists in the DOM but cannot be used.

What is already right and must stay: the engine (camera, tiers, minimap, wheel and pinch zoom,
`canvas.ts`, `tiers.ts`), the Team vocabulary (rail, library, tabs, toolbar, inspector, status pill), the
tokens (`tokens.css`), Nunito Sans at 400/600/700, the selection-opens-inspector rule with the "user closed it"
memory (`ui/App.tsx:86-96`), `I` to toggle the inspector (`ui/Rail.tsx:26`), Escape closing it
(`ui/App.tsx:97-101`), the toast with Undo (`ui/Toast.tsx`).

## 2. Design principles

1. **The board is the screen.** Chrome opens when asked and steps back when not needed. Two bars above the
   board, nothing permanent below it except the zoom pill.
2. **Same pieces as Team, fewer of them visible at once.** Every Team concept keeps its name and place; it
   just does not all show at the same time.
3. **One accent, one family, four greys.** Accent `#2d5f8a` only for the selected, pressed or primary thing.
   Text is ink `#141b24` or muted `#5a6878`; surfaces are paper, canvas `#f3f5f7`, tint `#eaf1f7`.
   Status uses the four semantic pairs already in `tokens.css`.
4. **Every state is designed.** Rendering, error, needs-settings, empty, finished, view-only each have a
   layout, a sentence and the one button that fixes it.
5. **Motion explains, never decorates.** 120 ms for hover and chips, 180 ms for panels, 280 ms for the
   camera, all `cubic-bezier(.2,.7,.2,1)`; `prefers-reduced-motion` sets every duration to 0 ms.
6. **Keyboard parity.** Everything the rail does has a key, and the key is printed in the tooltip.

## 3. Proposal, area by area

### (a) Inspector: closed by default

| | Today | Proposal |
|---|---|---|
| Default | Column reserved on desktop (`shell.css:60-63`) | Closed: grid column 0 px; the board gets the width |
| Opens | Selection (`App.tsx:90`), `I`, rail button, card action | Same triggers, plus the floating selection chip (below) and `Enter` on a focused card |
| Closes | `×`, `I`, Escape | Same; Escape order is inspector → library → selection |
| Stays closed | `closed` flag until selection clears (`App.tsx:94-96`) | Keep exactly that rule |
| Animation | none | Column width 0→320 px in 180 ms; content fades in over 120 ms starting at 60 ms; closing is 150 ms; the canvas does not re-centre (the camera stays, the viewport simply widens) |
| When closed | Empty 320 px column with a sentence | Nothing on the right. If a card is selected, a **selection chip** floats at the top-right of the stage: `● Principal components  [Inspect I]`, 32 px tall, pill, paper with line border, 12.5 px text. It disappears when the selection clears or the inspector opens |
| Header | 16 px heading + `×`, status line below | 44 px header: 8 px status dot, 14 px/600 title, `×`. Status row 12 px muted with a check/clock/alert glyph and the primary action at the right ("Finish plot", 26 px, accent) |
| Tabs | Tint pills | Underline tabs, 38 px, accent underline 2 px on the active one |
| Phone (≤600) | 45 dvh sheet | 46 dvh bottom sheet with a 36×4 px grab bar, read-only fields, no Finish/Copy/Paste; the camera fits the selected card into the remaining viewport (280 ms) |

Where: `ui/model.ts` (no change: `inspectorOpen:false` already), `ui/shell.css:60-63` (drop the always-on
column; keep `.inspector-open` as the only rule that adds it), `ui/Inspector/Inspector.tsx:35-37` (header,
status row), new `.selchip` in `ui/App.tsx` next to `ZoomPill`. Prototype: scene 3.

### (b) Library ("plots bar"): closed by default

| | Proposal |
|---|---|
| Default | Closed on every width (`ui/model.ts:7` → `libraryOpen:false`; `ui/App.tsx:78` loses the 600 px branch) |
| Opens | Rail "Plot library" (`L`), rail "Illustrations" (`Shift+L`), `/` (opens and focuses search), "Add plot" in the toolbar, "Add plot"/"Open library" in the empty state |
| Width | 280 px (today 264) so a 32 px glyph + two-line label + `+` fit without truncation |
| Mode | ≥1100 px: pushes the canvas (grid column 0→280 px, 180 ms). 601–1100 px: overlays the canvas with `shadow-pop`, same animation. ≤600 px: not available (read-only) |
| Closes | `×`, `L`, Escape, the rail button again. It does **not** close after adding a card; it closes on its own only on overlay widths after a drop |
| Focus | Opening focuses the search box (as `Library.tsx:35-38` does); Escape in the search clears it first, then closes |
| Drag to canvas | Every plot row is `draggable` with `application/nexo-plot` = catalog id; the drop handler on `#viewport` converts the drop point to world coordinates and calls `addCard` then `moveNode` (today `addCard` places by `place.ts`). Illustrations keep `application/nexo-illustration`. A drag ghost is the 32 px glyph + label |
| Footer | One line: "Drag a plot onto the canvas, or press Enter on a row", 12 px muted |

Where: `ui/model.ts:7`, `ui/App.tsx:78`, `ui/Library/Library.tsx:52-62` (header, search), `canvas.ts`
drop handler (next to `vp.onwheel`, `canvas.ts:450`), `ui/shell.css` library rules (`@media(max-width:600px)`
block becomes `max-width:1100px` for overlay). Prototype: scene 2.

### (c) The library shows an icon for every plot

**Icon set.** `icons.svg`: 24×24 grid, 1.5 px stroke, round caps and joins, `currentColor`, no fills except
`fill-opacity` tints for stacked/heat cells. 27 chart-type symbols + 4 family glyphs + the histogram kept for
future outputs. One symbol per chart type, not per output, so the set reads as one hand:

`scatter`, `scatter-3d`, `loadings`, `quadrant`, `violin`, `box`, `strip`, `bar`, `bar-grouped`,
`bar-stacked`, `bar-diverging`, `donut`, `density`, `histogram`, `heatmap`, `matrix`, `volcano`, `lollipop`,
`dotplot`, `small-multiples`, `network`, `pathway`, `line`, `line-multi`, `circos`, `pulse`, `band`, `page`.

**Map.** `icons-map.json` maps all 59 ids of `src/mock/catalog.json` (same ids as
`www/team/js/canvas_catalog.js`) to a symbol, and each of the 13 families plus Illustrations to a header glyph.
A unit test (`src/catalog.test.ts`) asserts every catalog id has a symbol and every symbol exists in the sprite.
Unknown ids discovered at runtime (`canvas_catalog.js:193`) fall back to the family glyph.

**Row anatomy (list view, default).** 44 px row: 32×32 glyph tile (tint background, accent icon) · label
13 px/600 one line · sub-line 11.5 px muted ("Live plot" / "Image from R" / "On canvas · 2" / "Needs a
confirmed design" / "Needs time points") · `+` 28 px that appears on hover/focus (always on touch).
States: `on` (tile navy with a green count badge, click locates the card), `gated` (tile grey, amber sub-line,
click explains and links to Study design), `off` (55 % opacity, no `+`), `add`.

**Grid view.** Toggle in the toolbar (list/grid, remembered in `localStorage`): 3 columns of 40 px tiles with a
two-line 11.5 px label, `+` at the top-right corner on hover. Grid is for scanning by shape; list is for reading.

**Families.** Sticky 30 px uppercase 12 px headers with the family glyph and a count pill; a horizontal chip
row above the list filters to one family ("All" resets). Search (`/`) filters across families and opens every
matching family; "No plot matches 'x'" with a Clear link when nothing matches.

Where: `ui/Library/rows.tsx` (icon per row from the map), `ui/Library/Library.tsx:65-83`, new
`src/ui/icons.ts` exporting the sprite as a React component, `src/catalog.ts` (families to glyphs),
`ui/Rail.tsx:7-11` (replace the inline 18 px icons with sprite symbols at 20 px). Prototype: scenes 2 and 2b.

### (d) Opening zoom, minimum zoom, minimap

**Rule: open with fit-all, floored at 5 %, capped at 100 %, 32 px padding.**

```
scale  = clamp( min( (vw − 64) / boardW, (vh − 64) / boardH ), 0.05, 1 )
camera = centre the board's bounding box in the viewport at that scale
```

Applied on open for every tab the first time it is shown (today: `{24,24,1}` at `App.tsx:137`), on "Fit"
(`Shift+1`) and on window resize while the user has not panned or zoomed since the last fit. A board that
fits at ≥ 100 % opens at 100 % with the top-left card at 24,24 (today's behaviour). The 30-card prototype board
opens at 35 % at 1440×900 and at 9 % at 390×844; the 24-card mock board would open at 41 % instead of 31 %
once both panels are closed, with the chrome savings below.

Why fit-all and not "first row": Gerardo's ask is that the whole board be visible. Reading order is served by
the thumb tier and by `Shift+2` (fit selection) and double-click on a card (zoom to it at ≤ 100 %, 280 ms).

**Minimum zoom 5 %** (Team parity): `canvas.ts:324`, `canvas.ts:333`, `canvas.ts:502` (pinch), figure-mode fit
at `canvas.ts:328`. Maximum stays 400 %.

**Tiers at low zoom.** `tiers.ts` keeps "frozen below 50 %, culled beyond 200 px, 4 live max". One addition:
a **thumb tier under 20 %** that is purely chrome: the card header collapses (0 px), the border goes to 2 px,
the title is shown as a tooltip only. Cards then read as a contact sheet instead of 30 unreadable title bars.
No new render work: the frozen image already exists.

**Zoom pill.** Bottom-left, 32 px, pill: `−` · `96%` (click = 100 %, `Shift+0`) · `+` · divider · `Fit`
(`Shift+1`; `Shift+2` fits the selection). Zoom steps 1.25×, animated 280 ms when triggered by the pill or a
key, instant on wheel and pinch (today's per-frame path, `canvas.ts:323-326`).

**Minimap.** Moves to the bottom-right (160×96, today 150×90 bottom-left above the pill) so the pill and the
map no longer stack over cards. It is **automatic**: hidden when the viewport box contains the whole board,
shown on any pan or zoom that leaves part of the board off-screen, shown while the pointer is in the 190×120
corner, and pinned/unpinned with `M`. Fade 220 ms. On phones 96×58. Selected cards are drawn in accent in the
map. Click still recentres (`canvas.ts:523`).

Where: `canvas.ts:323-334` (clamp, fit), `canvas.ts:309-321` (minimap visibility), `ui/App.tsx:137` (first
camera per tab), `ui/ZoomPill.tsx`, `ui/shell.css` (`#minimap`, `.zoom-pill`), `tiers.ts` (thumb threshold
exported for the card class), `cards.ts:275` (dataset.tier → `thumb`). Prototype: scene 4 (then `+` three
times to see the minimap return).

### (e) Everything else that makes it AAA

**Top bar (48 px, navy).** `LE` mark 28 px, "Lipidomic Explorer" 14 px/600, then **one project pill** that
merges the checkpoint name and the save state: `● Synthetic demo  Saved ▾` (dot green/amber/red for
saved/saving/error; "Unsaved changes · Autosave on" becomes "Saving…" then "Saved" to stop the sentence
wobble). Steps `Data · Review · Canvas` as 999 px chips with the current one in accent. Right: help `?` and
account. The "records near limit" warning keeps its place before the avatar.

**Canvas header (44 px, one row).** Tabs on the left (`Canvas 1 [5]`, `Figures [0]`, `+`, `⋯`), tools on the
right: Analysis settings · **Add plot** (the only filled button) · undo/redo as 30 px icon buttons · Draft chip
(`● Draft · 4 to finish`, tint, amber dot) · Figure page → · Export ▾ · ⋯. Tabs are flex `min-width:0` with
overflow scroll and the tools shrink first (Analysis settings and Export fold into ⋯ under 1100 px), so a tab
is never cut to "Canva".

**Status band: removed.** Its sentence becomes (1) the empty state, (2) a **hint pill** at the bottom centre
(navy, 12.5 px, 2.8 s, shows on first open, on mode change and after a shortcut: "Pan ⟨H⟩", "Fit all ⟨⇧1⟩"),
and (3) the `?` shortcuts dialog. Notices that today go to the band's `status-notice` go to the toast.
Net: 34 px more board and one fewer border.

**Stage.** Dot grid 20 px (today 24) scaled with the camera, dots `#cfd7e1` 1 px. No focus outline on the
viewport frame (`:focus-visible` on `#viewport` draws a 2 px inset ring only when reached by keyboard).

**Card chrome.** Header 36 px (today 40): 7 px status dot · 13 px/600 title · actions (Edit, Duplicate, ⋯ as
26 px icon buttons) that appear on hover/selection/focus. **No footer** (today 40 px): the actions and status
live in the header, which saves 44 px per card and makes a 440×330 card show a 440×293 plot. Border `line`
1 px, radius 10 px, shadow `0 1px 2px 8 %, 0 4px 14px 6 %`. Hover: border `line-strong`, shadow lifts
(120 ms). Selected: border accent + `0 0 0 1px accent, 0 0 0 5px accent 12 %` halo; the resize grip (18 px,
accent corner) shows only on the selected card. Finished: a `Finished` pill bottom-right of the plot, green
text. Badges never cover the plot's axis labels (they sit in the 8 px gutter R leaves).

**Card states** (scene 5): rendering = skeleton (12 px inset, shimmer 1.4 s, static under reduced motion) with
faint bar silhouettes and a "Rendering…" pill; error = red-tinted 36 px glyph, "Could not draw this plot",
R's message in one line, `Retry` (primary) + `Data & settings`; needs settings = amber glyph, "Needs a
comparison", one sentence, `Study design`; empty result = family glyph, "Nothing to show", `Review
thresholds`; view-only shows the same cards with no actions. Each maps to today's `CardStatus`
(`cards.ts:56-60`): `updating` → rendering, `error`, `waiting`/`needs-data` → needs settings, `pending` → the
header dot in amber with no overlay.

**Empty tab** (scene 6): dashed 1.5 px box, 44 px glyph tile, "This canvas is empty", one sentence, `Add plot`
(primary) + `Open library L`, and three suggested chips with icons (PCA, volcano, heatmap). Only the box takes
pointer events so drops reach the canvas (as `App.tsx:39` intends).

**Rail (56 px).** 38 px buttons, 20 px sprite icons; pressed = tint background + a 3 px accent bar on the
left edge; tooltip to the right with the key (`Plot library L`, `Illustrations ⇧L`, `Text T`, `Palettes P`,
`Select V`, `Pan H · hold Space`, `Inspector I` anchored at the bottom).

**Toasts.** Bottom centre, 56 px from the edge, navy, 10 px radius, 13 px, `Undo` as a translucent button, `×`;
6 s / 9 s for errors (as `Toast.tsx:10`), pause on hover and focus (kept). Never more than one.

**Keyboard.** `L`, `⇧L`, `/`, `I`, `V`, `H`, `Space` (hold), `T`, `P`, `M`, `+`/`−`, `⇧1` fit all,
`⇧2` fit selection, `⇧0` 100 %, `Delete`, `Ctrl+D`, `Ctrl+Z/Y`, `Escape` (inspector → library → selection),
`?` shortcuts dialog. All printed in tooltips and in the dialog (`ui/Dialogs/ShortcutsDialog.tsx`).

**Motion.** Panel 180 ms, camera 280 ms, hover 120 ms, minimap 220 ms, hint 200 ms, card add = today's
`just-added` (`shell.css:366`). Reduced motion: `--motion:0ms` already exists in `tokens.css`; the new
durations use it.

**Typography.** Chrome 13 px, labels 12 px, small 11.5 px, headings 14 px/600 (inspector, card), 15 px for the
empty-state title; tabular numbers in the zoom pill. Contrast: every text pair is ≥ 7:1 (ink/muted on paper and
canvas), accent on tint 5.9:1 for 13 px/600 chips (AA large), white on accent 7.2:1.

**Phone (≤480 px read-only, scene 7).** Top bar 44 px: mark, steps, `View only` pill. No rail (view-only has
nothing to pick). Header: tabs only (scrollable). One-line blue banner, dismissible. Canvas full height,
**fit-all on open**, pinch and two-finger pan, tap a card to open the read-only sheet (the card is refit into
the remaining viewport), tap the canvas or swipe the sheet down to close. Zoom pill 30 px, minimap 96×58
automatic. Verified: no horizontal page scroll at 390 px (`scrollWidth` = 390).

## 4. Implementation plan (three waves)

Effort S ≤ 1 day, M 2–4 days, L > 1 week. Tests are Playwright suites under `tests/dual-ui/` (mock build), run
with `node tests/dual-ui/test_nexo_<name>.cjs`, plus vitest where noted.

### Wave 1 — the board gets the screen (S/M, lowest risk, biggest visible change)

| # | Change | Files | Effort | Risk | Test that proves it |
|---|---|---|---|---|---|
| 1 | Inspector closed by default on desktop; opens on selection/`I`; selection chip | `ui/shell.css:60-63`, `ui/App.tsx:225,239` (chip), `ui/Inspector/Inspector.tsx:35-37` | S | Low: the open/close state machine already exists | `test_nexo_inspector.cjs`: add "on load the inspector column is 0 px wide; selecting a card opens it; Escape closes; selecting another card while closed keeps it closed; `I` reopens". `test_nexo_access.cjs` axe pass stays green |
| 2 | Library closed by default; push ≥1100, overlay below; `L`, `/` | `ui/model.ts:7`, `ui/App.tsx:78`, `ui/Rail.tsx:21-29`, `ui/shell.css` library block | S | Low; the perf suite adds cards through `__nexo.handle.addCard`, not the panel | `test_nexo_canvas_tabs.cjs` first assertion becomes "library hidden on load"; new `test_nexo_shell_panels.cjs`: `L` opens and focuses search, Escape closes, `/` opens |
| 3 | Fit-all on first show per tab, floor 5 %, 32 px pad; `Shift+2` fit selection | `canvas.ts:323-334,502`, `ui/App.tsx:137`, `canvas/reveal.ts` | S | Medium: `fit()` is shared with figure mode (`canvas.ts:328`); keep the figure branch | `test_nexo_perf.cjs` 40-card step: after `fit()` the HUD percentage equals the computed `clamp(min(...),.05,1)` ±1 and every `.card` bounding box lies inside `#viewport`; `test_nexo_canvas_readonly.cjs` phone fit at 390 px |
| 4 | Status band removed; hint pill; notices to toast | `ui/StatusBand.tsx`, `ui/App.tsx:238`, `tokens.css --bar-status`, `ui/strings.ts:17` | S | Low; `role=status` moves to the toast so screen readers still hear notices | `test_nexo_card_chrome.cjs`: the band is absent; a notice reaches `.toast[role=status]` |
| 5 | Canvas header: tabs never truncate, tools fold under 1100 px, filled "Add plot" | `ui/TabsBar.tsx`, `ui/Toolbar.tsx`, `ui/toolbarOverflow.ts`, `ui/shell.css` | S | Low | `test_nexo_canvas_tabs.cjs`: at 1440 and 1024 the active tab text is complete (`scrollWidth === clientWidth`) |
| 6 | Zoom pill redesign; minimap to bottom-right, automatic visibility, `M` | `ui/ZoomPill.tsx`, `canvas.ts:309-321`, `ui/shell.css #minimap` | S | Low | `test_nexo_perf.cjs`: after `fit()` `#minimap` has `opacity:0`; after `zoomTo(scale*2)` it is visible; `M` pins it |

### Wave 2 — the library and the cards (M)

| # | Change | Files | Effort | Risk | Test |
|---|---|---|---|---|---|
| 7 | Icon sprite + map + rail icons; vitest for coverage | new `src/ui/icons.tsx` (from `icons.svg`), `src/catalog.ts`, `ui/Library/rows.tsx`, `ui/Rail.tsx:7-11`, `src/catalog.test.ts` | M | Low | vitest: every `catalog.json` id has a symbol; every symbol id exists. `test_nexo_access.cjs`: icons are `aria-hidden`, rows keep their accessible names |
| 8 | Library rows (glyph tile, sub-line, hover `+`), family chips, grid view, sticky headers, no-match state | `ui/Library/Library.tsx:52-96`, `ui/shell.css` library rules | M | Low | new `test_nexo_library.cjs`: search "pca" shows 5 rows across 2 families; chip "Quality check" filters; grid toggle persists after reload |
| 9 | Drag a plot row onto the canvas | `ui/Library/Library.tsx:74`, `canvas.ts` (drop near `vp.onwheel`), `src/place.ts` | S | Medium: `addCard` is async and queued (`canvas/queuedAdd.ts`); the drop position must survive the queue | `test_nexo_canvas_edit.cjs`: `dragAndDrop` from a row to (600,400) creates a card whose node x/y are within 20 px of the world point |
| 10 | Card chrome: 36 px header with hover actions, no footer, new selection halo, grip on selection | `cards.ts:117-157`, `ui/shell.css .card*` | M | Medium: `test_nexo_card_chrome.cjs` and the journey suites click the footer buttons (`Edit`, `Duplicate`, `More card actions`) — keep the accessible names on the header buttons | `test_nexo_card_chrome.cjs` updated selectors; visual check that a 440×330 card shows a ≥ 290 px tall plot |
| 11 | Card states: skeleton, error, needs settings, empty result | `cards.ts:379-382,436-441`, `ui/shell.css` | M | Low | `test_nexo_live_journeys.cjs` (mock refusal at `test_nexo_perf.cjs:243-246`): the refused card shows the error layout with `Retry` and `Data & settings` |
| 12 | Empty tab state with suggestions | `ui/App.tsx:40-43`, `ui/strings.ts:53` | S | Low | `test_nexo_canvas_tabs.cjs` empty-tab assertion updated (text + 3 suggestion chips) |

### Wave 3 — polish and phone (S/M)

| # | Change | Files | Effort | Risk | Test |
|---|---|---|---|---|---|
| 13 | Thumb tier under 20 % | `tiers.ts`, `cards.ts:275`, `ui/shell.css` | S | Low: chrome only | `test_nexo_perf.cjs`: at 15 % every `.card header` has height 0; at 25 % it is 36 px |
| 14 | Top bar project pill merging name + save state | `ui/TopBar.tsx`, `ui/App.tsx:56,171-173` | S | Low | `test_nexo_save.cjs`: pill text goes Saving… → Saved; error state offers Retry |
| 15 | Phone read-only: no rail, tabs-only header, sheet refit | `ui/Rail.tsx`, `ui/shell.css @media(max-width:600px)`, `ui/App.tsx:225` | M | Low | `test_nexo_canvas_readonly.cjs` at 390×844: no `.rail`, `document.scrollingElement.scrollWidth === 390`, tapping a card opens the sheet and the card's box lies inside the top 54 dvh |
| 16 | Tooltips with keys, `?` dialog refresh, hint pill copy | `ui/Rail.tsx`, `ui/Dialogs/ShortcutsDialog.tsx`, `ui/strings.ts` | S | Low | `test_nexo_access.cjs`: every rail button has `aria-label`; `?` opens the dialog |
| 17 | Motion tokens and reduced-motion audit | `tokens.css`, `ui/shell.css` | S | Low | Playwright `reducedMotion:'reduce'` context: panel open completes in one frame |

Order inside a wave is the row order. Wave 1 ships alone first: it is the one Gerardo asked for by name
and it changes no card or library markup, so every existing suite but two assertions stays green.

## 5. Top 10 changes by impact

| Rank | Change | Why it matters |
|---|---|---|
| 1 | Both panels closed on open (a, b) | +584 px of board at 1440, +584 at 1024; the first screen is the work |
| 2 | Fit-all on open, floor 5 % (d) | A saved 30-card board is visible at once instead of two cards at 100 % |
| 3 | Status band removed, one canvas header (e) | −35 px of permanent chrome and one fewer repeated sentence |
| 4 | Icon per plot type, 59 ids (c) | The library becomes scannable; families read at a glance |
| 5 | Card header 36 px, no footer (e) | +44 px of plot per card, actions on hover, cleaner board |
| 6 | Automatic minimap at bottom-right (d) | No more pile-up over the lower-left card; appears only when useful |
| 7 | Designed card states (e) | Errors say what happened and offer the fix; rendering looks alive |
| 8 | Drag any plot to the canvas (b) | Parity with illustrations; places the card where the eye is |
| 9 | Selection chip + keyboard hints (a, e) | Discoverability of `I`, `L`, `⇧1` without a permanent bar |
| 10 | Phone read-only without rail, fit-all, read-only sheet (e) | A phone opens straight onto the whole board |
