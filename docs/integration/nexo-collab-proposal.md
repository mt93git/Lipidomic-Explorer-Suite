# Nexo real-time collaboration: diagnosis, decision and proposal

Role: designer / architect. Scope: documents only. Companion prototype: `docs/integration/nexo-collab-proposal/prototype.html` (open it in a browser; `?scene=1`…`?scene=8`), PNGs of every scene in the same folder.

Requirement (Gerardo, 2026-11-07): several people work on the **same project at the same time**, Mural style: the client (a research group) and the lab staff, live, all able to modify things.

## 1. Diagnosis: what Nexo is today and what blocks live collaboration

| Layer | Today (file:line) | Consequence for collaboration |
|---|---|---|
| Document | One `CanvasState` object: `nodes`, `document`, `tabs` (`frontends/nexo/src/state/document.ts:18`), Team's canvas v1 (`document.ts:89-94`). Nexo extras live in a second member `nexo-canvas-v1.json` (`state/nexo.ts:15`, `R/frontends/api/nexo_store.R:7`). | Small, plain JSON: ideal for a shared document. Nothing in it identifies *who* changed *what*. |
| Edits | Commands with `apply`/`invert` and `coalesceKey` (`state/commands.ts:2`, `:15-:34`); a 50-step history (`state/history.ts:7`); a store with `dispatch(cmd)` (`state/store.ts:39`). | One local history: undo would revert other people's work. |
| Saving | Client-driven autosave: 15 s debounce, 60 s maximum, 135 s watchdog (`state/autosave.ts:27`, `:22`); the busy case is retried (`:17`). | Two clients would race to save two different documents of the same checkpoint. |
| Read-only | Phones and `?mode=view` links are view-only, decided once per load (`state/readonly.ts:5-:13`). | Already the right base for "viewer" and for phones with presence. |
| Engine | One R process; one headless Shiny session per open checkpoint (`R/frontends/api/session.R:1`), at most 2 loaded (`session.R:410`), idle eviction (`session.R:432`); all requests serialised by one lock that answers `503` + `Retry-After` (`R/frontends/api/plumber.R:22-:26`); memory guard at 2.4 / 2.7 GB (`session.R:496-:498`), unit limit `MemoryMax=3G` (`OS/Linux/lipidomic-api.service:26`). | The science is **already shared state**: everybody who opens the same checkpoint talks to the same R session. The lock is per process, so collaboration cannot add parallel renders; it must add *fewer* renders. |
| Render cache | Disk cache keyed by code commit, checkpoint sha256, source, inputs, shared analysis settings and cohort (`R/frontends/api/render_disk.R:1-:6`, `:55-:62`). | A render computed for one person is served to the next one for free. This is the mechanism for "computed once, sent to everyone". |
| Storage | Content-addressed checkpoints (`R/frontends/api/storage.R:12-:13`, `:90`), records appended unchanged (`storage.R:81-:82`), Nexo member appended to the zip (`nexo_store.R:30-:36`). Team's validator rejects unknown keys (`nexo_store.R:1-:3`). | Versions are cheap (sha256 dedup). Anything new (comments, activity) must stay **out** of `team-canvas-v1.json`. |
| Deployment | nginx: `/api/` proxied to the R process, `/nexo/` static (`OS/Linux/nginx-nexo-locations.conf:4-:18`), server-level basic auth, Cloudflare tunnel. One shared login: no identity. | A WebSocket location is a 6-line nginx change; the tunnel passes WebSockets. Identity is Phase 3. |
| Team | Shiny, single user, no collaboration code (grep: none). Checkpoints saved by Nexo must still open in Team. | The shared document must always export to exactly `team-canvas-v1.json` + `nexo-canvas-v1.json`. |

**Diagnosis in one line:** the engine and the storage are already multi-user in the right way (one session per checkpoint, content-addressed saves, a render cache); what is missing is a shared *document* with identity, presence and per-user undo, and a save path that is server-side instead of client-side.

## 2. The decision

**Use a CRDT document (Yjs) with awareness, served by a self-hosted Hocuspocus sidecar (Node) next to the R API. The R engine stays the single authority for science; the sidecar is the single authority for the board.**

Why this and not the alternatives:

| Option | Verdict | Why |
|---|---|---|
| **CRDT: Yjs + awareness, Hocuspocus sidecar** | **Chosen** | The document is small JSON with mostly independent fields (geometry, label, inputs, style per node): exactly what a map/text CRDT merges well. Per-user undo (`Y.UndoManager` with `trackedOrigins`), presence (awareness protocol), offline queueing (`y-indexeddb`) and reconnect come with the library instead of being written by us. Hocuspocus adds authentication hooks, per-document persistence and a webhook/extension API we use to export to the R API. MIT licensed, self-hosted, data never leaves the server. |
| Server-authoritative op log (our own) | Rejected | We would write merge, rebase, undo, presence and reconnect ourselves on top of the existing commands. The R process cannot host it (single-threaded and lock-serialised, `plumber.R:22`), so a sidecar is needed anyway; once a sidecar exists, Yjs gives the same guarantees with far less code. Keep it as the fallback if a CRDT library were ever vetoed. |
| Locks / polling on the current API | Rejected | Cheapest, but "one editor at a time per card" plus 2-5 s polling is not Mural-like, gives no cursors, and still needs identity and a server-side save path. Useful only as a stop-gap, not as the target. |
| Hosted SaaS (Liveblocks, Ably, PartyKit cloud) | Rejected | Research data (titles, lipid names, inputs, comments) would transit and persist outside the server; procurement and privacy review for every client; a vendor in the critical path of a lab tool. |

What it costs:

- **One new process**: `nexo-collab` (Node 20, Hocuspocus + `@hocuspocus/extension-sqlite` or `extension-database`), bound to loopback, run by a systemd unit next to `lipidomic-api.service`. About 200-400 lines of our own code (document schema, export adapter, role checks).
- **nginx**: one `location /collab/` with `proxy_pass` to the sidecar and `Upgrade`/`Connection` headers, inheriting the same basic auth. The Cloudflare tunnel proxies WebSockets without configuration.
- **Client**: `yjs`, `@hocuspocus/provider`, `y-indexeddb` (about 90 KB gzipped) and a new `frontends/nexo/src/collab/` package that bridges the Y.Doc and the existing store.
- **Persistence**: one SQLite file per workspace in the API storage directory (Y.Doc updates + comments + activity); checkpoints keep being the long-term format (section 3.3).
- **Nothing in R changes for the science.** The sidecar calls the existing endpoints (`/sessions/<id>/canvas`, `/cards/<instanceId>/render`, checkpoint save) exactly as the browser does today.

## 3. Architecture

```
browser A ──┐  WebSocket /collab/<project>   ┌────────────────┐  HTTP (loopback)  ┌──────────────┐
browser B ──┼──────────────────────────────▶ │ nexo-collab    │ ────────────────▶ │ R API        │
phone C  ───┘  (Y.Doc updates + awareness)   │ Hocuspocus     │  canvas PUT,      │ plumber      │
      │                                      │ SQLite: doc,   │  checkpoint save  │ 1 session /  │
      │  HTTP /api/ (renders, stats, export) │ comments,      │                   │ checkpoint   │
      └────────────────────────────────────▶ │ activity       │                   │ render cache │
                                             └────────────────┘                   └──────────────┘
                 nginx (basic auth today, accounts in Phase 3) + Cloudflare tunnel in front of everything
```

- **Board state** (what the CRDT holds): nodes, document (figure page), tabs, Nexo style and inputs, comments, activity. Every update carries the author's client id, which the sidecar maps to a user (name + colour today, account in Phase 3).
- **Science state** (what R holds): the live Shiny session, inputs set on cards, statistics, finished snapshots, renders. The CRDT holds only *references* to it: the inputs as values and the last render key per card.
- **Presence** (awareness, never persisted): user, cursor in board coordinates, selection, viewport rectangle, "editing" (node id + field), following, active tab, device.

### 3.1 Data model (Y.Doc)

| Y type | Content | Maps to |
|---|---|---|
| `nodes: Y.Map<id, Y.Map>` | `x y width height z` (numbers), `label: Y.Text`, `visual` (JSON), `instance.inputs: Y.Map<key, value>`, `finished` (JSON or null), `render: {key,url,by,at}` | `Node` (`document.ts:19`), `Finished` (`:31`), `Instance` (`:33`) |
| `document: Y.Map` | `layout orientation`, `items: Y.Map<id, Y.Map>` | `Document` (`document.ts:89`) |
| `tabs: Y.Map` | `tabs: Y.Array<{id, name: Y.Text, nodes: Y.Array}>`, `figure` | `Tabs` (`document.ts:94`); **`active` is per user, so it moves to awareness** |
| `nexo: Y.Map<id, Y.Map>` | `style` (per key), `inputs` | `Nexo` (`nexo.ts:15`) |
| `comments: Y.Map<id, Y.Map>` | `anchor {nodeId | x,y}`, `thread: Y.Array<{by, at, text, mentions}>`, `resolved` | new, not exported to Team |
| `meta: Y.Map` | `checkpointId`, `lastVersion`, `settingsRevision` | links the board to the R session |

Activity (who did what, when) is derived on the server from update origins and stored in SQLite; it is not part of the CRDT.

### 3.2 How the command/undo model maps

- `store.dispatch(cmd)` (`store.ts:39`) keeps working. The collab adapter turns each command's *result* into Y.Doc writes inside one `doc.transact(fn, origin = me)`: `moveNodes`/`setGeometry` write numbers, `setLabel` edits `Y.Text`, `setNodeInputs` writes per key, `addNode`/`removeNodes` insert or delete map entries. The reverse direction (remote update → `store.set`) is one observer.
- **Per-user undo**: `Y.UndoManager(scopes, { trackedOrigins: new Set([me]), captureTimeout: 300 })` replaces `history.ts`. It only undoes my own changes, keeps the 50-step cap (`history.ts:7`) and reproduces `coalesceKey` with the capture timeout. Undoing a move that someone else moved afterwards restores *my* previous position of that node, which is what Mural and Figma do; it never touches other people's nodes.
- **Autosave becomes server-side.** The client timers (`autosave.ts:27`) are removed in collab mode. The sidecar persists every update immediately (SQLite), and runs the *same* 15 s / 60 s policy once per project to push the exported canvas to the R session (`PUT /sessions/<id>/canvas`) so that science and statistics stay attached to the right board. The "Autosave ready / Saving… / Saved" pill is fed by the sidecar's status instead of the local timers.
- **Checkpoints become versions.** A *named* version ("Save checkpoint…" today) is a server-side call: sidecar exports the doc and calls the existing checkpoint save (`storage.R:90`), which content-addresses it; the version list is the existing checkpoint list plus auto-versions (every 10 minutes while there are changes, kept 48 h, then daily). **Restore** loads the chosen checkpoint JSON into the live doc inside one transaction by the restoring user: everybody sees the board jump, the activity feed says "Ana restored version 14:02", and the restore is itself undoable by Ana.
- **Export to Team.** `export(doc) → { canvas: team-canvas-v1.json, nexo: nexo-canvas-v1.json }` is a pure function that runs in the sidecar and in the client (same TypeScript module, tested with vitest in both directions). Comments, activity and presence are never written into either member, so Team opens the checkpoint exactly as it does today (`nexo_store.R:4-:6`).

### 3.3 The science engine as shared state

- **One live R session per project, shared by everyone.** This is already how the API works (one session per checkpoint, `session.R:1`). N people on one project cost *one* session; today N people would cost N sessions and evict each other (LRU of 2, `session.R:410`). Collaboration therefore lowers memory pressure. The sidecar is the only writer of the session's canvas; clients keep calling render and statistics endpoints directly.
- **Two people changing inputs of the same card.** Inputs are a `Y.Map` per card: changing different inputs merges, changing the same input is last-writer-wins and both see the result with "Updated by X". The inspector shows a **soft lock**: "Tomás is editing · Data" on the card and in the inspector header; a second editor can still type (merge), but is warned. The render is requested **once**: the client that committed the change PATCHes the inputs and POSTs the render; the response's cache key and URL are written into `nodes[id].render` and every other client loads the image by URL. If two clients still race, the render cache (`render_disk.R:55`) makes the second request a cache hit.
- **Queue and lock feedback.** The 503 busy answer (`plumber.R:22`) becomes visible to everyone: the sidecar keeps an "engine" awareness field `{busy, card, by, queued}` so the toolbar shows "Engine busy · rendering Feature distributions for Tomás (1 queued)". Clients that get 503 back off as today (`autosave.ts:17` pattern) and show the queue position instead of a spinner.
- **Memory limit.** No change: 2 projects loaded, idle eviction, guard at 2.4/2.7 GB (`session.R:496`). Collaboration adds one Node process (~80 MB) outside the 3 GB unit.
- **Statistics confirmation.** Group comparison needs an explicit confirmation token (`R/frontends/api/statistics.R:74-:84`). In a shared board, "Review and confirm" is an action with a role (lab editors by default; configurable per project). Everybody sees the same card state: "Statistics confirmed by Tomás · 10:42" or, after an input change by anyone, the existing invalidation message (`src/statistics/settings.ts:35`) with "changed by Ana". Only one person can confirm at a time (the token is written once; a second confirm sees "already confirmed").
- **Finish snapshots.** `setFinished` (`commands.ts:34`) is a shared write: the card flips to Finished for everyone with "Finished by Tomás"; the figure page updates live. Un-finishing is allowed to editors and logged in activity; the proposal defaults the client role to *editor of layout, inputs and comments* and reserves Finish and Confirm to the lab (open question 2).

## 4. Conflict rules per kind of data

| Data | Rule | What the other person sees | Undo |
|---|---|---|---|
| Geometry (x, y, w, h, z) | Last writer wins per field; a drag is one transaction; while dragging, the live ghost comes from awareness, not the doc | Card moves under their cursor with the mover's colour; no lock | Mine only |
| Title / label, text annotations | `Y.Text`: character-level merge, no lock | Caret and selection of the other person inside the text | Mine only |
| Science inputs | Per key, last writer wins; soft lock "X is editing" on card + inspector; render requested once by the committer, broadcast by key | "Updated by X · 2 s" on the card; if both changed the same key within 2 s, a toast "Ana also changed Lipid class; hers won" with *Undo mine* | Mine only; undo re-renders |
| Style (Nexo) | Per key, last writer wins; shape/annotation lists are `Y.Array` (both additions kept) | Live | Mine only |
| Add card | Independent; same source twice gives two cards | Card appears with "Added by X" badge for 5 s | Mine only |
| Delete while someone edits | Deletion wins (tombstone), but the UI asks first: "Ana is editing this card. Delete anyway?"; the editor gets "Deleted by Tomás · Undo" (their undo restores it) | Card fades, inspector closes with the notice | Either |
| Tabs | List is `Y.Array`; rename is `Y.Text`; active tab is per user (awareness). Deleting a tab others are viewing moves them to the first tab with a toast | Toast | Mine only |
| Figure page (items, order, deselected) | Per item last writer wins; the page layout mode is one field, last writer wins, logged | Page re-flows live | Mine only |
| Analysis settings / cohort (session-wide in R) | Editor action; applied through the API once; broadcast "Analysis settings changed by X"; every card's render key changes, renders re-run lazily on view | Cards show "Updating…" then the new render | Logged, re-apply old settings |
| Statistics confirm | Single writer: first confirmation wins; others see the result | "Confirmed by X" | Not undoable (re-confirm instead) |
| Finish / un-finish | Last writer wins, logged | "Finished by X" | Mine only |
| Comments | Append-only thread; resolve is last writer wins | Live | Edit/delete own only |
| Checkpoint restore | Whole-doc transaction by one user, auto-version taken before | Board jumps + activity entry | Restoring user only |

## 5. Presence and collaboration features, prioritised

| Rank | Feature | Why it earns its place | Phase |
|---|---|---|---|
| 1 | Avatars in the top bar (name, colour, role badge Lab/Client, device) | The minimum to know you are not alone; click to jump to someone | 1 |
| 2 | Named live cursors in board coordinates | The Mural signal; shows intent before an edit | 1 |
| 3 | Coloured selections and "editing" indicator on cards and inspector | Prevents the only real conflict: two people on one card | 1 |
| 4 | Connection state (Live, Syncing, Reconnecting, Offline, Read-only) | Trust: people must know whether what they see is current | 1 |
| 5 | Render broadcast "Updated by X" | The science result as shared state | 2 |
| 6 | Others' viewports on the minimap | Cheap once awareness exists; makes a 30-card board legible | 2 |
| 7 | Follow / summon (presenter leads, "Stop following") | Lab-client meetings: the lab presents, the client follows on their own screen | 3 |
| 8 | Comments pinned to cards or the board, threads, @mentions, resolve | The client's main contribution in review; replaces e-mail threads about plots | 3 |
| 9 | Version history with restore + activity feed | Safety net that makes "everyone can edit" acceptable | 3 |
| 10 | Reactions / voting on finished plots | Only in review of the figure page ("which of these goes in?"): a thumbs-up count per candidate; nothing else | 4 (optional) |
| – | Timer | Not useful for lab/client sessions; dropped | – |

## 6. Roles and sharing

| Role | Can | Typical |
|---|---|---|
| Owner | Everything, manage members, delete project, restore | Lab PI / Gerardo |
| Editor | Edit board, inputs, style, tabs, finish (lab) | Lab staff; client scientists if the lab allows |
| Commenter | View, comment, react, follow | Client by default |
| Viewer | View, follow | Phones (forced), guests |

- **Before Phase 3 (shared login):** on join, "Your name" + a colour (stored locally); role is chosen by the share dialog but enforced only in the UI; a client tag is self-declared. Good enough for a pilot with one trusted client group; not for several clients.
- **With Phase 3 accounts:** the login service issues a short-lived token; Hocuspocus `onAuthenticate` validates it and attaches `{userId, role, org}`; the sidecar rejects document updates from commenters and viewers (comments are a separate map it allows), and the R API trusts only the sidecar for canvas writes.
- **Invite links:** `/nexo/?project=<id>&invite=<token>`; a token encodes role and expiry; "Anyone with the link can *comment*" is the default; links can be revoked in the share dialog.
- **Phones:** stay view-only (`readonly.ts:9`) but join presence: they appear as avatars, can follow a presenter and tap a card to read comments.

## 7. Offline, reconnect, connection states, security

- States: **Live** (green dot), **Syncing** (after reconnect, applying N updates), **Reconnecting** (exponential back-off; edits queue locally via `y-indexeddb`), **Offline** (layout edits still work and will merge; science renders and statistics are disabled with "Needs the engine"), **Read-only** (viewer, phone, or sidecar refused the role), **Engine busy** (orthogonal badge from section 3.3).
- Reconnect merges the queued updates; if the local queue is older than 15 minutes an auto-version "Before merge" is taken first, so a bad merge is one restore away.
- Security and privacy: the sidecar listens on loopback only; nginx exposes `/collab/` with the same auth as `/api/`; TLS ends at Cloudflare and nginx; no third-party service; awareness carries name, colour and role only (no e-mail); comments and activity live in the API storage directory with the checkpoints and follow the same backup; logs record ids, not content. Participant data never enters the CRDT: the board references data by card source and inputs, the values stay in R.

## 8. Phased plan (milestone order, no dates)

| Phase | Deliverable | Files (new or touched) | Effort | Risk | Tests |
|---|---|---|---|---|---|
| 0. Spike | Sidecar + Y.Doc bridge in mock mode; two browsers move one card | `collab/server/` (new package: `server.ts`, `persistence.ts`), `frontends/nexo/src/collab/{schema.ts, bridge.ts, export.ts}`, `OS/Linux/nexo-collab.service`, `nginx-nexo-locations.conf` | 3-4 days | Medium: proves the bridge and the WebSocket path through the tunnel | vitest: `export(import(state)) === state` for the mock checkpoints; Playwright: two contexts, context A drags a card, B sees it within 200 ms |
| 1. Shared board + presence P0 | Geometry, labels, add/remove, tabs; avatars, cursors, selections, editing indicator, connection states; per-user undo | `src/collab/{awareness.ts, undo.ts}`, `ui/TopBar.tsx` (avatars), `canvas/presence.ts` (cursor layer), `ui/Inspector` (editing badge) | 6-8 days | Medium: replacing `history.ts` in collab mode; keep single-user mode untouched | vitest: undo manager only reverts own origin; Playwright: A types a title while B moves the card, both converge; R: none |
| 2. Science as shared state | Inputs soft lock, render broadcast, engine queue feedback, statistics and finish attribution | `src/collab/render.ts`, `cardStatus.ts` (new states), `ui/Toolbar.tsx` (engine badge), `statistics/result.ts` | 5-7 days | Medium-high: ordering of PATCH/render vs doc update; 503 handling under two clients | R (testthat): two sessions of the same checkpoint, second render is a disk-cache hit; Playwright: A changes an input, B gets the same image URL without a render request |
| 3. Server versions + export | Sidecar autosave to the R session, named versions, auto-versions, restore, activity feed; Team compatibility | `collab/server/{versions.ts, exporter.ts}`, `ui/Dialogs/VersionHistory.tsx`, `ui/ActivityPanel.tsx` | 5-6 days | High: this is where Team compatibility is proven; keep the client-side autosave as the fallback in single-user mode | R: checkpoint saved by the sidecar opens in Team's reader (existing archive test) and the Nexo member is intact; vitest: version list, restore transaction; Playwright: restore while B is editing |
| 4. Comments, follow/summon, minimap viewports | Pins, threads, @mentions, resolve; follow a presenter, summon; viewports on minimap | `src/collab/comments.ts`, `ui/Comments/`, `canvas/minimap.ts` (viewport rects), `canvas/follow.ts` | 6-8 days | Low-medium: pure client + CRDT | vitest: mention parsing, resolve state; Playwright: A summons, B's camera matches A's within one frame |
| 5. Roles and sharing | Share dialog, invite links, join-with-name before Phase 3, server-side enforcement with Phase 3 tokens | `ui/Dialogs/Share.tsx`, `collab/server/auth.ts` | 4-5 days (+ Phase 3 dependency) | Medium: depends on the accounts design | vitest: role matrix; Playwright: commenter cannot move a card; server unit test: rejected update |
| 6. Offline / reconnect / phones | `y-indexeddb`, reconnect merge, "Before merge" auto-version, phone presence | `src/collab/offline.ts`, `state/readonly.ts` (presence on phones) | 3-4 days | Medium | Playwright: context B goes offline (`context.setOffline`), edits, reconnects, converges; phone context (390 px) shows avatars and cannot edit |

Single-user mode (no sidecar) must keep working after every phase: the collab bridge is a feature flag read at load, like `readonly.ts`.

## 9. Open questions for Gerardo

1. **Comments in the checkpoint or outside it?** Proposal: outside (project-scoped in the sidecar store) so Team and the figure export are untouched. Alternative: a third zip member `nexo-collab-v1.json`, which needs one R change in `nexo_store.R`.
2. **Who may Finish and Confirm statistics?** Proposal: lab editors only; client editors change inputs, layout and comments. Or everyone with editor role?
3. **Is a project one checkpoint lineage?** Proposal: a project = one live document + its versions; "Save as…" forks a new project. This decides what the project switcher shows.
4. **Retention of auto-versions** (proposal: all for 48 h, then daily, named versions forever) and whether versions must be visible from Team.
5. **Phase 3 identity:** which provider (local accounts, institutional SSO)? The sidecar only needs a verifiable token; the share dialog in the prototype assumes e-mail invites.
6. **Reactions / voting:** keep the figure-page vote (scene 3 shows it) or drop it?
7. **Pilot before accounts:** is "name + colour behind the shared login" acceptable for the first client group, knowing roles are not enforced until Phase 3?
8. **Engine policy under contention:** when two projects are live at the same time (LRU of 2), should a third project wait or evict? Today it evicts the least recently used session.

## 10. The prototype

`docs/integration/nexo-collab-proposal/prototype.html` is one self-contained file (no external scripts; Google Fonts only) built on the current Nexo chrome: tokens from `frontends/nexo/src/tokens.css`, the top bar, tabs bar, rail, dotted canvas, minimap and zoom pill as rendered by the mock app on this branch. Product strings are in English with Team's vocabulary; the yellow reviewer bar and the scene notes are in Spanish. Other people are scripted bots with fictional names.

| Scene | URL | Shows | PNG |
|---|---|---|---|
| 1 | `?scene=1` | Three people on the board: avatars with Lab/Client and phone badges, named cursors, coloured selections, a drag ghost, others' viewports on the minimap | `scene-1-1440.png`, `scene-1-1024.png`, `scene-1-390.png` |
| 2 | `?scene=2` | Two people on the same card: inspector presence banner and locked field, "is editing" chip on the card, engine-busy pill, render broadcast "Updated by Tomás", statistics invalidated with attribution | `scene-2-1440.png`, `scene-2-1024.png` |
| 3 | `?scene=3` | Comments mode: numbered pins on cards and on the board, a thread, @mention autocomplete, resolve, an optional vote on a figure candidate | `scene-3-1440.png`, `scene-3-1024.png` |
| 4 | `?scene=4` | Share dialog: invite by name, link with role and expiry, members with Owner/Editor/Commenter/Viewer and Lab/Client tags, lab-only Finish and Confirm, the pre-Phase-3 note | `scene-4-1440.png`, `scene-4-1024.png` |
| 5 | `?scene=5` | Follow / summon: presenter ring on the avatar, "Following Tomás" bar with Stop following, camera animated by the bot, "brought everyone here" toast | `scene-5-1440.png`, `scene-5-1024.png` |
| 6 | `?scene=6` | Version history (named and auto versions, Restore, Current) and the activity feed; restore toast with Undo | `scene-6-1440.png`, `scene-6-1024.png` |
| 7 | `?scene=7` | Connection states cycling in the top bar (Live, Syncing, Reconnecting, Offline, Read-only, Engine busy) with the gallery; at 390 px the phone view-only layout with presence and a card sheet | `scene-7-1440.png`, `scene-7-1024.png`, `scene-7-390.png` |
| 8 | `?scene=8` | Architecture SVG and the sequence of one input change computed once and sent to everyone | `scene-8-1440.png`, `scene-8-1024.png` |

Reviewer parameters: `?at=<ms>` freezes the bots at a moment (used for the PNGs), `?notes=0` hides the Spanish note, `?bar=0` hides the reviewer bar. Clicking a pin, an avatar, the rail's comment and history icons, the Share button and "Stop following" are live.

## 11. Summary for the decision

- **Model:** CRDT (Yjs) + awareness on a self-hosted Hocuspocus sidecar; the R API stays the only science engine and nothing leaves the server.
- **Cost:** one Node process, one nginx location, three client libraries, one SQLite store; no science change.
- **Undo:** per user via `Y.UndoManager` with tracked origins; the 50-step cap stays.
- **Saving:** autosave and checkpoints move to the server; every version is a checkpoint Team opens.
- **Science:** one live R session per project shared by everyone; inputs are last-writer-wins with a soft lock; renders are computed once and broadcast by cache key.
