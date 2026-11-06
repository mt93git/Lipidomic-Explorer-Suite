/* Team Canvas: hide or show the inspector column (a button in the left rail, shortcut I).
   Collapsing lets the canvas (.tc-main) take the column's grid track up to a reserved companion strip
   (inspector_toggle.css); the column itself stays laid out where it is, invisible and inert, so the
   companion's .tc-companion-home keeps its centre and bottom and the chat's docking rect
   (context_help.js, companion_assistant.js) is exactly as with the column shown.
   The state is remembered per signed-in account; without one, it starts hidden from 901 to 1279 px. */
(function () {
  'use strict';
  var NARROW = '(max-width:900px)'; // the column stacks under the canvas here (shell.css): no toggle
  var KEY = 'team-canvas-inspector-hidden:';
  // The signed-in account: project_library.R replaces the sign-in form (and its email field) with
  // "Signed in as <email>" once signed in; that paragraph carries the address in data-team-account.
  function email() {
    var box = document.getElementById('team_library_account');
    if (!box) return '';
    var tagged = box.querySelector('[data-team-account]');
    if (tagged) return tagged.getAttribute('data-team-account') || '';
    var lines = box.querySelectorAll('p');
    for (var i = 0; i < lines.length; i++) { var m = /^\s*Signed in as\s+(\S+@\S+)\s*$/.exec(lines[i].textContent || ''); if (m) return m[1]; }
    return '';
  }
  function hex(h) { return ('0000000' + (h >>> 0).toString(16)).slice(-8); }
  function djb2(s) { for (var h = 5381, i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
  function fnv1a(s) { for (var h = 0x811c9dc5, i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  function address() {
    if (document.body.dataset.teamAuthenticated !== 'true') return '';
    return email().trim().toLowerCase();
  }
  // Only a hash of the address goes into the storage key, never the address itself: 64 bits, two
  // independent 32-bit hashes (djb2, FNV-1a), 16 hex characters.
  // Signed out: the 'anonymous' key. Signed in but no address readable yet (the account paragraph not
  // rendered): null, no key at all; nothing is read or written and the width default applies, so a
  // signed-in user never reads or overwrites the signed-out choice.
  function account() {
    if (document.body.dataset.teamAuthenticated !== 'true') return 'anonymous';
    var a = address(); return a ? hex(djb2(a)) + hex(fnv1a(a)) : null;
  }
  // Keys of an earlier build (8 hex, djb2 alone) are ignored, never read: with 32 bits two accounts can
  // share one, so reading it could hand one account's choice to another. A one-click choice is set again.
  function parse(v) { return v === '1' ? true : v === '0' ? false : null; }
  function saved() { var a = account(); if (!a) return null; try { return parse(localStorage.getItem(KEY + a)); } catch (e) { return null; } }
  function save(hidden) { var a = account(); if (!a) return; try { localStorage.setItem(KEY + a, hidden ? '1' : '0'); } catch (e) {} }
  // Keys typed into a field or a widget that owns its keys (Plotly, selectize, comboboxes, list boxes,
  // menus) and keys on buttons are not the shortcut.
  var OWN_KEYS = 'input,textarea,select,button,[role="button"],[contenteditable]:not([contenteditable="false"]),[role="textbox"],' +
    '.js-plotly-plot,.modebar,.modebar-container,.selectize-control,.selectize-dropdown,[role="combobox"],[role="listbox"],[role="menu"],[role="menubar"],[role^="menuitem"]';
  function typing(t) { return !!(t && t.closest && t.closest(OWN_KEYS)); }

  function mount() {
    var root = document.getElementById('team-canvas-root');
    if (!root || root.dataset.tsShell !== 'true') return false;
    var layout = root.querySelector('.tc-layout'), main = root.querySelector('.tc-layout>.tc-main'), column = root.querySelector('.tc-layout>.ts-inspector-column');
    var rail = root.querySelector('.tc-layout>.ts-rail');
    if (!layout || !main || !column || !rail) return false;
    if (rail.querySelector(':scope>.ts-inspector-toggle')) return true;
    if (!column.id) column.id = 'ts-inspector-column';
    var narrow = window.matchMedia ? window.matchMedia(NARROW) : { matches: false };
    var toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'ts-inspector-toggle';
    toggle.setAttribute('aria-controls', column.id);
    // A panel icon: the right pane is filled while the inspector is shown (inspector_toggle.css).
    toggle.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><rect x="2" y="3" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 3.75v10.5" stroke="currentColor" stroke-width="1.5"/><rect class="ts-inspector-pane" x="11.5" y="4.5" width="3.75" height="9" fill="currentColor"/></svg>';
    // In the rail, after the Select / Move pair (pointer_mode.js) when it is there.
    var pair = rail.querySelector(':scope>.tc-pointer-mode');
    rail.insertBefore(toggle, pair ? pair.nextSibling : null);
    // W6: labelled text controls for the same state. "Hide inspector" heads the column (inert with it);
    // while the column is hidden a "Show inspector" tab sits on the right edge of the canvas cell, high
    // up, clear of the companion's home at the column's foot and of the navigation at the cell's
    // bottom-left. Neither is offered at <= 900 px (stacked) or while the tools drawer is docked over
    // the column. Both drive set(..., true): saved, and a user action for the anti-flap budget.
    var header = document.createElement('div'); header.className = 'ts-inspector-header';
    var hideText = document.createElement('button'); hideText.type = 'button'; hideText.className = 'ts-inspector-hide';
    hideText.textContent = 'Hide inspector'; hideText.setAttribute('aria-controls', column.id); hideText.title = 'Hide inspector (I)';
    header.appendChild(hideText); column.insertBefore(header, column.firstChild);
    var showTab = document.createElement('button'); showTab.type = 'button'; showTab.className = 'ts-inspector-show';
    showTab.textContent = 'Show inspector'; showTab.setAttribute('aria-controls', column.id); showTab.title = 'Show inspector (I)'; showTab.hidden = true;
    main.appendChild(showTab);
    // Focus only ever lands on a control that is shown, enabled and not inert (Figure page, the
    // stacked breakpoint, the tools drawer and a selected object each hide some of these controls).
    function usable(n) {
      return !!n && n !== document.body && n !== document.documentElement && n.isConnected && !n.disabled && !n.closest('[hidden],[inert]') && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
    }
    var FOCUSABLE = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
    function rescue(prefer) {
      var list = (prefer || []).concat([toggle, showTab, hideText]);
      for (var i = 0; i < list.length; i++) if (usable(list[i])) { list[i].focus({ preventScroll: true }); return list[i]; }
      var all = root.querySelectorAll(FOCUSABLE);
      for (var j = 0; j < all.length; j++) if (!column.contains(all[j]) && usable(all[j])) { all[j].focus({ preventScroll: true }); return all[j]; }
      return null;
    }
    // The last of these controls (or a control in the column) that had focus: when it is hidden or made
    // inert under the focus, the browser drops focus to the body; it is given to a usable control.
    var held = null, opener = null, armed = false;
    function ours(n) { return !!n && (n === toggle || n === showTab || n === hideText || column.contains(n)); }
    function lost(a) { return !a || a === document.body || (ours(a) && !usable(a)); }
    // opener: what had focus when focus first entered the busy dialog in this opening (the focusin's
    // relatedTarget; null for the body), i.e. what foreground.js gives focus back to. Kept through a
    // reopen while work is pending; focus and pointer moves inside the dialog never change it.
    function inDialog(n) { var d = document.getElementById('team-foreground'); return !!d && !!n && d.contains(n); }
    document.addEventListener('focusin', function (e) {
      if (inDialog(e.target)) {
        if (!armed) { armed = true; opener = e.relatedTarget && !inDialog(e.relatedTarget) ? e.relatedTarget : null; }
        return;
      }
      held = ours(e.target) ? e.target : null;
    }, true);
    document.addEventListener('pointerdown', function (e) { if (!inDialog(e.target) && !ours(e.target)) held = null; }, true); // the user moves focus elsewhere
    // Focus leaving a control that is still usable (a deliberate blur to the body, not a hide): nothing
    // is held any more, so a later toggle by key leaves the body alone.
    document.addEventListener('focusout', function (e) { if (e.target === held && !e.relatedTarget && usable(held)) held = null; }, true);
    // prev: the focused element before a change this script made (or observed); focus that was ours
    // and is now on the body or on a hidden / inert node is rescued, whatever `held` says.
    function keepFocus(prefer, prev) {
      var a = document.activeElement;
      if (ours(a)) { if (usable(a)) return; }
      else if (!lost(a) || !((prev && prev !== document.body && ours(prev)) || (held && !usable(held)))) return;
      rescue(prefer);
    }
    // The busy dialog closes: foreground.js gives focus back to its opener, which fails when the opener
    // was hidden or made inert meanwhile (tools drawer, Figure page, breakpoint) and leaves the body.
    // Checked after the dialog's own close listeners (a listener added to the target during capture
    // runs after the ones already there), only if the dialog stayed closed.
    document.addEventListener('close', function (e) {
      var dlg = e.target;
      if (!dlg || dlg.id !== 'team-foreground') return;
      dlg.addEventListener('close', function () {
        if (dlg.open) return; // reopened while work is pending: keep the opener for the real close
        var from = opener, a = document.activeElement; opener = null; armed = false;
        // Rescued only when focus sits on a hidden control of ours, or when it is lost (the body, or the
        // closed dialog, which the browser then drops to the body) because our opener control was
        // hidden meanwhile. Any other opener, the body included, is left exactly as production leaves it.
        var lostNow = !a || a === document.body || dlg.contains(a);
        if (!((ours(a) && !usable(a)) || (lostNow && ours(from) && !usable(from)))) return;
        if (from && usable(from)) from.focus({ preventScroll: true }); else rescue(hidden() ? [showTab] : [hideText]);
      }, { once: true });
    }, true);
    hideText.addEventListener('click', function () { set(true, true); rescue([showTab]); });
    showTab.addEventListener('click', function () { set(false, true); rescue([hideText]); });
    var explicit = saved();
    function hidden() { return layout.classList.contains('ts-inspector-collapsed'); }
    // Only what changed is written: the shell and the tools drawer observe this layout's class.
    function sync() {
      var prev = document.activeElement;
      var h = hidden(), label = h ? 'Show inspector' : 'Hide inspector';
      // Inert while hidden, and while the Analysis tools drawer is docked over the column (tools_drawer.js
      // puts it in the column's grid cell; it is a sibling, so it stays usable): covered controls are not
      // reachable with the keyboard either.
      var drawerOver = layout.classList.contains('ttd-open');
      var off = (h && !narrow.matches && !drawerOver) || drawerOver;
      if (toggle.getAttribute('aria-expanded') !== String(!h)) toggle.setAttribute('aria-expanded', String(!h));
      if (toggle.getAttribute('aria-label') !== label) { toggle.setAttribute('aria-label', label); toggle.title = label + ' (I)'; }
      var tab = h && !narrow.matches && !drawerOver;
      if (showTab.hidden === tab) showTab.hidden = !tab;
      if (column.inert !== off) column.inert = off;
      // Hidden: focus left in the column goes to the rail toggle (as before), else to a usable control.
      keepFocus(off ? [toggle, showTab] : [hideText, toggle], prev);
      schedule();
    }
    // Extension: hidden, the canvas takes the column's left part (up to the companion strip) only while
    // the chat is closed (it docks over the whole column, companion_assistant.js) and the mascot's
    // current rect (#lipidomic-companion: a hand-placed mascot can rest anywhere) is clear of that part.
    // Otherwise the canvas keeps production's track (column 3) with the column's contents still hidden;
    // the column stays laid out either way, so the mascot's obstacles are production's. State is only
    // read from the companion (body class, the dock's rect), never written.
    // Anti-flap: a flip the layout causes (not the user) can move the mascot (the toolbar moves with the
    // canvas width), which can flip it back, with any delay (the global resize can take seconds). After two
    // reversals with no user action in between, production's track is kept until the user acts: the chat
    // opened or closed, the mascot dragged or moved with its keys, the column toggled, the tools drawer
    // opened or closed, the window resized.
    var EXTENDED = 'ts-inspector-extended', MAX_FLIPS = 3, flips = 0, locked = false, queued = false;
    function zone() {
      var c = column.getBoundingClientRect(), strip = parseFloat(getComputedStyle(layout).getPropertyValue('--ts-companion-strip')) || 136;
      return { left: c.left, top: c.top, bottom: c.bottom, right: c.left + 1 + Math.max(0, (c.width - 1 - strip) / 2) };
    }
    function mascotIn(z) {
      var dock = document.getElementById('lipidomic-companion');
      if (!dock || dock.hidden || !dock.getClientRects().length) return false;
      var r = dock.getBoundingClientRect();
      return r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top;
    }
    // The synthetic resize is sent only when a box the shell, the viewport or the mascot measure moved.
    function geometry() {
      return [main, column, root.querySelector('.tc-layout>#tc-preview-panel')].map(function (n) {
        if (!n) return '-'; var r = n.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].join(',');
      }).join('|');
    }
    function toggleClass(name, on) {
      var before = geometry(); layout.classList.toggle(name, on);
      if (geometry() !== before) window.dispatchEvent(new Event('resize'));
    }
    function extendable() {
      if (!hidden() || narrow.matches || layout.classList.contains('ttd-open') || locked) return false;
      if (document.body.classList.contains('assistant-chat-open')) return false;
      return !mascotIn(zone());
    }
    function applyExtension() {
      queued = false;
      var want = extendable();
      if (layout.classList.contains(EXTENDED) === want) return;
      // Counted from the last user action: up to MAX_FLIPS layout-caused changes, i.e. the first flip and two
      // reversals. The state is then frozen at production's track: a change to it as the last one is made (it
      // is the safe side), a change away from it is refused, so the extension never ends frozen.
      if (++flips > MAX_FLIPS || (flips === MAX_FLIPS && want)) { locked = true; if (!want && layout.classList.contains(EXTENDED)) toggleClass(EXTENDED, false); return; }
      if (flips === MAX_FLIPS) locked = true;
      // Only an actual change resizes (the shell, the viewport and the mascot re-measure on it).
      toggleClass(EXTENDED, want);
    }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(applyExtension); } }
    function unlock() { locked = false; flips = 0; schedule(); }
    function set(h, remember) {
      if (remember) { explicit = h; save(h); unlock(); }
      if (hidden() !== h) toggleClass('ts-inspector-collapsed', h);
      sync();
    }
    // The default hides the column only where it is a side column (901-1279 px); at <= 900 px it stacks
    // under the canvas, is always shown, and the layout must not claim it is collapsed.
    function auto() { return !narrow.matches && window.innerWidth < 1280; }
    function initial() { explicit = saved(); set(explicit != null ? explicit : auto(), false); }
    toggle.addEventListener('click', function () { set(!hidden(), true); });
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || (e.getModifierState && e.getModifierState('AltGraph')) || (e.key !== 'i' && e.key !== 'I') || typing(e.target)) return;
      if (e.target !== document.body && e.target !== document.documentElement && !root.contains(e.target)) return;
      if (!toggle.getClientRects().length || document.querySelector('.modal.show')) return;
      e.preventDefault(); set(!hidden(), true);
    });
    // No saved choice: follow the window across 1280 px (and 900 px, where the column stacks).
    window.addEventListener('resize', function (e) { if (e.isTrusted) unlock(); if (explicit == null && hidden() !== auto()) set(auto(), false); else sync(); });
    // The chat opening or closing (body class) and the mascot moving (its inline place, its class).
    // The chat opening or closing is a user action; other body class changes only re-check.
    var chatOpen = document.body.classList.contains('assistant-chat-open');
    new MutationObserver(function () { var now = document.body.classList.contains('assistant-chat-open'); if (now !== chatOpen) { chatOpen = now; unlock(); } else schedule(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // The mascot dragged (pointer released on it) or moved with its grip's keys: a user action.
    ['pointerup', 'keyup'].forEach(function (name) {
      // Only the user's own events (a script's synthetic event keeps the freeze).
      document.addEventListener(name, function (e) { if (!e.isTrusted) return; var d = document.getElementById('lipidomic-companion'); if (d && e.target && d.contains(e.target)) setTimeout(unlock, 0); }, true);
    });
    // One observer for the current dock: a replaced dock (kept by the companion) is no longer watched.
    var watchedDock = null, dockObserver = new MutationObserver(schedule);
    function watchDock() {
      var dock = document.getElementById('lipidomic-companion');
      if (!dock || dock === watchedDock) return;
      dockObserver.disconnect(); watchedDock = dock;
      dockObserver.observe(dock, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }); schedule();
    }
    watchDock();
    // The dock is a direct child of the body; watch for it (or a new one) being added.
    new MutationObserver(watchDock).observe(document.body, { childList: true });
    if (narrow.addEventListener) narrow.addEventListener('change', sync);
    // The Figure page (root class) and a selected object (the inspector's hidden attribute) hide the
    // labelled control: focus on it moves to a usable one.
    new MutationObserver(function () { keepFocus(hidden() ? [showTab] : [hideText]); }).observe(root, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(function () { keepFocus(hidden() ? [showTab] : [hideText]); }).observe(column, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    // The tools drawer opening or closing (ttd-open) is a user action: it resets the flip budget, so a
    // drawer cycle never counts as layout feedback.
    var drawerWas = layout.classList.contains('ttd-open');
    new MutationObserver(function () {
      var now = layout.classList.contains('ttd-open');
      sync();
      if (now !== drawerWas) { drawerWas = now; unlock(); }
    }).observe(layout, { attributes: true, attributeFilter: ['class'] });
    // Edit on a card opens the inspector on it and focuses its tabs (card_frame.js): a hidden column is
    // shown for it (not saved; the saved choice applies again on the next visit). Capture phase,
    // so the column is shown and no longer inert before card_frame.js moves focus.
    // Not in Move (pointer_mode.js): there a pointer click is a pan and never reaches the card, so it opens
    // nothing either; a keyboard-made click (detail 0) still does.
    function panning(e) { return !!(e.detail && window.TeamCanvasPointerMode && window.TeamCanvasPointerMode.mode === 'hand'); }
    document.addEventListener('click', function (e) {
      if (panning(e)) return;
      var edit = e.target && e.target.closest && e.target.closest('.tc-card-edit');
      // explicit = false keeps it shown across resizes (the 1280 px default would hide it again) until
      // the user hides it or another account signs in; nothing is written to storage.
      if (edit && root.contains(edit) && hidden() && !narrow.matches) { explicit = false; set(false, false); }
    }, true);
    // Figure page actions that edit in the column (Add text, Page setup, open Plots, editing a text object;
    // figure_column.js) show a hidden column the same way, before they move focus into it. Not saved.
    window.TeamInspectorToggle = { reveal: function () { if (hidden() && !narrow.matches) { explicit = false; set(false, false); } return !column.inert; } };
    // The Figure page's equivalent: a double click on a text object edits it in the column's text field
    // (canvas_preview.js), so a hidden column is shown for it the same way, before that field takes focus.
    document.addEventListener('dblclick', function (e) {
      if (panning(e)) return;
      var item = e.target && e.target.closest && e.target.closest('#tc-preview-panel .tc-free-item');
      if (item && root.contains(item) && item.querySelector('.tc-paper-text') && hidden() && !narrow.matches) { explicit = false; set(false, false); }
    }, true);
    // Another account signs in, or signs out: its own saved choice. The account paragraph is re-rendered
    // by Shiny (renderUI) independently of data-team-authenticated, so both are watched.
    var who = account();
    function recheck() { var now = account(); if (now !== who) { who = now; initial(); } }
    new MutationObserver(recheck).observe(document.body, { attributes: true, attributeFilter: ['data-team-authenticated'] });
    var watched = null;
    function watchAccount() {
      var box = document.getElementById('team_library_account');
      if (!box || box === watched) return;
      watched = box;
      new MutationObserver(recheck).observe(box, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-team-account'] });
      recheck();
    }
    watchAccount();
    // The account output can be (re)inserted after the Canvas mounts.
    if (!watched) { var waitBox = new MutationObserver(function () { watchAccount(); if (watched) waitBox.disconnect(); }); waitBox.observe(document.body, { childList: true, subtree: true }); }
    initial();
    return true;
  }
  function start() {
    if (!window.LIPIDOMIC_TEAM_WORKSPACE || mount()) return;
    var observer = new MutationObserver(function () { if (mount()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ts-shell'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
