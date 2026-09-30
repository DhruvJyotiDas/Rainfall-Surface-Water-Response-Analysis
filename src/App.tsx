import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Activity, Bookmark, Check, CloudDrizzle, CloudLightning, CloudRain, Download, Droplet, Code2 as Github, Globe2, Info, Layers3, Map, Pause, Play, RotateCcw, Search, Shuffle, Sun, Table2, Waves, Wind, X } from 'lucide-react';
import TankMap from './components/TankMap';
import { HingeChart, SeriesChart } from './components/Charts';
import { aggregateSeries, areaAt, classKeys, CLASSES, exportCsv, formatMonth, mean, median, rainAt, study, tanks, WEATHER, weatherAt, weatherKeys, type ClassKey, type WeatherKey, type WeatherMode } from './data/demo';

const StormScene = lazy(() => import('./components/StormScene'));
const repo = 'https://github.com/DhruvJyotiDas/Rainfall-Surface-Water-Response-Analysis';
const weatherIcons = { dry: Sun, pre: CloudDrizzle, onset: CloudRain, storm: CloudLightning, recession: Wind };
const orderedClasses: ClassKey[] = ['threshold_limited_fragile', 'rainfall_tracking', 'non_responsive', 'resilient'];

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const q = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(q.matches); q.addEventListener('change', update); return () => q.removeEventListener('change', update); }, []);
  return reduced;
}

function Count({ value, digits = 0 }: { value: number; digits?: number }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const previous = useRef(reduced ? value : 0);
  const [entered, setEntered] = useState(reduced);
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reduced) { setEntered(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setEntered(true); observer.disconnect(); } }, { threshold: .1 });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, [reduced]);
  useEffect(() => {
    if (!entered) return;
    if (reduced) { setDisplay(value); previous.current = value; return; }
    const from = previous.current; const start = performance.now(); let frame = 0;
    const tick = (now: number) => { const p = Math.min(1, (now - start) / 800); const next = from + (value - from) * (1 - (1 - p) ** 3); setDisplay(next); previous.current = next; if (p < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [value, reduced, entered]);
  return <span ref={element} className="animated-number">{display.toFixed(digits)}</span>;
}

function App() {
  const reduced = useReducedMotion();
  const [animate, setAnimate] = useState(true);
  const [quality, setQuality] = useState<'auto' | 'low'>('auto');
  const [mode, setMode] = useState<WeatherMode>('storm');
  const [index, setIndex] = useState(104);
  const [scenario, setScenario] = useState<number | null>(380);
  const [playing, setPlaying] = useState(false);
  const [filters, setFilters] = useState<ClassKey[]>([...classKeys]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'map' | 'table'>('map');
  const [savedOnly, setSavedOnly] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const weather = mode === 'auto' ? weatherAt(index) : mode;
  const WeatherIcon = weatherIcons[weather];
  const visible = useMemo(() => tanks.filter(t => filters.includes(t.classification) && t.id.toLowerCase().includes(query.toLowerCase()) && (!savedOnly || bookmarks.includes(t.id))), [filters, query, savedOnly, bookmarks]);
  const visibleIds = useMemo(() => visible.map(t => t.id), [visible]);
  const tank = tanks.find(t => t.id === selected) ?? null;
  const series = useMemo(() => tank ? tank.series : aggregateSeries(visible), [tank, visible]);
  const rain = rainAt(visible, index, scenario);
  const intensity = scenario === null && (weather === 'dry' || weather === 'recession') ? 0 : Math.min(1, rain / 380);
  const filling = visible.filter(t => areaAt(t, index, scenario) > (index ? t.series[index - 1].area : t.maxArea * .1) + t.maxArea * .015).length;
  const currentArea = tank ? areaAt(tank, index, scenario) : mean(visible.map(t => areaAt(t, index, scenario)));
  const fill = tank ? currentArea / tank.maxArea : mean(visible.map(t => areaAt(t, index, scenario) / t.maxArea));
  const freq = tank ? tank.frequency : mean(visible.map(t => t.frequency ?? 0));
  const k = tank ? tank.recession : median(visible.flatMap(t => t.recession === null ? [] : [t.recession]));
  const lag = tank ? tank.lag : median(visible.flatMap(t => t.lag === null ? [] : [t.lag]));
  const aicWinner = tank ? tank.hingeWins ? 'Hinge' : 'Linear' : !visible.length ? '—' : visible.filter(t => t.hingeWins).length > visible.length / 2 ? 'Hinge' : 'Linear';
  const climatology = useMemo(() => { const values = tanks.flatMap(t => t.series.filter((_, i) => i < 108 && i % 12 === index % 12).map(s => s.rain)); const avg = mean(values); return { avg, sd: Math.sqrt(mean(values.map(v => (v - avg) ** 2))) || 1 }; }, [index]);
  const anomaly = (rain - climatology.avg) / climatology.sd;
  const motion = animate && !reduced;

  useEffect(() => { const timer = setTimeout(() => setLoaded(true), 750); return () => clearTimeout(timer); }, []);
  useEffect(() => { if (!playing) return; const timer = setInterval(() => setIndex(i => (i + 1) % 120), 1200); return () => clearInterval(timer); }, [playing]);
  useEffect(() => { if (selected && !visible.some(t => t.id === selected)) setSelected(null); }, [selected, visible]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); }), { threshold: .08 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    const navObserver = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); }), { rootMargin: '-10% 0px -65% 0px' });
    document.querySelectorAll('section[id]').forEach(el => navObserver.observe(el));
    return () => { observer.disconnect(); navObserver.disconnect(); };
  }, []);

  function changeWeather(next: WeatherMode) {
    setPlaying(false); setMode(next);
    if (next === 'auto') setScenario(null);
    else { setIndex(i => Math.floor(i / 12) * 12 + WEATHER[next].month); setScenario(next === 'recession' ? null : WEATHER[next].rain); }
  }
  function scrub(next: number) { setIndex(next); setMode('auto'); setScenario(null); }
  function toggleClass(key: ClassKey) { setFilters(f => f.includes(key) ? f.filter(k => k !== key) : [...f, key]); }
  function selectClass(key: ClassKey) { setFilters([key]); setSelected(null); setQuery(''); setSavedOnly(false); }
  function resetFilters() { setFilters([...classKeys]); setQuery(''); setSavedOnly(false); }
  function toggleBookmark() { if (!selected) return; setBookmarks(b => b.includes(selected) ? b.filter(id => id !== selected) : [...b, selected]); }
  function randomTank() { if (visible.length) { const candidates = visible.filter(t => t.id !== selected); setSelected((candidates.length ? candidates : visible)[Math.floor(Math.random() * (candidates.length || visible.length))].id); } }

  return <div className={motion ? 'app' : 'app motion-paused'} data-weather={weather}>
    <a className="skip-link" href="#dashboard">Skip to dashboard</a>
    {!loaded && <div className="loading-screen" aria-label="Loading observatory"><Droplet size={34} /><div className="loading-line" /><span className="mono">INITIALIZING THE MONSOON</span></div>}
    <Suspense fallback={<div className="storm-scene scene-fallback" />}><StormScene index={index} scenario={scenario} intensity={intensity} weather={weather} selected={selected} visibleIds={visibleIds} motion={motion} quality={quality} /></Suspense>
    <div className="atmosphere" aria-hidden="true" /><div className="lens-drops" aria-hidden="true"><i /><i /><i /></div>
    <header className="site-header">
      <a className="brand" href="#overview" aria-label="Tanks in the Rain home"><span className="brand-icon"><Droplet size={23} strokeWidth={1.5} /></span><span>TANKS<span className="brand-sub">IN THE RAIN</span></span></a>
      <nav aria-label="Main navigation">{[['overview', 'Overview'], ['dashboard', 'Observatory'], ['science', 'The science'], ['results', 'Findings']].map(([id, label]) => <a key={id} href={'#' + id} className={activeSection === id ? 'active' : ''}>{label}</a>)}</nav>
      <div className="header-right"><span className="demo-label"><span className="status-dot" /> INTERACTIVE DEMO</span><a href={repo} target="_blank" rel="noreferrer" aria-label="View GitHub repository"><Github size={19} /></a></div>
    </header>
    <main>
      <section id="overview" className="hero">
        <div className="hero-topline"><span className="eyebrow">GEOIMPATHON 1.0 <span className="separator">/</span> PROBLEM 2.4</span><span className="mono hero-location"><Globe2 size={12} /> ANANTAPUR, ANDHRA PRADESH</span></div>
        <div className="hero-copy"><div className="section-kicker"><span className="short-line" /> A SATELLITE HYDROLOGY OBSERVATORY</div>
          <h1>When the rain falls,<br />which tanks<br /><em>answer?</em></h1>
          <p>470 rain-fed tanks. 9 monsoon seasons.<br />Satellite radar vs. the sky — a fill-and-spill<br className="desktop-break" /> story told in water.</p>
          <div className="hero-actions"><a className="button primary" href="#dashboard">Enter the observatory <ArrowDown size={16} /></a><a className="button text-link" href="#science">View the science <ArrowUpRight size={15} /></a></div>
          <div className="hero-proof"><span className="orbit-icon"><Layers3 size={16} /></span><span>SENTINEL-1 SAR <i>×</i> CHIRPS RAINFALL<span className="proof-caption">One landscape. A decade of observations.</span></span></div>
        </div>
        <div className="hero-instrument" aria-hidden="true"><div className="instrument-label mono">AOI_014 <span>14.35° N / 77.50° E</span></div><div className="reticle"><span className="reticle-n">N</span><div className="reticle-ring" /><div className="reticle-axis" /><span className="terrain-label">ANANTAPUR<span>470 WATER BODIES</span></span><div className="terrain-callout"><i /><span>TANK RESPONSE NETWORK<br /><b>Sentinel-1 · Orbit 165</b></span></div></div><div className="instrument-bottom mono"><span>ALT 35,000 M</span><span>RELIEF / EXAGGERATED</span></div></div>
        <div className="hero-weather"><WeatherIcon size={26} /><div><span className="mono">CURRENT ATMOSPHERE</span><strong>{WEATHER[weather].label}</strong></div><span className="weather-level"><i /><i /><i /><i /></span></div>
        <div className="hero-bottom"><a href="#dashboard" className="scroll-cue"><span className="falling-drop" /> SCROLL TO EXPLORE</a><div className="hero-stat"><strong>470</strong><span>TANKS</span></div><div className="hero-stat"><strong>09</strong><span>MONSOONS</span></div><div className="hero-stat"><strong>01</strong><span>SHARED SKY</span></div></div>
      </section>
      <div className="telemetry"><span className="telemetry-title"><Activity size={12} /> DEMO TELEMETRY</span><div className="ticker-window"><div className="ticker-track">{[0, 1].map(copy => <span key={copy}>{tanks.slice(19, 25).map(t => <span className="ticker-item" key={t.id}>{t.id.toUpperCase()} <i>·</i> AREA {areaAt(t, index, scenario).toFixed(1)} ha <i>·</i> LAG {t.lag ?? '—'} mo <span className="ticker-diamond">◇</span></span>)}</span>)}</div></div><span className="telemetry-date">{formatMonth(index).toUpperCase()}</span></div>

      <section id="dashboard" className="dashboard content-section">
        <div className="section-heading reveal"><div><div className="section-kicker">01 <span className="short-line" /> THE OBSERVATORY</div><h2>Every tank has a <span>rain story.</span></h2><p>Change the weather. Follow the water. See what answers.</p></div><div className="section-tools"><button className="button small" onClick={() => { exportCsv(visible, index, scenario); setNotice(`Exported ${visible.length} demo tank records.`); }}><Download size={14} /> Export data</button><span className="mono muted">LOCAL DATA · NO LIVE FEED</span></div></div>
        <div className="control-room panel reveal">
          <div className="weather-row"><div className="control-label"><CloudRain size={16} /><div><strong>Set the atmosphere</strong><span>THE WEATHER IS THE DATA</span></div></div><div className="weather-switch" role="group" aria-label="Weather mode">{weatherKeys.map(key => { const Icon = weatherIcons[key]; return <button key={key} className={mode === key ? 'active' : ''} aria-pressed={mode === key} onClick={() => changeWeather(key)}><Icon size={14} /><span>{WEATHER[key].short}</span></button>; })}<button className={mode === 'auto' ? 'active auto' : 'auto'} aria-pressed={mode === 'auto'} onClick={() => changeWeather('auto')}><Activity size={13} /> AUTO</button></div></div>
          <div className="sliders-row"><div className="time-control"><button className={'icon-button play-button ' + (playing ? 'playing' : '')} aria-label={playing ? 'Pause timeline' : 'Play timeline'} onClick={() => { setPlaying(!playing); setMode('auto'); setScenario(null); }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><div className="time-track"><div className="slider-label"><label htmlFor="timeline">OBSERVATION WINDOW</label><strong>{formatMonth(index)}</strong></div><input id="timeline" aria-label="Observation month" type="range" min="0" max="119" value={index} onChange={e => scrub(+e.target.value)} /><div className="slider-endpoints"><span>JAN 2017</span><span>DEC 2026</span></div></div></div><div className="rain-control"><div className="slider-label"><label htmlFor="rainfall">SCENARIO RAINFALL <span className="badge-tiny">DEMO</span></label><strong><Count value={rain} /> <small>mm / mo</small></strong></div><input id="rainfall" aria-label="Scenario rainfall" type="range" min="0" max="500" value={Math.round(rain)} onChange={e => { setPlaying(false); setScenario(+e.target.value); }} /><div className="slider-endpoints"><span>0 MM · DRY</span><button className="text-button" disabled={scenario === null} onClick={() => setScenario(null)}><RotateCcw size={10} /> {scenario === null ? 'MONTHLY DEMO SERIES' : 'RESET TO MONTH'}</button><span>500 MM</span></div></div></div>
          <div className="context-strip"><span><span className="status-dot" /> {WEATHER[weather].note}</span><span>{scenario !== null ? 'SCENARIO OVERRIDE' : 'AUTO / MONTHLY DEMO'} <i>·</i> {index >= 108 ? '2026 SIMULATED NOWCAST' : 'SYNTHETIC MONTHLY SERIES'}</span></div>
        </div>
        <div className="kpi-grid reveal">
          <div className="kpi panel"><span className="kpi-label">TANKS IN VIEW <Layers3 size={15} /></span><strong data-testid="tank-count"><Count value={visible.length} /><small> / 470</small></strong><span><span className="status-dot" /> {visible.length === 470 ? 'Complete study inventory' : 'Filtered study inventory'}</span><div className="kpi-bars">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ height: `${10 + Math.sin(i * 2) * 4}px` }} />)}</div></div>
          <div className="kpi panel"><span className="kpi-label">CURRENTLY FILLING <Droplet size={15} /></span><strong className="cyan-text" data-testid="filling-count"><Count value={filling} /><small> tanks</small></strong><span>Area rising vs. previous demo month</span><svg className="kpi-spark" viewBox="0 0 110 30"><path d="M0 26L15 24L27 27L42 16L55 19L70 9L82 12L95 4L110 0" /></svg></div>
          <div className="kpi panel"><span className="kpi-label">MEDIAN RESPONSE LAG <Activity size={15} /></span><strong><Count value={median(visible.flatMap(t => t.lag === null ? [] : [t.lag]))} /><small> months</small></strong><span>Recorded study metric · selected cohort</span><div className="lag-dots">{[0, 1, 2, 3, 4].map(i => <i key={i} className={i === median(visible.flatMap(t => t.lag === null ? [] : [t.lag])) ? 'active' : ''}>{i}</i>)}</div></div>
          <div className="kpi panel"><span className="kpi-label">RAINFALL ANOMALY <CloudRain size={15} /></span><strong className={anomaly >= 0 ? 'cyan-text' : 'amber-text'}>{anomaly >= 0 ? '+' : ''}<Count value={anomaly} digits={2} /><small> z</small></strong><span>Against demo monthly climatology</span><div className="anomaly-scale"><i style={{ left: `${Math.max(0, Math.min(100, 50 + anomaly * 8))}%` }} /></div></div>
        </div>
        <div className="explorer-grid reveal">
          <div className="map-panel panel"><div className="panel-heading"><div><span className="panel-title"><Map size={16} /> Tank network</span><span className="panel-subtitle">A landscape connected by water</span></div><div className="mini-tabs"><button className={view === 'map' ? 'active' : ''} aria-label="Map view" onClick={() => setView('map')}><Map size={14} /> Map</button><button className={view === 'table' ? 'active' : ''} aria-label="Table view" onClick={() => setView('table')}><Table2 size={14} /> Table</button></div></div>
            <div className="map-toolbar"><label className="search-field"><Search size={14} /><input aria-label="Search tanks" placeholder="Find a tank ID…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={12} /></button>}</label><button className={'icon-button ' + (savedOnly ? 'active' : '')} aria-label="Show bookmarked tanks" aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><Bookmark size={15} /></button><span className="mono result-count">{visible.length} TANKS</span></div>
            <TankMap tanks={visible} selected={selected} onSelect={setSelected} index={index} scenario={scenario} bookmarks={bookmarks} view={view} />
            <div className="map-filters">{classKeys.map(key => <button key={key} className={filters.includes(key) ? 'on' : 'off'} aria-pressed={filters.includes(key)} onClick={() => toggleClass(key)}><i style={{ background: CLASSES[key].color }} />{CLASSES[key].short}</button>)}<button className="text-button" onClick={resetFilters}>Reset</button></div>
          </div>
          <div className="inspector panel"><div className="panel-heading"><div><span className="panel-title"><Waves size={16} /> Water response</span><span className="panel-subtitle">{tank ? 'Selected tank · recorded profile' : 'District aggregate · current selection'}</span></div><div className="inspector-actions"><button className="icon-button" aria-label="Select random tank" title="Inspect a random tank" disabled={!visible.length} onClick={randomTank}><Shuffle size={15} /></button><button className="icon-button" aria-label="Bookmark selected tank" aria-pressed={!!selected && bookmarks.includes(selected)} disabled={!selected} onClick={toggleBookmark}>{selected && bookmarks.includes(selected) ? <Check size={15} /> : <Bookmark size={15} />}</button></div></div>
            <div className="inspector-identity"><div><h3 data-testid="inspector-title">{tank ? tank.id.toUpperCase() : 'DISTRICT OVERVIEW'}</h3><span className="mono muted">{tank ? `${tank.lat.toFixed(4)}° N · ${tank.lon.toFixed(4)}° E` : `${visible.length} tanks · Anantapur, India`}</span></div>{tank ? <span className="class-badge" style={{ color: CLASSES[tank.classification].color }}>{CLASSES[tank.classification].label}</span> : <span className="class-badge cyan-text">ALL IN VIEW</span>}</div>
            {selected && <button className="text-button back-aggregate" onClick={() => setSelected(null)}>← Back to district aggregate</button>}
            <div className="water-summary"><div><span className="eyebrow">{tank ? 'CURRENT DEMO WATER AREA' : 'MEAN DEMO WATER AREA'}</span><strong><Count value={currentArea} digits={2} /><small> ha</small></strong><span className="muted small">{formatMonth(index, true)} {scenario !== null && '· scenario active'}</span></div><div className="gauge-group"><div className="rain-gauge"><div style={{ height: `${Math.max(0, Math.min(100, fill * 100))}%` }} /></div><div><strong data-testid="fill-percent"><Count value={fill * 100} />%</strong><span>of demo<br />robust max</span></div></div></div>
            <SeriesChart series={series} index={index} scenario={scenario} tank={tank} scenarioArea={currentArea} />
            <div className="inspector-metrics"><div><span>Fill frequency</span><strong>{freq === null ? '—' : (freq * 100).toFixed(0) + '%'}</strong></div><div><span>Recession k</span><strong>{k === null ? '—' : k.toFixed(2)} <small>/ mo</small></strong></div><div><span>Best lag</span><strong>{lag ?? '—'} <small>months</small></strong></div><div><span>AIC winner</span><strong>{aicWinner} <small>{tank ? 'study fit' : 'majority'}</small></strong></div></div>
            <div className="inspector-note"><Info size={13} /><span>{tank?.classification === 'threshold_limited_fragile' ? `Try crossing ${tank.threshold} mm/month. This illustrative tank only fills after its demo threshold.` : 'Monthly curves and scenario responses are illustrative. Profile metrics come from the recorded study.'}</span></div>
          </div>
        </div>
        <div className="classification-heading"><span className="eyebrow">FOUR WAYS TO ANSWER THE RAIN</span><span>Click a class to isolate its tanks <ArrowDown size={12} /></span></div>
        <div className="classification-grid reveal">{orderedClasses.map(key => <button key={key} className={'class-tile panel ' + (filters.length === 1 && filters[0] === key ? 'selected-class' : '')} style={{ '--class-color': CLASSES[key].color } as React.CSSProperties} aria-pressed={filters.length === 1 && filters[0] === key} onClick={() => selectClass(key)}><div><Droplet size={20} strokeWidth={1.4} /><ArrowUpRight size={14} /></div><strong><Count value={study.classification_counts[key]} /><span>{(study.classification_counts[key] / 470 * 100).toFixed(1)}%</span></strong><h3>{CLASSES[key].label}</h3><p>{CLASSES[key].description}</p><span className="class-meter"><i style={{ width: `${study.classification_counts[key] / 470 * 100}%` }} /></span></button>)}</div>
        <p className="data-disclosure"><Info size={13} /> Real tank locations and study classifications. Synthetic monthly curves and rainfall scenarios. These classes describe observed behavior, not validated causes.</p>
      </section>

      <section id="science" className="science content-section">
        <div className="science-intro reveal"><div className="science-copy"><div className="section-kicker">02 <span className="short-line" /> BENEATH THE SURFACE</div><h2>Tanks don't fill linearly.<br />They <span>fill-and-spill.</span></h2><p>A little rain isn't always enough. The ground drinks first. Upstream tanks hold their share. Only after a threshold does water find its way downstream.</p><p>That was our hypothesis. Drag the rainfall control to explore the idea — then see how it stood up to the evidence.</p><a href="#results" className="text-link">Follow the evidence <ArrowRight size={15} /></a><div className="science-footnote"><span>09</span><p>monsoon seasons used for fitting<br /><b>2017–2025 · 2026 reserved for nowcast</b></p></div></div><HingeChart /></div>
        <div className="pipeline-heading reveal"><h3>From orbit to insight.</h3><span className="mono muted">ONE REPRODUCIBLE PIPELINE / SIX STEPS</span></div>
        <div className="pipeline reveal">{[['01', 'Inventory', '02_tank_inventory.py', 'Find the water bodies'], ['02', 'Water area', '03_water_area_timeseries.py', 'Read the radar'], ['03', 'Rainfall', '04_rainfall.py', 'Measure the monsoon'], ['04', 'Response', '05_response_metrics.py', 'Estimate lag & recession'], ['05', 'Classification', '05_response_metrics.py', 'Describe observed behavior'], ['06', 'Dashboard', '06_export_dashboard_data.py', 'Make the evidence visible']].map(([num, label, file, desc]) => <a className="pipeline-node" key={num} href={`${repo}/blob/main/pipeline/${file}`} target="_blank" rel="noreferrer"><span className="pipeline-number">{num}</span><h4>{label}</h4><p>{desc}</p><code>{file}</code></a>)}</div>
        <div className="sources-label eyebrow">EIGHT LENSES ON ONE LANDSCAPE</div><div className="sources-grid reveal">{[['Sentinel-1 SAR', 'Water extent through clouds', 'ESA / COPERNICUS'], ['Dynamic World', 'Water-class tank inventory', 'GOOGLE / WRI'], ['JRC Global Surface Water', 'Historical maximum extent', 'EUROPEAN COMMISSION'], ['CHIRPS', 'Monthly rainfall & anomalies', 'UCSB / CLIMATE HAZARDS'], ['HydroSHEDS', 'Basin and cascade context', 'WWF / HYDROBASINS'], ['WorldCover', 'Land cover & paddy flags', 'ESA / 10 M'], ['Copernicus DEM', 'Terrain and slope masking', 'GLO-30 / 30 M'], ['OpenStreetMap', 'Water polygons & canals', 'COMMUNITY MAPPING']].map(([name, desc, credit], i) => <div className="source-card" key={name}><span className="source-index mono">0{i + 1}</span><div><h4>{name}</h4><p>{desc}</p><span>{credit}</span></div></div>)}</div>
      </section>

      <section id="results" className="results content-section"><div className="results-heading reveal"><div className="section-kicker">03 <span className="short-line" /> SIGNALS FROM THE STUDY</div><h2>Early signals.<br /><span>A foundation to build on.</span></h2><p>A brief exploratory study of 470 tanks — revealing patterns to explore and a clear path to deeper validation.</p></div>
        <div className="verdict-grid reveal"><article className="verdict panel opportunity"><div className="verdict-top"><span>H1 / RAINFALL RESPONSE</span><span className="verdict-badge signal">EARLY SIGNAL</span></div><strong>72<span> tanks</span></strong><div className="result-comparison"><i style={{ width: '15.6%' }} /><b>15.6% OF 462 TESTABLE TANKS</b></div><h3>A starting point for understanding response.</h3><p>72 tanks show a significant rainfall response at a 0–2 month lag in the initial analysis. They offer a focused group for follow-up, alongside a wider network where cascade effects and management deserve exploration.</p><span className="verdict-note">Exploratory signal · multiple-testing correction is a next step</span></article>
          <article className="verdict panel opportunity"><div className="verdict-top"><span>H2 / THRESHOLD BEHAVIOR</span><span className="verdict-badge signal">MODEL CANDIDATES</span></div><strong>91<span> tanks</span></strong><div className="result-comparison"><i style={{ width: '19.4%' }} /><b>19.4% OF THE 470-TANK INVENTORY</b></div><h3>A closer look at fill-and-spill.</h3><p>A threshold model fits better than a linear model by AIC for 91 tanks. This gives the next study a concrete set of candidates to examine with denser observations and more monsoon seasons.</p><span className="verdict-note">Nine seasons · candidate patterns for further validation</span></article>
          <article className="verdict panel explained"><div className="verdict-top"><span>H3 / PLACEBO CHECK</span><span className="verdict-badge amber">QUALITY CHECK</span></div><strong>50<span> shuffles</span></strong><div className="placebo-equation mono">60 tanks · one useful validation lesson</div><h3>A clearer path to stronger confidence.</h3><p>Placebo checks made the effect of selecting the best of five lags visible. The 23.3% false-positive rate closely matches the 22.6% independence benchmark, helping define how the next analysis can improve its controls.</p><span className="verdict-note">A practical next step: pre-register one lag or correct for five</span></article></div>
        <div className="limitations panel reveal"><details><summary><span><Info size={17} /> Limitations, stated plainly</span><span className="mono">STUDY SCOPE & NEXT STEPS <span className="details-plus">+</span></span></summary><div className="limitations-content"><p>This brief exploratory study provides a starting point for a fuller investigation. The original pipeline was built under a one-hour deadline; the interactive scenarios illustrate the idea and are not water-management forecasts.</p><ul><li>The initial H1 and H2 results did not meet their pre-registered expectations: rainfall response was 72/462 (15.6%, versus a 50% bar), and hinge models won for 91/470 (19.4%). The highlighted counts are follow-up candidates, not confirmation of the hypotheses.</li><li>Rainfall anomaly uses a z-score, not a long-baseline gamma-fitted SPI.</li><li>470 tanks share just 116 CHIRPS pixels. Significance tests do not correct for this pseudo-replication or for selecting the best of five lags.</li><li>No bootstrap confidence intervals or classification sensitivity analysis. Placebo testing used 50 shuffles on a 60-tank subsample.</li><li>No in-situ gauges. Sentinel-1 versus Sentinel-2 calibration was written but not run; external overlap validation and QA thumbnails were cut.</li><li>Wind, aquatic vegetation and near-resolution-limit small tanks can bias radar water areas. S1B robustness testing was skipped after an orbit/cadence check.</li><li>2026 is held out of the fitted results. All 120 monthly curves and scenario responses shown here are explicitly synthetic, including future months.</li><li>Classification is a screening tool, not a causal verdict or a management recommendation.</li></ul><a href={`${repo}#limitations-mandatory-honest`} target="_blank" rel="noreferrer" className="text-link">Read the full methodology <ArrowUpRight size={14} /></a></div></details></div>
        <div className="closing-note reveal"><Droplet size={22} /><p>Not every tank answers the rain.<br /><span>Every answer deserves a closer look.</span></p><a className="button" href="#dashboard">Explore the tanks <ArrowUpRight size={15} /></a></div>
      </section>
    </main>
    <footer><div className="footer-main"><a className="brand" href="#overview"><Droplet size={26} /><span>TANKS<span className="brand-sub">IN THE RAIN</span></span></a><p>A study of rainfall, resilience, and the water between.<span>Original research built for GEOIMPATHON 1.0 under a 1-hour deadline.</span></p><a className="text-link" href={repo} target="_blank" rel="noreferrer"><Github size={15} /> Open the research <ArrowUpRight size={14} /></a></div><div className="footer-bottom"><span>ANANTAPUR, INDIA <i>·</i> 14.35° N / 77.50° E</span><div><button onClick={() => setAnimate(!animate)} aria-pressed={!motion}>{motion ? <Pause size={11} /> : <Play size={11} />} {motion ? 'Pause atmosphere' : reduced ? 'Reduced motion enabled' : 'Resume atmosphere'}</button><button onClick={() => setQuality(q => q === 'auto' ? 'low' : 'auto')}>GRAPHICS: {quality.toUpperCase()}</button></div><span>470 TANKS. ONE SHARED SKY.</span></div></footer>
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
  </div>;
}

export default App;
