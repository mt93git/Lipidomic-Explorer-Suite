# Nexo pilot guide (Phase 1)

For Paula (redo Figure 1 in Nexo) and Steph (review it). Nexo is the new canvas of the Lipidomic
Explorer. It uses the same R code as Team for every plot, statistic and export: only the canvas
around them is new. Team stays available the whole pilot; nothing you do in Nexo changes Team.

## Open Nexo

1. Open the lab's Lipidomic Explorer address and replace `/team/` with `/nexo/` (same sign-in).
2. Use a computer. On a phone Nexo opens in view-only mode (you can look, not edit).
3. Click the project button at the top left and choose a checkpoint, or **Upload ZIP** to bring a
   checkpoint you downloaded from Team. Opening takes a few seconds: the server rebuilds the
   prepared data exactly as Team does and checks it against the receipt saved in the checkpoint.

Data and Review (import, QC, study design) still live in Team. Prepare the data there, save a
checkpoint, then open it in Nexo.

## Redo Figure 1

| Step | In Nexo |
|---|---|
| Add plots | Left rail **Plots** opens the library. Click **+** on a plot, or drag it onto the canvas. Plots that need differential expression ask you to confirm the study design first (unit and design type), as Team's Review step does. |
| Arrange | Drag a card by its header; guides snap to neighbours (hold Alt/⌥ to place freely). Drag the corner to resize. Arrow keys move the selection by 10 px; Shift + arrows resize. **Tidy up** lines everything up. |
| Change a plot | Select it: the inspector on the right shows **Data** (the plot's own inputs), **Appearance** (title, axes, fonts, palette, legend, background) and, for violins, **Statistics**. |
| Statistics | Violin → Statistics: choose test, correction and effect size, **Review and confirm…**, check the changes, **Confirm and compute**. Brackets, the results table and **Statistics CSV** follow. |
| Group comparison | Add it from the library; confirm the reference group when asked. |
| Finish | Card ⋯ → **Finish plot** freezes the figure as an image (like Team's frozen figures). **Edit figure** brings it back to live. |
| Illustrations | Rail **Illustrations**: add, then set label and accent colour in the inspector. |
| Tabs | Tabs above the canvas: double-click to rename, ⋯ for duplicate, move and delete. |
| Figure page | **Figure page →** lays finished plots on Letter/A4/custom paper with text and shapes. Unfinished plots show as PENDING. |
| Export | **Export figure ▾**: the selected plot as PNG/SVG/CSV, the figure page as SVG/PDF/print, or **Publication export…** with journal presets (Nature, Cell, Science, EMBO), size in mm, DPI and formats in one ZIP bundle. |

Navigation: scroll to pan, pinch or Ctrl/⌘ + scroll to zoom, **Fit** in the zoom pill shows
everything, the minimap jumps. Ctrl/⌘ + Z / Shift + Z undo and redo. Esc closes menus, then the
inspector, then clears the selection.

## Save

- The pill at the top shows **Unsaved changes · Autosave on**, then **Saving…**, then **Saved · HH:MM**.
  Autosave keeps the latest five versions in the shared pilot workspace.
  Before the pilot the list may show a few **autosave** entries made from the synthetic test checkpoint
  during QA; they are not your data and drop out as your own autosaves arrive.
- Project button → **Save checkpoint…** saves a named checkpoint. **Download ZIP** gives you the file;
  it opens in Team exactly as it opens in Nexo.

## Report an issue

Write one note per issue (an email or a shared document is fine):

```
Title:        short description
What I did:   steps, e.g. "added Volcano, changed FDR to 0.01, clicked Finish plot"
Expected:     what Team does / what you expected
Happened:     what Nexo did (copy any message shown)
Checkpoint:   name, and the time from the save pill
Severity:     P1 blocks Figure 1 · P2 slows me down · P3 cosmetic
Screenshot:   attach if possible (never post patient or study data publicly)
```

## For Steph: review checklist

1. Every plot in the Nexo figure matches the same plot in Team for the same checkpoint (values,
   groups, colours, statistics, p-values).
2. The statistics table and CSV match Team's for the same settings.
3. The exported bundle has the requested size (mm), DPI and formats, with its CSV and R script.
4. The checkpoint saved in Nexo opens in Team with the same cards, tabs and figure page.
5. Pilot closes when Figure 1 is complete in Nexo with no open P1.
