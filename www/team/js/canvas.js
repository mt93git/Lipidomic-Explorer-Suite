(function () {
  'use strict';
  var root, board, list, status, search, records = new Map(), sequence = 0, selectedRecord = null, preparation = null, shinyBusy = false, preparationGeneration = 0, activityGeneration = 0;
  var selector = '.plotly.html-widget-output[id], .shiny-plot-output[id]';
  // Explicit matches to download handlers declared with these outputs in modules-ui.R.
  var csvByPlot = {
    'barchart-barPlotUnfiltered':'barchart-downloadBarCSV_Unfiltered',
    'barchart-barPlotFiltered':'barchart-downloadBarCSV_Filtered',
    'barchart-donutPlotUnfiltered':'barchart-downloadDonutCSV_Unfiltered',
    'barchart-donutPlotFiltered':'barchart-downloadDonutCSV_Filtered',
    'volcano_tab-volcanoPlot':'volcano_tab-downloadTable',
    'pathway_tab-pathwayPlot':'pathway_tab-downloadPlotCSV',
    'cellular_org_tab-stressPlot':'cellular_org_tab-downloadStressCSV',
    'cellular_org_tab-cpiPlot':'cellular_org_tab-downloadCpiCSV',
    'cellular_org_tab-polarPlot':'cellular_org_tab-downloadPolarCSV'
  };
  function humanize(id) {
    var name = id.split('-').slice(1).join(' ') || id;
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b(output|plot|chart|ui)\b/ig, '').replace(/\s+/g, ' ').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Plot';
  }
  function labelFor(el) {
    var card = el.closest('.rd-card'), title = card && card.querySelector('h3');
    if (title) return title.textContent.trim();
    var pane = el.closest('.tab-pane'), name = '';
    if (pane && pane.id) {
      var tab = Array.from(document.querySelectorAll('[data-bs-target], [href]')).find(function (x) {
        return x.getAttribute('data-bs-target') === '#' + pane.id || x.getAttribute('href') === '#' + pane.id;
      });
      if (tab) name = tab.textContent.trim();
    }
    return (name ? name + ' · ' : '') + humanize(el.id);
  }
  var toolNames = {heatmap_barchart_tab:'Heatmap', barchart:'Composition', volcano_tab:'Volcano Plot', lsea_tab:'LSEA', structural_tab:'Structural', structural_grid_tab:'Structural Grid', logratio_tab:'Violin Plots', fla_tab:'Functional Ratios', pathway_tab:'Lipid Pathways', cellular_org_tab:'Cellular Organization', longitudinal_tab:'Longitudinal', qc_pca_tab:'Quality Check'};
  function toolFor(el) {
    if (['structural_tab-propPlotPlot','structural_tab-diffAcylPlot'].includes(el.id)) return 'Main Class & Acyl Chain Proportions';
    return toolNames[el.id.split('-')[0]] || null;
  }
  function routeFor(el) { if (el.id.indexOf('cell_') === 0) return {step:6}; var tool = toolFor(el); return tool ? {tool:tool} : null; }
  function openRoute(route) { if (!route || !window.Shiny) return; if (route.step) Shiny.setInputValue('guide_step',route.step,{priority:'event'}); else Shiny.setInputValue('guide_open_tool',route.tool,{priority:'event'}); }
  var extraRoutes = [
    {id:'pathway_tab-pathwayVisNetwork',title:'Lipid pathways · interactive network',route:{tool:'Lipid Pathways'}},
    {id:'cell-show-route',title:'3D cell · interactive and comparison plots',route:{step:6}}
  ];
  function dynamicOutput(el) { return !!el.parentElement && !!el.parentElement.closest('.shiny-html-output'); }
  function removeDuplicate(r) {
    // A replacement exists in the source view. Drop the old bound subtree, never export it.
    if (r.observer) r.observer.disconnect();
    if (r.renderObserver) r.renderObserver.disconnect();
    if (window.Shiny && Shiny.unbindAll) Shiny.unbindAll(r.target, true);
    r.target.remove(); if (r.bar) r.bar.remove(); if (r.barHome) r.barHome.remove();
    if (r.home) r.home.remove(); r.node.remove(); r.node = null;
    if (selectedRecord === r) { selectedRecord = null; window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:null})); }
    board.classList.toggle('has-nodes', !!board.querySelector('.tc-node')); expandBoard();
    tell('The source analysis replaced ' + r.label + '. Its previous canvas plot was removed; open the analysis to use the current output.');
  }
  function portalPlotSettings() {
    var dock = root.querySelector('.tc-settings-dock');
    if (!dock || dock.querySelector('.rd-controls')) return;
    var controls = document.querySelector('.rd-dashboard .rd-controls');
    if (!controls) return;
    // Move the existing bound controls: do not clone Shiny inputs or their IDs.
    var home = document.createComment('Dashboard plot settings are in the figure workspace');
    controls.before(home); dock.appendChild(controls);
  }
  function discover() {
    portalPlotSettings();
    document.querySelectorAll(selector).forEach(function (el) {
      if (root.contains(el) || el.closest('.publication-canvas-frame')) return;
      var existing = records.get(el.id);
      if (existing && existing.node && existing.el !== el) {
        removeDuplicate(existing);
        records.set(el.id, {el: el, label: labelFor(el), node: null, dynamic: true});
        return;
      }
      if (existing && (existing.node || existing.el.isConnected)) return;
      records.set(el.id, {el: el, label: labelFor(el), node: null, dynamic: dynamicOutput(el)});
    });
    renderList();
  }
  function renderList() {
    var filter = search.value.toLowerCase().trim(); list.replaceChildren();
    var matches = Array.from(records.values()).filter(function (r) { return (r.label + ' ' + r.el.id).toLowerCase().includes(filter); });
    function rank(r) {
      var featured = {'results_dashboard-plot_pca':0, 'results_dashboard-plot_violin':1, 'results_dashboard-plot_dist':2, 'results_dashboard-plot_comp':3, 'results_dashboard-plot_heat':4};
      return Object.prototype.hasOwnProperty.call(featured, r.el.id) ? featured[r.el.id] : 10;
    }
    matches.sort(function (a,b) { return rank(a) - rank(b) || a.label.localeCompare(b.label); });
    matches.forEach(function (r) {
      var button = document.createElement('button');
      button.type = 'button'; button.textContent = r.label;
      if (r.dynamic) {
        var hint = document.createElement('small'); hint.textContent = 'Open analysis · dynamically generated plot'; button.appendChild(hint);
        var route = routeFor(r.el); button.disabled = !route;
        button.addEventListener('click', function () { openRoute(route); });
      } else { button.disabled = !!r.node || !r.el.isConnected; button.addEventListener('click', function () { add(r); }); }
      list.appendChild(button);
    });
    var routes = extraRoutes.filter(function (r) { return r.title.toLowerCase().includes(filter); });
    routes.forEach(function (r) { var button = document.createElement('button'); button.type = 'button'; button.textContent = r.title; var hint = document.createElement('small'); hint.textContent = 'Open analysis · interactive view'; button.appendChild(hint); button.addEventListener('click', function () { openRoute(r.route); }); list.appendChild(button); });
    if (!matches.length && !routes.length) { var p = document.createElement('p'); p.textContent = 'No plots found. Some plots appear after their analysis is opened.'; list.appendChild(p); }
  }
  function tell(message) { status.textContent = message; }
  function resize(r) {
    if (!r.node || r.snapshot) return;
    var content = r.node.querySelector('.tc-content');
    var plotTop = r.el.getBoundingClientRect().top - r.node.getBoundingClientRect().top + content.scrollTop;
    var height = Math.max(160, r.node.clientHeight - plotTop - 24);
    var desired = height + 'px';
    if (r.el.style.height === desired) return;
    r.el.style.height = desired;
    var gd = r.el.classList.contains('js-plotly-plot') ? r.el : r.el.querySelector('.js-plotly-plot');
    if (gd && gd.data && window.Plotly) Promise.resolve(window.Plotly.Plots.resize(gd)).catch(function () {});
    // Shiny uses resize to measure outputs and rerender static plots at their new dimensions.
    window.dispatchEvent(new Event('resize'));
  }
  function moveNode(node, head) {
    head.addEventListener('pointerdown', function (event) {
      if (event.target.closest('button,input,label')) return;
      event.preventDefault(); head.setPointerCapture(event.pointerId);
      var startX = event.clientX, startY = event.clientY, left = node.offsetLeft, top = node.offsetTop;
      function move(e) {
        node.style.left = Math.max(0, left + e.clientX - startX) + 'px';
        node.style.top = Math.max(0, top + e.clientY - startY) + 'px';
        expandBoard();
      }
      function done() { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', done); head.removeEventListener('pointercancel', done); }
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', done); head.addEventListener('pointercancel', done);
    });
    head.addEventListener('keydown', function (e) {
      var dx = e.key === 'ArrowRight' ? 10 : e.key === 'ArrowLeft' ? -10 : 0;
      var dy = e.key === 'ArrowDown' ? 10 : e.key === 'ArrowUp' ? -10 : 0;
      if (!dx && !dy) return; e.preventDefault(); node.style.left = Math.max(0,node.offsetLeft + dx) + 'px'; node.style.top = Math.max(0,node.offsetTop + dy) + 'px'; expandBoard();
    });
  }
  function expandBoard() {
    var width = 1320, height = 780;
    board.querySelectorAll('.tc-node').forEach(function (node) { width = Math.max(width, node.offsetLeft + node.offsetWidth + 40); height = Math.max(height, node.offsetTop + node.offsetHeight + 40); });
    board.style.width = width + 'px'; board.style.height = height + 'px';
  }
  function arrange() {
    var nodes = Array.from(board.querySelectorAll('.tc-node'));
    // Use each row's tallest node and widest column to avoid overlapping resized plots.
    var leftWidth = 620, rowTop = 30;
    nodes.forEach(function (node, i) { if (i % 2 === 0) leftWidth = Math.max(leftWidth, node.offsetWidth); });
    for (var i = 0; i < nodes.length; i += 2) {
      var first = nodes[i], second = nodes[i + 1];
      first.style.left = '30px'; first.style.top = rowTop + 'px';
      if (second) { second.style.left = (leftWidth + 60) + 'px'; second.style.top = rowTop + 'px'; }
      rowTop += Math.max(first.offsetHeight, second ? second.offsetHeight : 0) + 30;
    }
    sequence = nodes.length; expandBoard();
  }
  function add(r) {
    if (r.node || r.dynamic || !r.el.isConnected || dynamicOutput(r.el)) return;
    var card = r.el.closest('.rd-card');
    var target = card && card.querySelectorAll(selector).length === 1 ? card : r.el;
    var bar = target === r.el && r.el.previousElementSibling && r.el.previousElementSibling.classList.contains('plot-export-bar') ? r.el.previousElementSibling : null;
    var home = document.createElement('div'); home.className = 'tc-home'; home.textContent = r.label + ' is on the figure canvas.'; target.before(home);
    var barHome = null;
    if (bar) { barHome = document.createComment('Plot export controls'); bar.before(barHome); }
    var node = document.createElement('article'); node.className = 'tc-node'; node.dataset.plotId = r.el.id;
    var index = sequence++, x, y, occupied = Array.from(board.querySelectorAll('.tc-node'));
    do {
      x = 30 + (index % 2) * 650; y = 30 + Math.floor(index / 2) * 750; index++;
    } while (occupied.some(function (other) {
      return x < other.offsetLeft + other.offsetWidth + 20 && x + 620 + 20 > other.offsetLeft &&
        y < other.offsetTop + other.offsetHeight + 20 && y + 720 + 20 > other.offsetTop;
    }));
    sequence = Math.max(sequence, index); node.style.left = x + 'px'; node.style.top = y + 'px';
    var head = document.createElement('div'); head.className = 'tc-node-head'; head.tabIndex = 0; head.setAttribute('aria-label', 'Move ' + r.label + ' with arrow keys');
    var heading = document.createElement('strong'); heading.textContent = r.label; head.appendChild(heading);
    var tool = toolFor(r.el);
    if (tool) { var controls = document.createElement('button'); controls.type = 'button'; controls.textContent = 'Controls'; controls.title = 'Open analysis controls'; controls.addEventListener('click', function () { if (window.Shiny) Shiny.setInputValue('guide_open_tool', tool, {priority:'event'}); }); head.appendChild(controls); }
    var finish = document.createElement('button'); finish.type = 'button'; finish.textContent = 'Finish plot'; finish.setAttribute('aria-pressed','false'); head.appendChild(finish);
    var remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Return'; remove.title = 'Return plot to its original location'; head.appendChild(remove);
    var edit = document.createElement('div'); edit.className = 'tc-edit';
    var titleLabel = document.createElement('label'); titleLabel.textContent = 'Label ';
    var title = document.createElement('input'); title.type = 'text'; title.value = r.label; titleLabel.appendChild(title); edit.appendChild(titleLabel);
    var colorLabel = document.createElement('label'); colorLabel.textContent = 'Background ';
    var color = document.createElement('input'); color.type = 'color'; color.value = '#ffffff'; colorLabel.appendChild(color); edit.appendChild(colorLabel);
    var content = document.createElement('div'); content.className = 'tc-content';
    var originalHeight = r.el.style.getPropertyValue('height');
    var originalHeightPriority = r.el.style.getPropertyPriority('height');
    if (target === r.el) {
      var csvId = csvByPlot[r.el.id];
      var csvSource = csvId && document.getElementById(csvId);
      if (csvSource && csvSource.tagName === 'A') {
        var csv = document.createElement('button'); csv.type = 'button'; csv.className = 'tc-csv'; csv.textContent = 'Plot data (CSV)';
        csv.addEventListener('click', function () {
          var source = document.getElementById(csvId);
          if (source && source.tagName === 'A' && source.getAttribute('href')) source.click();
          else tell('The analysis data download is not ready yet.');
        });
        content.appendChild(csv);
      } else {
        var csvNote = document.createElement('p'); csvNote.className = 'tc-export-note';
        csvNote.textContent = 'For data exports, open this analysis and use its download controls.';
        content.appendChild(csvNote);
      }
    }
    var settings = document.createElement('details'); settings.className = 'tc-settings';
    var summary = document.createElement('summary'); summary.textContent = 'Plot appearance'; settings.appendChild(summary);
    var settingsBody = document.createElement('div'); settingsBody.className = 'tc-edit'; settings.appendChild(settingsBody);
    var visual = r.visual || (r.visual = {});
    function field(label, type, key, placeholder) {
      var wrap = document.createElement('label'); wrap.textContent = label + ' ';
      var input = document.createElement('input'); input.type = type;
      if (placeholder) input.placeholder = placeholder;
      if (type === 'color') input.value = visual[key] || '#235c77';
      else if (visual[key] !== undefined) input.value = visual[key];
      if (type === 'number') { input.min = '8'; input.max = '48'; input.step = '1'; }
      input.addEventListener('input', function () { visual[key] = type === 'number' ? Number(input.value) : input.value; scheduleAppearance(r); });
      input.addEventListener('change', function () { visual[key] = type === 'number' ? Number(input.value) : input.value; scheduleAppearance(r); });
      wrap.appendChild(input); settingsBody.appendChild(wrap); return input;
    }
    field('Plot title', 'text', 'plotTitle', 'Current title');
    field('X axis', 'text', 'xTitle', 'Current label');
    field('Y axis', 'text', 'yTitle', 'Current label');
    field('Font size', 'number', 'fontSize', 'Current size');
    field('Text color', 'color', 'fontColor');
    var markColor = field('Uniform mark color', 'color', 'markColor');
    var note = document.createElement('p'); note.className = 'tc-settings-note';
    note.textContent = 'Plotly plots only. Uniform mark color is available for one trace with a single color. Use the shared palette for group and per-point colors.';
    settingsBody.appendChild(note);
    if (bar) content.appendChild(bar); content.appendChild(target);
    node.append(head, edit, settings, content); board.appendChild(node);
    r.node = node; r.target = target; r.home = home; r.bar = bar; r.barHome = barHome; r.originalHeight = originalHeight; r.originalHeightPriority = originalHeightPriority;
    r.editInputs = settingsBody.querySelectorAll('input'); r.labelInput = title; r.labelHeading = heading; r.backgroundInput = color; r.content = content; r.finishButton = finish; r.markInput = markColor;
    refreshMarkAvailability(r);
    function selectNode() { selectedRecord = r; r.displayTitle = title.value || r.label; window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:{id:r.el.id, title:r.displayTitle}})); }
    node.addEventListener('pointerdown', selectNode); node.addEventListener('focusin', selectNode);
    title.addEventListener('input', function () { heading.textContent = title.value || r.label; selectNode(); });
    color.addEventListener('input', function () { content.style.backgroundColor = color.value; visual.background = color.value; scheduleAppearance(r); });
    finish.addEventListener('click', function () { if (r.snapshot) editSnapshot(r); else finishSnapshot(r); });
    remove.addEventListener('click', function () { restore(r); });
    moveNode(node, head);
    if (window.ResizeObserver) { r.observer = new ResizeObserver(function () { expandBoard(); resize(r); }); r.observer.observe(node); }
    board.classList.add('has-nodes'); expandBoard(); renderList();
    requestAnimationFrame(function () { resize(r); if (r.visual && Object.keys(r.visual).length) applyAppearance(r); });
    selectNode();
    tell('Added ' + r.label + '. Use its existing plot download controls and data download when available.');
  }
  function saveFile(blob, name) {
    var url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function preparationSignature(state) { return JSON.stringify(state ? [state.ready, state.pending, state.running, state.revision] : null); }
  function preparationOK() { return !!preparation && preparation.ready === true && !preparation.pending && !preparation.running && preparation.revision != null; }
  function figureCurrent(r) { return preparationOK() && !shinyBusy && !r.sourceError && r.renderRevision === preparation.revision; }
  function guard(r, revision, generation, renderGeneration, activity) {
    return !!r.node && figureCurrent(r) && preparation.revision === revision && preparationGeneration === generation && (r.revision || 0) === renderGeneration && (activity === undefined || activityGeneration === activity);
  }
  function watchRender(r) {
    if (r.renderObserver) r.renderObserver.disconnect();
    var sequence = r.revision, expected = preparation && preparation.revision, signaled = false, timer;
    r.renderRevision = null;
    function settle() {
      if (!signaled || !r.el.isConnected || !preparationOK() || shinyBusy || preparation.revision !== expected || r.revision !== sequence) return;
      var gd = plotFor(r), img = r.el.querySelector('img');
      if ((gd && gd.data && gd.data.length && gd._fullLayout) || (img && img.complete && img.naturalWidth && img.naturalHeight)) {
        r.renderRevision = expected; r.sourceError = false; if (r.renderObserver) r.renderObserver.disconnect();
      }
    }
    function signal() { signaled = true; clearTimeout(timer); timer = setTimeout(settle, 120); }
    r.settleRender = settle;
    r.renderObserver = new MutationObserver(signal);
    r.renderObserver.observe(r.el, {childList:true,subtree:true,attributes:true,attributeFilter:['src']});
    var gd = plotFor(r); if (gd && typeof gd.once === 'function') gd.once('plotly_afterplot', signal);
    r.el.addEventListener('load', signal, {capture:true, once:true});
  }
  function staleSnapshot(r) {
    if (!r.snapshot || !r.node) return;
    r.snapshot.stale = true; r.node.classList.add('tc-stale');
    if (!r.preview) return;
    r.preview.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    r.preview.querySelector('.tc-snapshot-status').textContent = 'The analysis changed or is updating. This frozen figure needs review. Choose Edit to see the current result.';
  }
  function editSnapshot(r) {
    if (!r.node) return;
    if (r.preview) r.preview.remove(); r.preview = null; r.snapshot = null;
    r.node.classList.remove('tc-finished', 'tc-stale');
    r.finishButton.textContent = 'Finish plot'; r.finishButton.setAttribute('aria-pressed', 'false');
    resize(r); tell('Editing the current live plot.');
  }
  async function finishSnapshot(r) {
    if (!r.node || !figureCurrent(r)) { tell('Wait for preparation and this plot to finish updating before finishing the figure.'); return; }
    var gd = plotFor(r), source = r.el.querySelector('img'), renderGeneration = r.revision || 0, revision = preparation.revision, generation = preparationGeneration, activity = activityGeneration, url;
    r.finishButton.disabled = true;
    try {
      await flushAppearance(r);
      if (!guard(r, revision, generation, renderGeneration, activity)) throw new Error('The analysis changed while preparing the figure. Wait for the current plot and try again.');
      if (gd && gd.data && gd.data.length && window.Plotly) {
        var rect = gd.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) throw new Error('Plot is not ready.');
        url = await Plotly.toImage(gd, {format:'svg', width:Math.round(rect.width), height:Math.round(rect.height)});
      } else if (source && source.complete && source.naturalWidth && source.naturalHeight) {
        var c = document.createElement('canvas'); c.width = source.naturalWidth; c.height = source.naturalHeight; c.getContext('2d').drawImage(source,0,0); url = c.toDataURL('image/png');
      } else throw new Error('Plot is not ready.');
      if (!guard(r, revision, generation, renderGeneration, activity)) throw new Error('The analysis changed while preparing the figure. Wait for the current plot and try again.');
      var preview = document.createElement('div'); preview.className = 'tc-snapshot';
      var caption = document.createElement('p'); caption.className = 'tc-snapshot-status'; caption.textContent = url.indexOf('data:image/svg+xml') === 0 ? 'Frozen figure from the current prepared result.' : 'Frozen figure from the current prepared result. SVG and PDF contain a raster image.'; preview.appendChild(caption);
      var image = document.createElement('img'); image.src = url; image.alt = r.label + ' frozen figure'; preview.appendChild(image);
      var exports = document.createElement('div'); exports.className = 'tc-snapshot-exports';
      ['PNG','SVG','PDF'].forEach(function (format) { var button = document.createElement('button'); button.type = 'button'; button.textContent = format; button.addEventListener('click', function () { exportSnapshot(r, format); }); exports.appendChild(button); });
      preview.appendChild(exports); r.node.appendChild(preview);
      r.preview = preview; r.snapshot = {url:url, stale:false, preparationRevision:revision, preparationGeneration:generation, renderGeneration:renderGeneration}; r.node.classList.add('tc-finished');
      r.finishButton.textContent = 'Edit'; r.finishButton.setAttribute('aria-pressed','true');
      tell('Frozen figure ready. Data CSV remains available in Edit.');
    } catch (e) { tell(e.message || 'Could not finish the plot.'); }
    finally { if (r.node) r.finishButton.disabled = false; }
  }
  async function exportSnapshot(r, format) {
    if (shinyBusy) { tell('The analysis is working. Wait for it to finish, then retry the download.'); return; }
    if (!r.snapshot || r.snapshot.stale || !guard(r, r.snapshot.preparationRevision, r.snapshot.preparationGeneration, r.snapshot.renderGeneration)) { if (r.snapshot) staleSnapshot(r); tell('The figure is out of date or the analysis is updating. Choose Edit and finish it again.'); return; }
    var snapshot = r.snapshot, activity = activityGeneration, image = r.preview && r.preview.querySelector('img');
    function checkImage() {
      if (!image || !r.preview || !r.preview.contains(image) || image.getAttribute('src') !== snapshot.url) { staleSnapshot(r); throw new Error('The frozen image is missing or changed. Choose Edit and finish it again.'); }
    }
    try {
      checkImage();
      if (image.decode) await image.decode();
      checkImage();
      if (!r.snapshot || r.snapshot !== snapshot || snapshot.stale || !guard(r,snapshot.preparationRevision,snapshot.preparationGeneration,snapshot.renderGeneration,activity)) throw new Error('The analysis changed or was busy during export. Try again.');
      var width = image.naturalWidth, height = image.naturalHeight, canvas = document.createElement('canvas');
      if (!width || !height) throw new Error('The frozen image has no usable dimensions. Choose Edit and finish it again.');
      canvas.width = format === 'PNG' ? width * 2 : width; canvas.height = format === 'PNG' ? height * 2 : height; var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
      var isSvg = snapshot.url.indexOf('data:image/svg+xml') === 0, svg;
      if (isSvg) svg = await (await fetch(snapshot.url)).text();
      checkImage();
      if (!r.snapshot || r.snapshot !== snapshot || snapshot.stale || !guard(r,snapshot.preparationRevision,snapshot.preparationGeneration,snapshot.renderGeneration,activity)) throw new Error('The analysis changed or was busy during export. Try again.');
      var filename = (r.displayTitle || r.label).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'figure'; filename += '-rev' + String(snapshot.preparationRevision).replace(/[^a-z0-9_-]/gi,'-');
      if (format === 'SVG') {
        if (!isSvg) { var png = canvas.toDataURL('image/png'); svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><image width="' + width + '" height="' + height + '" href="' + png + '"/></svg>'; }
        saveFile(new Blob([svg], {type:'image/svg+xml'}), filename + '.svg');
      } else if (format === 'PNG') {
        var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
        checkImage(); if (!guard(r,snapshot.preparationRevision,snapshot.preparationGeneration,snapshot.renderGeneration,activity)) throw new Error('The analysis changed or was busy during export. Try again.'); if (!blob) throw new Error('Could not create the PNG image. Try another format.'); if (r.snapshot === snapshot && !snapshot.stale) saveFile(blob, filename + '.png');
      } else {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF library is unavailable.');
        var pdf = new window.jspdf.jsPDF({orientation:width>=height?'landscape':'portrait',unit:'pt',format:[width,height]});
        if (isSvg && pdf.svg) await pdf.svg(new DOMParser().parseFromString(svg,'image/svg+xml').documentElement, {x:0,y:0,width:width,height:height});
        else pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,width,height);
        checkImage(); if (!guard(r,snapshot.preparationRevision,snapshot.preparationGeneration,snapshot.renderGeneration,activity)) throw new Error('The analysis changed or was busy during export. Try again.'); if (r.snapshot === snapshot && !snapshot.stale) pdf.save(filename + '.pdf');
      }
    } catch (error) { if (r.snapshot === snapshot && (!preparationOK() || preparation.revision !== snapshot.preparationRevision || preparationGeneration !== snapshot.preparationGeneration || (r.revision || 0) !== snapshot.renderGeneration)) staleSnapshot(r); tell(error.message || 'Could not export the frozen figure. Try another format.'); }
  }
  function plotFor(r) { return r.el.classList.contains('js-plotly-plot') ? r.el : r.el.querySelector('.js-plotly-plot'); }
  function scalarMarks(gd) {
    if (!gd || !gd.data || gd.data.length !== 1) return false;
    var trace = gd.data[0], color = trace.marker && trace.marker.color;
    return ['scatter','scattergl','bar','box','violin'].includes(trace.type || 'scatter') && (typeof color === 'string' || typeof color === 'number');
  }
  function refreshMarkAvailability(r) {
    if (!r.markInput) return;
    r.markInput.disabled = !scalarMarks(plotFor(r));
    r.markInput.title = r.markInput.disabled ? 'Use Colors & palettes for group or per-point colors.' : '';
  }
  function scheduleAppearance(r) {
    clearTimeout(r.appearanceTimer);
    r.appearancePending = true;
    r.appearanceTimer = setTimeout(function () { flushAppearance(r).catch(function () { tell('Could not apply this visual edit. Try again.'); }); }, 150);
  }
  function flushAppearance(r) {
    clearTimeout(r.appearanceTimer);
    if (!r.appearancePending) return r.appearanceQueue || Promise.resolve();
    r.appearancePending = false;
    var generation = r.appearanceGeneration || 0;
    r.appearanceQueue = (r.appearanceQueue || Promise.resolve()).catch(function () {}).then(function () {
      if (r.node && (r.appearanceGeneration || 0) === generation) return applyAppearance(r);
    });
    return r.appearanceQueue;
  }
  function clearAppearance(r) {
    clearTimeout(r.appearanceTimer); r.appearancePending = false; r.appearanceGeneration = (r.appearanceGeneration || 0) + 1;
    Object.keys(r.visual).forEach(function (key) { delete r.visual[key]; }); r.titleBaseline = null; r.axisBaseline = null;
    r.editInputs.forEach(function (input) { input.value = input.type === 'color' ? '#235c77' : ''; });
    r.backgroundInput.value = '#ffffff'; r.content.style.backgroundColor = '';
    r.labelInput.value = r.label; r.labelHeading.textContent = r.label; r.displayTitle = r.label;
    if (r.snapshot) staleSnapshot(r);
    refreshMarkAvailability(r);
    if (selectedRecord === r) window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:{id:r.el.id,title:r.label}}));
    tell('The analysis updated ' + r.label + '. Figure edits were cleared; review the new result.');
  }
  function applyAppearance(r) {
    var gd = r.el.classList.contains('js-plotly-plot') ? r.el : r.el.querySelector('.js-plotly-plot');
    if (!gd || !gd.data || !window.Plotly) { tell('Appearance editing is available after a Plotly plot loads.'); return Promise.resolve(); }
    var v = r.visual || {}, layout = {};
    if (v.plotTitle !== undefined) {
      if (!r.titleBaseline) {
        var originalTitle = gd.layout && gd.layout.title;
        r.titleBaseline = {text: typeof originalTitle === 'string' ? originalTitle : (originalTitle && originalTitle.text) || '',
          marginTop: gd.layout && gd.layout.margin && gd.layout.margin.t != null ? gd.layout.margin.t : null};
      }
      layout['title.text'] = v.plotTitle || r.titleBaseline.text;
      // Dashboard plots intentionally use a 10px top margin; reserve room for the new title.
      layout['margin.t'] = v.plotTitle ? Math.max(55, r.titleBaseline.marginTop || 0) : r.titleBaseline.marginTop;
    }
    if (v.xTitle !== undefined || v.yTitle !== undefined) {
      if (!r.axisBaseline) {
        function axisTitle(axis) { var t = gd.layout && gd.layout[axis] && gd.layout[axis].title; return typeof t === 'string' ? t : (t && t.text) || ''; }
        r.axisBaseline = {x:axisTitle('xaxis'), y:axisTitle('yaxis')};
      }
      if (v.xTitle !== undefined) layout['xaxis.title.text'] = v.xTitle || r.axisBaseline.x;
      if (v.yTitle !== undefined) layout['yaxis.title.text'] = v.yTitle || r.axisBaseline.y;
    }
    if (v.fontSize >= 8 && v.fontSize <= 48) layout['font.size'] = v.fontSize;
    if (v.fontColor) layout['font.color'] = v.fontColor;
    if (v.background) { layout.paper_bgcolor = v.background; layout.plot_bgcolor = v.background; }
    var change = Object.keys(layout).length ? window.Plotly.relayout(gd, layout) : Promise.resolve();
    return Promise.resolve(change).then(function () {
      if (v.markColor && scalarMarks(gd)) return window.Plotly.restyle(gd, {'marker.color': v.markColor}, [0]);
    }).then(function () { refreshMarkAvailability(r); });
  }
  function restore(r) {
    if (!r.node) return;
    if (!r.home.isConnected) { tell('The original view changed; ' + r.label + ' remains on the canvas.'); return; }
    if (r.observer) r.observer.disconnect();
    if (r.originalHeight) r.el.style.setProperty('height', r.originalHeight, r.originalHeightPriority); else r.el.style.removeProperty('height');
    if (r.home.isConnected) { r.home.replaceWith(r.target); }
    if (r.bar && r.barHome && r.barHome.isConnected) r.barHome.replaceWith(r.bar);
    r.node.remove(); r.node = null;
    if (selectedRecord === r) { selectedRecord = null; window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail:null})); }
    board.classList.toggle('has-nodes', !!board.querySelector('.tc-node')); expandBoard(); renderList();
    window.dispatchEvent(new Event('resize')); tell('Returned ' + r.label + ' to its original view.');
  }
  function init() {
    root = document.getElementById('team-canvas-root'); if (!root) return;
    board = root.querySelector('.tc-board'); list = root.querySelector('.tc-list'); status = root.querySelector('.tc-status'); search = root.querySelector('.tc-search');
    search.addEventListener('input', renderList);
    root.querySelector('.tc-reset').addEventListener('click', function () { records.forEach(restore); });
    root.querySelector('.tc-arrange').addEventListener('click', arrange);
    root.querySelector('.tc-library-toggle').addEventListener('click', function () {
      var hidden = root.querySelector('.tc-layout').classList.toggle('tc-library-hidden');
      this.setAttribute('aria-expanded', String(!hidden)); this.textContent = hidden ? 'Show library' : 'Hide library';
      window.dispatchEvent(new Event('resize'));
    });
    if (window.Shiny && Shiny.addCustomMessageHandler) Shiny.addCustomMessageHandler('team-preparation-state', function (state) { window.dispatchEvent(new CustomEvent('team-preparation-state', {detail:state})); });
    if (window.jQuery) jQuery(document).on('shiny:busy', function () {
      if (!shinyBusy) activityGeneration++; shinyBusy = true;
      records.forEach(function (r) { if (r.snapshot && r.preview) r.preview.querySelectorAll('button').forEach(function (b) { b.disabled = true; }); });
    }).on('shiny:idle', function () {
      shinyBusy = false;
      records.forEach(function (r) {
        if (r.settleRender) r.settleRender();
        if (r.snapshot && r.preview && !r.snapshot.stale && guard(r,r.snapshot.preparationRevision,r.snapshot.preparationGeneration,r.snapshot.renderGeneration)) r.preview.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      });
    });
    window.addEventListener('team-preparation-state', function (event) {
      var previous = preparation, next = event.detail;
      var changed = preparationSignature(previous) !== preparationSignature(next);
      if (changed) preparationGeneration++;
      preparation = next;
      if (!previous || !preparation || previous.revision !== preparation.revision) records.forEach(function (r) { r.renderRevision = null; });
      if (changed || !preparationOK()) records.forEach(staleSnapshot);
    });
    discover(); var timer;
    window.TeamCanvas = {
      listPlots: function () { return Array.from(records.values()).filter(function (r) { return r.el.isConnected; }).map(function (r) { return {id:r.el.id, title:r.label, added:!!r.node, available:!r.dynamic}; }).concat(extraRoutes.map(function (r) { return {id:r.id,title:r.title,added:false,available:false}; })); },
      addPlot: function (id) { if (!records.has(id)) discover(); var r = records.get(id); if (!r || r.dynamic || !r.el.isConnected) return false; if (!r.node) add(r); return !!r.node; },
      selected: function () { return selectedRecord && selectedRecord.node ? {id:selectedRecord.el.id, title:selectedRecord.displayTitle || selectedRecord.label} : null; }
    };
    if (window.jQuery) jQuery(document).on('shiny:value', function (event) {
      var r = event.target && records.get(event.target.id);
      if (r) { r.revision = (r.revision || 0) + 1; watchRender(r); if (r.node) { clearAppearance(r); setTimeout(function () { if (r.node) refreshMarkAvailability(r); }, 600); } }
    });
    if (window.jQuery) jQuery(document).on('shiny:error', function (event) {
      var r = event.target && records.get(event.target.id);
      if (!r) return;
      r.revision = (r.revision || 0) + 1; r.renderRevision = null; r.sourceError = true;
      if (r.renderObserver) r.renderObserver.disconnect(); r.settleRender = null;
      if (r.node) { clearAppearance(r); staleSnapshot(r); tell('This plot could not be updated. Wait for a valid result before finishing or exporting it.'); }
    });
    new MutationObserver(function (changes) {
      if (!changes.some(function (change) { return !root.contains(change.target); })) return;
      // Reconcile duplicate IDs immediately; postpone routine catalog refreshes.
      var duplicate = Array.from(document.querySelectorAll(selector)).some(function (el) {
        var r = records.get(el.id); return r && r.node && r.el !== el;
      });
      if (duplicate) discover();
      clearTimeout(timer); timer = setTimeout(discover, 250);
    }).observe(document.body, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
