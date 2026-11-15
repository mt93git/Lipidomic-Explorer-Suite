# Pilot phase 1 close: session palette (F1) and thumb-tier drag (F2)

Live simulated pilot (coordinator, real API, synthetic checkpoint nexo-complete-synthetic): 20/24 PASS.
Two findings are fixed here; outputs are copied from the runs on the M1 (mock API; the M1 has no R).

## F2 (P3) Cards cannot be moved at the thumb tier

Below 20 % zoom the card header is 0 px and inert (cards.ts setZoom, shell.css .card-thumb), and the canvas
started a move only from the header. Now `cardPress` (frontends/nexo/src/canvas/editing.ts) decides what a press
on a card starts: header = move, handle = resize, control = nothing, and at the thumb tier a body press is a
'pending-move' that becomes a move once it leaves the 4 px click threshold (`beyondClick`, the same threshold
click-to-focus uses). A press that stays within it is still a click (focus). Same drag path as a header drag:
snapping, neighbours settled, one undo step.

### Red (before the fix)

vitest `src/canvas/thumbDrag.test.ts` (the gesture decision), before `cardPress`/`beyondClick` existed:

```
   × cardPress: what a press on a card starts > a header press moves and a handle press resizes at any zoom 4ms
   × cardPress: what a press on a card starts > a body press does nothing above the thumb tier (the plot keeps its own gestures) 0ms
   × cardPress: what a press on a card starts > a body press at the thumb tier is a move once it leaves the click threshold 0ms
   × cardPress: what a press on a card starts > controls never start a drag 0ms
   × beyondClick: the click threshold shared with click-to-focus > is 4 screen px 2ms
   × beyondClick: the click threshold shared with click-to-focus > a press that stays within it is a click; one that leaves it drags 0ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/canvas/thumbDrag.test.ts > cardPress: what a press on a card starts > a header press moves and a handle press resizes at any zoom
 FAIL  src/canvas/thumbDrag.test.ts > cardPress: what a press on a card starts > a body press does nothing above the thumb tier (the plot keeps its own gestures)
 FAIL  src/canvas/thumbDrag.test.ts > cardPress: what a press on a card starts > a body press at the thumb tier is a move once it leaves the click threshold
```

`node tests/dual-ui/test_nexo_thumb_drag.cjs` (mock, 14 %, drag the body 70 px) on the base code: the card never moves.

```
page.waitForFunction: Timeout 30000ms exceeded.
  log: [],
  name: 'TimeoutError'
}
```

### Green

```
PASS F2 chromium thumb-body-drag-moves-settles-single-undo
PASS F2 chromium thumb-click-still-focuses
PASS F2 chromium no-console-errors
PASS F2 webkit thumb-body-drag-moves-settles-single-undo
PASS F2 webkit thumb-click-still-focuses
PASS F2 webkit no-console-errors
F2 OK
```

App rule after F2: `npx vitest run` 128 files / 602 tests passed; `npx tsc --noEmit -p .` clean;
test_nexo_inspector.cjs 46 PASS (H3 OK), test_nexo_card_chrome.cjs 29 PASS (H6-0 OK), test_nexo_canvas_edit.cjs
34 PASS (H2F OK), Chromium and WebKit.

## F1 (P2) Per-card group colours/shapes did nothing: Team's session palette instead

Cause (Team's own code, verified live by the coordinator): a canvas copy takes its group colour map from the session
(`R/frontends/team/plot_instances.R`: `global_color_map <- shared_data$color_maps()`), QC builds its PCA with
`global_color_map()[[colorMap_key]]` and `shared_data$shape_maps()`, and the copy's `customCol_*`/`customShape_*`
only feed the module's return value, which only Team's main QC tab bridges (`R/server.R` `qc_settings_bridge`).

What changed:

- API (`R/frontends/api/palette.R`, routes in `plumber.R`): `GET/PATCH /api/v1/sessions/<id>/palette`. A PATCH is one
  of `{palette}` (Team's `palette_choice` + "Use palette" `palette_use`), `{context, colors}` (Team's
  `colorEditMode`, every `globalGroupCol_*` field of the context as Team's browser sends it, then "Apply color
  changes" `btn_apply_colors`) or `{restore}` (an earlier state through Team's `shared_data$set_palette_settings`:
  undo, a reopened session, a render worker). Team's observers compute every colour. The answer lists Team's palettes
  (with preview chips as `palettePreviewUI`), the session's Group 1 / Group 2 / combined colours from
  `color_maps()`, the state, and `shapesEditable: false` (Team's editor has no shapes). A change bumps the session
  render epoch; the palette state is part of the disk-cache key and of the render workers' state (`pool.R` aligns a
  worker with `restore`). Team's export saves it (`state.json` `color_shape`) and Team's import restores it.
- QC (`qc_pca_tab`) copies no longer offer `customCol_*`/`customShape_*` (`api_is_computed_id` with the family);
  values saved before are dropped on update, not refused. The cellular organization polar map keeps its own pickers:
  they do reach its plot (`polar_active_color_map`). Card schemas carry `sessionPalette`.
- Client: rail Palettes opens "Colors & palettes" (`src/ui/SessionPalette.tsx`, non-modal), Team's palette names,
  per-group colour pickers per context; each change is one undo step (`src/palette/sessionPalette.ts`
  `setSessionPalette`; undo/redo send the earlier/later state back as `restore`); every card redraws
  (`invalidateAnalysis`); a lost session gets the palette back on reopen (`replayHeldEdits`). A QC Data tab says
  "Group colours and shapes follow the session palette." with a "Session palette…" button.
- Mock (`src/mock/palette.ts`): session-wide as Team, Team's presets, saved with the checkpoint (the mock ZIP carries
  `state.json` `color_shape`); dashboard traces and the QC 2D PCA image take the session colour.

### R (red, then green), run on the M1 in a local Docker image (R 4.6.2 arm64, Team's packages installed; `LC_ALL=C.UTF-8`)

Red: `tests/dual-ui/test_api_session_palette.R` on `07792004` (before `palette.R`):

```
Error: FAIL palette.R is not loaded by engine.R (no api_palette_update)
```

Green on `caf7d633`:

```
INFO Group1 levels Control, Treatment; testing Control (session colour #E41A1C)
PASS QC copy: customCol_/customShape_ set as Team's browser would leave the PCA unchanged (dead on a canvas copy)
PASS cellular organization polar map: the copy's own customCol_Control redraws it in #AA3300 (alpha 0.85) (kept per card)
PASS schema: QC has no customCol_/customShape_ and sessionPalette = TRUE; the polar map keeps them; old QC values are dropped
PASS GET palette: 5 palettes (Team's names), 3 context(s), Group1 colours = the session map
PASS PATCH palette {context: Group1, colors: {Control: #AA3300}} sets Team's editor fields + Apply; the PCA redraws in #AA3300
PASS PATCH palette {palette: Tableau Classic} = Team's palette_choice + Use palette; the disk-cache key follows
PASS PATCH palette {restore: state} brings back an earlier state exactly (undo, reopen, worker alignment)
PASS refusals: unknown palette, non-hex colour, unknown group or context, two operations, a bad restore
PASS round trip: Team's export saves the colour (state.json color_shape) and Team's restore brings it back
PASS GET/PATCH /api/v1/sessions/<id>/palette: 200, the state round-trips as JSON; a bad palette 400
PASS test_api_session_palette
```

The other API suites the change touches, same image, on `caf7d633` (exit status of each):

```
test_api_computed_controls exit 0
test_api_render_disk_cache exit 0
test_api_cache exit 0
test_api_analysis_settings exit 0
test_api_schema exit 0
test_api_restore_cards exit 0
test_api_pool exit 0
test_api_pool_warm exit 0
test_api_roundtrip exit 0
test_api_targeted_cohort exit 0
```

`test_api_pool.R` with its new part 4b (a worker aligns the session palette through `restore` and draws what the main
process draws), same image: exit 0, `PASS a worker applies the session palette before drawing`, `PASS test_api_pool`.
The coordinator should still run these on the RTX (the reference environment), and `pilot_team_roundtrip.R` (vi) on
the live ZIP.

### Client

vitest `src/ui/sessionPalette.test.tsx` before the panel existed:

```
 FAIL  src/ui/sessionPalette.test.tsx [ src/ui/sessionPalette.test.tsx ]
Error: Cannot find module './SessionPalette' imported from '<repo>/frontends/nexo/src/ui/sessionPalette.test.tsx'
 Test Files  1 failed (1)
```

`node tests/dual-ui/test_nexo_session_palette.cjs` on `02c2dca0` (API only, old client): rail Palettes opens no session palette.

```
  - waiting for getByRole('dialog', { name: 'Colors & palettes', exact: true }).getByRole('group', { name: 'Choose a palette', exact: true }).getByRole('button').first() to be visible
    "  - waiting for getByRole('dialog', { name: 'Colors & palettes', exact: true }).getByRole('group', { name: 'Choose a palette', exact: true }).getByRole('button').first() to be visible"
  name: 'TimeoutError'
```

Green on `62a0b5b2`:

```
PASS F1 chromium rail-palettes-opens-team-session-palette
PASS F1 chromium group-colour-redraws-the-dashboard-pca-and-the-qc-pca (#2d5f8a -> #AA3300)
PASS F1 chromium one-undo-step-undo-and-redo-send-the-state-back
PASS F1 chromium preset-is-team-use-palette
PASS F1 chromium no-console-errors
PASS F1 webkit rail-palettes-opens-team-session-palette
PASS F1 webkit group-colour-redraws-the-dashboard-pca-and-the-qc-pca (#2d5f8a -> #AA3300)
PASS F1 webkit one-undo-step-undo-and-redo-send-the-state-back
PASS F1 webkit preset-is-team-use-palette
PASS F1 webkit no-console-errors
F1 OK
```

App rule on `62a0b5b2`: `npx vitest run` 129 files / 612 tests passed; `npx tsc --noEmit -p .` clean; mock suites
(Chromium, WebKit): test_nexo_inspector.cjs 46 PASS, test_nexo_card_chrome.cjs 29 PASS, test_nexo_canvas_edit.cjs 34
PASS, test_nexo_session_reopen.cjs 8 PASS, test_nexo_session_palette.cjs 10 PASS. Tests that changed with the
behaviour (not weakened, moved to where the behaviour now is): per-group pickers are exercised on the cellular polar
map instead of a QC card (`computedMock.test.ts`, `test_nexo_inspector.cjs`, `test_nexo_session_reopen.cjs`,
`test_api_computed_controls.R`, `test_api_pool*.R`); the QC "Override sample colors" check now asserts the Data tab
points to the session palette, which redraws the PCA; canvas_edit's rail Palettes check asserts the session palette.

## Simulated pilot (mock), after F1 and F2

`NEXO_LIVE_ENGINES=chromium,webkit node tests/dual-ui/pilot/pilot_figure1.cjs` on this branch: **48 of 48**
(`PILOT ok=48 failed=0`). Step 4b now goes through the rail's Palettes: Team's five palette names listed, "Colour for
Control" → `#aa3300`, the PCA redraws and shows it (114 048 px), 4 of the 7 other cards redraw (3 show the colour: the
dashboard PCA and violin traces named after the group, and the QC 2D PCA). 7c: reconnect, `#0055aa` kept. 11b: the ZIP
carries `state.json` `color_shape` with `Group1::Control`. 12: Steph's PCA shows `#0055aa`; the violin's statistics
marker is read with `textContent`. Step 7 did not reach the thumb tier in the mock (Fit lands at 25 %): the drag of a
thumbnail is covered by `test_nexo_thumb_drag.cjs` and by the live run.

One script fix was needed for WebKit, and it fails the same way on the base tip (`02c2dca0`, 44/48 WebKit: steps 9 and
12): `selectCard` clicked the centre of a far-out card that sat in the board's lower-left corner, where hovering shows
the minimap; the click landed on the minimap and recentred the camera, leaving the card off screen. The script now
clicks a point of the card that is not covered once the pointer is there.

```
PASS 1 chromium Paula: Open the checkpoint from the start screen
PASS 2 chromium Paula: Confirm the study design if asked
PASS 3a chromium Paula: Add "PCA scores · 2D" from the library and wait for it to draw
PASS 3b chromium Paula: Add "Feature distributions" from the library and wait for it to draw
PASS 3c chromium Paula: Add "Differential volcano" from the library and wait for it to draw
PASS 3d chromium Paula: Add "Composition · unfiltered" from the library and wait for it to draw
PASS 3e chromium Paula: Add "Selected-feature distributions"; its card is as tall as Team's plot height
PASS 4 chromium Paula: Change a data input of the PCA (inspector, Data tab)
PASS 4b chromium Paula: Change the Control group's colour in the session palette (rail Palettes)
PASS 4c chromium Paula: Add the structural summary and press "Initiate Structural Analysis" in the Data tab
PASS 4d chromium Paula: Add the heatmap and read the "Significant only" status note
PASS 4e chromium Paula: Add the FLA ratio distributions and add one index in a sel_<category> picker
PASS 5 chromium Paula: Restyle the violin (Appearance: title, Okabe–Ito palette, font size) [friction: 8 clicks (> 6)]
PASS 6 chromium Paula: Violin statistics: Wilcoxon + BH, review, confirm; results table; download CSV [friction: 7 clicks (> 6)]
PASS 7 chromium Paula: Resize and arrange (real drag, Tidy up), undo and redo once [friction: 8 clicks (> 6)]
PASS 7b chromium Paula: Zoom in to 150 % or more with the zoom controls and look at the PCA
PASS 7c chromium Paula: The API loses the session; Paula changes the group colour again in the session palette
PASS 8 chromium Paula: Add an illustration and a text [friction: the page is full (12 items): "Add text" refuses with Team's message; the user must move or resi
PASS 9 chromium Paula: Finish PCA, violin and volcano; open Figure page, paper Letter, layout Figure 1 [friction: 17 clicks (> 6)]
PASS 10 chromium Paula: Export the figure (Export dialog, Nature preset, SVG and PDF) and one "More downloads" file of an unfinished card [friction: 15 clicks (
PASS 11 chromium Paula: Save a checkpoint named pilot-sim-<timestamp>
PASS 11b chromium Paula: Download the saved checkpoint ZIP from the Checkpoints dialog
PASS 12 chromium Steph: Reopen the saved checkpoint in a new context and check what came back [friction: 12 clicks (> 6)]
PASS 13 chromium Steph: Open it on a phone (375×812): view only and legible
PASS 1 webkit Paula: Open the checkpoint from the start screen
PASS 2 webkit Paula: Confirm the study design if asked
PASS 3a webkit Paula: Add "PCA scores · 2D" from the library and wait for it to draw
PASS 3b webkit Paula: Add "Feature distributions" from the library and wait for it to draw
PASS 3c webkit Paula: Add "Differential volcano" from the library and wait for it to draw
PASS 3d webkit Paula: Add "Composition · unfiltered" from the library and wait for it to draw
PASS 3e webkit Paula: Add "Selected-feature distributions"; its card is as tall as Team's plot height
PASS 4 webkit Paula: Change a data input of the PCA (inspector, Data tab)
PASS 4b webkit Paula: Change the Control group's colour in the session palette (rail Palettes)
PASS 4c webkit Paula: Add the structural summary and press "Initiate Structural Analysis" in the Data tab
PASS 4d webkit Paula: Add the heatmap and read the "Significant only" status note
PASS 4e webkit Paula: Add the FLA ratio distributions and add one index in a sel_<category> picker
PASS 5 webkit Paula: Restyle the violin (Appearance: title, Okabe–Ito palette, font size) [friction: 8 clicks (> 6)]
PASS 6 webkit Paula: Violin statistics: Wilcoxon + BH, review, confirm; results table; download CSV [friction: 7 clicks (> 6)]
PASS 7 webkit Paula: Resize and arrange (real drag, Tidy up), undo and redo once [friction: 8 clicks (> 6)]
PASS 7b webkit Paula: Zoom in to 150 % or more with the zoom controls and look at the PCA
PASS 7c webkit Paula: The API loses the session; Paula changes the group colour again in the session palette
PASS 8 webkit Paula: Add an illustration and a text [friction: the page is full (12 items): "Add text" refuses with Team's message; the user must move or resize
PASS 9 webkit Paula: Finish PCA, violin and volcano; open Figure page, paper Letter, layout Figure 1 [friction: 17 clicks (> 6)]
PASS 10 webkit Paula: Export the figure (Export dialog, Nature preset, SVG and PDF) and one "More downloads" file of an unfinished card [friction: 15 clicks (> 
PASS 11 webkit Paula: Save a checkpoint named pilot-sim-<timestamp>
PASS 11b webkit Paula: Download the saved checkpoint ZIP from the Checkpoints dialog
PASS 12 webkit Steph: Reopen the saved checkpoint in a new context and check what came back [friction: 12 clicks (> 6)]
PASS 13 webkit Steph: Open it on a phone (375×812): view only and legible
```
