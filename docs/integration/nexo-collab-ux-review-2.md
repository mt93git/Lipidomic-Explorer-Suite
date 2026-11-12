# Nexo collaboration · UX review 2: the build against the prototype, scene by scene

Reviewed: `nexo/collab` at `e61d4149`. Ground truth: `nexo-collab-proposal/prototype-v2.html` (9 scenes) and its
`scene-N-v2-1440.png` captures. Decisions: `nexo-collab-plan.md` section 10 (D1–D14) and "Phases 3–7 as cut".
Review only: no product code was changed.

## Verdict

The layout, the cards and the inspector match the prototype. Three defects and one open decision stand between this
build and a demo with two people:

1. **The first input change breaks every plot, for everyone** (scene 2, group 1).
2. **A card's form does not follow other people's changes or a restore, and then puts the old values back**
   (scenes 2 and 6, group 2).
3. **Reconnecting after work done offline can stick until a reload**, and those edits never arrive (scene 7, group 3).
4. **Lab staff and a client member cannot meet on a board that the lab opened** (scenes 4 and 9, question 1).

## How it was run

- The real path of `tests/dual-ui/collab-real.cjs` (R API, sidecar, fake Admin, built client), driven by an untracked
  script. Chromium at 1440×900 for every scene; scene 7 also at 390×844 with touch; scenes 1 and 3 repeated in WebKit.
- Synthetic people: **A** Alex Synthetic (lab staff, Owner), **B** Blair Synthetic (lab staff, Editor), **C** Casey
  Member (client member: Commenter by default, made Editor or Viewer where a row says so), **X** a visitor with no
  Admin session.
- Two things were staged, because the build does not reach them by itself:
  1. *The lab + client board.* The project was created in the client's workspace with `POST /collab/projects`, and
     the fake Admin was given a people directory. From the UI, a project that lab staff open lives in the lab
     workspace and no client member can join it (question 1).
  2. *Everything after the first input change.* Captures taken after a change, other than those named
     `…-as-built…`, were made with the harness proxy passing on a single `X-Nexo-Engine-Revision` value (group 1).
- Columns. **Built?** is yes, partial, missing, different or in flight. "In flight" is one of the ten cuts Gerardo
  lifted: one line, no severity, not re-designed. Paths in the fix column are under `frontends/nexo/src/` unless
  they start with `frontends/` or `tests/`. "Group n" and "question n" point to the lists after the tables.

## Scene 1 · Shared canvas with presence

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Project name with the chip "from Admin" | partial | The project name button; no chip | nice | `ui/TopBar.tsx:12`: add the chip when the dataset was opened from Admin. |
| Avatar stack: everyone including me, Lab/Client, phone mark, hover card, +N | in flight | Only the other people, tooltip "Follow Blair Synthetic". Nothing on the page shows my own name or avatar; the account button answers "Account actions are available in Team." | — | — |
| Pill "Live · saved" | yes | "Live · saved hh:mm" once a version exists; other states in scene 7 | — | — |
| "Share" after the avatars | different | "Share" comes before the avatars and "Bring everyone here" | nice | `ui/TopBar.tsx:19–20`: swap the two lines. |
| Rail, toolbar, card header, inspector | yes | Same controls and tabs (Data, Appearance, Statistics, Export), plus "Comment" in the toolbar | — | — |
| Selection ring in the person's colour with the name ("You" on mine) | partial | A coloured ring without a name | should | `canvas/presence.ts`: a name tag on the ring. Same file as the in-flight cursor tag: do it there. |
| Cursor tag "Name · Lab/Client" | in flight | "➤ name" in board units, about 7 px tall at Fit; it disappears while the pointer is over the inspector | — | — |
| Minimap with the others' viewports | in flight | Cards and my own viewport, only while part of the board is off screen | — | — |
| Dashed ghost while someone drags a card | missing | Nothing moves during the drag; the card jumps on drop | nice | In neither the as-cut text nor the lifted list: leave. |
| A client member sees the same board | yes | Same cards, rings and cursors; band "You can comment"; toolbar reduced to "Comment", "Figure page", "Export figure"; no "Share", no "Bring everyone here" | — | — |
| Keyboard | partial | Tab reaches controls of off-screen cards without bringing them into view; past the right edge the browser scrolls the stage about 200 px although the camera has not moved | should | `canvas.ts`: on focus inside a card, bring it into view and reset the stage's scroll. Group 2. |
| Contrast | partial | White initials on the green avatar colour: 2.45:1 | should | With the in-flight avatar stack. |

WebKit (B): same layout, ring, cursor and pill; no console errors.

## Scene 2 · Two people on one card

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| A change redraws the card for everyone | different | As built, after the first input change the author and everyone else get "Could not draw this plot. The plot is still behind the shared board. Please retry."; the pill stays "Live"; after a reload every card says "Couldn't bring back …" with "Try again". R sends `X-Nexo-Engine-Revision` two or three times and the sidecar stores `NaN`. With one value: "Loading figure…", then the redraw in about 0.6 s. | blocker | Group 1. |
| The inspector follows the change | missing | A form opened before another person's change keeps the old values and "Up to date" until a reload, even after selecting another card and coming back. Its first change sends only its own field; from the second on it also sends every field in which it differs from the engine. A picked a lipid; B, whose form was behind, changed "Color samples by" twice, and A's lipid was put back without a word. A and B then read different settings, both "Up to date". | blocker | `canvas.ts:100`: on another person's change, dispatch the existing `nexo-inputs-restored` for that card, so an open Data tab reloads its form (`ui/Inspector/DataTab.tsx:31`); `DataTab.tsx:19`: drop the cached form on that event. Group 2. |
| Card note "Updated by Tomás · just now" | partial | The note is there for 4 s but visually hidden (screen readers only) | should | `cards.ts:654`, `ui/shell.css:556`: show it, for about 10 s. Group 4. |
| Chip "Tomás is editing · Lipid" | partial | "Blair Synthetic editing" (12 px, 5.7:1), no field, and only while the caret is in a form field | nice | `canvas/presence.ts`: add the field, already in awareness; with the cursor tag. |
| Inspector banner "… is editing this card · Data" | in flight | Nothing | — | — |
| Engine pill "Engine busy · rendering … · 1 queued" | in flight | Nothing | — | — |
| Veil "Updating… Tomás changed Lipid" | partial | "Loading figure…" without a name | nice | `cards.ts`: the "Updated by" name in the veil. Group 4. |
| Statistics: "changed by X" | partial | Code check only: the invalidation text names no one ("No current statistics: the data, displayed lipid, … changed after they were confirmed.") | should | `statistics/settings.ts:35`: add "(changed by …)" from `meta.lastChange`, as cut. Group 5. |
| The same input changed by two people at once | partial | One order holds and every card agrees. The earlier author's form keeps their own choice, so it is behind as in the row above; no notice | should | Same fix as the inspector row. "Undo mine" is not in the as-cut text (question 3). |
| Undo of my own change | missing | "Undo" stays disabled after my own input change; single-user Nexo undoes it | should | Question 3. |

## Scene 3 · Comments

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Rail icon with a count; panel with every thread | in flight | A "Comment" button in the toolbar arms one click; one thread is open at a time | — | — |
| @mentions and votes | in flight | None | — | — |
| Comment mode is visible | partial | Only the pointer becomes a crosshair: the button does not look pressed and the hint line does not change. Esc leaves the mode | should | `ui/Toolbar.tsx:50`, `canvas/pins.ts:28`: `aria-pressed` and a hint "Click where the comment goes · Esc to cancel" (inline: `ui/strings.ts` belongs to group 6). |
| The pin belongs to its card | different | The pin stays where it was dropped: move the card 120 px and the pin is left behind | should | `canvas/pins.ts`: with a `nodeId`, place the pin relative to the card. |
| A pin can always be opened | different | A selected card covers its pins | should | `canvas/pins.ts`: keep pins above the selected card. |
| Pin in the author's colour | partial | One purple for every author; the number is the message count; resolved at 50 %; no tooltip; 16×15 px at Fit | nice | `canvas/pins.ts`: author colour, `title`, constant size on screen. |
| Thread in the side panel | different | A fixed 300 px box at the top right, over the end of the toolbar and the card | should | `ui/Comments/CommentsPanel.tsx`: open it below the toolbar, in the inspector's column. |
| Message meta: name, Lab/Client, time | partial | Bold name and text; no time, no Lab/Client | should | `ui/Comments/CommentsPanel.tsx`: show `createdAt`, which is stored. |
| "Pinned to (card)" and "Jump to card" | missing | Neither | nice | `ui/Comments/CommentsPanel.tsx`: one line and one button when the comment has a `nodeId`. |
| "Cancel", "Reply", "✓ Resolve thread" | partial | "Reply", "Resolve", "Close" as border-less text. A resolved thread still takes replies and cannot be reopened | should | `ui/Comments/CommentsPanel.tsx`: button styles; "Reopen" on a resolved thread. |
| Who can comment | yes | A Commenter posts, replies and resolves; a Viewer has no button and opens threads read-only | — | — |
| Keyboard | partial | Esc does not close the thread; focus is lost after "Close"; Enter on a pin opens the thread but focus stays on the pin; pins are the last tab stops (88th of 110) | should | `ui/Comments/CommentsPanel.tsx`, `canvas/pins.ts`: Esc closes; focus goes into the thread and back to the pin. |

All in group 8. WebKit (B): identical.

## Scene 4 · Share

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Title with the project name and a sentence on who can open it | partial | "Share" in a 322 px dialog; no project name, no explanation | should | `ui/Dialogs/Share.tsx`: the name in the title and one sentence: "Lab staff and this client's members can open this project. Roles decide what each person can change." |
| "Add people from Admin…", role, "Add" | different | A "People" list with "Add as…" per person | nice | Fine as built: leave. |
| Member row: "(you)", Lab/Client, role; my own row locked | partial | Name, "Lab" or "Client", role, "Remove". No "(you)"; a lab Editor can change or remove their own row | should | `ui/Dialogs/Share.tsx`: mark my row "(you)" and lock it. |
| Counts and "Not listed? Add the person as a client member in Admin first." | partial | Headings "Members" and "People"; no hint | nice | `ui/Dialogs/Share.tsx`: the hint under "People". |
| Link row: "Copy link" and a default role for new members | missing | No row; the address bar holds the link | nice | `ui/Dialogs/Share.tsx`: "Copy link" only. The default-role select contradicts D8. |
| Toggle "Lab only: Finish plot and Confirm statistics" | different | No toggle | — | Phase 5 as cut wins: leave. |
| Identity note, "Manage people in Admin", "Done" | missing | Only "×" at the bottom right. Names never show an e-mail (D12 holds) | nice | `ui/Dialogs/Share.tsx`: a "Done" button. |
| A role change reaches the person | partial | Their page reloads without a word when editing switches on or off | should | `collab/roles.ts:19`: keep the new role across the reload and say "Your role on this project is now Viewer." |
| A project that lab staff opened | different | One nameless member labelled "Client" and "Owner"; "People" is empty | should | `ui/Dialogs/Share.tsx`: no "Client" for an unknown kind, and "Lab workspace: only lab staff can open this project."; `frontends/nexo-collab/src/projects.mjs:79–84`: name the caller's own row. Question 1. |
| Out of scope: "Not available" | different | Red toast "Collaboration unavailable: forbidden_scope"; the pill stays on "Syncing"; the full editing toolbar remains | should | `canvas.ts:105`: "This project is not available to your account." and no editing tools. Group 2. |
| Who can share | yes | Owner and lab staff see "Share" (as cut); a client Commenter does not | — | — |
| Keyboard | partial | Focus starts on "×", the last control; Esc closes and focus returns to "Share" | nice | `ui/Dialogs/Share.tsx`: start on the first control. |

Rows without a group are group 6.

## Scene 5 · Follow and "Bring everyone here"

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Follow from an avatar | yes | One click follows; the followed avatar shows no pressed state | nice | With the in-flight avatar stack. |
| Bar "Following Tomás (presenting) · 2 others follow · Stop following" | partial | "Following Blair Synthetic · Stop"; no avatar, no count | nice | `canvas/following.ts`: button text "Stop following". |
| The camera follows pan, zoom and tab | yes | It does | — | — |
| Follow into figure mode | different | Followers stay in Draft but get the figure page's camera: the board jumps to empty space and the bar still says "Following" | should | `canvas.ts:435`: do not share the view in figure mode (as cut: camera and tab). Group 2. |
| Toast "You stopped following Tomás" | partial | Stopping is silent, and my own pan or zoom also ends it silently | nice | `canvas/following.ts`: that toast. |
| "Bring everyone here": "Tomás brought everyone here · Stay here" | partial | The others get the camera and the "Following" bar at once: no toast, no "Stay here". The presenter gets no sign that it worked | should | `collab/follow.ts:49`: raise the summon as its own event and publish who I follow in awareness; `canvas/following.ts`: "Blair Synthetic brought everyone here · Stay here", and for the presenter "2 people are following you". |
| Who can bring everyone | yes | Lab staff and Editors, a client Editor included; a Commenter has no button and is brought along | — | — |
| Keyboard | partial | Esc does not stop following; "Stop" is the 100th of 105 tab stops | should | `canvas/following.ts`: Esc stops following. |

Rows without a group are group 9.

## Scene 6 · Versions

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Rail clock, "Version history" panel, "Current" | in flight | The "Checkpoints" dialog behind the project name | — | — |
| "Activity" tab | in flight | None | — | — |
| The words | different | "Checkpoints", "New checkpoint name", "Save current analysis", "Upload ZIP", "Saved checkpoint" | should | `ui/Dialogs/CheckpointsDialog.tsx`: with collaboration on, "Versions", "Version name", "Save version" (inline). |
| Rows: who, name, time, note | partial | The raw kind twice: "autosave / autosave · 11/10/2026, 8:02:48 AM", "before-restore / before-restore · Alex Synthetic · …", "After lipid change / named · Blair Synthetic · …" | should | `ui/Dialogs/CheckpointsDialog.tsx:33`: "Autosave · 08:02", "Before restore · by Alex Synthetic", "Saved by Blair Synthetic". |
| First row "Opened from Admin · (dataset)" | missing | No such row | — | Not in the as-cut kinds: leave. |
| Restore is the Owner's | different | "Restore" on every row for any Editor. A lab Editor's restore goes through; a client Editor gets "Change not allowed: owner_only"; a Commenter or Viewer has "Download" only | should | Question 2, then `frontends/nexo-collab/src/commits.mjs:213` and `ui/Dialogs/CheckpointsDialog.tsx:34`. |
| Everyone learns of a restore | partial | Every card blanks to "Loading figure…" for 2–3 s on every page. The actor gets "Restored (name) · Undo" for 6 s; the others get no word | should | `collab/versions.ts`: on a `meta.restoredFrom` written by someone else, "Alex Synthetic restored (name)". |
| A restore reaches the open forms | missing | Every form keeps its pre-restore values, the restorer's too. A restored a version and then changed "Color samples by" twice: the second change put the pre-restore lipid back on the board without a word | blocker | The reload of scene 2, on every page after a restore. Group 2. |
| Undo of a restore | yes | It works. No word afterwards, a failed Undo is silent, and each Undo adds a "before-restore" row | nice | `collab/versions.ts`: "Restore undone", or the error. |
| Saving a named version | partial | The dialog closes without a word; the pill becomes "Live · saved hh:mm" for everyone | nice | `ui/Dialogs/CheckpointsDialog.tsx`: toast "Version saved". |
| Footer note on what a version is | missing | None | nice | Leave to the in-flight panel. |
| Keyboard | yes | No problem found | — | — |

Rows without a group are group 7.

## Scene 7 · Connection states and the phone

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Pill "Live · saved" | yes | "Live · saved hh:mm". A first join flashes "Reconnecting", then "Syncing" | nice | `ui/App.tsx:89`: start with "Connecting". |
| A dot colour per state | missing | One grey dot in every state | should | `ui/App.tsx:323`: pass `saving` for Syncing and Reconnecting and `paused` for Offline and Signed out; `ui/shell.css:61–64` already colours them. |
| "Reconnecting…", back by itself | different | Plain offline cycles recover (8 of 8). Go offline, move a card, select a card, open the inspector, come back after about 6 s: the pill stays on "Reconnecting" until a reload, the edits never reach the others, and the reload shows the browser's leave prompt (2 of 2). Once it stuck on "Syncing" after a minute offline | blocker | `collab/provider.ts:57–58`. Group 3. |
| "Offline · edits kept locally" and a toast | partial | "Offline" at once, no toast. The editing toolbar stays; avatars and "Bring everyone here" go; a card move is kept and merges. Opening the inspector gives "Settings unavailable", "Loading controls…" and "Could not load the plot settings: Failed to fetch", and that card stays on "Could not update" after reconnecting | should | `cards.ts`: draw failed cards again when the board is back. Group 4. |
| Edits kept on this device | in flight | Today the browser's leave prompt is the only guard | — | — |
| "Syncing · 12 changes" and "Back online · 12 changes … applied" | partial | "Syncing" for a moment; no count, no toast | nice | Leave. |
| Viewer: pill "View only" and a toast | different | Pill "Live · saved hh:mm"; band "View only — ask the owner for edit access" (Commenter: "You can comment"). The built "Read-only" pill can never show: `collab/provider.ts:42` reads a field nobody sets | should | `collab/provider.ts:42–43`: take the role from the role push and say "View only". Group 3. |
| Read-only inspector | partial | Fields are disabled, but the lipid list still takes a click: toast "Could not update the plot: Change not allowed: viewer", status "Update failed", card "Could not update" | should | `ui/forms/SearchablePicker.tsx:76`: options inert inside a disabled fieldset. Group 5. |
| "Live · engine busy" | in flight | Not exercised | — | — |
| "Signed out · Sign in to Admin" | partial | Joining without an Admin session: pill "Signed out"; a red toast that starts "Collaboration unavailable: Failed to get token during sendToken(): AdminSignInRequired: …"; no sign-in button; the editing toolbar stays. A sign-out in mid-session was not reproduced | should | `canvas.ts:105`: "Sign in to Admin to work on this board." with the sign-in link, and no editing tools. Group 2. |
| Phone: view only with presence; the role decides (D13) | yes | Band "View only on this device. Open Nexo on a computer to edit."; with `?mode=edit` the Owner gets the editing layout and a Viewer stays view only | — | — |
| Phone pill | different | A 24 px circle that reads "L" | should | `ui/shell.css:674`: keep the dot, hide the text. Group 4. |
| Phone avatars | partial | 3–4 avatars make the page 400–441 px wide | should | With the in-flight avatar stack ("+N"). |
| Phone card sheet ("Updated by", "Comments (1)") | different | A tap zooms into the card ("← Back to overview") and opens the whole inspector as a 390×636 px sheet | nice | As cut the phone gets the read-only layout with avatars: leave. |
| Phone comments | missing | Pins are 3×4 px at the fitted 12 %; a tap opens nothing | should | `canvas/pins.ts`: constant size and a 24 px target. Group 8. |

## Scene 8 · How a change travels

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Step 0: join with the Admin token | partial | Works; signed out as in scene 7 | should | Group 2. |
| Steps 1–5: one order per project, settled into the document | different | As built the first settled change spoils the revision (scene 2). With one header value, two simultaneous changes settle in one order and every card agrees | blocker | Group 1. |
| Steps 6–8: renders against the engine revision | partial | As built: three tries, then "The plot is still behind the shared board. Please retry." | blocker | Group 1. |
| Step 9: "Updated by Tomás" | partial | The hidden note of scene 2 | should | Group 4. |
| The earlier author gets "Undo mine" | missing | No notice, no undo | should | Question 3. |
| Finish and Confirm are lab-only at the intent | yes | The sidecar refuses. A client Editor still sees "Finish plot" enabled and gets "Change not allowed: lab_only" | should | `collab/intents.ts:30`: a sentence per reason ("Only lab staff can finish a plot."). Group 5. |
| Phone: view only, presence | yes | Scene 7 | — | — |

## Scene 9 · Roadmap

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Single-user Nexo behind the flag | yes | `?collab=0`: "Autosave ready", no collaboration chrome | — | — |
| Phase 2: presence | partial | Avatars, cursors, selection, editing chip; the rest is in flight | — | Scenes 1 and 2. |
| Phase 3: one order, renders per revision, "Updated by" | different | Broken by the revision header; the stale form | blocker | Groups 1 and 2. |
| Phase 4: versions, restore, Undo | partial | Scene 6 | should | Group 7. |
| Phase 5: "First client-visible release" | partial | A project that lab staff open lives in the lab workspace: the client's members get "forbidden_scope" and Share lists nobody. The two meet on one board only if the client member opens the dataset first, and then the client member is the Owner | blocker for the demo | Question 1. |
| Phase 5: "owner-only share/restore" | different | Any lab staff can share (as cut) and restore (not as cut) | should | Question 2. |
| Phase 6: comments, follow, bring everyone | partial | Scenes 3 and 5 | should | Groups 8 and 9. |
| Phase 7: offline queue, "Before merge" version, account boundary | different | None of it, as cut. The in-memory queue converges, except for the stuck reconnect | blocker | Group 3. |
| "Phones stay view only" | different | `?mode=edit` when the role allows | — | D13 wins: leave. |

## Fixes not in flight, ranked, in groups with disjoint files

1. **Engine revision (blocker).** `frontends/nexo-api/session.R`, `frontends/nexo-api/plumber.R`,
   `frontends/nexo-collab/src/engine.mjs`, `frontends/nexo/src/api.ts`, `tests/dual-ui/test_api_revision.R`,
   `tests/dual-ui/test_nexo_collab_inputs.cjs`.
   - Send the header once: `session.R:677, 685, 705, 721` and `plumber.R:342` use `res$setHeader`, which appends.
   - `engine.mjs:49–51` and `api.ts:80`: never store or accept a revision that is not a finite number.
   - The tests hid it: the fake `setHeader` in `test_api_revision.R` replaces (make it append, as plumber does), and
     `test_nexo_collab_inputs.cjs:29–30` wait for the text "Updated by" and a render answered 200, not for a drawn
     card (also assert that both people's cards draw and that no card says "still behind").
2. **The board follows other people's changes (blocker).** `canvas.ts`, `ui/Inspector/DataTab.tsx`,
   `ui/forms/SchemaForm.tsx`, plus one new journey file.
   - `canvas.ts:100` and `DataTab.tsx:19`: a card's form, open or cached, reloads on another person's change, and
     on every page after a restore (the restorer's too, once the page is on the restored session). Journey: A has
     the Data tab open; B changes the lipid; A's form shows it; A changes another field twice; the lipid is still
     B's. Today A's first change leaves the lipid and the second puts the old one back.
   - The root is `SchemaForm.tsx:53–56`: the form sends its difference from the engine's last answer, not from what
     it showed. Change it only if the reload leaves a gap (my own change in flight while another person's lands).
   - `canvas.ts:105`: a refused or signed-out join gets one sentence without the internal prefix or the reason
     code, the sign-in link when signed out, and no editing tools. Today the board stays editable but is not shared.
   - `canvas.ts:435`: do not share the view in figure mode.
   - Focus inside a card brings the card into view.
3. **Reconnect and pill states (blocker).** `collab/provider.ts`, `ui/App.tsx`,
   `tests/dual-ui/test_nexo_collab_offline.cjs`.
   - `provider.ts:57–58`: do not disconnect on `offline`, or reconnect once the socket reports that it closed.
     Likely cause, not instrumented: the provider's `connect()` returns early while the old socket still counts as
     connected, and `disconnect()` has already switched reconnecting off. Add a journey cycle with a card moved, a
     card selected and the inspector opened while offline.
   - `provider.ts:42–43`: "View only" from the role push. `App.tsx:89` and `:323`: "Connecting" and the dot states.
4. **Cards and phone chrome.** `cards.ts`, `ui/shell.css`. A visible "Updated by …" for about 10 s and the name in
   the veil; failed cards draw again when the board is back; the phone pill keeps its dot.
5. **Read-only inspector and refusal wording.** `ui/forms/SearchablePicker.tsx`, `collab/intents.ts`,
   `collab/refused.ts`, `statistics/settings.ts`. Options inert in a disabled fieldset; one sentence per reason a
   person can meet (`viewer`, `commenter`, `lab_only`, `owner_only`, `stale`, `requires_confirmation`,
   `token_expired`, `engine_unavailable`) and a general one for the rest, instead of "Change not allowed: (code)";
   the form goes back to the board's values after a refusal; "(changed by …)" on invalid statistics.
6. **Share and identity.** `ui/Dialogs/Share.tsx`, `ui/TopBar.tsx`, `ui/strings.ts`, `collab/roles.ts`,
   `frontends/nexo-collab/src/projects.mjs`. The scene 4 rows and the two top-bar rows of scene 1.
7. **Versions.** `ui/Dialogs/CheckpointsDialog.tsx`, `collab/versions.ts`, `frontends/nexo-collab/src/commits.mjs`.
   The scene 6 rows; restore rights after question 2.
8. **Comments.** `canvas/pins.ts`, `ui/Comments/CommentsPanel.tsx`, `ui/Toolbar.tsx`. The scene 3 rows and the
   phone pins.
9. **Follow.** `collab/follow.ts`, `canvas/following.ts`. The scene 5 rows.

The groups are disjoint from each other, not from the tasks in flight, whose file lists this review did not have.
Likely overlaps: group 2 in `canvas.ts` (the minimap is drawn there) and `ui/forms/SchemaForm.tsx` (it publishes
who is editing); group 3 with IndexedDB and the engine pill; group 4 in `ui/shell.css`; group 6 in `ui/TopBar.tsx`
(avatars, comments); group 7 with the version history panel; group 8 with the comments panel and mentions. Hand
each to the agent that already holds those files, or land it first.

Seen while reviewing, for the tasks in flight (their files, not re-designed here):

- Avatar stack (`ui/Presence/Avatars.tsx`): initials at 2.45:1 on the green; a person with two tabs appears twice,
  and my own second tab is offered as someone to follow; no pressed state on the followed avatar; 3–4 avatars
  overflow a 390 px top bar.
- Cursor tag (`canvas/presence.ts`): the label is drawn in board units (about 7 px at Fit; the prototype keeps it
  constant on screen). The name on a remote selection and the field in the editing chip fit the same pass.

## Where the prototype contradicts the decisions (the decision wins)

| Prototype | Decision that wins |
|---|---|
| Scene 4: toggle "Lab only … keep" | Phase 5 as cut: lab-only rules are fixed, no toggles. |
| Scene 4: default role on the link ("new members can comment / edit") | D8 and the effective-role rule: a client member is a Commenter until a row says otherwise. |
| Scenes 4 and 6: "versions are saved into this client's workspace" | D3: a project lands in the caller's scope, so a lab-opened project is in the lab workspace (question 1). |
| Scene 9: "owner-only share/restore" | Phase 5 as cut: Owner or lab staff share. Restore is question 2. |
| Scene 3: votes on a comment (its own scene 9 says "D5 votes: drop") | D5 dropped votes; Gerardo has lifted that cut: in flight. |
| Scene 6: rows "Auto · hh:mm" and "Opened from Admin" | Phase 4 as cut: kinds named, autosave, before-restore; an autosave every 5 minutes only when the revision changed; the last 20. |
| Scene 7: "Your edits are kept on this device" | Phase 2 as cut: no IndexedDB. Lifted and in flight; untrue until it lands. |
| Scene 7 phone card sheet; scene 9 "Phone sheet wired to the role's permissions" | Phase 7 as cut: the read-only layout with avatars. |
| Scene 9: "phones stay view only" | D13 and Phase 7 as cut: `?mode=edit` when the role allows. Built so. |
| Scene 9: "Follow across tab and figure mode" | Phase 6 as cut: follow adopts camera and tab. |
| Scene 9, Phase 7: "Before merge" version, account boundary, offline science re-sent | Phase 7 as cut: none of them. |
| Scenes 2 and 8 "Undo mine"; scene 1 drag ghost | In neither the as-cut text nor the lifted list (question 3). |
| Scene 8 step 9: `renderState.<card>` | As cut: `meta.lastChange`. Built so. |
| Scenes 1 and 5: click an avatar to jump, double-click to follow | Phase 6 as cut: follow adopts the view. Built: one click follows. |

## Questions for Gerardo

1. **Where does a shared project live?** By D3 a project that lab staff open is in the lab workspace: client members
   get "forbidden_scope", and Share lists nobody. Either keep D3 and let the client member open the dataset first
   (that person is then the Owner), or let lab staff who open a client's dataset create the project in that client's
   workspace (`frontends/nexo-api/datasets.R:210` does this only for a client member; the sidecar already accepts
   such a project). This decides whether the demo can show lab and client on one board.
2. **Who restores?** The plan says the Owner (2.4 and the as-cut matrix). The sidecar also lets any lab staff restore
   (`commits.mjs:213`), and the dialog shows "Restore" to every Editor.
3. **Undo of a science change on a shared board.** None as built. Plan 2.3 had "Undo mine" through a new intent;
   the as-cut text says nothing.

No problem was found in the intent contract. The form that is behind (group 2) is a client defect: an `inputs`
intent carries only the changed fields and the later one wins, as designed.

## Screenshots

On the review host, in `/tmp/ux-review-2/` (not committed). A, B, C and X are the people above; the number is the
viewport width.

- Scene 1: `scene-1-A-1440.png`, `scene-1-B-1440.png`, `scene-1-C-1440.png`, `scene-1-A-1440-zoom100.png`,
  `scene-1-B-1440-webkit.png`, `scene-1-A-1440-with-webkit-peer.png`
- Scene 2: `scene-2-A-1440.png`, `scene-2-B-1440.png`, `scene-2-A-1440-updated.png`, `scene-2-B-1440-updated.png`,
  `scene-2-A-1440-settled.png`, `scene-2-B-1440-settled.png`, `scene-2-A-1440-after.png`,
  `scene-2-A-1440-statistics.png`, `scene-2-A-1440-stale-form.png`, `scene-2-B-1440-stale-form.png`,
  `scene-2-A-1440-as-built.png`, `scene-2-B-1440-as-built.png`, `scene-2-A-1440-as-built-stock.png`,
  `scene-2-B-1440-as-built-stock.png`, `scene-2-B-1440-as-built-after-reload.png`
- Scene 3: `scene-3-A-1440.png`, `scene-3-B-1440.png`, `scene-3-C-1440.png`, `scene-3-C-1440-comment-mode.png`,
  `scene-3-C-1440-draft.png`, `scene-3-A-1440-pin-left-behind.png`, `scene-3-C-1440-pin-under-selected-card.png`,
  `scene-3-B-1440-webkit.png`
- Scene 4: `scene-4-A-1440.png`, `scene-4-B-1440.png`, `scene-4-A-1440-first-open.png`, `scene-4-B-1440-focus.png`,
  `scene-4-C-1440-after-role-change.png`, `scene-4-A-1440-lab-only-workspace.png`
- Scene 5: `scene-5-A-1440.png`, `scene-5-B-1440.png`, `scene-5-C-1440.png`,
  `scene-5-A-1440-presenter-on-figure-page.png`, `scene-5-B-1440-figure-page.png`,
  `scene-5-A-1440-follow-by-avatar.png`, `scene-5-B-1440-keyboard-scrolls-stage.png`
- Scene 6: `scene-6-A-1440.png`, `scene-6-B-1440.png`, `scene-6-A-1440-before-save.png`,
  `scene-6-A-1440-restored.png`, `scene-6-B-1440-restored.png`, `scene-6-C-1440-restored.png`,
  `scene-6-A-1440-restored-5s.png`, `scene-6-B-1440-restored-5s.png`, `scene-6-A-1440-list-after-restore.png`,
  `scene-6-A-1440-list-after-undo.png`, `scene-6-A-1440-form-after-restore.png`,
  `scene-6-B-1440-form-after-restore.png`, `scene-6-C-1440-commenter.png`, `scene-6-C-1440-restore-refused.png`
- Scene 7: `scene-7-A-1440.png`, `scene-7-B-1440.png`, `scene-7-A-390.png`, `scene-7-B-390.png`,
  `scene-7-A-1440-peer-offline.png`, `scene-7-B-1440-offline.png`, `scene-7-B-1440-offline-input-change.png`,
  `scene-7-B-1440-back-online.png`, `scene-7-B-1440-stuck-reconnecting.png`, `scene-7-C-1440-viewer.png`,
  `scene-7-C-1440-viewer-thread.png`, `scene-7-C-1440-viewer-inspector.png`,
  `scene-7-C-1440-viewer-tries-input.png`, `scene-7-X-1440-signed-out-visitor.png`, `scene-7-A-390-mode-edit.png`,
  `scene-7-B-390-mode-edit.png`, `scene-7-B-390-card-tapped.png`, `scene-7-B-390-pin-tapped.png`
- Scene 8: `scene-8-A-1440.png`, `scene-8-B-1440.png`, `scene-8-C-1440-finish-refused.png`
- Scene 9: `scene-9-A-1440.png` (flag off), `scene-9-B-1440.png`, `scene-9-C-1440-client-on-lab-project.png`
