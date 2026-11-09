# Module actions survive Duplicate and Save -> reopen (chart audit b07 F3)

Topic: module-actions-replay. Base nexo/phase1 (e537cd88).

## What changed
- **Where the presses live.** Nexo's own checkpoint member (`nexo-canvas-v1.json`), `nodes[<node id>].actions`: the
  ordered list of module action ids the user pressed on the card (first-press order, no repeats, at most 20, download
  buttons never). Never an instance input: Team's canvas validator, Team's restore and `allowedInputs` are unchanged,
  so a checkpoint saved by Nexo still opens in Team (Team ignores Nexo's member; the card shows Team's own placeholder
  there until Initiate is pressed, as it always did). The input values the press used are the card's instance inputs,
  saved as before; the replay presses after those inputs are set.
- **API** (`R/frontends/api/cards.R`, additive): `api_card_replay(s, instanceId, actions)` presses, in order, the
  recorded actions this instance has not had yet (`s$pressed`, filled by every `api_card_update` press). Idempotent:
  a second replay presses nothing. Bounded: each action at most once per call; an action the module does not offer or
  that errors is returned in `failed` (the card keeps Team's placeholder). A restore, it never dirties the session.
  New route `POST /api/v1/sessions/<id>/cards/<instanceId>/replay {actions}` (plumber.R). A restored card of a
  reopened checkpoint replays its member's actions itself (`api_card_restore`), so its first render is the plot;
  `api_card_descriptor` (render_disk.R) does not serve such a card from the inputs-keyed disk cache.
- **Client.** A press in the Inspector's Data tab records the action in the member (`state/actions.ts`,
  `handle.recordAction`). Duplicate / Copy to tab: the copy is created with the same inputs, gets its computed
  controls, then `replayActions` before it is added and drawn; the copy records the same actions. Reopen: one
  idempotent replay per card with recorded actions (confirms the API's restore replay, reports failures, redraws a
  card it pressed). Session recovery (`ui/sessionRecovery.ts`): after re-creating a card and its member inputs, the
  recorded actions are replayed on the new session. A failed replay: the card keeps Team's placeholder and the Data
  tab shows "Nexo could not press "Initiate Structural Analysis" again on this card after it was copied or reopened:
  press it again to draw the plot." Pressing it clears the message.
- **Mock** (`src/api.ts`, `src/mock/schema.ts`): structural summaryPlot offers `runAnalysis` and draws Team's
  placeholder until it is pressed on that session's card; the replay route is modelled (`__nexoMock.replays`,
  `__nexoMock.replayFault` forces failures).

## Evidence
- `red.txt`: vitest red (module missing) before the fix; R test unrun on the M1.
- `green.txt`: vitest 510, tsc clean, `test_nexo_actions_replay.cjs` 10 PASS (Chromium + WebKit), the same suite
  failing with the client replay removed, and the regression suites.
- `chromium-1440-duplicate-drawn.png`: original and copy both drawn after Duplicate.
- `chromium-1440-reopen-drawn.png`: after Save checkpoint and reload, both cards drawn.
- `chromium-1440-replay-failed.png`: forced replay failure: the copy shows Team's placeholder, the Inspector says
  the button must be pressed again.

## Open
- `tests/dual-ui/test_api_actions_replay.R` and the API change are unrun (no R on the M1); the coordinator runs them on
  the RTX against the real engine.
- Paste from the clipboard does not carry recorded presses (the clipboard carries style and computed controls only);
  a pasted summaryPlot needs Initiate again.
- Undo does not remove a recorded press (a press is not an undo step, as before).
