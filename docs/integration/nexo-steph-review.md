# Nexo phase 1 — Steph's review of Paula's Figure 1 (simulated pilot)

Reviewer: "Steph", independent reviewer (senior lipidomics scientist and PI who signs off figures and knows Team's
canvas), played by Claude Fable 5.1 from the evidence only. Date: 2026-11-08. Branch `router/20261108-183548-c73d1f`,
based on `nexo/phase1` at `71ffa2d6`. Read-only: this file is the only change; the app was not run.

What I read: `docs/integration/nexo-pilot-simulation.md` (all of it), `docs/integration/nexo-pilot-guide.md` (my own
checklist, section "For Steph"), the live evidence under `docs/integration/nexo-phase1-evidence/h9/pilot-simulation/live/`
(`chromium/` and `webkit/`: 24 step PNGs each, `pilot-log.json`, `pilot-output.txt`, `team-roundtrip.txt`), the chart
audits `docs/integration/chart-audit/b01-dashboard.md`, `b02-qc-a.md`, `b04-composition.md`, `b05-heatmaps.md`,
`b06-differential.md`, `b07-structure.md`, `b09-fla.md` with their reference images, `docs/integration/chart-audit/astra-adversarial-review.md`,
`docs/integration/nexo-phase1-evidence/h9/session-palette/README.md`, and the Figure 1 template in
`frontends/nexo/src/figure/layout.ts` (only to confirm that the PENDING panels on the page are the template's, not a failure).

Paths below are relative to `docs/integration/` unless they start with `frontends/` or `tests/`. "live/" means
`nexo-phase1-evidence/h9/pilot-simulation/live/`. Where I say "both engines" the WebKit capture shows the same thing;
the two logs differ only in timings, instance ids and checkpoint names.

Severity: **P1** would stop me signing off; **P2** must be fixed before I rely on it; **P3** polish.

A note on the "Team" reference images: the chart-audit files named `*-2-matches-team.png` (for example
`chart-audit/b01-dashboard/violin-2-matches-team.png`) are Nexo's card at the audit's check 2; the reports say the traces
or bytes equal the module's own render, which is Team's R code. No capture of Team's own browser canvas showing the same
checkpoint is in the evidence. Where a plot is a PNG from Team's module (PCA, volcano, composition, heatmap views,
structural, FLA) the picture is Team's; where Nexo draws it (the dashboard violin, the statistics brackets, the page) it is Nexo's.

## 1. Verdict

**Yes, with conditions.** The evidence shows that the whole job can be done in Nexo without opening Team's canvas: on
the synthetic checkpoint, in Chromium and WebKit, "Paula" added eight plot types, changed module inputs, set the session
palette, ran and documented a Wilcoxon test, finished three plots, laid out the Figure 1 page, exported a publication
bundle, saved a checkpoint, and Team read it back with every card validated and the session colour restored
(`live/chromium/pilot-output.txt`, `live/webkit/pilot-output.txt`, `live/*/team-roundtrip.txt`: 24/24 and all PASS in
both engines). What the evidence does not show is a Figure 1 I could sign off. The page holds one data panel (B, the
PCA), a schematic vial, and eight PENDING template slots (`live/chromium/chromium-paula-09-finish-pca-violin-and-volcano-open-figur.png`);
in panel B both groups are blue because Paula's last palette choice was `#0055aa`
(`live/chromium/chromium-paula-7c-the-api-loses-the-session-paula-changes-.png`,
`live/chromium/chromium-paula-08-add-an-illustration-and-a-text.png`); the finished violin and volcano are not on the
page and the page does not say so; the violin never names the lipid it shows; and group colours are not one system
across panels (the PCA and FLA cards follow the session palette, the violin follows its own Appearance palette). No
check compares a Nexo panel with Team's render of the same checkpoint side by side, and no exported PDF or SVG is in
the evidence, so items 1–3 of my checklist in `nexo-pilot-guide.md` are not yet verified. Nexo can replace Team's canvas
for this work once the P1 and P2 items below are closed and the real Paula repeats steps 9–12 on her own checkpoint.
The phase should close as "the Figure 1 workflow is complete end to end on synthetic data", not as "Figure 1 is complete".

## 2. Step by step

Seconds and clicks are Chromium / WebKit from `live/*/pilot-log.json`. "Capture" is the step's PNG in `live/chromium/`
(the WebKit twin has the same name with the `webkit-` prefix).

| Step | Persona | What I see in the capture | Does it match Team? | Concerns | Severity |
|---|---|---|---|---|---|
| 1 | Paula | Empty canvas with "This canvas is empty. Add a plot from the library…", the Plot library saying "Loading plots…", and the top bar still reading "Checkpoints ▾" (the checkpoint name appears from step 2). 2.4 / 1.6 s, 1 click. | n/a: the synthetic checkpoint has no cards on its canvas (`chart-audit/b01-dashboard.md`, "Data tab of every dashboard card"). | Nothing scientific. Polish: a placeholder label where the name belongs while loading. | P3 |
| 2 | Paula | The library after the confirmation: "Differential volcano" and "Functional ratio volcano" marked Ready. The design dialog itself is not in the capture; the log says Experimental unit = Animal, Sample relationship = independent, 5 clicks, 1.1 / 0.6 s. | Team's Review step asks the same (`nexo-pilot-guide.md`, "Add plots"). | Scientific: this one choice gates every differential plot, the heatmap's "Significant only" and the violin test. It is made by whoever opens the checkpoint and is not saved: step 12 asks me, the reviewer, again. For a real study the design must be fixed in Team's Review and travel in the checkpoint. Evidence: I cannot see the dialog's wording. | P2 |
| 3a | Paula | "PCA scores · 2D": Team's "2D PCA Score Plot / Single Replicates (Individual Samples)", PC1 70.7 %, PC2 3.8 %, Control red, Treatment blue, every point labelled with its group name, legend titled "Group1". Drawn 2.0 / 1.6 s after the click. Data tab: "Group colours and shapes follow the session palette", BQC samples 0 of 24, then a block headed "Nexo only: Team's canvas shows its default for these" with six QC sub-tab buttons and Grouping Mode. | Same PNG as Team's module: `chart-audit/b02-qc-a.md`, round 2 check 2 (bytes identical to the module's render). There is no capture of Team's canvas for this plot; `chart-audit/b01-dashboard/pca-2-matches-team.png` is the dashboard PCA, a different plot. | Team output: per-point group labels repeat the legend and will be illegible at page size; a software title. Workflow: the sub-tab buttons and Grouping Mode read as inputs of this plot. | P3 |
| 3b | Paula | "Feature distributions": violin + box + dots, Control light blue, Treatment pink, y "log10 prepared abundance", x "Sample group", footnote "Dots: prepared sample values. Tails: smoothed estimates." No title and no lipid name anywhere on the plot; the inspector is still "Loading controls…". 1.0 / 1.0 s. | Matches `chart-audit/b01-dashboard/violin-2-matches-team.png` (same traces, colours, footnote; `b01-dashboard.md` check 2). | Scientific: the panel never says which lipid it shows; the lipid is a Data-tab control only ("Choose a lipid", `b01-dashboard.md` check 4). Its colours are not the PCA's group colours (see 4b). | P2 |
| 3c | Paula | "Differential volcano": title "Volcano Plot (Treatment_T1+Treatment_T2+Treatment_T3 vs Con" cut at the card edge, legend Down / NS / Up, labelled lipids colliding on the left cluster, dashed thresholds without values, NS points as a grey band near 0. 0.8 / 0.8 s. | Same PNG as Team: `chart-audit/b06-differential.md` check 2 records the cut title at 620 px and that it fits at 780 px (`chart-audit/b06-differential/volcanoPlot-3-larger.png`). | Team output: cut title, label collisions, comparison written as concatenated sample groups. Paula should widen the card before finishing or ask for a shorter comparison label. | P3 |
| 3d | Paula | "Composition · unfiltered": stacked bars per group × time point, 9 classes, error bars, y "Mean Summed Intensity" with 2000000-style ticks, title "Unfiltered Composition (Absolute (intensity))", x labels "Control_Synthetic plasma_T1" and so on. 0.7 / 0.9 s. | Same PNG as Team: `chart-audit/b04-composition.md` check 2. | Team output: tick format, nested parentheses, raw sample-group names. A QC view, not a figure panel. | P3 |
| 3e | Paula | The canvas jumps to 23 % with a "Back to overview" button; the new card is a 620 × 3038 px strip, unreadable at that zoom (too small to judge in the Chromium capture). The WebKit capture is at 100 % and shows the top facets, PC(16:0/16:0) onward, readable, with the y title "Log2 Abundance Intensity" repeated per facet. Log: Plot Height 3000 → card 3038, image 620 × 3000, **36.3 / 37.6 s** click to drawn; "Saved · 06:27 PM" appears meanwhile. | Team's own plot height (`chart-audit/b05-heatmaps.md` F5, option A; `chart-audit/b05-heatmaps/violin_plot_render-F5-option-A-tall-card.png`). | Workflow: the slowest card by about twenty times (Server-Timing in the log: module flush 23 s + input seeding 12.5 s); the capture does not show what the card displayed while waiting. The card then dominates Fit (step 7 lands at 14 %). Team output: ~60 facets with repeated axis titles is a browsing view, not a panel. | P2 |
| 4 | Paula | The PCA focused at 93 %, the inspector saying "Updating…", then the same plot: PC1 70.7 %, PC2 3.8 %, identical points. Log: "Correlation Method: Pearson → Spearman; card redrew". 3.3 / 3.5 s, 4 clicks. | Team's drawer shows the whole QC module UI too (`chart-audit/b02-qc-a.md`, coordinator correction). | Workflow: the changed input belongs to the Sample Correlation view, not to the PCA; the plot cannot change and nothing says so. With 48 QC controls on a PCA copy (`b02-qc-a.md` check 4), "which input matters" is guesswork. | P2 |
| 4b | Paula | Rail tooltip "Palettes"; the PCA redrawn with Control in `#aa3300` (brown-red) and Treatment blue; toast "Session colours applied to every plot · Undo". Log: palettes Default, Tableau Classic, Ocean & Coral, Earth & Garden, Colorblind Friendly; "other cards redrawn 0/4, showing #aa3300: 1". 4.2 / 4.1 s, 3 clicks. | Team's data hub palette (`nexo-phase1-evidence/h9/session-palette/README.md`, F1); the violin keeps Team's dashboard pastels (`chart-audit/b01-dashboard/violin-2-matches-team.png`). | Scientific: group colours are not one system. The violin from 3b ignored the change, so Control is brown on the PCA and light blue on the violin. Wording: the toast says "every plot" while the log counts one. | P2 |
| 4c | Paula | "Structural remodeling shifts": "Key Structural Remodeling Shifts — Comparison vs Reference \| FDR P < 0.05", a dot plot with a Difference colour scale and an abs(Diff) size legend, 25 rows (five classes × five features) all starred. Data tab: Selected Lipid Classes, Cohort Dimension "Group 1 (Control, Treatment)", Reference Control, Comparison Treatment, Sample Subset, "Subject / Pairing Variable: PatientNumber", Apply Custom Colors, Initiate Structural Analysis, and "Show Statistic Detail" three times (WebKit capture; two visible in Chromium). Placeholder 1.9 / 2.0 s; the analysis after Initiate (image 0.013 → 0.152 bytes per pixel). 5.0 / 5.1 s, 5 clicks. | Same PNG as Team: `chart-audit/b07-structure.md` check 2; the Initiate replay on reopen is the fix for its F3. | Team output: the plot states an FDR but not the test, and a pairing variable is offered under a design confirmed as independent; I would ask which test ran and whether pairing was used. Workflow: three identical buttons with no hint which plot each belongs to. | P2 |
| 4d | Paula | "Abundance heatmap": two columns, Control (n=12) and Treatment (n=12), "Mean z-score" −1…1, about 60 rows, every cell saturated red or blue. Data tab: Most variable 30, Visible sample groups 2 of 2, Visible lipids "30 of 76", Show = Significant only, note "Showing 60 significant lipids: mean of (Treatment_T1, Treatment_T2, Treatment_T3) vs mean of (Control_T1, Control_T2, Control_T3); Benjamini-Hochberg adjusted p ≤ 0.05 and \|log2FC\|…". 1.1 / 0.9 s. | `chart-audit/b01-dashboard/heat-2-matches-team.png` (30 rows, same scale); the note is Team's wording (`nexo-pilot-simulation.md`, Live). | Scientific: "30 of 76" and "Showing 60" on the same panel; which set is drawn? A two-column mean z-score is ±1 by construction, so the map shows direction only (Team output). | P2 |
| 4e | Paula | "Functional ratio distributions": three facets PE/PC_Index, (LPC+LPE)/PL_Index, Energy_Load_Index, Control brown (the session colour) vs Treatment blue, stars above each pair, y "Log2FC", rotated x labels. Data tab: Indices to Plot by category, Structural: PE/PC_Index ticked. 3.7 / 3.7 s, 5 clicks. | Same PNG as Team: `chart-audit/b09-fla.md` check 2; the index picker is the fix for its check 4 gap. | Team output: "Log2FC" as the y label of per-sample index values needs a definition; stars without the test named on the plot. Good: this card follows the session palette. | P3 |
| 5 | Paula | The violin titled "Figure 1b · lipid distribution", Okabe–Ito orange and sky blue, larger fonts. Appearance tab: journal chips (Science 1-col 55 disabled with "Below Team's 240 px card minimum (63 mm). Set 55 mm in Export instead."), X / Y in px, Label, Background, Undo / Redo / Reset presentation, Change orientation, presets Team original / Nexo / Publication, palettes Gelato Days, Lab, Okabe–Ito (WebKit also shows Nature (NPG), Viridis). 3.1 / 3.1 s, 8 clicks. | Nexo's editor; Team's own editor keeps an Apply palette button (`nexo-pilot-simulation.md`, round 1 findings). | Scientific: a third colour pair for the same two groups (orange / sky blue here, brown / blue on the PCA). The Okabe–Ito pair is 2.25:1 and 2.31:1 on white (`chart-audit/astra-adversarial-review.md`, design row D6). | P2 |
| 6 | Paula | Bracket "*** (q = 7.4e-7)"; "n = 12 samples" under each group, the Treatment label sitting on the violin's lower tail. Statistics tab: P value shown Adjusted, Label "Stars and exact value", Group size labels Samples, Annotation font size 12, Bracket spacing "0,08" in Chromium and "0.08" in WebKit, comparison "Treatment vs Control" ticked, a results table cut at the inspector's edge (only Comparison and Group sizes visible), the methods text (Wilcoxon rank-sum two-sided, exact when n < 50, BH across m = 1, Cliff's delta, "Confirmed independent design; every tested sample has a distinct participant ID", PatientNumber, computed 2026-11-08T23:28:12Z), a Statistics CSV button. Log row: p 7.4e-7, q 7.4e-7, ***, effect −1; CSV of 2 lines. 2.1 / 2.1 s, 7 clicks. | Nexo's statistics layer. Team's result for the same settings is not in the evidence, and `chart-audit/b01-dashboard.md` check 6 says Team refuses violin statistics on synthetic samples. | Scientific: internally consistent (7.4e-7 is the smallest two-sided exact p for 12 vs 12, so the groups do not overlap; Cliff's delta −1 agrees; with m = 1, q = p). Whether it equals Team's table is unverified, and b01's "blocked on synthetic samples" contradicts this run. Polish: the table needs a scroll to show p, q and effect; the n label overlaps the tail; a comma decimal in one engine. | P2 |
| 7 | Paula | Overview at 14 %: eight thumbnails in one row after Tidy up, the 3038 px card as a tall strip, the Composition thumbnail selected. Log: violin 575 × 668 → 665 × 728, the composition dragged by its body, Tidy up / ⌘Z / Redo round-tripped. 8.6 / 8.6 s, 8 clicks. | Nexo's thumbnail tier below 20 % (`nexo-phase1-evidence/h9/session-palette/README.md`, F2); no Team comparison in the evidence. | Workflow: at 14 % nothing is readable, so arranging is blind; the tall card forces this zoom. | P3 |
| 7b | Paula | The capture shows the overview at 18 % with a "Zoom in · +" tooltip, not the 181 % view the log describes (PCA image 1240 × 1440 for 618 × 682 CSS px, dpr 2 asked). 3.3 / 3.3 s, 6 clicks. | — | I cannot judge sharpness from the capture; the log's numbers are the only evidence. | P3 |
| 7c | Paula | After the deliberate session loss: toasts "Reconnecting to the analysis…" then "Analysis reconnected. Your plots were restored."; Control now `#0055aa` (dark blue) on the FLA card and the PCA; violin title, FLA pick and structural drawing kept. Console: one "409 (Conflict)" from the deleted session. 15.9 / 15.8 s, 5 clicks. | — | Recovery is good. Scientific: `#0055aa` next to Treatment's blue makes both groups blue on every session-coloured card from here on (legend in `chromium-paula-08-…png`). Nexo did not warn. Documentation: `nexo-pilot-simulation.md` (Live) says "0 console errors" for both engines; the logs record this 409. | P1 for the figure (Paula's choice); P3 for Nexo (no warning) |
| 8 | Paula | A "Serum / plasma vial" illustration card with label and accent colour in the inspector; the text "Figure 1 · synthetic cohort" goes to the Figure page (log). 0.6 / 0.4 s, 8 clicks. | Team's Figure 1 template hides free text as well (`nexo-pilot-simulation.md`, round 1). | Fine. The text is hidden by the layout in step 9, which now says so. | P3 |
| 9 | Paula | Figure page, Letter portrait, layout "Figure 1": header "FIGURE 1 / DRAFT — PENDING PANELS"; A the vial schematic; B the PCA with both groups blue and 24 point labels; C LPA, LPC, LPI, CL as "PENDING · Log2FC method pending"; D "AA (Sn2) target", "PE 18:0_20:4", "PC 16:0_20:4", "PC 18:0_20:4" as PENDING; footer "DRAFT · A: schematic, not to scale; review workflow. C: class Log2FC and model pending. D: targets, scale and sn-position evidence pending." Right panel: "3 of 8 plots finished", "1 text or shape hidden by this layout. Free shows it.", every plot ticked. The finished violin and volcano are not on the page. 7.2 / 7.2 s, 15 clicks. | The template is Nexo's (`frontends/nexo/src/figure/layout.ts`, lines 17–18); Team has the same Figure 1 template trap for panel B (`nexo-pilot-simulation.md`, round 1 finding). | P1 for the close statement, not a Nexo defect: eight of ten panels are placeholders by design because the methods are pending. P2 (Nexo): two finished plots have no slot in this layout and vanish without a notice (the notice counts texts and shapes only). P3: caption "B / PCA · PCA scores · 2D" says PCA twice. | P1 / P2 |
| 10 | Paula | The Composition card's Export tab ("More downloads from this analysis: CSV, PDF", "This figure is a raster image; SVG is not available.", Download PNG / PDF, More export options…) and the toast for the CSV. The Export dialog itself is not captured. Log: preset "Nature / Nature Research (89 / 120 / 180 mm)", bundle `Figure_PCA_2D_Score_Plot_Publication_Bundle_20261108_1828.zip` with `Figure_PCA_2D_Score_Plot.pdf`, `.svg`, `figure_provenance.json`; CSV 20 439 B. 12.0 / 12.2 s, 15 clicks. | Team's own export code (`nexo-phase1.md`, H6a: members and provenance equal Team's). | P2: the bundle is one panel (the PCA), not the composed page; the page's own Export SVG / PDF (Page tab, visible in the step 12 capture) was not exercised; no PDF or SVG is in the evidence, so size, DPI and legibility are unverified (checklist item 3). The CSV and R script members were deliberately unticked (`tests/dual-ui/pilot/pilot_figure1.cjs`, step 10), so item 3's "CSV and R script" is untested. | P2 |
| 11 | Paula | Toast "Saved checkpoint pilot-sim-20261108T232900-chromium. You are now working on it; the previous checkpoint stays as it was."; the top bar shows the new name. 1.4 / 1.4 s, 4 clicks. | — | Clear and honest. | — |
| 11b | Paula | The same view as step 11 (the Checkpoints dialog is not captured). Log: ZIP 144 198 B (WebKit 134 513 B) with `state.json`, `shared-state-v1.json`, `team-canvas-v1.json`, `data_files/dataset-001-6252452ca7225030.csv`, `nexo-canvas-v1.json`; counts nodes 9, finished 3, statistics 1, illustrations 1, texts 1, equal to the screen. Team round trip all PASS, (i)–(vi), Control `#0055AA` read from `state.json` and restored (`live/*/team-roundtrip.txt`). 0.4 / 0.4 s, 3 clicks. | Checklist item 4 for cards: yes (9 nodes, 8 instances created, none refused). Tabs: 0 in the ZIP against 1 on screen (explained as "single tab, no tabs member"). The figure page is not among the round-trip checks. | P3: the ZIP carries the dataset CSV, so a downloaded checkpoint carries the data (synthetic here; Paula must know this for real data). Evidence: the (iv) line lists two of eight sources and stops; the Chromium (v) line ends "texts" without a value. | P3 |
| 12 | Steph | Reopened in a new context: the Figure page as in step 9; Page tab with Layout Figure 1, Paper Letter, Orientation Portrait, Page furniture ticked, Export SVG / Export PDF / Print; the top bar already reads "Unsaved changes · Autosave on". Log: 9 cards, 3 finished, violin title and statistics marker, illustration, text, PCA `#0055aa`, structural card drawn without pressing Initiate, FLA pick kept. 17.3 / 17.6 s, 9 clicks. | Team asks the design again on any reopen (`nexo-pilot-simulation.md`, round 2 findings). | P2: I am asked to confirm the study design, a scientific choice, on someone else's analysis, and I immediately hold unsaved changes with autosave on. The evidence does not show whether autosave then wrote. I want a read-only review on desktop, as the phone has. | P2 |
| 13 | Steph | Phone 375 × 812: "View only" pill, toast "Overview limited to 10 %: pan or use the minimap to reach the rest of the canvas.", cards as labelled thumbnails with the zoom pill over their bottom edge, a bottom sheet "Feature distributions · Finished · Export: Download PNG / SVG / PDF / More export options…". 1.5 / 1.1 s, 2 clicks. | — | Nothing is reviewable at 10 %; "legible" holds for the chrome, not the plots. Polish: the zoom pill overlaps the card row. | P3 |

### Notes to the table

- **Step 2 and 12, the design dialog.** It is a scientific declaration (independent samples, experimental unit) that
  decides whether differential plots are allowed and which test the violin runs ("Confirmed independent design" in the
  step 6 methods text). It is asked of whoever opens the checkpoint and is not saved, which `nexo-pilot-simulation.md`
  records as Team behaviour (round 2 findings, step 12). For a lab figure that is the wrong person at the wrong time.
- **Step 4b and 5, one colour system.** By the end of the run the same two groups are brown / blue on the PCA
  (`chromium-paula-4b-…png`), orange / sky blue on the violin (`chromium-paula-05-…png`), and dark blue / blue on the PCA
  and FLA card (`chromium-paula-7c-…png`, `chromium-paula-08-…png`). The log confirms the violin did not redraw on the
  palette change ("other cards redrawn 0/4"). Whether Team's dashboard violin follows the data-hub palette is not in the
  evidence; `chart-audit/b01-dashboard.md` only records that Team's editor palette recolours study conditions and not
  composition classes.
- **Step 6, is the test right?** The numbers are coherent with the picture, and the methods paragraph is better than
  most I see in supplements. What I cannot tell is whether a per-lipid Wilcoxon with a family of one is the planned
  analysis for the real study (section 5), and whether Team gives the same table (`b01-dashboard.md` check 6 and
  `astra-adversarial-review.md` row for `results_dashboard-plot_violin` check 6 say Team refuses the test on synthetic
  samples; this run computed it on the same-named checkpoint). One of the two statements is out of date.
- **Step 9, what "Figure 1" is.** `frontends/nexo/src/figure/layout.ts` builds the slots A (schematic), B (PCA), C
  (LPA, LPC, LPI, CL class log2FC) and D (AA-containing targets). The pilot never added a plot of the kinds C and D
  need, so the page can only show them as PENDING. That is the lab's figure plan, not a canvas failure, but it means
  the phase did not rebuild Figure 1; it rebuilt panel B and the frame.

## 3. The figure itself (steps 9–10 and the export)

Not yet a figure I would accept as a manuscript draft. The reasons, and who owns each:

| What I see | Why it matters for a manuscript | Owner |
|---|---|---|
| Eight of ten panels are PENDING placeholders (C: class Log2FC for LPA, LPC, LPI, CL; D: targeted species). | There is nothing to review in C and D; the page says so honestly ("Log2FC method pending", "AA definition and sn position pending"). | The lab's plan (template encodes pending methods); same in Team. |
| Panel B is Team's PCA PNG: a two-line software title, every point labelled "Control" or "Treatment", legend titled "Group1", both groups in blue. | At Letter scale (capture at 91 %) the labels are already a grey smear; at Nature single column (89 mm) they would be noise, and two blues fail print and colour-vision checks. | Title, labels, legend: Team's module output (same PNG as Team). Colours: Paula's palette choice; Nexo gave no warning. |
| The finished violin ("Figure 1b · lipid distribution") and volcano are not on the page; the right panel lists them ticked. | Paula may believe they are in the figure. The only hidden-content notice counts texts and shapes. | Nexo (Figure page). |
| The violin panel, where it does appear (Draft), has a bracket with stars and q, n per group, a methods text and a CSV, but no lipid name, an n label on the Treatment tail, and a third colour pair. | A distribution panel without the analyte's name cannot go into a figure. | Lipid name: Nexo's default title (Team's dashboard also shows it only in a drawer). Annotation placement, colours: Nexo. |
| Layout: A top, B left, C as a 2 × 2 block right, D as a row of four below, footer notes; small captions (I could not measure them in the capture). | The reading order is natural. C and D slots are small (0.27 × 0.205 of the page each in `frontends/nexo/src/figure/layout.ts`), fine for violins or bars, tight for anything with a legend. Captions will need the journal's size. | Nexo (template geometry). |
| Statistics annotation on the page: none (B has none; the violin is not placed). | Fine for a PCA. | — |
| Export: the bundle is `Figure_PCA_2D_Score_Plot_Publication_Bundle_…zip` with PDF, SVG and `figure_provenance.json` at the Nature preset; the composed page was not exported; no PDF or SVG is in the evidence. | I cannot judge fonts, line weights, DPI or legibility at 89 / 120 / 180 mm; I can only see that the bundle is one panel. | Bundle content: Team's export code (`nexo-phase1.md` H6a). Which export the pilot ran and what is kept as evidence: the pilot. |

What I would ask Paula to change before I look again:

1. Pick one colour pair for Control and Treatment in the session palette that is distinguishable, print-safe and
   colour-vision-safe (not two blues), and make every panel use it. Today that needs the violin's Appearance palette set
   by hand to the same pair.
2. On the PCA: switch off the per-point group labels (or label with sample ids only where needed), remove the software
   title, rename the legend from "Group1" to the factor name. These are module settings or Team-side changes, not canvas work.
3. Name the lipid in the violin's title or subtitle, and move the n labels off the violins.
4. Decide what Figure 1 is for this draft: either the Free layout, which shows the three finished panels, or the template
   once panels C and D can be produced. Do not hand me a page where finished panels are silently absent.
5. Export the composed page (Page tab → Export PDF and SVG) at the journal preset, and send me the PDF, not a card bundle.

## 4. Speed and effort, as I would feel them

From `live/chromium/pilot-log.json` and `live/webkit/pilot-log.json`. These are script timings: no reading, deciding or
typing time, so a person is slower everywhere except where the machine waits.

| | Chromium | WebKit |
|---|---|---|
| Paula, steps 1–11b, machine time | 122 s | 121 s |
| of which the tall "Selected-feature distributions" card (3e) | 39 s (36.3 s click to drawn) | 40 s (37.6 s) |
| of which the deliberate session loss and recovery (7c) | 16 s | 16 s |
| Paula without 3e and 7c | 67 s | 65 s |
| Paula, clicks | 119 | 119 |
| Steph, steps 12–13 | 19 s | 19 s |
| Steph, clicks | 11 | 11 |
| Add a plot, click to drawn (PCA, violin, volcano, composition, structural, heatmap, FLA) | 0.7–2.0 s | 0.8–2.0 s |
| Change an input and see the redraw (4, 4e) | about 2–3 s including the inspector | same |
| Steps flagged as friction by the script's rule (more than 6 clicks) | 5 (8), 6 (7), 7 (8), 8 (8), 9 (15), 10 (15), 12 (9) | same |

How it would feel:

- Adding and adjusting plots is fast enough that I would not notice the server: a second or two per card.
- The 36 s for the selected-feature distributions is the one wait I would notice, and the capture does not tell me what
  the card showed meanwhile (`nexo-pilot-simulation.md`, Live, names it the next speed target). Paula adds this card
  once; I would still want a progress text on the card.
- Finishing three plots and setting the page took 15 clicks, and the export another 15. That is a form, not friction,
  as the simulation says, but it adds up with the inspector tabs: nothing here is one click.
- The recovery after a lost session took 16 s and kept everything. I would not have known what happened without the toasts.
- My own reopen was 17 s, of which the script's checks are most; the design dialog is the part I would resent.
- At 14 % the board is thumbnails: arranging eight cards means dragging labels around, which is fine for tidying and
  useless for judging.

## 5. What a simulation cannot tell me

These need the real people and the real data. The phase close should list them as open, not as done.

1. **Whether these are the right statistics for the study.** The violin's Wilcoxon on one lipid with m = 1, the
   heatmap's BH-adjusted mean-vs-mean significance note, the structural plot's unnamed FDR test and the FLA stars are
   Team's and Nexo's defaults applied to a synthetic 24-sample, two-group dataset that separates completely. On the real
   design (groups, time points, pairing) the family size, the test and the pairing variable are decisions, not defaults.
2. **Whether Team shows the same thing for the same checkpoint.** No capture of Team's canvas is in the evidence; the round
   trip (`live/*/team-roundtrip.txt`) proves structure (validation, restore, instance creation, counts, the session colour),
   not pixels or values. The chart audits' "matches Team" checks mostly compare metadata, dimensions and trace counts
   (`chart-audit/astra-adversarial-review.md`, "P — parity oracle"), with the QC PCA as the exception (bytes identical to
   the module render, `chart-audit/b02-qc-a.md` round 2). Checklist items 1 and 2 of `nexo-pilot-guide.md` are open.
3. **Whether Team's violin statistics agree, or run at all, on this data** (`chart-audit/b01-dashboard.md` check 6 says
   refused on synthetic samples; the pilot computed them).
4. **Whether Paula's own checkpoint behaves the same.** Hers was saved by Team with 24 cards and legacy nodes; its cold
   open measured 7.3 s and the whole canvas about 54 s in `nexo-phase1.md` ("Reopening a checkpoint saved by Team"). Real
   lipid names, label lengths, group counts and time points will change every label-cropping and layout judgement above.
5. **The exported PDF and SVG at journal size.** None is in the evidence; fonts, line weights, DPI and the mm size are unverified.
6. **The composed Figure 1 page export** (Page tab → Export PDF / SVG) and whether Team's figure page shows the same page
   from the same ZIP (the round trip does not check it).
7. **Whether panels C and D can be made in Nexo at all.** No class-log2FC or targeted-species plot was added in the pilot.
8. **Autosave in a reviewer's session.** The capture shows "Unsaved changes · Autosave on" right after my reopen; whether
   that wrote a version, and into what, is not in the log.
9. **The disabled "Significant only" wording** (not reached because step 2 confirmed an independent design).
10. **How Paula experiences the waits and the thumbnail tier.** The script has no patience; the 36 s and the blind
    arrangement at 14 % may or may not matter to her.
11. **Colour choices for the real groups**, including colour-vision safety and more than two groups.
12. **Data handling.** The downloaded ZIP contains `data_files/dataset-001-….csv`. For real data, Paula and I need to
    know where that file goes when a checkpoint is downloaded or shared with a reviewer.

## 6. Changes I would ask for, ranked

1. **One group-colour system across every card (P2, Nexo).** The dashboard violin must follow the session palette (or the
   palette dialog must offer the dashboard palette), and the toast must say what redrew. Add a warning when two group
   colours are too close (the `#0055aa` / blue pair of step 7c). Evidence: `chromium-paula-4b-…png`, `-05-…png`, `-08-…png`.
2. **Figure page: say which finished plots the layout hides (P2, Nexo)** next to the texts-and-shapes notice, with a
   one-click switch to Free; fix the "B / PCA · PCA scores · 2D" caption. Evidence: `chromium-paula-09-…png`.
3. **Violin: name the lipid (P2, Nexo).** Default title or subtitle from the chosen lipid, kept in the finished snapshot and
   the CSV; move the n labels off the violins; show the whole results table without a horizontal scroll. Evidence:
   `chromium-paula-3b-…png`, `-06-…png`.
4. **Heatmap Data tab: show what is drawn when "Significant only" is on (P2, Nexo)**: grey out or annotate the "30 of 76"
   list. Evidence: `chromium-paula-4d-…png`.
5. **Reviewer mode on desktop (P2, Nexo with Team).** Open as view-only when I choose to review: no design dialog (or the
   design pre-filled from the checkpoint, which needs Team to save it), no autosave. Evidence: `chromium-steph-12-…png`.
6. **Data tab: group module controls by Team sub-tab and mark the ones that cannot affect this plot (P2, Nexo).** The PCA's
   Correlation Method, the six QC buttons, the three "Show Statistic Detail" buttons. Evidence: `chromium-paula-04-…png`,
   `webkit-paula-4c-…png`.
7. **Verify the statistics against Team (P2, coordinator).** One non-synthetic test dataset (b01 open question 2), the
   same settings in both, both tables and CSVs kept as evidence.
8. **Export the composed page in the pilot and keep the files (P2, pilot).** Page tab → Export PDF and SVG at the Nature
   preset; capture the Export dialog; tick CSV and R script once so checklist item 3 is tested; keep the PDF in the
   evidence folder.
9. **Progress on the slow card (P2, API or Team).** A visible "computing…" text with elapsed time on the
   selected-feature distributions card; the 36 s itself is Team's module.
10. **Team-module polish for Max, not Nexo (P3):** the volcano's title at 620 px and label collisions; the PCA's per-point
    labels, title and "Group1" legend; the composition's tick format; the FLA "Log2FC" axis label; the structural plot's
    test name; the mean z-score heatmap's binary look with two groups.
11. **Evidence hygiene (P3, docs):** the Live section's "0 console errors" against the 409 in step 7c of both logs; a capture
    at 181 % for step 7b; untruncated lines in `team-roundtrip.txt`; captures of the design, Export and Checkpoints dialogs.
12. **Phone (P3, Nexo):** keep the zoom pill off the card row.
