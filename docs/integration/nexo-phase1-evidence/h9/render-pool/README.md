# Render pool (H9): K R worker processes draw cards in parallel

`R/frontends/api/pool.R`. With `LIPIDOMIC_API_WORKERS=K` (default 0, off; the RTX unit sets 3) the API
starts K `callr::r_session` workers. When a session opens, each worker opens the same checkpoint. A card
whose render-disk descriptor exists (Plotly or PNG, not acted, not a fixed copy) is drawn by a worker:
it aligns the session-level state in the disk-cache key (targeted cohort, study design, shared analysis
settings), checks it matches, and draws with the same engine and Team's own code. The render route
answers through a promise, so the engine lock stays free for other requests. The main process keeps its
provenance and stores the answer in both caches. No worker able to take the job: the main process draws.

## Fidelity (spike, RTX)

| Comparison | Synthetic fixture (9 cards) | Pilot checkpoint (12 cards) |
|---|---|---|
| main vs main (same card twice) | 7 of 9 identical | 9 of 12 identical |
| main vs worker | 7 of 9 identical | 7 of 12 identical |

The cards that differ main-vs-main are ggrepel PNGs (labels placed with `seed = NA`, as in Team). The two
extra main-vs-worker differences on the pilot checkpoint are Plotly coordinates that differ by at most
7e-15 (floating-point rounding in the last bit); locale, libraries, RNG kind and BLAS are identical in
both processes. `test_api_pool.R` asserts PNG bytes and Plotly traces to 1e-9.

## Speed (server side, pilot checkpoint, 21 saved cards, private API instance, cold render cache)

The client is simulated with C = 1 + K requests in flight. Two back-to-back runs each:

| | K = 0 (today) | K = 3 |
|---|---|---|
| POST /sessions | 5.6 / 5.8 s | 6.2 / 6.5 s |
| first card | 8.2 / 8.4 s | 7.5 / 7.6 s |
| half of the cards (about the cards in view) | 35.8 / 36.7 s | 14.7 / 15.1 s |
| all 21 cards | 52.0 / 53.1 s | 23.3 / 23.3 s |

Memory: about 650 MB per worker after opening the pilot checkpoint; a worker above
`LIPIDOMIC_API_WORKER_RSS_MB` (1500) after a job is restarted. The unit's `MemoryMax` is 8G.
A variant that opened the workers only after the main open (and let the main process draw meanwhile)
was slower (half of the cards at 35.2 s) and was dropped.

## Tests

- `red-pool.txt`: `test_api_pool.R` on the base tree (no pool).
- `green-pool.txt`: 8 checks + final PASS, including two renders over HTTP through promises.
- `green-r-battery.txt`: the 25 API R tests on the RTX, render-all 44/7/7/0 of 58 unchanged.

## Deployed (RTX, 5d441a7, three workers): the browser

Same script and fields as `../cold-open/README.md` (pilot checkpoint, 24 cards, prefetch on, render cache
cleared and the API restarted before each cold run, workers ready). Two cold and two warm runs:

| | 24092b4 (one R process) | 5d441a7 (three workers) |
|---|---|---|
| first card on screen | 7.1–7.2 s | 7.2–7.4 s |
| every card in view drawn | 24.5 s | 17.9–18.0 s |
| all 23 card renders received | about 53 s | 29.3–29.4 s |
| warm open, cards in view drawn | 4.6 s | 2.8–3.1 s |

23 of 24 cards rendered, 0 failed (the 24th needs a confirmed study design, as before). The request
timeline shows four renders in flight from the first card on. Requests that are not card renders still run
alone and drain the renders in flight first: the two dashboard copies of Nexo v0 (`/plots/results_dashboard/…`)
and the cohort, which cost about 4 s of idle workers at about 13 s.

Memory after the runs: main process 880 MB (it no longer builds the modules of cards the workers draw;
1.3 GB before), workers 740–910 MB, about 3.4 GB in all against `MemoryMax=8G`. Production Team (:3952)
answered 200 throughout; `/nexo/` and `/api/` answer 401 without credentials.

## Shared reads (508abc8, deployed)

The two Nexo v0 dashboard copies and the cohort read now share the queue with card renders (Fabric 4ca0,
`src/requestConcurrency.test.ts` red then green); writes stay exclusive. The timeline no longer shows the
renders draining before them: they run beside the renders from about 15 s on. Same script, two cold and two
warm runs:

| | 5d441a7 | 508abc8 |
|---|---|---|
| first card on screen | 7.2–7.4 s | 7.7–8.2 s |
| every card in view drawn | 17.9–18.0 s | 16.6–17.9 s |
| all 23 card renders received | 29.3–29.4 s | 28.0 s |
| warm open, cards in view drawn | 2.8–3.1 s | 3.0–3.5 s |

The gain is within the run-to-run spread of a shared machine (POST /sessions took 8.4 s in the timeline run,
5.6–6.5 s earlier; the client change does not touch the open). The longest single request is one card of
about 13 s drawn after the cards in view; it sets `lastAt`.
