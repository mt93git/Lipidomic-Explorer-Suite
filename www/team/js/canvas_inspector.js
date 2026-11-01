/* One contextual property panel; move existing controls, never clone their bindings. */
(function () {
  'use strict';
  function init() {
    var root = document.getElementById('team-canvas-root'), layout = root && root.querySelector('.tc-layout');
    if (!layout) return;
    var node = null, moved = null, home = null, pointerActive = false;
    var inspector = document.createElement('aside'); inspector.id = 'tc-selection-inspector'; inspector.className = 'tc-selection-inspector'; inspector.hidden = true;
    inspector.setAttribute('aria-label', 'Selected canvas object properties'); inspector.setAttribute('role', 'dialog'); inspector.setAttribute('aria-labelledby', 'tc-inspector-title');
    var header = document.createElement('div'); header.className = 'tc-inspector-header';
    var heading = document.createElement('h3'); heading.id = 'tc-inspector-title';
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Close object properties');
    header.append(heading, close);
    var locked = document.createElement('div'); locked.className = 'tc-inspector-locked';
    var note = document.createElement('p'); note.textContent = 'Finished figure. Choose Edit to make changes.';
    var edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit figure'; locked.append(note, edit);
    var body = document.createElement('div'); body.className = 'tc-inspector-body';
    // Appearance keeps the moved .tc-settings; Statistics hosts a node's .tc-statistics panel or explains why it has none.
    var tabs = document.createElement('div'); tabs.className = 'tc-inspector-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Property groups');
    var statsBody = document.createElement('div'); statsBody.className = 'tc-inspector-body tc-inspector-statistics';
    var activeTab = 'appearance', movedStats = null, statsHome = null;
    var tabList = [['appearance', 'Appearance', body], ['statistics', 'Statistics', statsBody]].map(function (spec) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'tc-inspector-tab'; button.textContent = spec[1];
      button.id = 'tc-inspector-tab-' + spec[0]; spec[2].id = 'tc-inspector-panel-' + spec[0];
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', spec[2].id); spec[2].setAttribute('role', 'tabpanel'); spec[2].setAttribute('aria-labelledby', button.id);
      button.addEventListener('click', function () { activeTab = spec[0]; state(); });
      tabs.appendChild(button); return {key: spec[0], button: button, panel: spec[2]};
    });
    tabs.addEventListener('keydown', function (event) {
      var index = tabList.findIndex(function (t) { return t.button === document.activeElement; }), next = index;
      if (index < 0) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = (index + (event.key === 'ArrowRight' ? 1 : tabList.length - 1)) % tabList.length;
      else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = tabList.length - 1; else return;
      event.preventDefault(); activeTab = tabList[next].key; state(); tabList[next].button.focus();
    });
    inspector.append(header, tabs, locked, body, statsBody);
    layout.insertBefore(inspector, layout.querySelector('.tc-main')); root.classList.add('tc-contextual-editing');
    var trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'tc-properties-toggle'; trigger.textContent = 'Properties'; trigger.disabled = true;
    trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', inspector.id); root.querySelector('.tc-toolbar').appendChild(trigger);
    function release() {
      if (moved && home && home.parentNode) home.replaceWith(moved); else if (moved) moved.remove(); moved = home = null;
      if (movedStats && statsHome && statsHome.parentNode) statsHome.replaceWith(movedStats); else if (movedStats) movedStats.remove(); movedStats = statsHome = null;
      statsBody.textContent = '';
    }
    function explainStatistics(n) {
      var id = n.dataset.plotId || '', note = document.createElement('p');
      if(n.querySelector('.gc-root')){
        note.className='tc-statistics-context-note';note.textContent='Group comparison has its own statistics, selected test and full report. Open those controls on the figure.';statsBody.appendChild(note);
        var open=document.createElement('button');open.type='button';open.textContent='Show Group comparison report';open.onclick=function(){
          hide();var details=n.querySelector('.gc-statistics');if(!details)return;details.open=true;
          var report=n.querySelector('.gc-report'),button=Array.from(details.querySelectorAll('button')).find(function(b){return b.textContent==='Show full statistical report';});
          if(!report&&button&&!button.disabled)button.click();
          requestAnimationFrame(function(){var current=n.querySelector('.gc-statistics');if(current)current.open=true;var target=n.querySelector('.gc-report')||(current&&current.querySelector('summary'));if(target){target.tabIndex=-1;target.scrollIntoView({block:'nearest'});target.focus();}});
        };statsBody.appendChild(open);return;
      }
      note.className = 'tc-statistics-unsupported';
      note.textContent = /pca/i.test(id) ? 'PCA is an exploratory ordination without a group test, so no significance annotations are added.' :
        id === 'results_dashboard-plot_violin' ? 'Statistics run on independent canvas copies. Remove this plot, then add the violin plot from the catalog to create a copy.' :
        'Statistics are available for independent copies of the Results dashboard violin plot. This view does not support canvas statistics; use its analysis controls for any tests it provides.';
      statsBody.appendChild(note);
    }
    function focusFirstControl() {
      if (!locked.hidden) { edit.focus(); return; }
      var controls = Array.from((activeTab === 'statistics' && !statsBody.hidden ? statsBody : body).querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'));
      var first = controls.find(function (control) { return control.getClientRects().length > 0 && !control.closest('[hidden]') && !control.closest('[inert]'); });
      (first || close).focus();
    }
    function focusSafe() {
      if (trigger.isConnected && !trigger.disabled) { trigger.focus(); return; }
      var fallback = root.querySelector('.tc-toolbar button:not(:disabled)');
      if (fallback) { fallback.focus(); return; }
      root.tabIndex = -1; root.focus();
    }
    function state() {
      if (!node) return;
      if (!node.isConnected) { node = null; trigger.disabled = true; hide(); return; }
      heading.textContent = (node.querySelector('.tc-node-head strong') || {}).textContent || 'Selected object';
      var finished = node.classList.contains('tc-finished'), focusedControl = finished && (body.contains(document.activeElement) || statsBody.contains(document.activeElement));
      var plot = !node.classList.contains('tc-illustration'); if (!plot) activeTab = 'appearance';
      locked.hidden = !finished; tabs.hidden = finished || !plot; body.inert = statsBody.inert = finished;
      tabList.forEach(function (t) { var on = t.key === activeTab; t.button.setAttribute('aria-selected', String(on)); t.button.tabIndex = on ? 0 : -1; t.panel.hidden = finished || !on; });
      if (focusedControl) edit.focus();
    }
    function hide() {
      var focusWasInInspector = inspector.contains(document.activeElement) || (moved && moved.contains(document.activeElement)) || (movedStats && movedStats.contains(document.activeElement));
      if (window.TeamCanvasFloatingPanel) window.TeamCanvasFloatingPanel.close(inspector);
      release(); inspector.hidden = true; layout.classList.remove('tc-inspecting'); trigger.setAttribute('aria-expanded', 'false'); root.querySelectorAll('.tc-node.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
      if (focusWasInInspector) focusSafe();
      window.dispatchEvent(new Event('resize'));
    }
    function select(next, focusControls) {
      if (!next || !next.isConnected) return;
      if (node === next && !inspector.hidden) { state(); if (window.TeamCanvasFloatingPanel) window.TeamCanvasFloatingPanel.open(inspector, node); if (focusControls) focusFirstControl(); return; }
      var focusWasInMovedControl = (moved && moved.contains(document.activeElement)) || (movedStats && movedStats.contains(document.activeElement));
      release(); root.querySelectorAll('.tc-node.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
      node = next; node.classList.add('is-selected');
      moved = node.querySelector(':scope > .tc-settings') || (node.classList.contains('tc-illustration') && node.querySelector('.tc-content > .tc-edit'));
      if (moved) { home = document.createComment('property-controls'); moved.before(home); body.appendChild(moved); if (moved.tagName === 'DETAILS') moved.open = true; }
      movedStats = node.querySelector(':scope > .tc-statistics');
      if (movedStats) { statsHome = document.createComment('statistics-controls'); movedStats.before(statsHome); statsBody.appendChild(movedStats); }
      else if (!node.classList.contains('tc-illustration')) explainStatistics(node);
      window.dispatchEvent(new CustomEvent('team-canvas-panel-open', {detail:{kind:'appearance'}}));
      inspector.hidden = false; layout.classList.add('tc-inspecting'); trigger.disabled = false; trigger.setAttribute('aria-expanded', 'true'); state(); inspector.scrollTop = 0;
      if (window.TeamCanvasFloatingPanel) window.TeamCanvasFloatingPanel.open(inspector, node);
      if (focusControls || focusWasInMovedControl) focusFirstControl();
      window.dispatchEvent(new Event('resize'));
    }
    root.addEventListener('pointerdown', function () { pointerActive = true; }, true);
    document.addEventListener('pointerup', function () { setTimeout(function(){pointerActive=false;},0); }, true);
    document.addEventListener('pointercancel', function () { pointerActive = false; }, true);
    window.addEventListener('blur', function () { pointerActive = false; });
    // Native Group controls already own their interaction and report. Do not
    // open Appearance on focus/click or move its controls under the pointer.
    function ownGroupControls(event){var own=event.target.closest('.gc-controls,.gc-inspector');if(!own)return false;var next=own.closest('.tc-node');if(next){if(!inspector.hidden)hide();node=next;trigger.disabled=false;}return true;}
    root.addEventListener('click', function (event) { if(ownGroupControls(event))return;var next = event.target.closest('.tc-node'); if (next && !event.target.closest('[data-canvas-data-settings]')) select(next); });
    root.addEventListener('focusin', function (event) { if(ownGroupControls(event))return;var next = event.target.closest('.tc-node'); if (next && !pointerActive && !event.target.closest('[data-canvas-data-settings]')) select(next); });
    window.addEventListener('team-canvas-selection', function (event) {
      if (event.detail) { var found = Array.from(root.querySelectorAll('.tc-node')).find(function (n) { return n.dataset.plotId === event.detail.id; }); if (found && node === found && !inspector.hidden) state(); }
      else if (node && !node.isConnected) state();
    });
    window.addEventListener('team-canvas-panel-open', function (event) { if (event.detail && event.detail.kind !== 'appearance') hide(); });
    window.addEventListener('team-document-restored', function () { node = null; trigger.disabled = true; hide(); });
    new MutationObserver(state).observe(root.querySelector('.tc-board'), {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
    close.onclick = hide; trigger.onclick = function () { if (inspector.hidden) select(node, true); else hide(); };
    edit.onclick = function () { var button = node && Array.from(node.querySelectorAll('.tc-node-head button')).find(function (b) { return b.textContent === 'Edit'; }); if (button) { button.click(); state(); } };
    var libraryToggle = root.querySelector('.tc-library-toggle'); if (libraryToggle) libraryToggle.addEventListener('click', hide);
    inspector.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); hide(); trigger.focus(); } });
    var selected = window.TeamCanvas && TeamCanvas.selected();
    if (selected) select(Array.from(root.querySelectorAll('.tc-node')).find(function (n) { return n.dataset.plotId === selected.id; }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
