---
name: team-to-nexo-port
description: Port a Team presentation change (R/frontends/team or www/team) to the Nexo client in frontends/nexo, with a vitest that fails first and passes after, the same saved fields as Team, and zero change to any computed scientific value. Use when the user changed Team's look, labels, warnings, editor fields or exports and wants Nexo to match, or says "port this to Nexo".
---

# Team → Nexo presentation port

Rule: Team and Nexo must not diverge. Every Team presentation change gets the same behaviour in Nexo, backed by a test. The port changes presentation only: looks, labels, warnings and exports. It never changes a computed scientific value, and it touches no file in `R/modules`, `R/frontends/classic`, `app.R` or `DESCRIPTION`.

## 1. Read the Team change
- `git diff origin/<base>...HEAD -- R/frontends/team www/team` (or the commit the user names). Summarise what the user sees and what gets saved.
- If the change saves a new field in a canvas card's editor, find it in `R/frontends/team/canvas_state.R` (`team_canvas_editor`, the cosmetic allow-list). Note the exact key, type and bounds.
- If the Team change touches `R/modules`, stop and tell the user. That is a science change, and it needs its own PR and Max's review.

## 2. Find the Nexo counterpart
- Saved editor fields: `frontends/nexo/src/editor/editorState.ts` (`layoutSchema`, `serializeEditor`, `MARKER_SYMBOLS`) and `frontends/nexo/src/state/validate-support.ts` (`sanitizeEditor`). Both must accept exactly the keys and bounds Team accepts.
- Applying the field to the Plotly figure: `frontends/nexo/src/editor/applyEditor.ts`.
- Inspector UI: `frontends/nexo/src/ui/PlotEditor/` and `frontends/nexo/src/ui/Inspector/`. All shell text lives in `frontends/nexo/src/ui/strings.ts`.
- Mock data for the dev server and browser suites: `frontends/nexo/src/mock/`.
- Existing pattern to copy: `frontends/nexo/src/editor/teamPresentation.test.ts`. It takes a Team canvas with the new fields, opens it with `fromCanvasV1`, edits it, saves it with `toCanvasV1`, checks the result is byte-equal, and checks that `applyEditor` draws it.

## 3. Red, then green
1. Write or extend a vitest next to the code (`*.test.ts`) that asserts Team's behaviour:
   - the field survives open → edit → save unchanged;
   - an out-of-range value is dropped, as `canvas_state.R` drops it;
   - the figure shows it.
2. `cd frontends/nexo && npx vitest run <that file>`. It must FAIL for the right reason. Show the failure to the user.
3. Implement the smallest change in the files above.
4. Run `npx vitest run <that file>` (PASS), then `npx vitest run` (the whole suite), `npx tsc --noEmit` and `npm run build`.
5. If the API side is involved (`frontends/nexo-api/`), run the matching `Rscript --vanilla tests/dual-ui/test_api_<name>.R` from the repo root. See the nexo-local-dev skill for `R_LIBS_USER`.

## 4. Prove zero science change
- `git diff --name-only origin/<base>...HEAD -- R/modules R/frontends/classic app.R DESCRIPTION` must print nothing.
- Saved fields are only the cosmetic keys Team allows. No new key reaches a computed value.

## 5. Commit
One focused commit, subject in the repo's style, for example `feat(nexo-editor): <what the user sees> (port of Team <short sha>)`. Do not push unless the user asks.
