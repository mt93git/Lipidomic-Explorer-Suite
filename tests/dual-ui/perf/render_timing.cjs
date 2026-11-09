// Phase 1 close (retina-timing): where does a card's render time go on a real API? Measurement only.
// Opens a session on a checkpoint, adds 5 representative cards (one Plotly, one PNG, the heatmap, one longitudinal
// after Generate Analysis, one structural after Initiate) and prints the render route's Server-Timing phases
// (request, pool, queue, args, descriptor, memory, cache, open/card, input, flush, output, encode, revision, store,
// rekey, disk, guard, other = total - the rest, total; where = main | worker | main-fallback), plus the
// client wall time of each request: the first card (cold), then steady state (same card redrawn at another size)
// and the same card at dpr 2.
// Warm worker (Phase 1 close, speed): POST /sessions/<id>/cards answers its own Server-Timing (request, validate, warm,
// defaults, inputs, instance, flush, seed, card, guard, other, total), printed per card; a render answered by a worker
// says workercard = held (the warm job or an earlier render created the worker's copy: no "open" phase), open or update.
//
//   NEXO_API_BASE=https://<host>/api/v1 NEXO_CHECKPOINT_ID=<id> [NEXO_API_USER=<user> NEXO_API_PASS=<pass>] \
//     node tests/dual-ui/perf/render_timing.cjs
// Optional: NEXO_TIMING_SOURCES (comma list, replaces the 5 sources), NEXO_TIMING_WIDTH/HEIGHT (default 620x680),
// NEXO_TIMING_JSON=<file> (write the raw rows as JSON). Credentials are read from the environment only and never printed.
'use strict';
const fs = require('node:fs');
const base = (process.env.NEXO_API_BASE ?? '').replace(/\/+$/, '');
const checkpointId = process.env.NEXO_CHECKPOINT_ID ?? '';
if (!base || !checkpointId) { console.error('Set NEXO_API_BASE (e.g. https://<host>/api/v1) and NEXO_CHECKPOINT_ID.'); process.exit(2); }
const auth = process.env.NEXO_API_USER ? { Authorization: 'Basic ' + Buffer.from(`${process.env.NEXO_API_USER}:${process.env.NEXO_API_PASS ?? ''}`).toString('base64') } : {};
const WIDTH = Number(process.env.NEXO_TIMING_WIDTH ?? 620), HEIGHT = Number(process.env.NEXO_TIMING_HEIGHT ?? 680);
// [label, source, module actions pressed before the first render]
const CARDS = process.env.NEXO_TIMING_SOURCES ? process.env.NEXO_TIMING_SOURCES.split(',').map(s => [s.trim(), s.trim(), []]) : [
  ['plotly', 'results_dashboard-plot_pca', []],
  ['png', 'fla_tab-logratioPlot', []],
  ['heatmap', 'heatmap_barchart_tab-heatmapPlot', []],
  ['longitudinal', 'longitudinal_tab-macroclass_plot', ['submit_longitudinal_btn']],
  ['structural', 'structural_tab-summaryPlot', ['runAnalysis']],
];

async function call(method, path, body, { raw = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    const response = await fetch(base + path, { method, headers: { ...auth, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    // The engine answers one request at a time: 503 busy with Retry-After.
    if (response.status === 503 && attempt < 30) { await response.arrayBuffer(); await new Promise(r => setTimeout(r, 1000 * Number(response.headers.get('retry-after') ?? 1))); continue; }
    const buffer = Buffer.from(await response.arrayBuffer());
    const ms = performance.now() - started;
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${buffer.toString('utf8').slice(0, 300)}`);
    return { ms, headers: response.headers, body: raw ? buffer : JSON.parse(buffer.toString('utf8') || 'null') };
  }
}
// "queue;dur=0.0, flush;dur=812.3, total;dur=901.2, where;desc=\"main\"" -> {queue: 0, flush: 812.3, total: 901.2, where: 'main'}
function serverTiming(header) {
  const out = {};
  for (const part of (header ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    const [name, ...params] = part.split(';').map(s => s.trim());
    for (const p of params) {
      const [k, v] = p.split('=');
      if (k === 'dur') out[name] = Number(v);
      if (k === 'desc') out[name] = String(v ?? '').replace(/^"|"$/g, '');
    }
  }
  return out;
}
const PNG_SIZE = buf => buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG' ? `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}` : '';
// Every phase the route measures (R/frontends/api/cards.R api_timing_*); "other" = total - the sum of the others.
const PHASES = ['request', 'pool', 'queue', 'args', 'descriptor', 'memory', 'cache', 'open', 'card', 'input', 'flush', 'output',
  'encode', 'revision', 'store', 'rekey', 'disk', 'guard', 'other', 'total'];
// The create route's phases (R/frontends/api/cards.R api_timing_create_log).
const CREATE_PHASES = ['request', 'validate', 'warm', 'defaults', 'inputs', 'instance', 'flush', 'seed', 'card', 'guard', 'other', 'total'];
const rows = [];
async function render(label, sessionId, instanceId, step, width, height, dpr) {
  const r = await call('POST', `/sessions/${sessionId}/cards/${instanceId}/render`, { width, height, format: 'auto', ...(dpr !== 1 ? { dpr } : {}) }, { raw: true });
  const t = serverTiming(r.headers.get('server-timing'));
  // "label", not "card": the route has a phase named card (a live card's lookup), which overwrote the label.
  const row = { label, step, size: `${width}x${height}@${dpr}x`, client: r.ms, ...t, png: PNG_SIZE(r.body) };
  rows.push(row); return row;
}
const fmt = v => typeof v === 'number' ? v.toFixed(0) : (v ?? '');
function table(list) {
  const extra = [...new Set(list.flatMap(r => Object.keys(r)))].filter(k => !PHASES.includes(k) &&
    !['label', 'step', 'size', 'client', 'where', 'workercard', 'hit', 'png'].includes(k) && list.some(r => typeof r[k] === 'number'));
  const shown = [...PHASES.filter(p => list.some(r => r[p] !== undefined)), ...extra];
  const cols = ['label', 'step', 'size', 'client', ...shown, 'where', 'workercard', 'hit', 'png'];
  const cells = [cols, ...list.map(r => cols.map(c => fmt(r[c])))];
  const widths = cols.map((_, i) => Math.max(...cells.map(row => String(row[i]).length)));
  return cells.map(row => row.map((c, i) => String(c).padStart(widths[i])).join('  ')).join('\n');
}
function createTable(list) {
  const shown = CREATE_PHASES.filter(p => list.some(c => typeof c.phases?.[p] === 'number'));
  const cols = ['label', 'client', ...shown];
  const cells = [cols, ...list.map(c => cols.map(k => k === 'label' ? c.label : fmt(k === 'client' ? c.create : c.phases?.[k])))];
  const widths = cols.map((_, i) => Math.max(...cells.map(row => String(row[i]).length)));
  return cells.map(row => row.map((v, i) => String(v).padStart(widths[i])).join('  ')).join('\n');
}
(async () => {
  const opened = await call('POST', '/sessions', { checkpointId });
  const sessionId = opened.body.sessionId;
  console.log(`session open: ${opened.ms.toFixed(0)} ms (client wall time; renderWorkers ${opened.body.renderWorkers ?? 0})`);
  const setup = [];
  for (const [label, source, actions] of CARDS) {
    try {
      const created = await call('POST', `/sessions/${sessionId}/cards`, { source, inputs: {} });
      const instanceId = created.body.instanceId;
      let pressed = 0;
      if (actions.length) pressed = (await call('PATCH', `/sessions/${sessionId}/cards/${instanceId}`, { inputs: {}, actions })).ms;
      setup.push({ label, source, instanceId, create: created.ms, actions: pressed, phases: serverTiming(created.headers.get('server-timing')) });
    } catch (e) { console.log(`SKIP ${label} (${source}): ${e.message}`); }
  }
  for (const c of setup) console.log(`card ${c.label.padEnd(12)} ${c.source}: create ${c.create.toFixed(0)} ms${c.actions ? `, actions ${c.actions.toFixed(0)} ms` : ''}`);
  console.log('\nCreate phases (ms; POST /cards Server-Timing; empty = an API without create timing):');
  console.log(createTable(setup));
  for (const [i, c] of setup.entries()) {
    try {
      await render(c.label, sessionId, c.instanceId, i === 0 ? 'first' : 'cold', WIDTH, HEIGHT, 1);
      await render(c.label, sessionId, c.instanceId, 'steady', WIDTH + 40, HEIGHT, 1);
      await render(c.label, sessionId, c.instanceId, 'retina', WIDTH + 40, HEIGHT, 2);
      await render(c.label, sessionId, c.instanceId, 'cached', WIDTH + 40, HEIGHT, 2);
    } catch (e) { console.log(`FAIL render ${c.label}: ${e.message}`); }
  }
  console.log('\nPer-render phases (ms; client = wall time seen by this script):');
  console.log(table(rows));
  const of = step => rows.filter(r => r.step === step).map(r => r.total).filter(Number.isFinite);
  const median = v => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
  console.log(`\nfirst card total ${fmt(of('first')[0])} ms · cold cards median ${fmt(median(of('cold')))} ms · steady state median ${fmt(median(of('steady')))} ms · retina median ${fmt(median(of('retina')))} ms`);
  if (process.env.NEXO_TIMING_JSON) fs.writeFileSync(process.env.NEXO_TIMING_JSON, JSON.stringify({ setup, rows }, null, 2));
  // Free the engine slot (the API keeps at most two live sessions): a measurement must not evict someone's session later.
  await call('DELETE', `/sessions/${sessionId}`).catch(e => console.log(`NOTE session not closed: ${e.message}`));
  console.log('session closed');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
