# Nexo v0
Read-only checkpoint canvas; library additions are temporary and never saved.
Run `npm install`.
Run `NEXO_PLOTLY_JS=~/nexo-vendor/plotly.min.js scripts/vendor-plotly.sh` (or use R plotly).
Run `VITE_API_MOCK=1 npm run dev`, then open `/nexo/?checkpoint=demo`.
For real sessions set `VITE_API_BASE` (default `/api/v1`); omit `VITE_API_MOCK`.
Run `npm test`, `npm run build`, and `npm run preview`.
Wheel pans; Ctrl/Command-wheel or pinch zooms; Space-drag or Pan mode pans.
Click/Shift-click or drag empty space to select; minimap recentres; Fit shows all.
Inspector is read-only; plot downloads/copy require a loaded live figure.
