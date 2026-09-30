import { useId, useState } from 'react';
import { areaAt, formatMonth, months, type Sample, type Tank } from '../data/demo';

export function SeriesChart({ series, index, scenario, tank, scenarioArea, compare = [], compact = false }: { series: Sample[]; index: number; scenario: number | null; tank?: Tank | null; scenarioArea?: number; compare?: Tank[]; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const [windowed, setWindowed] = useState(false);
  const id = useId().replace(/:/g, '');
  const start = windowed ? Math.max(0, index - 23) : 0;
  const end = windowed ? Math.min(120, Math.max(index + 1, 24)) : 120;
  const slice = series.slice(start, end);
  const w = 620, h = compact ? 160 : 210, left = 42, right = 38, top = 16, bottom = h - 27;
  const modeledArea = scenario !== null ? (scenarioArea ?? (tank ? areaAt(tank, index, scenario) : null)) : null;
  const max = Math.max(.1, ...slice.map(s => s.area), ...compare.flatMap(t => t.series.slice(start, end).map(s => s.area)), modeledArea ?? 0) * 1.15;
  const rainMax = Math.max(350, ...slice.map(s => s.rain));
  const x = (i: number) => left + (i - start) / Math.max(1, end - start - 1) * (w - left - right);
  const y = (a: number) => bottom - a / max * (bottom - top);
  const pathFor = (s: Sample[]) => s.map((s, i) => `${i ? 'L' : 'M'}${x(i + start).toFixed(1)},${y(s.area).toFixed(1)}`).join(' ');
  const path = pathFor(slice);
  const active = hover ?? index;
  const sample = series[active];
  return <div className="series-chart">
    {!compact && <div className="chart-header"><span><i className="legend-line cyan" />Water area <i className="legend-bar" />Rainfall ↓</span><button className="text-button" onClick={() => setWindowed(!windowed)}>{windowed ? 'Full record' : '24 months'}</button></div>}
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Synthetic monthly water area and rainfall, 2017 to 2026" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(start + ((e.clientX - r.left) / r.width * w - left) / (w - left - right) * (end - start - 1)); setHover(Math.max(start, Math.min(end - 1, i))); }} onPointerLeave={() => setHover(null)}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#22d3ee" stopOpacity=".29" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></linearGradient></defs>
      {slice.map((s, i) => (i + start) % 12 >= 5 && (i + start) % 12 <= 9 ? <rect key={s.month} x={x(i + start) - 2} y={top} width={(w - left - right) / (end - start)} height={bottom - top} fill="#22d3ee" opacity=".035" /> : null)}
      {[0, .25, .5, .75, 1].map(v => <g key={v}><line x1={left} x2={w - right} y1={y(v * max)} y2={y(v * max)} stroke="#abcad4" strokeOpacity=".08" /><text x={left - 9} y={y(v * max) + 3} textAnchor="end">{(v * max).toFixed(max > 20 ? 0 : 1)}</text></g>)}
      {slice.map((s, i) => <rect key={s.month} x={x(i + start) - 1} y={top} width={windowed ? 8 : 2.4} height={s.rain / rainMax * (bottom - top) * .38} fill="#818cf8" opacity=".42" rx="1" />)}
      <path d={path + ` L${x(end - 1)},${bottom} L${left},${bottom} Z`} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" pathLength="1" className="series-line" />
      {compare.map((t, i) => <path key={t.id} d={pathFor(t.series.slice(start, end))} fill="none" stroke={['#fbbf24', '#c4b5fd', '#34d399'][i]} strokeWidth="1.6" />)}
      {active >= start && active < end && sample && <g><line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="#e2e8f0" strokeOpacity=".4" strokeDasharray="3 4" /><circle cx={x(active)} cy={y(sample.area)} r="4" fill="#091523" stroke="#22d3ee" strokeWidth="2" /></g>}
      {modeledArea !== null && index >= start && index < end && <g><line x1={x(index)} x2={x(index)} y1={y(series[index].area)} y2={y(modeledArea)} stroke="#fbbf24" opacity=".5" strokeDasharray="2 3" /><circle cx={x(index)} cy={y(modeledArea)} r="5" fill="#fbbf24"><title>Scenario: {modeledArea.toFixed(2)} ha</title></circle></g>}
      {slice.map((_, i) => ((i + start) % (windowed ? 6 : 24) === 0) ? <text key={i} x={x(i + start)} y={h - 7} textAnchor="middle">{windowed ? formatMonth(i + start) : months[i + start].slice(0, 4)}</text> : null)}
      <text x="5" y="11">ha</text><text x={w - 23} y="11">mm</text><text x={w - 26} y="29">0</text><text x={w - 30} y={top + (bottom - top) * .38}>{rainMax.toFixed(0)}</text>
    </svg>
    <div className="chart-readout mono"><span>{formatMonth(active)}</span><span className="cyan-text">{sample?.area.toFixed(2)} ha</span><span className="rain-text">{sample?.rain.toFixed(1)} mm</span><span>{modeledArea === null ? 'Illustrative series' : '● Scenario in amber'}</span></div>
  </div>;
}

export function HingeChart() {
  const [mode, setMode] = useState<'hinge' | 'linear'>('hinge');
  const [rain, setRain] = useState(220);
  const fill = mode === 'hinge' ? Math.max(0, Math.min(100, (rain - 180) / 2.6)) : rain / 5;
  return <div className="hinge-panel panel">
    <div className="panel-heading"><span className="eyebrow">RESPONSE LAB / CONCEPTUAL</span><div className="mini-tabs"><button className={mode === 'hinge' ? 'active' : ''} onClick={() => setMode('hinge')}>Hinge</button><button className={mode === 'linear' ? 'active' : ''} onClick={() => setMode('linear')}>Linear</button></div></div>
    <svg viewBox="0 0 550 240" role="img" aria-label={`Conceptual ${mode} model: ${rain} millimeters yields ${fill.toFixed(0)} percent area`}>
      {[0, 25, 50, 75, 100].map(v => <g key={v}><line x1="48" x2="510" y1={190 - v * 1.5} y2={190 - v * 1.5} stroke="#91b6c7" strokeOpacity=".12" /><text x="34" y={194 - v * 1.5} textAnchor="end">{v}</text></g>)}
      <line x1="214" x2="214" y1="28" y2="195" stroke="#fbbf24" strokeOpacity=".6" strokeDasharray="4 5" />
      <text x="222" y="25" fill="#fbbf24">180 mm · demo threshold</text>
      <path d={mode === 'hinge' ? 'M48 190 L214 190 L454 40 L510 40' : 'M48 190 L510 40'} fill="none" stroke="#22d3ee" strokeWidth="3" className="model-line" />
      <circle cx={48 + rain / 500 * 462} cy={190 - fill * 1.5} r="7" fill="#0b1827" stroke="#fbbf24" strokeWidth="3" />
      {[0, 100, 200, 300, 400, 500].map(v => <text key={v} x={48 + v / 500 * 462} y="216" textAnchor="middle">{v}</text>)}
      <text x="245" y="237">Illustrative rainfall (mm)</text><text x="5" y="20">Area %</text>
    </svg>
    <label className="lab-slider">Test the idea <input aria-label="Conceptual model rainfall" type="range" min="0" max="500" value={rain} onChange={e => setRain(+e.target.value)} /><span className="mono">{fill.toFixed(0)}% area</span></label>
    <p className="small muted">An illustration of the hypothesis. This curve is not a fitted result or a prediction for a real tank.</p>
  </div>;
}
