# Test changes on ux5/C (port of Ana Pau's Mods-anapau work)

Each entry gives the test, what changed, and why. "Before" means 71dc349.

## 1. `tests/dual-ui/test_team_group_comparison_rotated_export.cjs` (changed)

- **Before:** `assert(bounds.filter(x=>x.text.includes('SC-SteadyState')).length===2)`. In the rotated (swapped-axes)
  export, the condition name had to appear twice as a y-axis tick label, once per panel.
- **Now:** the test asserts that the legend is still the horizontal top bar, that all three condition names are in
  it, and that it sits above the panels. It also checks that the downloaded SVG names every condition in a text
  element.
- **Why:** Ana Pau's group-comparison layout (f56ab66), ported on purpose, moves the condition names out of the axis
  and into a top legend bar, and hides the category tick labels. The old assertion checked the old layout. The new
  one checks the same thing, that the names are readable in the rotated export, in the place where the layout now
  puts them. Nothing else in the test changed: geometry, label bounds, the SVG/PDF downloads and the restore checks
  are as before.

## 2. `tests/dual-ui/test_team_group_comparison_vertical_export.cjs` (changed)

- **Before:** the test applied a saved right-side legend position (`legend.x` 1.02, then 1.25, `xanchor` left). It
  required that position to be kept (`legend.x === x`), required the right margin to grow for it
  (`margin > 35`), and required the export to keep `legend.x === 1.25`.
- **Now:** for those saved positions the test requires that they are ignored. That means `legend.x === 0`, `xanchor`
  left, horizontal orientation, all labels inside the figure, and the right margin not growing (`<= 60`). The export
  must keep that anchor (`legendX === 0`). The other checks are unchanged: no relayout loop, fewer than 20
  relayouts, one shared value-axis title, labels not clipped, overlapping and failed export captures restoring the
  exact margins and legend, and the real JPG download.
- **Why:** with the horizontal top bar, honouring an old position to the right of the plot made the fitter widen the
  right margin to about 307 of 604 px over 23 relayouts, over the limit of 20. The panels were squeezed to about a
  third of the card. The coordinator decided that such positions must be ignored under the top bar.
  `fitLegend` in `www/team/js/group_comparison.js` now resets them to the top-left anchor in one relayout. The old
  expectations ("keep x, grow the margin") are the opposite of that decision, so they were inverted and nothing else
  was changed.

## 3. `tests/dual-ui/test_team_group_comparison_old_legend_position.cjs` (new)

This test covers an old saved figure with a right-side legend: `{legend.x:1.02, xanchor:left, y:1, yanchor:top}`,
which is the previous default layout, and `{legend.x:1.25}`. A stub Canvas replays the saved state after every draw,
the same way a restored checkpoint is replayed. The test requires that the old position is ignored (top-left
horizontal bar), that the bar sits above the panels and inside the figure, that the panels keep their width
(`margin.r <= 60`, plot width at least 70% of the card), and that the fitter settles within the limit of 20 relayouts,
again after a redraw that replays the saved state. Without the `fitLegend` fix the test fails: it times out waiting
for the legend to reset.

## 4. `tests/dual-ui/test_team_visual_system.cjs` (changed in an earlier commit, 17a3fda)

This test requires the mascot freeze files to be byte-identical to d814775. The one approved change is Ana Pau's
`formatAnswer` in `www/team/js/companion_assistant.js` (0bced6c). The guard now takes out exactly those lines (the
new function and its call in `addMessage`) and still requires the rest of that file, and every other frozen file, to
be byte-identical.

## 5. New tests from the knowledge-base port (earlier commits)

`tests/dual-ui/test_companion_kb.R` (her test, extended) and `tests/dual-ui/test_team_companion_format_answer_geometry.cjs`
are new tests. No existing assertion was changed for them.

## 6. Review fix M3: a legend position the user saved is kept (ux5/fix)

Changes 2 and 3 above reset every `legend.x > 1` under the top bar. That also overrode positions the user saved in
the plot editor. Now only the previous automatic anchor (`legend.x` 1.02, `xanchor` left, the pre-top-bar default
layout) is reset; any other saved position is kept and only the margins are fitted to it. A horizontal bar placed
past the plot reserves room for its widest item in one step, so it settles in about 3 relayouts instead of creeping.

- `test_team_group_comparison_vertical_export.cjs`: for 1.02 the old expectations (reset to x 0, margin not grown)
  stay; for 1.25 the pre-573ca66 expectations are back (x kept, margin grows, export keeps `legend.x === 1.25`).
  The relayout limit (fewer than 20, no loop) is unchanged.
- `test_team_group_comparison_old_legend_position.cjs`: 1.02 is still reset with the panels at full width; 1.25 and
  the editor's "Bottom Right" position are now required to stay where the user put them, inside the figure, within
  the same relayout limit, also after a redraw.

## 7. Round 2: group colours locked across panels (ux5/fix)

The shared top legend is the only colour key (tick labels hidden), so a group now has one colour in every
panel. A colour edit in one panel is stored once (in the first class's style) and applies to that group
everywhere; Reset colors resets the shared colours.

- `test_team_group_comparison_browser.cjs`: a one-trace restyle used to be expected in `panelStyles.PE.colors.A`
  only. It is now expected once in `panelStyles` and on every A trace (all panels and the legend).
- `test_team_group_comparison_canvas_browser.cjs`: after Reset colors the Viridis colour of A may now be the locked
  hex `#440154` as well as `rgb(68,1,84)`; same colour. (This test still times out later, at line 18, exactly as it
  does on 6040975.)
- New `test_team_group_comparison_color_lock.cjs`.

## 8. Round 3: truthful grounded-mode wording in the frozen chat client (ux5/fix2)

- `test_team_visual_system.cjs`: the freeze guard now also strips the approved guidance-wording getters
  (`kbGrounded`, `guideLabel()`, `welcomeText()`) in `companion_assistant.js` and puts the three call sites back to the
  eed4451 expressions before the byte comparison. The guard only applies if the getters' non-grounded branches return
  the eed4451 OpenAI and local texts exactly; any other change still fails.
- `test_team_companion_kb_browser.cjs`: rewritten. The zorblat fixture is replaced by a fed library with passages on
  cardiolipin and PC synthesis, and the real app runs four times: (a) grounded: "· KNOWLEDGE BASE" header and the
  on-server welcome; "what is cardiolipin" and "how is PC synthesized" reach R and come back as knowledge-base answers
  citing `lipid_notes.md` (italic source line); "how do I add a figure to the canvas" stays with the local guide; a
  second browser context sending `X-Forwarded-For` is refused the local session (item 12); (b) outside AI configured
  (fake key, never used), empty library: "· AI GUIDE" and the unchanged OpenAI disclosure; (c) both: OpenAI wording
  stays; (d) grounded off: all three questions answered locally, nothing sent; (e) then the library is fed while the
  page is idle and the header flips to "· KNOWLEDGE BASE" on the recheck timer, and the question reaches the KB (item 14).
- New `test_team_companion_guidance_wording_pixels.cjs`: pixel comparison against eed4451 at 1440 px, closed mascot and
  opened chat, both states.

## 9. Round 3 additions (ux5/fix2): items 12-18

- `test_team_workspace_auth.R` (item 12): the local-session mock now carries `session$request` and `sendModal`. A
  direct loopback request (127.0.0.1, localhost or [::1], any port) is accepted; requests with X-Forwarded-For,
  X-Forwarded-Host, Forwarded or X-Real-IP, a public Host, a lookalike Host, a remote peer, no Host or no request are
  refused: never `authenticated=TRUE`, science never starts, one "Local session only" dialog.
- `test_companion_kb.R` (item 13): the broken-index loop also covers a zero-byte and a missing `chunks.jsonl` while
  `sources.json` still lists sources; the mock AI is never called. Each case resets the log-once memory (both cases
  log the same line). (Item 14) a new testServer block: empty library, no change for two timer ticks (no new
  assistant_state), library fed, one tick later exactly one new assistant_state with `ai_enabled` and `kb_grounded`.
- New `test_team_group_comparison_palette_lock.cjs` (items 15, 16). Rule chosen for 15: a palette recolours every
  group without a manual override and keeps manual overrides, in the violins and the legend alike (this keeps the
  existing `test_team_group_comparison_canvas_browser.cjs` expectation that an edited #123456 survives Viridis).
  Palette colours live in `s.paletteColors` (not persisted; after a reload the replayed palette is re-adopted).
  Item 16: when two displayed groups share a colour, the x axes use production's ticks and "Condition" title.
- `test_team_visual_system.cjs` (item 18): the freeze guard also strips the grounded-yield predicate and condition in
  `companion_guidance.js` and the `kbGrounded` option passed by `companion_assistant.js`.
- `test_team_companion_guidance_wording_pixels.cjs`: also loads the real local guide (current vs eed4451) and compares
  the opened chat after a local answer, in both states.

## 10. Round 4 (ux5/fix2): items 19-24

- `test_companion_kb.R`: (19) KB + outside AI: `kb_grounded` and `kb_terms` are sent, "what is cardiolipin" gets a
  KB answer with its source, the AI mock is never called; AI without a KB sends neither. (20) `companion_kb_terms`
  holds library words (cardiolipin, pc, synthesized) and leaves out app vocabulary (palette, canvas, select,
  detection, slider, plot, pca). (23) the broken-index loop also covers an index cut between complete records
  (fewer passages than the manifest's `n_chunks`) and a whitespace-only passage. (24) "Step 3 of 7 — Quality" and
  "Step 2 of 7: Review" segments are dropped from Team citations, also from a fed file.
- `test_team_workspace_auth.R`: the local-session opt-in logs one startup warning (never behind a proxy).
- `test_team_companion_kb_browser.cjs`: (20) in grounded mode "how to change the palette", "how to select a plot",
  "what is the minimum detection slider" and "how do I add a figure to the canvas" stay local; "what is cardiolipin",
  "where is cardiolipin synthesized", "how is PC synthesized" and "can I study PC" go to the KB. (19) state (c),
  KB + AI, now expects the knowledge-base header and welcome, a KB answer, and app help staying local.
- `test_team_group_comparison_palette_lock.cjs`: (21) Lab, save, restore in a fresh page, Viridis gives Viridis and
  the restored palette never becomes manual overrides; (22) a restored figure with `showlegend=false` shows the
  condition labels (also in the SVG export) and hides them again when the legend is shown.
- `test_team_visual_system.cjs`: the guard follows the renamed predicate (`namesLibraryTerm`) and the `kbTerms` option.

# Test changes (ux4/figA)

FigA moves the Figure page into the Draft's canvas cell (`canvas_preview.js` `embedInShell`) on the Wave 4 shell. The rail, the right column and the companion's home stay where the Draft has them. Hand mode (`pointer_mode.js`) and the inspector toggle (`inspector_toggle.js`) now work on that page as they do on the Draft. One existing assertion described the old behaviour, where the Figure page did not offer the pointer-mode pair. It changed because the Figure page legitimately moved. No assertion was removed or loosened without a stronger replacement.

## tests/dual-ui/test_team_pointer_mode.cjs

| Before | After | Why |
|---|---|---|
| `pair hidden on the figure page` (`.tc-figure-mode` hid `.tc-pointer-mode`) | `pair shown on the figure page`, and `pair keeps its place on the figure page` (same bounding box as in the Draft) | The Figure page is now in the Draft's grid cell, with the same rail. The task asks for hand mode there too, so the pair is offered on both pages. The new assertion is stricter: the pair must be visible and must not move. |
| `H / Space / V ignored on the Figure page` | Same assertions, now labelled `... on a Figure page without a desk` | This fixture's `#tc-preview-panel` has no `.tc-preview-pages` desk. The rule is now "keys belong to the surface on screen, and there is none here", not "the Figure page never pans". The assertions themselves are unchanged. The positive case (H, V, Space and the buttons on a real Figure desk) is in the new test below. |

## New: tests/dual-ui/test_team_figure_hand_mode.cjs

This test uses the real `canvas.R` markup with the Team workspace assets as wired (the same harness as `test_team_figure_shell.cjs`), at 1440×900.

- **Hand mode on the Figure page:**
  - The pair is the same node, in the same rail and at the same place.
  - H, V, the Select/Move buttons and a held Space all switch modes.
  - A drag that starts on a page object pans the desk 1:1. The object never receives a pointer, mouse, click, double-click or focus event. It does not move, resize, deselect or write the figure document. The same holds when the drag starts on its resize handle.
  - A blank click in Move keeps the current selection.
  - A double click in Move does not open text editing.
  - The middle button pans in Select. The wheel still scrolls in Move.
  - Modifier combinations are not shortcuts. Space on a button presses the button. Typing in a column field keeps its letters.
  - A Select drag still moves the object.
  - One mode applies across Draft and Figure. Each page's status line gets its own wording.
- **Inspector toggle on the Figure page:**
  - The rail button and I hide and show the Figure column (Object / Plots / Page).
  - The canvas cell, the companion home and the column rects match the Draft in both states.
  - The column is inert while hidden, and the extension decision is the same on both pages.
  - The desk still fits after hiding the column.
  - I in a field types the letter.
  - With the column hidden, a double click on a text object shows the column and focuses its text field, as Edit on a card does on the Draft. This happens in Select only, never in Move.

## tests/dual-ui/test_team_inspector_toggle.cjs (added case)

`edit in Move`: in Move, a pointer click on a card's Edit button is a pan that never reaches the card, so it no longer shows a hidden inspector column. A keyboard Enter on Edit still does; the existing `edit:` case covers that.

## Review round 1 (of 4170260)

- `test_team_figure_hand_mode.cjs` (finding 8): the check for typing in the column used to skip itself when no text field was visible. It now always selects the text object and types `H`, `V` and spaces into its visible Text field while in Move. It asserts:
  - the mode stays as it was;
  - the field value matches what was typed;
  - the saved document holds that text.

  Later pan checks first re-centre the camera on a snapshot taken after the edit, because the edit re-renders the page. No assertion was removed. The integrated harness now lives in `fixture_team_figure_page.cjs`.
- New `test_team_figure_review.cjs` covers findings 1–7 and 9:
  - **Undo/Redo (1):** a real `TeamPlotEditor` is mounted in the Draft with its Undo enabled. The Figure toolbar's Undo and Redo revert and restore the figure document, and never press the Draft editor's Undo.
  - **Add text (2):** works with the column hidden. The new object's Text field takes focus, typing with spaces replaces the placeholder, the text is saved, and no extra object is added.
  - **Page setup and Plots (3):** "⋯ → Page setup" opens the Page panel and focuses Layout. The unfinished-plots chip opens the Plots panel. Both panels are checked as visible and not inert, not just as an event that fired.
  - **Shape entry points (4):** "Choose a shape", rail "Text & shapes" and `TeamCanvasCompose.openShapes` all open the visible "Add shape" menu with focus inside it. Cancelling Publication layout leaves focus on a visible toolbar control.
  - **Double click (5):** double-clicking text that is already selected, with the Page tab showing and the column hidden, opens Object with the Text field focused.
  - **Arrow keys (6):** in Move, and with Space held, arrow keys do not move a focused page object. In Select, arrows still nudge it (control check).
  - **Header (7):** at 901, 1024 and 1200 px, with the library closed and the inspector shown, the toolbar does not overflow, is not clipped, and covers neither the page-strip title nor the hint line.
  - **Drag and re-render (9):** after a Select drag ends, the view stays where it was. If the page re-renders during a drag (canvas invalidated), releasing the mouse still saves the move. Both checks fail against the previous code.
- `test_team_figure_toolbar.cjs` is unchanged. Its standalone fixture has no figure column, so it can only record the `team-figure-open-tab` request. `test_team_figure_review.cjs` now checks that the Page and Plots panels actually open.
