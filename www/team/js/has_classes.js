/* Team stand-ins for broad CSS :has() conditions.
   Chromium cannot scope :has() invalidation when the :has() sits on body or a layout ancestor of
   the whole page, or when a universal child selector follows it (`X:has(Y) > *`): every DOM
   insertion or text change anywhere then restyles the whole document (~40 ms per change on the
   Team canvas, ~4x that on a slow CPU). The Team stylesheets therefore test classes instead:
   `X:is(.ts-flag, ARG)` replaces `X:has(ARG)`. ARG never matches X itself; it only keeps the
   original specificity, so the cascade is unchanged. This file keeps each .ts-flag equal to the
   :has() condition it replaces, with observers limited to the element that owns the condition.
   Narrow :has() rules (a small anchor such as a checkbox or a card) stay in CSS. */
(function () {
  'use strict';
  var observed = typeof WeakSet === 'function' ? new WeakSet() : null;
  // Each flag's last computed value, re-applied if other code rewrites the element's whole class
  // attribute (className = ...): the condition itself has not changed in that case.
  var wanted = typeof WeakMap === 'function' ? new WeakMap() : null;
  var keeper = window.MutationObserver && wanted ? new MutationObserver(function (records) {
    records.forEach(function (record) {
      var want = wanted.get(record.target); if (!want) return;
      Object.keys(want).forEach(function (cls) { if (record.target.classList.contains(cls) !== want[cls]) record.target.classList.toggle(cls, want[cls]); });
    });
  }) : null;
  function set(el, cls, on) {
    if (!el) return; on = !!on;
    if (wanted) { var want = wanted.get(el); if (!want) { want = {}; wanted.set(el, want); if (keeper) keeper.observe(el, { attributes: true, attributeFilter: ['class'] }); } want[cls] = on; }
    if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
  }
  function hasChild(el, selector) { for (var c = el && el.firstElementChild; c; c = c.nextElementSibling) if (c.matches(selector)) return true; return false; }
  function ancestors(el, selector) { var out = []; for (var a = el && el.parentElement; a; a = a.parentElement) if (a.matches(selector)) out.push(a); return out; }
  // Observe one element with one sync; the sync also runs once when the element is first found.
  function watch(el, options, sync) {
    if (!el || !window.MutationObserver || (observed && observed.has(el))) return false;
    if (observed) observed.add(el);
    new MutationObserver(function (records) { sync(records); }).observe(el, options);
    sync([]);
    return true;
  }

  // Page structure rendered once by R: body:has(#team-workspace), .bslib-sidebar-layout:has(> #main_sidebar),
  // .main:has(> #team-workspace), .main:has(> .bslib-page-main #team-workspace).
  function syncStructure() {
    var workspace = document.getElementById('team-workspace'), sidebar = document.getElementById('main_sidebar');
    set(document.body, 'ts-has-workspace', !!workspace);
    document.querySelectorAll('.bslib-sidebar-layout.ts-has-main-sidebar').forEach(function (layout) { if (!hasChild(layout, '#main_sidebar')) set(layout, 'ts-has-main-sidebar', false); });
    if (sidebar && sidebar.parentElement && sidebar.parentElement.matches('.bslib-sidebar-layout')) set(sidebar.parentElement, 'ts-has-main-sidebar', true);
    document.querySelectorAll('.main.ts-has-workspace-child,.main.ts-has-workspace-page').forEach(function (main) { set(main, 'ts-has-workspace-child', false); set(main, 'ts-has-workspace-page', false); });
    if (workspace) {
      var parent = workspace.parentElement;
      if (parent && parent.matches('.main')) set(parent, 'ts-has-workspace-child', true);
      ancestors(workspace, '.bslib-page-main').forEach(function (page) { if (page.parentElement && page.parentElement.matches('.main')) set(page.parentElement, 'ts-has-workspace-page', true); });
    }
  }
  // .main:has(> .structural-main-scroll-viewport): the Structural tools are rendered once by R; their
  // independent canvas copies are inserted at the end of <body> (and removed when parked).
  function markStructural(scope) {
    var views = scope.querySelectorAll ? scope.querySelectorAll('.structural-main-scroll-viewport') : [];
    Array.prototype.forEach.call(views, function (view) { if (view.parentElement && view.parentElement.matches('.main')) set(view.parentElement, 'ts-has-structural-viewport', true); });
  }
  function syncBodyChildren(records) {
    records.forEach(function (record) { Array.prototype.forEach.call(record.addedNodes, function (node) { if (node.nodeType === 1) markStructural(node); }); });
  }
  // body.team-workspace-app:has(#team-canvas-root.tc-focus-mode)
  function syncFocus() { var root = document.getElementById('team-canvas-root'); set(document.body, 'ts-canvas-focus', !!(root && root.classList.contains('tc-focus-mode'))); }
  // #guide-context:has(> .guide-context-text), :has(> #guide_context > .guide-context-text), :has(> #guide_context:empty)
  function syncContext() {
    var context = document.getElementById('guide-context'); if (!context) return;
    var output = null; for (var c = context.firstElementChild; c; c = c.nextElementSibling) if (c.id === 'guide_context') { output = c; break; }
    set(context, 'ts-context-text', hasChild(context, '.guide-context-text'));
    set(context, 'ts-context-output-text', !!output && hasChild(output, '.guide-context-text'));
    set(context, 'ts-context-output-empty', !!output && output.matches(':empty'));
  }
  // .bslib-sidebar-layout:has(.team-library), :has(.team-library-login); .team-library:has(.team-library-login);
  // #team_library_account:has(.team-library-login-placeholder). Sign-in markup only lives inside .team-library.
  function syncLibrary() {
    var library = document.querySelector('.team-library'), login = !!(library && library.querySelector('.team-library-login'));
    var layouts = library ? ancestors(library, '.bslib-sidebar-layout') : [];
    document.querySelectorAll('.bslib-sidebar-layout.ts-has-library').forEach(function (layout) { if (layouts.indexOf(layout) < 0) { set(layout, 'ts-has-library', false); set(layout, 'ts-has-library-login', false); } });
    layouts.forEach(function (layout) { set(layout, 'ts-has-library', true); set(layout, 'ts-has-library-login', login); });
    document.querySelectorAll('.team-library').forEach(function (lib) { set(lib, 'ts-has-library-login', !!lib.querySelector('.team-library-login')); });
    var account = document.getElementById('team_library_account');
    set(account, 'ts-has-login-placeholder', !!(account && account.querySelector('.team-library-login-placeholder')));
  }
  // .tc-scroll:has(> .tc-world-space)
  function syncScroll() { document.querySelectorAll('.tc-scroll').forEach(function (scroll) { set(scroll, 'ts-has-world', hasChild(scroll, '.tc-world-space')); }); }
  // .tc-document-editor:has(.tc-preview-empty) (the editor is built by canvas_preview.js)
  function syncPreview() { document.querySelectorAll('.tc-document-editor').forEach(function (editor) { set(editor, 'ts-preview-empty', !!editor.querySelector('.tc-preview-empty')); }); }

  // Returns true once every observed element exists (the canvas preview editor is built later by
  // canvas_preview.js; its panel is observed so the editor is picked up as soon as it appears).
  function attach() {
    watch(document.querySelector('.team-library'), { childList: true, subtree: true }, syncLibrary);
    watch(document.getElementById('team-canvas-root'), { attributes: true, attributeFilter: ['class'] }, syncFocus);
    watch(document.getElementById('guide-context'), { childList: true, subtree: true, characterData: true }, syncContext);
    document.querySelectorAll('.tc-scroll').forEach(function (scroll) { watch(scroll, { childList: true }, syncScroll); });
    var panel = document.getElementById('tc-preview-panel'), editors = panel ? panel.querySelectorAll('.tc-document-editor') : [];
    watch(panel, { childList: true }, function () { if (panel) panel.querySelectorAll('.tc-document-editor').forEach(function (editor) { watch(editor, { childList: true, subtree: true }, syncPreview); }); });
    Array.prototype.forEach.call(editors, function (editor) { watch(editor, { childList: true, subtree: true }, syncPreview); });
    return !panel || editors.length > 0;
  }

  // Shiny's own stylesheet fades a recalculating pass-through output with
  // `.shiny-panel-conditional:has(> *).recalculating > *, div:where(.shiny-html-output):has(> *).recalculating > *`.
  // A child exists whenever `> *` matches, so dropping `:has(> *)` matches exactly the same elements
  // with the same specificity; the rule is replaced in place to keep its cascade position.
  function replaceShinyFadeRule() {
    var pattern = /:has\(\s*>\s*\*\s*\)(\.recalculating\s*>\s*\*)/g;
    function walk(list, owner) {
      for (var i = 0; i < list.length; i++) {
        var rule = list[i];
        if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules, rule); continue; }
        if (!rule.selectorText || rule.selectorText.indexOf(':has(') < 0 || !/\.recalculating\s*>\s*\*/.test(rule.selectorText)) continue;
        if (!/shiny-panel-conditional|shiny-html-output/.test(rule.selectorText)) continue;
        var selector = rule.selectorText.replace(pattern, '$1');
        if (selector === rule.selectorText || selector.indexOf(':has(') >= 0) continue;
        var text = selector + '{' + rule.style.cssText + '}';
        try { owner.insertRule(text, i); owner.deleteRule(i + 1); } catch (e) { /* keep Shiny's rule */ }
      }
    }
    Array.prototype.forEach.call(document.styleSheets, function (sheet) {
      var rules; try { rules = sheet.cssRules; } catch (e) { return; }
      if (rules) walk(rules, sheet);
    });
  }

  function init() {
    syncStructure(); markStructural(document);
    replaceShinyFadeRule();
    // The Team library lives in the page itself; #team_library_account is inside it.
    var complete = attach();
    watch(document.body, { childList: true }, syncBodyChildren);
    if (!complete && window.jQuery) {
      var retry = function () { if (attach()) jQuery(document).off('shiny:connected shiny:idle', retry); };
      jQuery(document).on('shiny:connected shiny:idle', retry);
    }
    window.addEventListener('load', replaceShinyFadeRule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
