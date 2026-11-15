# missing-controls-a — two Team controls the Nexo Data tab lacked

Branch `router/20261108-082753-1906e8` (base nexo/phase1 e537cd88). Red commit first (`red.txt`), then green (`green.txt`).

## 1. Species plot "Select Shifts to Visualize:" (chart audit b07 F4)

Root cause, two halves:
- API: Team builds `selectedDetails` in `output$classSelectorUI` (renderUI) only after "Initiate Structural Analysis"
  (`R/modules/8_structural_module.R:2308-2342`). In a browser the select's binding gives it Team's default (the first
  four shifts) as soon as the markup appears; headless nothing did after a module button: `api_card_update` seeded
  rendered inputs only on create. So "Load Species Plot" hit `req(isolate(input$selectedDetails))` and drew nothing.
  (`test_api_render_all.R` hid this by calling `api_seed_rendered_inputs` itself after each step.)
  Fix: `api_card_update` calls `api_seed_rendered_inputs` after actions (`R/frontends/api/cards.R`).
- Client: the Data tab cached the card schema and never re-read it after a module button, so even a served
  `selectedDetails` could not appear. Fix: `DataTab` re-reads the schema with the redraw after an action; `SchemaForm`
  gives controls that appear later their initial value without remounting (`addedControlValues`).

`selectedDetails` is in the catalog `allowedInputs`: it is an **instance input** (normal path, Team saves and reopens it).

Raw heading "differential_view": the schema now carries `groupLabel`, the title Team shows for that tab
(`api_tab_title`, "Differential Acyl Chain Expression"); the client shows it, or a humanised raw value if none
(`groupTitle`).

## 2. FLA index picker `sel_<category>` (chart audit b09)

`sel_<category>` checkbox groups (`R/modules/10_fla_module.R:877-940`) are outside `allowedInputs`. They are now
**computed controls** on `fla_tab` cards only (`api_is_computed_id(ids, family)`; `logratio_tab`'s own `sel_` inputs are
untouched): label = the category heading of Team's rendered `.category-group`, choices/labels/default from the
rendered checkbox group. Values live in **Nexo's checkpoint member** (`nexo.nodes[id].inputs`), are set on the live
session with the normal PATCH, re-sent after a reopen and carried by duplicate/paste (existing computed machinery).
The render pool leaves cards with explicit `sel_` inputs to the main process (same guard as the other computed ids).
`R/frontends/team` (allowedInputs) is untouched, so a checkpoint Nexo saves still opens in Team, which ignores the
member and draws its default three indices.

## Evidence

- `red.txt`, `green.txt` — literal outputs (vitest, tsc, mock browser suite, regression suites).
- `chromium-1440-species-after-initiate.png` — the selector after Initiate, Team's default four shifts.
- `chromium-1440-species-drawn.png` — two shifts picked, Load Species Plot drawn (mock label).
- `chromium-1440-fla-index-picker.png` — "Indices to Plot", one group per category, SM/PC added.

Not run on M1 (no R): `tests/dual-ui/test_api_missing_controls_a.R` (real engine, `nexo-complete-synthetic.zip`).
