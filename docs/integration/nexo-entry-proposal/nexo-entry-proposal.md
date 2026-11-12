# Nexo entry: sign-in and data preparation before the Canvas (visual proposal)

Role: designer. Scope: a proposal only (one HTML prototype, screenshots, this document); no file under `frontends/`, `R/`, `www/`, `db/` or `tests/` is changed. Companion prototype: `docs/integration/nexo-entry-proposal/prototype.html` (open it in a browser; the yellow bar on top switches the four scenes and their states), PNGs of every scene in the same folder.

Requirement (Gerardo, 2026-11-10): "Analyse how Team does it today and, with the same illustrations I liked, redesign the interface a little with cosmetic fixes so it is better, simpler, fast and functional. Make me a visual proposal of how the sign-in and the data preparation before the Canvas could look."

## The proposal in one table

| | Team today (published build `a078f7c-tip-passthrough`) | Nexo today (this ref) | Proposal |
|---|---|---|---|
| Sign-in | One screen: email and password. Reset and invitation share one folded form with 5 fields. No second step. | None of its own: a link to Admin's sign-in (email, password, authenticator code). | One card on Team's spectrum illustration: email and password, then one 6-digit field that submits itself. Reset and invitation: 3 fields each. |
| Screens between sign-in and the Canvas, new data | 4: Choose how to begin, Add your abundance matrix, Add sample labels, Review your data. | 1 dialog ("Prepare dataset"), reached only through a dataset link from Admin. | 3: Start, Prepare, Quality check. |
| Preparation choices | 9 fields on Review (8 of them folded). 5 more sit on a Results page that the workspace hides: they stay at their defaults. | 7 settings and the sample list in a 560 px dialog, raw values ("global", "median"), no preview. | 7 on one screen with a live preview, 4 folded under "More settings", Team's defaults filled in. |
| Clicks from the first screen to the Canvas, typical new dataset | Not counted (file choices and label mapping vary). | 1 ("Open dataset"), after finding the dataset in Admin. | 3: "Prepare", "Prepare and check", "Open the Canvas". |
| Continue existing work | 1 click ("Open latest") for the first project by name, which arrives selected; 2 clicks for any other. | 1 click on a checkpoint row. | 1 click for any project: "Continue" on the latest, "Open" on the others. |
| Second person on a shared board | No shared board: Team shares projects (owner, editor or read-only), and each person resumes a checkpoint in a session of their own. | Joins with the stored settings, no dialog (FIX-G12). | 1 click from Start, none from Admin's link; a card says who prepared the data and with which settings while the board loads. |

What stays exactly as it is: Team's science (every preparation rule and default, the outlier rule and its 2.5 limit), Admin's identity (accounts, roles, the authenticator code), Nexo's Canvas, and the illustrations Gerardo likes, used where Team uses them: the spectrum behind the sign-in, the data matrix behind the start screen, the step backdrop behind the preparation steps, each behind white cards. Every screen has one primary button.

## 1. How to open the prototype

- Open `prototype.html` in a browser (a double click is enough). It is one plain HTML file with its CSS and JavaScript inline: no framework, no build, no server. It needs the eight SVG files and the logo that sit next to it.
- The illustrations are Team's own files, copied unchanged from `www/team/img/` (the logo from `www/team/`): `login-spectrum.svg` behind the sign-in; `data-matrix.svg` behind Start; `step-backdrop.svg` behind Prepare, the join card and the quality check, with `step-backdrop-portrait.svg` on an upright screen; `login-spectrum-static.svg` and `data-matrix-static.svg` under reduced motion. Team's two help characters: `help-neutrophil.svg` on the Help button, the join card and the loading card, `help-macrophage.svg` on the empty Start. `libreros-lab-logo.webp` in the bar.
- The **yellow bar** on top belongs to the reviewer, not to the product: "1 · Sign in", "2 · Start", "3 · Prepare", "4 · Check → Canvas", then the states of the current scene, "Team today → proposal ↓" (jumps to the notes under the product area) and "Hide bar".
- It is clickable from end to end: any password works; the code `000000` shows the wrong-code state and any other six digits sign in; an email containing "lee" signs in as the client member; from "Signed out" you land back on the board you left.
- Direct links: `?scene=1…4&state=<name>`. States: scene 1 `password`, `code`, `wrong-code`, `signed-out`, `forgot`, `activate`; scene 2 `staff`, `client`, `empty`; scene 3 `prepare`, `more`, `joiner`; scene 4 `check`, `clear`, `loading`, `canvas`. Add `&hold=1` so that nothing advances by itself, `&bar=0` to hide the reviewer bar, `&notes=0` to hide the notes, `&settings=1` to open the settings card on the Canvas.
- Under each scene, the notes repeat this document's "Team today → proposal" row (Team today, kept, removed or merged, why) and list the cosmetic fixes of that scene.
- Everything is synthetic: the people (Ana R., Dr. Lee, Tomás, M. Okafor, Mia S.), the client groups (Fennel Hill group, Marlow Bay lab), the orders (ORD033 to ORD044) and a 76 lipids × 6 samples matrix generated inside the file. The Canvas of scene 4 is a drawing of Nexo's Canvas, not the Canvas.
- Font: Nunito Sans, loaded from Google Fonts with the same kind of link Nexo's `frontends/nexo/index.html` uses. Without a network the page falls back to the system font; the layout was checked that way too (section 8).

## 2. Team today (as published)

Reference: Team's published build `a078f7c-tip-passthrough` (`www/team/version.json`), read from its source. The sign-in page was also measured live on the staging twin, which serves build `5854855-parallel-staging`: the stylesheets, scripts and illustrations that draw the sign-in (`www/team/css/shell.css`, `www/team/js/workspace.js`, `www/team/js/shell.js`, `www/team/css/step_backdrop.css`, `www/team/img/login-spectrum.svg` and its static version) are byte-identical (sha256) to the published source, so the two screenshots show the published look. The fields and messages are quoted from the published source. Nobody signed in for this study: every step after the sign-in is described from the source, and Team's paths below are relative to Team's repository.

### 2.1 Sign-in

Screenshots: `team-signin-1440.png`, `team-signin-390.png`.

| Element | Measured at 1440 × 900 | At 390 × 844 | Source |
|---|---|---|---|
| Background | `login-spectrum.svg`, centred, covering the screen, over `#fafaf8`; the static version under reduced motion | The centre crop shows three small peaks and none of the lipid characters | `www/team/css/shell.css:141-149` |
| Bar | Navy `rgb(22,34,48)`, 48 px high; logo 79 × 38; app name 13 px semibold; a "Not signed in" button in the middle of the bar (x 748) | Logo 67 × 32; a "Toggle navigation" button with nothing to open | `www/team/js/shell.js:94` |
| Card | 620 px wide, white at 96 % | 326 px wide | |
| Heading | "Your analysis starts here", 30 / 36 px Cormorant Garamond (a serif) | Wraps to two lines (72 px high) | `www/team/js/workspace.js:128` |
| Sub-line | "Sign in to open your private projects.", 13 px, `rgb(82,100,119)`: 6.1:1 | Same | `www/team/js/workspace.js:128` |
| Fields | Email, Password: labels 13 px bold; fields 538 × 44 with 13 px text and a 1 px border `rgb(203,213,225)`: 1.5:1 against white | 274 × 44 | |
| Button | "Sign in", 538 × 47, 15 px, `rgb(45,95,138)` | 274 wide | |
| Link | "Reset password or activate your invitation", 14 px, `rgb(45,95,138)`: 6.7:1 | Same | `R/frontends/team/project_library.R:259` |
| Focus | 3 px outline at 3 px offset, plus a 3 px glow on fields | Same | |

- **Second step: none.** Team signs in with email and password only; there is no code step anywhere in Team's frontends.
- **Reset and invitation** share one folded form (`R/frontends/team/project_library.R:259-266`): "Use the one-time activation code supplied by your administrator. Then sign in with your new password.", then 5 fields: Email (typed again), "Activation code", "Code type" (Invitation / Password recovery), "New password (at least 12 characters)", "Confirm new password", and the button "Set password". Open, the card is 1001 px high at 1440 px and 1027 px at 390 px. At 390 px the illustration is one screen tall and scrolls with the page: it ends about three quarters of the way down the card, and the rest of the card sits on plain gray. Success: "Password set. Sign in normally with your email and new password." (`:280`).
- **Messages** (`R/frontends/team/login-validation.R:5-9`): "Enter the email on your invitation.", "Enter a valid email address.", "Enter your password.", and for a rejected sign-in 19 words: "We could not sign you in. Check your email and password, reset your password below, or try again later."
- Four font sizes (30, 15, 14, 13 px) in two families on one card.

### 2.2 From sign-in to the Canvas: screens counted

The published workspace has three stages in its bar, Data → Review → Canvas (`www/team/js/workspace.js:39`), and five screens (`www/team/js/workspace.js:28-35`). The step button reads "Next →", and "Continue to Canvas →" on Review (`:122`).

| # | Stage | Screen and its sub-line | What it asks | Source |
|---|---|---|---|---|
| 1 | Data | "Choose how to begin": "Start with a new matrix or open a private saved checkpoint." | One card per project, ordered by name. The first arrives selected and says how many checkpoints it has; the others say "Select to see its checkpoints". Beside them, a side card for the selected project: up to 4 checkpoints and "Open latest". A "New matrix" card. Below, folded: "All checkpoints and save options". | `www/team/js/data_shell.js:47`, `:78-79`, `:93-98`, `:105`; `R/frontends/team/project_library.R:211`, `:299` |
| 2 | Data | "Add your abundance matrix": "Upload the measurements you want to analyze. Your original file stays unchanged." | One or more files (.csv, .xlsx, .xls, .txt, .tsv). A workbook with several sheets adds a sheet choice (one sheet, or all sheets combined). | `R/guided_workflow.R:29`, `www/team/js/upload_formats.js:9`, `R/frontends/team/upload_formats.R`, `R/frontends/team/sheet_picker.R` |
| 3 | Data | "Add sample labels": "Add a metadata file, or explicitly continue without one." | A metadata file, "Column containing sample identifier", 5 optional mappings (Condition / Group 1, Tissue / Group 2, Replicate, Donor / Patient number, Time point), then "Confirm sample metadata". | `R/frontends/team/sample_metadata_import_module.R:31-39`, `:67` |
| 4 | Review | "Review your data": "Adjust detection and watch the PCA update. Click a point to inspect a sample; exclusions can be undone." | 9 fields (1 visible, 8 folded), a live preview, a sample overview (PCA) with a folded "Select a sample by name", a folded data table, 2 buttons. | `R/guided_workflow.R:86-110` |
| 5 | Canvas | "Build your figure": "Add plots, arrange them, and export when ready." | | |

**Counted:** with a new matrix, sign-in plus 4 screens stand before the Canvas. Resuming is sign-in plus 1 screen: 1 click ("Open latest") for the first project by name, which arrives selected (`R/frontends/team/project_library.R:211`, `:299`), and 2 clicks for any other (its card, then "Open latest"). An account with nothing shared reads: "No projects are shared with this account yet. Ask your project owner for access." (`R/frontends/team/project_library.R:297`).

**The preparation choices, counted: 9 fields a person can reach, 14 in the source.** The Review screen shows the detection slider with its live preview; 8 more fields are folded under "Study design and preparation options" (`R/guided_workflow.R:103`), together with the buttons "Edit sample labels and metadata" and "Download sample decisions". 5 more are written under "Advanced preparation and PCA options" on the Results page (`R/guided_preparation_controls.R:20-29`, placed by `R/guided_workflow.R:145`). The published workspace hides that page and shows the Canvas in its place (`www/team/css/workspace.css:11`), so nobody can change them there: they stay at their defaults.

| # | Team's field | Team's default | Where in Team | In the proposal |
|---|---|---|---|---|
| 1 | Minimum detection (%), 0 to 100 in steps of 5 | 0 | Review | On screen, with the live preview |
| 2 | Where must a lipid be detected? | Across selected samples (the other choice: in at least one condition × tissue group) | Review, folded | On screen, beside the slider |
| 3 | Estimate missing values with QRILC | On | Review, folded | On screen |
| 4 | Normalization method: Median (log scale), PQN (linear scale), None | Median (log scale) | Review, folded | On screen |
| 5 | Experimental unit (free text) | Empty | Review, folded | On screen, optional |
| 6 | Sample relationship: Independent experimental units, Matched or repeated measurements, Mixed or uncertain | "Choose a design": never prefilled | Review, folded | On screen, optional, never prefilled |
| 7 | Exclude entirely undetected lipids before imputation | On | Review, folded | More settings |
| 8 | Imputation seed | 42 | Review, folded | More settings |
| 9 | Design notes (optional) | Empty | Review, folded | Not asked |
| 10 | For each file, set entirely missing lipids to zero | On | Results page, hidden | More settings |
| 11 | Replace remaining missing values with zero | Off | Results page, hidden | More settings |
| 12 | Drop unclassified 'Misc' lipids | On | Results page, hidden | Not asked |
| 13 | PCA analysis level: individual lipids or aggregated classes | Aggregated classes | Results page, hidden | Not asked |
| 14 | Maximum principal components | 3 | Results page, hidden | Not asked |

The proposal's seventh on-screen choice is the sample selection, which Team does by excluding points on its PCA and Nexo's dialog does with a checkbox list. Rows 10 and 11 cannot be changed in Team's workspace; Nexo's dialog asks them today because its API requires them, so the proposal folds them under "More settings" (question 2). Rows 9 and 12 to 14 are not asked: Nexo's dataset API does not take them today (section 3). Rows 5 and 6 are not in that API either: Nexo confirms the study design on the Canvas today (`frontends/nexo/src/ui/Dialogs/DesignDialog.tsx`), and the proposal offers the same two fields one step earlier, still optional.

### 2.3 Team's quality check

- **On Review**, the "Sample overview" is a PCA. Clicking a point opens a small card: the sample's name, "Exclude this sample and recalculate the prepared data and PCA. Source measurements are preserved; Undo restores the sample.", a field "Reason (optional)" and the buttons "Exclude" and "Cancel" (`R/modules/2_qc_boxplot_module.R:1259-1274`).
- **The Quality Check tool** has 6 tabs (`R/frontends/team/qc-ui.R:109`, `:149`, `:207`, `:287`, `:367`, `:416`): Normalization Check, Outliers Detection, PCA Score Plots, PCA Loading Plots, Sample Correlation, BQC CoV Analysis.
- **The outlier rule** (`R/modules/2_qc_boxplot_module.R:1026-1047`; controls at `R/frontends/team/qc-ui.R:187-188`): the distance of each sample to the centre of all samples in PC1/PC2 ("Context Scope": Overall / Global by default, or Within Group); a sample is flagged when its distance lies more than "MAD Threshold (Risk)" MADs above the median distance (R's `mad()`: the median absolute deviation times 1.4826). Default 2.5, minimum 1, step 0.5. A flagged sample can be kept, averaged or removed. With no flag the tool says: "No outlier risks detected in the current scope."

## 3. Nexo today (this ref)

The five screenshots come from Nexo's mock build (built the way `tests/dual-ui/test_nexo_collab_presence.cjs` builds it), with its synthetic demo data.

| What | Today | Source | Screenshot |
|---|---|---|---|
| Sign-in | None of its own. Identity is Admin's: email, password and a one-time code from an authenticator app (TOTP); lab staff or client member. Nexo asks Admin for a token (`GET /admin/api/session-token`); signed out, it shows a link to `/admin/sign-in?next=<this page>`. | `docs/integration/admin-identity.md`, `frontends/nexo/src/api/adminToken.ts:4-6` | |
| Start page | A 560 px card on a gray page, no logo, no illustration: "Lipidomic Explorer", "Choose checkpoint", "Upload ZIP" with the browser's raw file field, then the checkpoints in groups. Upload is hidden for client members. A dataset is reachable only through a `?dataset=` link from Admin: the page does not list the datasets released to you, nor the shared boards you belong to. | `frontends/nexo/src/main.tsx:103-107`, `frontends/nexo/src/ui/uploadAccess.ts` | `nexo-today-start-1440.png` |
| Signed out | The same card with two sentences ("Nexo opens lab datasets with your Admin account, and you are not signed in to Admin. Sign in, and Nexo opens this dataset again.") and a "Sign in to Admin" button that touches "Upload ZIP". | `frontends/nexo/src/main.tsx:103`, `frontends/nexo/src/ui/strings.ts:179-181` | `nexo-today-signed-out-1440.png` |
| Prepare dataset | A dialog over that card: "All" / "None" and one checkbox per sample, then 7 settings in the API's order. The two selects show raw values ("global", "median"); nothing says what a choice will cost before the server run. At 390 × 844 the dialog is taller than the screen: its two buttons sit on the bottom edge, half cut off. | `frontends/nexo/src/ui/Dialogs/PrepareDatasetDialog.tsx:22-44`, `frontends/nexo/src/ui/datasetPrepare.ts` | `nexo-today-prepare-1440.png`, `nexo-today-prepare-390.png` |
| Canvas | Navy bar with an "LE" box for a logo, "Lipidomic Explorer", the order, a "from Admin" pill, and Data / Review / Canvas, where Data and Review are links to Team. | `frontends/nexo/src/ui/TopBar.tsx:13-15`, `frontends/nexo/src/ui/strings.ts:33` | `nexo-today-canvas-1440.png` |

What the API asks and answers (`frontends/nexo-api/datasets.R`):

- A dataset carries the sheets Abundance, Metadata, Internal_Standards, QC_Injections and Provenance (`:4`): the matrix and the sample labels are already there, which is why the proposal has no upload and no label mapping.
- Opening a dataset without choices answers `422 preparation_choices_required` with the missing settings and the sample names (`:85-92`). The 7 required settings (`:12-18`) are Team's: minimum detection, detection scope, drop never-detected lipids, normalization, QRILC, zero per file, final zero. `imputationSeed` and `outlierTreatments` are optional (`:20`). The preparation itself runs in Team's code with Team's policy (`:112-128`).
- A dataset whose project already exists is joined with the stored settings: the second person sees no dialog (FIX-G12; `frontends/nexo/src/main.tsx`, `frontends/nexo-collab/src/projects.mjs`).
- The defaults the API reports differ from the published workspace in two places: "drop never-detected lipids" is off (Team's workspace: on) and "final zero" is on (Team's workspace: off). This is question 2.

## 4. The proposal, scene by scene

One look for all four scenes: Nexo's navy bar and tokens (`frontends/nexo/src/tokens.css:8-12`: accent `#235273`, navy `#162230`, ink `#141b24`, muted `#44505e`) with Team's illustrations behind white cards, and the lab logo instead of Nexo's "LE" box. The bar keeps Nexo's three steps: **Data** is the Start page, **Review** is Prepare plus the quality check, **Canvas** is the board. Every scene exists at 1440 and 390 px.

### Scene 1 · Sign in

Screenshots: `scene-1-1440.png`, `scene-1-390.png` (email and password); `scene-1-code-1440.png`, `scene-1-code-390.png` (the 6-digit step); `scene-1-wrong-code-1440.png`, `scene-1-wrong-code-390.png`; `scene-1-signed-out-1440.png`, `scene-1-signed-out-390.png`; `scene-1-forgot-1440.png`, `scene-1-forgot-390.png`; `scene-1-activate-1440.png`, `scene-1-activate-390.png`.

What a person sees: the spectrum illustration over the whole screen and one white card, 400 px wide. "Your analysis starts here", "Sign in to open your private projects.", Email, Password (with "Show"), the button "Continue", and two links: "Forgot password?" and "Activate your invitation". Then "Step 2 of 2 · Enter your 6-digit code": one field that submits itself at the sixth digit. A wrong code says so under the field: "That code did not match. Codes change every 30 seconds: enter the newest one." Signed out in the middle of work: "You were signed out. Sign in to go back to ORD041 · v1.", and after the code the person is back on that board, not on Start.

| Team today | Kept | Removed or merged | Why |
|---|---|---|---|
| One screen: Email, Password, "Sign in". | The spectrum illustration, full screen, behind one white card. | "Code type" select: the two links already say which one. | Reset or activate: 5 fields → 3 fields. |
| Reset and invitation share one folded form with 5 fields. | The heading and its sub-line, word for word. | "Confirm new password": one field with "Show". | The code step is new to Team's people (Admin signs in with an authenticator code), but it is one field that submits itself. |
| No second step. | Email and password first; a one-time code for an invitation or a reset. | The second Email entry: carried over from the first screen. | Signed out in the middle of work: one sentence, and you come back where you were. |
| The bar says "Not signed in" in its middle; on a phone it shows a menu button with nothing to open. | Each message next to the field it is about, in Team's words. | "Not signed in" and the phone menu button. The serif heading font. | One primary button per screen. |

Nexo has no sign-in page today, so who serves this one is question 1.

### Scene 2 · Start

Screenshots: `scene-2-1440.png`, `scene-2-390.png` (lab staff); `scene-2-client-1440.png`, `scene-2-client-390.png` (client member); `scene-2-empty-1440.png`, `scene-2-empty-390.png` (nothing released yet).

What a person sees: the data-matrix illustration and one white sheet.

- **Lab staff** ("Welcome back, Ana", "Lab staff · all clients"): "Continue where you left off" with the last board and one button, "Continue"; "Projects" with a client filter, each row with its lipid and sample counts and who is on the board now; "Released datasets · not prepared yet", each with "Prepare"; and one quiet line for a checkpoint saved from Team: "Import a Team checkpoint (.zip)".
- **Client member** ("Welcome, Dr. Lee", "Fennel Hill group"): "New from the lab" with the board the lab prepared ("Prepared by Ana R. · 74 lipids · 6 samples") and one button, "Open"; only their group's projects; no import.
- **Nothing yet**: "Nothing here yet. When the lab releases a dataset to Fennel Hill group, it shows up on this page, ready to open. Expecting one already? Ask your lab contact."

| Team today | Kept | Removed or merged | Why |
|---|---|---|---|
| "Choose how to begin": project cards ("Select to see its checkpoints"), then a side card with up to 4 checkpoints and "Open latest". | The data-matrix illustration behind one white sheet. | The side card and the checkpoint lists: versions live on the Canvas. | Any project opens in 1 click (Team: 1 for the first by name, 2 for the others). |
| A "New matrix" card to upload, and "All checkpoints and save options" below. | Your projects, with their lipid and sample counts. | "New matrix" upload: data arrive as datasets released in Admin. Lab staff keep "Import a Team checkpoint (.zip)". | A released dataset is visible before anyone prepares it, with one action. |
| Resuming: "Open latest", 1 click for the first project by name (it arrives selected), 2 for any other. | The latest work first. | Two lists (projects, checkpoints) → one list of projects. | A client member sees only their group and no upload. |
| In Nexo today: an unbranded card that lists checkpoints and offers Upload ZIP. | An empty state that says what will happen and who to ask. | | You see who is on a board before you open it. |

The client page shows one released dataset with "Prepare", because the API lets a client member prepare today; whether it should is question 5.

### Scene 3 · Prepare the data

Screenshots: `scene-3-1440.png`, `scene-3-390.png` (Team's defaults); `scene-3-threshold-1440.png` (threshold at 70 % in at least one condition group: 56 of 76 lipids kept); `scene-3-preview-390.png` (the preview on a phone); `scene-3-more-1440.png`, `scene-3-more-390.png` ("More settings" open); `scene-3-joiner-1440.png`, `scene-3-joiner-390.png` (a second person: nothing to prepare).

What a person sees: one screen on the step backdrop. On the left, five rows with their titles in one column:

1. **Samples**: one chip per sample, grouped by condition ("Groups come from the dataset's sample sheet."), with "Select all" and "Clear".
2. **Detection**: "Keep lipids detected in at least" [slider, 0 to 100 % in steps of 5] "of" [All selected samples | At least one condition group].
3. **Missing values**: a switch, "Estimate with QRILC".
4. **Normalization**: Median (log scale) | PQN (linear scale) | None.
5. **Study design**: "Experimental unit" and "Sample relationship", both empty ("Never guessed for you. You can also confirm it later on the Canvas.").

Folded under **More settings**: "Leave out lipids never detected in the selected samples", "For each file, set entirely missing lipids to zero", "Replace remaining missing values with zero", "Imputation seed".

On the right, **"With these choices"**: a 40 px number ("74 of 76 lipids kept · 2 left out"), a small chart of the lipids by how many samples detect them (kept in blue, left out in gray), and five facts (samples, left out, missing values, normalization, study design). It recounts at once when the slider moves or a sample is unticked. At the bottom of the screen, one bar: the count again, "All settings are Team's defaults." or "2 changes from Team's defaults · Reset", "Cancel" and the one primary action, **"Prepare and check"**.

**A joiner** sees none of this: a card, "ORD041 · v1 is ready. Nothing to prepare. You are joining the board Ana R. prepared on 9 Nov.", the settings in six lines, and the board opens by itself.

| Team today | Kept | Removed or merged | Why |
|---|---|---|---|
| 3 screens before the Canvas: abundance matrix, sample labels, review and prepare. | Every science choice Nexo sends to Team, with Team's wording and defaults. | Matrix upload and label mapping: a released dataset already carries its Abundance and Metadata sheets. | 3 screens → 1, with one primary action. |
| 9 fields on Review (8 of them folded); 5 more on a Results page the workspace hides. | The detection threshold with its live preview. | 7 on screen (6 of Team's and the sample choice) + 4 under "More settings" (2 of Team's folded ones and the 2 zero rules Nexo's API asks). | The preview answers "what do I lose?" before the server run. |
| In Nexo today: a 560 px dialog with raw values ("global", "median"), no preview; at 390 px its buttons are cut off. | QRILC for missing values; the three normalizations. | "Design notes", "Drop Misc lipids", PCA level and maximum components: Nexo's dataset API does not ask them today. | With Team's defaults a typical dataset needs 1 click. |
| | Samples chosen by group; the study design is never prefilled. | For a joiner, the whole step. | The joiner clicks nothing: the card shows while the board loads. |

### Scene 4 · Quality check, then the Canvas

Screenshots: `scene-4-1440.png`, `scene-4-390.png` (one sample to review); `scene-4-clear-1440.png`, `scene-4-clear-390.png` (all clear); `scene-4-loading-1440.png`, `scene-4-loading-390.png` (the hand-off); `scene-4-canvas-1440.png`, `scene-4-canvas-390.png` (the Canvas); `scene-4-canvas-settings-1440.png`, `scene-4-canvas-settings-390.png` (the "Prepared by … · settings" card).

What a person sees: "Quality check · ORD041 · v1", "Prepared by Team with your choices: 74 of 76 lipids, 6 samples.", then one verdict and three checks.

- **The verdict** is either "Ready for the Canvas" (green, with a check icon) or "1 sample to review" (amber, with a warning icon): "Treated_3 sits far from the other samples. Keep it or exclude it. Either way the Canvas opens, and the choice stays visible there." Two buttons: "Keep Treated_3" and "Exclude…". Exclude asks for a reason, optional as in Team's Review; the decision shows with "Undo".
- **Three checks**, each a card with a status ("OK" or "Look", icon and word), one sentence, one small chart and "Show as table":
  1. "Samples group as expected": PC1 against PC2, coloured by condition, the flagged sample ringed and named ("Treated_3 is 5.7 MAD beyond the median distance. Team flags above 2.5."). This is Team's outlier rule, with Team's limit.
  2. "Samples are on one scale": the median and the middle half of each sample after normalization.
  3. "Missing values are handled": the share missing per sample before imputation, and what was done with it.
- **The bar at the bottom** repeats the verdict and carries "Change settings" and the one primary action, **"Open the Canvas"**. It is never disabled: the check advises (question 3).
- **The hand-off**: a card on the board, "Opening your board", with what is already done ("Data prepared with Team", "Quality check reviewed") and what is running ("Loading the board and its plots…").
- **On the Canvas**, a chip in the hint bar says "Prepared by you · settings" (for a joiner: "Prepared by Ana R. · settings"). It opens the settings and the decision ("Treated_3 flagged, kept") with one line: "Everyone on this board sees the same prepared data."

| Team today | Kept | Removed or merged | Why |
|---|---|---|---|
| Review shows a sample overview (PCA): click a point to exclude that sample (reason optional); Undo restores it. | Team's outlier rule and its 2.5 limit. | 6 tabs → 3 checks and one verdict. | One glance says go, or look at one sample. |
| The Quality Check tool has 6 tabs: normalization, outliers, PCA scores, PCA loadings, sample correlation, BQC CoV. | PCA coloured by condition. | PCA loadings and sample correlation stay Canvas plots (its Quality check library). | A decision is 1 click (Keep) or 2 (Exclude, with a reason if you want one). |
| Its outlier tab: MAD threshold 2.5; a flagged sample can be kept, averaged or removed. | Keep, or Exclude with an optional reason; Undo restores the sample. | BQC CoV stays a Canvas plot too ("Batch quality check"; it needs at least 2 BQC replicate samples). | The detailed QC plots stay one click away on the Canvas. |
| | Advisory: the Canvas opens either way. | "Average" as a decision is not offered here (question 3). | The hand-off says what was done while the board loads. |

### The paths, counted

| Path | Team today | Proposal |
|---|---|---|
| New data to the Canvas | Sign-in, then 4 screens: Choose how to begin, Add your abundance matrix, Add sample labels, Review your data. | Sign-in (password, then the code), then 3 screens and 3 clicks with Team's defaults: "Prepare", "Prepare and check", "Open the Canvas". |
| Continue a project | 1 click ("Open latest") for the first project by name; 2 for any other. | 1 click for any project: "Continue" or "Open". |
| Join a board someone prepared | No shared board: Team shares projects (owner, editor or read-only), and each person resumes a checkpoint in a session of their own. | 1 click ("Open"), or none from Admin's dataset link. No preparation, no quality check. |
| Decide on a flagged sample | Click its point on the Review PCA, or use the Quality Check tool's outlier tab. | Keep: 1 click. Exclude: 2 clicks. Or decide later: the flag travels to the Canvas. |
| Reset a password, activate an invitation | One folded form, 5 fields. | Its own short form, 3 fields. |

## 5. Cosmetic fixes

Every fix, named. Team's numbers were measured on its sign-in page (section 2.1), Nexo's are read from its stylesheets, and the proposal's were measured on the rendered prototype in all 16 states (section 8). The same list sits under each scene of the prototype.

### 5.1 Against what exists today

| # | Fix | Team today | Nexo today | Proposal |
|---|---|---|---|---|
| 1 | Type scale | The sign-in card mixes 30, 15, 14 and 13 px in two families (the heading is Cormorant Garamond). | One family, Nunito Sans; tokens 18 / 14 / 13 / 12 / 11 px (`frontends/nexo/src/tokens.css:34-52`). | Nexo's family and tokens plus one 24 px page title: 24 / 18 / 14 / 13 / 12 px. 11 px only in charts, on the role pill in the bar ("Lab", "Client") and on avatar initials (10 px where avatars stack). Two display sizes: the 40 px count in the preview and the 20 px code field. |
| 2 | Heading on a phone | Wraps to two lines at 390 px. | No sign-in page. | One line: the 24 px title scales down to 21.8 px at 390 px. |
| 3 | Card width | Card 620 px, fields 538 px. | Start card and Prepare dialog 560 px (`frontends/nexo/src/styles.css:1`, `frontends/nexo/src/ui/shell.css:627`). | Sign-in card 400 px with 32 px padding (24 px on a phone), join card 520 px; lists and forms on one white sheet with 32 px padding. |
| 4 | Text contrast | Sub-line 6.1:1, link 6.7:1, labels 7.6:1. | The tokens the proposal uses. | Ink 17.3:1, muted 8.2:1, accent 8.3:1 on white. Every text run is at least 4.5:1, and all but three dimmed labels are at least 7:1 (5.3). |
| 5 | Field borders | 1 px `rgb(203,213,225)`: 1.5:1 against white. | 1 px `--line-strong` (`#cfd6de`): 1.5:1 (`frontends/nexo/src/ui/shell.css:116`). | 1 px `#7d8a99`: 3.5:1. It is the only colour the proposal adds to Nexo's tokens. |
| 6 | Focus | A 3 px outline at 3 px offset plus a 3 px glow. | A 2 px accent outline at 0 offset on fields (`frontends/nexo/src/ui/shell.css:118`). | One 2 px ring at 2 px offset on every control: accent on white, white on the navy bar, where the accent would be 1.9:1. |
| 7 | Touch | Fields 44 px, button 47 px, input text 13 px. | Touch minimum 32 px (`frontends/nexo/src/ui/shell.css:104`). | On touch, fields and buttons are 44 px, small controls 40 px, the bar's buttons the full 48 px of the bar, and every text link has a 40 px high tap area. Input text is 16 px, so a phone does not zoom in when a field gets the focus. With a mouse: 40 px and 32 px. |
| 8 | Top bar | On the sign-in page a "Not signed in" button sits in the middle of the bar; at 390 px a "Toggle navigation" button has nothing to open. | An "LE" box for a logo; Data and Review are links to Team. | The lab logo; Help and the account right-aligned; Data, Review and Canvas name the screens of this proposal. |
| 9 | Copy: a rejected sign-in | 19 words. | No sign-in page. | 12 words: "Email or password is not right. Check both, or reset your password." Like Team's, it does not say which of the two was wrong. |
| 10 | Copy: settings | Plain labels, in two places. | The Prepare dialog shows the API's labels and raw values ("global", "group", "median", "pqn", "none"). | Words: "All selected samples", "At least one condition group", "Median (log scale)", "PQN (linear scale)", "None". |
| 11 | Illustration | On a phone the centre crop shows three small peaks and none of the lipid characters; with the long activation form open, the artwork ends three quarters of the way down the card. | None. | Fixed to the screen behind the card; on a phone cropped to the tall peaks where the characters stand; the static version under reduced motion; no text on the artwork, every word sits on white. |
| 12 | The one action | The step button, "Next →". | Two buttons at the dialog's foot, half cut off at 390 × 844. | One primary button per screen, in a bar that stays at the bottom of the screen at every width: "Prepare and check", then "Open the Canvas". |

### 5.2 Rules every screen follows

- **Spacing** in steps of 4 px: 8, 12, 16, 24 and 32 px between blocks. Off the step there are only 1 to 3 px optical nudges and 6 or 10 px inside chips, tags and icon gaps.
- **Alignment.** Sign-in: label, field and button share one left edge. Start: every row has the same three columns (name, status, action). Prepare: row titles in a 152 px column, so every control starts on one edge. Quality check: three equal cards on one grid. Phone: one column everywhere.
- **Placeholder text** is set to the muted token, 8.2:1 in both engines. Left to the browser it would be 4.6:1 in Chromium and 2.4:1 in WebKit.
- **Errors** sit next to the field and say what to do: "Select at least one sample.", "Use at least 12 characters.", "That code did not match. Codes change every 30 seconds: enter the newest one." An invalid field gets a 2 px red border, an icon and the sentence.
- **Colour is never the only signal.** Status is an icon and a word ("OK", "Look"); "New" is a tag with the word; the chosen option is filled and bold; the verdict is an icon, a title and a sentence (text 8.0:1 on amber, 7.2:1 on green).
- **Charts.** Two series colours, Control blue `#2a78d6` and Treated orange `#eb6834`, checked for colour-blind separation; gray for what is left out; an amber ring on the flagged sample. A legend above, direct labels only on the flagged sample and the worst bar, chart text in the ink and muted tokens, a tooltip on hover and on keyboard focus, and "Show as table" under every chart.
- **Changes from the defaults** are counted beside the action: "n changes from Team's defaults · Reset".
- **Loading** is a short list of what is done and what is running, not a bare spinner. Reduced motion stops the animation.

### 5.3 Measured on the prototype

All 16 states at both widths: 1401 distinct text runs at 1440 px and 1314 at 390 px, in one font family.

- **Sizes found:** 10, 11, 12, 13, 14, 18, 24 and 40 px, and the 21.8 px title at 390 px. Text typed into a field is 14 px with a mouse and 16 px on touch; the six digits of the code are 20 px on both.
- **Contrast of text in the product area:** at least 7:1, with one exception. The labels "Tidy up", "Undo" and "Redo" in the drawing of the Canvas are 4.6:1 while the board loads, dimmed because they cannot be used yet. White initials on a person's colour are 7.1:1 or more.
- **Chart marks against white:** blue 4.4:1, orange 3.2:1, amber ring 5.0:1. The gray of left-out lipids is 2.5:1 on purpose: the legend and the table say the same.
- **Control heights with a mouse:** fields and buttons 40 px; small buttons, segments and chips 32 px; slider and switch 24 px.
- **Control heights on touch:** fields and buttons 44 px; small buttons, segments, chips, slider, switch, links and folds 40 px; the bar's buttons 48 px.

## 6. What it takes to build in Nexo, by file

Nothing here is built. The list follows the code on this ref; "new" means a file or a route that does not exist yet.

### 6.1 Nexo's client (`frontends/nexo/src/`)

| File | Change |
|---|---|
| `main.tsx` | Today one component shows the `section.picker` card and mounts the board (`:103-108`). It gets three screens before the board: Start, Prepare, Quality check. The flow helpers stay: `datasetProject` (`:52`), `project` (`:62`), `requestDataset` (`:87`), `openDataset` (`:97`). A dataset whose project exists still skips Prepare (FIX-G12) and shows the join card while the board loads. |
| `ui/Dialogs/PrepareDatasetDialog.tsx` | The dialog (`:22-44`) becomes the Prepare page: the same fields with human labels, samples as chips by group, the preview panel, "More settings" folded, the action bar. |
| `ui/datasetPrepare.ts` | Reused as the page's state: `prepareState` (`:9`), `setSamples`, `setSample`, `setValue`, `settingsBody`, `canConfirm` (`:21-39`). New: the count of changes from the defaults. |
| New: Start, Prepare and Quality check components | Three small components and one plain-SVG chart helper. The prototype's charts are hand-written SVG, no library. |
| `ui/strings.ts` | The new copy; the words for raw values live here (`datasetStrings`, `:170-183`, grows). |
| `tokens.css`, `ui/shell.css` | One new token for the field border (`#7d8a99`), a 24 px title, controls 40 px high (44 px on touch; today's touch minimum is 32 px, `ui/shell.css:104`), the bottom action bar. |
| `ui/TopBar.tsx`, `ui/topBar.css` | The lab logo instead of the "LE" span (`:13`); Data and Review open these screens instead of linking to `/team/` (`:15`); the "Prepared by … · settings" chip. |
| `ui/Dialogs/DesignDialog.tsx` | Its two questions (experimental unit, sample relationship) also appear on the Prepare page as optional rows; the dialog stays for the Canvas. It knows two relationships today, independent and paired (`:34-41`); Team has a third, "Mixed or uncertain". |
| `api/datasetSession.ts`, `api/types.ts` | Types for the preview and the quality-check answers (6.2). |
| `api/adminToken.ts` | Unchanged if Admin keeps serving the sign-in page (question 1): `adminSignInUrl` (`:6`) already carries the return address. |
| `ui/uploadAccess.ts` | Unchanged: it already hides the checkpoint import from client members. |
| `public/` | The illustrations and the lab logo. Today the folder holds only `vendor`. |
| Tests | Next to each file, as today: `ui/datasetPrepare.test.ts`, `main.test.tsx`, `ui/TopBar.roles.test.tsx`, `api/datasetSession.test.ts`, `api/adminToken.test.ts`, `ui/uploadAccess.test.ts`. The browser journeys gain the three screens. |

### 6.2 Nexo's API (`frontends/nexo-api/datasets.R`), all additive

| Need | Today | Change |
|---|---|---|
| Samples by group | The 422 lists sample names only (`:85-92`). The Metadata sheet with the group terms is already read (`:46-66`). | Add each sample's group terms to the 422 answer. |
| The live preview ("74 of 76 lipids kept") | No route. The count is known only after the full preparation. | A preview route: samples and detection settings in, Team's own counts out, without opening a session. The client asks again when the slider stops. |
| The quality check | No summary. The Canvas offers the detailed plots. | After preparation, one answer: PC1 and PC2 scores, the samples flagged by Team's rule, per-sample medians after normalization, missing counts. All computed by Team's code: the client draws, it does not calculate. |
| Keep or Exclude | `samples` and the optional `outlierTreatments` exist (`:20`, `:93-107`). There is no field for a reason. | Exclude is a new preparation without that sample. The optional reason is stored with the project's settings. |
| Unit and relationship | Not part of the dataset preparation: the Canvas dialog asks them. | Sent with `confirmDesign`, as the Canvas dialog does today (`frontends/nexo/src/ui/Dialogs/DesignDialog.tsx:25`), right after the session opens. |
| Defaults | `teamControlDefault` says "drop never-detected lipids" off and "final zero" on (`:14`, `:18`). The published workspace has them on and off (`R/guided_preparation_controls.R:5`, `:24` in Team's source). | Decide which pair is Team's (question 2), then keep one source. |

### 6.3 The collab sidecar (`frontends/nexo-collab/src/projects.mjs`)

- **A list of the caller's projects.** Today a project is found only by its dataset (`GET /projects?dataset=<id>`, `:85-92`) or its id (`:93-96`). Start needs a list: each project's origin, who created it (`created_by` is stored, `:71`; today it surfaces only as the "owner" in the members answer, `:99-107`), when (`created_at`, `frontends/nexo-collab/migrations/001_init.sql:7`), and who is on the board now. Names come from the RPC the sidecar already calls, `admin.nexo_people` (`:34-39`).
- **"Prepared by … · settings"** needs no new storage: the settings are already in the document's `meta.origin.settings` (`:73-79`) and already travel with `GET /projects/<id>` (`:95-96`).
- **When the project is created.** The settings are written once, when the project is created (`:73-79`). With a quality check between preparation and the board, the project must be created when "Open the Canvas" is pressed, after the Keep or Exclude decision. If a colleague's project for the same dataset appears in the meantime, the first one wins as it does today (`:71`, `:84`): show the join card.

### 6.4 Admin (outside this repository)

- A list of the datasets released to the caller, for Start. Today Nexo learns of a dataset only from a `?dataset=` link.
- The sign-in page, or its look (question 1). Activation, password reset and authenticator set-up stay where the accounts live.

### 6.5 A possible order

1. **The look, with no backend change.** The start card and the Prepare dialog become pages: tokens, human labels, Team's defaults filled in, the bottom action bar, the illustrations. No preview yet.
2. **Groups and the live preview** (6.2, first two rows).
3. **The quality check** (6.2, rows three and four; 6.3, third point).
4. **The Start lists** (6.3, first point; 6.4, first point).
5. **Sign-in** (6.4, second point), once question 1 is answered.

## 7. Questions for Gerardo

1. **Who serves the sign-in page?** Nexo has none today: it sends people to Admin's page and comes back (`/admin/sign-in?next=…`). Admin owns the accounts, the cookie (scoped to `/admin`) and the authenticator code (`docs/integration/admin-identity.md:3`, `:12-19`). Either (a) Admin keeps serving the one sign-in page and takes this look, or (b) Nexo hosts this page and talks to Admin's GoTrue itself. The proposal recommends (a): one sign-in for both apps, and nothing about passwords or codes moves into Nexo. Either way: do activation, password reset and authenticator set-up stay in Admin, and does every account enter a code at each sign-in, as the prototype draws it?
2. **Which defaults are Team's?** The published workspace starts with "exclude never-detected lipids" on and "replace remaining missing values with zero" off. Nexo's API reports the opposite pair as Team's defaults (section 3). The prototype fills in the published workspace's. Which pair should Nexo prefill? And should the two zero rules ("For each file, set entirely missing lipids to zero", "Replace remaining missing values with zero") be shown at all? Team's workspace keeps them out of reach, at their defaults; Nexo's dialog asks them today.
3. **Does the quality check advise or block?** In the prototype the Canvas opens even while a flagged sample is undecided, and the flag travels to the Canvas. Should a flagged sample have to be decided first? Are these three checks the right ones, and is Keep / Exclude enough without Team's "Average"?
4. **Where do new data come from?** The proposal assumes every new dataset is released in Admin (plus the checkpoint import for lab staff). Team's matrix upload and label mapping are then not rebuilt in Nexo, and "Data" and "Review" in Nexo's bar become these screens instead of links to Team. Is that right?
5. **May a client member prepare a dataset?** The API has no staff check on preparation today (only uploads are for lab staff, `frontends/nexo-api/datasets.R:389-392`), and the prototype's Start for a client member shows "Prepare" on a released dataset that nobody has prepared. Or does only lab staff prepare, and a client member always joins?

### Gerardo's answers (2026-11-10)

1. **Sign-in: Nexo is a separate app on Admin's accounts.** Nexo has its own sign-in page (this design), with the same accounts and passwords as Admin: one password works in both. Signed in to Admin, opening Nexo signs you in directly (today's `GET /admin/api/session-token` already does this). Simplest build: Nexo's page sends email, password and code to a new same-origin Admin route that runs Admin's existing sign-in and sets Admin's cookie, so signing in to Nexo also signs you in to Admin and Nexo never stores or checks a password. Password reset and invitation activation stay on Admin's pages (they start from Admin's emails) and come back to Nexo. The code step shows only for accounts with two-step verification on, as Admin does today.
2. **Defaults: Team's published workspace** (Gerardo: "what you recommend"). Checked in Team's source: the guided workspace prefills "exclude entirely undetected lipids" on, "for each file, set entirely missing lipids to zero" on, "replace remaining missing values with zero" off (`R/guided_preparation_controls.R:5`, `:23-24`), and Team's preparation policy sets the first one on (`R/utils_preparation.R:8`). Nexo's API copied the Classic widget's values (`R/modules/2_qc_boxplot_module.R:73`, `:81`). Nexo prefills Team's pair; the two zero rules stay folded under "More settings", as Team folds them under "Advanced".
3. **The quality check warns, strongly, and never blocks.** A flagged sample gets a clear warning on the check and on the Canvas until someone keeps or excludes it; "Open the Canvas" always works.
4. **Data: Admin's datasets first, plus an Excel upload as Team has it today.** Start lists the datasets released in Admin; an extra dataset can still be uploaded from an Excel workbook the way Team does it (Team's formats and checks, Team's code).
5. **Who prepares: configurable per client, lab only by default.** Admin gets a per-client switch; when it is on, that client's members may prepare a released dataset and upload their own Excel. Off (the default), a client member only joins boards the lab prepared.

## 8. How it was checked, and limits

`prototype.html` was opened as a file with Playwright (the one in `tests/browser/ci`) in Chromium and WebKit, at 1440 × 900 and at 390 × 844 with touch.

| Check | What ran | Result |
|---|---|---|
| Every state renders | All 16 states, both engines, both widths: 64 renders. | No horizontal scroll (the page is never wider than the screen and no element sticks out sideways), no console error, no page error, no failed request. |
| The path works by clicking | One scripted walk, both engines, both widths: sign-in errors, the code step, a wrong code, Start, Prepare (slider, scope, no sample selected, Reset, More settings), the quality check (Exclude with and without a reason, Undo, Keep), the hand-off, the Canvas chip, signed out and back, reset, activation, the client member's join. | 57 checks per engine and width, 228 in all, all pass. |
| Without the web font | The same 64 renders with the font request refused. | The system font takes over: no horizontal scroll, and the only messages are the browser's about the refused font. |
| Keyboard | Enter and Space on "Keep", on "Exclude" and in the reason field, both engines; Tab on Start. | The decision is taken and the focus moves to "Open the Canvas" (10 checks pass); the 2 px focus ring shows. |
| Sizes, contrast, control heights | Read from the rendered page, all 16 states, both widths (Chromium). | Section 5.3. |
| Chart colours | The two series colours through a palette check for colour-blind separation (protanopia, deuteranopia, tritanopia). | All checks pass. |

The screenshots are Chromium's, the visible screen only (1440 × 900 and 390 × 844), with the reviewer bar. The sign-in ones are taken after the illustration's opening animation has settled.

**Limits**

- **Synthetic numbers.** The matrix is generated inside the file, and the counts ("74 of 76", the flag on Treated_3) come from a short re-write of Team's rules made for this prototype. In the product every count and every flag must come from Team's code (6.2).
- **The Canvas in scene 4 is a drawing.** Nexo's real Canvas is in `nexo-today-canvas-1440.png`.
- **Team was not seen signed in.** Its sign-in page was measured on the staging twin; every later step is described from the published source and was not seen running.
- **Admin's sign-in page was not seen.** Its source is not in this repository; what this document says about it comes from `docs/integration/admin-identity.md`, which names "email + password, TOTP". The six digits and the 30 seconds in the prototype are the usual TOTP values, not read from Admin.
- **Nexo today** was captured from its mock build with demo data, not from a deployment.
- **The font** comes from Google Fonts, as in Nexo. Without a network the page uses the system font and the browser logs the refused request.
- **Not checked:** Firefox; a real phone (the 390 px runs are emulated); a screen reader (the fields have labels, the messages and the loading card are announced regions, but none was run).
