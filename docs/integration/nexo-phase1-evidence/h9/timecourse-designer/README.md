# b10 F4: Team's longitudinal time-course designer in Nexo (and b10 check 11 gating)

Branch `router/20261108-082754-0ef524` on `nexo/phase1` (e537cd88). Red `375a57f5`, green: the commit that adds this file.

## What the user can do
Inspector → Data tab of any time-course card (`longitudinal_tab-*`): "Time courses" shows one bucket per Team
"Timecourse i" with its cohorts in the module's order. Per item: ↑ / ↓ (reorder), **Move…** → menu "Move to Timecourse N"
(Enter, arrow keys, Escape), × (remove). Per bucket: "Add cohort…" (Team's source bucket clones). Drag between buckets
and from the cohort chips works too (bonus). Team's "Add Timecourse" (Data tab button) shows the new empty bucket.
Every change presses Team's Generate Analysis in the same PATCH, so the card redraws with the new time courses.

## Where it is stored
- `case_bucket_<id>` are **computed controls** (`api_is_computed_id`, `R/frontends/api/schema.R`), not instance inputs:
  the values live in Nexo's checkpoint member (`nexo.nodes[id].inputs`), are re-sent on reopen / duplicate / undo
  (with Generate Analysis), and are validated against the designer's cohorts. `R/frontends/team/plot_instances.R`
  (allowedInputs) is untouched, so a Nexo checkpoint still opens in Team (Team ignores Nexo's member).
- The buckets are read from the module's rendered designer (`api_schema_rank_buckets`); case ids are random per
  session and never hard-coded. The mock uses fixed ids only inside `src/mock/timecourse.ts`.
- Remove sets the shortened bucket, not `delete_timecourse_item`: Team's delete observer first syncs the buckets and then
  drops the index, so both together would remove two items; a repeated `{case_id, item_idx}` would also be skipped by
  `api_card_update` as an unchanged value.

## Check 11
A card that has shown "Needs Generate Analysis" is not asked to render again (resize, prefetch, input changes) until a
PATCH presses the button (`runNeeds.ts`, `cards.ts awaitingRun`). The first render of a new card still gets one 422.

## Files
`red.txt`, `green.txt`, `chromium-1440-designer.png` (after a keyboard move and a remove),
`chromium-1440-add-timecourse.png` (after reopen, Add Timecourse and a cohort added to Timecourse 3).
