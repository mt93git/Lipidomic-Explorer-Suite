# Team and module proposals for Max

These are observations for Max to assess. Nexo does not change Team or the modules. Source references below are on `max/integration-60cd4538`. Use only synthetic checkpoints for the examples.

## Preset group colours

**What happens:** With two groups, Ocean & Coral and Earth & Garden can assign near-identical colours to the groups. The first two Ocean & Coral swatches are `#155E75` and `#0E7490` (deltaE 7.7). Earth & Garden starts with `#365314` and `#65A30D` (hue difference 0.9 degrees).

**Where:** `R/utils_colors.R:339`, `R/utils_colors.R:340` and `R/utils_colors.R:372`–`380`. The function assigns swatches in order to sorted labels.

**Synthetic repro:** Open `tests/dual-ui/fixtures/nexo-complete-synthetic.zip`, select either preset for a context with two groups, and compare the assigned group colours.

**Suggested fix:** Choose distinct early swatches or select colours for separation when assigning groups.

## Pairing variable under an independent design

**What happens:** A subject or pairing variable can be offered under an independent design.

**Where:** `R/modules/8_structural_module.R:5556`–`5566` builds the selector from metadata without checking the design in that block.

**Synthetic repro:** Open `tests/dual-ui/fixtures/nexo-complete-synthetic.zip`, use an independent design, and inspect the differential acyl chain controls for Subject / Pairing Variable when metadata provides candidates.

**Suggested fix:** Make the control conditional on the applicable design and explain when pairing is used.

## Donut `ncols`: fixed on integration; production still has it

**What happens:** The filtered composition donut encountered an `ncols` error on production. The integration branch already defines `ncols` for this render.

**Where:** `R/modules/5_barchart_module.R:711` on integration.

**Synthetic repro:** On production, open `tests/dual-ui/fixtures/nexo-complete-synthetic.zip` and render the filtered composition donut; compare with integration.

**Suggested fix:** Carry the integration fix to production as part of the agreed reference-tree work.
