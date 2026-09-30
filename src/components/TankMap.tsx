import { useEffect, useRef, useState } from 'react';
import { Bookmark, Maximize2, Minus, Plus, LocateFixed, ArrowUpDown } from 'lucide-react';
import { areaAt, CLASSES, hasFlag, type Tank } from '../data/demo';

type Props = { tanks: Tank[]; selected: string | null; onSelect: (id: string) => void; index: number; scenario: number | null; bookmarks: string[]; view: 'map' | 'table' };
export default function TankMap({ tanks, selected, onSelect, index, scenario, bookmarks, view }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<{ tank: Tank; x: number; y: number } | null>(null);
  const [sort, setSort] = useState<'id' | 'area' | 'frequency' | 'lag'>('id');
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  useEffect(() => setPage(0), [tanks]);
  const x = (t: Tank) => 70 + (t.lon - 77.2) / .6 * 660;
  const y = (t: Tank) => 440 - (t.lat - 14.1) / .5 * 392;
  const sorted = [...tanks].sort((a, b) => (typeof a[sort] === 'string' ? String(a[sort]).localeCompare(String(b[sort])) : (Number(a[sort]) - Number(b[sort]))) * (ascending ? 1 : -1));
  const changeSort = (key: typeof sort) => { if (sort === key) setAscending(!ascending); else { setSort(key); setAscending(key === 'id'); } setPage(0); };
  const rows = sorted.slice(page * 10, (page + 1) * 10);
  if (view === 'table') return <div className="table-view">
    <div className="table-scroll"><table><thead><tr>{(['id', 'area', 'frequency', 'lag'] as const).map((key, i) => <th key={key} aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}><button onClick={() => changeSort(key)}>{['Tank / class', 'Area (ha)', 'Fill freq.', 'Lag (mo)'][i]}<ArrowUpDown size={11} /></button></th>)}</tr></thead><tbody>{rows.map(t => <tr key={t.id} className={selected === t.id ? 'selected-row' : ''} onClick={() => onSelect(t.id)}><td><button className="tank-table-button" onClick={() => onSelect(t.id)}><i style={{ background: CLASSES[t.classification].color }} />{t.id.toUpperCase()}{bookmarks.includes(t.id) && <Bookmark size={11} />}</button><span className="table-class">{CLASSES[t.classification].label}</span></td><td>{t.area.toFixed(1)}</td><td>{t.frequency === null ? '—' : (t.frequency * 100).toFixed(0) + '%'}</td><td>{t.lag ?? '—'}</td></tr>)}</tbody></table></div>
    {!tanks.length && <div className="empty-state">No tanks match. Clear a filter to bring them back.</div>}
    <div className="table-pagination"><span>{tanks.length ? page * 10 + 1 : 0}–{Math.min((page + 1) * 10, tanks.length)} of {tanks.length}</span><div><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button disabled={(page + 1) * 10 >= tanks.length} onClick={() => setPage(page + 1)}>Next</button></div></div>
  </div>;
  return <div className="map-container" ref={mapRef}>
    <div className="map-tag mono"><span className="status-dot" /> ANANTAPUR / AP <span className="muted">·</span> 3,550 km²</div>
    <div className="map-zoom">
      <button aria-label="Zoom in map" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .5))}><Plus size={16} /></button>
      <button aria-label="Zoom out map" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - .5))}><Minus size={16} /></button>
      <button aria-label="Reset map view" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><Maximize2 size={14} /></button>
      <button aria-label="Locate selected tank" disabled={!selected} onClick={() => { const t = tanks.find(t => t.id === selected); if (t) { setZoom(2.5); setOffset({ x: x(t) - 400, y: y(t) - 250 }); } }}><LocateFixed size={15} /></button>
    </div>
    <svg className="tank-map" viewBox={`${400 - 400 / zoom + offset.x} ${250 - 250 / zoom + offset.y} ${800 / zoom} ${500 / zoom}`} aria-label={`Interactive map of ${tanks.length} tanks. Use the table for a list.`} onPointerDown={e => { if ((e.target as Element).tagName !== 'circle') { dragging.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; e.currentTarget.setPointerCapture(e.pointerId); } }} onPointerMove={e => { if (dragging.current) { const d = dragging.current; const r = e.currentTarget.getBoundingClientRect(); setOffset({ x: Math.max(-250, Math.min(250, d.ox - (e.clientX - d.x) / r.width * 800 / zoom)), y: Math.max(-150, Math.min(150, d.oy - (e.clientY - d.y) / r.height * 500 / zoom)) }); } }} onPointerUp={() => dragging.current = null} onPointerCancel={() => dragging.current = null}>
      <defs><pattern id="map-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#5b9fa9" strokeOpacity=".08" /></pattern><radialGradient id="map-glow"><stop stopColor="#0a373c" /><stop offset="1" stopColor="#09151e" /></radialGradient></defs>
      <rect x="-400" y="-250" width="1600" height="1000" fill="url(#map-glow)" /><rect x="-400" y="-250" width="1600" height="1000" fill="url(#map-grid)" />
      <g fill="none" stroke="#56878a" strokeOpacity=".16" strokeWidth=".7">{Array.from({ length: 23 }, (_, i) => <path key={i} d={`M${-200 + i * 24} -40 C${450 + i * 12} ${180 - i * 8}, ${-190 + i * 28} ${165 + i * 14}, ${240 + i * 25} 590`} />)}{Array.from({ length: 10 }, (_, i) => <ellipse key={i} cx="612" cy="167" rx={25 + i * 17} ry={12 + i * 8} transform="rotate(-38 612 167)" />)}</g>
      <path d="M82 79C211 142 202 247 335 269S573 237 667 416" stroke="#29636e" strokeWidth="2" strokeDasharray="2 4" fill="none" />
      <path d="M342 54C396 182 348 178 335 269" stroke="#29636e" strokeWidth="1.3" strokeDasharray="2 4" fill="none" />
      <rect x="70" y="48" width="660" height="392" rx="1" fill="none" stroke="#88c0be" strokeOpacity=".2" strokeDasharray="5 6" />
      <g className="map-coordinates"><text x="75" y="466">77.20° E</text><text x="656" y="466">77.80° E</text><text x="17" y="57">14.60°</text><text x="17" y="439">14.10°</text><text x="537" y="273" className="map-region-label">R A Y A L A S E E M A</text></g>
      {tanks.map((t, i) => {
        const fill = areaAt(t, index, scenario) / t.maxArea;
        const isSelected = t.id === selected;
        const radius = Math.min(6.5, 2.5 + Math.sqrt(t.area) * .35) * (.75 + fill * .3);
        return <g key={t.id}>
          {isSelected && <><circle cx={x(t)} cy={y(t)} r="15" fill="none" stroke="#e2e8f0" strokeOpacity=".3" /><circle cx={x(t)} cy={y(t)} r="10" fill="none" stroke="#e2e8f0" strokeWidth="1" /></>}
          <circle cx={x(t)} cy={y(t)} r={radius} fill={CLASSES[t.classification].color} fillOpacity={.35 + fill * .6} stroke={isSelected ? '#fff' : CLASSES[t.classification].color} strokeWidth={isSelected ? 1.5 : .6} className="tank-dot" data-tank-id={t.id} role="button" tabIndex={isSelected || (!selected && i === 0) ? 0 : -1} aria-label={`${t.id}, ${CLASSES[t.classification].label}, ${t.area} hectares`} onClick={() => onSelect(t.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(t.id); } if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const next = tanks[(i + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : tanks.length - 1)) % tanks.length]; onSelect(next.id); requestAnimationFrame(() => (mapRef.current?.querySelector('[data-tank-id="' + next.id + '"]') as SVGElement)?.focus()); } }} onPointerEnter={e => { const r = mapRef.current!.getBoundingClientRect(); setTooltip({ tank: t, x: Math.min(e.clientX - r.left + 12, r.width - 218), y: Math.max(12, e.clientY - r.top - 105) }); }} onPointerLeave={() => setTooltip(null)} />
        </g>;
      })}
    </svg>
    {tooltip && <div className="map-tooltip" style={{ left: Math.max(8, tooltip.x), top: tooltip.y }}><strong className="mono">{tooltip.tank.id.toUpperCase()}</strong><span style={{ color: CLASSES[tooltip.tank.classification].color }}>{CLASSES[tooltip.tank.classification].label}</span><span>{areaAt(tooltip.tank, index, scenario).toFixed(2)} ha · lag {tooltip.tank.lag ?? '—'} mo</span><span>k {tooltip.tank.recession?.toFixed(2) ?? '—'}/mo {hasFlag(tooltip.tank) ? '· QC flagged' : ''}</span></div>}
    {!tanks.length && <div className="map-empty">No tanks match these filters.</div>}
    <div className="map-footer"><span><span className="north-arrow">↑</span> N</span><span className="mono">Geographic positions · stylized contours</span><span className="map-scale">~10 km</span></div>
  </div>;
}
