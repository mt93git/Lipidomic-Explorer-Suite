// The Diagnostics figures, in plain SVG like the entry screens: Shin et al. 2025 Fig. 3c (network), 4b-i (landscape,
// perturbations) and the metadata panels. Each takes the engine's answer (api/diagnostics.ts) and draws nothing else.
import { useState, type ReactNode } from 'react';
import type { Attractor, DoublePerturbation, Landscape, LandscapeSample, MetadataTest, Perturbation } from '../../api/diagnostics';
import { binnedMean, clamp, edgePath, entropyColor, extent, fitLayout, fmtP, groupColors, landscapeCurve, niceTicks, perturbationLabel, rampColor, scale, shortName, wellWidth } from './landscapeMath';

const INK = '#141b24', MUTED = '#44505e', LINE = '#e3e7ec', RED = '#c0392b', NODE = '#a9d4ef', NODE_EDGE = '#2f6f99', WATER = '#5aa4c8';

function Tip({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const show = (e: React.PointerEvent | React.FocusEvent) => {
    const el = (e.target as Element).closest('[data-tip]'); if (!el) return setTip(null);
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect(), r = el.getBoundingClientRect();
    setTip({ text: el.getAttribute('data-tip') ?? '', x: r.left + r.width / 2 - box.left, y: r.top - box.top });
  };
  return <div className="dx-chart" onPointerOver={show} onPointerLeave={() => setTip(null)}>{children}
    {tip && <div className="dx-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}</div>;
}
function Axis({ x, y, w, h, xs, ys, xt, yt, xLabel, yLabel, xFmt = (v: number) => String(v), yFmt = (v: number) => String(v) }:
  { x: number; y: number; w: number; h: number; xs: (v: number) => number; ys: (v: number) => number; xt: number[]; yt: number[]; xLabel?: string; yLabel?: string; xFmt?: (v: number) => string; yFmt?: (v: number) => string }) {
  return <g className="dx-axis">
    {yt.map(v => <g key={`y${v}`}><line x1={x} x2={x + w} y1={ys(v)} y2={ys(v)} stroke={LINE}/><text x={x - 6} y={ys(v) + 4} textAnchor="end">{yFmt(v)}</text></g>)}
    {xt.map(v => <text key={`x${v}`} x={xs(v)} y={y + h + 16} textAnchor="middle">{xFmt(v)}</text>)}
    <line x1={x} x2={x + w} y1={y + h} y2={y + h} stroke={MUTED}/><line x1={x} x2={x} y1={y} y2={y + h} stroke={MUTED}/>
    {xLabel && <text className="dx-axis-title" x={x + w / 2} y={y + h + 34} textAnchor="middle">{xLabel}</text>}
    {yLabel && <text className="dx-axis-title" transform={`translate(${x - 40},${y + h / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>}
  </g>;
}
function Ramp({ x, y, label, color, lo, hi }: { x: number; y: number; label: string; color: (t: number) => string; lo: string; hi: string }) {
  const id = `ramp-${label.replace(/\W/g, '')}`;
  return <g><defs><linearGradient id={id} x1="0" x2="0" y1="1" y2="0">{[0, .25, .5, .75, 1].map(t => <stop key={t} offset={t} stopColor={color(t)}/>)}</linearGradient></defs>
    <text x={x} y={y - 6} className="dx-legend-title">{label}</text><rect x={x} y={y} width={12} height={90} fill={`url(#${id})`} rx={2}/>
    <text x={x + 16} y={y + 8} className="dx-legend">{hi}</text><text x={x + 16} y={y + 90} className="dx-legend">{lo}</text></g>;
}

/** Fig. 3c, for lipids: each lipid and the lipids its Boolean rule reads; black arrows activate, red bars inhibit. */
export function NetworkFigure({ data }: { data: Landscape }) {
  const W = 520, H = 440, R = 13, pos = fitLayout(data.network.nodes, W, H, 70);
  const pairs = new Set(data.network.edges.map(e => `${e.from}>${e.to}`));
  return <Tip><svg className="dx-svg" viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label="Lipid co-regulation network">
    <defs><marker id="dx-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={INK}/></marker></defs>
    {data.network.edges.map((e, i) => {
      const a = pos[e.from], b = pos[e.to]; if (!a || !b || e.from === e.to) return null;
      const p = edgePath(a, b, R, pairs.has(`${e.to}>${e.from}`)), color = e.sign < 0 ? RED : INK;
      const nx = -Math.sin(p.angle) * 6, ny = Math.cos(p.angle) * 6;
      return <g key={i}><path d={p.d} fill="none" stroke={color} strokeWidth={1.4} markerEnd={e.sign < 0 ? undefined : 'url(#dx-arrow)'}/>
        {e.sign < 0 && <line x1={p.end.x - nx} y1={p.end.y - ny} x2={p.end.x + nx} y2={p.end.y + ny} stroke={color} strokeWidth={2}/>}</g>;
    })}
    {data.network.nodes.map(n => { const p = pos[n.id]; const up = n.effect > 0;
      return <g key={n.id} tabIndex={0} data-tip={`${n.name} · ${up ? 'higher' : 'lower'} in ${String(data.params.target)} (effect ${n.effect.toFixed(2)}, FDR ${fmtP(n.fdr)})${n.core ? ' · feedback core' : ''}`}>
        <circle cx={p.x} cy={p.y} r={R} fill={NODE} stroke={NODE_EDGE} strokeWidth={n.core ? 2 : 1}/>
        <text x={p.x} y={p.y + 4} textAnchor="middle" className="dx-node-dir">{up ? '↑' : '↓'}</text>
        <text x={p.x + R + 4} y={p.y - R + 2} className="dx-node-label">{shortName(n.name)}</text></g>; })}
  </svg></Tip>;
}

/** Fig. 4b: samples on their PCA of the landscape lipids, by effective distance and by attractor entropy, then entropy over d_eff. */
export function SampleMapFigure({ data }: { data: Landscape }) {
  const s = data.samples, W = 300, H = 250, L = 46, B = 40, T = 14, Rt = 64;
  const [x0, x1] = extent(s.map(p => p.pc1)), [y0, y1] = extent(s.map(p => p.pc2));
  const xs = scale(x0, x1, L, W - Rt), ys = scale(y0, y1, H - B, T);
  const [e0, e1] = extent(s.map(p => p.entropy), 0);
  const map = (color: (p: LandscapeSample) => string, label: string, ramp: ReactNode) => <Tip><svg className="dx-svg" viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label={label}>
    <Axis x={L} y={T} w={W - L - Rt} h={H - T - B} xs={xs} ys={ys} xt={niceTicks(x0, x1, 4)} yt={niceTicks(y0, y1, 4)} xLabel="Component 1" yLabel="Component 2"/>
    {s.map(p => <circle key={p.sample} cx={xs(p.pc1)} cy={ys(p.pc2)} r={4.2} fill={color(p)} stroke="#fff" strokeWidth={0.6} tabIndex={0}
      data-tip={`${p.sample} · ${p.group} · d_eff ${p.dInit.toFixed(2)} → ${p.attractor} · entropy ${p.entropy.toFixed(2)}`}/>)}{ramp}</svg></Tip>;
  const PW = 320, ex = scale(-0.1, 1.1, L, PW - 12), ey = scale(e0, e1, H - B, T), line = binnedMean(s.map(p => ({ x: clamp(p.dInit, -0.1, 1.1), y: p.entropy })), 8);
  const colors = groupColors(s.map(p => p.group));
  return <div className="dx-row">
    {map(p => rampColor(p.dInit), 'Samples by effective distance', <Ramp x={W - 48} y={T + 20} label="d_eff" color={rampColor} lo="0" hi="1"/>)}
    {map(p => entropyColor((p.entropy - e0) / ((e1 - e0) || 1)), 'Samples by attractor entropy', <Ramp x={W - 48} y={T + 20} label="Entropy" color={entropyColor} lo={e0.toFixed(1)} hi={e1.toFixed(1)}/>)}
    <Tip><svg className="dx-svg" viewBox={`0 0 ${PW} ${H}`} width={PW} role="img" aria-label="Attractor entropy over effective distance">
      <Axis x={L} y={T} w={PW - L - 12} h={H - T - B} xs={ex} ys={ey} xt={[0, .25, .5, .75, 1]} yt={niceTicks(e0, e1, 4)} xLabel="Effective distance" yLabel="Attractor entropy"/>
      {s.map(p => <circle key={p.sample} cx={ex(clamp(p.dInit, -0.1, 1.1))} cy={ey(p.entropy)} r={3.6} fill={colors[p.group]} fillOpacity={0.75} tabIndex={0} data-tip={`${p.sample} · ${p.group}`}/>)}
      <polyline points={line.map(p => `${ex(p.x)},${ey(p.y)}`).join(' ')} fill="none" stroke="#1d4f7c" strokeWidth={2.2}/>
    </svg></Tip>
    <Legend colors={colors}/>
  </div>;
}
export function Legend({ colors }: { colors: Record<string, string> }) {
  return <ul className="dx-key">{Object.entries(colors).map(([g, c]) => <li key={g}><span style={{ background: c }}/>{g}</li>)}</ul>;
}

/** Fig. 4c: where every initial state settles (d_initial -> d_final, by count) with the basin sizes, and the entropy of each basin. */
export function FlowFigure({ data }: { data: Landscape }) {
  const W = 360, H = 260, L = 46, B = 40, T = 14, R = 70;
  const xs = scale(-0.05, 1.05, L, W - R), ys = scale(-0.05, 1.05, H - B, T), max = Math.max(...data.flow.map(f => f.count), 1);
  const bx = scale(0, Math.max(...data.attractors.map(a => a.basin)), W - R + 10, W - 8);
  const bw = 330, [s0, s1] = extent(data.entropyByAttractor.flatMap(e => [e.min, e.max]), 0.1), ex = scale(-0.1, 1.1, L, bw - 12), ey = scale(s0, s1, H - B, T);
  return <div className="dx-row">
    <Tip><svg className="dx-svg" viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label="Initial and final effective distance of every state">
      <Axis x={L} y={T} w={W - L - R} h={H - T - B} xs={xs} ys={ys} xt={[0, .25, .5, .75, 1]} yt={[0, .25, .5, .75, 1]} xLabel="d initial" yLabel="d final"/>
      {data.flow.map((f, i) => <rect key={i} x={xs(f.dInit) - 4} y={ys(clamp(f.dFinal, -0.05, 1.05)) - 4} width={8} height={8} rx={1.5} fill={entropyColor(0.15 + 0.85 * f.count / max)} tabIndex={0} data-tip={`${f.count} states: d ${f.dInit.toFixed(2)} → ${f.dFinal.toFixed(2)}`}/>)}
      {data.attractors.map(a => <g key={a.id}><rect x={W - R + 10} y={ys(clamp(a.deff, -0.05, 1.05)) - 3} width={bx(a.basin) - (W - R + 10)} height={6} fill={MUTED} tabIndex={0} data-tip={`${a.id}${a.label ? ` (${a.label})` : ''}: basin ${(100 * a.basin).toFixed(1)} %`}/></g>)}
      <text x={W - R + 10} y={T - 2} className="dx-legend-title">Basin</text>
    </svg></Tip>
    <Tip><svg className="dx-svg" viewBox={`0 0 ${bw} ${H}`} width={bw} role="img" aria-label="Attractor entropy of the states in each basin">
      <Axis x={L} y={T} w={bw - L - 12} h={H - T - B} xs={ex} ys={ey} xt={[0, .25, .5, .75, 1]} yt={niceTicks(s0, s1, 4)} xLabel="d final (attractor)" yLabel="Attractor entropy, S"/>
      {data.entropyByAttractor.map(e => { const x = ex(clamp(e.deff, -0.1, 1.1)); return <g key={e.attractor} tabIndex={0} data-tip={`${e.attractor}: median S ${e.median.toFixed(2)}`}>
        <line x1={x} x2={x} y1={ey(e.min)} y2={ey(e.max)} stroke={MUTED}/><rect x={x - 9} y={ey(e.q3)} width={18} height={Math.max(1, ey(e.q1) - ey(e.q3))} fill="#5fa8a0" stroke="#2b5f59"/>
        <line x1={x - 9} x2={x + 9} y1={ey(e.median)} y2={ey(e.median)} stroke={INK} strokeWidth={2}/></g>; })}
    </svg></Tip>
  </div>;
}

/** Fig. 4d / 4g: the continuous landscape along the reference -> target axis; the aberrance score is the paper's cancer score. */
export function LandscapeFigure({ attractors, smax, score, title, reference, target, compact = false, samples }:
  { attractors: Attractor[]; smax: number; score: number; title: string; reference: string; target: string; compact?: boolean; samples?: LandscapeSample[] }) {
  const W = compact ? 620 : 820, H = compact ? 220 : 300, L = 46, B = 40, T = 30, curve = landscapeCurve(attractors, smax);
  const xs = scale(-0.15, 1.15, L, W - 12), ys = scale(Math.min(...attractors.map(a => a.entropy), smax) - 0.2, smax + 0.25, H - B, T);
  const path = curve.map((p, i) => `${i ? 'L' : 'M'}${xs(p.x).toFixed(1)},${ys(p.y).toFixed(1)}`).join(' ');
  const id = `water-${title.replace(/\W/g, '')}`;
  const n = attractors.reduce((a, b) => (b.deff < a.deff ? b : a), attractors[0]), c = attractors.reduce((a, b) => (b.deff > a.deff ? b : a), attractors[0]);
  return <Tip><svg className="dx-svg" viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label={`${title}, aberrance score ${score.toFixed(3)}`}>
    <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e9f3f8"/><stop offset="1" stopColor={WATER}/></linearGradient></defs>
    <text x={L} y={16} className="dx-fig-title">{title}<tspan className="dx-score"> · Aberrance score = {score.toFixed(3)}</tspan></text>
    <line x1={L} x2={W - 12} y1={ys(smax)} y2={ys(smax)} stroke={MUTED} strokeDasharray="3 3"/><text x={W - 14} y={ys(smax) - 4} textAnchor="end" className="dx-legend">S max</text>
    <path d={`${path} L${xs(1.15)},${ys(smax)} L${xs(-0.15)},${ys(smax)} Z`} fill={`url(#${id})`} stroke="none"/>
    <path d={path} fill="none" stroke="#1d4f7c" strokeWidth={1.6}/>
    {samples?.map(s => <line key={s.sample} x1={xs(clamp(s.dInit, -0.15, 1.15))} x2={xs(clamp(s.dInit, -0.15, 1.15))} y1={H - B} y2={H - B - 6} stroke={rampColor(s.dInit)} strokeWidth={1.4}/>)}
    {attractors.map(a => <g key={a.id} tabIndex={0} data-tip={`${a.id}${a.label ? ` (${a.label})` : ''}: d_eff ${a.deff.toFixed(2)}, basin ${(100 * a.basin).toFixed(1)} %, entropy ${a.entropy.toFixed(2)}${a.cyclic ? ', cyclic' : ''}`}>
      <circle cx={xs(a.deff)} cy={ys(a.entropy)} r={3.5} fill={rampColor(a.deff)} stroke={INK} strokeWidth={0.6}/>
      <rect x={xs(a.deff) - wellWidth(a.basin) * (W - L - 12) / 1.3} y={ys(smax) - 4} width={2 * wellWidth(a.basin) * (W - L - 12) / 1.3} height={8} fill="transparent"/></g>)}
    {n && n.deff <= 0.25 && <text x={xs(n.deff)} y={ys(n.entropy) + 16} textAnchor="middle" className="dx-attractor-tag">{reference}</text>}
    {c && c !== n && c.deff >= 0.75 && <text x={xs(c.deff)} y={ys(c.entropy) + 16} textAnchor="middle" className="dx-attractor-tag">{target}</text>}
    {[0, 1].map(v => <g key={v}><line x1={xs(v)} x2={xs(v)} y1={H - B} y2={H - B + 4} stroke={MUTED}/><text x={xs(v)} y={H - B + 16} textAnchor="middle" className="dx-legend">d = {v} ({v ? target : reference})</text></g>)}
    <text x={L + (W - L - 12) / 2} y={H - 4} textAnchor="middle" className="dx-axis-title">Effective distance</text>
    <text transform={`translate(14,${(H - B + T) / 2}) rotate(-90)`} textAnchor="middle" className="dx-axis-title">Attractor entropy, S</text>
  </svg></Tip>;
}

/** Fig. 4e-f: basin distribution over the effective distance and the aberrance score, for every node fixed low (0) or high (1). */
export function PerturbationFigure({ data }: { data: Landscape }) {
  const rows = [...data.perturbations.single].sort((a, b) => a.score - b.score);
  const control = data.perturbations.control.score, best = new Set(rows.slice(0, 5).map(r => r.id));
  const RH = 16, T = 26, L = 160, W1 = 300, W2 = 260, H = T + RH * (rows.length + 1) + 34;
  const dx = scale(-0.05, 1.05, L, W1 - 10), sx = scale(0, 1, L, W2 - 12);
  const all: (Perturbation | { id: string; score: number; attractors: Attractor[] })[] = [{ id: 'Control', score: control, attractors: data.attractors }, ...rows];
  return <div className="dx-row">
    <Tip><svg className="dx-svg" viewBox={`0 0 ${W1} ${H}`} width={W1} role="img" aria-label="Basin size distribution after each perturbation">
      <text x={L} y={14} className="dx-fig-title">Basin size distribution</text>
      {all.map((r, i) => { const y = T + i * RH + RH;
        return <g key={r.id}><text x={L - 6} y={y - 3} textAnchor="end" className={r.id === 'Control' ? 'dx-row-label strong' : 'dx-row-label'}>{r.id === 'Control' ? 'Control' : perturbationLabel(r.id)}</text>
          <line x1={L} x2={W1 - 10} y1={y} y2={y} stroke={LINE}/>
          {r.attractors.map(a => <rect key={a.id} x={dx(clamp(a.deff, -0.05, 1.05)) - 4} y={y - RH * 0.9 * a.basin} width={8} height={Math.max(0.5, RH * 0.9 * a.basin)} fill={rampColor(a.deff)} tabIndex={0} data-tip={`${r.id}: ${a.id} d ${a.deff.toFixed(2)}, basin ${(100 * a.basin).toFixed(1)} %`}/>)}</g>; })}
      {[0, .5, 1].map(v => <text key={v} x={dx(v)} y={H - 18} textAnchor="middle" className="dx-legend">{v}</text>)}
      <text x={(L + W1) / 2} y={H - 4} textAnchor="middle" className="dx-axis-title">Distance from the reference attractor</text>
    </svg></Tip>
    <Tip><svg className="dx-svg" viewBox={`0 0 ${W2} ${H}`} width={W2} role="img" aria-label="Aberrance score after each perturbation">
      <text x={L} y={14} className="dx-fig-title">Aberrance score</text>
      {all.map((r, i) => { const y = T + i * RH + RH - 5, isControl = r.id === 'Control', color = isControl ? '#2a78d6' : best.has(r.id) ? '#eb6834' : '#9aa5b1';
        return <g key={r.id} tabIndex={0} data-tip={`${r.id}: ${r.score.toFixed(3)}`}><text x={L - 6} y={y + 4} textAnchor="end" className="dx-row-label">{isControl ? 'Control' : perturbationLabel(r.id)}</text>
          <line x1={sx(0)} x2={sx(clamp(r.score))} y1={y} y2={y} stroke={color} strokeWidth={2}/><circle cx={sx(clamp(r.score))} cy={y} r={3.5} fill={color}/></g>; })}
      <line x1={sx(control)} x2={sx(control)} y1={T} y2={H - 30} stroke="#2a78d6" strokeDasharray="3 3"/>
      {[0, .5, 1].map(v => <text key={v} x={sx(v)} y={H - 18} textAnchor="middle" className="dx-legend">{v}</text>)}
    </svg></Tip>
  </div>;
}

/** Fig. 4h: aberrance score for each pair of the five most effective single perturbations. */
export function DoubleHeatmap({ doubles }: { doubles: DoublePerturbation[] }) {
  const firsts = [...new Set(doubles.map(d => d.first))], seconds = [...new Set(doubles.map(d => d.second))];
  const C = 64, L = 150, T = 30, W = L + C * seconds.length + 10, H = T + C * firsts.length + 70;
  const color = (v: number) => { const t = clamp(v / 0.6); const a = [196, 102, 32], m = [240, 240, 244], b = [92, 54, 140];
    const [p, q, f] = t < 0.5 ? [a, m, t / 0.5] : [m, b, (t - 0.5) / 0.5]; return `rgb(${p.map((x, k) => Math.round(x + (q[k] - x) * f)).join(',')})`; };
  return <Tip><svg className="dx-svg" viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label="Double-node perturbation">
    <text x={L} y={16} className="dx-fig-title">Double-node perturbation</text>
    {firsts.map((f, i) => <text key={f} x={L - 6} y={T + i * C + C / 2 + 4} textAnchor="end" className="dx-row-label">{perturbationLabel(f)}</text>)}
    {seconds.map((s, j) => <text key={s} transform={`translate(${L + j * C + C / 2},${T + firsts.length * C + 8}) rotate(35)`} className="dx-row-label">{perturbationLabel(s)}</text>)}
    {doubles.map(d => { const i = firsts.indexOf(d.first), j = seconds.indexOf(d.second);
      return <g key={`${d.first}+${d.second}`} tabIndex={0} data-tip={`${d.first} + ${d.second}: ${d.score.toFixed(3)}`}><rect x={L + j * C + 1} y={T + i * C + 1} width={C - 2} height={C - 2} fill={color(d.score)} rx={3}/>
        <text x={L + j * C + C / 2} y={T + i * C + C / 2 + 4} textAnchor="middle" className="dx-cell" fill={d.score < 0.15 || d.score > 0.5 ? '#fff' : INK}>{d.score.toFixed(2)}</text></g>; })}
  </svg></Tip>;
}

/** Fig. 4i: the most effective double perturbations, ranked. */
export function DoubleRanking({ doubles }: { doubles: DoublePerturbation[] }) {
  const rows = [...doubles].sort((a, b) => a.score - b.score).slice(0, 15), W = 520, H = 250, L = 40, B = 110, T = 24;
  const xs = (i: number) => L + (i + 0.5) * (W - L - 10) / Math.max(1, rows.length), bw = (W - L - 10) / Math.max(1, rows.length) * 0.7;
  const ys = scale(0, Math.max(0.1, ...rows.map(r => r.score)), H - B, T);
  return <Tip><svg className="dx-svg" viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label="Most effective double-node perturbations">
    <text x={L} y={14} className="dx-fig-title">Most effective double-node perturbations</text>
    <Axis x={L} y={T} w={W - L - 10} h={H - T - B} xs={xs} ys={ys} xt={[]} yt={niceTicks(0, Math.max(0.1, ...rows.map(r => r.score)), 4)} yLabel="Aberrance score"/>
    {rows.map((r, i) => <g key={i} tabIndex={0} data-tip={`${r.first} + ${r.second}: ${r.score.toFixed(3)}`}><rect x={xs(i) - bw / 2} y={ys(r.score)} width={bw} height={H - B - ys(r.score)} fill="#4a5563"/>
      <text transform={`translate(${xs(i)},${H - B + 8}) rotate(55)`} className="dx-row-label">{`${perturbationLabel(r.first)} & ${perturbationLabel(r.second)}`}</text></g>)}
  </svg></Tip>;
}

/** Diagnosis: how each group distributes over the attractors (the attractor each sample falls into, Fig. 3e). */
export function AttractorComposition({ data }: { data: Landscape }) {
  const groups = [...new Set(data.samples.map(s => s.group))], ids = data.attractors.map(a => a.id);
  const W = 420, RH = 26, L = 120, T = 24, H = T + RH * groups.length + 40, xs = scale(0, 1, L, W - 10);
  return <Tip><svg className="dx-svg" viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label="Attractor of each sample, by group">
    <text x={L} y={14} className="dx-fig-title">Attractor reached by each sample</text>
    {groups.map((g, i) => { const rows = data.samples.filter(s => s.group === g); let x = 0;
      return <g key={g}><text x={L - 6} y={T + i * RH + RH / 2 + 4} textAnchor="end" className="dx-row-label">{g} ({rows.length})</text>
        {ids.map(id => { const share = rows.filter(s => s.attractor === id).length / rows.length, a = data.attractors.find(t => t.id === id)!, x0 = x; x += share;
          return share ? <rect key={id} x={xs(x0)} y={T + i * RH + 3} width={xs(x0 + share) - xs(x0)} height={RH - 6} fill={rampColor(a.deff)} stroke="#fff" tabIndex={0}
            data-tip={`${g}: ${Math.round(share * rows.length)} of ${rows.length} in ${id}${a.label ? ` (${a.label})` : ''}, d ${a.deff.toFixed(2)}`}/> : null; })}</g>; })}
    {[0, .5, 1].map(v => <text key={v} x={xs(v)} y={H - 18} textAnchor="middle" className="dx-legend">{v * 100} %</text>)}
  </svg></Tip>;
}

/** One metadata column against the effective distance: boxes per level, or a scatter for a number. */
export function MetadataDetail({ test }: { test: MetadataTest }) {
  const W = 420, H = 240, L = 46, B = 56, T = 14;
  if (test.kind === 'numeric' && test.points) {
    const [x0, x1] = extent(test.points.map(p => p.x)), xs = scale(x0, x1, L, W - 10), [y0, y1] = extent(test.points.map(p => p.y)), ys = scale(y0, y1, H - B, T);
    return <Tip><svg className="dx-svg" viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label={`${test.column} against effective distance`}>
      <Axis x={L} y={T} w={W - L - 10} h={H - T - B} xs={xs} ys={ys} xt={niceTicks(x0, x1, 5)} yt={niceTicks(y0, y1, 4)} xLabel={test.column} yLabel="Effective distance"/>
      {test.points.map((p, i) => <circle key={i} cx={xs(p.x)} cy={ys(p.y)} r={4} fill={rampColor(p.y)} stroke="#fff" strokeWidth={0.6} tabIndex={0} data-tip={`${test.column} ${p.x} · d ${p.y.toFixed(2)} · ${p.attractor}`}/>)}
    </svg></Tip>;
  }
  const levels = test.levels ?? [], [y0, y1] = extent(levels.flatMap(l => [l.min, l.max])), ys = scale(y0, y1, H - B, T);
  const xs = (i: number) => L + (i + 0.5) * (W - L - 10) / Math.max(1, levels.length);
  return <Tip><svg className="dx-svg" viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label={`${test.column} against effective distance`}>
    <Axis x={L} y={T} w={W - L - 10} h={H - T - B} xs={xs} ys={ys} xt={[]} yt={niceTicks(y0, y1, 4)} yLabel="Effective distance"/>
    {levels.map((l, i) => <g key={l.level} tabIndex={0} data-tip={`${l.level}: n ${l.n}, median d ${l.median.toFixed(2)}`}>
      <line x1={xs(i)} x2={xs(i)} y1={ys(l.min)} y2={ys(l.max)} stroke={MUTED}/><rect x={xs(i) - 14} y={ys(l.q3)} width={28} height={Math.max(1, ys(l.q1) - ys(l.q3))} fill={rampColor(l.median)} stroke={INK} strokeWidth={0.6}/>
      <line x1={xs(i) - 14} x2={xs(i) + 14} y1={ys(l.median)} y2={ys(l.median)} stroke={INK} strokeWidth={2}/>
      <text transform={`translate(${xs(i)},${H - B + 12}) rotate(25)`} className="dx-row-label">{l.level.length > 22 ? `${l.level.slice(0, 21)}…` : l.level} ({l.n})</text></g>)}
  </svg></Tip>;
}
