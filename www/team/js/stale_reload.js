/* Team: a tab whose server session ended (a deploy, a restart or a dropped network) offers
   one clear Reload instead of failing actions. Signing in from a dead tab reloads once. */
(function () {
  'use strict';
  var connected = false, everConnected = false, banner = null, KEY = 'ts-stale-reload-at';
  function socketOpen() {
    try { var s = window.Shiny && Shiny.shinyapp && Shiny.shinyapp.$socket; return !!s && s.readyState === 1; } catch (e) { return false; }
  }
  function alive() { return connected && socketOpen(); }
  function reload() { try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) {} location.reload(); }
  function recentlyReloaded() { try { return Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 60000; } catch (e) { return false; } }
  function show() {
    if (banner) { banner.hidden = false; return; }
    banner = document.createElement('div'); banner.className = 'ts-stale'; banner.setAttribute('role', 'alert');
    var text = document.createElement('span'); text.textContent = 'Connection lost. The app may have been updated.';
    var button = document.createElement('button'); button.type = 'button'; button.className = 'ts-stale-reload'; button.textContent = 'Reload';
    button.addEventListener('click', reload);
    banner.appendChild(text); banner.appendChild(button); document.body.appendChild(banner);
    button.focus({preventScroll: true});
  }
  function hide() { if (banner) banner.hidden = true; }
  if (window.jQuery) jQuery(document)
    .on('shiny:connected', function () { connected = everConnected = true; hide(); })
    .on('shiny:disconnected', function () { connected = false; if (everConnected) show(); });
  // Capture phase: runs before the sign-in handlers, so a dead tab never shows a sign-in failure.
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#team_library_login');
    if (!b || alive() || !everConnected) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!recentlyReloaded()) reload(); else show();
  }, true);
  window.TeamStaleReload = {show: show, hide: hide, alive: alive};
})();
