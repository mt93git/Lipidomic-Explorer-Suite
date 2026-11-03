(function () {
  'use strict';

  // Team companion guidance: proactive tips, per-chart Explain / Suggest and
  // offline Q&A over the reviewed text in companion_guidance_data.js.
  // Everything here is local: no network request, no model call. Suggestions
  // only change presentation or open a control; scientific settings are left
  // to the person (or to the server's propose/confirm flow).
  // The Team flag is set by a later head script, so check it when the page is ready.
  function enabled() { return window.LIPIDOMIC_TEAM_WORKSPACE === true || window.LIPIDOMIC_TEAM_WORKSPACE === '1'; }
  var G = window.LipidomicCompanionGuidance;
  if (!G) return;

  var FEWER_KEY = 'lipidomic-companion-fewer-tips', SEEN_KEY = 'lipidomic-companion-tips-seen';
  var state = {stage: 'data', substep: 'data-choice', legacyStep: 1, authenticated: false, selected: null, figure: false};
  var tipEl = null, collapseTimer = null, placeQueued = false, lastContext = '', dockObserver = null, observedDock = null;

  function store(fn, fallback) { try { return fn(window.localStorage); } catch (_) { return fallback; } }
  function fewer() { return store(function (s) { return s.getItem(FEWER_KEY) === '1'; }, false); }
  function setFewer(on) { store(function (s) { s.setItem(FEWER_KEY, on ? '1' : '0'); }); }
  function seenList() { return store(function (s) { var v = JSON.parse(s.getItem(SEEN_KEY) || '[]'); return Array.isArray(v) ? v : []; }, []); }
  function seen(id) { return seenList().indexOf(id) >= 0; }
  function markSeen(id) { store(function (s) { var v = seenList(); if (v.indexOf(id) < 0) v.push(id); s.setItem(SEEN_KEY, JSON.stringify(v.slice(-200))); }); }
  function node(tag, cls, text) { var el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
  function button(label, cls, onclick) { var b = node('button', cls || 'cg-button', label); b.type = 'button'; b.addEventListener('click', onclick); return b; }

  // ------------------------------------------------------------ chart lookup
  var catalogList = function () { return window.TeamCanvasCatalog && window.TeamCanvasCatalog.list || []; };
  // Card ids are catalog ids, or `tcinstance_<id>-<output>` for independent copies.
  function sourceOf(id) {
    if (!id) return null;
    if (G.charts[id]) return id;
    var suffix = String(id).replace(/^tcinstance_[^-]+-/, '');
    var matches = catalogList().filter(function (e) { return e.id.slice(e.id.indexOf('-') + 1) === suffix || e.id === suffix; });
    if (matches.length === 1) return matches[0].id;
    try {
      var saved = window.TeamCanvas && TeamCanvas.serialize().nodes.find(function (n) { return n.id === id; });
      if (saved && saved.instance && G.charts[saved.instance.source]) return saved.instance.source;
    } catch (_) {}
    return null;
  }
  function chartInfo(source) {
    var entry = catalogList().find(function (e) { return e.id === source; }) || {};
    var c = G.charts[source];
    return c ? {id: source, title: entry.title || source, category: (G.categories[c.cat] || {}).label || entry.category || '', c: c} : null;
  }
  function cardNode(id) { return Array.prototype.find.call(document.querySelectorAll('#team-canvas-root .tc-node[data-plot-id]'), function (n) { return n.dataset.plotId === id; }) || null; }

  // ------------------------------------------------------------- tip bubble
  function context() {
    if (!state.authenticated) return null;
    if (state.stage === 'canvas') {
      if (state.legacyStep === 7) return 'save';
      if (state.legacyStep === 6) return 'cell';
      if (state.figure) return 'figure';
      if (state.selected) return 'card';
      return document.querySelector('#team-canvas-root .tc-node') ? 'canvas' : 'canvas-empty';
    }
    if (state.stage === 'review') return 'review';
    return G.tips[state.substep] ? state.substep : 'data-choice';
  }
  function featureAvailable(name) {
    if (name === 'canvas-tabs') return !!document.querySelector('#team-canvas-root [data-canvas-tabs], #team-canvas-root .tc-canvas-tabs, #team-canvas-root [role="tablist"][aria-label*="anvas"]');
    return true;
  }
  function pickTip(key) {
    var list = (G.tips[key] || []).filter(function (t) { return !t.requires || featureAvailable(t.requires); });
    if (key === 'card' && state.selected) {
      var info = chartInfo(state.selected.source);
      var id = 'card:' + (state.selected.source || 'unknown');
      var text = info ? info.title + ': ' + firstSentence(info.c.what) : list[0].text;
      return {id: id, title: info ? 'About this chart' : 'Selected card', text: text, card: true, info: info};
    }
    return list.find(function (t) { return !seen(t.id); }) || null;
  }
  function firstSentence(s) { var m = String(s || '').match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(s || '')).trim(); }
  function dock() { var d = document.getElementById('lipidomic-companion'); return d && !d.hidden && d.getClientRects().length && getComputedStyle(d).visibility !== 'hidden' ? d : null; }

  function removeTip() { clearTimeout(collapseTimer); if (tipEl) tipEl.remove(); tipEl = null; }
  function render(force) {
    var key = context();
    var signature = key + '|' + (state.selected && state.selected.id || '');
    if (!force && signature === lastContext && tipEl) { schedulePlace(); return; }
    lastContext = signature;
    removeTip();
    if (!key || !dock()) return;
    var tip = pickTip(key);
    if (!tip) return;
    // Cards always keep a small entry point to Explain / Suggest; other tips
    // appear once, and not at all when the person chose fewer tips.
    var expand = !fewer() && !seen(tip.id);
    if (!expand && !tip.card) return;
    tipEl = node('section', 'cg-tip');
    tipEl.setAttribute('role', 'status'); tipEl.setAttribute('aria-live', 'polite'); tipEl.setAttribute('aria-label', 'Companion tip');
    tipEl.dataset.tipId = tip.id; tipEl.dataset.context = key;
    var pill = button(tip.card ? 'About this chart' : 'Tip', 'cg-pill', function () { setCollapsed(false); });
    pill.setAttribute('aria-expanded', 'false');
    var body = node('div', 'cg-body');
    var head = node('div', 'cg-head');
    head.appendChild(node('strong', 'cg-title', tip.title));
    var collapse = button('–', 'cg-icon', function () { setCollapsed(true); }); collapse.setAttribute('aria-label', 'Collapse tip');
    var close = button('×', 'cg-icon', function () { markSeen(tip.id); removeTip(); }); close.setAttribute('aria-label', 'Dismiss tip');
    head.appendChild(collapse); head.appendChild(close); body.appendChild(head);
    body.appendChild(node('p', 'cg-text', tip.text));
    if (tip.card && tip.info) {
      var row = node('div', 'cg-actions');
      row.appendChild(button('Explain this chart', 'cg-button cg-primary', function () { explain(state.selected.id); }));
      row.appendChild(button('Suggest improvements', 'cg-button', function () { suggest(state.selected.id); }));
      body.appendChild(row);
    }
    body.appendChild(fewerToggle(function (on) { if (on && !tip.card) removeTip(); }));
    tipEl.appendChild(pill); tipEl.appendChild(body);
    tipEl.addEventListener('pointerenter', function () { clearTimeout(collapseTimer); });
    tipEl.addEventListener('focusin', function () { clearTimeout(collapseTimer); });
    tipEl.addEventListener('pointerleave', armCollapse);
    tipEl.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); setCollapsed(true); pill.focus(); } });
    document.body.appendChild(tipEl);
    setCollapsed(!expand);
    if (expand) { markSeen(tip.id); armCollapse(); }
  }
  // The same preference is offered on every tip and in the chat panel.
  function fewerToggle(after) {
    var label = node('label', 'cg-fewer'), box = node('input'); box.type = 'checkbox'; box.checked = fewer();
    box.addEventListener('change', function () { setFewer(box.checked); syncToggles(); if (after) after(box.checked); });
    label.appendChild(box); label.appendChild(document.createTextNode(' Fewer tips'));
    label.title = 'Only show tips when you ask';
    return label;
  }
  function syncToggles() { var on = fewer(); Array.prototype.forEach.call(document.querySelectorAll('.cg-fewer input'), function (b) { b.checked = on; }); }
  function panelToggle() {
    var panel = document.getElementById('lipidomic-assistant-panel');
    if (!panel || panel.querySelector('.cg-panel-fewer')) return;
    var wrap = node('div', 'cg-panel-fewer'); wrap.appendChild(fewerToggle(function (on) { if (on && tipEl && !tipEl.querySelector('.cg-actions')) removeTip(); }));
    panel.appendChild(wrap);
  }
  function armCollapse() { clearTimeout(collapseTimer); collapseTimer = setTimeout(function () { if (tipEl && !tipEl.contains(document.activeElement)) setCollapsed(true); }, 15000); }
  function setCollapsed(on) {
    if (!tipEl) return;
    tipEl.classList.toggle('is-collapsed', !!on);
    var pill = tipEl.querySelector('.cg-pill'); if (pill) pill.setAttribute('aria-expanded', String(!on));
    if (!on) armCollapse();
    schedulePlace();
  }
  function schedulePlace() { if (placeQueued) return; placeQueued = true; requestAnimationFrame(place); }
  function place() {
    placeQueued = false;
    if (!tipEl) return;
    var d = dock();
    if (!d) { tipEl.hidden = true; return; }
    tipEl.hidden = false;
    var r = d.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, gap = 10, margin = 8;
    // Canvas: beside the character (above it sits the inspector). Elsewhere: above it when there is room.
    var nav = document.querySelector('.navbar'), top = Math.max(margin, nav ? nav.getBoundingClientRect().bottom + margin : margin);
    var x = r.left - w - gap, y = r.bottom - h;
    if (state.stage !== 'canvas' && r.top - h - gap >= top) { x = Math.max(margin, r.right - w); y = r.top - h - gap; }
    else if (x < margin) { x = Math.min(window.innerWidth - w - margin, Math.max(margin, r.right - w)); y = r.top - h - gap; if (y < top) y = r.bottom + gap; }
    tipEl.style.left = Math.round(Math.max(margin, Math.min(x, window.innerWidth - w - margin))) + 'px';
    tipEl.style.top = Math.round(Math.max(margin, Math.min(y, window.innerHeight - h - margin))) + 'px';
  }
  function watchDock() {
    var d = document.getElementById('lipidomic-companion');
    if (!d || d === observedDock) return;
    observedDock = d;
    if (dockObserver) dockObserver.disconnect();
    // The dock moves by inline style; follow it without polling.
    dockObserver = new MutationObserver(schedulePlace);
    dockObserver.observe(d, {attributes: true, attributeFilter: ['style', 'class', 'hidden']});
  }

  // -------------------------------------------------------- chat rendering
  function messages() { return document.querySelector('#lipidomic-assistant-panel .assistant-messages'); }
  function openChat() {
    var panel = document.getElementById('lipidomic-assistant-panel');
    if (panel && panel.hidden && window.LipidomicAssistant) window.LipidomicAssistant.open(document.querySelector('#lipidomic-companion .assistant-dock-chat') || document.querySelector('.assistant-launcher'));
  }
  function closeChat() { var panel = document.getElementById('lipidomic-assistant-panel'); var x = panel && !panel.hidden && panel.querySelector('.assistant-close'); if (x) x.click(); }
  function post(build, kind) {
    openChat();
    var list = messages(); if (!list) return null;
    var item = node('div', 'assistant-message assistant-message-assistant cg-answer');
    if (kind) item.dataset.cgKind = kind;
    build(item);
    item.appendChild(node('span', 'assistant-source', 'Local guide · reviewed text'));
    list.appendChild(item);
    while (list.children.length > 40) list.firstElementChild.remove();
    var scroller = list.parentElement; if (scroller) scroller.scrollTop = scroller.scrollHeight;
    var status = document.querySelector('#lipidomic-assistant-panel .assistant-status'); if (status) status.textContent = 'Answered from the local guide.';
    return item;
  }
  function section(item, title, lines) {
    if (!lines || !lines.length) return;
    item.appendChild(node('strong', 'cg-section', title));
    if (lines.length === 1 && typeof lines[0] === 'string') { item.appendChild(node('p', 'cg-p', lines[0])); return; }
    var ul = node('ul', 'cg-list');
    lines.forEach(function (l) { ul.appendChild(typeof l === 'string' ? node('li', '', l) : l); });
    item.appendChild(ul);
  }

  function explain(cardId) {
    var source = sourceOf(cardId), info = chartInfo(source);
    return post(function (item) {
      if (!info) { item.appendChild(node('p', 'cg-p', 'I have no reviewed guidance for this card. Open its analysis and read the About panel and methods note.')); return; }
      item.appendChild(node('strong', 'cg-heading', info.title + (info.category ? ' · ' + info.category : '')));
      item.appendChild(node('span', 'cg-kind cg-kind-' + info.c.kind, ({descriptive: 'Exploratory · no test', inferential: 'Includes a statistical test', mixed: 'Reuses a statistical result', navigation: 'Export view'})[info.c.kind] || ''));
      section(item, 'What it shows', [info.c.what]);
      section(item, 'How to read it', [info.c.read]);
      section(item, 'Keep in mind', info.c.caveats);
      var cat = G.categories[info.c.cat]; if (cat && cat.explain) item.appendChild(node('p', 'cg-p cg-muted', cat.explain));
      var row = node('div', 'cg-actions'); row.appendChild(button('Suggest improvements', 'cg-button', function () { suggest(cardId); })); item.appendChild(row);
    }, 'explain');
  }

  // State-based checks: one read of the chart's own layout when asked, never per frame.
  function inspect(cardId, source) {
    var out = [], n = cardNode(cardId); if (!n) return out;
    if (n.classList.contains('tc-stale')) out.push({text: 'This finished snapshot predates an analysis change. Choose Edit to regenerate it, check it, and finish it again before export.', key: 'stale'});
    else if (n.classList.contains('tc-finished')) out.push({text: 'This card is a finished snapshot. Choose Edit before changing its style or data.', key: 'finished'});
    var text = (n.innerText || '').slice(0, 20000);
    if (/pseudoreplicat|participant ids? (repeat|appear)|assume independent samples|repeated participant/i.test(text)) out.push({text: 'A pseudoreplication warning applies: the same participant contributes more than one sample, so tests that assume independent samples overstate the evidence. Prefer a paired or repeated-measures analysis.', key: 'pseudo'});
    var gd = n.querySelector('.js-plotly-plot');
    if (!gd || !gd.layout || !Array.isArray(gd.data)) return out;
    var fl = gd._fullLayout || gd.layout;
    var title = gd.layout.title; title = typeof title === 'string' ? title : title && title.text;
    if (!title || !String(title).trim()) out.push({text: 'The chart has no title of its own. Add one in Title and fonts, or add a heading and panel letter in the figure page.', action: 'style:Title and fonts', key: 'title'});
    var sizes = [fl.font && fl.font.size, fl.xaxis && fl.xaxis.tickfont && fl.xaxis.tickfont.size, fl.yaxis && fl.yaxis.tickfont && fl.yaxis.tickfont.size, fl.legend && fl.legend.font && fl.legend.font.size].filter(function (v) { return typeof v === 'number'; });
    var minSize = sizes.length ? Math.min.apply(null, sizes) : 12;
    if (minSize < 10) out.push({text: 'Some text is smaller than size 10 and may be hard to read in print. Publication style sets size 12 (Undo reverts it).', action: 'publication', key: 'font'});
    ['xaxis', 'yaxis'].forEach(function (a) {
      var ax = fl[a]; if (!ax || ax.showticklabels === false) return;
      var cats = ax._categories && ax._categories.length || (Array.isArray(ax.ticktext) ? ax.ticktext.length : 0);
      var len = ax._length, fs = ax.tickfont && ax.tickfont.size || minSize;
      if (cats > 3 && len && len / cats < fs * 1.05) out.push({text: (a === 'xaxis' ? 'Horizontal' : 'Vertical') + ' labels overlap (' + cats + ' labels in ' + Math.round(len) + ' px). Show fewer items, make the card larger, or use a smaller font for that axis.', action: 'style:' + (a === 'xaxis' ? 'Horizontal axis' : 'Vertical axis'), key: 'overlap-' + a});
    });
    var heat = gd.data.find(function (t) { return t.type === 'heatmap'; });
    if (heat) {
      var rows = Math.max(heat.x ? heat.x.length : 0, heat.y ? heat.y.length : 0);
      if (rows > 30) {
        if (source === 'results_dashboard-plot_heat') {
          var sig = n.querySelector('[id$="-heat_significance"]');
          var blocked = text.match(/Significant only is unavailable\.[^\n]*/);
          out.push(blocked ? {text: rows + ' lipids are shown. Significant only would shorten the list but is unavailable here: ' + blocked[0].replace(/^Significant only is unavailable\.\s*/, ''), action: 'data:-top_n', key: 'many'}
            : {text: rows + ' lipids are shown. Keep fewer of the most variable lipids, or choose Significant only (it reuses Differential analysis; no new test).', action: sig ? 'data:-heat_significance' : 'data:-top_n', key: 'many'});
        } else out.push({text: rows + ' rows are shown. Consider filtering or condensing rows in the analysis settings so labels stay readable.', action: 'datasettings', key: 'many'});
      }
    }
    var byColour = {};
    gd.data.forEach(function (t) {
      if (t.showlegend === false || !t.name || t.visible === false || t.type === 'heatmap') return;
      var c = typeof (t.marker || {}).color === 'string' ? t.marker.color : typeof t.fillcolor === 'string' ? t.fillcolor : typeof (t.line || {}).color === 'string' ? t.line.color : null;
      if (!c) return; c = c.toLowerCase().replace(/\s/g, '');
      (byColour[c] = byColour[c] || []).indexOf(t.name) < 0 && byColour[c].push(t.name);
    });
    var shared = Object.keys(byColour).filter(function (c) { return byColour[c].length > 1; });
    if (shared.length) out.push({text: 'These series share a colour: ' + byColour[shared[0]].slice(0, 4).join(', ') + '. Apply a palette so each group has its own colour.', action: 'palette', key: 'colours'});
    var pal = paletteState(cardId);
    if (pal.canvas && pal.canvas !== pal.own && gd.data.some(function (t) { return t.name && t.showlegend !== false; })) out.push({text: 'Other cards use the "' + pal.canvas + '" palette; this one ' + (pal.own ? 'uses "' + pal.own + '"' : 'keeps its default colours') + '. Matching palettes keep groups the same colour across the figure.', action: 'palette', key: 'palette'});
    return out;
  }
  function paletteState(cardId) {
    var own = null, counts = {};
    try {
      (window.TeamCanvas ? TeamCanvas.serialize().nodes : []).forEach(function (n) {
        var p = n.visual && n.visual.editor && n.visual.editor.palette; if (!p) return;
        if (n.id === cardId) own = p; else counts[p] = (counts[p] || 0) + 1;
      });
    } catch (_) {}
    var best = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0] || null;
    return {own: own, canvas: best};
  }
  var actionLabels = {publication: 'Apply Publication style', palette: 'Apply palette', datasettings: 'Open settings', stats: 'Open Statistics', figure: 'Open figure page'};
  function actionLabel(a, cardId) {
    if (a === 'palette') { var p = paletteState(cardId).canvas; return p ? 'Apply "' + p + '"' : 'Open Color palette'; }
    if (a.indexOf('style:') === 0) return 'Open ' + a.slice(6);
    if (a.indexOf('data:') === 0) return 'Show the control';
    return actionLabels[a] || 'Open';
  }
  function suggest(cardId) {
    var source = sourceOf(cardId), info = chartInfo(source);
    return post(function (item) {
      item.appendChild(node('strong', 'cg-heading', 'Suggestions' + (info ? ' · ' + info.title : '')));
      var seenActions = {}, rows = [];
      function add(s, group) {
        if (s.action && seenActions[s.action] && !s.key) return;
        if (s.action) seenActions[s.action] = true;
        var li = node('li', 'cg-suggestion'); li.dataset.group = group; if (s.key) li.dataset.check = s.key;
        li.appendChild(node('span', '', s.text));
        if (s.action) { var b = button(actionLabel(s.action, cardId), 'cg-button cg-small', function () { act(s.action, cardId, b); }); b.dataset.action = s.action; li.appendChild(b); }
        rows.push(li);
      }
      inspect(cardId, source).forEach(function (s) { add(s, 'state'); });
      if (info) { (info.c.tips || []).forEach(function (s) { add(s, 'chart'); }); ((G.categories[info.c.cat] || {}).tips || []).forEach(function (s) { add(s, 'category'); }); }
      G.common.forEach(function (s) { add(s, 'common'); });
      section(item, 'For this chart', rows);
      item.appendChild(node('p', 'cg-p cg-muted', 'Buttons change presentation or open a control. Scientific settings stay as they are until you change them yourself.'));
    }, 'suggest');
  }

  // ----------------------------------------------------------------- actions
  function flash(el) { if (!el) return; el.classList.add('cg-highlight'); el.scrollIntoView({block: 'nearest'}); setTimeout(function () { el.classList.remove('cg-highlight'); }, 2400); }
  function ensureSelected(cardId) {
    var sel = window.TeamCanvas && TeamCanvas.selected();
    if (sel && sel.id === cardId) return true;
    var n = cardNode(cardId), head = n && n.querySelector('.tc-node-head');
    if (head) head.click(); else if (n) n.click();
    return !!n;
  }
  function openTab(key) { var t = document.getElementById('tc-inspector-tab-' + key); if (t) t.click(); return document.getElementById('tc-inspector-panel-' + key); }
  function note(text) { post(function (item) { item.appendChild(node('p', 'cg-p', text)); }, 'note'); }
  function act(action, cardId, trigger) {
    if (action === 'figure') { closeChat(); var tab = document.getElementById('tc-preview-tab'); if (tab) tab.click(); return; }
    if (!ensureSelected(cardId)) { note('That card is no longer on the canvas.'); return; }
    closeChat();
    requestAnimationFrame(function () {
      if (action === 'publication') {
        var panel = openTab('appearance'), b = panel && Array.prototype.find.call(panel.querySelectorAll('button'), function (x) { return x.textContent.trim() === 'Publication style'; });
        if (b && !b.disabled) { b.click(); flash(b); } else note('Publication style is not available for this card.');
        return;
      }
      if (action === 'palette') {
        var name = paletteState(cardId).canvas, p2 = openTab('appearance'), d = p2 && findSection(p2, 'Color palette');
        if (!d) { note('This card has no editable palette.'); return; }
        d.open = true; var select = d.querySelector('select'), apply = Array.prototype.find.call(d.querySelectorAll('button'), function (x) { return x.textContent.trim() === 'Apply palette'; });
        if (name && select && apply && Array.prototype.some.call(select.options, function (o) { return o.value === name; })) { select.value = name; select.dispatchEvent(new Event('change', {bubbles: true})); apply.click(); }
        flash(d); return;
      }
      if (action.indexOf('style:') === 0) {
        var p3 = openTab('appearance'), s = p3 && findSection(p3, action.slice(6));
        if (s) { s.open = true; flash(s); var f = s.querySelector('input,select,textarea,summary'); if (f) f.focus({preventScroll: true}); } else note('That section is not available for this card.');
        return;
      }
      if (action.indexOf('data:') === 0) {
        // Controls live on the card's Data tab, or in an independent copy's Data & settings panel.
        var suffix = action.slice(5), p4 = openTab('data'), n = cardNode(cardId), control = p4 && p4.querySelector('[id$="' + suffix + '"]');
        if (!control && n) control = n.querySelector('[id$="' + suffix + '"]');
        var instance = /^tcinstance_/.test(cardId) ? cardId.slice(0, cardId.indexOf('-')) : null, host = instance && document.getElementById(instance + '_host');
        if (!control && host) {
          control = document.getElementById(instance + suffix);
          var open = n && n.querySelector('[data-canvas-data-settings]');
          if (control && open && !host.classList.contains('is-open')) open.click();
        }
        if (control) requestAnimationFrame(function () { flash(control.closest('.form-group,.shiny-input-container') || control); });
        else note('That control is not shown for this card. Open its analysis settings instead.');
        return;
      }
      if (action === 'datasettings') {
        var p5 = openTab('data'), more = p5 && p5.querySelector('.tc-inspector-data-settings');
        if (more && /^tcinstance_/.test(cardId)) { more.click(); return; }
        if (more) { flash(more); more.focus({preventScroll: true}); } else note('This card keeps its settings in its source analysis.');
        return;
      }
      if (action === 'stats') { flash(openTab('statistics')); }
    });
  }
  function findSection(panel, title) { return Array.prototype.find.call(panel.querySelectorAll('details'), function (d) { var s = d.querySelector('summary'); return s && s.textContent.trim() === title; }) || null; }

  // ------------------------------------------------------------- local Q&A
  var STOP = 'add change make use get set a an the is are was were be to of in on for and or i my me we our you your it its this that these those do does did how what why when where which can could should would will with about from at by as show shows mean means please tell explain chart plot graph figure card'.split(' ');
  var SYN = {colour: 'color', colours: 'color', colors: 'color', coloured: 'color', graph: 'chart', plots: 'chart', charts: 'chart', pc: 'pca', pc1: 'pca', pc2: 'pca', principal: 'pca', zscore: 'z', fdr: 'bh', benjamini: 'bh', pvalue: 'p', pvalues: 'p', labels: 'label', fonts: 'font', tabs: 'tab', samples: 'sample', lipids: 'lipid', checkpoints: 'checkpoint', saved: 'save', saving: 'save', exporting: 'export', download: 'export', downloads: 'export', pdf: 'export', missing: 'missing', excluded: 'exclude', excluding: 'exclude', remove: 'exclude', removing: 'exclude', outlier: 'exclude', outliers: 'exclude', pseudo: 'pseudoreplication', palettes: 'palette', titles: 'title', bigger: 'larger', increase: 'larger', print: 'publication'};
  function tokens(s) { return String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean).map(function (t) { return SYN[t] || t; }); }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur; for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) { cur = [i]; var best = i; for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); } if (best > max) return max + 1; prev = cur; }
    return prev[b.length];
  }
  var index = null;
  function buildIndex() {
    index = [];
    G.topics.forEach(function (t) { index.push({kind: 'topic', ref: t, fields: [[tokens(t.k), 3], [tokens(t.title), 2.5], [tokens(t.text), 1]]}); });
    catalogList().forEach(function (e) {
      var c = G.charts[e.id]; if (!c) return;
      index.push({kind: 'chart', ref: e, fields: [[tokens(e.title), 3], [tokens((G.categories[c.cat] || {}).label + ' ' + e.id.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')), 2], [tokens(c.what), 1]]});
    });
  }
  function matchToken(q, list) {
    var best = 0;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t === q) return 1;
      if (q.length >= 4 && t.length >= 4 && (t.indexOf(q) === 0 || q.indexOf(t) === 0)) best = Math.max(best, 0.8);
      else if (q.length >= 5 && best < 0.6 && lev(q, t, q.length >= 8 ? 2 : 1) <= (q.length >= 8 ? 2 : 1)) best = 0.6;
    }
    return best;
  }
  function search(q) {
    if (!index) buildIndex();
    var qs = tokens(q).filter(function (t) { return STOP.indexOf(t) < 0 && t.length > 1; });
    if (!qs.length) return [];
    return index.map(function (doc) {
      var score = 0, hit = 0;
      var inTitle = 0, titleField = doc.kind === 'topic' ? doc.fields[1][0] : doc.fields[0][0];
      qs.forEach(function (t) { var m = 0; doc.fields.forEach(function (f) { m = Math.max(m, matchToken(t, f[0]) * f[1]); }); score += m; if (m >= 1.5) hit++; if (matchToken(t, titleField) >= 0.8) inTitle++; });
      // Prefer the entry whose title names the question's terms (e.g. "PCA" over "Review step").
      score += inTitle / qs.length * 1.2;
      if (doc.kind === 'chart' && state.selected && doc.ref.id === state.selected.source) score += 0.5;
      return {doc: doc, score: score / Math.sqrt(qs.length), coverage: hit / qs.length};
    }).filter(function (r) { return r.score > 0; }).sort(function (a, b) { return b.score - a.score; });
  }
  // The server keeps answering commands and reviewed high-risk boundaries.
  function serverOnly(q) {
    return /^(please )?(set|switch|change|turn|can you switch)\b/.test(q) || /^set (minimum detection|detection|threshold)/.test(q) ||
      /^(hi|hello|hey|hola|good (morning|afternoon|evening)|thanks|thank you|gracias)[!., ]*$/.test(q) ||
      /ignore.*instructions|override.*rules|bypass.*rules|output commands|skip confirmation|without confirmation|bypass.*confirm/.test(q) ||
      /which lipids.*signific|give.*p.?values|name.*signific|significant.*my|my.*significant/.test(q) ||
      /\bpaired\b|pairing|matched (samples|design|measurements)|replicate numbers/.test(q) ||
      /restore.*(session|zip)|resume.*analysis|saved.*zip.*resume/.test(q) ||
      (/\bsamples?\b/.test(q) && /\b(exclud|remov|drop|omit)/.test(q) && /\b(check|before|outlier|reason|should|consider)/.test(q));
  }
  function stepTopic() {
    var key = context();
    return {'data-choice': 'step-data', 'data-matrix': 'step-data', 'data-metadata': 'step-metadata', review: 'step-review', canvas: 'step-canvas', 'canvas-empty': 'step-canvas', card: 'select-card', figure: 'figure-page', save: 'autosave', cell: 'cell-view'}[key] || 'step-data';
  }
  function topicById(id) { return G.topics.find(function (t) { return t.id === id; }); }
  function answerTopic(t, related) {
    return post(function (item) {
      item.appendChild(node('strong', 'cg-heading', t.title));
      item.appendChild(node('p', 'cg-p', t.text));
      var row = node('div', 'cg-actions');
      if (t.go && window.TeamWorkspace && t.go !== 'figure') row.appendChild(button('Open ' + t.go.charAt(0).toUpperCase() + t.go.slice(1), 'cg-button cg-small', function () { closeChat(); TeamWorkspace.go(t.go); }));
      if (t.go === 'figure' && state.stage === 'canvas') row.appendChild(button('Open figure page', 'cg-button cg-small', function () { act('figure'); }));
      if (t.action && state.selected) row.appendChild(button(actionLabel(t.action, state.selected.id), 'cg-button cg-small', function () { act(t.action, state.selected.id); }));
      (related || []).forEach(function (r) { row.appendChild(relatedButton(r)); });
      if (row.children.length) item.appendChild(row);
    }, 'topic');
  }
  function relatedButton(r) {
    var label = r.doc.kind === 'topic' ? r.doc.ref.title : r.doc.ref.title + ' (chart)';
    return button(label, 'cg-button cg-small cg-related', function () { if (r.doc.kind === 'topic') answerTopic(r.doc.ref); else explainCatalog(r.doc.ref.id); });
  }
  function explainCatalog(id) {
    var on = Array.prototype.find.call(document.querySelectorAll('#team-canvas-root .tc-node[data-plot-id]'), function (n) { return sourceOf(n.dataset.plotId) === id; });
    if (on) return explain(on.dataset.plotId);
    var info = chartInfo(id);
    return post(function (item) {
      item.appendChild(node('strong', 'cg-heading', info.title + ' · ' + info.category));
      section(item, 'What it shows', [info.c.what]); section(item, 'How to read it', [info.c.read]); section(item, 'Keep in mind', info.c.caveats);
    }, 'explain');
  }
  // Returns true when the question was answered locally.
  function answer(text, opts) {
    var q = String(text || '').toLowerCase().trim();
    if (!q || serverOnly(q)) return false;
    var sel = state.selected && state.stage === 'canvas' ? state.selected : null;
    var aboutThis = /\b(this|selected|the|my) (chart|plot|graph|figure|card|heatmap|pca|violin|volcano)\b|\bhow (do i|to|should i) (read|interpret)\b|\bwhat does (it|this) (show|mean)\b/.test(q);
    if (sel && aboutThis && /improv|better|suggest|publication|print|nicer|polish|clearer/.test(q)) { suggest(sel.id); return true; }
    if (sel && aboutThis) { explain(sel.id); return true; }
    if (/^(explain this step|help|what (do i do|should i do) (now|next|here)|where am i)[?.!]*$/.test(q)) { answerTopic(topicById(stepTopic())); return true; }
    var results = search(q), top = results[0];
    if (top && top.score >= 1.6 && top.coverage >= 0.34) {
      var related = results.slice(1, 3).filter(function (r) { return r.score >= Math.max(1.5, top.score * 0.6); });
      if (top.doc.kind === 'topic') answerTopic(top.doc.ref, related); else { explainCatalog(top.doc.ref.id); }
      return true;
    }
    if (opts && opts.aiEnabled) return false;
    post(function (item) {
      item.appendChild(node('p', 'cg-p', G.fallback));
      var row = node('div', 'cg-actions');
      results.filter(function (r) { return r.score >= 1; }).slice(0, 3).forEach(function (r) { row.appendChild(relatedButton(r)); });
      if (!row.children.length) [topicById(stepTopic()), topicById('figure-page'), topicById('pca')].forEach(function (t) { row.appendChild(button(t.title, 'cg-button cg-small cg-related', function () { answerTopic(t); })); });
      item.appendChild(row);
    }, 'fallback');
    return true;
  }

  // ------------------------------------------------------------------ events
  function onWorkspace(e) {
    var d = e && e.detail || {};
    if (d.stage) state.stage = d.stage;
    if (typeof d.substep === 'string') state.substep = d.substep;
    if (Number(d.legacyStep) >= 1) state.legacyStep = Number(d.legacyStep);
    if (typeof d.authenticated === 'boolean') state.authenticated = d.authenticated;
    if (state.stage !== 'canvas') { state.figure = false; }
    watchDock(); render(false);
  }
  function onSelection(e) {
    var d = e && e.detail;
    state.selected = d && d.id ? {id: String(d.id), title: String(d.title || d.id), source: sourceOf(String(d.id))} : null;
    render(false);
  }
  function figureCheck() { requestAnimationFrame(function () { var p = document.getElementById('tc-preview-panel'); var on = !!(p && !p.hidden); if (on !== state.figure) { state.figure = on; render(false); } }); }
  function mount() {
    document.body.classList.add('cg-active');
    panelToggle(); if (!document.getElementById('lipidomic-assistant-panel')) setTimeout(panelToggle, 0);
    window.addEventListener('team-workspace-state', onWorkspace);
    window.addEventListener('team-canvas-selection', onSelection);
    window.addEventListener('team-canvas-inspector-closed', schedulePlace);
    window.addEventListener('resize', schedulePlace);
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#tc-preview-tab,#tc-workspace-tab,.ts-tool,.tc-preview-back')) figureCheck(); }, true);
    var auth = document.body && document.body.dataset.teamAuthenticated; if (auth === 'true' || auth === '1') state.authenticated = true;
    try { if (window.TeamWorkspace && typeof TeamWorkspace.state === 'function') onWorkspace({detail: TeamWorkspace.state()}); } catch (_) {}
    try { var s = window.TeamCanvas && TeamCanvas.selected(); if (s) onSelection({detail: s}); } catch (_) {}
  }
  function boot() {
    if (!enabled() || window.LipidomicCompanionLocal) return;
    window.LipidomicCompanionLocal = {answer: answer, explain: explain, suggest: suggest, search: search, sourceOf: sourceOf, render: function () { render(true); }, fewer: fewer, setFewer: setFewer};
    mount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
