# Cold open: cards in view

Measured on the RTX API with the pilot checkpoint (private; numbers only), Mac Chromium 1440x900, render cache cleared and
API restarted before each cold run.

| | before (756a261) | after |
|---|---|---|
| POST /sessions | 9.7 s | 9.7 s (next step) |
| first card on screen | 11.7 s | 11.6–11.7 s |
| every card in view drawn | 50.7–51.4 s | 28.5–28.6 s |
| last off-screen prefetch | 52.6–53.9 s | 53.1 s |
| warm open, all drawn | 5.7–5.9 s | 6.0 s |

Cause: Plotly cards in view but frozen by the live cap (4) drew off screen through a one-at-a-time chain that also
held their API request, so each card asked for its figure only after the previous snapshot. The request queue was
empty between them and dispatched off-screen prefetch (LOW) in each gap; one hidden card took 11.5 s on the server.
The two dashboard plots in view were requested at 44 s and 47 s. Fix: `offscreenSnapshot` starts `fetchFigure()`
before entering the chain (requests are cached by key); only Plotly's off-screen drawing stays serial.

Test: `test_nexo_perf.cjs` "cold open" step, mock at 800 ms a request: red 6 of 10 cards in view had asked after
1.5 s (red-perf.txt), green 10 of 10 in Chromium and WebKit (green-perf.txt).

## Both fixes deployed (af072c7, client + API)

| | before (756a261) | af072c7 |
|---|---|---|
| POST /sessions | 9.7 s | 5.8 s |
| first card on screen | 11.7 s | 8.2–8.3 s |
| every card in view drawn | 50.7–51.4 s | 25.7–26.0 s |
| warm open, cards in view drawn | 5.5–5.6 s | 4.6 s |

Two cold runs and one warm run, 23 of 24 cards rendered, 0 failed. The API side is in r-lazy-open.txt.
Left on the table: between the session and the first render the client asks for the catalog twice and for the
cohort and checkpoint list in series (about 1.6 s); the cards in view still render one by one on the single R
process (about 17 s).

## Fewer requests before the first card

The catalog was asked twice at open (canvas and library), and the renders waited for the second answer; the cohort
went ahead of the renders. Now the catalog is asked once (a copy per caller) and the cohort is background work: after
the cards in view, before prefetch, never paused (phones keep it). The checkpoint list stays first because it names
the project in the top bar. Tests: src/coldOpen.test.ts, red (queue served the panel before the render; fetch called
twice), green 2/2; vitest 95 files / 424 tests.

| on the af072c7 API | before | after |
|---|---|---|
| first card on screen | 8.2–8.3 s | 7.1–7.2 s |
| every card in view drawn | 25.7–26.0 s | 24.5 s |
