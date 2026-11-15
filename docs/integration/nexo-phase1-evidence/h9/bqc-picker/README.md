# BQC samples picker (H9 fix)

Found by the coordinator's pilot user on a real checkpoint with 66 long sample ids: the computed "BQC samples"
panel laid ids out in 88 px grid columns without clipping, so names were drawn over the next column's checkboxes,
and the selection count wrapped. The mock served 12 three-character ids (`S01`..`S12`), so every audit capture and
browser suite looked right.

Fix: the mock now serves 66 long synthetic ids; the panel uses the inspector's `SearchablePicker` (filter, All/None,
one clipped row per sample with a tooltip, live "N of M samples selected"); picks keep the sample order.

| File | What |
|---|---|
| `red-bqc.txt` | `test_nexo_inspector.cjs` fails: every sample name overflows its row |
| `green-bqc.txt` | inspector 40, access 54, analysis_settings 6 PASS; vitest 461; tsc clean |
| `bqc-picker-1440.png`, `bqc-picker-1024.png` | the panel on the mock build, two samples picked |
