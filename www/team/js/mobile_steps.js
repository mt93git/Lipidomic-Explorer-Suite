/* Phones (<= 600 px): each step bar collapses to one control that shows the current
   step and its position ("Step 3 of 7 · Quality") and opens a list to jump to any step.
   The original step buttons stay in the DOM (mobile_steps.css hides them on phones) and
   keep their handlers and aria-current; the list mirrors them and clicks them, as the
   workspace top bar (shell.js) already does. No Shiny input is created or renamed. */
(function () {
  'use strict';
  var PHONE = '(max-width:600px)';
  var count = 0;
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function enabledItems(list) { return Array.prototype.filter.call(list.querySelectorAll('button'), function (b) { return !b.disabled; }); }

  // cfg: {cls, source: element holding the original step buttons, after: node the
  // compact control is inserted after, read(): [{label, button}], listLabel}
  function build(cfg) {
    var id = 'tw-compact-steps-' + (++count);
    var wrap = el('div', 'tw-compact-steps ' + cfg.cls);
    var trigger = el('button', 'tw-compact-steps-trigger'); trigger.type = 'button';
    trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', id);
    var word = el('span', 'tw-compact-steps-word', 'Step '), pos = el('span', 'tw-compact-steps-pos');
    var sep = el('span', 'tw-compact-steps-sep', ' · ');
    var name = el('strong', 'tw-compact-steps-name');
    var chevron = el('span', 'tw-compact-steps-chevron'); chevron.setAttribute('aria-hidden', 'true');
    // One inline run of text: as separate flex items the spaces between parts would collapse.
    var label = el('span', 'tw-compact-steps-text'); label.append(word, pos, sep, name);
    trigger.append(label, chevron);
    var list = el('ol', 'tw-compact-steps-menu'); list.id = id; list.hidden = true; list.setAttribute('aria-label', cfg.listLabel);
    wrap.append(trigger, list);
    cfg.after.after(wrap);
    var entries = [];

    function sync() {
      var steps = cfg.read();
      if (entries.length !== steps.length) {
        list.textContent = '';
        entries = steps.map(function (step, i) {
          var li = el('li'), b = el('button', 'tw-compact-steps-item'); b.type = 'button';
          var num = el('span', 'tw-compact-steps-num', String(i + 1)), label = el('span', 'tw-compact-steps-label');
          b.append(num, label); li.appendChild(b); list.appendChild(li);
          b.addEventListener('click', function () { choose(i); });
          return b;
        });
      }
      var current = -1;
      steps.forEach(function (step, i) {
        var b = entries[i], src = step.button, on = src.getAttribute('aria-current') === 'step';
        if (on) current = i;
        var label = b.querySelector('.tw-compact-steps-label');
        if (label.textContent !== step.label) label.textContent = step.label;
        // A stage locked only by a busy cycle (workspace.js data-tw-busy-lock) stays focusable
        // (aria-disabled) so Enter/click can queue it, as on the step bar; other locks disable it.
        var busyLock = !!src.disabled && src.dataset.twBusyLock === 'true', off = !!src.disabled && !busyLock;
        if (b.disabled !== off) b.disabled = off;
        if (busyLock) { if (b.getAttribute('aria-disabled') !== 'true') b.setAttribute('aria-disabled', 'true'); } else b.removeAttribute('aria-disabled');
        if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        // A locked step keeps its reason (aria-label) and a step queued during a busy
        // cycle shows the same state here (workspace.js sets both on the originals).
        ['aria-label', 'data-tw-queued', 'aria-busy', 'title'].forEach(function (attr) { var v = src.getAttribute(attr); if (v === null) b.removeAttribute(attr); else if (b.getAttribute(attr) !== v) b.setAttribute(attr, v); });
      });
      var posText = current < 0 ? '' : (current + 1) + ' of ' + steps.length;
      var nameText = current < 0 ? 'Choose a step' : steps[current].label;
      if (pos.textContent !== posText) pos.textContent = posText;
      if (name.textContent !== nameText) name.textContent = nameText;
      word.hidden = sep.hidden = current < 0;
      // Explicit name: built from the visible parts, the name computation would add a space
      // before a visually hidden suffix ("Quality . Choose a step").
      var spoken = current < 0 ? 'Choose a step' : 'Step ' + posText + ' · ' + nameText + '. Choose a step';
      if (trigger.getAttribute('aria-label') !== spoken) trigger.setAttribute('aria-label', spoken);
      wrap.dataset.current = String(current + 1);
    }

    function isOpen() { return !list.hidden; }
    function open() {
      if (isOpen()) return;
      sync(); list.hidden = false; trigger.setAttribute('aria-expanded', 'true'); wrap.classList.add('is-open');
      var items = enabledItems(list);
      var target = list.querySelector('button[aria-current="step"]:not([disabled])') || items[0];
      if (target) target.focus();
    }
    function close(returnFocus) {
      if (!isOpen()) return;
      list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); wrap.classList.remove('is-open');
      if (returnFocus) trigger.focus();
    }
    function choose(i) {
      var src = (cfg.read()[i] || {}).button;
      // Focus goes back to the visible trigger first; the original button is hidden on
      // phones and any focus handling of the new step runs after this.
      close(true);
      if (!src) return;
      if (!src.disabled) { src.click(); return; }
      var stage = src.dataset.twStage || src.dataset.stage;
      if (stage && src.dataset.twBusyLock === 'true' && window.TeamWorkspace && TeamWorkspace.request) TeamWorkspace.request(stage);
    }
    function move(delta, edge) {
      var items = enabledItems(list); if (!items.length) return;
      var at = items.indexOf(document.activeElement), next;
      if (edge === 'first') next = 0; else if (edge === 'last') next = items.length - 1;
      else next = at < 0 ? 0 : (at + delta + items.length) % items.length;
      items[next].focus();
    }

    trigger.addEventListener('click', function () { if (isOpen()) close(false); else open(); });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (e.target === trigger && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isOpen()) { e.preventDefault(); open(); return; }
      if (!isOpen() || !list.contains(e.target)) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); move(0, 'first'); }
      else if (e.key === 'End') { e.preventDefault(); move(0, 'last'); }
    });
    // A step locked only while the app is busy can be queued from here as from the step bar
    // (workspace.js requestStage): disabled items let the click through (mobile_steps.css).
    list.addEventListener('click', function (e) {
      var hitBtn = e.target.closest && e.target.closest('button'); if (hitBtn && !hitBtn.disabled) return;
      var items = Array.prototype.slice.call(list.querySelectorAll('button'));
      var i = items.findIndex(function (b) { var r = b.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
      var src = i < 0 ? null : (cfg.read()[i] || {}).button, stage = src && (src.dataset.twStage || src.dataset.stage);
      if (stage && window.TeamWorkspace && TeamWorkspace.request && TeamWorkspace.request(stage)) close(true);
    });
    // Tabbing out closes the list; focus already moved where the user wanted it.
    wrap.addEventListener('focusout', function (e) { if (isOpen() && e.relatedTarget && !wrap.contains(e.relatedTarget)) close(false); });
    // A click outside closes it; when that click left focus nowhere, it returns to the trigger.
    document.addEventListener('click', function (e) {
      if (!isOpen() || wrap.contains(e.target)) return;
      var lost = !document.activeElement || document.activeElement === document.body || list.contains(document.activeElement);
      close(lost);
    });
    if (window.matchMedia) {
      var mq = window.matchMedia(PHONE), onChange = function () {
        if (mq.matches) return;
        // Leaving phone width hides the compact menu: focus inside it goes to the matching visible step.
        var had = isOpen() && list.contains(document.activeElement); close(false);
        if (had) { var steps = cfg.read(), cur = steps.find(function (s) { return s.button.getAttribute('aria-current') === 'step'; }) || steps.find(function (s) { return !s.button.disabled; }); if (cur) { var b = cur.button, stage = b.dataset.twStage || b.dataset.stage;
          // Workspace: the originals stay hidden; the visible step bar is the shell's mirror.
          if (!b.getClientRects().length && stage) b = document.querySelector('.ts-steps .ts-step[data-stage="' + stage + '"]') || b;
          b.focus(); } }
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
    new MutationObserver(sync).observe(cfg.source, { attributes: true, subtree: true, childList: true, characterData: true, attributeFilter: ['aria-current', 'disabled', 'aria-label', 'data-tw-queued', 'aria-busy', 'title', 'data-tw-busy-lock'] });
    sync();
    return wrap;
  }

  function text(node) { return node ? node.textContent.trim() : ''; }

  // Guided seven-step bar (#guide-navigation, R/guided_workflow.R).
  function mountGuided() {
    var host = document.getElementById('guide-navigation');
    var nav = host && host.querySelector(':scope > nav');
    // The Team workspace does not mount the seven-step bar (RC5, R/frontends/team/ui.R): nothing to wait for.
    if (!nav) return !!window.LIPIDOMIC_TEAM_WORKSPACE;
    if (host.querySelector('.tw-compact-steps')) return true;
    if (!nav.querySelector('[data-guide-step]')) return false;
    build({
      cls: 'tw-compact-guided', source: nav, after: nav, listLabel: 'All analysis steps',
      read: function () {
        return Array.prototype.map.call(nav.querySelectorAll('[data-guide-step]'), function (b) {
          var last = b.lastChild; return { label: last && last.nodeType === 3 ? last.textContent.trim() : text(b).replace(/^\d+\s*/, ''), button: b };
        });
      }
    });
    return true;
  }

  // Workspace top bar: shell.js mirrors the three stages of #team-workspace .tw-steps.
  function mountWorkspace() {
    if (!window.LIPIDOMIC_TEAM_WORKSPACE) return true;
    var original = document.querySelector('#team-workspace .tw-steps');
    var mirror = document.querySelector('.navbar .ts-topbar-extras .ts-steps');
    if (!original || !mirror) return false;
    if (mirror.parentNode.querySelector('.tw-compact-steps')) return true;
    build({
      cls: 'tw-compact-workspace', source: original, after: mirror, listLabel: 'All workspace steps',
      read: function () {
        return Array.prototype.map.call(original.querySelectorAll('[data-tw-stage]'), function (b) {
          return { label: text(b.querySelector('strong')) || text(b), button: b };
        });
      }
    });
    // On phones the save pill shows only its dot; its text stays available as a tooltip.
    var saved = mirror.parentNode.querySelector('.ts-saved');
    if (saved) {
      var title = function () { var t = saved.textContent.trim(); if (t) { if (saved.title !== t) saved.title = t; } else saved.removeAttribute('title'); };
      new MutationObserver(title).observe(saved, { childList: true, characterData: true, subtree: true });
      title();
    }
    return true;
  }

  function tick() { var a = mountGuided(), b = mountWorkspace(); return a && b; }
  function start() {
    if (tick()) return;
    var observer = new MutationObserver(function () { if (tick()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
