# Violin View card takes Team's plot height (chart audit b05 F5, option A)

Branch `router/20261108-073844-0d8ea8` (based on nexo/phase1 7d87fedb). Red commit first (`red.txt`), then green
(`green.txt`). Mock browser runs only; the R test was not run on the M1 (no `Rscript`); the coordinator runs it on the RTX.

## Where plotHeight comes from

- `R/frontends/api/catalog.R`: `api_catalog_height_inputs` names the module's height input per output; only
  `heatmap_barchart_tab-violin_plot_render = "violin_zoom_pct"`. The catalog entry carries `heightInput` for that
  output only (no field on the others).
- `R/frontends/api/cards.R`: `api_card_plot_height(card)` reads the settled instance value of that input (the value
  the module's renderUI seeded through `api_seed_rendered_inputs`, or the one the user set). Team's formula is never
  recomputed. `POST /cards` (create) returns it as `plotHeight`; `PATCH /cards/<id>` returns `plotHeight` beside
  `inputs`. The client reads it from those two responses (not from the schema). `GET /sessions/<id>` also lists it
  in `cards` because the stored card carries it.

## What the card does (client, `frontends/nexo/src/canvas/plotHeight.ts`, `canvas.ts`, `cards.ts`)

- **Add (click or drop):** height = `plotHeight + CARD_CHROME` (38 px: 36 px header + 1 px borders, `cards.ts`);
  width = the catalog default. The placement uses the tall size, then the existing settle runs in the same undo step;
  camera handling is unchanged (the existing `revealAddedAfterLayout`, which only acts when the added card is out
  of view; not changed or separately asserted here).
- **Plot Height in the Data tab:** the confirmed `violin_zoom_pct` resizes the card (`plotHeight + chrome`) through
  the Inspector's size commands (neighbours settled), folded into the input's undo step. The PNG is requested at the
  plot height (card height minus chrome), so the image natural height equals `violin_zoom_pct`.
- **Hand resize (drag, keyboard, Size field):** the new body height is written back to `violin_zoom_pct`, stepped
  50 and clamped 300-5000 as Team's slider; the card snaps to that value + chrome; size, neighbours and input are one
  undo step; reconcile sends the input to the instance (PATCH). Keyboard resize moves one slider step per key press.
- **Undo/redo:** one step restores size, neighbours and the input; reconcile re-sends the restored input.
- **Reopen:** a card whose stored geometry agrees with `violin_zoom_pct` (`cardHeightFor(value) === height`,
  which includes Team's off-step defaults such as 2340 and values above the canvas cap) is left alone. One that
  disagrees keeps its stored geometry (what the user last placed and saw, and what Team's canvas restores) and writes
  `plotHeightForCard(height)` back to the input, without an undo step; reconcile PATCHes it.
- **Finish / Figure page / Export:** unchanged code paths; they use the card's node size and the image drawn at the
  card's body size, which is now the plot height.

## Limits

- Team's canvas limits a card to 4000 px tall (`canvas_state.R`, `state/document.ts`). A Plot Height above 3962
  leaves the card at 4000 and the plot drawn at 3962 (the render API caps at 4000 too). Not resolved here.
- The native range control snaps the off-step default 2340 to 2350 when shown; the printed value and the input stay
  2340 until the user moves the slider (Team's slider steps from 300 by 50 as well).
- Style paste / apply-to-tab size changes do not write the input back (only drag, keyboard and the Size field do).
- No browser test for the reopen rule (vitest covers `reopenPlotHeight`).

## Files

- `red.txt`, `green.txt`: literal outputs (paths as `<repo>`).
- `chromium-1440-added.png`: violin card just added at 29 % (2378 px tall = 2340 + 38), neighbour below.
- `chromium-1440-slider-3000.png`: after Plot Height 3000: card 3038 tall, the neighbour pushed aside by the settle.
