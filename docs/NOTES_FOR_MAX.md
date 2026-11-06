# Notes for Max

## Team canvas restore: known production behaviour (for a later wave)

Wave 3b (progressive mounting of restored canvas cards) keeps the restore and
recovery semantics of eed4451 exactly, apart from timing. The issues below exist
in production and are left unchanged on purpose; each needs its own design.

- **Retry discards edits made during a restore.** Edit a mounted card while
  another restored card is still loading, that card fails, click "Retry saved
  workspace": the server re-imports its own copy of the checkpoint and the edit
  is replaced (the server refused canvas states while the restore was pending).
- **Retry is ignored after reconnecting to a fresh server session.** Disconnect
  while a restore is open, reconnect to a new session (allowReconnect 'force',
  Shiny Server/Connect), click Retry: the new session has no matching receipt,
  ignores the request, and the button stays disabled with autosave paused.
- **Receipt and analyst copies (fixed in Wave 3b for the progressive case).** In
  eed4451 the receipt waited for every independent-copy request, so an analyst
  copy added during a restore that mounted last left the restore pending forever.
  Wave 3b waits only for restored copies; the eager restore at eed4451 still had
  the same window.
- **In-flight checkpoint across a reconnect.** Start a manual checkpoint (or ZIP)
  during a partial restore; disconnect and reconnect to a fresh session before
  `settledState()` resolves: the checkpoint's canvas state is sent to the new
  session, which has no pending restore and accepts it. (Shiny's reconnect also
  re-sends the last cached `team_canvas_state` input to the new session.)

## Shared R / R/modules, from Team wave 5B

- **Session ZIP in a local Team session (no project library).** Team can run without the private library as a
  "local session", but only with the explicit opt-in `LIPIDOMIC_TEAM_LOCAL_SESSION=1` (otherwise it refuses to
  start, as before); the only way to keep work is Save & export → session ZIP. That ZIP (built in
  `R/modules/1_shared_data_module.R`) carries data, settings and the canvas, but not the Team methods, run history
  and companion-action records; in library mode those are attached to checkpoints by
  `team_project_records_attach`. A Team-side hook in the ZIP export would let the session ZIP include them
  (about 3–4 h with tests). Not done: it needs R/modules.
- **Dead code.** `guided_shared_enabled()` in `R/guided_shared.R` has no callers. The 7-step Team branches in
  `R/server.R` (`team_workspace_require_library()` now always TRUE) can no longer run in Team.
- **`LIPIDOMIC_TEAM_WORKSPACE`.** `R/companion_assistant.R` and `R/companion_ai_provider.R` still read it directly;
  Team sets it to 1 in-process when the interface is team so they agree. Reading `team_workspace_enabled()`
  there instead would remove that coupling.

## Known local-session text issue (frozen file, left as is)

In a `LIPIDOMIC_TEAM_LOCAL_SESSION=1` run (no project library, nothing autosaves) the companion still shows four
library-mode sentences from `www/team/js/companion_workspace.js`, which is frozen at eed4451 with no text exception:

- line 29 (Canvas step note): "…your workspace saves automatically…";
- line 112 (Save & export step): "Give this checkpoint a name and save it to your private project…";
- line 124 (a live plot selected on Canvas): "…Finish captures its current result; autosave keeps your work.";
- line 129 (Canvas card note): "Canvas saves automatically…".

The rest of the local-session wording is correct: the save slot ("Not saved: local session"), the Data help line,
the Data and Save & export tips and topics (`companion_guidance_data.js` getters) and the R step guidance for
steps 5 and 7. Fixing these sentences needs an approved exception for `companion_workspace.js`.

## Grounded companion and the frozen chat client

With a fed knowledge library, R sends `ai_enabled = TRUE` in `assistant_state`: it is the only flag the frozen
`companion_assistant.js` uses to forward questions its local guide cannot answer to the server, where the knowledge
base answers them. No model is called in grounded mode. The same flag makes the frozen client show "· AI GUIDE" in
the chat header and replace its welcome text with the OpenAI disclosure ("…OpenAI receives your question and basic
settings…"), which is not true in grounded mode.

Fixed (round 3, 2026-11-04, approved extension of the mascot exception: wording may change, look may not). R also sends
`kb_grounded = TRUE` whenever grounded mode is on (round 4: also when an outside AI service is configured, because
the grounded branch answers every free question before the AI branch, so OpenAI is not reachable while the knowledge
base is on; only `LIPIDOMIC_COMPANION_KB=0` turns it off and brings the AI disclosure back).
`companion_assistant.js` takes the header label and the welcome text from two
getters, `guideLabel()` and `welcomeText()`: with `kb_grounded` they say "<MASCOT> · KNOWLEDGE BASE" and that the
question stays on the server; otherwise they return the existing "· AI GUIDE" / "· LOCAL GUIDE" labels and the existing
OpenAI and local welcome texts unchanged.
The freeze guard in `test_team_visual_system.cjs` strips exactly these getters and their three call sites; the rest
of the file is byte-identical to eed4451. `test_team_companion_guidance_wording_pixels.cjs` checks at 1440 px that
the closed mascot and the opened chat are pixel-identical to eed4451 except inside the header label and welcome text.
Still unchanged: the source line under the welcome bubble reads "Local guide" (it comes from the mount-time message).

Grounded mode and the local guide (items 18 and 20; same exception: behaviour may change, look may not). With
`kb_grounded`, R also sends `kb_terms`: the fed library's own vocabulary (`companion_kb_terms` in `R/companion_kb.R`),
that is its words minus app vocabulary (every word of the local guide's help-topic titles and keywords, and words found
in at least 6 of the app's own help texts), up to 400 terms. `companion_assistant.js` passes `kbGrounded` and `kbTerms`
to the local guide, and `companion_guidance.js` hands a question to the knowledge base when it names one of those terms
as a whole word (`namesLibraryTerm`; "PC" does not match "PCA"); a weak local match goes to the server as before.
So "what is cardiolipin" or "can I study PC" reach the library, while "how to change the palette" or "what is the minimum
detection slider" stay with the local guide. Without `kb_grounded` the matcher is the eed4451 one. Limit: a question that
names a library term is sent to the library even when it is mostly app help; the library then answers or says it has
no information.

## Local session behind a proxy: never

`LIPIDOMIC_TEAM_LOCAL_SESSION=1` opens Team without sign-in. It is refused unless the app listens on a loopback host,
and each session must come from a loopback peer with a local Host and no proxy forwarding header. A reverse proxy that
strips forwarding headers and rewrites Host to localhost cannot be told apart from a browser on the same machine, so
the opt-in itself is the trust boundary: never put a local session behind a proxy or tunnel. Serve Team on a network
only with `LIPIDOMIC_PROJECT_LIBRARY=1`. The app logs a warning at startup whenever the local-session opt-in is used.


## Companion: the knowledge base fails closed; OpenAI needs `LIPIDOMIC_COMPANION_KB=0` (2026-11-04, round 5b)

This section is about the **companion chat** only. In Team the knowledge base is the companion chat's only source of
free answers unless `LIPIDOMIC_COMPANION_KB` is set explicitly to `0`. **To use OpenAI in Team you must set `LIPIDOMIC_COMPANION_KB=0`** (that also turns the knowledge
base off). With any other value, or unset, the external AI (`companion_ai_complete`) is never called and the server
never sends `ai_enabled` for it: a missing, empty (`.gitkeep` only) or unreadable library, an empty
`LIPIDOMIC_KB_DIR` folder, a half-written index (passages without a manifest), a fresh process, or a library fed
within the recheck window all mean grounded mode in its error state ("Sorry, I could not search the knowledge base
just now…"). Nothing on disk can turn the AI on. Classic does not load the companion (R/companion_assistant.R is
sourced only for the Team frontend in R/global.R), so Classic is unchanged. The library's routing vocabulary
(`kb_terms`, ~190 KB) is sent to a session only when it changes.

Separate from the chat: **Scientific insight** (`R/frontends/team/scientific_insight.R`) is a distinct, explicit,
pre-existing action (its own button below a plot). When `LIPIDOMIC_COMPANION_AI=1` and `OPENAI_API_KEY` are set it
searches PubMed and calls OpenAI to summarize one finding; otherwise it reports that it is unavailable. It does not go
through the companion chat, `LIPIDOMIC_COMPANION_KB` does not affect it, and it is unchanged from production (84a24e5)
in this release.
