/* R4: one header in the analysis tools opened from Team. On a tool page
   (body.guided-app[data-guide-analysis=true]) one Team bar sits at the top of the tool card:
   the tool name, View (the Classic sub-tab pills), Lipids (the Analytical Ensemble scope),
   About this view (the "Tab info" toggle) and Shortcuts (the quick-access rows). Each button
   clicks the original control, so routing, input IDs and server bindings are unchanged.
   tool_header.css hides an original only while its gate class (.r4-proxied,
   .r4-intro-proxied, body.r4-shortcuts) says this bar offers it. */
(function () {
  'use strict';
  var SCOPE = [
    {id: 'targeted_lipids_hub-btn_scope_all', label: 'All'},
    {id: 'targeted_lipids_hub-btn_scope_targeted', label: 'Selected'},
    {id: 'targeted_lipids_hub-btn_scope_edit', label: 'Edit selection', action: true}
  ];
  var head = null, aboutTarget = null, frame = 0, signature = '', shortcutsOpen = false, shortcutsTool = '';
  var watched = typeof WeakSet === 'function' ? new WeakSet() : null;

  function shown(el) { return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function text(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function make(tag, cls) { var el = document.createElement(tag); if (cls) el.className = cls; return el; }
  function onToolPage() { var b = document.body; return !!b && b.classList.contains('guided-app') && b.dataset.guideAnalysis === 'true'; }

  // The open tool: the visible top-level nav panel (not a nested tab, the sidebar, a modal or the Canvas).
  function activePane() {
    var panes = document.querySelectorAll('.tab-pane.active');
    for (var i = 0; i < panes.length; i++) {
      var p = panes[i];
      if (p.parentElement && p.parentElement.closest('.tab-pane')) continue;
      if (p.closest('#main_sidebar, .modal, #team-canvas-root, #team-workspace')) continue;
      if (shown(p)) return p;
    }
    return null;
  }
  function views() {
    var bar = document.getElementById('tertiary_subsubtab_bar');
    if (!bar || bar.style.display === 'none') return [];
    return Array.prototype.map.call(bar.querySelectorAll('.subsubtab-pill[data-target]'), function (p) {
      return {key: 'view:' + p.dataset.target, target: p.dataset.target, label: text(p) || p.dataset.target, pressed: p.classList.contains('active')};
    });
  }
  // The scope is offered only where the page itself shows the ensemble bar (the Team Canvas hides it).
  function scope() {
    var dock = document.getElementById('targeted_lipids_top_dock');
    if (!dock || !document.getElementById(SCOPE[0].id)) return [];
    var gated = dock.classList.contains('r4-proxied');
    if (gated) dock.classList.remove('r4-proxied');
    var visible = shown(dock);
    if (gated) dock.classList.add('r4-proxied');
    if (!visible) return [];
    return SCOPE.map(function (s) {
      var el = document.getElementById(s.id);
      if (!el) return null;
      var count = text(el.querySelector('.targeted-pill-num'));
      return {key: 'scope:' + s.id, id: s.id, label: s.label + (count && !s.action ? ' ' + count : ''), title: el.getAttribute('title') || '',
        pressed: s.action ? null : el.classList.contains('is-active'), action: !!s.action};
    }).filter(Boolean);
  }
  function intro(pane) {
    var wraps = pane.querySelectorAll('.tab-intro-wrapper');
    for (var i = 0; i < wraps.length; i++) {
      var btn = wraps[i].querySelector('.tab-intro-pill-btn');
      if (btn && shown(wraps[i])) return {wrap: wraps[i], btn: btn};
    }
    return null;
  }
  function hasShortcuts(pane) {
    return Array.prototype.some.call(pane.querySelectorAll('.quick-access-strip'), function (strip) {
      var inner = strip.parentElement && strip.parentElement.closest('.tab-pane:not(.active)');
      return !!strip.querySelector('button') && !(inner && pane.contains(inner));
    });
  }
  function model() {
    if (!onToolPage()) return null;
    var pane = activePane();
    if (!pane) return null;
    var about = intro(pane);
    var title = pane.getAttribute('data-value') || text(about && about.wrap.querySelector('.tab-intro-permanent-title')) || 'Analysis tool';
    if (title !== shortcutsTool) { shortcutsTool = title; shortcutsOpen = false; }
    return {container: about ? about.wrap : pane, about: about, title: title, views: views(), scope: scope(), shortcuts: hasShortcuts(pane)};
  }

  function button(key, label, cls) {
    var b = make('button', 'r4-btn ' + cls);
    b.type = 'button'; b.dataset.r4Key = key; b.textContent = label;
    return b;
  }
  function group(label, buttons) {
    var g = make('div', 'r4-group'), l = make('span', 'r4-group-label'), set = make('span', 'r4-seg-set');
    g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
    l.textContent = label; l.setAttribute('aria-hidden', 'true');
    buttons.forEach(function (b) { set.appendChild(b); });
    g.appendChild(l); g.appendChild(set);
    return g;
  }
  function render(m) {
    var active = document.activeElement, focused = head && active && head.contains(active) ? active.dataset.r4Key : '';
    if (!head) { head = make('div', 'r4-tool-head'); head.addEventListener('click', onClick); }
    head.textContent = '';
    var title = make('h2', 'r4-tool-title');
    title.textContent = m.title;
    head.appendChild(title);
    if (m.views.length) head.appendChild(group('View', m.views.map(function (v) {
      var b = button(v.key, v.label, 'r4-seg');
      b.dataset.r4View = v.target; b.setAttribute('aria-pressed', String(v.pressed));
      return b;
    })));
    if (m.scope.length) head.appendChild(group('Lipids', m.scope.map(function (s) {
      var b = button(s.key, s.label, s.action ? 'r4-seg r4-seg-action' : 'r4-seg');
      b.dataset.r4Scope = s.id;
      if (s.title) b.title = s.title;
      if (s.action) b.setAttribute('aria-haspopup', 'dialog'); else b.setAttribute('aria-pressed', String(s.pressed));
      return b;
    })));
    var end = make('span', 'r4-end');
    aboutTarget = m.about ? m.about.btn : null;
    if (aboutTarget) {
      var about = button('about', 'About this view', 'r4-tool'), controls = aboutTarget.getAttribute('aria-controls');
      about.dataset.r4About = 'true';
      if (controls) about.setAttribute('aria-controls', controls);
      about.setAttribute('aria-expanded', String(aboutTarget.getAttribute('aria-expanded') === 'true'));
      end.appendChild(about);
    }
    if (m.shortcuts) {
      var shortcuts = button('shortcuts', 'Shortcuts', 'r4-tool');
      shortcuts.dataset.r4Shortcuts = 'true'; shortcuts.title = 'Show the quick-access shortcuts to this plot’s controls';
      shortcuts.setAttribute('aria-expanded', String(shortcutsOpen));
      end.appendChild(shortcuts);
    }
    if (end.childNodes.length) head.appendChild(end);
    if (head.parentNode !== m.container || m.container.firstElementChild !== head) m.container.insertBefore(head, m.container.firstChild);
    if (focused) Array.prototype.some.call(head.querySelectorAll('button'), function (b) {
      if (b.dataset.r4Key !== focused) return false;
      b.focus({preventScroll: true}); return true;
    });
  }
  function gate(m) {
    var body = document.body, tertiary = document.getElementById('tertiary_subsubtab_bar'), dock = document.getElementById('targeted_lipids_top_dock');
    if (tertiary) tertiary.classList.toggle('r4-proxied', !!(m && m.views.length));
    if (dock) dock.classList.toggle('r4-proxied', !!(m && m.scope.length));
    Array.prototype.forEach.call(document.querySelectorAll('.tab-intro-wrapper.r4-intro-proxied'), function (w) {
      if (!m || !m.about || m.about.wrap !== w) w.classList.remove('r4-intro-proxied');
    });
    if (m && m.about) m.about.wrap.classList.add('r4-intro-proxied');
    body.classList.toggle('r4-tool-header', !!m);
    body.classList.toggle('r4-shortcuts', !!(m && m.shortcuts));
    body.classList.toggle('r4-shortcuts-open', !!(m && m.shortcuts && shortcutsOpen));
  }

  function onClick(e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b || !head.contains(b)) return;
    var original = null;
    if (b.dataset.r4View) {
      var tertiary = document.getElementById('tertiary_subsubtab_bar');
      original = tertiary && Array.prototype.find.call(tertiary.querySelectorAll('.subsubtab-pill'), function (p) { return p.dataset.target === b.dataset.r4View; });
    } else if (b.dataset.r4Scope) original = document.getElementById(b.dataset.r4Scope);
    else if (b.dataset.r4About) original = aboutTarget;
    else if (b.dataset.r4Shortcuts) shortcutsOpen = !shortcutsOpen;
    if (original && original.isConnected) original.click();
    schedule();
  }

  function observe(el, options, keep) {
    if (!el || !watched || !window.MutationObserver || watched.has(el)) return;
    watched.add(el);
    new MutationObserver(function (records) { if (!keep || records.some(keep)) schedule(); }).observe(el, options);
  }
  function watch() {
    var tertiary = document.getElementById('tertiary_subsubtab_bar');
    // Pills are re-rendered and re-marked by app.js; this bar's own gate class is not a change.
    observe(tertiary, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style']}, function (r) {
      return !(r.type === 'attributes' && r.target === tertiary && r.attributeName === 'class');
    });
    // The scope pills are a uiOutput: a server update replaces them.
    observe(document.getElementById('targeted_lipids_top_dock'), {childList: true, subtree: true});
  }
  function sync() {
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    var m = model();
    if (!m) {
      if (head && head.parentNode) head.parentNode.removeChild(head);
      signature = ''; aboutTarget = null; gate(null); return;
    }
    watch();
    var sig = JSON.stringify([m.title, m.views, m.scope, m.about ? [m.about.btn.id, m.about.btn.getAttribute('aria-expanded')] : null, m.shortcuts ? shortcutsOpen : null]);
    if (sig !== signature || !head || head.parentNode !== m.container || m.container.firstElementChild !== head) { signature = sig; render(m); }
    gate(m);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(function () { frame = 0; sync(); }); }

  function init() {
    new MutationObserver(schedule).observe(document.body, {attributes: true, attributeFilter: ['data-guide-analysis', 'data-guide-step', 'data-tw-screen']});
    ['show.bs.collapse', 'hide.bs.collapse', 'shown.bs.collapse', 'hidden.bs.collapse', 'shown.bs.tab'].forEach(function (type) { document.addEventListener(type, schedule); });
    if (window.jQuery) window.jQuery(document).on('shiny:value shiny:idle', schedule);
    schedule();
  }
  window.TeamToolHeader = {sync: sync};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
