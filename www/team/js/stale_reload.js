/* Team: one top strip for "this tab is out of date".
   - A deploy writes team/version.json; the tab compares it with the build it loaded (every 60 s
     and whenever the tab comes back into view) and offers Reload when it changed.
   - A tab whose server session ended (an update, a restart or a dropped network) says the app is
     updating, then offers Reload once the server answers again.
   - Signing in from a dead tab reloads once instead of failing.
   Nothing reloads by itself while someone is working: the strip only offers the button. */
(function () {
  'use strict';
  var VERSION_URL = 'team/version.json', POLL_MS = 60000, KEY = 'ts-stale-reload-at';
  var connected = false, everConnected = false, loadedBuild = null, outdated = false, lost = false;
  var dismissed = false, strip = null, retry = 0;

  function socketOpen() {
    try { var s = window.Shiny && Shiny.shinyapp && Shiny.shinyapp.$socket; return !!s && s.readyState === 1; } catch (e) { return false; }
  }
  function alive() { return connected && socketOpen(); }
  function reload() { try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) {} location.reload(); }
  function recentlyReloaded() { try { return Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 60000; } catch (e) { return false; } }

  function build() {
    strip = document.createElement('div'); strip.className = 'ts-stale'; strip.setAttribute('role', 'status'); strip.hidden = true;
    var text = document.createElement('span'); text.className = 'ts-stale-text';
    var button = document.createElement('button'); button.type = 'button'; button.className = 'ts-stale-reload'; button.textContent = 'Reload';
    button.addEventListener('click', reload);
    var close = document.createElement('button'); close.type = 'button'; close.className = 'ts-stale-close';
    close.setAttribute('aria-label', 'Dismiss until the next check'); close.textContent = '×';
    close.addEventListener('click', function () { dismissed = true; paint(); });
    strip.appendChild(text); strip.appendChild(button); strip.appendChild(close); document.body.prepend(strip);
  }
  function paint() {
    if (!document.body) return;
    if (!strip) build();
    // A lost connection always shows (actions would fail); an available update can be dismissed until the next check.
    var updating = lost && !outdated, show = lost || (outdated && !dismissed);
    strip.querySelector('.ts-stale-text').textContent = updating
      ? 'Lipidomic Explorer is updating. This usually takes a few seconds.'
      : 'A new version of Lipidomic Explorer is available. Reload when you are ready.';
    strip.querySelector('.ts-stale-reload').hidden = updating;
    strip.querySelector('.ts-stale-close').hidden = lost;
    strip.classList.toggle('is-updating', updating);
    strip.hidden = !show;
    document.body.classList.toggle('ts-has-stale', show);
  }

  // Resolves true when the server answered with a build id.
  function check() {
    return fetch(VERSION_URL, {cache: 'no-store', credentials: 'same-origin'})
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var b = j && typeof j.build === 'string' ? j.build : null;
        if (!b) return false;
        if (loadedBuild === null) { loadedBuild = b; return true; }
        if (b !== loadedBuild && !outdated) { outdated = true; dismissed = false; }
        if (outdated) paint();
        return true;
      })
      // Without an answer nothing is claimed: a false "new version" would interrupt work.
      .catch(function () { return false; });
  }
  function waitForServer() {
    clearTimeout(retry);
    if (!lost) return;
    fetch(location.pathname, {method: 'HEAD', cache: 'no-store', credentials: 'same-origin'})
      .then(function (r) { if (r.ok) { outdated = true; paint(); } else retry = setTimeout(waitForServer, 3000); })
      .catch(function () { retry = setTimeout(waitForServer, 3000); });
  }

  if (window.jQuery) jQuery(document)
    .on('shiny:connected', function () { connected = everConnected = true; if (lost) { lost = false; paint(); } })
    .on('shiny:disconnected', function () { connected = false; if (everConnected) { lost = true; paint(); waitForServer(); } });
  setInterval(function () { if (document.visibilityState === 'visible') { dismissed = false; check(); } }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
  // Document capture: the sign-in field checks (window capture) run first, so this only sees a filled form.
  // A dead tab then reloads instead of showing a sign-in failure.
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#team_library_login');
    if (!b || alive() || !everConnected) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!recentlyReloaded()) reload(); else { lost = true; paint(); waitForServer(); }
  }, true);
  check();
  window.TeamStaleReload = {check: check, alive: alive};
})();
