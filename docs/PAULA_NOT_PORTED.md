# Ana Pau's Mods-anapau changes NOT ported to ux5/C

For Gerardo and Max. Source: `origin/Mods-anapau`, her commits `302f453..b1b5ac7`. These stay on her
branch because they touch shared/Classic code (`R/global.R`, `R/modules/*`, shared R utilities) or
scientific plot defaults outside the Team-only scope.

| File | Commit | What it does (one line) |
| --- | --- | --- |
| `R/global.R` | e8fc189 | Rebuilds `CLASS_MAP_COLORS` / `HYPERCLASS_MAP_COLORS` from the new Pastel `DEFAULT_PALETTE` (every class gets a new default colour, Classic included). |
| `R/utils_colors.R` | e8fc189 | Adds `DEFAULT_PALETTE` (CARTO Pastel), `default_palette_colors()`, `default_palette_fallback()`, `palette_extend()` and the same rebuilt class/hyperclass maps. |
| `R/utils_vis.R` | e8fc189 | Replaces the brewer/hue fallbacks for unknown classes, categories and lipids with the Pastel default palette (affects shared static plots). |
| `R/modules/1_shared_data_module.R` | e8fc189 | Uses `default_palette_fallback()` instead of Dark2/Set1 for colours of groups not in the colour map. |
| `R/modules/9_logratio_module.R` | e8fc189 | Uses the Pastel palette for log-ratio groups and draws log-ratio violins in the "Feature distributions" style. |
| `R/results_dashboard.R` | e8fc189 | Switches the dashboard condition palette from Gelato Days to Pastel (with `palette_extend()` past 8 conditions). |
| `R/results_dashboard.R` | 46a39b4 | Composition plot: lipid classes named in a top legend bar of coloured dots (`rd_legend_bar`), no text inside bars. |
| `tests/dual-ui/test_team_composition_distinct_colors.R` | e8fc189 | Her assertions for the Pastel-derived class maps and `default_palette_fallback()` (tied to `R/utils_colors.R`/`R/global.R`). |
| `tests/dual-ui/test_team_paula_composition.R` | 46a39b4 | Her assertion for the composition top legend bar (tied to `R/results_dashboard.R`). |
| `www/team/js/plot_editor.js`, `www/team/js/group_comparison.js` | e8fc189 | **Pastel as default palette**: Pastel first and pre-selected in the plot editor, and the group-comparison fallback colours. Not ported: the Team default stays Gelato Days (as in 71dc349); Pastel is ported only as a selectable palette. |
| `www/js/app.js` | — | Not changed on her branch; nothing to port. |

## Ported (for reference)

- Grounded companion knowledge base (36816a8..0bced6c, docs b1b5ac7): `R/companion_kb.R`, hooks in
  `R/companion_assistant.R`, `knowledge_base/`, `03_COMPANION_KNOWLEDGE.R`, `DESCRIPTION` Suggests `pdftools`,
  `.gitignore`/`.dockerignore` library lines, `tests/dual-ui/test_companion_kb.R`, `docs/10_companion_knowledge_base.md`,
  `docs/img/companion/*`. Changed versus her branch: the grounded mode is on only when the library holds indexed
  passages; with an empty or missing library the companion is exactly the 71dc349 companion.
- `www/team/js/companion_assistant.js` `formatAnswer` only (0bced6c).
- `www/team/js/plot_editor.js`: Pastel added as a selectable palette (last in the list; the default stays Gelato Days),
  and the one-line `R/frontends/team/canvas_state.R` change accepting `'Pastel'` (e8fc189).
- `www/team/js/group_comparison.js`: her top horizontal legend bar with tick labels hidden (f56ab66); its fallback
  palette stays Gelato Days. Added on the Team line: under the top bar, a right-side legend position saved on older
  figures (`legend.x` > 1) is ignored.

## Note for review

Her Pastel default is not used anywhere on the Team line: the plot editor, group comparison and the dashboard
(`R/results_dashboard.R`, not ported) all keep the Gelato Days default, so default condition colours stay consistent.
