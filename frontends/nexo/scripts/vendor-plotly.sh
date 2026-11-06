#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
source_file="${NEXO_PLOTLY_JS:-}"
if [ -z "$source_file" ] && command -v Rscript >/dev/null 2>&1; then
  source_file="$(Rscript -e 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js", package="plotly"))')"
fi
if [ -z "$source_file" ] || [ ! -f "$source_file" ]; then
  echo 'ERROR: Plotly not found. Set NEXO_PLOTLY_JS to plotly.min.js or install the R plotly package.' >&2
  exit 1
fi
mkdir -p public/vendor
cp "$source_file" public/vendor/plotly.min.js
