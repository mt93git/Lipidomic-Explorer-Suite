#!/bin/sh
# Team's own vis-network build (the R visNetwork package's htmlwidgets/lib/vis), for the pathway network card.
set -eu
cd "$(dirname "$0")/.."
source_dir="${NEXO_VISNETWORK_DIR:-}"
if [ -z "$source_dir" ] && command -v Rscript >/dev/null 2>&1; then
  source_dir="$(Rscript -e 'cat(system.file("htmlwidgets/lib/vis", package="visNetwork"))' 2>/dev/null | tail -1)"
fi
if [ -z "$source_dir" ] || [ ! -f "$source_dir/vis-network.min.js" ]; then
  if [ -f public/vendor/vis-network.min.js ]; then exit 0; fi
  echo 'WARNING: vis-network not found (set NEXO_VISNETWORK_DIR or install the R visNetwork package); the pathway network card will say so.' >&2
  exit 0
fi
mkdir -p public/vendor
for f in vis-network.min.js vis-network.min.css; do
  if ! cmp -s "$source_dir/$f" "public/vendor/$f"; then cp "$source_dir/$f" "public/vendor/$f"; fi
done
