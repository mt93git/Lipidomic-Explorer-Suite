# Nexo

Nexo is the canvas of the Lipidomic Explorer: a TypeScript app (Vite, React panels around an imperative TypeScript canvas) that follows the Team canvas closely, with a cleaner finish. It opens a checkpoint, lays its plots and illustrations out on canvas tabs (the Draft), lets you edit them in the inspector, finish them onto the Figure page and export plots, plot data and the figure page.

- `src/canvas.ts`, `src/cards.ts`, `src/tiers.ts`: the canvas engine (camera, cards, live/frozen/culled tiers).
- `src/state/`: document, history, tabs, autosave and the view-only decision.
- `src/ui/`: the shell (top bar, rail, library, tabs, toolbar, status band, inspector, dialogs, Figure page panel, toasts). All shell text lives in `src/ui/strings.ts`.
- `src/figure/`: Figure page model, layout and export.
- `src/mock/`: the mock API used in development and in the browser suites.

## Develop with the mock

```sh
cd frontends/nexo
npm ci
NEXO_PLOTLY_JS=/path/to/plotly.min.js sh scripts/vendor-plotly.sh   # once: copies Plotly to public/vendor/
VITE_API_MOCK=1 npm run dev
```

The mock serves sample checkpoints and plots from `src/mock/`; nothing is sent to a server. Without `NEXO_PLOTLY_JS`, `vendor-plotly.sh` takes Plotly from the R `plotly` package when `Rscript` is available.

## Use the real API

Without `VITE_API_MOCK`, Nexo calls the Lipidomic Explorer API at `/api/v1` on the same origin. Point it elsewhere with `VITE_API_BASE`:

```sh
VITE_API_BASE=http://127.0.0.1:8000/api/v1 npm run dev
```

## Open an Admin dataset

`?dataset=<admin.dataset.id>` (Admin's **Open in Nexo** link on a released dataset) asks the API for the choices Team needs (`POST /api/v1/datasets/sessions`, 422 `preparation_choices_required`), shows them in the **Prepare dataset** dialog (every sample ticked, Team's defaults prefilled) and, once confirmed, opens the prepared session exactly as it opens a checkpoint, titled `ORD041 · v1`. Cancel opens nothing. The mock serves one released dataset (`src/mock/dataset.ts`). Contract: `docs/integration/admin-nexo-open.md`.

Each open goes as the signed-in Admin user (`docs/integration/admin-identity.md`): Nexo first asks Admin for the session token (`GET /admin/api/session-token` with same-origin credentials; another URL with `VITE_ADMIN_TOKEN_URL`), keeps it until 60 s before `expiresAt` and sends it as `Authorization: Bearer` on `POST /datasets/sessions`. A 401 from Admin or the API shows **Sign in to Admin**, linking to `/admin/sign-in?next=<this page>`, and retries nothing; a 403 or network error on the token call opens without a token and the API decides. The mock answers the token route itself (`src/mock/adminToken.ts`): signed in, or signed out when `sessionStorage['nexo-mock-admin']` is `signed-out`.

## View-only mode

Phones (coarse pointer, narrow screen) open Nexo view only, `?mode=view` forces it on any device and `?mode=edit` turns it off. View only keeps viewing, panning, zooming, the inspector (read only), exports and help; it hides editing and saving, sends no autosave or checkpoint requests, and opens the canvas fitted to its content.

## Tests

```sh
cd frontends/nexo
npx vitest run        # unit tests
npx tsc --noEmit      # types
```

Browser suites (Chromium and WebKit, mock build) live in `tests/dual-ui/test_nexo_*.cjs`. Each builds Nexo with `VITE_API_MOCK=1`, serves it with `vite preview` and drives it with Playwright from `tests/browser/ci` (run `npm ci` there once). From the repository root:

```sh
export NEXO_PLOTLY_JS=/path/to/plotly.min.js
node tests/dual-ui/test_nexo_access.cjs
node tests/dual-ui/test_nexo_export.cjs
node tests/dual-ui/test_nexo_dataset.cjs
```

`NEXO_BROWSERS=chromium` limits a run to one browser. `test_nexo_canvas_readonly.cjs` rewrites the evidence PNGs under `docs/integration/nexo-spike-evidence/`; restore them with `git checkout -- docs/integration/nexo-spike-evidence/` before committing.

## Deploy

Deployment runs on the server with `OS/Linux/deploy-nexo.sh`, which builds this folder and installs it behind the Lipidomic Explorer.
