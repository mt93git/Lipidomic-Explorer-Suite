# Nexo entry flow: UX review 3 (2026-11-11)

This review compares the built entry flow and the board's quality-check notice, scene by scene, against
`nexo-entry-proposal/prototype.html` and section 7 of `nexo-entry-proposal.md`. It is the gate Gerardo asked for before
production. Build reviewed: this ref (nexo/collab tip `0a6748c8`). This is a review only: no product code changed.

**How it was run.** The real path came from `tests/dual-ui/collab-real.cjs`: R API, sidecar, fake Admin PostgREST and the
built client. Two synthetic people took part. A is lab staff ("Alex Synthetic"). B is a client member with the Commenter
role ("Casey Member"). A signed in, opened Start, prepared ORD900 · v1, ran the quality check, opened the Canvas, added
PCA scores · 2D, and decided on the board (Keep, Undo, Exclude). B joined later from the bare dataset link. The mock path
(`VITE_API_MOCK=1`) covered the states the harness cannot produce: the two-step code, a flagged sample from the quality
check, and Start with several clients or empty. Every scene was captured in Chromium at 1440 px and, where the brief
lists it, at 390 px. Sign-in, Start, Check and the board were spot-checked in WebKit at 1440 px. The capture scripts
were untracked files in /tmp.

**Harness limits found on the way.** These are test gaps, not product bugs:
- The fake PostgREST has no `nexo_datasets_for_caller`, so on the real path Start says "Released datasets could not
  load". The review answered `GET /api/v1/datasets` per contract C2.
- The fixture workbook flags no sample, so the real check shows "Ready for the Canvas". The flagged state on the real
  board was set through the sidecar's `PUT decisions` (undecided), as `test_nexo_collab_real.cjs` does.
- The preview has no `/admin/api/sign-in`. The review answered it per contract C1 (401 `invalid_credentials`, 503, 200).
- R runs without `LIPIDOMIC_ADMIN_REQUIRE_USER`, so every caller shares one store. B's Start therefore lists the lab's
  uploaded checkpoint. Production scopes this per client (`storage.R api_checkpoint_list`).
- The harness stubs Google Fonts, so real-path shots show a fallback font.

**Verdict.** Nothing blocks production. The flow is faithful to the prototype, and the decisions listed below are built
correctly:
- warn, never block;
- Exclude re-prepares for everyone;
- members_prepare;
- checkpoints listed after the projects;
- view-only phones and `?mode=view` on the board.

Numbers agree between Check and board on the real path:
- Prepare showed "24 lipids · 6 samples".
- The check showed "23 lipids, 6 samples".
- The band showed "23 lipids · 6 samples" for A and B.
- After Exclude, the band showed "23 lipids · 5 samples" for both, within about 8 s.

The "should" items below are accessibility and orientation gaps. Fix them before a wider pilot.

## Scene 1 · Sign in

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Spectrum art, one white card, heading and sub-line | yes | Same copy, art and lab logo in the bar (`signin-signedout-A-*`). | — | — |
| Card 400 px, padding 32 (24 on a phone) | different | Card is 520 px with 36/40 px padding at 1440; 350 px with 28/24 at 390. | nice | `SignInScreen.css`: set max-width to 400 px and padding to 32 px (24 px on a phone). |
| Fields 40 px (44 touch), 16 px input text on touch | different | Fields are 30 px high (32 px on a phone) and input text is 13 px, so iOS zooms in when a field gets focus. | should | `SignInScreen.css`: use `height: var(--field-h)` and `font-size: 16px` under `(pointer: coarse)`. |
| Field border `--field` #7d8a99 (3.5:1) | missing | Border is #cfd6de, 1.5:1 against white. This fails WCAG 1.4.11 for a field's edge. | should | `SignInScreen.css`: set `border-color: var(--field, #7d8a99)`. |
| Focus: 2 px ring, 2 px offset | different | The ring is Team's 3 px at 3 px offset in #2674b9. Start and Check use 2/2 in the accent. | nice | `SignInScreen.css`: use the shared 2 px / 2 px accent ring. |
| Password "Show" | missing | There is no Show toggle. | nice | `SignInScreen.tsx`: add a Show/Hide button in the password field. |
| Email focused on arrival | missing | Nothing has focus, so the first Tab goes to Email. | nice | `SignInScreen.tsx`: add `autoFocus` on Email. |
| Wrong password: the sentence next to the field | yes | "Email or password is not right. Check both, or reset your password." (`signin-wrong-password-A-1440`). | — | — |
| Keyboard after a rejected sign-in | missing | Focus drops to `<body>`, because Continue is disabled while the request runs. A keyboard user has to tab in again. | should | `SignInScreen.tsx`: after an error, move focus to the password field (or the code field). |
| Invalid field: 2 px red border and icon | partial | `aria-invalid` is set but has no style. Only the red sentence shows. | nice | `SignInScreen.css`: add a red 2 px border for `[aria-invalid=true]`. |
| Two-step code, auto-submit at 6 digits, wrong-code copy | yes | "Step 2 of 2", "Enter your 6-digit code" and "Not you?" show. The field submits at 6 digits, and a wrong code shows Team's sentence (`signin-code-*`, `signin-wrong-code-*`). | — | — |
| Signed out mid-work: "…go back to ORD041 · v1" | partial | "You were signed out. Sign in to go back to your board." The board is not named (`signin-from-link-A-1440`). | nice | `main.tsx`: pass the dataset's order code to `signedOutFrom` when it is known. |
| Error states | yes | 503 shows "Sign in is unavailable. Please try again later." | — | — |
| Bar: Help on the right | missing | The bar has the logo and the name only. | nice | Covered in group C (`EntryBar.tsx`). |

## Scene 2 · Start

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Sheet, "Continue where you left off", projects, released datasets, checkpoint import | yes | Close to the prototype at 1440 in both engines (`start-A-1440-*`). | — | — |
| "Welcome back, Ana" | partial | "Welcome back" with no name. | nice | `StartScreen.tsx`: add the caller's `displayName` (from the token) to the heading. |
| Lipid and sample counts on each row and on Continue | missing | Rows show "Prepared by X · 3 Nov" only. The client's "New from the lab" card lacks "74 lipids · 6 samples". | should | `StartScreen.tsx`: show counts from the project's prepared summary. This needs C4 to return `lipids` and `samples`; until then, drop the promise from the help. |
| "Prepared by you" on your own rows | missing | Your own name is shown as a third person. | nice | `StartScreen.tsx`: say "you" when `createdBy.userId` is the caller. |
| Client filter | partial | With 0 projects and "All clients" selected, it says "No projects for this client yet." (`start-real-A-1440`). | nice | `StartScreen.tsx`: say "No projects yet." when the filter is `all`, and hide the filter when there is one client or none. |
| Client member: own group, "New from the lab", Open | yes | Correct. A released dataset shows "Waiting for the lab" (members_prepare off) (`start-client-B-*`, `start-real-client-B-1440`). | — | — |
| Empty: "…releases a dataset to Fennel Hill group…" | partial | "…to your group…": with nothing released, the client's name is unknown (`start-empty-B-*`). | nice | `StartScreen.tsx`: read the group name from the caller's clients, not from the datasets. |
| Empty, lab staff | yes | The staff copy, plus the upload and import lines (`start-empty-A-1440`). | — | — |
| "Your checkpoints" after the projects (decision) | yes | Below Projects, above Released datasets. A second heading ("Prepared in Team" / "Saved checkpoints") sits under it. | nice | `StartScreen.tsx`: drop the group sub-heading when there is only one group. |
| Loading and error states | yes | "Loading your projects…". "Released datasets could not load. Try again in a moment." shows and does not block (`start-real-error-*`). | — | — |
| Phone 390: two-line rows, 40 px buttons | yes | One column; upload and import are hidden (view-only). But **Prepare** stays on released datasets (`start-A-390`). | should | See Check: a phone is view-only, so `StartScreen.tsx` shows "Prepare on a computer" in its place when `isReadOnly()`. |
| Row with people online | partial | The avatar wraps onto its own line under "Prepared by…", and the column looks ragged at 1440 and 390. | nice | `StartScreen.css`: keep the avatar and its sentence on one line (`white-space: nowrap` on `.start-state > span:last-child`). |
| Bar: Help and the account (name and role pill) | missing | There is no account, no sign-out and no Help on any entry screen. | should | Covered in group C (`EntryBar.tsx`). |

## Scene 3 · Prepare

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Title "Prepare ORD041 · v1" and dataset chip in the bar | missing | "Prepare the data", with no dataset name anywhere on the screen. A person with several releases cannot tell which one they are preparing. | should | `PrepareScreen.tsx` and `main.tsx`: pass the order code and version from Start, and title with `prepareStrings.title(name)` (it already exists). |
| Five rows in a 152 px title column, Team's defaults | yes | Samples by group, detection slider plus scope, QRILC, normalization, study design never prefilled (`prepare-defaults-*`). | — | — |
| Live preview: 40 px count, histogram, facts, "Show as table" | yes | Recounts at once (`prepare-threshold-*`). The mock's matrix still keeps 74 at 70 %; that is fixture data. | — | — |
| More settings (folded, Team's defaults) | yes | Folded under "More settings · Team's defaults" (`prepare-more-*`). | — | — |
| Bar: count, "n changes · Reset", Cancel, Prepare and check | yes / partial | At 1440 it is as in the prototype. At 390 the bar drops Cancel; "‹ Start" is the only way back. | nice | `PrepareScreen.css`: keep Cancel as a text button in the phone bar. |
| Control heights (32 mouse / 40 touch) | partial | Segments are 32/40 px, but "Select all" and "Clear" are 13 px high text and the sample checkboxes are 16 px with a mouse. | nice | `PrepareScreen.css`: give the links and chips a 32 px tap area. |
| Busy state | yes | "Preparing with Team…" shows; the real prepare took about 3 s. | — | — |

## Scene 4 · Quality check

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Title "Quality check · ORD041 · v1" | partial | "Quality check", with no dataset name. | should | `CheckScreen.tsx`: add the name passed from `main.tsx` (as in Prepare). |
| Lede "74 of 76 lipids, 6 samples" | partial | "74 lipids, 6 samples". Matches the band, but loses "of 76". | nice | `CheckScreen.tsx`: add "of {total}". |
| Verdict "1 sample to review", strong amber (decision), Keep / Exclude… | yes | Amber card with a 2 px border, which is stronger than the prototype as decided. The copy says either way the Canvas opens (`check-flagged-*`). | — | — |
| Flag copy in Team's units | different | "distance 4.84; Team flags beyond 3.45" (the distance limit) instead of "5.7 MAD … Team flags above 2.5". It is correct, but harder to compare with Team's 2.5. | nice | `CheckScreen.tsx`: add "(2.5 MAD)" after the limit. |
| Exclude asks for an optional reason | yes | `check-exclude-form-*`. | — | — |
| Three checks: status icon and word, charts, legend, "Show as table" | yes | All three cards. Chart points take keyboard focus and announce their values. | — | — |
| "Ready for the Canvas" (none flagged) | yes | Real path and mock (`check-clear-*`, `check-real-A-1440`). | — | — |
| Bottom bar never disabled | yes | "Open the Canvas" always works; the undecided flag travels to the board. | — | — |
| Phone: view-only (decision) | different | At 390 the check offers **Keep Treated_3 / Exclude…**, and Open the Canvas creates the project from a phone. | should | `CheckScreen.tsx` (with Start's Prepare): hide the decision when `isReadOnly()`, as the board does, or ask Gerardo whether preparing from a phone is wanted. |
| Hand-off card "Opening your board" | partial | A one-line status, then the board (`handoff-real-A-1440`). The joiner gets the join card. | nice | `main.tsx`: reuse `JoinCard` ("Data prepared with Team ✓ · Loading the board…") for the preparer. |

## Scene 5 · The board as A (lab staff)

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Chip "Prepared by you · settings" in the band | partial | "Prepared by Alex Synthetic · settings", even on your own board. | nice | `BoardNotice.tsx`: say "you" when the preparer is the caller. |
| Undecided banner (decision: until someone decides) | yes | An amber pill in the band: "Treated_3 looks like an outlier and is still undecided · Review" (`board-banner-*`, `board-real-banner-A-1440`). | — | — |
| Settings card: settings and decision, "Everyone on this board sees the same prepared data." | yes | Includes the why ("An outlier can pull group means…") and Keep / Exclude… (`board-settings-card-*`). | — | — |
| Card row "Result: 74 of 76 lipids · 6 samples", "6 of 6 · 3 Control · 3 Treated" | partial | "Samples 6", with no groups and no Result row; the band carries the count. | nice | `BoardNotice.tsx settingsFacts`: add the groups, and the date prepared in the title. |
| Keep → "Treated_3 flagged, kept by X · Undo" | yes | Real path: B's banner goes away live, and Undo brings it back for B (`board-real-kept-A`, `board-real-after-undo-B`). | — | — |
| Exclude → re-prepare for everyone (decision) | yes | "Preparing again with Team…", then the band shows "23 lipids · 5 samples" for A and B, and the card shows "Treated_3 excluded by Alex Synthetic · synthetic reason · Undo" (B sees no Undo). Settings carry `outlierTreatments: {Treated_3: "remove"}` and all 6 `samples` (`board-real-excluded-{A,B}-1440`). | — | — |
| Target sizes | partial | Chip 22 px high, Review 30 px, close 28 × 28 with a mouse (40 on touch). | nice | `BoardNotice.css`: min-height 32 px for the chip and the links. |
| Keyboard | partial | The chip opens the card, but focus stays on the chip, and Escape closes the card only from inside it. | nice | `BoardNotice.tsx`: move focus to the card's heading on open, and handle Escape at `.board-notice`. |
| The card over the open Plot library | different | The card covers the library's first column (`board-settings-card-A-1440`). | nice | `BoardNotice.css`: anchor the card under the chip, left of the library edge, or close the library while it is open. |
| Mock band numbers | different | The mock's band says "76 lipids · 6 samples" while its check says 74, and it stays at 6 after Exclude. The real path is right. | nice (tests) | `src/mock/dataset.ts`: return the prepared counts (lipids kept, samples minus excluded) in the mock session. |

## Scene 6 · The board as B (client member, Commenter, bare dataset link, joining later)

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Joiner: no Prepare, join card "Nothing to prepare…" | yes | "Prepared by Alex Synthetic · settings / Nothing to prepare. You are joining the board Alex Synthetic prepared." plus the settings and "Opening the shared board…". The URL gains `&project=`, and no project is created. | — | — |
| Band: count, role, chip, banner | yes | "23 lipids · 6 samples · You can comment · Prepared by Alex Synthetic · settings · ⚠ Treated_3 … · Review" (`board-real-join-B-1440`). | — | — |
| Card for someone who may not decide | yes | No Keep or Exclude. "Lab staff, or someone allowed to prepare this board, can keep or exclude it." (`board-real-card-B-1440`). | — | — |
| PCA scores · 2D (png) drawn for a later joiner | yes | Drawn as an image (`board-real-join-B-1440`). Its colours are Team's (Control red, Treated blue), the reverse of the check's (Control blue, Treated orange). | nice | Note only: the check's palette could follow Team's group colours (`ui/entry/charts.ts`). |
| Live follow of A's decisions | yes | Keep, Undo and Exclude reach B without a reload. | — | — |

## Scene 7 · Phone 390 px and `?mode=view`

| Prototype element | Built? | What the user sees now | Severity | Smallest fix |
|---|---|---|---|---|
| Board view-only, no Keep / Exclude (decision) | yes | A and B at 390 and `?mode=view` at 1440 get the card without decisions. The bar says "View only" (`board-real-{A,B}-390`, `board-real-modeview-A-1440`). | — | — |
| Read-only sentence fits the reason | different | Lab staff on a phone read "Lab staff, or someone allowed to prepare this board, can keep or exclude it.", which is about themselves (`board-settings-card-A-390`). | should | `BoardNotice.tsx`: when read-only comes from the device or `mode=view`, say "Open this board on a computer to keep or exclude it." |
| Band on a phone | partial | B's role sentence is cut to "You ca…" and the banner to "Treated_3 looks like …" (`board-real-B-390`). The toolbar takes 3 rows. | should | `shell.css` (phone `.status-band`): wrap the band onto two lines, or give the role sentence `flex: none`, so "You can comment" is never cut. |
| Start and Check at 390 | see scenes 2 and 4 | One column, no horizontal scroll, 44 px primary buttons. Prepare and Keep/Exclude are still offered (see above). | — | — |

## Fixes, ranked, in groups that touch disjoint files (one agent per group)

**A · Sign-in accessibility** (`ui/entry/SignInScreen.tsx`, `SignInScreen.css`): should.
1. Use 16 px input text on touch and `--field-h` heights (40 / 44 px).
2. Set the field border to `--field` (3.5:1).
3. After a rejected sign-in, move focus back to the field.
4. Then the nice items: a 2/2 focus ring, a 400 px card, Show, `autoFocus` on Email, and a red border on `aria-invalid`.

**B · Board notice by reason** (`ui/entry/BoardNotice.tsx`, `BoardNotice.css`): should.
1. Make the read-only sentence match the reason: device or `mode=view` versus role.
2. Then the nice items:
   - a 32 px chip and links;
   - focus into the card and Escape;
   - "you" for your own board;
   - groups and date in the card.

**C · Name the dataset and the person** (`main.tsx`, `ui/entry/EntryBar.tsx`, `ui/entry/PrepareScreen.tsx`, `ui/entry/CheckScreen.tsx`, `ui/entry/strings.ts`): should.
1. Title Prepare and Check with "ORD041 · v1" (passed from Start or from the dataset link).
2. Add a dataset chip, Help and the account (name, role pill, Sign out through `<base>/api/sign-out`) to `EntryBar`.
3. On a view-only device, hide Keep / Exclude on Check, as on the board (or confirm with Gerardo).
4. Name the board in `signedOutFrom`.

**D · Start polish** (`ui/entry/StartScreen.tsx`, `StartScreen.css`): should for counts and the phone Prepare, nice for the rest.
1. Show lipid and sample counts on rows. This needs C4 to return them (sidecar `projects.mjs`, a separate group if taken).
2. On a view-only phone, replace Prepare with "Prepare on a computer".
3. Copy fixes:
   - "No projects yet." when the filter is All;
   - hide a one-client filter;
   - the group name in the client's empty state;
   - "Prepared by you".
4. Keep each avatar on one line with its sentence; drop the redundant checkpoint sub-heading.

**E · Phone band** (`ui/shell.css`, phone `.status-band` rules only): should. Never cut the role sentence; let the
banner wrap or shorten to "⚠ Treated_3 undecided · Review" under 600 px.

**F · Test harness and mock** (`tests/dual-ui/collab-real.cjs`, `frontends/nexo-collab/test/fake-postgrest.mjs`,
`src/mock/dataset.ts`): should for the gate's repeatability.
1. Add `nexo_datasets_for_caller` to the fake PostgREST.
2. Stub `/admin/api/sign-in` in the preview.
3. Run R with `LIPIDOMIC_ADMIN_REQUIRE_USER=1`.
4. Use a fixture whose check flags one sample.
5. Make the mock band report prepared counts.

## Where the prototype contradicts the decisions (the decision wins; the build follows the decision)

- **Data sources.** The prototype has no upload: data come only from Admin releases. The decision (C5) adds "Upload an
  Excel workbook" for lab staff, and for members when members_prepare is on. Built: the upload line is on Start
  (staff, and members with members_prepare), hidden on phones.
- **Who prepares.** The prototype's client Start shows "Prepare" on a released dataset. The decision makes this lab-only
  unless members_prepare is on. Built: "Waiting for the lab · the lab prepares it first".
- **Strength of the check.** The prototype's check "advises". The decision says it warns strongly and never blocks.
  Built: an amber 2 px border, a band banner until decided, and Open the Canvas never disabled.
- **What Exclude does.** In the prototype, Exclude removes the sample for the preparer and Undo restores it. The
  decision says Exclude re-prepares for everyone (`outlierTreatments`). Built, with copy that says so: "Excluding
  prepares the data again without it, for everyone on this board."
- **Checkpoint lists.** The prototype cuts them ("versions live on the Canvas"). The decision adds "Your checkpoints"
  after the projects for imported Team checkpoints. Built.
- **Phones.** The prototype draws Prepare and the check, with Keep / Exclude, at 390 px. The decision says phones and
  `?mode=view` are view-only. The board follows the decision; Start's Prepare and the check's Keep / Exclude on a phone
  still follow the prototype (group C/D).
- **Two-step code.** The prototype shows the code step for every account. Gerardo's answer 1 asks for the code only when
  two-step is on. Built: the step shows on `code_required`.

## Screenshots (in /tmp/ux-review-3/, not committed)

Mock path (Chromium 1440 and 390; WebKit 1440 where marked w):
- Sign-in:
  - `scene-signin-signedout-A-{1440,390}-chromium.png` (w)
  - `scene-signin-empty-A-{1440,390}-chromium.png` (w)
  - `scene-signin-code-A-{1440,390}-chromium.png` (w)
  - `scene-signin-wrong-code-A-{1440,390}-chromium.png` (w)
- Start:
  - `scene-start-A-{1440,390}-chromium.png` (w)
  - `scene-start-client-B-{1440,390}-chromium.png`
  - `scene-start-empty-A-{1440,390}-chromium.png`
  - `scene-start-empty-B-{1440,390}-chromium.png`
- Prepare:
  - `scene-prepare-defaults-A-{1440,390}-chromium.png` (w)
  - `scene-prepare-defaults-full-A-1440-chromium.png` (w)
  - `scene-prepare-threshold-A-{1440,390}-chromium.png` (w)
  - `scene-prepare-more-A-{1440,390}-chromium.png` (w)
  - `scene-prepare-unticked-A-{1440,390}-chromium.png`
- Check:
  - `scene-check-flagged-A-{1440,390}-chromium.png` (w)
  - `scene-check-flagged-full-A-1440-chromium.png` (w)
  - `scene-check-exclude-form-A-{1440,390}-chromium.png` (w)
  - `scene-check-clear-A-{1440,390}-chromium.png`
- Board:
  - `scene-board-banner-A-{1440,390}-chromium.png` (w)
  - `scene-board-settings-card-A-{1440,390}-chromium.png` (w)
  - `scene-board-kept-A-1440-chromium.png` (w)
  - `scene-board-undo-A-1440-chromium.png` (w)
  - `scene-board-exclude-form-A-1440-chromium.png` (w)
  - `scene-board-exclude-busy-A-1440-chromium.png` (w)
  - `scene-board-excluded-A-1440-chromium.png` (w)
  - `scene-board-clear-card-A-{1440,390}-chromium.png`
- `?mode=view`: `scene-modeview-entry-A-1440-chromium.png`

Real path (Chromium):
- Sign-in:
  - `scene-signin-wrong-password-A-1440-chromium.png`
  - `scene-signin-unavailable-A-1440-chromium.png`
  - `scene-signin-from-link-A-1440-chromium.png`
- Start:
  - `scene-start-real-error-A-1440-chromium.png`
  - `scene-start-real-error-client-B-1440-chromium.png`
  - `scene-start-real-A-{1440,390}-chromium.png`
  - `scene-start-real-client-B-1440-chromium.png`
  - `scene-start-real-B-390-chromium.png`
- Prepare:
  - `scene-prepare-real-A-1440-chromium.png`
  - `scene-prepare-real-full-A-1440-chromium.png`
  - `scene-prepare-real-busy-A-1440-chromium.png`
- Check:
  - `scene-check-real-A-1440-chromium.png`
  - `scene-check-real-full-A-1440-chromium.png`
  - `scene-handoff-real-A-1440-chromium.png`
- Board as A:
  - `scene-board-real-A-{1440,390}-chromium.png`
  - `scene-board-real-png-A-1440-chromium.png`
  - `scene-board-real-banner-A-1440-chromium.png`
  - `scene-board-real-card-A-{1440,390}-chromium.png`
  - `scene-board-real-kept-A-1440-chromium.png`
  - `scene-board-real-modeview-A-1440-chromium.png`
- Board as B:
  - `scene-join-card-B-1440-chromium.png` (the join card while the board loads)
  - `scene-board-real-join-B-1440-chromium.png`
  - `scene-board-real-card-B-{1440,390}-chromium.png`
  - `scene-board-real-B-390-chromium.png`
  - `scene-board-real-after-keep-B-1440-chromium.png`
  - `scene-board-real-after-undo-B-1440-chromium.png`
- Exclude: `scene-board-real-exclude-busy-A-1440-chromium.png`, `scene-board-real-excluded-{A,B}-1440-chromium.png`
