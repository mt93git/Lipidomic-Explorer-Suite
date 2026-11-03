# Synthetic fixtures: no clinical data committed to the repository.
source('R/frontends/team/canvas_state.R')
fails <- function(expr) stopifnot(inherits(tryCatch(force(expr), error = identity), 'error'))
uri <- function(x) paste0('data:image/svg+xml,', curl::curl_escape(x))
svg <- paste0('<svg xmlns="http://www.w3.org/2000/svg"><desc>', strrep('large plot + 100% µ ', 60000), '</desc><text>END</text></svg>')
x <- uri(svg)
stopifnot(nchar(x) > 1e6, nchar(x) < team_canvas_limits$snapshot)
elapsed <- system.time(stopifnot(identical(team_canvas_image(x), x)))[['elapsed']]
# Deliberately generous budget; detects the former minutes-long decoder.
stopifnot(elapsed < 15)
encoded <- paste0('data:image/svg+xml;base64,', gsub('[\r\n]', '', jsonlite::base64_enc(charToRaw(svg))))
stopifnot(identical(team_canvas_image(encoded), encoded))
# Never ignore a malicious tail, embedded NUL, malformed escape, or external URL.
fails(team_canvas_image(uri(sub('</svg>', '<script>bad()</script></svg>', svg, fixed=TRUE))))
fails(team_canvas_image(paste0(uri('<svg xmlns="http://www.w3.org/2000/svg"/>'), '%00%3Cscript%3E')))
fails(team_canvas_image('data:image/svg+xml,%GG'))
fails(team_canvas_image(uri('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.org/x"/></svg>')))
for (text in c('a+b', '100% µ', '%20', 'x%y', 'α β')) {
  payload <- curl::curl_escape(text)
  stopifnot(identical(curl::curl_unescape(payload), utils::URLdecode(payload)))
}
cat(sprintf('PASS: full >1M percent/base64 snapshots, late script/NUL/encoding/reference rejection; %.3fs\n', elapsed))
