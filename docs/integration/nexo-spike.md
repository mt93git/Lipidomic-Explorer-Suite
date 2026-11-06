# Nexo spike

For Paula, Steph and Max. Nexo is a read-only TypeScript canvas that opens a Team
checkpoint ZIP. A tiny R Plumber API draws the dashboard plots using the existing
test harness. It runs beside Team on the RTX.

There is no editing, no auth of its own and no Supabase. Nexo is not a replacement
for Team. nginx basic auth protects both the static canvas and the API.

The spike adds files and changes zero existing files. `R/modules`, Classic and
Team stay untouched. The API sources `R/global.R` in team mode, like
`tests/dual-ui/test_cross_zip.R`, and reuses the headless harness.

Architecture (five lines):

```text
Browser → nginx on 127.0.0.1:3880
nginx server basic auth → both Nexo routes
/nexo/ → static files in /srv/nexo/dist/
/api/ → Plumber on 127.0.0.1:3960 → existing R test harness
Production Team → unchanged on 127.0.0.1:3952
```

Run on the RTX. The checkout must include the API, frontend and npm lockfile.
The `nexo-api` R environment, Node/npm, rsync and a systemd user session must exist.
Checkpoint ZIPs belong in `/home/gjb47/nexo-storage`; do not commit study data.

```bash
cd /home/gjb47/nexo-spike
bash OS/Linux/deploy-nexo.sh
```

The script vendors Plotly from the R environment, builds and copies the canvas,
installs the user unit, starts or restarts it, and waits up to 60 seconds for health.
It prints the nginx backup, snippet placement and validation/reload steps. Run
those printed steps manually to expose the routes. They keep server basic auth.
The script also prints the production Team HTTP status and requires 200.

```bash
systemctl --user start lipidomic-api
systemctl --user stop lipidomic-api
systemctl --user status lipidomic-api
journalctl --user -u lipidomic-api -n 50 --no-pager
curl -fsS http://127.0.0.1:3960/api/v1/health
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3952/
```

Stopping the API leaves the static files served by nginx. Use `/nexo/` through the
existing authenticated nginx access path to try a checkpoint.

## Tests

| id | file | asserts |
|---|---|---|
| U1 | `tests/dual-ui/test_api_engine.R` | synthetic ZIP → `nrow(data_processed) == 12`, `ncol == 9`; legacy defaults path does not error |
| U2 | same file | 5 ids return `data[[1]]$type` and `layout`; invalid `violin_lipid` → `api_unprocessable` |
| U3 | `frontends/nexo/src/tiers.test.ts` (vitest) | `tier()` → live/frozen/culled in 6 cases |
| I1 | `tests/dual-ui/test_api_http.R` | `callr::r_bg` runs `run.R` on a free port; health 200, sessions 200, pca 200, unknown session 404 |
| I2 | `tests/dual-ui/test_api_parity.R` | API traces (`type,name,x,y`) identical to `fixture_team_canvas_dashboard_payload.R` on the same hub |
| E1 | `tests/dual-ui/test_nexo_canvas_readonly.cjs` | Playwright Chromium+WebKit: cards = nodes, live cards have traces, 25 % zoom → img, offscreen → empty, inspector opens, 0 console errors |
| E2 | manual on the RTX | Paula checkpoint, `/team/` still 200 |

## Evidence

- Commit SHA: <pending>
- Test outputs: <pending>
- Screenshots folder: `docs/integration/nexo-spike-evidence/` <pending>
