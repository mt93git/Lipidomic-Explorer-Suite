/* Team dashboard selections have one owner: persistent, bound Shiny text inputs.
 * Plotly receives visibility only; prepared values and coordinates are untouched. */
(function (root) {
  'use strict';
  // scan() runs after DOM changes across the page; write only real changes (each
  // write is itself a mutation and restyle).
  function setProp(el, key, value) { if (el && el[key] !== value) el[key] = value; }
  var inputs = new Map(), plots = new Map(), queued = false;
  function strings(value) {
    return Array.isArray(value) && value.length <= 10000 && value.every(function (v) {
      return typeof v === 'string' && v.length <= 500;
    }) && new Set(value).size === value.length;
  }
  function choicesOf(wrapper) {
    try { var values = JSON.parse(wrapper.dataset.choices); return strings(values) ? values : null; }
    catch (_) { return null; }
  }
  function read(input, choices, defaults) {
    if (input.value === '__ALL__') return {valid:true, values:(defaults || choices).slice()};
    if (input.value === '__EVERY__') return {valid:true, values:choices.slice()};
    try {
      var values = JSON.parse(input.value);
      return strings(values) ? {valid:true, values:choices.filter(function (v) { return values.includes(v); })} : {valid:false,values:[]};
    } catch (_) { return {valid:false,values:[]}; }
  }
  function plotLocked(gd) { return !!(gd && gd.closest && gd.closest('.tc-finished')); }
  function inputLocked(id) {
    var suffix = /-comp_(class|group)_selection$/.test(id) ? '-plot_comp' : /-heat_(group|lipid)_selection$/.test(id) ? '-plot_heat' : null;
    var output = suffix && document.getElementById(id.replace(/-(comp_class_selection|comp_group_selection|heat_group_selection|heat_lipid_selection)$/, suffix));
    return plotLocked(output);
  }
  function status(wrapper, message) {
    var el = wrapper.querySelector('.tds-status');
    if (!el) { el = document.createElement('p'); el.className='tds-status'; el.setAttribute('role','status'); wrapper.appendChild(el); }
    if (el.textContent !== message) el.textContent = message;
    setProp(el, 'hidden', !message);
  }
  function paintInput(record) {
    var parsed = read(record.input, record.choices, record.defaults), locked = inputLocked(record.id);
    record.wrappers.forEach(function (wrapper) {
      wrapper.classList.add('tds-selection');
      wrapper.querySelectorAll('button[data-value],button[data-action]').forEach(function (button) {
        var selected = button.dataset.value !== undefined ? parsed.values.includes(button.dataset.value) : button.dataset.action === 'default' ? record.input.value === '__ALL__' : button.dataset.action === 'all' ? parsed.values.length === record.choices.length : parsed.values.length === 0;
        var pressed = selected ? 'true' : 'false';
        if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed',pressed);
        setProp(button, 'disabled', locked || !parsed.valid);
      });
      var selectedSet = new Set(parsed.values);
      wrapper.querySelectorAll('button[data-class]').forEach(function (button) {
        var members = record.classes && record.classes[button.dataset.class] || [];
        var count = members.filter(function(v){return selectedSet.has(v);}).length;
        var pressed = !count ? 'false' : count === members.length ? 'true' : 'mixed';
        if(button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed',pressed);
        var counter = button.querySelector('.tds-class-count'), text = ' ' + count + '/' + members.length;
        if(counter && counter.textContent !== text) counter.textContent = text;
        setProp(button, 'title', (count === members.length ? 'Hide' : 'Show') + ' all ' + button.dataset.class + ' lipids');
        setProp(button, 'disabled', locked || !parsed.valid);
      });
      status(wrapper, !parsed.valid ? 'This saved selection is invalid. Restore a valid selection before continuing.' : locked ? 'Edit the finished figure before changing its selection.' : !parsed.values.length ? 'Nothing selected. Choose one or more items, or Show all.' : '');
      var summary = wrapper.querySelector('summary');
      var summaryText = 'Visible lipids (' + parsed.values.length + '/' + record.choices.length + ')';
      if (summary && summary.textContent !== summaryText) summary.textContent = summaryText;
      var search = wrapper.querySelector('.tds-search');
      if (search) {
        var term = search.value.trim().toLowerCase();
        wrapper.querySelectorAll('button[data-value]').forEach(function (button) {
          setProp(button, 'hidden', !!term && button.dataset.value.toLowerCase().indexOf(term) === -1);
        });
        setProp(search, 'disabled', locked);
      }
    });
  }
  function ensureInput(id, choices, wrapper) {
    var input = document.getElementById(id);
    if (!input || input.tagName !== 'INPUT' || !strings(choices)) return null;
    var record = inputs.get(id);
    if (!record || record.input !== input) {
      record = {id:id,input:input,choices:choices.slice(),wrappers:new Set(),bound:false}; inputs.set(id,record);
      input.addEventListener('change',schedule); input.addEventListener('input',schedule);
      if (root.jQuery) root.jQuery(input).on('change.teamDashboardSelection input.teamDashboardSelection',schedule);
    }
    record.choices = choices.slice();
    if(wrapper) {
      try {
        var defaults = wrapper.dataset.defaultChoices && JSON.parse(wrapper.dataset.defaultChoices);
        record.defaults = defaults && strings(defaults) ? defaults.filter(function(v){return choices.includes(v);}) : null;
        record.allToken = wrapper.dataset.allToken === '__EVERY__' ? '__EVERY__' : '__ALL__';
        var classes = wrapper.dataset.classMembers && JSON.parse(wrapper.dataset.classMembers);
        record.classes = classes && typeof classes === 'object' && Object.values(classes).every(strings) ? classes : null;
      } catch (_) { record.defaults=null;record.classes=null;record.allToken='__ALL__'; }
    }
    return record;
  }
  function write(record, values, token) {
    if (!record || !strings(values) || inputLocked(record.id)) return Promise.resolve(false);
    var ordered = record.choices.filter(function (v) { return values.includes(v); });
    var raw = token || (ordered.length === record.choices.length ? (record.allToken || '__ALL__') : JSON.stringify(ordered));
    if (record.input.value !== raw) {
      record.input.value = raw;
      // The ordinary bound-input event is required for checkpoint persistence.
      record.input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    paintInput(record);
    return Promise.all(Array.from(plots.values()).filter(function (p) { return p.inputId === record.id; }).map(syncPlot)).then(function () { return true; });
  }
  function metadata(gd) {
    var m = gd && gd.layout && gd.layout.meta && gd.layout.meta.teamClassSelection;
    if (!m || typeof m.inputId !== 'string' || !m.inputId.endsWith('-comp_class_selection') || !strings(m.classes)) return null;
    var outputId = m.inputId.replace(/-comp_class_selection$/,'-plot_comp');
    if (gd.id !== outputId && !(gd.closest && gd.closest('#'+CSS.escape(outputId)))) return null;
    return m;
  }
  function mapClasses(gd, classes) {
    if (!Array.isArray(gd.data)) return null;
    var mapped = gd.data.map(function (trace) {
      var group = trace.legendgroup;
      if(typeof group === 'string' && classes.includes(group))return group;
      if(typeof trace.name === 'string' && classes.includes(trace.name))return trace.name;
      // R Plotly omits name/legendgroup for an unselected all-NA bar. Its
      // explicit producer identity survives; keep the selection owner attached
      // so the new authoritative server selection can clear the pending state.
      var key=trace.meta&&trace.meta.teamSourceKey, prefix='team-composition:';
      var sourceClass=typeof key==='string'&&key.indexOf(prefix)===0?key.slice(prefix.length):null;
      return sourceClass!==null&&classes.includes(sourceClass)?sourceClass:null;
    });
    // Every trace must be a known raw class bar; never bind unrelated helper traces.
    return mapped.length && mapped.every(function (v,i) { return v !== null && gd.data[i].type === 'bar'; }) && classes.every(function (c) { return mapped.includes(c); }) ? mapped : null;
  }
  function overlay(record, message) {
    var host = record.gd, el = host.querySelector(':scope > .tds-empty-overlay');
    if (!message) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className='tds-empty-overlay'; el.setAttribute('role','status'); host.appendChild(el); }
    if (el.textContent !== message) el.textContent = message;
  }
  function preventLegend() { return false; }
  function attachPlot(gd) {
    var meta = metadata(gd); if (!meta) return null;
    var input = ensureInput(meta.inputId,meta.classes); if (!input) return null;
    var record = plots.get(gd), mapped = mapClasses(gd,meta.classes);
    if (!mapped) return null;
    if (!record) {
      record = {gd:gd,inputId:meta.inputId,classes:meta.classes.slice(),mapped:mapped,applying:false,pending:false,task:Promise.resolve()}; plots.set(gd,record);
      if (gd.on) {
        gd.on('plotly_legendclick',preventLegend); gd.on('plotly_legenddoubleclick',preventLegend);
        gd.on('plotly_afterplot',function () { if (!record.applying) schedule(); });
        gd.on('plotly_restyle',function (event) {
          var update = event && event[0];
          if (record.serverEstimator || record.applying || !update || !Object.prototype.hasOwnProperty.call(update,'visible') || plotLocked(gd)) return;
          var selected = record.classes.filter(function (c) {
            return record.mapped.some(function (v,i) { return v===c && gd.data[i].visible!==false && gd.data[i].visible!=='legendonly'; });
          });
          write(inputs.get(record.inputId),selected);
        });
      }
    }
    record.classes=meta.classes.slice();record.mapped=mapped;record.inputId=meta.inputId;record.serverEstimator=meta.serverEstimator===true;record.serverSelected=strings(meta.selected)?meta.selected.slice():null;return record;
  }
  function syncPlot(record) {
    var gd=record.gd,input=inputs.get(record.inputId);
    if (!gd.isConnected || !input || !root.Plotly || plotLocked(gd)) return Promise.resolve(false);
    if (record.applying) { record.pending=true;return record.task; }
    var parsed=read(input.input,input.choices,input.defaults),indices=[],visibility=[];
    if(record.serverEstimator){
      // Group bars are means of per-sample shares. Only R may recompute this
      // estimator; hiding a trace client-side would temporarily show wrong totals.
      var applied=record.serverSelected;
      var pending=parsed.valid&&(!applied||applied.length!==parsed.values.length||parsed.values.some(function(v){return !applied.includes(v);}));
      overlay(record,!parsed.valid?'The saved class selection is invalid.':!parsed.values.length?'No classes selected. Choose classes above or Show all.':pending?'Updating class proportions…':'');
      return Promise.resolve(!pending);
    }
    record.mapped.forEach(function (c,i) {
      var desired=parsed.valid&&parsed.values.includes(c)?true:false;
      if (gd.data[i].visible!==desired) { indices.push(i);visibility.push(desired); }
    });
    overlay(record,!parsed.valid?'The saved class selection is invalid.':!parsed.values.length?'No classes selected. Choose classes above or Show all.':'');
    if (!indices.length) return Promise.resolve(true);
    record.applying=true;record.pending=false;
    record.task=Promise.resolve(root.Plotly.restyle(gd,{visible:visibility},indices)).then(function () {
      gd.dispatchEvent(new CustomEvent('team-dashboard-selection'));
      return true;
    }).catch(function () { overlay(record,'The selected classes could not be displayed. Try the selection again.');return false; }).finally(function () {
      record.applying=false;if(record.pending){record.pending=false;schedule();}
    });
    return record.task;
  }
  function scan() {
    queued=false;
    inputs.forEach(function (r,id) { if(!r.input.isConnected)inputs.delete(id);else r.wrappers.clear(); });
    document.querySelectorAll('[data-selection-input][data-choices]').forEach(function (wrapper) {
      var choices=choicesOf(wrapper),r=choices&&ensureInput(wrapper.dataset.selectionInput,choices,wrapper);
      if(r)r.wrappers.add(wrapper);
    });
    plots.forEach(function (r,gd) { if(!gd.isConnected)plots.delete(gd); });
    document.querySelectorAll('.js-plotly-plot').forEach(attachPlot);
    inputs.forEach(paintInput);plots.forEach(syncPlot);
  }
  function schedule() { if(!queued){queued=true;requestAnimationFrame(scan);} }
  function click(event) {
    var button=event.target.closest('button[data-value],button[data-action],button[data-class]'),wrapper=button&&button.closest('[data-selection-input][data-choices]');
    if(!wrapper)return;
    var choices=choicesOf(wrapper),r=choices&&ensureInput(wrapper.dataset.selectionInput,choices,wrapper);if(!r||inputLocked(r.id))return;
    var parsed=read(r.input,r.choices,r.defaults);if(!parsed.valid)return;
    var next;
    if(button.dataset.class !== undefined) {
      var members = r.classes && r.classes[button.dataset.class];if(!members)return;
      var selected = new Set(parsed.values), memberSet = new Set(members);
      next = members.every(function(v){return selected.has(v);}) ? parsed.values.filter(function(v){return !memberSet.has(v);}) : Array.from(new Set(parsed.values.concat(members)));
    } else next=button.dataset.action==='default'?(r.defaults||r.choices).slice():button.dataset.action==='all'?r.choices.slice():button.dataset.action==='none'?[]:parsed.values.includes(button.dataset.value)?parsed.values.filter(function(v){return v!==button.dataset.value;}):parsed.values.concat(button.dataset.value);
    write(r,next,button.dataset.action==='default'?'__ALL__':null);
  }
  function search(event) {
    var input=event.target.closest('.tds-search'); if(!input)return;
    var wrapper=input.closest('[data-selection-input][data-choices]'); if(!wrapper)return;
    wrapper.querySelectorAll('button[data-value]').forEach(function(button){button.hidden=!!input.value.trim()&&button.dataset.value.toLowerCase().indexOf(input.value.trim().toLowerCase())===-1;});
  }
  root.TeamDashboardSelection={
    scan:scan,
    forPlot:function(gd){var r=attachPlot(gd);if(!r)return null;return {
      getSelection:function(){return read(inputs.get(r.inputId).input,r.classes,inputs.get(r.inputId).defaults).values;},
      isSelected:function(index){return read(inputs.get(r.inputId).input,r.classes,inputs.get(r.inputId).defaults).values.includes(r.mapped[index]);},
      setSeries:function(index,visible){var input=inputs.get(r.inputId),selected=read(input.input,input.choices,input.defaults).values,c=r.mapped[index];return c===undefined?Promise.resolve(false):write(input,visible?selected.concat(selected.includes(c)?[]:[c]):selected.filter(function(v){return v!==c;}));},
      setSelection:function(values){return write(inputs.get(r.inputId),values);},
      showAll:function(){return write(inputs.get(r.inputId),r.classes);},
      sync:function(){return syncPlot(r);}
    };}
  };
  function start(){document.addEventListener('click',click);document.addEventListener('input',search);new MutationObserver(function(changes){if(changes.some(function(m){return m.type==='childList'||m.target.classList&&m.target.classList.contains('tc-node');}))schedule();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});['team-canvas-restored','team-document-restored'].forEach(function(name){root.addEventListener(name,schedule);});if(root.jQuery)root.jQuery(document).on('shiny:value.teamDashboardSelection shiny:connected.teamDashboardSelection',schedule);scan();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(window);
