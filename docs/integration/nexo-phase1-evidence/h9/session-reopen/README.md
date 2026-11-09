# H9 — Nexo reopens a lost API session

The API keeps at most two live sessions per process, evicts idle ones and loses all of them on a restart. Session
routes then answer `409 {"error":"session_lost"}` (evicted/closed) or `404 {"error":"not_found","message":"Unknown session."}`
(unknown id). Before this change the client showed the message on every card, the Inspector failed and autosave
retried every 5 s for ever (chart audit b12 F4).

## What the client does now

* **One place, `frontends/nexo/src/api/session.ts` used by `src/api.ts`.** Every session route (cards, render, schema,
  plots, design, analysis, cohort, statistics, group comparison, exports, downloads, canvas validate, checkpoint save)
  goes through `sessionRoute` → `withSession`: the id the app holds is mapped to the live id (alias table). A failure
  that is a lost session (409 `session_lost`, or 404 `not_found` with "Unknown session."; an "Unknown card." 404 is
  not) waits for **one shared recovery** and is **retried once** on the new id. If the recovery fails, or the retry
  is lost again, the request throws `SessionLostError` (`retryable: false`); later requests on that session throw it
  at once without a network request. A request that fails on an id already replaced retries on the live id without a
  second reopen. Requests made by the recovery itself never start a nested recovery. API errors now carry `status` and
  `code` (`send`, `checkpointRequest`, `sendFile`).
* **Recovery hook, `src/ui/sessionRecovery.ts`, registered by `src/ui/App.tsx`.** `POST /sessions` for the checkpoint
  in the URL (the one this page opened, or last saved), then puts back:
  * the study design, confirmed again with the same unit/type if it was confirmed;
  * analysis settings and the cohort this page applied (api.ts keeps the last values per session);
  * every plot card on the canvas (all tabs): `createCard` with the same instance id, source and current inputs when
    the reopened session lacks it, or a `PATCH` of the inputs that differ when it has it;
  * Nexo's member inputs (fixed dashboard card inputs and computed controls) by `PATCH`.
  Then every card is redrawn through its normal path (`refreshCard`). A single card that the reopened session refuses
  does not abort the recovery (it shows its own error when drawn); a new loss does.
* **UI.** Toasts "Reconnecting to the analysis…" then "Analysis reconnected. Your plots were restored."
  (`src/ui/strings.ts`). On failure a persistent `role=alert` band under the status band with a **Reload** button, and
  the save pill reads "Save failed · Session lost". Autosave is paused during recovery and resumed after; a
  `SessionLostError` is not retried by autosave (`src/state/autosave.ts`: `retryable === false`).
* **Mock knobs** (`window.__nexoPrefetchMock`): `evict(409|404)` drops every open mock session and its cards, and their
  next session route answers like the API; `failReopen(true)` makes the next reopen fail; `sessionCalls` traces each
  session-route attempt (`{route,id,attempt}`); `session.opens` counts session opens.

## What it cannot restore

* Server state the client never held: an analysis setting or cohort applied in another tab/page, Team-side state that
  only lives in the R session (e.g. a module action's side effects, a Group comparison reference-group confirmation:
  the card asks for it again), and anything changed after the last save in a page that was reloaded.
* If the checkpoint in the URL is gone (deleted) or the API cannot open it, recovery fails: persistent message + Reload.
* An in-flight `createCard` whose request was lost is retried once with its own instance id; a request lost twice is
  reported, not looped.

## Evidence

* `red.txt` — vitest before the change: 10 session tests fail (no module) and the autosave test shows the retry loop
  (25 saves in 120 s).
* `green.txt` — full vitest + `tsc --noEmit`, the new browser suite and the four regression suites (mock).
* Browser suite `tests/dual-ui/test_nexo_session_reopen.cjs` (Chromium + WebKit, mock): edit a computed control
  (colour), evict (409), change another (shape) → card redraws with both (`#aa3300 Triangle`), "Reconnecting…" and
  "Analysis reconnected…" toasts, autosave then saves, exactly one reopen, every request lost on the evicted id retried
  once on the new id and never more. Then 404 eviction with the reopen forced to fail → persistent alert with Reload,
  pill "Session lost", one failed reopen and **0 session requests** over 12 s of redraws and autosave triggers.
  The browser suite was written with the mock knobs it needs, so it has no separate red run.
* Not covered here: the real API (the coordinator checks it by evicting sessions).
