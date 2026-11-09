# Team → Nexo inventory (independent review, Claude Code, Opus 5.5)

Read-only audit, 2026-11-06, branch `router/20261106-212604-777ce1` (base `c49bd0f7`, nexo/phase1 over the production Team build).
Nothing was run: there is no R on this machine and no browser session was opened. Every verdict comes from reading code.
Each "exists" verdict cites a `file:line`. Each "missing" verdict quotes the grep (over `frontends/nexo/src` and `R/frontends/api`, test files and `mock/` excluded unless stated) that found nothing. Where reading alone could not decide, the row is marked UNSURE and says what to check.
Five read-only sub-agents gathered the area tables. I then re-checked the P1 claims and the older audit's open items myself: range slider, server-side pickers, baseline, caption editing, card status wiring, every "still open" item of the earlier audit, and the visibility-flush and tour greps.

Scope rules applied. Phase 1 is the canvas, plus whatever checkpoint, save and export a user needs for canvas work. Phase 2 is Data and Review preparation, phase 3 is login and accounts. OUT is what the docs place out of scope: Companion AI, the review/foreground flow, the mascot, and phone editing (phones are view-only by design, `docs/integration/nexo-team-gap-audit.md:7-9`). Choices the earlier brief made on purpose (no Expand canvas, no Analysis tools drawer) are marked NOT APPLICABLE, not MISSING.
Impact is on redoing a whole figure in Nexo from a checkpoint that Team has already prepared. P1 blocks it, P2 slows or misleads, P3 is cosmetic. "(present)" means the capability exists, and it would be P1 if it were absent.

Coverage. All requested areas have rows. These parts are thinner: per-module inputs (QC, LSEA, structural, longitudinal, pathway and cellular modules) were judged through the generic schema harvest (`R/frontends/api/schema.R`), not input by input. The per-module "More downloads" links were not walked one by one, and `www/team/js/app.js` (3,419 lines) was read only where other files pointed into it.

## 1. Summary

358 rows (one per user-facing control or capability; a few rows group sibling controls).

| Status | Phase 1 | Phase 2 | Phase 3 | OUT | Total |
|---|---|---|---|---|---|
| SAME | 137 | 1 | 0 | 0 | 138 |
| EQUIVALENT (incl. "EQUIVALENT+": Nexo does more) | 65 | 2 | 0 | 0 | 67 |
| PARTIAL | 34 | 6 | 2 | 1 | 43 |
| MISSING | 31 | 35 | 5 | 9 | 80 |
| NOT APPLICABLE | 9 | 4 | 1 | 3 | 17 |
| UNSURE | 7 | 2 | 0 | 0 | 9 |
| Nexo only (no Team counterpart) | 4 | 0 | 0 | 0 | 4 |
| **Total** | **287** | **50** | **8** | **13** | **358** |

Reading. The phase-1 canvas is close to parity: 202 of 287 rows are SAME or EQUIVALENT, and every phase-1 P1 gap sits in the Data tab's generic form (two-handle range sliders, server-side selectize pickers), plus one UNSURE P1 (the Group comparison baseline select). The earlier audit's only P1, Group comparison controls, is now closed. Phase 2 is almost entirely missing on purpose: Nexo reuses the checkpoint's prepared state, and the API refuses to open a checkpoint whose recomputed lipids or samples differ (`R/frontends/api/session.R:220-236,276-292`). So any change to samples, groups, labels, filters or exclusions still means going back to Team. Phase 3 (login, projects, roles) does not exist in Nexo.

## 2. Full inventory by area

### Top bar, project menu, checkpoints, Data step, account, help, read-only, phone

| Area | Feature | Team evidence | Nexo status | Nexo evidence / grep | Phase | Impact |
|---|---|---|---|---|---|---|
| Top bar | App name "Lipidomic Explorer" | `www/team/js/shell.js:30` | SAME | `frontends/nexo/src/ui/TopBar.tsx:4`; `ui/strings.ts:4` | 1 | P3 |
| Top bar | Project button ("<project> ▾" / "Choose a project ▾" / "Not signed in") | `www/team/js/shell.js:32-36,94-95` | EQUIVALENT: shows "Checkpoints" or the open checkpoint's name and opens the Checkpoints dialog. There are no projects | `ui/TopBar.tsx:5`; `ui/App.tsx:58-59,222` | 1 | P3 |
| Top bar | Rename / new project | Not in Team: `grep -rn "rename\|Rename" www/team/js/shell.js www/team/js/app.js www/team/js/workspace.js R/frontends/team/*.R` found only file.rename. Projects are shared by their owner (`R/frontends/team/project_library.R:296`) | NOT APPLICABLE | `grep -rniI "newProject\|new project\|createProject" frontends/nexo/src R/frontends/api` no match | 3 | — |
| Top bar | Step navigation Data / Review / Canvas (numbers, ✓ when done, locked state) | `R/frontends/team/workspace.R:88-91`; `www/team/js/shell.js:39-84` | PARTIAL: static links. Data and Review both go to `/team/` and leave Nexo; no done, locked or queued state | `ui/TopBar.tsx:6` | 2 | P2 |
| Top bar | Busy/queued state on step buttons | `www/team/js/shell.js:71` | MISSING | `grep -rniI "queued\|aria-busy" frontends/nexo/src/ui/TopBar.tsx` no match | 2 | P3 |
| Top bar | Save pill (Unsaved changes / Saving… / Saved · hh:mm / Save failed · Retrying) | `www/team/js/autosave.js:27,39,60,69`; `R/frontends/team/workspace.R:84` | SAME (same wording) | `state/autosave.ts:13-20`; `ui/TopBar.tsx:7-8` | 1 | (present) |
| Top bar | Retry a failed save | `www/team/js/autosave.js:69` (automatic only) | EQUIVALENT+: automatic retry plus a "Retry now" button | `ui/TopBar.tsx:7`; `ui/App.tsx:222`; `state/autosave.ts:17` | 1 | P3 |
| Top bar | "Records near size limit" warning | `www/team/js/autosave.js:60-61`; `R/frontends/team/project_records.R:10` | SAME (as a chip, not pill text) | `ui/TopBar.tsx:9`; `R/frontends/api/storage.R:136-144`; `ui/App.tsx:54` | 1 | P3 |
| Top bar | "Not saved · Project records too large" hard stop | `www/team/js/autosave.js:66` | PARTIAL: shows the server's generic failure (a 413), not this state | `grep -rn "too large\|records_too_large" frontends/nexo/src R/frontends/api` matched only `export/finalize.ts:3`, `state/validate.ts:217`, `R/frontends/api/plumber.R:13` | 1 | P2 |
| Top bar | "Restoring figure workspace…" / "could not be restored · Autosave paused" | `www/team/js/autosave.js:79,82` | PARTIAL: Nexo opens the checkpoint before the canvas mounts ("Opening checkpoint…", stalled/Try again). It has no restore-failed autosave pause | `frontends/nexo/src/main.tsx:19-22,31` | 1 | P3 |
| Top bar | Sign out | `R/frontends/team/workspace.R:87`; `www/team/js/shell.js:52` | MISSING | `grep -rniI "logout\|sign out\|signout" frontends/nexo/src R/frontends/api` no match | 3 | P3 |
| Top bar | Avatar (initial from email) | `www/team/js/shell.js:54,96-98` | PARTIAL: a neutral icon whose toast says account actions are in Team | `ui/TopBar.tsx:10`; `ui/strings.ts:29` | 3 | P3 |
| Top bar | "Local session" mode | `www/team/js/shell.js:89-92`; `www/team/js/autosave.js:20` | NOT APPLICABLE (Nexo always saves to the API store) | `R/frontends/api/storage.R:11` | OUT | — |
| Project library | Project selector (projects shared with the account) | `R/frontends/team/project_library.R:306` | MISSING: one fixed workspace from `LIPIDOMIC_API_WORKSPACE` | `R/frontends/api/storage.R:11`; `grep -rniI "project_id\|/projects" frontends/nexo/src R/frontends/api` no match | 3 | P2 |
| Project library | Project cards, "Open latest" | `www/team/js/data_shell.js:2,98` | PARTIAL: a grouped checkpoint list, newest first; no project cards, no "Open latest" | `main.tsx:31`; `ui/checkpointList.ts:3-18` | 1 | P3 |
| Checkpoints | Resume a checkpoint | `R/frontends/team/project_library.R:307` | SAME (Open per row; start-page picker) | `ui/Dialogs/CheckpointsDialog.tsx:13,27`; `main.tsx:17-21,31` | 1 | (present) |
| Checkpoints | Save with "New checkpoint name" | `R/frontends/team/project_library.R:308` | SAME (1-80 characters) | `ui/Dialogs/CheckpointsDialog.tsx:18-22`; `ui/App.tsx:60-67` | 1 | (present) |
| Checkpoints | Read-only project role | `R/frontends/team/project_library.R:308`; `www/team/js/autosave.js:93` | PARTIAL: view-only only from a phone or `?mode=view`, never from a role | `state/readonly.ts:5-10`; `grep -rniI "role\|owner" R/frontends/api/storage.R` no role match | 3 | P2 |
| Checkpoints | Delete a checkpoint | Not in Team: `grep -n "delete\|Delete" R/frontends/team/project_library.R www/team/js/data_shell.js` no match | EQUIVALENT+ (Nexo only, with confirm) | `ui/Dialogs/CheckpointsDialog.tsx:29,32`; `R/frontends/api/plumber.R:103` | 1 | — |
| Checkpoints | Autosave rotation | `R/frontends/team/project_library.R:285-287` | EQUIVALENT (keeps 5 autosaves) | `R/frontends/api/storage.R:105-108` | 1 | P3 |
| Checkpoints | Retry an interrupted checkpoint (durable pending queue) | `R/frontends/team/project_library.R:316-321` | MISSING: retry is in memory only | `grep -rn "localStorage\|indexedDB" frontends/nexo/src` no match | 1 | P2 |
| Checkpoints | Download archived checkpoint methods | `R/frontends/team/project_records.R:207-208` | MISSING: records are kept but cannot be downloaded | `grep -rniI "archived" frontends/nexo/src R/frontends/api` matched only `R/frontends/api/session.R:84` | 2 | P3 |
| Session archive | Export Session (session ZIP) | `R/guided_workflow.R:163`; `www/team/js/shell.js:275` | EQUIVALENT: "Download ZIP" saves a named checkpoint and downloads it; also a per-row Download | `ui/App.tsx:180`; `ui/Toolbar.tsx:35`; `ui/Dialogs/CheckpointsDialog.tsx:28`; `R/frontends/api/plumber.R:86` | 1 | (present) |
| Session archive | Resume from a session ZIP (upload) | `R/guided_workflow.R:41-43` | SAME (dialog and start page; 90 MiB cap) | `ui/Dialogs/CheckpointsDialog.tsx:24`; `main.tsx:27-30`; `R/frontends/api/storage.R:112-133` | 1 | (present) |
| Session archive | Download prepared data / methods / labels CSV / companion CSV | `R/guided_workflow.R:156-160` | MISSING | `grep -rniI "sample labels\|companion actions\|prepared data" frontends/nexo/src` no match | 2 | P2 |
| Data step | "Upload a new matrix", Back / Next | `R/frontends/team/workspace.R:95-98`; `www/team/js/workspace.js:260` | MISSING | `grep -rniI "fileInput\|abundance file\|upload.*matrix" frontends/nexo/src R/frontends/api` no match | 2 | P1 for new data; not needed to redo a figure from a checkpoint |
| Data step | Abundance file upload (.csv/.xlsx/.xls) | `R/guided_workflow.R:29` | MISSING | same grep | 2 | P1 (new data) |
| Data step | .txt/.tsv conversion | `www/team/js/upload_formats.js:1-9`; `R/frontends/team/upload_formats.R:189` | MISSING | `grep -rniI "upload_inbox\|\.tsv" frontends/nexo/src R/frontends/api` no match | 2 | P2 |
| Data step | SCIEX import (value column, non-Unknown, internal standards) | `www/team/js/sciex_import.js:6-7,133`; `R/frontends/team/sciex_import.R:306` | MISSING | `grep -rniI "sciex" frontends/nexo/src R/frontends/api` no match | 2 | P2 |
| Data step | Excel sheet picker (one or all sheets) | `www/team/js/sheet_picker.js:6,119`; `R/frontends/team/sheet_picker.R:148` | MISSING | `grep -rniI "xlsx" frontends/nexo/src R/frontends/api` no match | 2 | P2 |
| Data step | Drag-and-drop files | `www/team/js/sheet_picker.js:213` | MISSING | upload grep, no match | 2 | P3 |
| Data step | 90 MB upload limit note | `R/guided_workflow.R:31` | NOT APPLICABLE (only the checkpoint upload cap) | `R/frontends/api/storage.R:121` | 2 | — |
| Data step | Sample metadata import | `R/frontends/team/sample_metadata_import_module.R:6,31,42,67` | MISSING (see the Review table) | `grep -rniI "sample_metadata" frontends/nexo/src R/frontends/api` no match | 2 | P2 |
| Account | Sign in (email/password, field errors, rate limit) | `R/frontends/team/login-validation.R:37-40`; `www/team/js/login_validation.js:1-12`; `R/frontends/team/project_library.R:322-330` | MISSING: the API has no auth | `grep -rniI "login\|signin\|password" frontends/nexo/src R/frontends/api` matched only `assignInNamespace` (`R/frontends/api/session.R:99`) | 3 | P3 for the pilot; blocks a release |
| Account | Activate invitation / reset password with a code | `R/frontends/team/project_library.R:259-266` | MISSING | `grep -rniI "activation\|invite" frontends/nexo/src R/frontends/api` no match | 3 | P3 |
| Account | "Signed in as…" and "Sign out and clear this session" | `R/frontends/team/project_library.R:266` | MISSING | logout grep, no match | 3 | P3 |
| App | New-build "updating" strip with Reload | `www/team/js/stale_reload.js:1-7,24-38` | MISSING: a 503 is retried 60 × 500 ms; no version check | `grep -rniI "version.json\|location.reload" frontends/nexo/src` no match; `frontends/nexo/src/api.ts:32` | 1 | P2 |
| App | Leave-page guard with unsaved changes | `www/team/js/autosave.js:167` | SAME | `ui/App.tsx:174-175` | 1 | (present) |
| App | Save when the tab is hidden | `www/team/js/autosave.js:151` | SAME | `ui/App.tsx:173,176` | 1 | (present) |
| App | Open failure / stalled open: Try again, Choose another | Team restore gate (`R/frontends/team/autosave_restore_gate.R`) | EQUIVALENT | `main.tsx:19,22,31` | 1 | P3 |
| Help | Context "?" help per control and help panel | `www/team/js/context_help.js:304-307,368`; `www/team/js/help_content.js:4-6` | PARTIAL: one static Help dialog | `ui/Dialogs/HelpDialog.tsx:4-14`; `grep -rniI "contextHelp\|help_content" frontends/nexo/src` no match | 1 | P3 |
| Help | Help character (neutrophil/macrophage/plain) | `www/team/js/context_help.js:315-327` | MISSING (mascot out of scope) | `grep -rn "neutrophil\|macrophage" frontends/nexo/src` no match | OUT | P3 |
| Help | Canvas help and shortcuts in "⋯" | `www/team/js/shell.js:247,277` | EQUIVALENT: Help button; "?" opens Keyboard shortcuts | `ui/Toolbar.tsx:44-46`; `ui/App.tsx:49-51`; `ui/Dialogs/ShortcutsDialog.tsx` | 1 | P3 |
| Read-only | View-only mode and banner | `www/team/js/autosave.js:93` (role-based) | PARTIAL: phone or `?mode=view`; dismissible banner; save actions hidden; no role | `state/readonly.ts:1-17`; `ui/App.tsx:31-36,165`; `ui/Toolbar.tsx:31,35` | 1 | P3 |
| Phone | Compact "Step n of N" list | `www/team/js/mobile_steps.js:1-5,20,60-67` | PARTIAL: nav is centred on phones; no step list (phones are view-only by design) | `ui/shell.css:8` | OUT | P3 |
| Phone | Sticky sample column in tables | `www/team/js/mobile_tables.js:1-5` | NOT APPLICABLE (no Data/Review tables) | — | 2 | — |
| Phone | "⋯" overflow for Undo/Redo/Export | `www/team/js/shell.js:250-273` | EQUIVALENT (toolbar overflow) | `ui/toolbarOverflow.ts`; `ui/Toolbar.tsx:17` | 1 | P3 |

Not verified here: whether Nexo's checkpoint store is the same store as Team's project library. Team ZIPs reach Nexo only through `LIPIDOMIC_API_CHECKPOINT_DIR` (`R/frontends/api/storage.R:14-19`); check this on the deployment.

### Canvas: library, adding cards, card frame and menu, status, tabs, toolbar, rail, viewport, keyboard, illustrations, empty/error states

| Area | Feature | Team evidence | Nexo status | Nexo evidence / grep | Phase | Impact |
|---|---|---|---|---|---|---|
| Library | Plot types: Dashboard (5) | `www/team/js/canvas_catalog.js:6-11` | SAME | `R/frontends/api/catalog.R:4-8` | 1 | (present) |
| Library | Plot types: Quality check (14) | `www/team/js/canvas_catalog.js:13-27` | SAME | `R/frontends/api/catalog.R:9-22` | 1 | (present) |
| Library | Plot types: Composition (4), Differential (4), Heatmaps (5) | `www/team/js/canvas_catalog.js:29-46` | SAME | `R/frontends/api/catalog.R:23-35` | 1 | (present) |
| Library | Plot types: Structure (8), Group comparison (1), Distributions & ratios (3) | `www/team/js/canvas_catalog.js:48-64` | SAME | `R/frontends/api/catalog.R:36-47` | 1 | (present) |
| Library | Plot types: Longitudinal (5), Pathways (2), Cellular organisation (3), Cell comparisons (4) | `www/team/js/canvas_catalog.js:66-86` | SAME (58 of 58 module plots) | `R/frontends/api/catalog.R:48-61`; `R/frontends/team/plot_instances.R:4-22` | 1 | (present) |
| Library | "Publication preview" entry (Open export studio) | `www/team/js/canvas_catalog.js:89` | EQUIVALENT: the Export dialog covers it; the "Export studio" group exists but is empty | `frontends/nexo/src/catalog.ts:2`; `ui/Toolbar.tsx:35`; `grep -rn "export_studio-studio_preview_plot" frontends/nexo/src R/frontends/api` no match | 1 | P3 |
| Library | "Other discovered plots" group | `www/team/js/canvas_catalog.js:193,230` | NOT APPLICABLE (no Shiny DOM) | `grep -rni "discovered" frontends/nexo/src R/frontends/api` no match | 1 | — |
| Library | Search plots | `R/frontends/team/canvas.R:28`; `www/team/js/canvas_catalog.js:236-239` | SAME (Team also matches the id) | `ui/Library/Library.tsx:62`; `ui/Library/rows.tsx:18-20` | 1 | (present) |
| Library | Collapsible groups with counts; open state remembered | `www/team/js/canvas_catalog.js:241-243` | SAME | `ui/Library/Library.tsx:19,65-67` | 1 | (present) |
| Library | Row state and tooltip (Ready / Added / Queued / Unavailable + reason, "N on canvas") | `www/team/js/canvas_catalog.js:253-275` | EQUIVALENT ("Added N" is a locate button) | `ui/Library/Library.tsx:69-78`; `ui/Library/rows.tsx:6-17` | 1 | P3 |
| Library | Design-gate reasons (needs design / uncertain / paired / preparation not ready / not all measured) | `www/team/js/canvas_catalog.js:111-118` | PARTIAL: needs-design, needs-time and paired only | `catalog.ts:5-15`; `grep -rni "not all measured\|Prepared samples\|Mixed or uncertain" frontends/nexo/src` no match | 1 | P2 |
| Library | "Study design" button on a gated row | `www/team/js/canvas_catalog.js:114` | EQUIVALENT (inline link opens the design dialog) | `ui/Library/Library.tsx:77,91` | 1 | (present) |
| Library | Post-analysis hints ("No significant lipids", "Run structural analysis", "Generate analysis", "Nothing to place on the grid") | `www/team/js/canvas_catalog.js:119-126,142` | PARTIAL: the action buttons exist in the Data form; no catalog or card hint | `ui/forms/SchemaForm.tsx:36`; `grep -rn "No significant lipids\|Generate analysis\|Nothing to place on the grid" frontends/nexo/src R/frontends/api` no match | 1 | P2 |
| Library | Shared "Plot settings" dock ("These settings change the displayed results") | `R/frontends/team/canvas.R:30-33` | UNSURE: whether the per-card Data tab covers every shared module setting; needs the live API schema per family | `grep -rn "Plot settings" frontends/nexo/src` matched only "Copied plot settings" (`canvas.ts:64`) | 1 | P2 |
| Library | Hide/show library; Esc closes it | `R/frontends/team/canvas.R:37`; `www/team/js/canvas_viewport.js:75` | EQUIVALENT (× and the rail toggle) | `ui/Library/Library.tsx:53`; `ui/Rail.tsx:31` | 1 | (present) |
| Add | Add a plot by clicking + | `www/team/js/canvas_catalog.js:262-267` | SAME | `ui/Library/Library.tsx:39-48,80` | 1 | (present) |
| Add | "+ Add plot" toolbar button | `www/team/js/shell.js:208` | SAME | `ui/Toolbar.tsx:32` | 1 | (present) |
| Add | Queued add with Cancel | `www/team/js/canvas_catalog.js:259` | SAME | `ui/Library/Library.tsx:44,79`; `canvas/queuedAdd.ts` | 1 | (present) |
| Add | Add that needs configuration: open the analysis, add when ready | `www/team/js/canvas_catalog.js:268-270` | NOT APPLICABLE (the API creates the instance directly) | `canvas.ts:349-376` | 1 | — |
| Add | "Generating X…" placeholder | `www/team/js/canvas.js:1672-1680` | EQUIVALENT (an "Adding…" ghost) | `canvas.ts:313-319` | 1 | (present) |
| Add | Failed add: "Could not generate X." with Retry / Remove on the card | `www/team/js/canvas.js:1683-1692` | PARTIAL: the ghost is removed and the error appears in the library; no Retry | `ui/Library/Library.tsx:46,90` | 1 | P3 |
| Add | New card in a free spot and revealed | `www/team/js/canvas.js:1653,1700-1702` | SAME | `canvas.ts:356-357,373`; `place.ts` | 1 | (present) |
| Add | 40-figure limit message | `www/team/js/canvas.js:1712` | SAME | `canvas.ts:172`; `ui/strings.ts:37` | 1 | (present) |
| Card | Title with ellipsis and full title on hover | `www/team/js/canvas.js:1723,3130` | SAME | `cards.ts:148` | 1 | (present) |
| Card | Rename a card (Label) | `www/team/js/canvas.js:1740` | EQUIVALENT (Appearance: Label) | `ui/Inspector/AppearanceTab.tsx:28` | 1 | (present) |
| Card | Card background colour | `www/team/js/canvas.js:1742` | EQUIVALENT (Appearance) | `ui/Inspector/AppearanceTab.tsx:12`; `canvas.ts:117` | 1 | (present) |
| Card footer | Edit | `www/team/js/card_frame.js:76-81` | SAME | `cards.ts:139` | 1 | (present) |
| Card footer | Duplicate | `www/team/js/canvas.js:1732`; `www/team/js/card_frame.js:119` | SAME | `cards.ts:139`; `canvas.ts:63` | 1 | (present) |
| Card footer | ⋯ menu (placement, Esc, focus return) | `www/team/js/card_frame.js:83-104` | SAME | `cards.ts:110-136` | 1 | (present) |
| Card menu | Finish plot / Edit figure (frozen snapshot) | `www/team/js/canvas.js:1734,2130,2149` | SAME | `cards.ts:131,238` | 1 | (present) |
| Card menu | "Live only" (interactive output cannot be frozen) | `www/team/js/canvas.js:1736` | EQUIVALENT+: Nexo captures the network canvas, so it can be finished | `cards.ts:214-215` | 1 | — |
| Card menu | Data & settings | `www/team/js/canvas.js:1731` | SAME | `cards.ts:131` | 1 | (present) |
| Card menu | Copy (plot settings for Paste plot) | `www/team/js/canvas.js:446,1732` | SAME | `cards.ts:131`; `canvas.ts:64` | 1 | (present) |
| Card menu | Controls (open the Classic analysis tool) | `www/team/js/canvas.js:1733` | NOT APPLICABLE (no tool pages) | `grep -rn "guide_open_tool\|openTool" frontends/nexo/src R/frontends/api` no match | 1 | — |
| Card menu | Enlarge plot (dashboard heatmap) | `www/team/js/canvas.js:1730` | SAME | `cards.ts:132`; `canvas.ts:65` | 1 | (present) |
| Card menu | Remove / Return with an Undo toast | `www/team/js/canvas.js:1738`; `www/team/js/canvas_feedback.js:1-8,65` | SAME | `cards.ts:131`; `canvas.ts:164-166` | 1 | (present) |
| Card menu | Move to tab… / Copy to tab… | `www/team/js/canvas_tabs.js:271` | SAME | `cards.ts:131`; `ui/App.tsx:235` | 1 | (present) |
| Card menu | "+ New tab" inside the Move/Copy picker | `www/team/js/canvas_tabs.js:239-245` | MISSING | `ui/App.tsx:235`; `grep -rn "New tab\|newTab" frontends/nexo/src` no match | 1 | P3 |
| Card | Plot data (CSV) on the card | `www/team/js/canvas.js:1752-1760` | EQUIVALENT (in the Export dialog) | `ui/Dialogs/ExportDialog.tsx:103` | 1 | P3 |
| Card | Resize from the corner | `www/team/js/canvas.js:1543` | SAME (240–4000 px) | `canvas.ts:103-104,440-468` | 1 | (present) |
| Card | Move by dragging | `www/team/js/canvas.js:1396` | SAME | `canvas.ts:422-469` | 1 | (present) |
| Card | Overlap settle after drop or resize | `www/team/js/canvas.js:1510` | SAME | `canvas.ts:163`; `canvas/settle.ts` | 1 | (present) |
| Status | Status chip: Up to date / Updating… / Needs settings / Could not update / Finished / Finished · out of date | `www/team/js/card_status.js:13-21` | SAME | `cards.ts:53-56,157-181` | 1 | (present) |
| Status | "Changes pending" / "Needs data" with a Review action | `www/team/js/card_status.js:15-16,50` | PARTIAL: the states and labels exist, but nothing produces the message that sets them | `cards.ts:53,56,165`; `ui/Inspector/Inspector.tsx:25`; `grep -rn "'Changes pending'\|'Needs data'" frontends/nexo/src` found only these consumers | 1 | P2 |
| Status | "Saved image broken" | `www/team/js/card_status.js:19` | MISSING | `grep -rn "finished-broken\|Saved image broken" frontends/nexo/src` no match | 1 | P3 |
| Status | "Restored by Undo… Finish again" / frozen needs review | `www/team/js/canvas.js:2073,2627` | PARTIAL: only the export-changed notice | `cards.ts:140` | 1 | P3 |
| Status | Global wait strip ("Your data are not prepared yet…", "Some figures need a confirmed study design") | `www/team/js/card_status.js:124-131` | MISSING | `grep -rn "not prepared yet\|Some figures need" frontends/nexo/src` no match | 1 | P2 |
| Status | Live announcement "Updating figures… / finished updating" | `www/team/js/card_status.js:155-157` | MISSING | `grep -rn "Updating figures\|Figures finished updating" frontends/nexo/src` no match | 1 | P3 |
| Status | Band status line (notices fade after 6 s) | `www/team/js/canvas_band_status.js:12-35` | EQUIVALENT | `ui/StatusBand.tsx:6` | 1 | (present) |
| Tabs | Add tab (+), up to 20 | `www/team/js/canvas_tabs.js:375`; `www/team/js/canvas_tabs_model.js:18` | SAME | `ui/TabsBar.tsx:37`; `state/tabs.ts:5` | 1 | (present) |
| Tabs | Rename (double-click, F2/Enter, menu; 40 chars) | `www/team/js/canvas_tabs.js:105,126,137,202` | SAME | `ui/TabsBar.tsx:28,33-34,39` | 1 | (present) |
| Tabs | Duplicate tab | `www/team/js/canvas_tabs.js:202` | SAME | `ui/TabsBar.tsx:40-42` | 1 | (present) |
| Tabs | Move tab left/right (menu) | `www/team/js/canvas_tabs.js:203-204` | SAME | `ui/TabsBar.tsx:43-44` | 1 | (present) |
| Tabs | Reorder by dragging | `www/team/js/canvas_tabs.js:100,107,111` | SAME | `ui/TabsBar.tsx:22-31` | 1 | (present) |
| Tabs | Reorder with Ctrl/Alt+Shift+Arrow | `www/team/js/canvas_tabs.js:123` | MISSING | `ui/TabsBar.tsx:35`; `grep -rn "shiftKey.*ArrowLeft\|ArrowLeft.*shiftKey" frontends/nexo/src` no match | 1 | P3 |
| Tabs | Delete tab (move cards elsewhere or remove them) | `www/team/js/canvas_tabs.js:169-187,205` | SAME | `ui/TabsBar.tsx:45-52` | 1 | (present) |
| Tabs | Delete key on a focused tab | `www/team/js/canvas_tabs.js:127` | MISSING | `ui/TabsBar.tsx:33-36` (no Delete handler) | 1 | P3 |
| Tabs | Arrow/Home/End navigation | `www/team/js/canvas_tabs.js:124` | SAME | `ui/TabsBar.tsx:35` | 1 | (present) |
| Tabs | Drop a card onto a tab to move it | `www/team/js/canvas_tabs.js:312-330` | MISSING | `grep -rn "is-drop-target\|dragToTab\|cardToTab" frontends/nexo/src` no match | 1 | P3 |
| Tabs | New cards go to the active tab | `www/team/js/canvas_tabs.js:215` | SAME | `canvas.ts:525` | 1 | (present) |
| Toolbar | Tidy up | `www/team/js/shell.js:209`; `www/team/js/canvas.js:1622` | SAME | `ui/Toolbar.tsx:33`; `canvas.ts:545`; `canvas/tidy.ts` | 1 | (present) |
| Toolbar | Undo / Redo buttons | `www/team/js/shell.js:221-222` | SAME | `ui/Toolbar.tsx:34` | 1 | (present) |
| Toolbar | Draft / Figure page switch | `www/team/js/shell.js:225-231` | SAME | `ui/Toolbar.tsx:38` | 1 | (present) |
| Toolbar | Export figure ▾ (SVG / PDF / Print) | `www/team/js/shell.js:243` | SAME (adds Publication export and "Export selected") | `ui/Toolbar.tsx:35,39` | 1 | (present) |
| Toolbar | ⋯ Paste plot | `www/team/js/shell.js:272`; `www/team/js/canvas.js:3126` | SAME | `ui/Toolbar.tsx:41` | 1 | (present) |
| Toolbar | ⋯ Return all plots (confirm, Undo) | `www/team/js/shell.js:273`; `www/team/js/canvas.js:3171-3220` | EQUIVALENT ("Remove all", confirm, undo) | `ui/Toolbar.tsx:41,47`; `canvas.ts:546,166` | 1 | (present) |
| Toolbar | ⋯ Expand canvas (focus mode) | `www/team/js/shell.js:274`; `www/team/js/canvas_viewport.js:59,86-89` | NOT APPLICABLE (left out of Nexo on purpose, `docs/integration/nexo-team-gap-audit.md:7-8`) | `grep -rni "Expand canvas\|focusMode" frontends/nexo/src` no match | 1 | — |
| Toolbar | ⋯ Save & export… (checkpoint, ZIP) | `www/team/js/shell.js:275`; `www/team/js/canvas_checkpoint.js:26-71` | EQUIVALENT | `ui/Toolbar.tsx:35` | 1 | (present) |
| Toolbar | Canvas help | `www/team/js/canvas_viewport.js:64`; `www/team/js/pointer_mode.js:54` | EQUIVALENT (Help and Keyboard shortcuts, "?") | `ui/Toolbar.tsx:44`; `ui/App.tsx:47-48` | 1 | (present) |
| Toolbar | Analysis tools drawer; tool header (View / Lipids / About / Shortcuts) | `www/team/js/tools_drawer.js:1-12`; `www/team/js/tool_header.js:1-13` | NOT APPLICABLE (no Classic tools, by design) | `grep -rni "analysis tools\|toolsDrawer" frontends/nexo/src` no match | 1 | — |
| Toolbar | Compact overflow into ⋯ | `www/team/js/shell.js:249-270` | SAME | `ui/Toolbar.tsx:22,40`; `ui/toolbarOverflow.ts` | 1 | (present) |
| Toolbar | Align / Distribute selected | none in Team (`grep -n "distribute" www/team/js/canvas.js` no match) | Nexo only | `ui/Toolbar.tsx:43-44`; `canvas/align.ts` | 1 | — |
| Toolbar | Snap guides while dragging | none in Team | Nexo only | `canvas/snap.ts`; `canvas.ts:77-85` | 1 | — |
| Rail | Plots / Illustrations / Text & shapes / Palettes | `www/team/js/shell.js:171-177` | SAME | `ui/Rail.tsx:20,31` | 1 | (present) |
| Rail | "Colors & palettes" intro | `R/frontends/team/canvas.R:19` | EQUIVALENT (Palettes on the rail; needs a selected plot) | `ui/Rail.tsx:15-19` | 1 | P3 |
| Rail | Inspector toggle (button, I key, Hide/Show text, remembered per account) | `www/team/js/inspector_toggle.js:60-78,229-234` | PARTIAL: rail button and I; no text toggle, not remembered | `ui/Rail.tsx:26,33`; `grep -rn "showInspector" frontends/nexo/src` matched only `ui/strings.ts:10` | 1 | P3 |
| Pointer | Select (V) / Hand (H) | `www/team/js/pointer_mode.js:116-120` | SAME | `ui/Rail.tsx:25,32` | 1 | (present) |
| Pointer | Hold Space or middle mouse to pan | `www/team/js/pointer_mode.js:109-114,146` | SAME | `canvas.ts:414,478` | 1 | (present) |
| Viewport | Zoom in/out buttons, +/− keys | `www/team/js/canvas_viewport.js:493,504-505` | SAME | `ui/ZoomPill.tsx:15`; `canvas.ts:498` | 1 | (present) |
| Viewport | Reset to 100% | `www/team/js/canvas_viewport.js:493` | SAME (also Shift+0) | `ui/ZoomPill.tsx:15`; `canvas/editing.ts:9-12` | 1 | (present) |
| Viewport | Fit all (button, Shift+1) | `www/team/js/canvas_viewport.js:496-506,511` | SAME | `ui/ZoomPill.tsx:15`; `canvas.ts:278,499` | 1 | (present) |
| Viewport | Pinch/trackpad zoom | `www/team/js/canvas_viewport.js:545` | EQUIVALENT (Ctrl/⌘+wheel, two-pointer pinch) | `canvas.ts:401-406,413` | 1 | (present) |
| Viewport | Click a card to glide-fit it; click empty space to restore | `www/team/js/canvas_viewport.js:478-492` | MISSING | `grep -rn "priorView\|restoreView" frontends/nexo/src` no match | 1 | P3 |
| Viewport | Minimap: click / drag to navigate | `www/team/js/canvas_viewport.js:538-539` | PARTIAL: click only | `canvas.ts:474` | 1 | P3 |
| Viewport | Minimap arrow-key pan, collapse, movable zoom controls (remembered) | `www/team/js/canvas_viewport.js:19-25,55,541` | MISSING | `canvas.ts:41`; `grep -rni "Move minimap\|Drag to move" frontends/nexo/src` no match; `grep -n -i drag frontends/nexo/src/ui/ZoomPill.tsx` no match | 1 | P3 |
| Selection | Select one card by clicking | `www/team/js/canvas.js:66` | SAME | `canvas.ts:422-429` | 1 | (present) |
| Selection | Multi-select (Shift-click, marquee) | none in Team | Nexo only | `canvas.ts:429,457` | 1 | — |
| Keyboard | Arrow nudge, Shift+Arrow resize, Alt for a fine step | `www/team/js/canvas.js:1422-1426` | SAME | `canvas/editing.ts:13-17`; `canvas.ts:492-497` | 1 | (present) |
| Keyboard | Ctrl/⌘+C and Ctrl/⌘+V for plots | `www/team/js/canvas.js:3127` | SAME | `canvas.ts:486-490` | 1 | (present) |
| Keyboard | Undo/redo (Team: geometry and tabs only) | `www/team/js/canvas.js:3146-3152` | EQUIVALENT+ (history also covers add/remove) | `canvas.ts:484`; `state/history.ts` | 1 | (present) |
| Keyboard | Delete removes the selection; Ctrl/⌘+D duplicates | none in Team | Nexo only | `ui/App.tsx:111-112` | 1 | — |
| Keyboard | Esc closes the card menu / deselects | `www/team/js/card_frame.js:96-100` | SAME | `canvas.ts:478-483` | 1 | (present) |
| Illustrations | Library tab, search, categories | `www/team/js/illustration_library.js:13-22` | SAME | `ui/Library/Library.tsx:54-62,86-87` | 1 | (present) |
| Illustrations | Asset set (19 assets, 5 hidden composites) | `www/team/js/illustrations.js:17-37` | SAME | `illustrations/assets.ts:65-83,147` | 1 | (present) |
| Illustrations | Add (click; Nexo also drag, but the drop point is ignored) | `www/team/js/illustration_library.js:22` | EQUIVALENT | `ui/Library/Library.tsx:87`; `canvas.ts:150-151,523` | 1 | P3 |
| Illustrations | Label and accent colour | `www/team/js/canvas.js:1880-1886` | SAME | `ui/Inspector/AppearanceTab.tsx:13,28` | 1 | (present) |
| Illustrations | Finish/Edit; SVG/PNG download | `www/team/js/canvas.js:1888-1902` | EQUIVALENT (always a snapshot; Export tab with PNG/SVG) | `canvas.ts:513-517`; `ui/Inspector/ExportTab.tsx`; `illustrations/download.test.ts` | 1 | (present) |
| Empty state | "Your figure starts here. Add a plot from the library." | `R/frontends/team/canvas.R:39` | SAME (with an Add plot button) | `ui/App.tsx:37-40`; `ui/strings.ts:49` | 1 | (present) |
| Error state | Retry saved workspace (restore failed) | `www/team/js/canvas.js:3110` | EQUIVALENT (Try again / Choose checkpoint) | `main.tsx:19,22,31` | 1 | P3 |
| Read-only/phone | Editing on phones (phone-only menu items) | `www/team/js/shell.js:256-262` | NOT APPLICABLE: phones are view-only by design (`docs/integration/nexo-team-gap-audit.md:8`) | `state/readonly.ts:4-9`; `ui/App.tsx:31-35` | 1 | — |

### Inspector (Data / Appearance / Statistics / Export), plot editor, statistics, group comparison, finish

| Area | Feature | Team evidence | Nexo status | Nexo evidence / grep | Phase | Impact |
|---|---|---|---|---|---|---|
| Inspector | Tabs Data / Appearance / Statistics / Export | `www/team/js/canvas_inspector.js:26` | SAME | `frontends/nexo/src/ui/Inspector/Inspector.tsx:28,39` | 1 | (present) |
| Inspector | Tabs offered by card kind (finished plot: Export; illustration: Appearance) | `www/team/js/canvas_inspector.js:121` | EQUIVALENT (illustrations also get Export) | `ui/Inspector/Inspector.tsx:28` | 1 | P3 |
| Inspector | "Finished figure. Choose Edit to make changes." with Edit figure | `www/team/js/canvas_inspector.js:15-16,198` | SAME | `ui/Inspector/Inspector.tsx:40` | 1 | (present) |
| Inspector | Properties toggle | `www/team/js/canvas_inspector.js:44-45,197` | EQUIVALENT (opens on selection; rail button) | `ui/App.tsx:87,153`; `ui/Inspector/Inspector.tsx:36` | 1 | P3 |
| Inspector | Close with × or Esc | `www/team/js/canvas_inspector.js:12,197,200-202` | SAME | `ui/Inspector/Inspector.tsx:36`; `ui/App.tsx:97` | 1 | P3 |
| Inspector | Arrow/Home/End between tabs | `www/team/js/canvas_inspector.js:33-41` | MISSING | `ui/Inspector/Inspector.tsx:39` (onClick only); `rg -n "ArrowRight" frontends/nexo/src/ui/Inspector` no match | 1 | P3 |
| Inspector | Group comparison card opens on its report | `www/team/js/canvas_inspector.js:81-88` | EQUIVALENT (opens on Statistics) | `ui/Inspector/Inspector.tsx:33-34` | 1 | P3 |
| Inspector | Card status line | `www/team/js/canvas_inspector_export.js:57-66` | EQUIVALENT | `ui/Inspector/Inspector.tsx:22-37` | 1 | (present) |
| Data tab | Data & settings | `www/team/js/canvas_inspector.js:64-67` | EQUIVALENT (the Data tab is the settings form) | `cards.ts:131`; `ui/Inspector/DataTab.tsx:26` | 1 | (present) |
| Data tab | "This figure has no data controls." | `www/team/js/canvas_inspector.js:73-76` | SAME | `ui/Inspector/DataTab.tsx:25` | 1 | P3 |
| Data tab | Per-plot module controls (select, radio, checkbox, number, text, colour, action) | `www/team/js/canvas_inspector.js:63-71` (moves the module's own controls) | EQUIVALENT: the server parses Team's UI markup into a schema and a generic form renders it | `R/frontends/api/schema.R:2-79,103-139`; `ui/forms/SchemaForm.tsx:34-55` | 1 | (present) |
| Data tab | Controls shown or hidden by `conditionalPanel` (45 uses) | `R/frontends/team/modules-ui.R` (`grep -c conditionalPanel` = 45) | PARTIAL: every control is always shown, including ones that do not apply | `rg -n "displayIf\|conditionalPanel" frontends/nexo/src/ui R/frontends/api/schema.R` no match | 1 | P2 |
| Data tab | Controls limited to the card's output (layout tabs) | `R/frontends/team/plot_instances.R:383-412` | UNSURE: the API returns `tabs` but the client never reads them. Check a multi-output family (QC) on the live API | `R/frontends/api/schema.R:137-138`; `rg -n "tabs" frontends/nexo/src/ui/Inspector` no match | 1 | P2 |
| Data tab | Two-handle range sliders (Log-ratio "Chain Length Range", "Double Bond Range") | `R/frontends/team/modules-ui.R:1519-1526` (`logratio_ui`, from `:1462`) | PARTIAL, broken: the server expects two numbers, but the client renders one `<input type=range>` and sends `Number(raw)`, so a change is rejected ("2 finite number(s) expected") | `ui/forms/SchemaForm.tsx:53`; `ui/forms/schemaForm.ts:8`; `R/frontends/api/schema.R:160-165` | 1 | P1 for log-ratio figures that use the granular combos |
| Data tab | Server-side selectize pickers: heatmap violin lipid/class, sn-chain filter | `R/modules/4_heatmap_module.R:371-383` (`server = TRUE`) | PARTIAL: only `violin_lipid` has its options filled in, so these pickers come with no choices | `R/frontends/api/schema.R:126-131`; `rg -n "heatmap_violin_lipids_select\|select_sn_chains" frontends/nexo/src R/frontends/api` no match | 1 | P1 for the heatmap violin/sn-chain view |
| Data tab | File input on a card (Pathway "Upload Layout JSON") | `R/frontends/team/modules-ui.R:2301` | MISSING: file inputs are excluded | `R/frontends/team/plot_instances.R:139`; `R/frontends/api/schema.R:188`; `rg -n "Layout JSON" frontends/nexo/src R/frontends/api` no match | 1 | P2 |
| Data tab | Help text on labels | `R/frontends/team/modules-ui.R:1488,1542` | EQUIVALENT (title plus muted help) | `ui/forms/schemaForm.ts:18-25` | 1 | P3 |
| PCA | Colour samples by / abundance scale / scaling / most-variable count | `R/results_dashboard.R:235-238` | EQUIVALENT (generic select/number) | `R/frontends/api/schema.R:23,55-56`; `ui/forms/SchemaForm.tsx:40,53` | 1 | (present) |
| Violin | Choose a lipid (searchable) | `R/results_dashboard.R:247-248,520` | PARTIAL: options are filled but shown in a plain `<select>` with no search | `R/frontends/api/schema.R:128-131`; `ui/forms/SchemaForm.tsx:40` | 1 | P2 |
| Violin | Violin tail extent (4 bandwidths) | `www/team/js/violin_display.js:1-12` | MISSING | `rg -n "violin_display\|spanmode" frontends/nexo/src R/frontends/api` matched only `groupComparison/model.ts:101` (GC) | 1 | P3 |
| Heatmap | Show all lipids / significant only | `R/results_dashboard.R:279` | EQUIVALENT (generic radio) | `ui/forms/SchemaForm.tsx:37-39` | 1 | (present) |
| Heatmap | "Significant only" disabled, with the reason, when inference is not allowed | `www/team/js/dashboard_significance.js:7-12` | MISSING on the client (guarded only by the server) | `rg -n "rdSignificance\|data-allowed" frontends/nexo/src` no match | 1 | P2 |
| Heatmap/Composition | Group / lipid / class selection (All, None, Most variable) | `R/results_dashboard.R:620-633`; `www/team/js/dashboard_selection.js:59` | EQUIVALENT (checklist with all/default/none and a count) | `ui/forms/SchemaForm.tsx:41-50`; `R/frontends/api/schema.R:59-77` | 1 | (present) |
| Heatmap | Lipid search box in the selection | `R/results_dashboard.R:628`; `www/team/js/dashboard_selection.js:63-69` | MISSING | `rg -n "search" frontends/nexo/src/ui/forms` no match | 1 | P2 |
| Heatmap | Toggle a whole lipid class (n/m count, mixed state) | `R/results_dashboard.R:625-627`; `www/team/js/dashboard_selection.js:50-56` | MISSING | `rg -n "data-classes\|mixed" frontends/nexo/src/ui/forms R/frontends/api/schema.R` no match | 1 | P2 |
| Heatmap/Composition | Colour swatches beside choices | `R/results_dashboard.R:631` | MISSING | `ui/forms/SchemaForm.tsx:49` (checkbox and label only) | 1 | P3 |
| Heatmap | Z-score colours low/mid/high | `R/frontends/team/modules-ui.R:62-64` | EQUIVALENT (`color` type) | `R/frontends/api/schema.R:25`; `ui/forms/SchemaForm.tsx:53` | 1 | (present) |
| Volcano | Label size, point size and other inputs | `R/frontends/team/modules-ui.R:471-590` | EQUIVALENT (generic) | `R/frontends/api/schema.R:11-57` | 1 | (present) |
| Network | Layout, spring distance, node colour map | `R/frontends/team/modules-ui.R:903,2266,2307` | EQUIVALENT (generic; drawn with vis-network) | `network/vis.ts:7-14` | 1 | (present) |
| Network | Correlation network refuses to draw when inference is not allowed | `R/frontends/team/inferential_network_adapter.R:1-8` | EQUIVALENT (same Team server in the API session) | `R/frontends/api/session.R:260-264` | 1 | (present) |
| Cell plots | Metadata grouping / reference / comparison / class / feature / profile scale | `R/frontends/team/plot_instances.R:22-29` | EQUIVALENT (generic) | `R/frontends/api/schema.R:96-101` | 1 | (present) |
| Appearance | Plot editor Undo / Redo | `www/team/js/plot_editor.js:328` | SAME | `ui/PlotEditor/Toolbar.tsx:5` | 1 | (present) |
| Appearance | Publication style | `www/team/js/plot_editor.js:328` | SAME | `ui/PlotEditor/Toolbar.tsx:6` | 1 | (present) |
| Appearance | Reset presentation (confirm) | `www/team/js/plot_editor.js:328` | SAME | `ui/PlotEditor/Toolbar.tsx:6-7` | 1 | P3 |
| Appearance | Change orientation | `www/team/js/plot_editor.js:328` | SAME | `ui/PlotEditor/Toolbar.tsx:6`; `editor/editorState.ts:86` | 1 | (present) |
| Appearance | Colour palette with swatches | `www/team/js/plot_editor.js:163,334` | EQUIVALENT (applies on click) | `ui/PlotEditor/PaletteSection.tsx:15` | 1 | (present) |
| Appearance | Healthy in grey; "continuous scale" note | `www/team/js/plot_editor.js:334` | SAME | `ui/PlotEditor/PaletteSection.tsx:15` | 1 | (present) |
| Appearance | Per-condition colours | `www/team/js/palette_editor.js:12` | EQUIVALENT ("Condition colours" for each plot) | `ui/PlotEditor/PaletteSection.tsx:15`; `editor/conditionColors.ts` | 1 | (present) |
| Appearance | Title and fonts | `www/team/js/plot_editor.js:64-72,335` | SAME | `ui/PlotEditor/TitleFonts.tsx:4`; `editor/editorState.ts:8-18` | 1 | (present) |
| Appearance | Chart background | `www/team/js/plot_editor.js:336` | SAME | `ui/PlotEditor/Background.tsx:3` | 1 | P3 |
| Appearance | Axes (title, ticks, line, colours, widths) | `www/team/js/plot_editor.js:337` | SAME | `ui/PlotEditor/AxisSection.tsx:9` | 1 | (present) |
| Appearance | Grid and zero lines | `www/team/js/plot_editor.js:338` | SAME | `ui/PlotEditor/PlotEditor.tsx:22` | 1 | P3 |
| Appearance | Legend fields, 3×3 position grid | `www/team/js/plot_editor.js:339-340` | SAME | `ui/PlotEditor/Legend.tsx:4` | 1 | (present) |
| Appearance | Show/hide condition chips | `www/team/js/plot_editor.js:341-343` | SAME | `ui/PlotEditor/Conditions.tsx:3-7` | 1 | (present) |
| Appearance | Series: show, label, colours, widths, size, opacity | `www/team/js/plot_editor.js:345-372` | SAME | `ui/PlotEditor/Series.tsx:5-12` | 1 | (present) |
| Appearance | Composition series act as the class selection (renormalized) | `www/team/js/plot_editor.js:345` | UNSURE: `Series.tsx` has no selection-owner path; check in a browser whether hiding a composition series renormalizes | `ui/PlotEditor/Series.tsx:5-9` | 1 | P2 |
| Appearance | Violin points / inner box | `www/team/js/plot_editor.js:370` | SAME | `ui/PlotEditor/Series.tsx:10` | 1 | (present) |
| Appearance | Heatmap scale low/mid/high | `www/team/js/plot_editor.js:353-367` | SAME | `ui/PlotEditor/HeatScale.tsx:4-8` | 1 | (present) |
| Appearance | Text annotations (up to 30) | `www/team/js/plot_editor.js:372-373` | SAME | `ui/PlotEditor/Annotations.tsx:3` | 1 | (present) |
| Appearance | Double-click a title, axis title, legend entry or tick on the plot to edit it | `www/team/js/plot_editor.js:297-317` | PARTIAL: the same edits are fields; nothing is editable on the plot itself | `ui/PlotEditor/AxisSection.tsx:10`; `rg -n "dblclick\|legendtext" frontends/nexo/src` matched only `ui/TabsBar.tsx:33` and `figure/page.ts:9` | 1 | P3 |
| Global colours | "Colors & palettes" dialog (global group colour map, 12 swatches, Apply) | `R/results_dashboard.R:233-234`; `www/team/js/palette_swatches.js:1-12`; `www/team/js/palette_editor.js:1-12` | PARTIAL: Rail "Palettes" opens the per-plot palette; there is no global map, so colours are set one plot at a time | `ui/Rail.tsx:15-18`; `rg -n "open_palette_editor\|paletteEditor" frontends/nexo/src R/frontends/api` no match | 1 | P2 |
| Statistics | Status line and Retry check | `www/team/js/canvas_statistics.js:16-21,402-403` | SAME | `ui/Inspector/StatisticsTab.tsx:64-65`; `statistics/settings.ts:29-36` | 1 | (present) |
| Statistics | Eligibility explanation (PCA "exploratory, no test") | `www/team/js/canvas_inspector.js:90-93` | PARTIAL: generic text only | `ui/Inspector/StatisticsTab.tsx:32,61`; `rg -n "exploratory ordination" frontends/nexo/src` no match | 1 | P3 |
| Statistics | Test (Welch / Wilcoxon) | `www/team/js/canvas_statistics.js:8,406` | SAME | `ui/Inspector/StatisticsTab.tsx:68` | 1 | (present) |
| Statistics | Correction (Holm / BH / Bonferroni / None) | `www/team/js/canvas_statistics.js:9,407` | SAME | `ui/Inspector/StatisticsTab.tsx:69` | 1 | (present) |
| Statistics | Correction family | `www/team/js/canvas_statistics.js:10,408` | SAME | `ui/Inspector/StatisticsTab.tsx:70` | 1 | (present) |
| Statistics | Comparisons (B vs A) | `www/team/js/canvas_statistics.js:409,538-546` | SAME | `ui/Inspector/StatisticsTab.tsx:71` | 1 | (present) |
| Statistics | Effect size | `www/team/js/canvas_statistics.js:11-12,410` | SAME | `ui/Inspector/StatisticsTab.tsx:72` | 1 | (present) |
| Statistics | Family-size note "N comparisons × M lipids = m tests" | `www/team/js/canvas_statistics.js:549` | MISSING | `rg -n "Tests in family" frontends/nexo/src --glob '!*.test.ts'` no match | 1 | P2 |
| Statistics | Review-and-confirm dialog with diff and caveats | `www/team/js/canvas_statistics.js:414,484-516` | EQUIVALENT (the diff has no "Tests in family (m)" row) | `ui/Inspector/StatisticsTab.tsx:73-83`; `ui/Inspector/StatsDiff.tsx:2-3` | 1 | (present) |
| Statistics | Blocking reasons (no comparison, family too large, ≤45 comparisons…) | `www/team/js/canvas_statistics.js:508-513,540` | PARTIAL: the button is disabled with only the policy reason; the 45 cap is applied silently | `ui/Inspector/StatisticsTab.tsx:14,66,73`; `statistics/settings.ts:54`; `rg -n "Select at most\|Select at least one comparison" frontends/nexo/src` no match | 1 | P2 |
| Statistics | Discard changes | `www/team/js/canvas_statistics.js:415` | SAME | `ui/Inspector/StatisticsTab.tsx:74` | 1 | P3 |
| Statistics | Show annotations; adjusted/unadjusted p; label stars/exact/both | `www/team/js/canvas_statistics.js:421-423` | SAME | `ui/Inspector/StatisticsTab.tsx:86-88` | 1 | (present) |
| Statistics | Group size labels (samples / participants / both / hidden) | `www/team/js/canvas_statistics.js:424` | SAME | `ui/Inspector/StatisticsTab.tsx:89`; `statistics/annotations.ts:63-64` | 1 | (present) |
| Statistics | Participant options disabled without participant IDs | `www/team/js/canvas_statistics.js:556` | MISSING | `rg -n "disabled=.*participant" frontends/nexo/src` no match | 1 | P2 |
| Statistics | Font size, bracket spacing, tip length | `www/team/js/canvas_statistics.js:426-428` | EQUIVALENT (number fields with the same limits) | `ui/Inspector/StatisticsTab.tsx:90` | 1 | P3 |
| Statistics | Brackets and labels drawn on the violin | `www/team/js/canvas_statistics.js:218-224` | SAME | `statistics/annotations.ts:23-64,93` | 1 | (present) |
| Statistics | Choose which comparisons are drawn | `www/team/js/canvas_statistics.js:562-567` | SAME | `ui/Inspector/StatisticsTab.tsx:91` | 1 | (present) |
| Statistics | Results table (n, excluded, p, adjusted p, effect) | `www/team/js/canvas_statistics.js:577` | PARTIAL: no Excluded column (adds Significance and Note) | `ui/Inspector/StatisticsTab.tsx:94` | 1 | P3 |
| Statistics | Methods note | `www/team/js/canvas_statistics.js:587` | SAME | `ui/Inspector/StatisticsTab.tsx:95`; `statistics/result.ts:45-49` | 1 | (present) |
| Statistics | Statistics CSV | `www/team/js/canvas_statistics.js:435,593-602` | SAME | `ui/Inspector/StatisticsTab.tsx:96`; `statistics/csv.ts:7-11` | 1 | (present) |
| Statistics | Results invalidated after data change, then re-verified | `www/team/js/canvas_statistics.js:21,651` | SAME | `ui/Inspector/StatisticsTab.tsx:40-44` | 1 | (present) |
| Group comparison | Test, comparison strategy, scale, significance format | `www/team/js/group_comparison.js:128-132`; `R/frontends/team/modules-ui.R:1488,1533,1542,1552` | EQUIVALENT (Data tab, with a "Change analysis settings in Data" link) | `ui/Inspector/GroupComparisonSection.tsx:20` | 1 | (present) |
| Group comparison | Reference baseline select | `www/team/js/group_comparison.js:131`; `R/modules/10_fla_module.R:463-466` (built server-side in renderUI) | UNSURE: only reachable through the rendered-output harvest; check on the live API that it appears | `R/frontends/api/schema.R:107-122`; `rg -n "selectedBaseline" frontends/nexo/src R/frontends/api` no match | 1 | P1 if absent |
| Group comparison | Reference-group confirmation | `R/frontends/team/group_comparison.R:77,97-104` | SAME | `cards.ts:44,369,407`; `ui/Inspector/GroupComparisonSection.tsx:23` | 1 | (present) |
| Group comparison | Lipid classes All / None / per-class chips | `www/team/js/group_comparison.js:138` | SAME | `ui/Inspector/GroupComparisonSection.tsx:31-34` | 1 | (present) |
| Group comparison | Classes grouped by family | `www/team/js/group_comparison.js:138` | PARTIAL: a flat chip list (families are parsed) | `groupComparison/model.ts:41`; `ui/Inspector/GroupComparisonSection.tsx:33` | 1 | P3 |
| Group comparison | Condition chips; per-panel visibility, points, inner box | `www/team/js/group_comparison.js:139-143` | SAME | `ui/Inspector/GroupComparisonSection.tsx:35,40-43` | 1 | (present) |
| Group comparison | Condition colours and Reset colours | `www/team/js/group_comparison.js:141-143` | EQUIVALENT | `ui/Inspector/GroupComparisonSection.tsx:36-38` | 1 | (present) |
| Group comparison | Full statistical report | `www/team/js/group_comparison.js:134` | SAME | `ui/Inspector/GroupComparisonSection.tsx:49` | 1 | (present) |
| Group comparison | Data CSV | `www/team/js/group_comparison.js:146` | SAME | `ui/Inspector/GroupComparisonSection.tsx:27,48` | 1 | (present) |
| Finish | Finish / Edit | `www/team/js/canvas.js:1734`; `www/team/js/canvas_inspector.js:198` | SAME | `canvas.ts:557-562`; `cards.ts:131,238` | 1 | (present) |
| Finish | Finished · out of date | `www/team/js/card_status.js:18` | SAME | `export/finalize.ts:20-24` | 1 | (present) |
| Finish | Finish guards (statistics busy, too small, zoom, too large, GC unconfirmed) | Team canvas finish path | SAME | `export/finalize.ts:2-17`; `cards.ts:187,193,224-225` | 1 | (present) |
| Adapters | Heatmap log2 violin, FLA palette names, "Not tested" labels, QC 3D labels | `R/frontends/team/heatmap_scale_adapter.R:1-8`; `R/frontends/team/descriptive_inference_labels_adapter.R:4-7` | EQUIVALENT (the API session runs Team's canvas and plot-instance servers) | `R/frontends/api/session.R:260-264` | 1 | (present) |

Per-card export (PNG/SVG/PDF/JPG, Group comparison image chips) is counted once, in the Figure page and export table.

### Figure page, Export Studio and every export path

| Area | Feature | Team evidence | Nexo status | Nexo evidence / grep | Phase | Impact |
|---|---|---|---|---|---|---|
| Figure page | Tabs Object / Plots / Page | `www/team/js/figure_column.js:79` | SAME | `frontends/nexo/src/ui/FigurePage/FigurePage.tsx:34` | 1 | P3 |
| Figure page | Layout (Free / one per page / canvas arrangement / Figure 1) | `R/frontends/team/canvas.R:56`; `www/team/js/canvas_preview.js:220` | SAME | `FigurePage.tsx:35`; `figure/layout.ts:6-19` | 1 | P3 |
| Figure page | Paper (US Letter / A4 / Custom) | `R/frontends/team/canvas.R:57-58` | SAME | `FigurePage.tsx:35`; `figure/layout.ts:3` | 1 | P3 |
| Figure page | Custom width/height (pt) | `R/frontends/team/canvas.R:59-60` | PARTIAL: the fields are labelled with raw keys ("paperWidth"/"paperHeight") and no unit | `FigurePage.tsx:35` | 1 | P3 |
| Figure page | Orientation (disabled for Custom) | `R/frontends/team/canvas.R:62-63` | SAME | `FigurePage.tsx:35` | 1 | P3 |
| Figure page | Page header and footer | `R/frontends/team/canvas.R:61`; `www/team/js/figure_toolbar.js:99` | SAME ("Page furniture") | `FigurePage.tsx:35`; `figure/exportPage.ts:12,22` | 1 | P3 |
| Figure page | Page guides | `www/team/js/figure_toolbar.js:100` | SAME | `FigurePage.tsx:35`; `figure/page.ts:13` | 1 | P3 |
| Figure page | Page setup in ⋯ | `www/team/js/figure_toolbar.js:94-98` | EQUIVALENT (the Page tab is always shown) | `FigurePage.tsx:34-35` | 1 | P3 |
| Figure page | Add text | `www/team/js/figure_toolbar.js:57` | SAME | `FigurePage.tsx:31,34` | 1 | P3 |
| Figure page | Add shape (rectangle, rounded, ellipse, line, arrow) | `www/team/js/figure_toolbar.js:58-61` | SAME | `FigurePage.tsx:31,34` | 1 | P3 |
| Figure page | Publication layout (auto-arrange, with confirm) | `www/team/js/figure_toolbar.js:62`; `www/team/js/canvas_preview.js:622-707` | MISSING | `grep -rnE "stephania\|[Pp]ublication layout\|publicationStyle" frontends/nexo/src R/frontends/api` no match | 1 | P2 |
| Figure page | Include or exclude a plot | `www/team/js/canvas_preview.js:86-87` | SAME | `FigurePage.tsx:35` | 1 | (present) |
| Figure page | Plot rows grouped by tab; select all in a tab | `www/team/js/canvas_preview.js:84-85` | SAME | `FigurePage.tsx:35`; `figure/plotList.ts:4-6` | 1 | P3 |
| Figure page | Plot order ↑/↓ (page order, panel letters) | `www/team/js/canvas_preview.js:90-92,98` | SAME | `FigurePage.tsx:35` | 1 | P2 |
| Figure page | Reset order (tab order) | `www/team/js/canvas_preview.js:97` | SAME | `FigurePage.tsx:35`; `figure/plotList.ts:12`; `state/tabs.ts:158` | 1 | P3 |
| Figure page | Row badges: not finished / needs review / not ready | `www/team/js/canvas_preview.js:89` | PARTIAL: only "not finished" | `FigurePage.tsx:35`; `grep -rnE "needs review\|not ready" frontends/nexo/src/ui/FigurePage frontends/nexo/src/figure` no match | 1 | P2 |
| Figure page | Finish in Draft | `www/team/js/figure_column.js:101` | EQUIVALENT (a Finish button per row) | `FigurePage.tsx:35` (`handle.finishCard`) | 1 | P3 |
| Figure page | Uncheck unfinished | `www/team/js/figure_column.js:70-72,102` | MISSING | `grep -rnE "Uncheck unfinished\|uncheckUnfinished" frontends/nexo/src R/frontends/api` no match | 1 | P3 |
| Figure page | "Only finished plots…" hint, excluded-plots chip | `www/team/js/figure_toolbar.js:108-111` | PARTIAL: a finished-of-total count in the Plots tab | `FigurePage.tsx:35` (`p.finishedOf`) | 1 | P3 |
| Figure page | Export blocked while plots are unfinished, with the reason | `www/team/js/canvas_preview.js:419`; `www/team/js/figure_toolbar.js:90` | PARTIAL: no readiness gate, so a page can export with PENDING placeholders | `FigurePage.tsx:35` (no `disabled`); `figure/exportPage.ts:19` | 1 | P2 |
| Figure page | Object X / Y / W / H (pt) | `www/team/js/canvas_preview.js:329-331` | SAME | `FigurePage.tsx:35` | 1 | P3 |
| Figure page | Lock proportions | `www/team/js/canvas_preview.js:327` | SAME | `FigurePage.tsx:35`; `figure/model.ts:34` | 1 | P3 |
| Figure page | Edit a panel's caption (panel letter / caption) | `www/team/js/canvas_preview.js:291,329-332` | MISSING: the caption is stored (it defaults to the card label) and drawn, but nothing edits it. Workaround: a text object | `figure/model.ts:18`; `figure/exportPage.ts:18`; `grep -rni caption frontends/nexo/src/ui` no match | 1 | P2 |
| Figure page | Default "01 / label" caption in templates | `www/team/js/canvas_preview.js:403,574` | PARTIAL: label only, no index | `figure/exportPage.ts:18` | 1 | P3 |
| Figure page | Layer (z) number | `www/team/js/canvas_preview.js:329,331` | PARTIAL: Bring forward / Send backward only | `FigurePage.tsx:35`; `figure/model.ts:40` | 1 | P3 |
| Figure page | Bring forward / Send backward | `www/team/js/canvas_preview.js:340-341` | SAME | `FigurePage.tsx:35` | 1 | P3 |
| Figure page | Duplicate an object | `www/team/js/canvas_preview.js:342` | SAME | `FigurePage.tsx:30,35`; `figure/model.ts:48` | 1 | P3 |
| Figure page | Remove an object (button, Delete) | `www/team/js/canvas_preview.js:343-344` | SAME | `FigurePage.tsx:32,35` | 1 | P3 |
| Figure page | Text: content, size 6-72 pt, colour | `www/team/js/canvas_preview.js:295-297,329` | SAME | `FigurePage.tsx:35` | 1 | P3 |
| Figure page | Shape: fill, border, no colour, border width, corner radius | `www/team/js/canvas_preview.js:329,335-338` | PARTIAL: no corner-radius field (fixed at 12 for rounded) | `FigurePage.tsx:31,35` | 1 | P3 |
| Figure page | Layers list | `www/team/js/canvas_preview.js:347-349` | MISSING | `grep -rnE "[Ll]ayers" frontends/nexo/src` matched only unrelated `ui/PlotEditor/Series.tsx` | 1 | P2 |
| Figure page | Arrow-key nudge (Shift = 10) | `www/team/js/canvas_preview.js:396` | MISSING | `grep -rnE "ArrowLeft\|ArrowRight\|keydown" frontends/nexo/src/figure frontends/nexo/src/ui/FigurePage` found only the Delete handler at `FigurePage.tsx:32` | 1 | P3 |
| Figure page | Snap to margins and edges | `www/team/js/canvas_preview.js:710` | MISSING (snap is in Draft only) | `grep -rnE "snap" frontends/nexo/src/figure frontends/nexo/src/ui/FigurePage` no match | 1 | P3 |
| Figure page | Drag and resize objects | `www/team/js/canvas_preview.js:396` | SAME | `figure/page.ts:16` | 1 | (present) |
| Figure page | Undo / redo | `www/team/js/figure_toolbar.js:69-77`; `www/team/js/canvas_preview.js:282-285` | EQUIVALENT (global undo; `setDocument` is a command) | `ui/Toolbar.tsx:34`; `figure/model.test.ts:8` | 1 | P3 |
| Figure page | Page zoom −/100%/+, Fit page, Fit width | `www/team/js/canvas_preview.js:21-27` | PARTIAL: canvas zoom pill and auto-fit; no Fit width | `ui/ZoomPill.tsx:15`; `FigurePage.tsx:22` | 1 | P3 |
| Figure page | Expand canvas | `www/team/js/figure_toolbar.js:101` | NOT APPLICABLE (left out of Nexo on purpose: `docs/integration/nexo-team-gap-audit.md:7-8`) | `grep -rnE "Expand canvas\|focusMode" frontends/nexo/src` no match | 1 | — |
| Figure page | Canvas help | `www/team/js/figure_toolbar.js:103-107` | EQUIVALENT | `ui/strings.ts:13`; `ui/Dialogs/HelpDialog.tsx` | 1 | P3 |
| Figure page | ← Back to draft | `www/team/js/figure_toolbar.js:86` | EQUIVALENT: Draft / Figure page toggle in the toolbar | `ui/Toolbar.tsx:38` | 1 | P3 |
| Figure page | Figure 1 template (A–D placeholders, legend) | `www/team/js/canvas_preview.js:360-361` | SAME | `figure/layout.ts:10-18` | 1 | P3 |
| Figure export | Export figure as SVG | `www/team/js/figure_toolbar.js:89`; `www/team/js/canvas_preview.js:759` | SAME (Nexo also allows non-Free layouts) | `FigurePage.tsx:35`; `figure/exportPage.ts:27` | 1 | P3 |
| Figure export | Export figure as PDF (raster 3×) | `www/team/js/canvas_preview.js:556-565` | SAME. Multi-page PDFs reuse the first page's orientation (UNSURE whether this matters; check mixed-orientation output) | `figure/exportPage.ts:29-32` | 1 | P3 |
| Figure export | Print | `R/frontends/team/canvas.R:54`; `www/team/js/canvas_preview.js:607` | SAME | `figure/exportPage.ts:28` | 1 | P3 |
| Card export | Download PNG (live plot) | `www/team/js/plot_exports.js:98,151` | EQUIVALENT (300 DPI at on-screen size) | `ui/Inspector/ExportTab.tsx:14,29` | 1 | P3 |
| Card export | Download SVG (live plot) | `www/team/js/plot_exports.js:45,151` | SAME | `ui/Inspector/ExportTab.tsx:30`; `ui/Dialogs/ExportDialog.tsx:24-29` | 1 | P3 |
| Card export | Download PDF (vector, jsPDF) | `www/team/js/plot_exports.js:34-43` | MISSING (a PDF is only available through the Studio ZIP) | `grep -rnE "pdf" frontends/nexo/src/ui/Inspector frontends/nexo/src/cards.ts` no match | 1 | P2 |
| Card export | Download JPG | `www/team/js/plot_exports.js:98,151` | MISSING | `grep -rnE "jpe?g\|JPG" frontends/nexo/src R/frontends/api` no match | 1 | P3 |
| Card export | Finished snapshot PNG / SVG / PDF | `www/team/js/canvas.js:2145-2146,2376-2390` | PARTIAL: PNG and SVG, no PDF | `ui/Dialogs/ExportDialog.tsx:22,26-41`; `ui/Inspector/ExportTab.tsx:29-30` | 1 | P2 |
| Card export | Custom mm size and DPI for one plot | `R/frontends/team/modules-ui.R:3405,3441` (Studio only) | EQUIVALENT+ (per plot) | `ui/Dialogs/ExportDialog.tsx:97-101` | 1 | P3 |
| Card export | "Plot changed — export again." | `www/team/js/plot_exports.js:51-52` | SAME | `export/changedNotice.ts:4-11`; `cards.ts:140` | 1 | P3 |
| Card export | Plot data (CSV) | `www/team/js/canvas.js:1752-1757` | SAME | `ui/Dialogs/ExportDialog.tsx:103`; `R/frontends/api/export.R:88-96` | 1 | P2 |
| Card export | More downloads from this analysis (module buttons) | `www/team/js/canvas_inspector_export.js:13,27-46,86-91` | EQUIVALENT: the server finds the module's download links. Not checked one module at a time (UNSURE per module; needs the live API) | `ui/Inspector/ExportTab.tsx:18-27`; `R/frontends/api/export.R:137-196` | 1 | P2 |
| Card export | Copy figure JSON | none in Team | NOT APPLICABLE (Nexo only) | `ui/Inspector/ExportTab.tsx:31-35` | 1 | — |
| Card export | Group comparison data CSV and PNG/JPG/SVG/PDF chips | `www/team/js/group_comparison.js:150` | PARTIAL: CSV and report; image formats only from the generic PNG/SVG | `ui/Inspector/GroupComparisonSection.tsx:27,49` | 1 | P2 |
| Card export | Statistics CSV | `www/team/js/canvas_statistics.js:435,594` | SAME | `ui/Inspector/StatisticsTab.tsx:96`; `statistics/csv.ts:7` | 1 | P2 |
| Export Studio | Select figure (PCA 2D / Volcano / Class abundance / Heatmap) | `R/frontends/team/modules-ui.R:3351` | SAME | `ui/Dialogs/ExportDialog.tsx:108-109` | 1 | P3 |
| Export Studio | Journal preset (Nature / Cell / Science / EMBO / Custom) | `R/frontends/team/modules-ui.R:3369` | SAME | `ui/Dialogs/ExportDialog.tsx:110-111`; `export/presets.ts:32-37` | 1 | P3 |
| Export Studio | Column width (single / 1.5 / double / custom) | `R/frontends/team/modules-ui.R:3387` | MISSING: a preset always uses the single column | `export/presets.ts:36`; `grep -rnE "col_width_mode" frontends/nexo/src R/frontends/api` no match | 1 | P2 |
| Export Studio | Width / Height (mm) | `R/frontends/team/modules-ui.R:3405-3406` | SAME | `ui/Dialogs/ExportDialog.tsx:87-89,112` | 1 | P3 |
| Export Studio | Aspect buttons 1:1 / 4:3 / 16:9 / 1.618 | `R/frontends/team/modules-ui.R:3411-3414` | MISSING | `grep -rnE "ratio_4_3\|16:9\|1\.618" frontends/nexo/src R/frontends/api` no match | 1 | P3 |
| Export Studio | Base font (5.5-12 pt) | `R/frontends/team/modules-ui.R:3427` | EQUIVALENT (a number field) | `ui/Dialogs/ExportDialog.tsx:114` | 1 | P3 |
| Export Studio | Typography compliance badge | `R/frontends/team/modules-ui.R:3424` | MISSING | `grep -rnE "Compliant\|typography_badge" frontends/nexo/src R/frontends/api` no match | 1 | P3 |
| Export Studio | DPI 300/600/1200; font family; Cairo engine | `R/frontends/team/modules-ui.R:3441,3447,3454` | SAME | `ui/Dialogs/ExportDialog.tsx:85-86,117-119` | 1 | P3 |
| Export Studio | Bundle formats (PDF/SVG/PNG/TIFF/CSV/R script) | `R/frontends/team/modules-ui.R:3466-3471` | SAME | `ui/Dialogs/ExportDialog.tsx:120-126`; `export/presets.ts:21-26,65-69` | 1 | P3 |
| Export Studio | Single-file downloads (PDF/SVG/PNG/TIFF/CSV/R) | `R/frontends/team/modules-ui.R:3481-3486` | PARTIAL: ZIP only, even for one format | `R/frontends/api/export.R:60-67`; `grep -rnE "download_single\|singleFormat" frontends/nexo/src R/frontends/api` no match | 1 | P2 |
| Export Studio | Reproducibility bundle (.zip) | `R/frontends/team/modules-ui.R:3491`; `R/frontends/team/export_studio_adapter.R:290-312` | SAME | `ui/Dialogs/ExportDialog.tsx:129`; `R/frontends/api/export.R:31-67` | 1 | P3 |
| Export Studio | Journal audit bar | `R/frontends/team/modules-ui.R:3505` | PARTIAL: a size/px line, no preset name or font badge | `ui/Dialogs/ExportDialog.tsx:42-45,127` | 1 | P3 |
| Export Studio | Live publication preview | `R/frontends/team/modules-ui.R:3511` | UNSURE: a "Publication preview" catalog card exists with no inputs; check whether it follows the dialog's settings | `frontends/nexo/src/mock/catalog.json:1057-1072` | 1 | P2 |
| QC vector | Editable vector view for PCA scores/loadings | `R/frontends/team/qc-ui.R:260,340`; `R/frontends/team/legacy_vector_adapter.R:55-77` | EQUIVALENT (separate catalog cards) | `R/frontends/api/catalog.R:12,15` | 1 | P3 |
| Data exports | Cell viewer CSVs (prepared values, class profile, comparisons) | `R/cell_show.R:83,87,110,111` | UNSURE: would come only through "More downloads" link discovery; needs the live API | `grep -rnE "cell_lipid_csv\|cell_profile_csv" frontends/nexo/src R/frontends/api` no match | 1 | P3 |
| Data exports | Prepared matrix / confirmed metadata / methods report | `R/guided_shared.R:37-38`; `R/guided_workflow.R:158-160` | MISSING | `grep -rnE "guide_report\|methods and decisions" frontends/nexo/src R/frontends/api` no match | 2 | P2 (methods) |

### Review step (study design, samples, metadata, groups, preparation, QC) and Companion/foreground

| Area | Feature | Team evidence | Nexo status | Nexo evidence / grep | Phase | Impact |
|---|---|---|---|---|---|---|
| Checkpoint load | Prepared state is reused when a checkpoint opens | Team writes `shared$applied` into the archive | EQUIVALENT: the API restores the archive in a Team session, reapplies `saved$spec$settings`/`selected`, reruns `runAnalysis`, and refuses to open if lipids or samples differ from the receipt or the preparation state is missing | `R/frontends/api/session.R:220-236,276-292` | 2 | (present) |
| Study design | Experimental unit | `R/guided_workflow.R:55,105` | PARTIAL: a fixed list instead of free text. The two Nexo dialogs use different values, and neither is pre-filled from the saved design | `frontends/nexo/src/ui/Dialogs/DesignDialog.tsx:27`; `frontends/nexo/src/canvas.ts:298-305`; `R/frontends/api/session.R:342-350` | 2 | P2 |
| Study design | Sample relationship (independent / paired / mixed-uncertain) | `R/guided_workflow.R:57,106` | PARTIAL: only independent and paired. The API accepts "uncertain" but no UI sends it | `ui/Dialogs/DesignDialog.tsx:30-31`; `session.R:343` | 2 | P2 |
| Study design | Design and exclusion notes | `R/guided_workflow.R:60,107` | MISSING as a control. Records are carried through unchanged | `grep -rniE "designNotes\|notes" frontends/nexo/src R/frontends/api` matched only a comment at `session.R:82` | 2 | P3 |
| Study design | "I reviewed the labels…" confirmation | `R/guided_workflow.R:65` | EQUIVALENT: "Confirm study design" sends `confirm:true` | `frontends/nexo/src/api.ts:68-70`; `R/frontends/api/plumber.R:156-160` | 2 | P2 |
| Study design | Design gate on differential-analysis plots | `R/guided_workflow.R:369` | EQUIVALENT: `needsStudyDesign` opens the design dialog first | `frontends/nexo/src/canvas/cardActions.ts:2`; `canvas.ts:119,298` | 1 | (present) |
| Samples | Choose samples (selected columns, summary) | `R/guided_workflow.R:62,700-706` | MISSING: the API replays the checkpoint's selection | `grep -rniE "selectedColumns" frontends/nexo/src R/frontends/api` matched only `session.R:276` | 2 | P1 if the figure needs a different subset |
| Samples | "Keep bone tissues only" | `R/guided_workflow.R:707-708` | MISSING | `grep -rniE "bones" …` no match | 2 | P3 |
| Metadata | Edit sample labels and metadata (mapping modal) | `R/guided_workflow.R:51,104` | MISSING | `grep -rniE "Replace sample metadata\|sample labels" frontends/nexo/src R/frontends/api` no match | 2 | P1 if labels are wrong |
| Metadata | Upload a metadata file: ID column, field mapping, confirm | `R/frontends/team/sample_metadata_import_module.R:6,31,42,67` | MISSING. Nexo upload takes only `.zip` checkpoints | `ui/Dialogs/CheckpointsDialog.tsx:24`; same grep, no match | 2 | P2 |
| Metadata | Replace sample metadata | `www/team/js/replace_metadata.js:14-17` | MISSING | `grep -rniE "Replace sample metadata"` no match | 2 | P2 |
| Groups | Edit groups drawer (Group1/Group2 per sample) | `www/team/js/group_editor.js:89`; `R/frontends/team/group_editor.R:1-8` | MISSING | `grep -rniE "group_editor\|groupEditor\|renameGroup" frontends/nexo/src R/frontends/api` no match | 2 | P1 if groups must change after open |
| Groups | Group editor: filter samples, select all shown, bulk assign | `www/team/js/group_editor.js:128-131,205` | MISSING | `grep -rniE "Edit groups\|bulk"` no match | 2 | P2 |
| Groups | Group editor: Reset / Apply with validation | `www/team/js/group_editor.js:3,132-133` | MISSING | same greps | 2 | P2 |
| Groups | Condition colours/legend on the Review PCA | `R/frontends/team/review_shell.R:4-17`; `www/team/js/review_shell.js:12-34` | EQUIVALENT for plots: per-card condition colours. There is no Review PCA | `ui/PlotEditor/PaletteSection.tsx:4-15`; `editor/conditionColors.ts:3-5` | 1 | P3 |
| Preparation | Minimum detection (%) slider | `R/guided_preparation_controls.R:5`; `www/team/js/review_live.js:37-56` | MISSING (replayed from the checkpoint only) | `grep -rniE "minDetection\|detection" frontends/nexo/src R/frontends/api` no match | 2 | P1 if the filter must change |
| Preparation | Detection scope (global vs condition × tissue) | `R/guided_preparation_controls.R:6`; `R/ux_preparation.R:9-17` | MISSING | same grep | 2 | P2 |
| Preparation | Exclude entirely undetected lipids | `R/guided_preparation_controls.R:4` | MISSING | same grep | 2 | P2 |
| Preparation | Detection preview (retained/excluded) | `R/guided_workflow.R:93`; `R/ux_preparation.R:2` | MISSING | same grep | 2 | P3 |
| Preparation | QRILC imputation on/off, seed | `R/guided_preparation_controls.R:10,12` | MISSING as a control; read-only text in Statistics | `ui/Inspector/StatisticsTab.tsx:77`; `grep -rniE "imput\|QRILC"` found only this and `state/validate-support.ts:89-93` | 2 | P2 |
| Preparation | Normalization (Median log / PQN / None) | `R/guided_preparation_controls.R:14` | MISSING as a control (read-only text) | `grep -rniE "PQN\|pqn" frontends/nexo/src R/frontends/api` no match | 2 | P2 |
| Preparation | Advanced: missing lipids per file to zero; NA to zero | `R/guided_preparation_controls.R:23-24` | MISSING | imputation grep: no control | 2 | P3 |
| Preparation | Drop unclassified "Misc" lipids | `R/guided_preparation_controls.R:25` | MISSING | `grep -rniE "dropMisc\|'Misc'"` no match | 2 | P2 |
| Preparation | PCA analysis level (lipids vs classes) | `R/guided_preparation_controls.R:26` | PARTIAL: Team's Classic default is used for QC copies (`R/frontends/team/plot_instances.R:173`); no Nexo control | `grep -rniE "pcaMode\|aggregated classes"` no match | 2 | P2 |
| Preparation | Maximum principal components | `R/guided_preparation_controls.R:28` | MISSING | `grep -rniE "maxPCs"` no match | 2 | P3 |
| Preparation | Update prepared data, "Preparing data…" overlay | `R/guided_workflow.R:94-95`; `www/team/js/review_live.js:27-35` | NOT APPLICABLE: the API runs it once at open; Nexo reports only "Server busy" | `session.R:277`; `frontends/nexo/src/api.ts:115` | 2 | P3 |
| Preparation | Pending changes bar (Update / Undo) and confirm modal | `R/frontends/team/pending_changes_bar.R:6-10`; `R/guided_workflow.R:497-506` | NOT APPLICABLE (Nexo has no preparation edits) | `grep -rniE "pendingChange\|pending_changes"` no match | 2 | P3 |
| QC review | Click a PCA point, then Keep / Exclude with a reason | `R/modules/2_qc_boxplot_module.R:1254-1263`; `www/team/js/review_shell.js:118-127` | MISSING: Guided QC is a catalog card only | `R/frontends/api/catalog.R:22`; `grep -rniE "exclude sample\|Exclude"` matched only catalog/stats text | 2 | P1 if a sample must be excluded or restored |
| QC review | Confirm exclusion / undo exclusion | `R/modules/2_qc_boxplot_module.R:1305-1308,1327-1330` | MISSING | same grep | 2 | P2 |
| QC review | Select a sample by name | `R/guided_workflow.R:102` | MISSING | same grep | 2 | P3 |
| QC review | Excluded samples list with group and reason | `www/team/js/review_shell.js:129-141`; `R/frontends/team/review_shell.R:19-25` | MISSING | `grep -rniE "exclusion"` no sample list | 2 | P2 (n not visible) |
| QC review | KPI tiles and prepared-data summary | `www/team/js/review_shell.js:36-70`; `R/guided_workflow.R:70-85` | MISSING | `grep -rniE "lipids kept\|Preparation details"` no match | 2 | P3 |
| QC review | Explore the prepared-data table | `R/guided_workflow.R:103` | MISSING | `grep -rniE "data_processed"` no match | 2 | P3 |
| QC review | Review Export menu, "Download sample decisions" | `R/guided_workflow.R:110,127-128`; `www/team/js/review_shell.js:73-90` | PARTIAL: cards have generic export; no sample-decisions download | `grep -rniE "Download sample decisions"` no match | 2 | P3 |
| QC plots | QC cards: boxplots, outliers, PCA/loadings 2D/3D, vector, correlation, BQC ×3, outlier PCA | `R/frontends/team/qc-ui.R:140-470` | SAME (catalog entries) | `R/frontends/api/catalog.R:9-22` | 1 | (present) |
| QC controls | Grouping, class name format, colour by, labels, shapes | `R/frontends/team/qc-ui.R:21-45` | EQUIVALENT: per-card schema form generated from Team's own UI markup; Team sets these for the whole module, Nexo per card | `R/frontends/api/schema.R:2-40`; `ui/Inspector/DataTab.tsx:26`; `ui/forms/SchemaForm.tsx:36-37` | 1 | P2 |
| QC controls | Dot/label sizes, 2D frame, 3D labels | `R/frontends/team/qc-ui.R:54-61`; `qc_3d_labels_adapter.R:1-3` | EQUIVALENT (schema form) | `frontends/nexo/src/api/types.ts:17`; `SchemaForm.tsx:12` | 1 | P3 |
| QC controls | Smart labelling, repel force/padding | `R/frontends/team/qc-ui.R:64-75` | EQUIVALENT (schema form). UNSURE whether conditionalPanel children reach the schema (`plot_instances.R:274-300`); needs the live API | `SchemaForm.tsx:37` | 1 | P3 |
| QC controls | Correlation method, clustering, labels; outlier scope, MAD, samples shown | `R/frontends/team/qc-ui.R:79-82,187-189` | EQUIVALENT (schema form) | `ui/Inspector/DataTab.tsx:26` | 1 | P3 |
| QC controls | "Process Outlier Risks…" and "See high variance lipids…" managers | `R/frontends/team/qc-ui.R:198,470` | UNSURE: an action renders as a button (`SchemaForm.tsx:36`), but no modal handling exists; check on the live API | `grep -rni "modal" R/frontends/api frontends/nexo/src/ui/forms` no match | 2 | P2 |
| QC controls | BQC pattern, CoV threshold, global high-variance filter | `R/frontends/team/qc-ui.R:463-468` | UNSURE: form controls likely, but the global filter changes preparation; check on the live API | `grep -rniE "bqc"` matched catalog only | 2 | P2 |
| QC controls | "Show Statistic Detail" | `R/frontends/team/qc-ui.R:88` | UNSURE: action button; its output is probably a modal | `grep -rni "modal"` no match | 1 | P3 |
| Guided flow | Goal chooser; tool picker / step navigation | `R/guided_workflow.R:134-138,547`; `www/team/js/guided.js:1-8` | NOT APPLICABLE: library with search instead | `canvas.ts:295-296`; `grep -rniE "Explore the big picture"` no match | 1 | P3 |
| Guided flow | Save prepared data, methods and decisions, labels CSV, Export Session | `R/guided_workflow.R:155-163` | PARTIAL: checkpoint ZIP only | `ui/App.tsx:180`; `ui/Dialogs/CheckpointsDialog.tsx:24`; `grep -rniE "downloadPostNA\|methods and decisions\|guide_report"` no match | 2 | P2 |
| Guided flow | Saved sensitivity study (Run comparison page) | `R/ux_preparation.R:44-103` | MISSING | `grep -rniE "tour\|procrustes\|sensitivity" frontends/nexo/src R/frontends/api` matched only 'contour' | OUT | P3 |
| Infra | conditional_park, qw_* helpers, prep cache | `www/team/js/conditional_park.js:1-8`; `R/frontends/team/prep_cache.R:1-12` | NOT APPLICABLE (Team internals; the API uses Team's server code) | `session.R:238` | OUT | — |
| Infra | Metadata sidecar decode | `R/frontends/team/metadata_state.R:4` | SAME (API calls it) | `R/frontends/api/session.R:221-222` | 2 | — |
| Companion | AI assistant chat with suggested actions | `www/team/js/companion_assistant.js:4-5`; `R/companion_assistant.R:1-4` | MISSING (out of scope) | `grep -rniE "companion\|scientific_insight\|foreground" frontends/nexo/src R/frontends/api` matched only env unsets in `R/frontends/api/run.R:16` | OUT | P3 |
| Companion | Offline guidance: tips, Explain/Suggest, Q&A | `www/team/js/companion_guidance.js:4-6,94` | MISSING (out of scope) | same grep | OUT | P3 |
| Companion | Companion workspace panel | `www/team/js/companion_workspace.js:4-5`; `R/frontends/team/companion_workspace.R:1-4` | MISSING (out of scope) | same grep | OUT | P3 |
| Companion | Companion-confirmed detection proposal | `www/team/js/review_live.js:57-60` | MISSING (out of scope) | same grep | OUT | P3 |
| Companion | Download companion actions (CSV) | `R/companion_assistant.R:245` | MISSING (out of scope) | same grep | OUT | P3 |
| Companion | Scientific insight (PubMed notes) | `R/frontends/team/scientific_insight.R:1-13` | MISSING (out of scope) | same grep | OUT | P3 |
| Foreground | Foreground operation dialog and receipts | `www/team/js/foreground.js:1`; `R/frontends/team/foreground.R:1-5` | NOT APPLICABLE (out of scope) | same grep | OUT | — |
| Help | Onboarding tour / HUD | `www/team/js/tour_guide.js:2-3` | MISSING | `grep -rniE "tour" frontends/nexo/src` matched only 'contour' | OUT | P3 |

## 3. Phase 1: MISSING and PARTIAL, by impact (with effort guess)

Effort: S = hours, M = a day or two, L = several days.

**P1 (blocks some figures)**

| # | Item | Status | Why it blocks | Effort |
|---|---|---|---|---|
| 1 | Two-handle range sliders in the Data tab (Log-ratio "Chain Length Range", "Double Bond Range") | PARTIAL, broken | The client draws one `<input type=range>` and sends one number (`ui/forms/schemaForm.ts:8`, `ui/forms/SchemaForm.tsx:53`). The API demands two (`R/frontends/api/schema.R:160-165`), so the change is rejected | S–M |
| 2 | Server-side selectize pickers with no options (heatmap violin lipid and class, sn-chain filter) | PARTIAL | Only `violin_lipid` gets choices filled in (`R/frontends/api/schema.R:126-131`). Team fills these with `server = TRUE` (`R/modules/4_heatmap_module.R:371-383`), so they arrive empty | M |
| (3) | Group comparison reference baseline (`selectedBaseline`) | UNSURE | It is built in a `renderUI` (`R/modules/10_fla_module.R:463-466`) and reaches Nexo only through the rendered-output harvest. Check on the live API | S to check |

**P2 (slows or misleads)**

| # | Item | Status | Effort |
|---|---|---|---|
| 4 | `conditionalPanel` controls always shown in the Data tab (45 uses in `modules-ui.R`) | PARTIAL | M |
| 5 | Edit a Figure-page panel's caption or letter (stored and drawn, no field) | MISSING | S |
| 6 | Figure-page export not gated on unfinished plots (exports PENDING placeholders) | PARTIAL | S |
| 7 | Figure-page row badges "needs review" / "not ready" | PARTIAL | S |
| 8 | Figure-page Layers list | MISSING | S–M |
| 9 | Figure-page Publication layout (auto-arrange) | MISSING | M |
| 10 | Per-plot PDF download (live and finished) | MISSING / PARTIAL | M |
| 11 | Group comparison image chips (JPG/PDF "as shown") | PARTIAL | S (after 10) |
| 12 | Export Studio column-width mode (1.5 / double / custom) | MISSING | S |
| 13 | Export Studio single-file downloads (one format arrives as a ZIP) | PARTIAL | S |
| 14 | Global "Colors & palettes" group colour map (Nexo sets colours plot by plot) | PARTIAL | M |
| 15 | Heatmap lipid search and per-class toggles in the selection list | MISSING | M |
| 16 | "Significant only" not disabled when inference is not allowed (server-guarded only) | MISSING | S |
| 17 | Violin lipid picker has no search (long plain `<select>`) | PARTIAL | S |
| 18 | Statistics family-size note, blocking reasons, participant options disabled without IDs | MISSING / PARTIAL | S |
| 19 | Card status "Changes pending" / "Needs data" never produced | PARTIAL | S–M |
| 20 | Global wait strip (data not prepared / design needed) | MISSING | S |
| 21 | Library design-gate reasons (uncertain, preparation not ready, not all measured) and post-analysis hints | PARTIAL | S–M |
| 22 | File input on a card (Pathway "Upload Layout JSON") | MISSING | M |
| 23 | Durable retry of an interrupted checkpoint save | MISSING | M |
| 24 | "Project records too large" hard-stop state | PARTIAL | S |
| 25 | New-build "updating" strip with Reload | MISSING | S |

**P3 (cosmetic; 36 rows).** (Phase 1 has 65 MISSING/PARTIAL rows: 2 P1, 27 P2 grouped above, 36 P3.) Figure page: arrow nudge, snap, z field, corner radius, Fit width, "01 /" captions, unit labels, "Uncheck unfinished", hint chip. Export Studio: aspect buttons, typography badge, audit bar. JPG export. Tabs: Delete key, Shift+Arrow reorder, drop a card on a tab, "+ New tab" in the picker. Viewport: glide-to-card, minimap drag, collapse, movable zoom. Status: "Saved image broken", "Updating figures" announcement, "Restored by Undo" notices, restore-pause state. Inspector: tab arrow keys, remembered toggle. Others: violin tail extent, swatches beside choices, GC families grouping, on-plot double-click editing, context help, statistics table Excluded column and PCA note, failed-add Retry, project cards and "Open latest", role-based view-only. Each is a row in section 2. Most are S.

UNSURE (phase 1), each to settle with the live API or a browser: the per-output `tabs` filter in the Data tab, QC conditional children (repel), the "Show Statistic Detail" modal, the shared "Plot settings" dock, composition series renormalising, "Publication preview" following the dialog, the GC baseline (above), the cell-viewer CSVs, and the "More downloads" list module by module.

## 4. Where the earlier gap audit (`docs/integration/nexo-team-gap-audit.md`) is now wrong

Its section 0 already closes several rows. These items are still listed there as open, or are missing from it, and the code now says otherwise:

| Earlier audit says | Now | Evidence |
|---|---|---|
| Checkpoint near-size-limit warning: missing (`:86`; "Still open") | Done | `frontends/nexo/src/ui/TopBar.tsx:9`; `R/frontends/api/storage.R:136-144` |
| Cancel a queued add: missing (`:98`; "Still open") | Done | `frontends/nexo/src/ui/Library/Library.tsx:79` |
| "Enlarge plot" for the heatmap: missing (`:164`; "Still open") | Done | `frontends/nexo/src/cards.ts:132`; `canvas.ts:65` |
| Badge action "Study design" on a card: partial (`:158`; "Still open") | Done | `frontends/nexo/src/cards.ts:165-168` |
| Condition-named colour swatches: partial (`:205`; "Still open") | Done ("Condition colours") | `frontends/nexo/src/ui/PlotEditor/PaletteSection.tsx:15` |
| Illustration PNG/SVG download: missing (`:237`; "Still open") | Done | `frontends/nexo/src/ui/Inspector/ExportTab.tsx`; `illustrations/download.test.ts` |
| Rounded-rectangle shape: partial (`:253`; "Still open") | Done | `frontends/nexo/src/ui/FigurePage/FigurePage.tsx:31` |
| Figure-page plot list: no per-tab grouping, no Reset order (`:258`; "Still open") | Done | `frontends/nexo/src/figure/plotList.ts:4-13`; `FigurePage.tsx:35` |
| Page guides: missing (`:262`; "Still open") | Done | `FigurePage.tsx:35`; `figure/page.ts:13` |
| Per-card restore progress messages (`:290`; "Still open") | Done ("Restoring …") | `frontends/nexo/src/cards.ts:180,297,321` |
| "Plot changed — export again." (`:291`; "Still open") | Done ("Updating figures…" is still missing) | `frontends/nexo/src/cards.ts:140`; `export/changedNotice.ts:4-11` |
| Canvas help: one-line toast (`:130`) | Help dialog and Shortcuts dialog. Per-control context help is still missing | `frontends/nexo/src/ui/Dialogs/HelpDialog.tsx:4-14`; `ShortcutsDialog.tsx` |
| Section 1: "Group comparison … no controls" is the one P1 | Closed: tests, classes, conditions, per-panel visibility, colours, report, CSV | `frontends/nexo/src/ui/Inspector/GroupComparisonSection.tsx:20-49` |
| 127 features, "101 done": no Data-tab caveats | Two P1 Data-tab defects the audit did not list (range sliders, empty server-side pickers), plus always-visible `conditionalPanel` controls | section 3, items 1, 2 and 4 |
| Draggable zoom controls / minimap: missing | Still missing (agrees) | `grep -n -i drag frontends/nexo/src/ui/ZoomPill.tsx` no match |

Still open from the earlier list, and confirmed here: draggable zoom controls/minimap, and the "Updating figures…" announcement.
