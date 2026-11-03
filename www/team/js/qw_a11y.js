/* Team page semantics: <html lang="en"> and exactly one level-one heading on
   every screen (sign-in, workspace, guided steps, tools). A visible h1 rendered
   by the page wins; otherwise one visually hidden h1 names the current screen.
   The h1 always sits in a landmark (axe "region"): the main landmark when the page
   has one, else a visually hidden <header> (banner) at the top of <body>. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.getAttribute('lang')) root.setAttribute('lang', 'en');
  var ID = 'team-page-title', BANNER = 'team-page-banner', timer = null;

  function shown(el) { return !!el && el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"],[inert]'); }
  function firstShown(selector) { return Array.from(document.querySelectorAll(selector)).find(shown) || null; }
  function text(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function screenName() {
    if (firstShown('.team-library-login')) return 'Sign in';
    var name = text(firstShown('#tw-screen-title')) || text(firstShown('.guide-page .guide-heading h2'));
    if (name) return name;
    var step = document.querySelector('#guide-navigation [aria-current="step"]');
    return step && step.lastChild ? step.lastChild.textContent.trim() : '';
  }
  function place(h) {
    var main = firstShown('main,[role="main"]'), banner = document.getElementById(BANNER);
    if (main) {
      if (h.parentNode !== main) main.insertBefore(h, main.firstChild);
      if (banner) banner.remove();
      return;
    }
    if (!banner) { banner = document.createElement('header'); banner.id = BANNER; banner.className = 'qw-visually-hidden'; }
    if (banner.parentNode !== document.body) document.body.insertBefore(banner, document.body.firstChild);
    if (h.parentNode !== banner) banner.appendChild(h);
  }
  // The sign-in card opens with an h3 (project_library.R). With only the h1 above
  // it, expose it as level 2 so headings do not skip a level (axe "heading-order").
  function signInLevel() {
    var card = document.querySelector('.team-library'), h3 = card && card.querySelector('h1,h2,h3,h4,h5,h6');
    if (!h3 || h3.tagName !== 'H3') return;
    var h2Before = Array.from(document.querySelectorAll('h2,[role="heading"][aria-level="2"]')).some(function (n) {
      return n !== h3 && shown(n) && !!(n.compareDocumentPosition(h3) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    if (!h2Before) {
      if (h3.getAttribute('role') !== 'heading') h3.setAttribute('role', 'heading');
      if (h3.getAttribute('aria-level') !== '2') h3.setAttribute('aria-level', '2');
      if (!h3.hasAttribute('data-qw-level')) h3.setAttribute('data-qw-level', '2');
    } else if (h3.hasAttribute('data-qw-level')) {
      h3.removeAttribute('role'); h3.removeAttribute('aria-level'); h3.removeAttribute('data-qw-level');
    }
  }
  function sync() {
    timer = null;
    var h = document.getElementById(ID);
    if (!h) { h = document.createElement('h1'); h.id = ID; h.className = 'qw-visually-hidden'; }
    place(h);
    var others = Array.from(document.querySelectorAll('h1')).some(function (n) { return n !== h && shown(n); });
    // Only touch attributes that change, so the observer below does not loop.
    if (h.hidden !== others) h.hidden = others;
    var name = screenName(), title = 'Lipidomic Explorer' + (name ? ': ' + name : '');
    if (h.textContent !== title) h.textContent = title;
    signInLevel();
  }
  function schedule() { if (!timer) timer = setTimeout(sync, 250); }
  // Canvas boards, plots and the minimap change constantly (drag, pan, hover) and never
  // decide the screen name, so their mutations do not schedule a heading check.
  var CHURN = '.tc-board,.js-plotly-plot,.tc-map,.plot-container';
  function relevant(records) {
    return records.some(function (r) { var t = r.target; return !(t.nodeType === 1 && t.closest(CHURN)); });
  }
  function start() {
    sync();
    new MutationObserver(function (records) { if (relevant(records)) schedule(); }).observe(document.body, {childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'hidden', 'role', 'aria-current', 'data-tw-screen', 'data-guide-step', 'data-team-authenticated']});
    window.addEventListener('resize', schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
