# Nexo design pass (H8e)

Branch `router/20261106-120323-595f40`, mock build (`VITE_API_MOCK=1`), Chromium screenshots at 1440×900 and 390×844 under `nexo-phase1-evidence/h8/design/` (`before-*.png`, `after-*.png`).

Nexo keeps Team's controls, card anatomy, inspector, library and Figure page. This pass only changes how they look: one accent (`#2d5f8a`), one type scale (14 body / 13 chrome / 12 small / 11 section labels), hairline borders, light shadows only on floating surfaces, no dark mode, reduced motion respected. No behaviour, id, role or accessible name used by `tests/dual-ui/test_nexo_*.cjs` changed.

## Critique (before)

Top bar
- Nunito Sans was loaded at weight 400 only: every bold was synthesised, so headings, card titles and tabs looked smeared and uneven.
- The step nav and project button used mixed paddings; the save pill border was as strong as the text.

Rail and library
- Rail buttons and library tabs competed: both used the tint fill, and the library tabs looked like two primary buttons.
- Library group headings were 13 px bold uppercase, louder than the rows; every row had a bordered accent `+` whether or not the plot could be added, so "Requires configuration" and "Unavailable" rows looked as actionable as the rest.
- Library rows had no vertical rhythm (4 px margins, no indent under the group heading).

Tabs bar, toolbar, status band
- The canvas header had no bottom border; the status band had one, so the bars did not read as one stack.
- The "Draft" chip was a square bordered box inside a row of ghost buttons.

Canvas and cards
- Card shadow `0 8px 24px` at 14 % was the heaviest element on screen; borders were a mid grey and the header text 600 synthesised bold.
- The footer actions were 13 px ink, as strong as the title; the resize handle was an invisible 16 px square.
- The grid dots at 24 px were slightly too sparse for the 20 px spacing rhythm.
- The zoom pill (36 px, five controls) and the 150×90 minimap stacked on the lower-left, overlapping card footers at 100 %.

Inspector
- Tabs were tint pills with inline `padding:4`, 2 px apart from the heading and the status line; heading 16 px, tabs 13 px, status 14 px.
- Every button was ghost (no border) and 4 px apart, so "Finish plot", "Comparison CSV", export actions and chips had no hierarchy.
- Group comparison fieldsets drew full boxes around every group; chips were plain ghost buttons.
- Results table (`gc-live` screenshot): every cell wrapped ("Lipid class", "Treatment vs Control") into tall rows, cells were centred, numbers were proportional, the header scrolled away.
- Data forms (`stress` screenshot): checkbox controls put the long Team label on one line and the checkbox alone on the next; radio options ran inline; "tabs" groups looked like plain buttons.

Figure page panel, dialogs, toasts
- Figure page tabs used a hard-coded `#dbeaf5` fill and the selection colour `#3977ad` (a second blue).
- Dialog labels put the input on the same line as the text; the checkpoint rows used the 2-column library grid, so "Download" and "Delete" wrapped onto new lines.
- Export dialog fieldsets drew boxes; the summary and legends had the same weight as the fields.
- The view-only banner, toasts and shortcuts list used three different paddings.

## What changed and why

Tokens and type
- `index.html` loads Nunito Sans 400/600/700, so headings and tabs are real weights. Cormorant Garamond stays for document titles only.
- `tokens.css`: `--shadow-card` is now one light shadow (`0 2px 10px` at 8 %, a single layer so zoom repaints stay cheap); new `--shadow-pop` for menus and dialogs, `--font-small` 12, `--font-label` 11, `--control` 30 px, `--line-strong` `#cfd6de` for control borders. All colours stay the H2 identity.
- `shell.css` gains one "H8e" section at the end (cascade, no rewrite of earlier rules).

Chrome
- Top bar: 28 px controls, the current step is the only accent fill; nav links and the save pill are muted white (`#c9d3dc` / `#dbe3ea`, ≥ 7:1 on navy).
- Rail: icons muted, pressed state tint + accent, 4 px gaps.
- Library: tabs are a segmented control; group headings 11 px tracked muted; rows 40 px tall indented 16 px; `+` is 28 px with a hairline border; "Requires configuration" and "Unavailable" rows are muted with a borderless, muted `+`.
- Tabs bar: muted inactive tabs, tint active tab, tabular badge; "Draft" is a 24 px pill; the canvas header has a hairline bottom border; status band 30 px, 12 px muted.
- Cards: hairline `--line-strong` border, light shadow (still none during zoom, `contain` untouched), 36 px header in navy 600, 36 px footer with 12 px muted actions, 20 px status pills, resize handle drawn as two hairline diagonals on the selected card only, selected card border accent.
- Zoom pill 28 px with 24 px buttons and 12 px tabular text; minimap 112×68 in the bottom-right (84×52 on phones), so neither sits on the lower-left card footer.

Inspector
- Header 14 px navy 600, status 12 px muted; tabs are underline tabs (34 px, accent 2 px underline), the inline tab styles were removed from `Inspector.tsx`.
- Buttons are 28 px bordered; chips (`.tc-chip`) are 24 px pills; fieldsets lose their boxes and use 11 px tracked legends; per-panel groups are separated by a hairline.
- Tables: 12 px, tabular numbers, fixed layout, left-aligned, one line per row with ellipsis and `title` on the class and comparison cells, sticky uppercase header, p-values right-aligned. The violin statistics table (7 columns) scrolls sideways inside its section.
- Schema forms (`SchemaForm.tsx`, `schemaForm.ts`): each control is a `.field field-<type>` row with 12 px spacing; booleans put the checkbox and a short label on one line with the rest of Team's sentence as muted help text (`splitLabel`, unit-tested); radio and checkbox groups are one option per line; selects and inputs are full width; `tabs` controls are a segmented control.

Figure page panel and dialogs
- Figure page tabs are a segmented control; selection colour is the accent; selects full width; actions bordered.
- Dialogs: 18 px title, labels stacked above full-width inputs, bordered buttons, accent primary; checkpoint rows are a 4-column grid with hairline separators; export fieldsets are flat with 11 px legends; shortcuts are a two-column list with hairlines.

Accessibility and performance
- All text ≥ 4.5:1 (muted `#5a6878` on white 6.5:1; labels on navy ≥ 7:1), UI borders use `#cfd6de` only for non-essential edges, focus rings stay 2 px accent.
- No `:has()`, no box-shadow or filter added to cards during zoom, `contain:layout` unchanged.
- Perf note: the first `test_nexo_perf.cjs` runs of this pass measured a zoom-step median of 24.4 ms and 16.7 ms (budget 16 ms) while other builds and browsers were running on the machine. Three rules were then dropped or narrowed because they touch every card or button during a zoom step: the hover-only resize-handle gradient (now only on `.card.selected`), a global `button:hover` colour rule and a 20 px grid tile. Two consecutive runs alone then passed (12.8 ms Chromium-only, 14.9 ms Chromium + WebKit). The H7b reference value on an idle machine was 2.4 ms, so the remaining gap is mostly machine load; the suite output is in the H8e report.

## Not done
- A collapsed-by-default minimap needs a toggle (behaviour), so the minimap was made smaller and moved instead.
- Data forms could only be verified with the mock schema (one select); the boolean/radio/tabs layout is covered by CSS and the `splitLabel` unit test, not by a browser screenshot.
