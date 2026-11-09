# Nexo hand-off: three stacked PRs

This replaces the old eight-PR plan. The package is built from `nexo/phase1` on `max/integration-60cd4538`, the local reference to `integration/libreros-guided-workflow`. It has more than 2,400 new files and no path collisions with that branch. The proposed stack is:

1. `candidate/nexo-api` on `max/integration-60cd4538`.
2. `candidate/nexo-frontend` on `candidate/nexo-api`.
3. `candidate/nexo-docs` on `candidate/nexo-frontend`.

Nexo is a headless R API that runs Team's Shiny modules under `shiny::MockShinySession`, and a TypeScript canvas. Each PR adds files only. It does not change Classic, Team or the science modules. Check each base and tip, and the full stack:

```sh
git diff --name-only --diff-filter=MDR <base> <tip>
git diff --name-only <base> <tip> -- R/modules R/server.R R/global.R R/ui.R R/frontends/team R/frontends/classic www DESCRIPTION
```

Both commands must print nothing. Binary captures (1,553 PNG, PDF and SVG evidence files; about 180 MB) are excluded and listed in `docs/integration/nexo-phase1-evidence/captures-not-included.txt`; they stay on the Nexo working branch. Text evidence is included, with local paths and host names replaced by `<repo>`, `<home>`, `<server-home>`, `<server>` or `<tmp>`. Team and module behaviours found along the way are in `nexo-team-bug-proposals.md`, for Max to decide; the stack does not change them.

## Checks and results

On Max's tree plus Nexo, the API suites went from 25 PASS / 23 FAIL / 1 SKIP before the port to 49 PASS / 1 SKIP / 0 FAIL after it. Before the port, the catalog could not find `qc_pca_tab-guided_qc_plot`, which is defined in `R/frontends/team/qc-server.R` on his tree. The remaining SKIP, `test_api_render_disk_cache`, needs a git checkout. At the production close (`ebee653` plus Nexo), the result was 48 PASS / 1 SKIP / 0 FAIL.

On Max's tree, `render_all` produced 58 rendered / 0 gated / 0 silent / 0 failed out of 58 on the complete synthetic fixture. On the classic fixture it produced 44 / 9 / 5 / 0. Production's classic result was 44 / 7 / 7 / 0. The difference is that his Team gates the two editable-vector PCA views with its own smart-label message.

The Figure 1 pilot against a live API on Max's tree passed 25/25 in Chromium and 25/25 in WebKit. `pilot_team_roundtrip.R` passed 8/8 in both engines using his Team. These results use synthetic data. Real-user confirmation remains open.

His CI's `DESCRIPTION` does not include `plumber`, `callr`, `png` or `svglite`. Tests that need missing dependencies print SKIP and exit 0; the other tests run. `tests/dual-ui/test_api_dependency_guards.R` enforces this behavior. Vitest and the `.cjs` browser suites run on the server or a Mac with Node and Playwright; they do not run in his CI. The proposed addition `Suggests: plumber, callr, httr` is not included; Max decides whether to add it.

The Admin identity work is in this branch. Server-side store scope is enabled by `LIPIDOMIC_ADMIN_REQUIRE_USER=1` and is off by default. See `admin-identity.md` and `nexo-store-scope.md` for the contract and rollout limits.

Proposed agreement: use one reference tree. Production on RTX still runs the adapter architecture. Each divergence requires another Nexo port.

## PR 1: `candidate/nexo-api`

### Description

Add the headless API in `R/frontends/api/`, 51 `tests/dual-ui/test_api_*.R` files including the dependency guards, Nexo fixtures in `tests/dual-ui/fixtures/`, and the OS/Linux deploy kit. The API runs Team's modules in mock Shiny sessions. It includes the Admin identity and store-scope work described above.

### Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [x] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

### Verification Checklist

- [x] The automated AST syntax audit passes (`Rscript -e "parse('...')"` on new R files). All 74 new R files parse.
- [x] Session roundtrip persistence has been validated (Export/Import of a test session works). The synthetic Team round trip passed on Max's tree.
- [ ] The change matches the WYSIWYG plot layouts sizing protocol (if applicable). Not verified as a separate protocol check.

**Depends on:** `max/integration-60cd4538`.

**How to test:** Run the scope commands above against the PR base and tip. Parse each new R file with `Rscript -e "parse('...')"`. Run `tests/dual-ui/test_api_*.R` with `Rscript`; inspect SKIPs and run with the optional dependencies installed for full coverage. Run `tests/dual-ui/pilot/pilot_team_roundtrip.R` on a synthetic checkpoint.

## PR 2: `candidate/nexo-frontend`

### Description

Add the TypeScript canvas in `frontends/nexo/`, `tests/dual-ui/test_nexo_*.cjs`, and the pilot, chart-audit and performance suites under `tests/dual-ui/`. The canvas uses the API from PR 1.

### Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [x] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

### Verification Checklist

- [x] The automated AST syntax audit passes (`Rscript -e "parse('...')"` on new R files). The one new R file, `tests/dual-ui/pilot/pilot_team_roundtrip.R`, parses.
- [x] Session roundtrip persistence has been validated (Export/Import of a test session works). The synthetic pilot and Team round trip passed in both engines on Max's tree.
- [ ] The change matches the WYSIWYG plot layouts sizing protocol (if applicable). Not verified as a separate protocol check.

**Depends on:** `candidate/nexo-api`.

**How to test:** Run the scope commands against the PR base and tip. In `frontends/nexo`, install the project's dependencies and run `npm test` and `npm run build`. With Node, Playwright and a running API, run the `.cjs` browser suites and `tests/dual-ui/pilot/pilot_figure1.cjs` in Chromium and WebKit. Use the synthetic fixtures.

## PR 3: `candidate/nexo-docs`

### Description

Add `docs/integration/nexo*`, `docs/integration/chart-audit/`, `docs/integration/team-inventory/`, `docs/integration/admin-*.md` and `docs/nexo/`. Text evidence is included; binary captures are excluded.

### Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [x] Documentation update

### Verification Checklist

- [x] The automated AST syntax audit passes (`Rscript -e "parse('...')"` on modified files). The four R probe scripts kept as evidence parse; they are not tests and `run_acceptance.R` does not run them.
- [ ] Session roundtrip persistence has been validated (Export/Import of a test session works). No session behavior changes in this PR; not applicable.
- [ ] The change matches the WYSIWYG plot layouts sizing protocol (if applicable). No plot layout changes in this PR; not applicable.

**Depends on:** `candidate/nexo-frontend`.

**How to test:** Run the scope commands against the PR base and tip. Review the documentation and text evidence, including the Admin identity switch and its limits. Check that binary captures and local identifying paths are absent.
