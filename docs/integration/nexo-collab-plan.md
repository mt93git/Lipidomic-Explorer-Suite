# Nexo Phase 1B: real-time collaboration, phase plan against today's code (revision 2)

Role: designer / architect. Scope: documents and prototype only; no code changed. Base: `nexo/phase1` at `a95541a3`
(every `file:line` below is from that commit; Admin files are cited as the review cites them, from the stack branch
`gh/stack-20261109`, which this checkout does not carry, so those citations are taken from the review and not re-opened).
Companions: the decision document `docs/integration/nexo-collab-proposal.md` (diagnosis, Yjs + Hocuspocus decision), the
adversarial review `docs/integration/nexo-collab-plan-challenge-astra.md` (24 findings, five corrections, seam audit) and
the prototype `docs/integration/nexo-collab-proposal/prototype-v2.html` (`?scene=1`…`?scene=9`, PNGs `scene-<n>-v2-1440.png`
and `scene-7-v2-390.png` in the same folder).

This revision replaces revision 1 (`d5b6bff7`) after the review. The decision of 2026-11-07 stands: a CRDT document (Yjs)
with awareness on a self-hosted Hocuspocus sidecar; the R API (`frontends/nexo-api/`) stays the only science engine; identity
is Admin's. What revision 1 got wrong, in one sentence each: it treated session ids as capabilities (they are a counter),
it assumed one factory swap bridges the store (seven direct writes and three reconcile side effects say otherwise), it had no
ordering authority between PATCH, document and render, it let a stale worker result through, it restored boards without
restoring science, it made staff write checkpoints they could not read back, and it put security and unsent-edit protection
after the first client release. Section 2 states the contracts that fix this; section 5 re-cuts the phases around them;
section 8 answers every finding; section 9 lists the single-user bugs the review exposed.

## 0. Prototype: what changed and why

| Where | v2 as reviewed | v2 revised (2026-11-09) | Because |
|---|---|---|---|
| Scene 8 sequence | Doc update first, PATCH third, "one plot at a time" | One authoritative sequence: intent → sidecar authorizes and orders → PATCH settles in R (service identity) → doc commit → broadcast → parallel renders against the engine revision → "Updated by" | Review F21, F03, F04; section 2.2 |
| Scene 8 architecture | "basic auth kept until client access ships"; `onAuthenticate` only | Basic auth stays for all of Phase 1B (D14); the sidecar box shows the commit log, versions and roles; the R box shows one main session plus workers and the engine revision | F20, F21; sections 2.1, 6 |
| Scene 7 states | "Viewers and phones can look, follow and comment"; engine "renders one plot at a time" | Viewers look and follow, Commenters also comment (role matrix of 2.1); the engine draws on all workers and queues the rest | F21, F22; `frontends/nexo-api/pool.R:1-4` |
| Scene 6 versions | "Before restore (auto)" marked Current while the activity says round 2 was just restored | "Client review, round 2" is Current ("restored just now"); the safety snapshot taken before the restore is listed with Restore (that is what the toast's Undo does) | F24, F07; section 2.4 |
| Scene 4 share | Phone member described by device | Role first ("Viewer · joined from a phone"); roles are enforced by the server, device only picks the layout | F22; D13 |
| Scene 9 plan | Phases 0–6, identity in Phase 1, versions after science, offline last | Phases 0–7 of section 5: contracts and real-path spike, secure sessions in R, bridge and shared board with unsent-edit protection and expiry, science commit protocol, versions, roles and sharing, comments and follow, offline and phones | F19; section 5 |
| Reviewer notes (Spanish) | Mentioned "pregunta 6" for votes; old sequence | Decision numbers of section 10; the new sequence and version semantics | F24 |

Everything else (chrome, tokens, scenes 1–5, bots, `?scene=`, `?at=`, `?notes=0`, `?bar=0`, fictional people, one file) is
unchanged. The v1 → v2 changes of revision 1 (Admin identity, `from Admin` chip, Admin people in the share dialog, Signed out
state, Admin box) stand.

## 1. Facts in the code

| Fact | Where |
|---|---|
| Phase 1 is closed on synthetic data; Phase 1B does not wait for the real-user confirmation | `docs/integration/nexo-phase1.md` ("Close decision (2026-11-09)") |
| The headless API lives in `frontends/nexo-api/`; the unit runs `frontends/nexo-api/run.R`, three render workers, `MemoryMax=8G`; the in-process guard defaults to 2400 / 2700 MB | `OS/Linux/lipidomic-api.service:8,25-31`; `frontends/nexo-api/session.R:555-556`; `pool.R:1-17` |
| Session ids are a counter: `s1`, `s2`, … reset at every restart, for checkpoint and dataset sessions alike; `api_session_get` checks existence and liveness, not identity | `session.R:451,475-476,481-489`; `datasets.R:212-213` |
| No session route checks the caller, even with `LIPIDOMIC_ADMIN_REQUIRE_USER=1`: canvas, inspect, close, design, cards, render, statistics take the id alone; only checkpoint routes and dataset opens call `api_admin_caller` | `plumber.R:118-129,158-180,223-298,395-411` versus `:90,95,101,116,135,144`; `datasets.R:277,350-381` |
| Staff read checkpoints only in the staff workspace; members read only their clients' workspaces; `api_checkpoint_resolve` is used by download, open and delete | `storage.R:17-18,65-79,89-100`; `plumber.R:99-116` |
| The engine lock answers `503` with `Retry-After: 1`; the client ignores the header and retries 60 × 500 ms (about 30 s of sleeps); the engine deadline is 120 s and the worker timeout 150 s | `plumber.R:29-45`; `frontends/nexo/src/api.ts:56-67`; `session.R:192-215`; `pool.R:42` |
| A render job that finished after the session's state moved is not cached, but **its result is still returned**, with current provenance | `pool.R:461-479` (`:474-478` skip the caches, `:479` returns `result`; `:470-471` overwrite provenance) |
| Workers hold a copy of the session's checkpoint keyed by its SHA; a save changes the main session's SHA, so workers stop serving it until a new open retargets them | `pool.R:59-68,216-222,247-248`; `storage.R:154`; `session.R:458` |
| The memory render key is epoch-based, the disk key is content-based (science state included); the browser's key is a third, local one | `session.R:510-526`; `render_disk.R:57-67`; `frontends/nexo/src/cards.ts:441-442`; `analysisGeneration.ts:1-15` |
| A PATCH returns settled values with no revision; the client form publishes answers in arrival order | `cards.R:260-291`; `frontends/nexo/src/ui/forms/SchemaForm.tsx:48-58` |
| Group-comparison baseline confirmation and violin statistics are two different protocols | `statistics.R:74-88` (token as an input) versus `:46-72` (modes, settings, data fingerprint, request ids); `frontends/nexo/src/ui/Inspector/StatisticsTab.tsx:33-56` |
| Besides `history.dispatch`, the canvas writes the store directly for plot heights, recorded actions, saved design and input baselines; the shell writes tabs through the bridge | `frontends/nexo/src/canvas.ts:645,830,845,943,947`; `ui/App.tsx:165,295` |
| A store change triggers `reconcile`, which PATCHes the palette, restored inputs and computed controls, and the bootstrap replays actions and computed inputs | `canvas.ts:167-170,202,204-206,637` |
| The autosave effect also owns the design prompt, the hidden-tab flush and the unsaved-changes leave guard | `ui/App.tsx:200-223` (`:216,217,218`) |
| Undo coalesces by key within 700 ms, forbids merging across an undo boundary, truncates redo, caps at 50; tab commands invert whole documents | `frontends/nexo/src/state/history.ts:5-35`; `commands.ts:5-9`; `ui/tabsWiring.ts:21-30` |
| The validator uses the browser's `DOMParser` for SVG snapshots; Team allows 40 nodes, 24 MiB, 4 MiB per snapshot, strict key allowlists; the Nexo member is bounded at 2 MiB | `frontends/nexo/src/state/validate.ts:18-32`; `R/frontends/team/canvas_state.R:2,14-17,541-549,623`; `frontends/nexo-api/nexo_store.R:7-24` |
| A save revalidates the submitted canvas, then exports **current R state**, appends the opened project records, the current cohort and the Nexo member; the store keys records by ZIP SHA within a workspace and keeps five autosaves per workspace | `storage.R:134-160`; `cohort.R:50-56`; `storage_files.R:76-93` |
| The open body includes `canvas` and `nexo` as last validated, not as last edited; client recovery requires a checkpoint and dataset sessions have none before the first save | `plumber.R:146-149`; `datasets.R:176-179,219-224`; `frontends/nexo/src/ui/sessionRecovery.ts:27-50`; `api/session.ts:7-12` |
| Admin owns identity: `GET /admin/api/session-token` answers `{accessToken, expiresAt, userId, view}`; Nexo caches it with a 60 s margin and throws `AdminSignInRequired` on 401; `knownAdminView` is at `:50` | `frontends/nexo/src/api/adminToken.ts:19-40,44-50`; review F13 for `route.ts:20` |
| The API resolves the caller through `admin.nexo_caller()` with the user's token, cached 60 s by digest; it answers scope (staff, client ids), not names or roles | `datasets.R:349-381`; review F13 for migration 0011 |
| Phones and `?mode=view` are view-only; `?mode=edit` overrides phone detection; the inspector already has a small-screen sheet | `frontends/nexo/src/state/readonly.ts:5-17`; `canvas.ts:72`; `ui/shell.css:7-8` |
| The deploy script builds Nexo and installs the API unit only; nginx steps are printed, not applied; a 404 passes the auth check; the nginx snippet has no WebSocket upgrade | `OS/Linux/deploy-nexo.sh:16-30,58-75`; `OS/Linux/nginx-nexo-locations.conf:3-9` |
| The minimap is drawn in the canvas renderer; `canvas/minimap.ts` is only the visibility predicate | `canvas.ts:404-420`; `canvas/minimap.ts:1-7` |

`docs/integration/nexo-store-scope.md:28` records session ids as "unguessable capabilities without a per-call token check".
The code contradicts that premise today (`session.R:475-476`); section 9 lists it as a fix outside collaboration.

What the proposal assumed that no longer holds (kept from revision 1, corrected): identity is Admin's from day one (no
join-with-name, no invite tokens); roles can be enforced server-side from the first phase that has them; the sidecar needs
its own way to call the API under `REQUIRE_USER=1` (D7); Basic auth stays in front; N people on one project must share one
R session, which needs project-bound sessions, not reuse-while-clean; a project has two origins (checkpoint, released
dataset); comments live outside the checkpoint; `MemoryMax` is 8G with three workers.

## 2. Contracts before Phase 0

These four contracts are the gate for Phase 0. Each has a test gate; a phase does not start until the contract's tests of
the previous phase are green on the real API.

### 2.1 Authorization contract

**Identities.** Two, and only two, are ever accepted by the API or the sidecar:

1. **A person**: an Admin account, carried as the GoTrue access token Nexo already fetches (`adminToken.ts:27-40`); scope
   resolved through `admin.nexo_caller()` (`datasets.R:350-381`): lab staff, or member of one or more clients.
2. **The sidecar's scoped service identity** (D7, recommended over token relay): an HS256 JWT signed by the sidecar with a
   secret kept only in the two units' environment files (mode 600, never in git, browser or logs). Claims: `iss=nexo-collab`,
   `aud=nexo-api`, `sub=service`, `workspace` (one), `project` (one), `actor` (the authenticated userId on whose behalf the
   call is made, or `system` for automatic versions), `exp` ≤ 60 s. R verifies it in a new `api_service_caller()` beside
   `api_admin_caller` and maps it to a caller whose readable workspaces are exactly `[workspace]`; `api_scope_allow`
   (`storage.R:21-25`) then applies unchanged. The token is accepted only from the loopback address.

Why not relay (revision 1's recommendation): relay has no caller when nobody with edit rights is connected, after an R
restart, for viewer-only recovery, for the automatic before-restore and before-merge versions and for autosave after the last
editor leaves (F18). Relay stays possible for one case only: the *named* version a person requests may carry that person's
token as attribution; the save itself still goes through the service identity so the outcome never depends on who is online.

**Session identity.** `sessionId = "<generation>.<random>"`: `generation` is 48 random bits drawn at process start,
`random` 128 random bits per session (`session.R:475-476`, `datasets.R:212-213` replaced). An id from another generation
answers `409 session_lost` (what `isSessionLost` already understands, `api/session.ts:7-12`); never reused, never a counter.

**Binding on every R route.** Every route under `/api/v1/sessions/<id>` (open, inspect, close, design, canvas validate and
current, checkpoints save, cards create/schema/patch/replay/events/park/render, plots, analysis, cohort, palette, statistics,
group-comparison confirm, export) resolves the caller and checks it against the session (`api_session_get(id, caller)`):

| Session kind | Who may read (render, schema, canvas GET, inspect, statistics describe/check/policy, cohort/analysis/palette GET) | Who may mutate (PATCH/actions, create/park, design, analysis, cohort, palette, confirm, validate+save, close) |
|---|---|---|
| Legacy (flag off, `REQUIRE_USER=0`) | as today | as today |
| Legacy (flag off, `REQUIRE_USER=1`) | a person whose scope includes the session's workspace (`s$workspace`, staff workspace by default) | the same |
| Collab (project-bound) | a person whose scope includes the project's workspace, or the service identity for that project | **the service identity for that project only** |

So the sidecar is the single gateway for science mutations of a collab session (section 2.2), browsers read directly with
their own token (renders stay parallel and off the sidecar's hot path), and no route is reachable with an id alone. The
remaining question "is this person a member of *this project*?" is the sidecar's: it hands the session id only to members,
and a member who lost the workspace loses reads at the next `nexo_caller` refresh (≤ 60 s).

**Collab messages** (Hocuspocus, one document per project, document name = project UUID v4):

| Message | Who | Check |
|---|---|---|
| connect | any person | token valid; `nexo_caller` scope includes `project.workspace`; project role from the sidecar's table (default role D8 for new members, creator = Owner, lab staff = Editor by default) |
| awareness | any connected | identity fields (`userId`, `displayName`, `kind`, `role`, `colour`) are **stamped by the sidecar**; client-sent values are overwritten; cursor, selection, viewport, editing, activeTab, device are the client's |
| sync (Y update) | Editor, Owner; Commenter for `comments` only; Viewer none | the candidate update is applied to a shadow doc; the changed paths must all be inside the role's writable set (below); otherwise the **whole** update is refused (stateless `refused {paths}`) and the client resyncs from the server state |
| intent | Editor, Owner (lab-only kinds: lab staff when the project toggle D2 is on) | section 2.2; the sidecar writes the result into the document |
| version save / list / restore / fork | save: Editor, Owner; list: any member; restore: Owner | section 2.4 |
| roles / share settings | Owner | section 5, Phase 5 |
| follow / summon | any / Editor, Owner | awareness only |

**Protected document fields.** Server-written, refused from any client: `meta.*` (project, workspace, origin, session id and
generation, engine revision, last version), `renderState.*` (who rendered what, at which revision), `nodes.*.instance.inputs`
(settled by R), `nodes.*.statistics.result` and `.settings` (confirmed by R), `nexo.nodes.*.actions` (recorded by R),
`nexo.nodes.*.inputs` for computed controls (settled by R), `nexo.design` (confirmed by R). Client-writable by Editor and
Owner: node geometry, label, visual, finished (lab-only when D2 is on), statistics presentation, `document`, `tabs`,
`canvas.libraryHidden`, `nexo.nodes.*.style`. Commenter: `comments` (create, reply, resolve own thread). Finish, Edit figure
and both statistics confirmations are **intents**, so lab-only is enforced where the write happens; hiding a button
(`Inspector.tsx:23`, `StatisticsTab.tsx:51-56`) is presentation only.

**Admin profile and names.** Admin supplies scope, not names (F13). Contract, additive (D12): the session-token answer gains
`displayName` (lab staff: `lab_staff.display_name`; client members: a new nullable `client_member.display_name`, migration
0012), **never an e-mail**; a null is shown as `Member · <client>`; the Admin role for the client (Requester/Viewer/Admin)
is a tooltip fact and never implies a project role; `admin.nexo_people(p_client_id)` returns `(user_id, display_name, kind,
client_role)` for lab staff and active members of that client, no e-mail column, no rows outside the caller's scope.

**Expiry, refresh, revocation on open sockets.** The sidecar keeps `exp` per connection; 30 s before it, it sends
`token_expiring`; the provider fetches a fresh token (`adminToken()`) and reconnects with the same Yjs client id (undo
stack and pending updates survive); at `exp` the socket closes with 4401 if no refresh came. Scope is revalidated every 60 s
per connection and on every intent (`nexo_caller`, cached 60 s by digest as `datasets.R:355-358`); a lost scope closes with
4403 and the page turns to a read-only "No access" state; a role change applies on the next message and is pushed as a
`role` message. **Signed out** appears only when Admin's token route answers 401 (`adminToken.ts:33`); a null token for any
other reason shows "Reconnecting · waiting for Admin" and, after 60 s, an honest failure state. Local persistence
(IndexedDB) is namespaced by `(userId, projectId)`; a queue from another subject is never replayed after an account switch.

**Gate (tests, raw protocol, two real identities).** Over HTTP without the sidecar: member A cannot read or mutate B's
session; a Viewer's token cannot PATCH a collab session; a client Editor cannot call the confirm route directly; an id from a
previous generation answers 409. Over the WebSocket with hand-built messages: a Viewer's update is refused; a Commenter's
update that mixes a comment with a node move is refused whole; an Editor writing `meta.sessionId`, `renderState` or
`nodes.x.instance.inputs` is refused; an awareness frame with a forged `userId` is overwritten; revocation of membership
closes an open socket within 60 s; a token expiry reconnects silently and does not show Signed out.

### 2.2 Science commit protocol

One order for everything that changes science, owned by the sidecar, per project. Every science change is an **intent**;
the sidecar is the only client of the mutation routes.

```
intent (client → sidecar, stateless message)
  {intentId (uuid), kind, target, payload, baseRevision}
→ authorization (role, lab-only toggle, protected paths)                 refused → `refused {intentId, reason}`
→ commit log row (SQLite: project, seq, intentId, actor, kind, payload, state=pending)
→ R mutation (service identity, headers X-Nexo-Project, X-Nexo-Intent)   serial per project; global kinds drain the queue first
→ R answers settled values + X-Nexo-Engine-Revision n                     timeout/unknown → re-ask R by intentId (idempotent)
→ durable commit: one Y transaction, origin {actor, intentId, n}, persisted (SQLite) → row state=durable
→ publication: Hocuspocus broadcasts the transaction                      → row state=published
→ renders: every browser renders against revision n (parallel, workers), result accepted only if its revision header is n
```

**Kinds** and what R does: `inputs` (PATCH `cards.R:229-292`), `action` (PATCH with actions), `createCard`, `parkCard`,
`upload`, `computedInputs`, `design` (`/design`), `analysis` (`/analysis`), `cohort` (`/cohort`), `palette` (`/palette`),
`confirmBaseline` (`statistics.R:74-88`), `applyViolinStatistics` (`statistics.R:46-72`, mode `apply`),
`finish` / `editFigure` (no R call; the snapshot is validated by the sidecar, section 2.3), `save`, `restore`, `fork`
(section 2.4). **Global kinds** (`design`, `analysis`, `cohort`, `palette`, `save`, `restore`): the queue drains, in-flight
renders are allowed to finish but their results are discarded by revision, then the kind runs alone.

**Engine revision.** R keeps `s$engineRevision`, bumped on every state-changing call (the routes in the mutate column of
2.1), returned as `X-Nexo-Engine-Revision` on every mutation and render answer (JSON and PNG) and in the open/join body. The
render identity is `renderId = sha256(sessionId, instanceId, revision at job start, width, height, format, dpr)`; the memory
and disk keys (`session.R:525-526`, `render_disk.R:57-67`) stay as they are (the disk key is content-addressed and already
includes science state), and the browser's key (`cards.ts:441-442`) becomes `(nodeId, revision of the card's last commit,
size, dpr)`.

**Stale worker results** (F04): `api_pool_finish` (`pool.R:461-479`) compares the job's start revision with the current one;
when they differ it renders on the main process instead of returning the worker's result (`render_here()`), and never
rewrites provenance. **Global dedup** (F04, F14): in-flight jobs are keyed by `memoryKey` in one map; a second identical request
(from any browser, any size/format/dpr identical) waits on the same promise; cards that are action-dependent or not disk-cacheable
(`pool.R:231-239`) are marked `cacheable=FALSE` in the schema so clients never advertise them as "computed once".

**Idempotency and crash handling.** R keeps `intentId → answer` for 10 min per session; a repeated intent returns the stored
answer without re-applying (actions are counters, `cards.R:269-275`, so this is not optional). Boundaries: (a) crash before
the R call: the row is `pending`, re-driven at sidecar start; (b) crash after R applied but before the doc commit: re-drive
asks R by `intentId`, gets the stored answer, commits; (c) R restart: generation changes, every pending row fails with
`session_lost`, recovery (below) reopens and re-applies the **document**, not the pending rows, which are refused back to
their authors with "the engine restarted; please redo"; (d) timeout with unknown outcome: the client sees "Checking…", the
sidecar re-asks by `intentId`, never retries blind.

**Typed responses** (F15): `503 busy {retryAfter}` (lock), `503 capacity {liveProjects, retryAfter}` (admission), `503
admin_unavailable`, `409 session_lost {generation}`, `409 render_stale {revision}`, `504 engine_timeout {intentId}`. The sidecar
honours `Retry-After`, backs off (1, 2, 4 s) and gives up at an overall operation deadline of 180 s (above R's 120 s engine
deadline and the 150 s worker timeout); the browser never loops on 503 for mutations (they are intents); for renders the
client honours `Retry-After` with a 180 s deadline (replacing the 60 × 500 ms loop at `api.ts:60`).

**Three acknowledgements**, shown as such (F18): *document durable* (the sidecar persisted the transaction), *engine
committed* (R answered with revision n), *checkpoint written* (a version exists for revision n). The pill says "Live · saved
10:44" only for the third; the first two show "Live" and "Updating…".

**Statistics, two protocols** (F23). *Group comparison*: `confirmBaseline {instance, confirmationToken}` is lab-only when D2
is on; first confirm wins **at the commit log**: a second confirm for the same instance and data fingerprint is refused as
`superseded {by, at}`; a confirm racing an input, cohort or design change is refused as `stale` because the input commit
bumped the revision first. *Violin*: `describe`, `check`, `verify` are reads (any member, direct to R with the person's
token); `apply` is an intent; the result (`settings`, `result`, `dataFingerprint`) is written by the sidecar into
`nodes[id].statistics` bound to revision n; after any later commit touching that card or a global kind, the sidecar runs
`check` with the stored fingerprint and, when invalidated, writes `statistics.result = null` with attribution ("invalidated
by X · changed Lipid"), which is what `statistics/settings.ts:35` displays. Team's calculations and guards are untouched.

**Finish and Edit figure.** `finish {nodeId, finished}`: the finishing browser produces the snapshot (presentation, as
`c.finish()` does today, `canvas.ts:926-930`), the sidecar validates it (2.3), checks the role and D2, and writes
`nodes[id].finished` with attribution. `editFigure` writes `finished = null`.

**Leases, admission and recovery** (F06, F08, F14). A collab session carries `lease = {connections, inFlight, renewedAt}`;
the sidecar renews it every 60 s (`POST /sessions/<id>/lease`) with the live connection count; a lease is live while
`renewedAt` is less than 180 s old and `connections + inFlight > 0`. LRU (`session.R:469-473`, `datasets.R:203-207`) and
idle expiry (`:491-498`) never close a session with a live lease; the **soft** guard (`:562-567`) closes unleased sessions
first and, when only leased ones remain, clears caches and reports `pressure` in `/health` instead of closing; the hard
guard (`:560`) is unchanged. Admission: a collab open answers `503 capacity` when live-leased sessions ≥
`LIPIDOMIC_API_LIVE_PROJECTS` (default 2); the sidecar queues the project and shows "Waiting for engine capacity · 1
project ahead" rather than reopening into immediate eviction. Collab sessions never reuse by SHA (`session.R:459-465`): two
projects on the same checkpoint are two sessions. Workers: `api_pool_prepare` retargets to the *project's* checkpoint on open;
a save does not change what workers serve (they are keyed by the opened content, not by the latest ZIP SHA, F14 and 9.B6);
on recovery or close the main process cancels the project's queued jobs. **Join snapshot**: `GET /sessions/<id>/join`
answers `{sessionId, generation, engineRevision, preparation, samples, lipids, design, dataset?, cards}` and **no canvas**:
the joining browser hydrates the document from the sidecar (Yjs sync) and the card list from this body, in that order, and
never runs the bootstrap replays (`canvas.ts:637`) — origin `init` is not `local`. **Recovery** (sidecar-owned, replaces
`sessionRecovery.ts:27-50` for collab): on `session_lost`, reopen by origin (checkpoint: the project's last version blob or
the opened checkpoint; dataset: `POST /datasets/sessions` with the persisted preparation settings and dataset id, scope
revalidated), confirm design, apply `meta.analysis/cohort/palette`, create every card from the **document** (inputs from the
doc, computed inputs and recorded actions from `nexo`), then write `meta.session` with the new id and generation. Pending
intents are refused back (above); renders resume against the new revision. **Health** reports main sessions, workers with
their checkpoint and card counts, leases and pressure.

**Gate (forced interleaving with real R).** A test hook (`options(nexo.api.delay_patch = …)`, `nexo.api.hold_worker`) in
the API makes two PATCH answers arrive in reverse order, holds a worker past a global change, times a PATCH out, saves during
edits and restarts R mid-intent; after each, R's state (`GET /sessions/<id>` revision, card inputs, design, analysis, cohort,
palette) and the document agree, and no render older than the current revision is displayed. Also: identical simultaneous
render requests from two browsers produce one worker job; two display densities produce two; a quiet connected project at
minute 3 is not evicted; two busy projects under soft pressure keep their sessions; a third project waits with the capacity
message; a fork of the same checkpoint gets its own session.

### 2.3 Bridge and export specification

**Inventory of every persistent write today**, with its collab origin and route:

| Write | Where | Today | In collab |
|---|---|---|---|
| Move, resize, label, geometry, add/remove, style batch, appearance, Nexo style, statistics presentation, finished, document, tabs commands | `canvas.ts:826-827,844,929,931,951-952,956`; shell through `tabsBridges` (`canvas.ts:979`, `ui/App.tsx:285,301`) | `history.dispatch(cmd)` | local origin: the bridge applies the command and writes the field-level diff into the Y.Doc (one transaction, origin `local`) |
| Plot height written back on reopen | `canvas.ts:640-646` (`store.set`) | direct | origin `init`, only by the first opener of a *new* project (origin checkpoint), as an intent `inputs`; joiners never run it |
| Record a module action | `canvas.ts:830` (`store.set`) | direct | server-written after the `action` intent (protected path `nexo.nodes.*.actions`) |
| Save design | `canvas.ts:845` (`store.set`) | direct | server-written after the `design` intent (`nexo.design`) |
| Input baselines before the first change | `canvas.ts:941-948` (`store.set`) | direct | not needed: `nodes.*.instance.inputs` is always server-settled and present from the first commit; the baseline is the open body's inputs written at project creation (origin `init`) |
| Record upload (file content into `nexo.nodes.*.inputs`) | `canvas.ts:832-833` | dispatch with fold | `upload` intent; file content stays in the Nexo member (2 MiB bound checked at admission) |
| Computed controls | `canvas.ts:834-836` | dispatch after the PATCH already happened | `computedInputs` intent; server-written |
| Session palette | `canvas.ts:837` | dispatch; `reconcile` PATCHes on undo (`:167-170`) | `palette` intent (global); never PATCHed from `reconcile` |
| Tabs: new cards join the active tab; activate | `ui/App.tsx:160-166,291-296` | assignment through the bridge + `refresh()` | membership through the bridge (local origin); **`active` is personal** (awareness), never in the document |

**Reconcile side effects** (`canvas.ts:162-230`) run only for origin `local` or `undo` (own undo/redo): palette restore
(`:167-170`), `restoreInputs` (`:202`, `:233-247`), computed-control restore (`:204-206`). For `remote`, `init`, `restore` and
`server` origins the bridge sets `c.inputs` and calls `c.reload()` (`refreshCard`, `:961`) and never PATCHes. The bootstrap
chain (`:637`: `reconcile`, `syncPlotHeights`, `resendComputed`, `resendActions`) runs only for the creator of a new project;
joiners skip it. The transaction origin is explicit (`{kind: 'local'|'remote'|'init'|'undo'|'restore'|'server', actor,
intentId?}`) and every subscriber receives it; `store.ts:7-11` keeps replacement identity, so the bridge produces a new state
object per transaction.

**Undo** (F11): `Y.UndoManager` with `trackedOrigins = {this client}`, `captureTimeout = 700` and an adapter that reproduces
`history.ts:14-32`: explicit `stopCapturing()` at every boundary the current code marks (`boundary` after undo/redo), fold
groups by `coalesceKey` equality within the window, a 50-entry cap, redo truncation on a new local change, and `cursor` as
the undo stack length so `recheckStatistics(nodeId, history.cursor)` (`canvas.ts:957`, `:216-228`) keeps its meaning. Inverses
are field-level CRDT operations (what the UndoManager computes), never the snapshot inverses of `commands.ts:5-9` or
`tabsWiring.ts:26-29`, so another person's edits are not replayed over. Undo belongs to **one editing session** (one Yjs
client): two devices of one account have two undo stacks (decision recorded in D3's "what is a project"). The conflict toast
"X also changed Lipid; theirs won · Undo mine" names the commit (`intentId`) and undoes exactly that intent's effect through
a new intent (`inputs` back to my settled values), never a generic undo.

**Lossless Y.Doc schema.**

| Y type | Content | Exported to |
|---|---|---|
| `canvas: Y.Map` | `version '1'`, `libraryHidden` | Team member |
| `nodes: Y.Map<id, Y.Map>` | `kind, id, label (Y.Text), x, y, width, height, visual (JSON), finished (JSON\|null), assetId, assetVersion, color, insight, instance {id, source, inputs: Y.Map}, statistics (JSON\|null)` — exactly `document.ts:19-24`; **no `z`, no `render`** (Team rejects unknown keys, `canvas_state.R:548`) | Team member |
| `document: Y.Map` | every field of `Document` (`document.ts:89-92`): `version, layout, orientation, paper, paperWidth, paperHeight, showPageFurniture, items: Y.Array<JSON item>` | Team member |
| `tabs: Y.Map` | `version, tabs: Y.Array<{id, name: Y.Text, nodes: Y.Array<id>}>, figure {deselected, order}` — `active` lives in awareness; export writes **`savedActive` = the tab holding the most recent committed change, else the first tab** (deterministic, F10) | Team member |
| `nexo: Y.Map` | `version 1`, `nodes: Y.Map<id, {style, inputs, actions}>` (`nexo.ts:15,20`), `design` | Nexo member (`nexo-canvas-v1.json`) |
| `comments: Y.Map<id, Y.Map>` | anchor, thread (Y.Array), resolved, votes (flag) | never exported |
| `renderState: Y.Map<id, {revision, renderId, by, at}>` | server-written | never exported |
| `meta: Y.Map` | project, workspace, origin, session {id, generation}, engineRevision, analysis, cohort, palette, lastVersion | never exported |

Two explicit projections in one shared TypeScript module (`collab/export.ts`, built for browser and Node): `toTeamCanvasV1(doc)`
produces the allowlisted keys of `canvas_state.R:542,548` only, in the shape `toCanvasV1` builds today (`serialize.ts:5-12`,
which takes **doc and tabs**); `toNexoV1(doc)` produces the Nexo member. Unknown archive members (`team-project-records-v1.json`,
the cohort member) are carried by R at save time (`storage.R:146-147`), not by the exporter.

**Admission and repair.** Before accepting an update, the sidecar applies it to a shadow document and validates: nodes ≤ 40,
Team JSON ≤ 24 MiB (UTF-8 bytes via `TextEncoder`, with a 5 % margin because R canonicalises differently, `canvas_state.R:623`),
each snapshot ≤ 4 MiB, Nexo member ≤ 2 MiB, tabs ≤ 20, items ≤ 80, ids well-formed, `tabs.nodes ⊆ nodes`, `figure.order ⊆
nodes`, document items referencing nodes exist. An invalid *single* update is refused (2.1). A **merge** that produces an
invalid state from two valid updates (39 nodes plus two concurrent additions; a tab deleted while a card is moved into it; a
figure item for a node removed concurrently) is repaired in a server transaction right after the merge: the latest addition
by Lamport clock is moved to `parked` (its author sees "Your card was parked: the board is full · Restore it"), dangling tab
and figure references are pruned, and each repair is an activity entry. Nothing is silently dropped. R's validation at save
(`storage.R:138`) remains the final word; a refused save is an alert, not a loop.

**Node-safe validation.** `validate.ts:18-32` relies on `DOMParser`. The shared validator takes a `DOMParser` implementation
as a parameter: the browser's in Chromium and WebKit, `linkedom` in the sidecar (pinned), with the same `unsafeSvgReference`
rules and the same PNG header check; a shared vector file (`collab/validate.vectors.json`: valid SVG, scripts, `foreignObject`,
external `url()`, `javascript:`, event attributes, oversized payloads, UTF-8 multi-byte labels) runs in vitest, in the browser
suites and in `node:test`, and all three must agree before the schema is accepted.

**Flag-off isolation.** `VITE_COLLAB_URL` (build-time) turns collaboration on; `?collab=0` off for one page; decided once like
`readonly.ts:12-15`. The collab modules are a dynamic import behind that decision; the flag-off test asserts no `/collab/`
request, no `yjs` chunk loaded, and `createHistory`, `createAutosave` and `sessionRecovery.ts` running exactly as today.

**Gate.** Round trip `toTeamCanvasV1(fromDoc(toDoc(state)))` equals `toCanvasV1(state, tabs)` for the real canvases
(`serialize.test.ts` fixtures, the complete fixture of `nexo-complete-fixture.md`, a canvas with SVG and PNG snapshots,
illustrations, figures, tabs, statistics and Nexo-only fields); every boundary above at the limit and one past it; the merge
cases; the flag-off regression (vitest and the browser suites unchanged); the inventory above has a test per row proving no
engine call from `remote`/`init`/`restore` origins.

### 2.4 Versions as durable project records

**Records (SQLite, sidecar).**

```
projects(id, workspace, origin_kind, origin_ref, origin_settings, created_by, created_at, parent_project, parent_version)
versions(id, project, kind, label, actor, created_at, parent_version, engine_revision, doc_state_vector, blob_sha256, status)
blobs(sha256, workspace, checkpoint_id, size, first_seen, last_referenced)
commits(project, seq, intent_id, actor, kind, payload, engine_revision, state, created_at)
roles(project, user_id, role, granted_by, granted_at)
```

`kind ∈ {opened, autosave, auto, named, before-restore, before-merge, forked}`; `status ∈ {pending, committed, failed}`.
A version row is written `pending` **before** the save, then `committed` with the blob SHA; at start-up, `pending` rows older
than 5 min are reconciled against the store (`GET /checkpoints` filtered by label and time) or marked `failed`. Blobs are the
ZIPs R's store already keeps by SHA within a workspace (`storage_files.R:76-93`); the sidecar references them and owns their
lifetime: R's autosave prune (`storage.R:155-157`) does not apply to collab saves (they carry the project header and a
`collab` label prefix), and the sidecar deletes a blob (`DELETE /checkpoints/<id>` with the service identity) only when no
retained version in **any** project references it. Identical bytes saved twice are one blob and two version rows.

**Retention per project** (D4): `autosave` keeps the last 5; `auto` keeps 48 h, then one per day; `named`, `opened`,
`before-restore`, `before-merge` and `forked` are kept until an Owner deletes them. Retention runs per project, never per
workspace.

**Lookup for staff and clients** (F09): `api_checkpoint_resolve(id, caller, workspace = NULL)` gains an explicit workspace:
staff may name any client workspace; a member may name only its clients'; download, open, delete and the sidecar's version
retrieval pass it (`checkpointDownload(id, workspace)` in `api.ts:334-344`). The legacy staff list stays what it is.

**Save** (`save {label?}` intent): drain the queue (barrier), export both projections, `POST /sessions/<id>/canvas/validate`
then `POST /sessions/<id>/checkpoints` with the service identity and `X-Nexo-Actor`, then the version row. Autosave policy per
project (not per person): 15 s after the last commit, at most every 60 s (`autosave.ts:47`), `auto` every 10 min with
changes, `named` on request. "Download" fetches the **current state**: it saves first (a barrier), then downloads that version.

**Restore** (`restore {versionId}`, Owner): barrier → `before-restore` version of the current state → R reopens from the
chosen version's blob (a new session, same project, new engine revision; this is the only path that restores analysis,
design, actions and inputs, which the document cannot re-PATCH into the old session) → the document is replaced in one
server transaction (origin `restore`, both projections re-imported, `comments` untouched) → `meta.session` re-aliased →
queued intents re-applied to the new session. Edits made by others during the few seconds of the barrier are queued, not
lost; edits after the restore apply on top. **Undo of a restore is a restore of the `before-restore` version** (Owner), not a
generic undo; the toast's Undo does exactly that. Scientific equivalence is the acceptance: inputs, analysis settings,
design, cohort member and recorded actions of the reopened session equal the version's, and Team opens the ZIP.

**Fork** (D3): a new project row with `parent_project` and `parent_version`, its own R session opened from that version's
blob, first version `forked`. Not built in Phase 1B (the prototype does not show it); the record shape allows it later.

**Gate.** Staff save → download → R restart → reopen on a client workspace; member of A refused on B; identical bytes as two
named versions in two projects of one workspace, prune one project, the other still opens; crash between ZIP and index row
reconciles; viewer-only presence and last-editor departure still produce autosaves; restore then undo keeps later authorized
edits; a Team-opened version has the restored inputs and cohort, not merely valid JSON.

## 3. What must never change

- **Science and Team.** Nothing under `R/modules`, `R/server.R`, `R/global.R`, `R/ui.R`, `R/frontends/team`,
  `R/frontends/classic`, `www`. Every R change is inside `frontends/nexo-api/` and additive; Team's strict validator stays the
  final word on a saved canvas and is never turned into a science executor.
- **The checkpoint format.** A version is what `api_checkpoint_save` writes (`storage.R:134-160`): Team's export, the project
  records carried verbatim, the cohort member, `nexo-canvas-v1.json` under the envelope rule. Comments, activity, presence,
  roles, render state and `meta` never enter either member.
- **Single-user mode.** Flag off: `createHistory`, `createAutosave`, client-side recovery and direct PATCH run exactly as now;
  collab modules are not loaded (2.3). The fixes of section 9 apply to both modes and are tested in both.
- **The engine lock.** `api_exclusive` stays one lock with `503 + Retry-After` (`plumber.R:29-45`); clients honour the header.
  The disk cache key stays content-addressed; responses gain the engine revision header.
- **Store scope** (`nexo-store-scope.md`): a member saves and reads only in its clients' workspaces; the service identity is
  bound to one workspace and one project per token and cannot widen it.
- **Admin migrations 0001–0011 are never edited**; anything Admin needs is additive (0012).
- **No secret in the browser, in git or in logs**: tokens in memory only (`datasets.R:349-358`); the service secret in the
  units' environment files only; refusals logged by id, never by token.
- **Basic auth stays in front** of `/nexo/`, `/api/` and `/collab/` for all of Phase 1B (D14).

## 4. The seams in today's code

| Seam | Today (file:line) | Collaboration hooks here |
|---|---|---|
| Store and history | `canvas.ts:63` store, `:65` `createHistory(store)`; dispatch sites `:826-827,844,929,931,951-952,956`; direct writes `:645,830,845,943,947`; shell writes `ui/App.tsx:165,295`; bridge `canvas.ts:979`, `canvas/handle.ts:101-110` | `createDocumentHistory(store, {origin})` behind the flag plus the routing of every row of the 2.3 inventory; not a single swap |
| Commands | `state/commands.ts:2,5-9,15-34`; `state/nexo.ts:78-92`; `ui/tabsWiring.ts:21-30` | field-level diffs into the Y.Doc; snapshot inverses unused in collab mode |
| Reconcile and bootstrap | `canvas.ts:162-230` (`:167-170,202,204-206`), `:637-647` | origin-gated side effects (2.3) |
| Document shape and serialization | `state/document.ts:18-24,89-94`; `state/serialize.ts:5-17` (`toCanvasV1(doc, tabs)`); `state/validate.ts:18-32` | lossless schema, two projections, pluggable `DOMParser` |
| Autosave effect | `state/autosave.ts:11-56`; `ui/App.tsx:200-223` (design prompt `:216`, hidden-tab flush `:217`, leave guard `:218`) | in collab mode the save loop is skipped; the prompt and the guard move to their own effects and read the collab status (unsent local updates); the pill reads the three ACKs |
| Save and download | `ui/App.tsx:88-95` `saveNamed`, `:248` download; `api.ts:310-344`; `plumber.R:118-139`; `storage.R:102-160` | `save` intent and version records (2.4); `checkpointDownload(id, workspace)` |
| Checkpoint dialog | `ui/Dialogs/CheckpointsDialog.tsx:9-35` | version list with Current, Restore, kinds and actors |
| Card inputs and render | `ui/Inspector/DataTab.tsx:69-71`; `ui/forms/SchemaForm.tsx:48-58`; `canvas.ts:233-247,933-959`; `cards.ts:287-296,422-431,441-442,563-576`; `cardStatus.ts:3-12`; `cards.R:229-292,332-367`; `render_disk.R:57-85`; `pool.R:247-266,328-352,461-479` | intents instead of direct PATCH; renders against the revision; stale results discarded; `renderState` badges |
| Statistics | `statistics.R:46-72,74-88`; `ui/Inspector/StatisticsTab.tsx:33-56`; `statistics/settings.ts:33-35`; `statistics/result.ts` | two confirmation intents (2.2) |
| Session identity, lock, registry, guard | `plumber.R:29-45,146-149,158-174`; `session.R:192-215,316-330,416-428,450-498,510-526,555-570`; `datasets.R:176-224` | generation ids, caller binding, leases, capacity, revision, join snapshot (2.1, 2.2) |
| Workspace scope and caller | `storage.R:11-25,65-79,89-100`; `datasets.R:211,349-387` | `api_service_caller`, workspace-aware resolve |
| Store records | `storage_files.R:76-93`; `storage.R:155-157` | blob references; prune exemption for collab saves |
| Admin token (client) | `api/adminToken.ts:19-40` (401 → `AdminSignInRequired` `:33`), `:44-47` headers, `:50` `knownAdminView` | provider token getter; refresh on `token_expiring`; Signed out only on 401 |
| Read-only and shell gates | `state/readonly.ts:5-17`; `ui/Rail.tsx:32-36`; `ui/Toolbar.tsx:37-59`; `ui/TabsBar.tsx:18`; `ui/Inspector/Inspector.tsx:21-28,51-56,64-73`; `ui/TopBar.tsx:4-12`; `ui/shell.css:7-8` | `canEdit()` beside `isReadOnly()` reading the server role; presentation only |
| Minimap and camera | `canvas.ts:404-420` (drawing, `replaceChildren` at `:415`), `canvas/minimap.ts:1-7` (visibility only), `canvas/handle.ts:100-110` (camera), `canvas.ts:823-824` (figure mode), `ui/App.tsx:291-296` (active tab) | remote viewports drawn at `:418-420`; follow coordinates camera, active tab and figure mode |
| Recovery | `api/session.ts:7-12,21-72`; `ui/sessionRecovery.ts:27-50`; `ui/App.tsx:226-244`; `api.ts:128-139` | sidecar-owned recovery by origin; `meta.session` re-aliasing through `api/session.ts` |
| Deployment | `OS/Linux/nginx-nexo-locations.conf:3-19`; `OS/Linux/lipidomic-api.service`; `OS/Linux/deploy-nexo.sh:16-30,58-82` | section 6 |
| Admin side | `session-token` route and helper; `nexo_caller` (0011); `mayOpenInNexo`; Open in Nexo (as cited by the review, F13) | `displayName` (no e-mail), migration 0012 people RPC, client access switch |

## 5. Phases

Effort is working days for one engineer who knows the code (basis in section 7). Tests follow TDD and Pareto: unit tests,
one integration test at the real boundary and one Playwright journey per phase, in the existing places
(`frontends/nexo/src/**/*.test.ts` with vitest, `tests/dual-ui/test_api_*.R` for R, `tests/dual-ui/test_nexo_*.cjs` for
browser suites driven from `tests/browser/ci`, `node:test` in `frontends/nexo-collab/test/`). Order rule (F19): nothing is
shown to a client account before Phases 1–3 are accepted; lab staff on staging see Phase 2.

### Phase 0 · Contracts, spike and real-path proofs (5–7 days)

**Goal.** Turn section 2 into test skeletons, prove the paths that are expensive to be wrong about on the real stack, and
keep the two-card demo. **What the user sees:** nothing shipped; two browsers move one card on the mock (scene 1, cards only).

**Depends on.** Admin token route (exists); Node runtime on the server (pinned, section 6); Gerardo's decisions D7, D11, D14.

**Deliverables.**

| Item | Size |
|---|---|
| Contracts 2.1–2.4 as failing test skeletons in their final places (names below) | M |
| `frontends/nexo-collab/` skeleton: Hocuspocus + SQLite persistence, **real** Admin verifier (`nexo_caller` through PostgREST with `apikey` + the user's token, as `datasets.R:362-378`), fake-PostgREST harness for tests | L |
| `OS/Linux/nginx-nexo-locations.conf`: `location /collab/` with `proxy_http_version 1.1`, `Upgrade`/`Connection` headers, `proxy_read_timeout 3600s`, inheriting `auth_basic`; `OS/Linux/nexo-collab.service`; `deploy-nexo.sh` installs both units and rejects 404 in the auth check | M |
| Proof on staging through the real tunnel and nginx: authenticated 101, unauthenticated rejection, bearer-protected API call behind Basic auth, reconnect after a 70 s idle | S |
| Mock two-card demo: geometry only, flag on, `createDocumentHistory` behind the flag, mock API | M |
| R race harness: `options(nexo.api.delay_patch)`, `nexo.api.hold_worker`, `nexo.api.fail_after_apply` hooks in the API used only by tests; a test that documents today's F03/F04 behaviour against `a95541a3` | M |
| Backup/restore exercise script (SQLite `.backup` + ZIP store copy + restore to a scratch directory + open one ZIP in Team) | S |

**R API changes.** Test hooks only. **Admin changes.** None.

**Tests.** `frontends/nexo-collab/test/{auth,server,backup}.test.mjs`; `tests/dual-ui/test_api_race_today.R` (red on purpose,
documents the stale worker result and the reordered PATCH); `tests/dual-ui/test_nexo_collab_spike.cjs` (two contexts, A
drags, B lands within 200 ms, B's undo does nothing); `collab/export.test.ts` round trip on the real fixtures.

**Acceptance.** 101 through the tunnel with Basic auth and the bearer call both green; the race tests reproduce F03/F04;
flag off leaves vitest and the browser suites unchanged. **Risks.** Pinning Hocuspocus and Yjs; the tunnel's idle timeout.

### Phase 1 · Secure project sessions in R (8–10 days, R API only, no client release)

**Goal.** Make the API safe for several identities before any shared board exists: ids, binding, service identity,
project-bound sessions, leases, revision, join snapshot, workspace-aware lookup. Also fixes 9.B1–B3 and B6 for single-user
mode. **What the user sees:** nothing new; single-user Nexo behaves as before, plus the fixes.

**Depends on.** Phase 0; D7, D11.

**Deliverables.**

| Item | Where | Size |
|---|---|---|
| Generation-prefixed random session ids; previous generation → `409 session_lost` | `session.R:450-479`, `datasets.R:188-216` | M |
| `api_session_get(id, caller)`: bearer required on every session route when `REQUIRE_USER=1`; workspace binding; collab sessions accept mutations from the service identity only | `plumber.R` (all session routes), `session.R:481-490` | L |
| `api_service_caller()`: HS256 verification, loopback only, claims → caller with one workspace; `X-Nexo-Actor` recorded in logs by id | new `frontends/nexo-api/service.R`, `datasets.R:350` call sites | L |
| Project-bound collab sessions: `POST /sessions {collab: {project, workspace}}` and `/datasets/sessions` likewise; no SHA reuse; `GET /sessions/<id>/join` snapshot; `POST /sessions/<id>/lease`; capacity `503 capacity`; LRU/idle/soft guard honour leases | `session.R:455-479,491-498,557-570`, `datasets.R:192-216`, `plumber.R:141-174` | XL |
| Engine revision on every mutation and render answer; `intentId` idempotency map; stale worker result rendered on main; global in-flight dedup; `cacheable` in the schema | `session.R` (new counter), `cards.R:260-291,332-367`, `pool.R:328-352,461-479`, `schema.R` | L |
| Workers keyed by opened content, not latest ZIP SHA; health lists workers, leases, pressure | `pool.R:216-222,247-248`, `plumber.R:76-78` | M |
| `api_checkpoint_resolve(id, caller, workspace)`; staff may name a client workspace; collab saves exempt from the autosave prune; `DELETE` for unreferenced blobs | `storage.R:65-79,155-158`, `plumber.R:97-116` | M |
| Clients honour `Retry-After` with a 180 s deadline (single-user too) | `api.ts:56-67,338-343` | S |

**Admin changes.** None.

**Tests.** `tests/dual-ui/test_api_collab_auth.R` (raw HTTP, two fake identities from `test_api_checkpoint_scope.R`: A cannot
read or mutate B; Viewer token cannot PATCH a collab session; direct confirm refused; service token for workspace A refused on
B; previous generation → 409); `test_api_collab_session.R` (project-bound open, join snapshot without canvas, lease keeps a
quiet session at minute 3, soft pressure keeps two leased sessions, third open → capacity, same-checkpoint fork → two
sessions); `test_api_revision.R` (revision on PATCH and render; reordered PATCH replies through the harness; stale worker
rendered on main with `where=main`; identical simultaneous renders → one job; two DPRs → two); `test_api_pool.R` extended
(save then render stays on a worker); `test_api_checkpoint_scope.R` extended (staff save → download → restart → reopen on a
client workspace). Existing suites unchanged with `REQUIRE_USER=0`.

**Acceptance.** Every session route refuses an id alone when `REQUIRE_USER=1`; the race tests of Phase 0 turn green;
`/health` shows leases and workers; single-user staging run of `nexo-phase1.md`'s checks unchanged. **Risks.** Route edits
are many and mechanical (one helper, one call per route); the lease and the soft guard interact with memory on the 8 GiB host
(measure main + three workers with two live projects before setting `LIPIDOMIC_API_LIVE_PROJECTS`).

### Phase 2 · Bridge, exporter and shared board (11–13 days, lab staff on staging behind the flag)

**Goal.** Several lab staff edit layout, labels, tabs and style live, see each other and undo their own work; nothing is lost
when a tab closes; tokens expire and refresh silently. **What the user sees:** scene 1 (avatars, cursors, selections, editing
chip, others' viewports), scene 7 (Live, Syncing, Reconnecting, Read-only, Signed out).

**Depends on.** Phase 1 accepted; D13.

**Deliverables.**

| Item | Where | Size |
|---|---|---|
| Lossless schema, two projections, pluggable `DOMParser` (`linkedom`), vector file, admission and repair in the sidecar | new `collab/schema.ts`, `collab/export.ts`, `collab/validate.vectors.json`; sidecar `src/admission.ts` | XL |
| Bridge with explicit origins; every row of the 2.3 inventory routed; reconcile side effects gated; personal state (active tab, camera) in awareness; flag-off isolation by dynamic import | `canvas.ts:65,162-230,637-647,830,845,941-948`, `ui/App.tsx:160-166,291-296`; new `collab/history.ts`, `collab/mode.ts`, `collab/provider.ts` | XL |
| Per-user undo adapter (2.3) | `collab/history.ts` | L |
| Presence: cursors, selection, viewport, editing chip; remote viewports drawn in the minimap | `canvas.ts:250,404-420`; new `canvas/presence.ts`, `collab/awareness.ts`, `ui/Presence/Avatars.tsx`; `ui/TopBar.tsx:4-12`; `ui/Inspector/Inspector.tsx:64-67`; `ui/forms/SchemaForm.tsx` focus/blur | L |
| Autosave replaced safely: the save loop is skipped in collab mode; the **design prompt** (`App.tsx:216`) and the **leave guard** (`:218`) move to their own effects (the guard fires while the provider reports unsent local updates); `y-indexeddb` from this phase so unsent edits survive a closed tab; pill from the sidecar's status | `ui/App.tsx:200-223`; `package.json` | M |
| Expiry, refresh, revocation, role push, Signed out only on 401, namespaced persistence (2.1) | sidecar `src/expiry.ts`; `collab/provider.ts`; `api/adminToken.ts` unchanged | L |
| Project creation and join flow: `?project=<id>`; first `?dataset=` open keeps the Prepare dialog, then the sidecar creates the project and the URL becomes `?project=`; two simultaneous Open in Nexo clicks are serialised per dataset | `main.tsx:33-55`; sidecar `src/projects.ts` | M |
| Sidecar-owned recovery by origin (2.2), used from this phase because the shared session can be lost | sidecar `src/recover.ts`; `ui/App.tsx:226-244`; `api/session.ts` | L |
| Admin: `displayName` for lab staff in the session-token answer (never e-mail) | Admin route and helper (F13 citations) | S |

**R API changes.** None beyond Phase 1. **Admin changes.** `displayName` (staff only in this phase; members need 0012).

**Tests.** vitest `collab/export.test.ts` (round trip on real canvases; every limit at and past; merge repairs),
`collab/history.test.ts` (alternating fields, async folds, remote edits between local edits, undo after restore, two devices,
same-node concurrent writes), `collab/awareness.test.ts`; `node:test` `admission.test.mjs` (raw updates: Viewer refused,
mixed update refused whole, protected paths refused, forged awareness overwritten), `expiry.test.mjs` (refresh success,
real sign-out, 403/no scope, Admin outage, archived membership, role downgrade while connected, no replay across accounts);
Playwright `test_nexo_collab_presence.cjs` (A types while B moves, convergence; B's Ctrl+Z does not move A's card; the
exported Team JSON of both is equal including `savedActive`), `test_nexo_collab_leave.cjs` (edit, cut the socket, close the
tab: the leave guard fires; reopen: the edit is there), `test_nexo_collab_flagoff.cjs` (no `/collab/` request, no yjs chunk).

**Acceptance.** Two lab staff on staging edit one project for ten minutes with equal exports; a closed tab with unsent edits
asks first and loses nothing; a token expiry during the session shows no Signed out; the 34 existing browser suites and
vitest unchanged with the flag off. **Risks.** `linkedom` parity with browser parsers (the vector file is the gate); the
bridge touches every write path, so the inventory test per row is the safety net.

**Phase 2 as cut (Gerardo, 2026-11-09: keep it simple, lab staff only in this phase).** Build the table above minus:
- *Admission:* no shared HTML validator, no `linkedom`, no vector file. The sidecar refuses updates that touch protected
  paths (2.1) or exceed the size limits, and the role rule (Viewer refused) holds; deeper content validation is reconsidered
  in Phase 5, when clients join.
- *Presence:* avatars, cursors, selection and the editing chip; no remote viewports in the minimap.
- *Persistence:* no `y-indexeddb`. The leave guard still fires while the provider reports unsent updates; an edit that never
  reached the sidecar is lost if the person leaves anyway. (Phase 7, itself a candidate to cut, owns offline persistence.)
- *Expiry:* reconnect with a fresh `adminToken()` when the socket closes for an expired token, revalidate scope every 60 s
  (4403 closes), Signed out only on 401. No `token_expiring` pre-warning, no role push (roles arrive in Phase 5).
Tests follow the cut: `test_nexo_collab_leave.cjs` checks the guard fires (not that the edit survives a closed tab);
`admission.test.mjs` covers Viewer refused, protected paths refused, oversize refused, forged awareness overwritten;
`expiry.test.mjs` covers reconnect after expiry, real sign-out, lost scope.

### Phase 3 · Science commit protocol (10–12 days)

**Goal.** Inputs, actions, global settings, statistics and Finish go through one order and land once in R and in the
document; renders are parallel and never stale. **What the user sees:** scene 2 (soft-lock banner, "Updating… changed by
X", "Updated by X", engine pill with queue, statistics invalidated with attribution) and the Engine busy state of scene 7.

**Depends on.** Phases 1–2; D2 (lab-only toggle).

**Deliverables.**

| Item | Where | Size |
|---|---|---|
| Commit log, intent messages, per-project serial queue, global barrier, idempotency, typed failures, crash re-drive (2.2) | sidecar `src/commits.ts`, `src/engine.ts` | XL |
| Client intents replace direct PATCH: Data tab and SchemaForm, actions, uploads, computed controls, design, analysis, cohort, palette dialogs; held edits (`api.ts:128-139`) unused in collab | `ui/forms/SchemaForm.tsx:48-58`, `ui/Inspector/DataTab.tsx:69-72`, `canvas.ts:233-247,826-837,933-959`, the analysis/cohort/palette/design dialogs | L |
| Renders against the revision: discard and re-request on mismatch; "Updated by" from `renderState`; busy pill from the project queue | `cards.ts:422-431,441-442,563-576`, `cardStatus.ts`; new `collab/render.ts` | M |
| Two statistics protocols; attribution of invalidation | `ui/Inspector/StatisticsTab.tsx:33-56`, `statistics/settings.ts:35`, `statistics/result.ts`; sidecar `src/statistics.ts` | L |
| Finish / Edit figure intents with lab-only and server validation of the snapshot | `canvas.ts:926-931`, `ui/Inspector/Inspector.tsx:23` | S |
| Forced-interleaving suite on real R (the Phase 0 harness) | `tests/dual-ui/test_api_collab_commits.R`, `frontends/nexo-collab/test/commits.test.mjs` | M |

**R API changes.** None beyond Phase 1 (the headers and idempotency map exist). **Admin changes.** None.

**Tests.** `node:test` `commits.test.mjs` (two intents on different cards; same card within 2 s → later wins, earlier gets the
named Undo mine; global kind drains the queue; crash between R and commit re-drives by intentId); R `test_api_collab_commits.R`
(delayed PATCH replies, stale worker, timeout, save during edits, R restart → R and document agree); Playwright
`test_nexo_collab_inputs.cjs` on the **real API** on staging (A changes Lipid: one worker job, B shows "Updated by A" from
the cache; while A's Data tab has focus B sees the banner; B's conflicting change gets the toast; a confirmed violin statistic
is invalidated with "changed by A" after A's input change; a group-comparison second confirm sees "superseded").

**Acceptance.** Five minutes of two people changing inputs on different cards: `Server-Timing` shows one computed render per
change, zero stale images (revision header audit), no 503 surfaces as an error. **Risks.** Latency of serial commits (R's
lock is serial anyway; measure); the number of dialogs to route (listed above, each small).

### Phase 4 · Versions, restore, export and backup (8–10 days)

**Goal.** Saving moves to the sidecar: durable version records, autosave and named versions, restore with a safety
snapshot and engine reopen, activity feed, backup drill, and the proof that every version opens in Team with its science.
**What the user sees:** scene 6 (versions with Current and kinds, Restore, named by, activity, restore toast with Undo,
"Live · saved 10:44").

**Depends on.** Phase 3; D4.

**Deliverables.**

| Item | Where | Size |
|---|---|---|
| SQLite version and blob tables, pending/committed protocol, per-project retention, GC through `DELETE /checkpoints/<id>` | sidecar `src/versions.ts`, `src/gc.ts` | L |
| Save flow with barrier, service identity and actor; autosave policy per project; three ACKs in the pill; Download = save then download that version | sidecar `src/exporter.ts`; `ui/App.tsx:88-95,248`; `ui/TopBar.tsx:4-12`; `ui/strings.ts` | L |
| Restore with `before-restore`, engine reopen from the blob, document replacement, intent requeue; Undo = restore the snapshot | sidecar `src/restore.ts`; `collab/versions.ts` | XL |
| Version history UI and activity feed in collab mode | `ui/Dialogs/CheckpointsDialog.tsx:9-35`; new `ui/Dialogs/VersionHistory.tsx`, `ui/ActivityPanel.tsx`; `ui/Rail.tsx:32-36` | M |
| Workspace-aware download in the client | `api.ts:334-344`, `ui/App.tsx:248` | S |
| Backup/restore drill (section 6) on staging, documented in `frontends/nexo-collab/README.md` | ops | M |

**R API changes.** None beyond Phase 1. **Admin changes.** None.

**Tests.** vitest `collab/versions.test.ts` (list order, kinds, Current = the restored version, retention per project);
`node:test` `versions.test.mjs` (pending → committed, crash reconciliation, two projects sharing a blob, GC only at zero
references); R `test_api_collab_versions.R` (service-identity save lands in the project's workspace; a member outside gets
`403 forbidden_scope`; the ZIP opens with `read_session_archive(include_team_canvas = TRUE)` and `api_session_open`; the
reopened session's inputs, analysis, design, actions and cohort equal the version's; project records byte-identical to the
opened checkpoint); Playwright `test_nexo_collab_versions.cjs` (A restores round 2 while B moves a card; B's move after the
restore survives; A's Undo restores the safety snapshot; the feed shows both).

**Acceptance.** A sidecar-written version opens in Team with every card drawn (the Team round-trip check of
`nexo-phase1.md`); viewer-only presence still autosaves; the backup drill restores a scratch copy whose versions open.
**Risks.** Restore latency (an R open on the pilot checkpoint is seconds; the barrier is visible, so the UI says "Restoring…").

### Phase 5 · Roles, sharing and client access (5–7 days)

**Goal.** Per-project roles chosen among Admin accounts and enforced by the sidecar; names for client members without
e-mails; client members reach Nexo in production. **What the user sees:** scene 4 (share dialog, Lab/Client badges,
default role, lab-only Finish and Confirm, Manage people in Admin).

**Depends on.** Phases 1–4 accepted on staging; Admin 0012 (D12); D8, D9.

**Deliverables.**

| Item | Where | Size |
|---|---|---|
| Roles table, share dialog, role matrix and protected paths per role (2.1), owner-only share and restore, lab-only toggles | sidecar `src/roles.ts`; new `ui/Dialogs/Share.tsx`, `collab/roles.ts`; `ui/TopBar.tsx`; `canEdit()` at `ui/Rail.tsx:32-36`, `ui/Toolbar.tsx:37-59`, `ui/TabsBar.tsx:18`, `ui/Inspector/Inspector.tsx:21-28,73` | L |
| Admin migration 0012: `client_member.display_name` (nullable), `admin.nexo_people(p_client_id)`; `displayName` for members in the session-token answer, null → `Member · <client>` label | Admin (needs Gerardo's OK before staging, like 0010/0011) | L |
| `NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1` in production after the staging E2E | Admin env and README | S |
| Raw-protocol and PGlite tests | `frontends/nexo-collab/test/roles.test.mjs`; `db/admin/test/nexo_people.test.js` | M |

**R API changes.** None. **Admin changes.** 0012 and the switch.

**Tests.** vitest `collab/roles.test.ts`; `node:test` `roles.test.mjs` (Commenter update refused and not broadcast; comment
accepted; Editor altering protected metadata refused; same-workspace non-member refused at connect; role change takes
effect on the next message; archived membership closes the socket); PGlite `nexo_people.test.js` (staff, member of that
client, member of another client, anon; no e-mail column); Playwright `test_nexo_collab_roles.cjs` (a Commenter cannot move a
card, the card snaps back with the reason, and can comment; a client Editor sees no Finish and a hand-built finish intent is
refused).

**Acceptance.** The staging E2E of `admin-identity.md` extended with two synthetic client members and one staff account on
one project; each member opens only its client's projects; logs show refusals by id only. **Risks.** 0012's review cycle.

### Phase 6 · Comments, follow and summon (5–7 days)

**Goal.** The client's main contribution (comments) and the meeting pattern (follow a presenter, bring everyone here).
**What the user sees:** scene 3 (pins, thread, mentions, Resolve, optional vote), scene 5 (presenter ring, Following bar,
"brought everyone here").

**Depends on.** Phase 5 (people list for mentions, Commenter role); Phase 4 (activity entries).

**Deliverables.** `comments` map with Commenter permissions; pins in the presence layer (`canvas.ts` comment mode); panel,
thread, composer with a mention picker fed by `nexo_people` scoped to the project's client and lab staff; follow that
coordinates camera (`canvas/handle.ts:100-110`), active tab (`ui/App.tsx:291-296`) and figure mode (`canvas.ts:823-824`),
handles different viewport sizes, target leaving and Stop following; summon for Editors and Owners; the existing small-screen
sheet (`canvas.ts:72`, `ui/shell.css:7`) wired to the role's comment permission. Votes behind a flag until D5.

**R API changes.** None. **Admin changes.** None.

**Tests.** vitest `collab/comments.test.ts`, `collab/follow.test.ts` (camera from a viewport rectangle at any zoom and
viewport size; tab and figure-mode switches); Playwright `test_nexo_collab_follow.cjs` (A summons; B's camera, tab and mode
match within one frame **after** receipt; B stops following; B comments and A sees the pin; a Viewer cannot comment; comments
never appear in an exported checkpoint, both members asserted).

**Acceptance.** Follow works at 50 / 100 / 150 % zoom in Chromium and WebKit and across tabs. **Risks.** Low.

### Phase 7 · Offline queue, merge safety and phones (3–4 days)

**Goal.** Edits survive a dropped connection and merge back safely; phones join presence with their role. **What the user
sees:** scene 7 (Offline, Reconnecting, Syncing; at 390 px the phone with avatars and the card sheet).

**Depends on.** Phases 2 (IndexedDB, expiry), 4 (`before-merge` version), 5 (roles), 6 (follow).

**Deliverables.** `collab/offline.ts`: queue age; a queue older than 15 min asks the sidecar for a `before-merge` version
(service identity) before applying; account boundary (a queue from another subject is discarded with a prompt); conflict
surface for science intents queued offline (they are re-sent as intents, so they are refused or applied in order, never
merged as document writes). Phones: device detection chooses layout only (`readonly.ts:5-9`); the server role decides
editing; `?mode=edit` on a phone is allowed when the role allows (D13).

**R API changes.** None. **Admin changes.** None.

**Tests.** vitest `collab/offline.test.ts`; Playwright `test_nexo_collab_offline.cjs` (`context.setOffline(true)` on B, B edits,
A edits, B back online, both converge; "Before merge" appears when the queue was old; a 390 px coarse-pointer context with a
Viewer role shows avatars, can follow, cannot edit or comment; the same device with an Editor role and `?mode=edit` can edit).

**Acceptance.** No edit lost in ten offline/online cycles; the phone suite passes in Chromium and WebKit. **Risks.** IndexedDB
quotas and private mode (fall back to memory and say so).

**Phases 3–7 as cut (Gerardo, 2026-11-09: keep it simple, TDD, provable E2E).** Each phase builds the smallest version of
its table above:
- *Intent contract (Phase 3, shared by client and sidecar).* Client → sidecar stateless message
  `{type:'intent', intentId, kind, target:{nodeId?}, payload, baseRevision}`; sidecar → that client
  `{type:'intent-result', intentId, revision}` or `{type:'refused', intentId, reason}`. The sidecar runs intents one at a time per
  project on the engine's existing per-project queue (`engine.mjs`), calls R with the service identity and `X-Nexo-Intent`, then
  writes the settled values into the document in one transaction with origin `server` (`nodes.<id>.instance.inputs`,
  `nexo.nodes.<id>.inputs|actions`, `meta.engineRevision`, and `meta.lastChange = {nodeId, actor, displayName, kind, revision}`).
  Kinds: `inputs`, `action`, `createCard`, `parkCard`, `design`, `analysis`, `cohort`, `palette`, `applyViolin`,
  `confirmBaseline`, `finish`, `editFigure`, `save`, `restore`. Uploads stay single-user (the control says so in collab mode).
- *Phase 3 cuts:* no SQLite commit log or crash re-drive (R's 10-minute intent idempotency covers retries; a sidecar restart
  refuses pending intents back with "please redo"); no soft-lock banner; "Updated by X" from `meta.lastChange`; statistics
  invalidation shows "changed by X" without per-field detail; Finish/Edit figure lab-only (D2) with the size limit as the only
  snapshot check. Renders: the client discards a render whose revision header is older than `meta.engineRevision` and asks again.
- *Phase 4 cuts:* versions are rows in the sidecar's SQLite (`versions`: project, id, kind named|autosave|before-restore,
  checkpointId, actor, createdAt) pointing at checkpoints R already stores; no separate blob table or GC; autosave every 5 minutes
  only when the revision changed, keeping the last 20 autosaves per project in the list; restore = save `before-restore`, reopen R
  from the version's checkpoint, replace the document from the open answer (origin `server`); Undo = restore that snapshot. No
  activity feed; the pill shows "Live · saved hh:mm" after a version is written. Download = the latest version's checkpoint.
  Wire shapes: `GET /collab/projects/<id>/versions` → `[{id, kind, name, checkpointId, actor, displayName, createdAt, revision}]`
  newest first; after a restore the sidecar writes `meta.restoredFrom = {versionId, beforeRestoreId, by, displayName, at}`, so
  Undo = intent `restore {versionId: meta.restoredFrom.beforeRestoreId}` (never "the newest before-restore row"); after any
  version is written, `meta.savedAt` (ms).
- *Phase 5 cuts:* roles Owner (creator), Editor, Commenter, Viewer in the sidecar (one table, one matrix); share dialog lists
  `admin.nexo_people` (migration 0012, applied to staging only with Gerardo's OK); lab-only rules are fixed (no toggles);
  production client access only with Gerardo's OK.
  Wire shapes: migration `004_members.sql` (project, user_id, role owner|editor|commenter|viewer); effective role =
  the row, else `owner` for `projects.created_by`, else lab staff `editor`, else client member `commenter` (D8). Matrix:
  Owner = Editor + share + restore; Editor = board and intents (not restore); Commenter = `comments` only + awareness;
  Viewer = awareness only; Finish/Edit figure/confirmBaseline stay lab-staff only whatever the role. On connect and whenever
  it changes the sidecar sends that connection stateless `{type:'role', role, canShare}`; a change also re-applies
  `connection.readOnly`. Routes (Admin token, project scope): `GET /collab/projects/<id>/members` →
  `{members:[{userId, displayName, kind, role}], people:[{userId, displayName, kind}]}` (people = `admin.nexo_people` for the
  project's client, called on PostgREST with the caller's token; empty list for lab-only workspaces) and
  `PUT /collab/projects/<id>/members/<userId> {role}` (Owner or lab staff; `DELETE` to remove). Client: role viewer or
  commenter puts the board in the existing read-only mode (`state/readonly.ts`, new reason `role`); a role push that changes
  editability reloads the page; Share dialog (Owner/staff) lists people and roles.
  *Who restores (Gerardo, 2026-11-10): the project's Owner and lab staff; a client Editor is refused `owner_only`.*
- *Phase 6 cuts:* comments (pin, thread, resolve) in a `comments` map, Viewer refused; no mentions, no votes; follow = adopt
  another person's `view` from awareness (camera and tab), Stop following; summon = a stateless "follow me" that staff and
  Editors may send.
- *Phase 7 cuts:* no IndexedDB, no `before-merge` versions, no account-boundary queue: the provider's in-memory queue must
  converge after `setOffline` cycles (tested); phones get the read-only layout with avatars, and edit only with `?mode=edit` when
  the role allows.
- *Proof:* every phase ends with its Playwright journey green against the **real path** on the RTX (R API + sidecar + fake
  Admin PostgREST + built client, `tests/dual-ui/collab-real.cjs`), plus its unit suites, and a recorded video for Gerardo.

### Totals and order

| Phase | Days | Depends on | Release | Scenes lit |
|---|---|---|---|---|
| 0 Contracts, spike, real-path proofs | 5–7 | D7, D11, D14 | none | 1 (cards only) |
| 1 Secure project sessions in R | 8–10 | 0 | single-user fixes (9.B1–B3, B6) | — |
| 2 Bridge, exporter, shared board | 11–13 | 1; D13 | lab staff, staging, flag | 1, 7 |
| 3 Science commit protocol | 10–12 | 2; D2 | lab staff, staging | 2, 7 |
| 4 Versions, restore, export, backup | 8–10 | 3; D4 | lab staff, staging | 6 |
| 5 Roles, sharing, client access | 5–7 | 4; Admin 0012 (D12); D8, D9 | **first client release** | 4 |
| 6 Comments, follow, summon | 5–7 | 5 | clients | 3, 5 |
| 7 Offline, merge safety, phones | 3–4 | 2, 4, 5, 6 | clients | 7 |
| **Total** | **55–70** | | | |

Phases 1 and 2 overlap partly (the R work of Phase 1 and the browser-only parts of Phase 2 are independent until the first
real-API presence test); Phases 6 and 7 can start once Phase 5 is on staging.

## 6. Deployment and backup checklist

- **Runtime.** Node pinned (an LTS line, exact version in `frontends/nexo-collab/.node-version` and in the unit); `npm ci`
  from a committed lockfile; SQLite through Node's built-in `node:sqlite` (no native module; decided in Phase 0); Hocuspocus, Yjs, `y-indexeddb`, `linkedom` pinned.
- **Unit.** `OS/Linux/nexo-collab.service`: loopback bind, its own user unit beside `lipidomic-api.service`,
  `Restart=on-failure`, `MemoryMax=512M`, `WorkingDirectory` on a writable persistent directory owned by the service user
  (SQLite file, WAL, journal), environment file (mode 600) with the service secret and the API loopback URL; the API unit's
  environment file carries the same secret for verification. Secrets never in the repo.
- **Schema migrations.** Versioned SQL files applied at start-up inside a transaction; a failed migration stops the unit;
  rollback is a restore from backup (documented), never a hand edit.
- **Rollout order.** API (Phase 1 routes are additive) → sidecar → Nexo static build; health and readiness: `/api/v1/health`
  (sessions, workers, leases, pressure) and `/collab/health` (SQLite open, migrations applied, Admin reachable).
- **nginx.** `location /collab/` with the WebSocket upgrade block, `auth_basic` inherited; the deploy script installs the
  snippet or fails (no printed instructions); the unauthenticated check accepts **401 only** (404 is a failure); a
  post-deploy probe does an authenticated 101 through the tunnel, a bearer-protected `GET /api/v1/checkpoints` behind Basic
  auth, and a 70 s idle socket that stays up; `client_max_body_size` checked against a valid 24 MiB canvas on `/api/`.
- **Backup.** Nightly: `sqlite3 collab.sqlite ".backup"` (WAL-safe) then a copy of the checkpoint store; the two are taken
  with saves paused (the sidecar exposes `POST /collab/admin/pause` on loopback) so version rows and blobs agree; retention
  of 14 daily copies; the restore drill (quarterly and at Phase 4 acceptance) restores both into a scratch directory, starts a
  scratch sidecar and API, lists versions, and opens one version ZIP in Team.
- **Observability.** Refusals, admissions, capacity waits and commit failures logged by project id and user id only; a
  counter of stale renders discarded (should be rare) and of repairs.

## 7. Effort estimate and its basis

Revision 1 said 31–41 days. The review showed that number covered client and sidecar features while the authorization
contract, the commit protocol, the bridge inventory, durable versions and deployment were assumed small or absent; it is not
carried forward. The new estimate is built bottom-up from the item tables of section 5 with four sizes: **S** = half a day,
**M** = one day, **L** = two days, **XL** = three days, each including its tests (this repository ships a `tests/dual-ui`
suite per R route and a vitest plus Playwright pair per client feature, which is roughly half of each item). Per phase the
items sum to 6, 9, 12, 11, 8.5, 5.5, 6 and 3 days; the ranges in the totals table add about ±10 % for integration on
staging. Calibration points from the repository: the store-per-client change (migrations 0010/0011, `datasets.R`,
`storage.R`, `test_api_checkpoint_scope.R`, `nexo-store-scope.md`) is one L plus one M of Phase 1's kind; the render-worker
pool (`pool.R`, `test_api_pool.R`, `test_api_pool_warm.R`) is one XL plus one L of the engine kind. Excluded on purpose: any
Team or Classic change, fork (D3), votes (D5), a sidecar status on Admin's order page. Plan on **55–70 working days** for
one engineer who knows the code, with the first client-visible release at the end of Phase 5 (about 45–55 days in).

## 8. Response to the review

| Finding | Response | How |
|---|---|---|
| F01 session ids and route authorization | adopted differently | Hybrid, not pure gateway: generation-prefixed random ids; bearer and workspace binding on **every** session route including legacy; collab mutations only through the sidecar's service identity; reads direct with the person's token (2.1). Raw HTTP denial tests in Phase 1. |
| F02 protected fields and action authorization | adopted | Server-written paths, writable paths per role, shadow-doc validation of whole updates, intents for Finish and both confirmations, stamped awareness identity (2.1). |
| F03 no ordering authority | adopted | Commit log with serial per-project order, global barrier, server-published settled values, idempotency, crash re-drive; renders parallel against a revision (2.2). |
| F04 browser render key, stale worker result | adopted | Engine revision and render identity issued by R, revision headers on JSON and PNG, stale worker result rendered on main, global in-flight dedup, `cacheable` flag (2.2); also 9.B1. |
| F05 factory swap | adopted | Inventory of every write and side effect with origins; all engine side effects gated; flag-off isolation proven by test (2.3); per-file scope and estimate rewritten (sections 5, 7). |
| F06 lease vs heartbeat, soft guard | adopted | Leases renewed every 60 s with a 180 s TTL, LRU/idle/soft guard honour them, capacity admission in the sidecar, no SHA reuse for collab sessions, generation-aware recovery (2.2). |
| F07 restore leaves science behind | adopted | Restore reopens R from the version's blob, replaces the document in one transaction, requeues intents; before-restore snapshot; Undo = restore the snapshot; scientific equivalence is the acceptance (2.4). Team's validator untouched. |
| F08 join and recovery | adopted | Join snapshot without canvas, hydration order, no bootstrap replay for joiners, two recovery paths by origin with persisted preparation settings (2.2). |
| F09 staff cannot read client checkpoints | adopted | `api_checkpoint_resolve(id, caller, workspace)` and `checkpointDownload(id, workspace)`; legacy staff list unchanged (2.4). |
| F10 exporter projection and invalid merges | adopted | Lossless schema without `z`/`render`, two allowlisted projections, admission and repair with `parked`, deterministic `savedActive` (2.3). |
| F11 undo contract | adopted | Adapter reproducing coalescing, boundaries, cap, cursor; field-level inverses; undo per editing session; Undo mine bound to the intent (2.3). |
| F12 expiry and revocation too late | adopted | Phase 2, before any client release: `token_expiring`, refresh and reconnect, 60 s scope revalidation, role push, Signed out only on 401, namespaced persistence (2.1). |
| F13 Admin supplies scope, not names | adopted | Profile contract without e-mails, `client_member.display_name`, `nexo_people`, safe label, no role inference (2.1, D12). Admin files could not be re-opened in this checkout; the finding is taken as given. |
| F14 worker replicas and save-induced pool loss | adopted | Workers keyed by opened content, health lists workers and leases, cancellation on close/recovery, memory measured with workers before setting capacity (2.2, Phase 1); also 9.B6. |
| F15 503 loop is not a queue | adopted differently | No render queue in R: typed `busy`/`capacity`/`admin_unavailable`/`session_lost`/`render_stale`/`engine_timeout` responses, `Retry-After` honoured with a 180 s deadline, idempotent intents; the project queue and its position live in the sidecar, where every client can see them (2.2). |
| F16 exporter not Node-pure, wrong fixtures | adopted | Pluggable `DOMParser` with `linkedom`, shared vector file run in three runtimes, real canvases as fixtures, real-API two-client test in Phase 3 instead of mock counts (2.3, Phases 2–3). |
| F17 checkpoint blobs are not versions | adopted | SQLite version and blob tables, per-project retention, GC at zero references, pending/committed protocol, prune exemption for collab saves (2.4). |
| F18 relay leaves recovery undefined | adopted | Decision: scoped service identity with actor attribution; relay only as optional attribution for named versions; three ACKs (2.1, 2.2, D7). |
| F19 phase order removes safety first | adopted | New order: R security and isolation (Phase 1), bridge with the design prompt, leave guard, IndexedDB and expiry (Phase 2), ordering (Phase 3), versions (Phase 4), then the first client release (Phase 5); real Admin authentication in the spike; new estimate (sections 5, 7). |
| F20 deploy and backup | adopted | Section 6: pinned runtime, lockfile, unit and writable directory, migrations, upgrade block, 401-only check, tunnel 101 probe, bearer behind Basic auth, SQLite+ZIP backup with a restore drill. |
| F21 prototype disagrees with the plan | adopted differently | One authoritative sequence, auth wording, role matrix, parallel engine, safety snapshot not Current, roadmap updated and PNGs regenerated; "Save as" is **removed** from the plan's promises (fork deferred, D3) rather than built, and the prototype never showed it. |
| F22 minimap seam, follow, phones | adopted differently | Seam corrected to `canvas.ts:404-420`; follow coordinates camera, tab and figure mode; "one frame" bound to applying after receipt; the `?mode=edit` override is **kept** as a layout choice while roles are enforced server-side (D13) instead of being removed; the existing sheet is wired, not re-made. |
| F23 statistics conflated | adopted | Two protocols with server-side authorization, first-confirm at the commit log, revision-bound results and attribution of invalidation (2.2). |
| F24 anchors and Current marker | adopted | `api.ts` (not `api/client.ts`), `canvas.ts:404-420`, decision numbers D1–D14 used consistently, `adminToken.ts:50`, `storage.R:104` named as the canvas ACK correlation-token rule, prototype Current fixed. |

Counts: 20 adopted, 4 adopted differently, 0 rejected. Every finding was re-checked against `a95541a3` where the files are in
this checkout (section 1 lists the lines); F13's Admin citations were not re-opened.

## 9. Single-user bugs the review exposed (Phase-1 fixes outside collaboration)

Each is a defect of today's single-user Nexo, independent of any sidecar, and lands in Phase 1 with its own test.

- **B1 · Stale worker result returned with current provenance (F04).** `frontends/nexo-api/pool.R:461-479`: when the memory
  key no longer matches (`:474`) the result is not cached, but `:479` still returns it and `:470-471` stamp it with the
  current `s$sha256` and `s$revision`. A PATCH or a cohort change while a worker draws shows the old plot as current. Fix:
  on mismatch call `render_here()`; never rewrite provenance. Test: `test_api_pool.R` with the hold-worker hook.
- **B2 · Session ids are a reused counter (F01).** `session.R:451,475-476`, `datasets.R:212-213`; `nexo-store-scope.md:28`
  claims the opposite. After a restart an old browser addresses a different live session with the same id. Fix: generation
  prefix plus 128 random bits; previous generation → `409 session_lost`. Tests: `test_api_session.R`, `test_api_unknown_session.R`.
- **B3 · Session routes never check the caller (F01).** `plumber.R:118-129,158-180,223-298,395-411` take the id alone even
  with `REQUIRE_USER=1`, so a member of client A holding B's id can read, mutate or close B's session. Fix:
  `api_session_get(id, caller)` with workspace binding. Test: `test_api_collab_auth.R` (raw HTTP, two identities).
- **B4 · Dataset sessions cannot recover before the first save (F08).** `ui/sessionRecovery.ts:28` throws without a
  checkpoint; a `?dataset=` session evicted by LRU or idle expiry ends in "Session lost · Reload" with the work gone. Fix:
  a dataset branch that reopens with the persisted preparation settings (`datasets.R:176-179`) and the same replay. Test:
  `test_nexo_canvas_open.cjs` extended with a mock eviction on a dataset session.
- **B5 · Autosave prune is per workspace, not per checkpoint lineage (F17).** `storage.R:155-157` keeps five `autosave`
  records across the workspace; two people on two checkpoints in one workspace prune each other's autosaves. Fix: prune by
  lineage (the opened checkpoint id recorded on the autosave) or per session. Test: `test_api_storage.R`.
- **B6 · Workers stop serving a session after every save (F14).** `storage.R:154` sets `s$sha256` to the new ZIP's SHA;
  `pool.R:247-248` serves only workers holding that SHA; workers are retargeted only by a new open (`session.R:458`). After an
  autosave every render falls back to the main process until the page reopens. To confirm first with `test_api_pool.R`
  (save, then render, expect `where=worker`); fix by keying workers on the opened content identity.
- **B7 · The 503 retry ignores `Retry-After` and gives up at about 30 s (F15).** `api.ts:60` (60 × 500 ms) is below the
  120 s engine deadline (`session.R:192`) and the 150 s worker timeout (`pool.R:42`); a long render surfaces as an error. Fix:
  honour the header with backoff to a 180 s deadline. Test: `api/open.test.ts` with a stubbed 503 sequence.

## 10. Decisions for Gerardo

Numbered once and used in the prototype's notes and roadmap. Each with a recommendation.

- **D1 · Comments in the checkpoint or outside?** Outside (sidecar store keyed by project and workspace); Team untouched.
- **D2 · Who may Finish and Confirm statistics?** Lab staff only by default, a per-project toggle in the share dialog,
  enforced at the intent.
- **D3 · What is a project?** One live project per `(workspace, origin)`; origin = checkpoint id, or dataset id plus
  preparation settings; Open in Nexo lands in the caller's scope; **fork ("Save as…") deferred**, the record shape allows it;
  undo belongs to one editing session (device), not to the account. *Gerardo, 2026-11-10:* a shared project of a client's
  dataset lives in that client's workspace also when lab staff open it (R answers `projectWorkspace`); a lab person's
  single-user session stays in the lab workspace.
- **D4 · Retention of automatic versions.** Per project: autosave last 5; auto 48 h then one per day; named, opened and
  safety snapshots until an Owner deletes them.
- **D5 · Votes on figure candidates.** Drop from Phase 6; revisit after the first client review.
- **D6 · Engine policy and capacity.** Leases; live projects never evicted by LRU, idle or the soft guard; `LIPIDOMIC_API_LIVE_PROJECTS=2`
  on the 8 GiB host until main plus workers are measured with two live projects; a third project waits with a message.
- **D7 · How the sidecar authenticates to the API.** Scoped service identity (HS256, one workspace and project per token,
  actor attribution, loopback only), not token relay. R change: `api_service_caller()` (~60 lines plus tests).
- **D8 · Default role for new client members.** Commenter.
- **D9 · Client access in production.** Switch `NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1` on at the end of Phase 5 after the staging
  E2E, not before.
- **D10 · Where the sidecar runs.** Same host as the API, loopback, its own user unit, behind the tunnel and nginx.
- **D11 · Enforcement model.** Hybrid (2.1): every R route bound to workspace and caller; collab mutations only through the
  sidecar; reads direct. Alternative: a full gateway (every call through the sidecar), simpler to reason about, slower
  renders, one more hop; not recommended.
- **D12 · Admin migration 0012.** `client_member.display_name` and `admin.nexo_people`; `displayName` in the session-token
  answer; never an e-mail. Needs the same OK as 0010/0011 before staging.
- **D13 · Phones.** Keep the `?mode=edit` override as a layout choice; the server role decides editing on every device.
- **D14 · Basic auth.** Stays in front of `/nexo/`, `/api/` and `/collab/` for all of Phase 1B; removing it is a separate
  decision with its own review.

## 11. Prototype v2 (revised): scenes and capture

| Scene | URL | PNG |
|---|---|---|
| 1 Three people | `prototype-v2.html?scene=1&at=3000` | `scene-1-v2-1440.png` |
| 2 Same card | `?scene=2&at=4000` | `scene-2-v2-1440.png` |
| 3 Comments | `?scene=3&at=1000` | `scene-3-v2-1440.png` |
| 4 Share | `?scene=4` | `scene-4-v2-1440.png` |
| 5 Follow / summon | `?scene=5&at=2000` | `scene-5-v2-1440.png` |
| 6 Versions | `?scene=6` | `scene-6-v2-1440.png` |
| 7 Connection states / phone | `?scene=7` | `scene-7-v2-1440.png`, `scene-7-v2-390.png` (390 × 844, touch) |
| 8 Architecture and sequence | `?scene=8` | `scene-8-v2-1440.png` |
| 9 Plan (phases 0–7) | `?scene=9` | `scene-9-v2-1440.png` |

Captured with Playwright Chromium (the version pinned by `tests/browser/ci`), viewport 1440 × 900 (390 × 844 with `isMobile`
and touch for the phone), after `document.fonts.ready` plus 1.5 s so the scripted toasts appear; `?at=` freezes the bots. The
capture collected `pageerror` and console errors on every scene: none. The prototype's scripted scenes illustrate the
contracts; they are not evidence of transport, permissions or science behaviour (F21).
