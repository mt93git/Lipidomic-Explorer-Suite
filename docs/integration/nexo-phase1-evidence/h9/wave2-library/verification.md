# Nexo wave 2, part 1 — library and canvas

Implementation branch: `router/20261107-075604-b8670a`.
Base / last available commit: `e67614b3c6e47ee233a60af9d1dc3b2745f7be62`.

All five requested steps were implemented in order. Staging/commit attempts after the test additions and each implementation step were blocked by read-only Git metadata:

```text
fatal: Unable to create '.../.git/worktrees/router-20261107-075604-b8670a/index.lock': Read-only file system
```

Fabric must commit the worktree. No branch change, push, PR, live API, dependency changes, or changes to science/Team schemas were made.

## Test-first evidence

Tests were added and run before their implementations. Browser-only assertions were written before the corresponding UI changes, but could not execute here.

| Step | Red output before implementation | Green unit run after implementation |
| --- | --- | --- |
| 1. Shortcuts and automatic minimap | `expected null to be 'selection'`; missing `./minimap`; 1 failed / 4 passed plus 1 failed import suite | 77 files, 344 tests passed |
| 2. Family chips and search | Family filtering returned both families: 1 failed / 10 passed | 77 files, 346 tests passed |
| 3. Queued drops | Missing `./drop`; queue insert received no position: 1 failed / 2 passed plus 1 failed import suite | 78 files, 348 tests passed |
| 4. Empty-tab suggestions | New browser assertions added first; not run: sandbox | 78 files, 348 tests passed |
| 5. Final-view reveal | `revealAddedCamera is not a function`: 2 failed / 6 passed | 78 files, 350 tests passed |

Those intermediate complete runs excluded `src/illustrations/assets.test.ts` after the unfiltered run stalled in its existing Python subprocess test (`every asset parses as XML with an SVG root`). The other three tests in that file were subsequently run successfully. No existing test source was changed to bypass that limitation.

Final verification:

```text
npx vitest run --maxWorkers=2 -t '^(?!.*every asset parses as XML)'
Test Files  79 passed (79)
Tests       353 passed | 1 skipped (354)

npx tsc --noEmit -p .
exit 0

node --check tests/dual-ui/test_nexo_library.cjs
exit 0

git diff --check
exit 0
```

The skipped test is the single Python subprocess test above. `tokens.test.ts` and the checkpoint/Team compatibility tests passed.

## Browser verification pending

Invoked with `NEXO_PLOTLY_JS="$PWD/frontends/nexo/public/vendor/plotly.min.js"`:

- `test_nexo_library.cjs`: **not run: sandbox**, localhost listen returned `EPERM`.
- `test_nexo_canvas_open.cjs`: **not run: sandbox**, localhost listen returned `EPERM`.
- `test_nexo_canvas_edit.cjs`: **not run: sandbox**, localhost listen returned `EPERM`.

The provided `~/nexo-vendor/` directory is also absent in this environment. The suites stopped at their localhost probe before building. No browser screenshots or spike-evidence files were changed.

The new suite uses the existing mock-build harness and covers both Chromium and WebKit: L and / focus search; Escape clears/closes; minimap automatic/pinned/corner visibility; Shift+2 and the shortcuts dialog; family chips, cross-family search, sticky headers and Clear; panel axe including AAA contrast; native dragging with a world-space ghost and a 20 px coordinate tolerance; all three empty-tab suggestions; and full card visibility with library plus inspector at 1440 and 1024 px.

## Implementation details relevant to review

- The minimap retains Nexo v0's corner, camera range and gestures. Pin state is transient UI state.
- Search starts across all families; selecting a family intersects it with the query. Clear resets both.
- A plot drag captures client-to-world coordinates before queuing. Queued completion keeps an independent copy and bypasses automatic placement for that drop; positions respect Team's existing 0–1,000,000 bounds.
- Adding explicitly opens the inspector, then waits two animation frames before measuring `freeView()`. The reveal pans and, only when needed, zooms out to fit beside both panels, keeping Nexo's 10% floor.
- Empty-tab suggestions use the same queued add path and are absent in view-only mode. Only controls intercept pointer events over the empty state.

Remaining coordinator work: run the three browser suites (including axe and native drag/drop), rerun the Python subprocess test outside this sandbox, and commit the worktree.
