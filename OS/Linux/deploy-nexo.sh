#!/bin/bash
set -euo pipefail

# Run on the RTX from the spike checkout. Production Team stays on :3952.
cd /home/gjb47/nexo-spike

(
    cd frontends/nexo
    NEXO_PLOTLY_JS=$(/home/gjb47/miniforge3/envs/nexo-api/bin/Rscript --vanilla -e \
        'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js", package = "plotly"))') \
        scripts/vendor-plotly.sh
    npm ci
    npm run build
)
test -w /srv/nexo/dist || { echo "[ERROR] /srv/nexo/dist must exist and be owned by $USER (one-time: sudo install -d -o $USER -g $USER -m 755 /srv/nexo/dist)" >&2; exit 1; }
rsync -a --delete frontends/nexo/dist/ /srv/nexo/dist/

mkdir -p "$HOME/.config/systemd/user"
cp OS/Linux/lipidomic-api.service "$HOME/.config/systemd/user/lipidomic-api.service"
systemctl --user daemon-reload
if systemctl --user is-active --quiet lipidomic-api; then
    systemctl --user enable lipidomic-api
    systemctl --user restart lipidomic-api
else
    systemctl --user enable --now lipidomic-api
fi

# Bound each request as well as the overall health wait.
deadline=$((SECONDS + 60))
healthy=0
while (( SECONDS < deadline )); do
    remaining=$((deadline - SECONDS))
    if curl -fsS --max-time "$remaining" http://127.0.0.1:3960/api/v1/health; then
        healthy=1
        printf '\n'
        break
    fi
    if (( SECONDS < deadline )); then
        sleep 1
    fi
done
if (( healthy == 0 )); then
    echo "[ERROR] API health check did not pass within 60 seconds." >&2
    exit 1
fi

cat <<'NGINX_STEPS'
Manual nginx steps (printed only):
  sudo cp -p /etc/nginx/conf.d/lipidomic-explorer.conf /etc/nginx/conf.d/lipidomic-explorer.conf.bak.$(date +%Y%m%d-%H%M%S)
  Paste OS/Linux/nginx-nexo-locations.conf inside the existing server block
  listening on 127.0.0.1:3880. Keep its auth_basic enabled.
  sudo nginx -t && sudo systemctl reload nginx
NGINX_STEPS

team_status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3952/)
printf 'Production Team (:3952) HTTP status: %s\n' "$team_status"
if [[ "$team_status" != 200 ]]; then
    echo "[ERROR] Expected production Team to return HTTP 200." >&2
    exit 1
fi
