/* Team shell: the Canvas toolbar band's status slot. One row docked under the
   toolbar, in the page flow above the canvas, that holds the global waiting
   strip (card_status.js) and the canvas action notice (the existing .tc-status
   line that canvas.js and canvas_tabs.js write to: "Added …", the restore list,
   errors). Its height is reserved, so a message or the strip showing or going
   never moves the canvas, and nothing floats over cards. The .tc-status element
   is moved, never re-created: its role=status / aria-live and every reference
   to it stay. Presentation only. */
(function () {
  'use strict';
  // Creates the slot once, right after the toolbar, and moves the notice line into it.
  function slot(root) {
    root = root || document.getElementById('team-canvas-root'); if (!root) return null;
    var band = root.querySelector('.tc-band-status'); if (band) return band;
    var main = root.querySelector('.tc-main'); if (!main) return null;
    band = document.createElement('div'); band.className = 'tc-band-status';
    var bar = main.querySelector(':scope > .tc-toolbar');
    if (bar) bar.after(band); else main.prepend(band);
    var line = root.querySelector('.tc-status'); if (line) band.appendChild(line);
    return band;
  }
  window.TeamCanvasBand = { slot: slot };
  function start() {
    var band = slot(), line = band && band.querySelector('.tc-status'); if (!line) return;
    // A short notice: it shows when the message changes and fades after a few seconds.
    // A long message is cut to the slot; its full text stays in the live region and the tooltip.
    var timer = null, last = '';
    new MutationObserver(function () {
      var text = line.textContent.trim(); if (text === last) return; last = text;
      clearTimeout(timer); line.classList.toggle('is-visible', !!text);
      if (line.title !== text) line.title = text;
      // Forget the message when it fades, so the same notice can show again later.
      if (text) timer = setTimeout(function () { line.classList.remove('is-visible'); last = ''; }, 6000);
    }).observe(line, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
