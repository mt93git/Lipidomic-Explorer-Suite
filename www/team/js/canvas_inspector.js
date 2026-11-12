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
    // Data hosts the card's module content (card_figure.js); Appearance keeps the moved
    // .tc-settings; Statistics hosts a node's .tc-statistics panel or explains why it has none;
    // Export holds the card's downloads (moved, or mirrored by canvas_inspector_export.js).
    var tabs = document.createElement('div'); tabs.className = 'tc-inspector-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Property groups');
    var statsBody = document.createElement('div'); statsBody.className = 'tc-inspector-body tc-inspector-statistics';
    var dataBody = document.createElement('div'); dataBody.className = 'tc-inspector-body tc-inspector-data';
    var exportBody = document.createElement('div'); exportBody.className = 'tc-inspector-body tc-inspector-export';
    var activeTab = 'appearance', movedStats = null, statsHome = null, movedPca = null, pcaHome = null, movedData = [], dataPending = 0;
    var tabList = [['data', 'Data', dataBody], ['appearance', 'Appearance', body], ['statistics', 'Statistics', statsBody], ['export', 'Export', exportBody]].map(function (spec) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'tc-inspector-tab'; button.textContent = spec[1];
      button.id = 'tc-inspector-tab-' + spec[0]; spec[2].id = 'tc-inspector-panel-' + spec[0];
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', spec[2].id); spec[2].setAttribute('role', 'tabpanel'); spec[2].setAttribute('aria-labelledby', button.id);
      button.addEventListener('click', function () { activeTab = spec[0]; state(); });
      tabs.appendChild(button); return {key: spec[0], button: button, panel: spec[2]};
    });
    tabs.addEventListener('keydown', function (event) {
      // A finished figure offers only Export: arrows move among the tabs on offer.
      var shown = tabList.filter(function (t) { return !t.button.hidden; });
      var index = shown.findIndex(function (t) { return t.button === document.activeElement; }), next = index;
      if (index < 0) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = (index + (event.key === 'ArrowRight' ? 1 : shown.length - 1)) % shown.length;
      else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = shown.length - 1; else return;
      event.preventDefault(); activeTab = shown[next].key; state(); shown[next].button.focus();
    });
    inspector.append(header, tabs, locked, dataBody, body, statsBody, exportBody);
    layout.insertBefore(inspector, layout.querySelector('.tc-main')); root.classList.add('tc-contextual-editing');
    var trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'tc-properties-toggle'; trigger.textContent = 'Properties'; trigger.disabled = true;
    trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', inspector.id); root.querySelector('.tc-toolbar').appendChild(trigger);
    // The floating panel also sizes the inspector within its column (the shell's
    // companion home depends on it), so it stays on in the shell too.
    function floating() { return !!window.TeamCanvasFloatingPanel; }
    function release() {
      if (moved && home && home.parentNode) home.replaceWith(moved); else if (moved) moved.remove(); moved = home = null;
      if (movedStats && statsHome && statsHome.parentNode) statsHome.replaceWith(movedStats); else if (movedStats) movedStats.remove(); movedStats = statsHome = null;
      if (movedPca && pcaHome && pcaHome.parentNode) pcaHome.replaceWith(movedPca); else if (movedPca) movedPca.remove(); movedPca = pcaHome = null;
      statsBody.textContent = '';
      movedData.forEach(function (m) { if (m.home.parentNode) m.home.replaceWith(m.el); else dropOrphan(m.el); }); movedData = [];
      dataBody.textContent = ''; exportBody.textContent = '';
    }
    // Download rows (plot image buttons, Plot data CSV, module download links) go to Export.
    function exportRow(el) { return !!(window.TeamInspectorExport && TeamInspectorExport.isExport(el)); }
    function renderExport() { if (window.TeamInspectorExport && node) TeamInspectorExport.render(node, exportBody, dataBody); }
    // The card's source content was replaced (renderUI refresh, return) while
    // its controls sat here: unbind them so Shiny never sees duplicate ids.
    function dropOrphan(el) { if (window.Shiny && Shiny.unbindAll) Shiny.unbindAll(el, true); el.remove(); }
    function pruneOrphans() { movedData = movedData.filter(function (m) { if (m.home.isConnected) return true; dropOrphan(m.el); return false; }); }
    function fillData(n) {
      var chrome = window.TeamCardFigure ? window.TeamCardFigure.chrome(n) : [], settings = n.querySelector('[data-canvas-data-settings]');
      if (settings) {
        var more = document.createElement('button'); more.type = 'button'; more.className = 'tc-inspector-data-settings'; more.textContent = 'Data & settings';
        more.onclick = function () { settings.click(); }; dataBody.appendChild(more);
      }
      // Retry for a while (time, not mutation count) while the plot is still rendering.
      dataPending = !chrome.length && !n.querySelector('.gc-root') ? Date.now() + 15000 : 0;
      chrome.forEach(function (el) { var home = document.createComment('card-figure-chrome'); el.before(home); movedData.push({el: el, home: home}); el.inert = false; (el.classList.contains('rd-pca-score') ? statsBody : exportRow(el) ? exportBody : dataBody).appendChild(el); });
      // Downloads went to Export: a card whose only chrome was a download row still explains Data.
      if (!chrome.length || !dataBody.querySelector(':scope > :not(.tc-inspector-data-settings)')) {
        var note = document.createElement('p'); note.className = 'tc-inspector-data-note';
        note.textContent = n.querySelector('.gc-root') ? 'Group comparison keeps its data controls on the figure.' : 'This figure has no data controls.';
        dataBody.appendChild(note);
      }
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
      // PCA cards carry a PCA score analysis panel (moved here from the card by fillData).
      if (/pca/i.test(id) && n.querySelector('.rd-pca-score')) return;
      note.textContent = /pca/i.test(id) ? 'PCA is an exploratory ordination without a group test, so no significance annotations are added.' :
        id === 'results_dashboard-plot_violin' ? 'Statistics run on independent canvas copies. Remove this plot, then add the violin plot from the catalog to create a copy.' :
        'Statistics are available for independent copies of the Results dashboard violin plot. This view does not support canvas statistics; use its analysis controls for any tests it provides.';
      statsBody.appendChild(note);
    }
    function focusFirstControl() {
      if (!locked.hidden) { edit.focus(); return; }
      var open = tabList.find(function (t) { return t.key === activeTab && !t.panel.hidden; }), panel = open ? open.panel : body;
      var controls = Array.from(panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'));
      var first = controls.find(function (control) { return control.getClientRects().length > 0 && !control.closest('[hidden]') && !control.closest('[inert]'); });
      (first || close).focus();
    }
    function focusSafe() {
      if (trigger.isConnected && !trigger.disabled && trigger.offsetParent) { trigger.focus(); return; }
      // In the shell the Properties toggle is hidden: go back to the card's header.
      // In the shell the Properties toggle is hidden; focusing the card would select it again
      // (and the shell re-opens the inspector on selection), so use the floating toolbar.
      var tool = root.querySelector('.ts-tools button:not(:disabled)'); if (tool && tool.offsetParent) { tool.focus(); return; }
      var fallback = root.querySelector('.tc-toolbar button:not(:disabled)');
      if (fallback) { fallback.focus(); return; }
      root.tabIndex = -1; root.focus();
    }
    function state() {
      pruneOrphans();
      if (!node) return;
      if (!node.isConnected) { node = null; trigger.disabled = true; hide(); return; }
      heading.textContent = (node.querySelector('.tc-node-head strong') || {}).textContent || 'Selected object';
      var finished = node.classList.contains('tc-finished'), focusedControl = finished && (body.contains(document.activeElement) || statsBody.contains(document.activeElement));
      var plot = !node.classList.contains('tc-illustration');
      // A finished plot keeps its downloads (Export); illustrations have Appearance only.
      function offered(key) { return plot ? !finished || key === 'export' : key === 'appearance' && !finished; }
      if (!offered(activeTab)) activeTab = plot && finished ? 'export' : 'appearance';
      // The retry window starts when the card becomes editable, not when it was selected.
      if (!finished && node.__tcWasFinished && !movedData.length) dataPending = Date.now() + 15000;
      node.__tcWasFinished = finished;
      // A finished card that becomes editable (Edit) gains module content: fill Data
      // then, retrying while its plot is still rendering.
      if (plot && !finished && !movedData.length && dataPending && Date.now() < dataPending && !inspector.hidden) { var until = dataPending; dataBody.textContent = ''; fillData(node); dataPending = movedData.length ? 0 : until; }
      locked.hidden = !finished; tabs.hidden = !plot; body.inert = statsBody.inert = dataBody.inert = finished;
      tabList.forEach(function (t) { var on = t.key === activeTab && offered(t.key); t.button.hidden = !offered(t.key); t.button.setAttribute('aria-selected', String(on)); t.button.tabIndex = on ? 0 : -1; t.panel.hidden = !on; });
      renderExport();
      if (focusedControl) edit.focus();
    }
    // A window 'resize' makes Shiny re-measure and re-theme every output on the page,
    // including the hidden classic tabs: one 1.7 s task here (about 10 s at 4x CPU
    // throttling). Opening or closing the inspector rarely changes any size (the shell
    // reserves its column), so send it only when the canvas viewport changed size or an
    // output now in the inspector has a size Shiny has not been told about.
    function canvasSize() { var s = root.querySelector('.tc-scroll'); return s ? s.clientWidth + 'x' + s.clientHeight : ''; }
    function outputsStale() {
      var known = window.Shiny && Shiny.shinyapp && Shiny.shinyapp.$inputValues; if (!known) return true;
      return Array.from(inspector.querySelectorAll('.shiny-image-output[id],.shiny-plot-output[id],.shiny-report-size[id]')).some(function (el) {
        var r = el.getBoundingClientRect(); if (!r.width && !r.height) return false;
        var w = known['.clientdata_output_' + el.id + '_width'], h = known['.clientdata_output_' + el.id + '_height'];
        return !(Math.abs(w - r.width) < 0.5 && Math.abs(h - r.height) < 0.5);
      });
    }
    function resizeIfChanged(before) { if (canvasSize() !== before || outputsStale()) window.dispatchEvent(new Event('resize')); }
    function hide() {
      var focusWasInInspector = inspector.contains(document.activeElement) || (moved && moved.contains(document.activeElement)) || (movedStats && movedStats.contains(document.activeElement)) || movedData.some(function (m) { return m.el.contains(document.activeElement); });
      var sizeBefore = canvasSize();
      if (floating()) window.TeamCanvasFloatingPanel.close(inspector);
      release(); inspector.hidden = true; layout.classList.remove('tc-inspecting'); trigger.setAttribute('aria-expanded', 'false'); root.querySelectorAll('.tc-node.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
      if (focusWasInInspector) focusSafe();
      resizeIfChanged(sizeBefore);
      // Let the companion re-place itself now that the column is free (not a selection change:
      // the shell re-opens the inspector on those).
      window.dispatchEvent(new CustomEvent('team-canvas-inspector-closed'));
      requestAnimationFrame(function () { window.dispatchEvent(new CustomEvent('team-canvas-inspector-closed')); });
    }
    function select(next, focusControls) {
      if (!next || !next.isConnected) return;
      if (node === next && !inspector.hidden) { state(); if (floating()) window.TeamCanvasFloatingPanel.open(inspector, node); if (focusControls) focusFirstControl(); return; }
      var focusWasInMovedControl = (moved && moved.contains(document.activeElement)) || (movedStats && movedStats.contains(document.activeElement)) || movedData.some(function (m) { return m.el.contains(document.activeElement); });
      var sizeBefore = canvasSize();
      release(); root.querySelectorAll('.tc-node.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
      node = next; node.classList.add('is-selected');
      moved = node.querySelector(':scope > .tc-settings') || (node.classList.contains('tc-illustration') && node.querySelector('.tc-content > .tc-edit'));
      if (moved) { home = document.createComment('property-controls'); moved.before(home); body.appendChild(moved); if (moved.tagName === 'DETAILS') moved.open = true; }
      movedStats = node.querySelector(':scope > .tc-statistics');
      if (movedStats) { statsHome = document.createComment('statistics-controls'); movedStats.before(statsHome); statsBody.appendChild(movedStats); }
      else {
        // A PCA card keeps its PCA score analysis panel in the card's hidden module host: show it under Statistics.
        var pm = /^(.*)-plot_pca$/.exec(node.dataset.plotId || ''), ph = pm && document.getElementById(pm[1] + '_host'), pp = ph && ph.querySelector('.rd-pca-score');
        if (pp) { movedPca = pp; pcaHome = document.createComment('pca-score-panel'); pp.before(pcaHome); statsBody.appendChild(pp); }
        else if (!node.classList.contains('tc-illustration')) explainStatistics(node);
      }
      if (!node.classList.contains('tc-illustration')) fillData(node);
      window.dispatchEvent(new CustomEvent('team-canvas-panel-open', {detail:{kind:'appearance'}}));
      inspector.hidden = false; layout.classList.add('tc-inspecting'); trigger.disabled = false; trigger.setAttribute('aria-expanded', 'true'); state(); inspector.scrollTop = 0;
      if (floating()) window.TeamCanvasFloatingPanel.open(inspector, node);
      if (focusControls || focusWasInMovedControl) focusFirstControl();
      resizeIfChanged(sizeBefore);
    }
    root.addEventListener('pointerdown', function () { pointerActive = true; }, true);
    document.addEventListener('pointerup', function () { setTimeout(function(){pointerActive=false;},0); }, true);
    document.addEventListener('pointercancel', function () { pointerActive = false; }, true);
    window.addEventListener('blur', function () { pointerActive = false; });
    // Native Group controls already own their interaction and report. Do not
    // open Appearance on focus/click or move its controls under the pointer.
    function ownGroupControls(event){var own=event.target.closest('.gc-controls,.gc-inspector');if(!own)return false;if(window.TeamInspectorExport&&TeamInspectorExport.mirroring&&TeamInspectorExport.mirroring())return true;/* an Export mirror ran this download: keep the inspector open */var next=own.closest('.tc-node');if(next){if(!inspector.hidden)hide();node=next;trigger.disabled=false;}return true;}
    root.addEventListener('click', function (event) { if(ownGroupControls(event))return;var next = event.target.closest('.tc-node'); if (next && !event.target.closest('[data-canvas-data-settings]')) select(next); });
    root.addEventListener('focusin', function (event) { if(ownGroupControls(event))return;var next = event.target.closest('.tc-node'); if (next && !pointerActive && !event.target.closest('[data-canvas-data-settings]')) select(next); });
    window.addEventListener('team-canvas-selection', function (event) {
      if (event.detail) { var found = Array.from(root.querySelectorAll('.tc-node')).find(function (n) { return n.dataset.plotId === event.detail.id; }); if (found && node === found && !inspector.hidden) state(); }
      else if (node && !node.isConnected) state();
    });
    window.addEventListener('team-canvas-panel-open', function (event) { if (event.detail && event.detail.kind !== 'appearance') hide(); });
    window.addEventListener('team-document-restored', function () { node = null; trigger.disabled = true; hide(); });
    // Plotly's own class churn inside plots does not change the inspector's state.
    new MutationObserver(function (records) { if (records.some(function (r) { return r.type === 'childList' || !(r.target.closest && r.target.closest('.js-plotly-plot')); })) state(); }).observe(root.querySelector('.tc-board'), {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
    close.onclick = hide; trigger.onclick = function () { var auto = trigger.dataset.autoOpen === 'true'; delete trigger.dataset.autoOpen; if (inspector.hidden) select(node, !auto); else hide(); };
    edit.onclick = function () { var button = node && Array.from(node.querySelectorAll('.tc-node-head button')).find(function (b) { return b.textContent === 'Edit'; }); if (button) { button.click(); state(); } };
    var libraryToggle = root.querySelector('.tc-library-toggle'); if (libraryToggle) libraryToggle.addEventListener('click', hide);
    inspector.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !event.defaultPrevented) { var sel = event.target.closest && event.target.closest('.selectize-control'); if (sel && sel.querySelector('.selectize-input.dropdown-active')) return; /* Esc closes the open dropdown first */ event.stopPropagation(); hide(); /* hide() already returned focus (to the card header in the shell, where the Properties toggle is hidden and focusing it re-opened the inspector). */ if (trigger.offsetParent) trigger.focus(); } });
    // Esc after selecting a card (focus in the canvas or nowhere; not in a field, menu, dialog or focus mode) deselects it.
    document.addEventListener('keydown', function (event) { if (event.key !== 'Escape' || event.defaultPrevented || root.classList.contains('tc-focus-mode') || !root.querySelector('.tc-node.is-selected')) return; var t = event.target; if (t !== document.body && !root.contains(t)) return; if (t.closest && t.closest('input,textarea,select,[contenteditable="true"],.selectize-control,[role="menu"],dialog')) return; if (document.querySelector('.modal.show,dialog[open]')) return; if (window.TeamCanvas && TeamCanvas.deselect) TeamCanvas.deselect(); hide(); });
    var selected = window.TeamCanvas && TeamCanvas.selected();
    if (selected) select(Array.from(root.querySelectorAll('.tc-node')).find(function (n) { return n.dataset.plotId === selected.id; }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
