---
name: nexo-local-dev
description: Start the Nexo R API and the Nexo TypeScript client locally on synthetic checkpoints, start Admin locally on its example data, and run the Nexo and Admin checks (vitest, tsc, build, R test_api_*.R). Use when the user wants to run, try or test Nexo on her machine, or asks to "start Nexo locally" or "run the tests".
---

# Nexo local dev (synthetic data only)

Local Nexo only ever uses the synthetic checkpoints in `tests/dual-ui/fixtures/`. Never point it at the lab server, never copy real study ZIPs or workbooks into the checkpoint folder, and never put real data in the repo. Real analysis happens in the hosted Nexo.

On Windows, Claude Code's Bash tool is Git Bash, so the commands below use bash syntax. Run them from the repository root unless a step says otherwise. Start the API and the client with `run_in_background`, because both keep running.

## 0. Preconditions (check, don't install silently)
- `node -v` should print v22 (the repo pins 22.23.2 in `frontends/nexo-collab/.node-version`; `tests/browser/ci/README.md` asks for Node 22).
- `command -v Rscript`. If it is missing, ask the user for the R bin path (for example `/c/Program Files/R/R-4.4.3/bin`) and prepend it to PATH for this shell.
- `frontends/nexo/node_modules` exists. If not, run `cd frontends/nexo && npm ci`.
- `frontends/nexo/public/vendor/plotly.min.js` exists. If not, run `cd frontends/nexo && sh scripts/vendor-plotly.sh && sh scripts/vendor-visnetwork.sh`.
- `Rscript --vanilla` skips `.Rprofile`, so it does not see the sandbox library that `00_ENVIRONMENT_SETUP.R` installs into. Export it first:
  `export R_LIBS_USER="$LOCALAPPDATA/LipidomicExplorer_R_Library/4.4"` (the path comes from `.Rprofile`; adjust 4.4 to the installed R major.minor).
- If a test prints `SKIP ... package X not installed`, report it. Install only after the user says yes, in the same library: `plumber`, `callr`, `png` and `svglite` are the packages outside DESCRIPTION.

## 1. API (R, port 3960)
```bash
mkdir -p "$HOME/nexo-local/checkpoints"
cp tests/dual-ui/fixtures/nexo-complete-synthetic.zip tests/dual-ui/fixtures/classic-seed7-synthetic.zip "$HOME/nexo-local/checkpoints/"
LIPIDOMIC_API_CHECKPOINT_DIR="$HOME/nexo-local/checkpoints" LIPIDOMIC_API_PORT=3960 \
  Rscript --vanilla frontends/nexo-api/run.R        # background
curl -s http://127.0.0.1:3960/api/v1/health          # ready when this answers (catalog warm-up takes a few seconds)
```
The API lists every `.zip` in `LIPIDOMIC_API_CHECKPOINT_DIR` by file name, so the checkpoint id is `nexo-complete-synthetic`. It saves into the same folder.

## 2. Client (Vite on :5180, proxies /api to the API)
```bash
cd frontends/nexo
NEXO_AUDIT_API=http://127.0.0.1:3960 npx vite --config ../../tests/dual-ui/chart-audit/vite.audit.config.mjs   # background
```
Open `http://127.0.0.1:5180/nexo/?checkpoint=nexo-complete-synthetic`. Don't use `npm run dev` with `VITE_API_BASE` pointing at :3960. The API sends no CORS headers, so the proxy config is the working path.

UI-only work without R: `cd frontends/nexo && VITE_API_MOCK=1 npm run dev`, then open `http://localhost:5173/nexo/` (if 5173 is busy, Vite takes the next port: open the address it prints).

## 3. Checks
```bash
cd frontends/nexo && npx vitest run && npx tsc --noEmit && npm run build
npx vitest run src/editor/teamPresentation.test.ts        # one file
cd ../.. && Rscript --vanilla tests/dual-ui/test_api_<name>.R   # from the repo root
for f in tests/dual-ui/test_api_*.R; do echo "== $f"; Rscript --vanilla "$f" || echo "FAIL $f"; done
```
- `test_api_stress.R` and the timing part of `test_api_cache.R` SKIP unless `NEXO_API_PERF=1`.
- `test_api_dataset_http.R` can fail under heavy parallel load. Re-run it alone.
- Browser suites (`node tests/dual-ui/test_nexo_*.cjs`, which need `cd tests/browser/ci && npm ci && npx playwright install chromium` first) call `npm` and `sh` through `spawnSync` without a shell. They likely fail on native Windows. If they do, say so and leave them for the maintainer's Linux run. Do not patch the harness.
- If `test_nexo_canvas_readonly.cjs` ran, restore its evidence PNGs: `git checkout -- docs/integration/nexo-spike-evidence/`.

## 4. Admin locally (example data, no database)
```bash
cd packages/admin-ingest && npm ci && npm run build && cd ../..
cd frontends/admin && npm ci
npm run dev                      # background; open http://localhost:3000/admin
npx tsc --noEmit && npx vitest run
```
Without Supabase settings Admin runs on its built-in example data and a demo identity: **Enter example workspace** on the sign-in page, and **Lab staff | Client** in the top bar switches the view. Nothing is written to a database. Never point a local Admin at the lab's real database.

## 5. Report
List each command with PASS, FAIL or SKIP counts. Paste the first error lines of any failure. Stop the background API and Vite when done.
