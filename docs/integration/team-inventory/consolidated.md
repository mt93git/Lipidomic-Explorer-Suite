# Team → Nexo inventory: consolidated phase-1 gaps

Two independent source-only inventories were made on the same base (`c49bd0f`):
[`claude-d-opus55.md`](claude-d-opus55.md) (358 rows, one per capability) and [`codex-astra.md`](codex-astra.md)
(1,236 rows, one per control, including every module's own tab controls). This note merges their phase-1
MISSING/PARTIAL items, checked by the coordinator against the code on `nexo/phase1`. Where they disagree, the code
decides. Counts differ mainly because Codex lists each module control separately; the gaps below are grouped.

Decision recorded on 2026-11-06: Team's canvas is the floor, not the ceiling. Nexo's inspector should offer what
Team's "Data & settings" drawer offers and more (exact sizes, controls Team shows but does not save, pro styling),
as long as Team still opens a Nexo checkpoint and no science changes.

## Already fixed after the base commit

| Gap in both reports | Fixed by |
|---|---|
| Two-ended ranges (log-ratio chain length, double bonds) sent one number | `b43620d`: range pairs with From/To fields (`ui/forms/schemaForm.ts` `isRangePair`) |
| Server-side selectize pickers with no options (heatmap violin class/lipid, sn-chain, GC baseline) | `b43620d`: the API records choices the module sends at run time (`R/frontends/api/session.R`, `schema.R`); `tests/dual-ui/test_api_schema_choices.R` |

## Phase-1 gaps, by impact

| # | Gap | Evidence | Who found it | Impact | Effort | Status |
|---|---|---|---|---|---|---|
| 1 | Module action buttons ("Initiate Structural Analysis", "Load Species Plot", "Generate Analysis", "Add Group", "Show Statistic Detail", "Process Outlier Risks", pathway node/edge actions) cannot be clicked. Team's drawer shows the whole module UI (`www/team/js/canvas.js:420-445`, host `R/frontends/team/plot_instances.R:561-563`); Nexo's API lists them (`R/frontends/api/schema.R:124`) and PATCH clicks them (`cards.R:174-200`), but the Data tab never renders them | Codex P1, Astra (chart audit b02) | P1 | M | In progress (Fabric, Opus, part A) |
| 2 | Ordered multi-selects ("Primary Grouping (Order matters)" in log-ratio, functional indices, cellular organization) lose the user's order: Team uses selectize `drag_drop` (`R/modules/9_logratio_module.R:28`); Nexo's native multi-select returns DOM order (`ui/forms/SchemaForm.tsx:40`) | Codex P1 | P1 | M | Open |
| 3 | Shared analysis settings ("Run comparison": differential method, contrast groups, cutoffs, reference/comparison cohorts, global saturation and chain filters) and the targeted lipid cohort. In Team they live in the main sidebar (`R/frontends/team/hub-ui.R:107+`) and the top dock (`R/frontends/team/ui.R:132-137`), reached from the canvas's "Analysis tools" drawer, which leaves the canvas (`www/team/js/tools_drawer.js:1-7`). Nexo reopens the checkpoint's settings but cannot change them | Codex P1 | P1 for figures that need another contrast | L | Phase 1 (decided 2026-11-06). Sidebar settings: API done (`R/frontends/api/analysis.R`, `tests/dual-ui/test_api_analysis_settings.R`), panel in progress. Targeted lipid cohort: API done (`R/frontends/api/cohort.R`, saved in its own checkpoint member, beyond Team), panel next |
| 4 | Controls the module computes (`customCol_*`, `customShape_*`, `R/modules/2_qc_boxplot_module.R:809,820`) and sortable rank lists (log-ratio level sequencer). Team shows them in the drawer but never saves them (`plot_instances.R:100-110,139`) | Codex P2, Astra | P2 | M–L | Open: beyond Team, must keep the round trip |
| 5 | Per-plot vector PDF (live and finished cards) | both | P2 | M | Open |
| 6 | `conditionalPanel` controls always shown in the Data tab | claude-d P2 | P2 | M | Open |
| 7 | File input on a card (pathway "Upload Layout JSON") | both | P2 | M | Open |
| 8 | Figure page: edit a panel's caption/letter, Layers list, publication auto-layout, export gate and row badges for unfinished plots | claude-d P2 | P2 | S–M each | Open |
| 9 | Export Studio column-width mode and single-file downloads | claude-d P2 | P2 | S | Open |
| 10 | Global "Colors & palettes" group colour map (Nexo colours plot by plot) | both | P2 | M | Open |
| 11 | Card states "Changes pending" / "Needs data", global wait strip, library gate reasons | claude-d P2 | P2 | S–M | Open |
| 12 | Statistics guards: family-size note, blocking reasons, participant options without IDs; "Significant only" not disabled without inference | claude-d P2 | P2 | S | Open |
| 13 | Heatmap lipid search and per-class toggles; violin lipid picker without search | claude-d P2 | P2 | S–M | Open |
| 14 | Durable retry of an interrupted save; "records too large" stop; new-build reload strip | claude-d P2 | P2 | S–M | Open |

P3 items (36 in claude-d, 12 in Codex) stay in the source reports. UNSURE rows (claude-d 9, Codex 171) are settled by
the chart audit, which opens every plot in a browser.

## Where the two reports disagree

- Codex counts 219 phase-1 MISSING rows against claude-d's 31. Most of Codex's are module tab controls that only
  exist on Team's analysis pages, plus one row per action button; grouped, they are rows 1–4 above.
- claude-d marks the canvas "close to parity" with its P1s in the generic form (both fixed since). Codex puts the P1s
  in actions, ordered selects and shared settings. The code supports Codex on 1 and 2; 3 is a scope question.
