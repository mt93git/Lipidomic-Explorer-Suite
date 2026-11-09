# Admin: global all-clients overview (design note)

Status: implemented in `frontends/admin/` on 2026-11-07 (mock mode). Follows
`docs/admin/admin-wave1-brief.md`. Revised the same day after Astra's review (P1-1..P1-4,
P2-5..P2-10): URL encoding, client-audience leak, facet counts, release instants, clock, focus,
small screens, integration tests.

## Why

Gerardo liked the first kanban but did not want to pick a client before working. Lab staff
(Owner, Admin, Operator) see every client by RLS anyway, so the app should open on the whole
lab's work and let a client be a *filter*, not a *prerequisite*. Client users keep their own
portal and still choose a client only when they belong to several.

## Layout (top to bottom)

1. **Top bar**: brand, search, demo view switch, **scope control** (`All clients ▾` by default),
   user chip. For staff the scope control is a small menu of links into the overview with the
   client filter toggled; it reads the same URL params as the board, so it always shows the
   current scope (one name, `2 clients`, or `All clients`). It never persists anything. For client
   users the old `Choose client` link remains (only when they have several memberships).
2. **Heading**: `Lab work / <scope>` eyebrow, `Pipeline`, the two actions (Receive shipment, New
   order).
3. **What needs you now**: six tiles that are buttons (`aria-pressed`): Blocked at a gate, Ready
   to advance, Awaiting checks, On the instrument (stage 6 Sequence exported), Waiting for results
   (stage 7 Acquired), Released this week (see *Time rules*). Counts are computed over
   the current scope ignoring the tile dimension itself, so the other tiles stay informative while
   one is pressed. Click again to release. The heading shows `as of HH:MM EST` (lab clock), the
   instant the counts refer to.
4. **By client**: one compact row per client (colour square, name, `n open`, `n blocked` in red
   when > 0) plus `All clients`. Rows toggle the client filter (multi-select). Counts ignore the
   client filter so unselected clients remain comparable and the scope can be widened.
5. **Toolbar**: free-text search (order code, description, batch code, panel, owner, or a sample
   code such as `ORD047-S012`, valid only within that order's sample count), `Stage ▾`, `Panel ▾`,
   `Owner ▾` checkbox menus with facet counts, and the `By stage | By client` group toggle.
   A facet count is the number of orders that option would leave on the page (board **and**
   released list) with every other active filter applied: with `Released this week` pressed the
   menus count released orders, never 0 for an option that matches. Menus open inside the
   viewport: right-aligned when they would cross the right edge, a full-width sheet under the
   toolbar at 760 px and below.
6. **Active filter chips**: one per value, each removable, plus `Clear all` (keeps the group mode).
   Long values truncate with an ellipsis; the full value stays in the button's `aria-label` and
   `title`, and the `×` is always visible. Removing a chip moves keyboard focus to the next chip,
   else the previous one, else the toolbar search; `Clear all` moves it to the toolbar search.
7. **Board**: by stage = the ten-column kanban (own horizontal scroll region, unchanged look); by
   client = one swimlane per client in scope with cards sorted by stage and a `05 · In batch`
   label on each card.
8. **Released**: a list below the board (code, description, client, release date). With the
   `Released this week` tile pressed the board hides and this list is the main content.
9. **Empty state** says what to change: the search text, the pressed focus, or the dimension list.
   Stage headings stay visible so the board does not jump.

## Filter model

Pure module `src/lib/pipeline-filters.ts` (tested in `tests/pipeline-filters.test.ts`):

| Param | Values | Semantics |
|---|---|---|
| `client` | repeated key, one client id each (`client=a&client=b`); the legacy comma form `client=a,b` is still read because ids are slugs | OR within, unknown ids dropped |
| `stage` | repeated key of slugs (`request`, `received`, `registered`, `extracted`, `in-batch`, `sequence-exported`, `acquired`, `processed`, `qc-checked`, `excel-built`); legacy comma form accepted | OR within |
| `focus` | `blocked` `ready` `waiting` `instrument` `results` `released` | single; gate state or stage set |
| `panel` | repeated key, one panel name each, never split, max 120 chars | OR within; `PC, PE` is one value |
| `owner` | repeated key, one owner name each, never split, max 120 chars | OR within; `Doe, Jane` is one value |
| `q` | one scalar, kept exactly as typed (spaces included), max 200 chars | trimmed and lower-cased only for matching: substring, or sample-code pattern |
| `group` | `stage` (default, omitted) or `client` | view mode, not a filter |

Dimensions combine with AND. Defaults are omitted from the URL, so `/admin/pipeline` is the
clean global view and `/admin/pipeline?client=example-cedar&focus=blocked` is a shareable view.
`parseFilters` accepts both `URLSearchParams` and Next's `searchParams` record (repeated keys
arrive as arrays); unknown params are ignored. `serializeFilters` is stable (fixed key order,
sorted stages) so a round trip is lossless for commas, spaces and unicode
(`tests/pipeline-filters.test.ts`). The search box is controlled from the parsed URL, which is
why `q` must never be trimmed on the way in or out: the user types `panel ` and keeps the space.

State lives only in the URL. The client component `PipelineOverview` reads `useSearchParams()`
and writes changes with `window.history.replaceState`, which Next integrates into its router, so
no server round trip happens per click and the top-bar scope control updates at the same time.
The top-bar search (`GlobalSearch`) carries the other active filters as hidden fields, so a plain
GET keeps them; with JavaScript the submit becomes a `pushState` entry. Scope-control links are
ordinary navigations (new history entries). Reload and back/forward restore the view;
`tests/overview-integration.test.tsx` renders shell and overview together and checks URL, card
identities, pressed tiles and the scope label after each interaction.

## Time rules

* `Order.releasedAt` is the instant of the second signature as an ISO 8601 timestamp **with
  offset** (`2026-11-05T16:20:00-05:00`). A bare date would be read as UTC midnight and shift by a
  day depending on the viewer.
* **Released this week** = `0 ≤ now − releasedAt ≤ 7 × 24 h`, a rolling window measured between
  instants. Across the DST change the same wall-clock time a week later is 169 h and falls out;
  tests cover 2026-11-01 and America/New_York offsets.
* `now` starts as the server's instant (passed as a prop, so server and client render the same
  markup) and is refreshed on every filter interaction and once a minute while the page is open.
  Clocks and release days are formatted in the lab's zone (`America/New_York`, `src/lib/lab-time.ts`),
  so the text is identical on both sides and unambiguous for a shared screenshot.

## Mixed batches and audiences

Orders carry an optional `batch` code; two orders from different clients with the same batch are
a mixed batch. `scopeToAudience(orders, clients, audience, ownClientIds)` runs **before** the
rendering component sees any data:

* **staff**: every order and client, plus `companions[code]`, the companion client records of each
  mixed batch. Cards show the owner's colour square followed by the companion client's square
  (`title="Batch shared with Example Cedar"`) and the line `Batch B2026-031 · shared with Example
  Cedar`.
* **client**: only the user's own orders and own client records; `companions` is empty. The only
  thing kept from other clients is `sharedBatches`, the list of batch codes that are mixed. The
  card shows one neutral grey mark (`title="Shared run"`) and `Batch B2026-031 · also contains
  another client's samples`. The client strip and the swimlanes list only the user's own clients.
  `tests/pipeline.test.tsx` scans the whole rendered HTML, attributes included, for other clients'
  names.

Filtering by one client keeps the companion mark and the note, because `scopeToAudience` looks at
all orders, not the filtered set. `batchNote(order, companions, shared)` is pure and tested.

## Session changes

* Staff sessions have `selectedClient = null` in mock and live mode; the client cookie is read
  only for client users. The demo no longer shows `Example Atlas` as if work were scoped to it.
* `/choose-client` redirects staff to `/pipeline`; the sidebar hides `Choose client` for staff.
* The `chooseClient` action, if ever submitted by staff, redirects to `/pipeline?client=<id>`
  without writing the cookie. Client users are unchanged (cookie + `/client/home`).

## Example data

Five clients (Atlas, Cedar, Meridian, Harbor, Juniper; two new colour tokens), 21 orders covering
all ten working stages, four panels, three owners, two mixed batches (`B2026-031`, `B2026-029`),
two single-client batches, four blocked gates (identifiers, thawed tubes, unmatched injection, QC
drift), one order awaiting its second signature, three released datasets (two within the week of
2026-11-07, one older; `releasedAt` instants carry the lab's offset). `tests/demo-data.test.ts`
guards this coverage.

## Decided not to do (and why)

* **No persisted staff "current client"** (cookie or profile). It is what the first version did
  and what made the app feel scoped. A URL filter is shareable, visible, and cannot silently
  leak into other screens.
* **No eleventh "Released" column.** Released is terminal; a column would push the live stages off
  the screen. The list below the board, promoted by the `Released this week` tile, covers it.
* **No saved views or server-side filtering yet.** With the Wave 2 database the same URL params
  should become query parameters; the pure module stays the contract.
* **No multi-focus.** Focuses are mostly exclusive gate states; combining them added UI without a
  real question behind it.
* **Swimlanes list cards by stage instead of a per-client mini kanban**, which would not fit a
  390 px screen and duplicates the stage board.

## Responsiveness

At 1200 px the tiles go to three columns; at 760 px to two, the per-tile note hides, client rows
take half the width, the toolbar search spans the row and the scope menu opens to the left edge.
Stage/Panel/Owner menus become a full-width sheet under the toolbar (no `left: 0 + min-width`
overflow); chips truncate; the empty state wraps long values (`overflow-wrap: anywhere`). The
kanban keeps its own horizontal scroll; the page itself never scrolls sideways at 390 px
(`frontends/admin/verification/`).
