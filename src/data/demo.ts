import seeds from './tank-seeds.json';
import summary from './study-summary.json';

export const CLASSES = {
  resilient: { label: 'Resilient', short: 'Resilient', color: '#34d399', description: 'Fills often. Holds water longer.' },
  rainfall_tracking: { label: 'Rainfall tracking', short: 'Tracking', color: '#22d3ee', description: 'Its water area follows the rains.' },
  threshold_limited_fragile: { label: 'Threshold fragile', short: 'Fragile', color: '#fbbf24', description: 'Needs a stronger monsoon to fill.' },
  non_responsive: { label: 'Non-responsive', short: 'Non-responsive', color: '#f87171', description: 'Rarely fills. Worth a closer look.' },
} as const;
export type ClassKey = keyof typeof CLASSES;
export const classKeys = Object.keys(CLASSES) as ClassKey[];
export const WEATHER = {
  dry: { label: 'Dry season', short: 'Dry', month: 3, rain: 0, intensity: 0, note: 'The quiet before the monsoon.', code: 'DRY / LOW WATER' },
  pre: { label: 'Pre-monsoon', short: 'Pre-monsoon', month: 5, rain: 80, intensity: .15, note: 'First rain. A landscape waiting.', code: 'BUILDING / FIRST RAIN' },
  onset: { label: 'Monsoon onset', short: 'Onset', month: 7, rain: 190, intensity: .48, note: 'Rain arrives. The tanks begin to answer.', code: 'ONSET / FILL EVENTS' },
  storm: { label: 'Peak storm', short: 'Peak storm', month: 8, rain: 380, intensity: 1, note: 'A monsoon at full intensity.', code: 'PEAK / HEAVY RAIN' },
  recession: { label: 'Recession', short: 'Recession', month: 10, rain: 30, intensity: .035, note: 'The rain leaves. The water remembers.', code: 'RECEDING / DRAIN DOWN' },
} as const;
export type WeatherKey = keyof typeof WEATHER;
export type WeatherMode = WeatherKey | 'auto';
export const weatherKeys = Object.keys(WEATHER) as WeatherKey[];
export const months = Array.from({ length: 120 }, (_, i) => `${2017 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`);
export const formatMonth = (i: number, long = false) => new Date(2017 + Math.floor(i / 12), i % 12, 1).toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: 'numeric' });
export const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
export const median = (values: number[]) => { const s = values.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
export const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
export const weatherAt = (index: number): WeatherKey => {
  const m = index % 12;
  return m >= 2 && m <= 4 ? 'dry' : m === 5 ? 'pre' : m === 6 || m === 7 ? 'onset' : m === 8 || m === 9 ? 'storm' : 'recession';
};
export type Sample = { month: string; rain: number; area: number };
export type Tank = Omit<(typeof seeds)[number], 'classification'> & { classification: ClassKey; threshold: number; maxArea: number; series: Sample[] };
const climate = [9, 7, 5, 13, 30, 81, 132, 169, 205, 153, 63, 22];
function random(seed: number) {
  let n = seed;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) | 0; return (n >>> 0) / 4294967296; };
}
export const tanks: Tank[] = seeds.map((seed, index) => {
  const rnd = random(index * 971 + 42);
  const threshold = Math.round(100 + rnd() * 165);
  const maxArea = seed.area * (.76 + rnd() * .2);
  const t = { ...seed, classification: seed.classification as ClassKey, threshold, maxArea, series: [] as Sample[] };
  let previous = .3;
  for (let month = 0; month < 120; month++) {
    const yearFactor = .82 + Math.sin(Math.floor(month / 12) * 2.1) * .25;
    const rain = Math.max(0, climate[month % 12] * yearFactor * (.75 + rnd() * .65));
    const inflow = responseFraction(t, rain);
    const retention = month % 12 >= 10 || month % 12 <= 1 ? Math.exp(-(seed.recession ?? .35)) : .52;
    previous = clamp(Math.max(inflow, previous * retention) * (.94 + rnd() * .06));
    t.series.push({ month: months[month], rain: +rain.toFixed(1), area: +(maxArea * previous).toFixed(3) });
  }
  return t;
});

// Educational monthly response model. Do not substitute the recorded seasonal
// hinge threshold (mm/season) for this illustrative threshold (mm/month).
export function responseFraction(t: Pick<Tank, 'classification' | 'threshold'>, rain: number) {
  if (t.classification === 'resilient') return clamp(.38 + rain / 410);
  if (t.classification === 'rainfall_tracking') return clamp(.025 + rain / 355);
  if (t.classification === 'threshold_limited_fragile') return clamp(.025 + Math.max(0, rain - t.threshold) / 160);
  return .025;
}
export const areaAt = (t: Tank, index: number, scenario: number | null) => scenario === null ? t.series[index].area : t.maxArea * responseFraction(t, scenario);
export const rainAt = (list: Tank[], index: number, scenario: number | null) => scenario ?? mean(list.map(t => t.series[index].rain));
export function aggregateSeries(list: Tank[]): Sample[] {
  return months.map((month, index) => ({ month, rain: mean(list.map(t => t.series[index].rain)), area: mean(list.map(t => t.series[index].area)) }));
}
export const study = summary;
export const hasFlag = (t: Tank) => t.regulated || t.slope || t.canal || t.lowConfidence;
export function downloadFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCsv(list: Tank[], index: number, scenario: number | null) {
  const keys = ['tank_id', 'class', 'lat', 'lon', 'inventory_area_ha', 'study_fill_frequency', 'study_recession_per_month', 'study_lag_months', 'demo_month', 'demo_rain_mm', 'demo_area_ha', 'scenario_active'];
  const rows = list.map(t => [t.id, t.classification, t.lat, t.lon, t.area, t.frequency, t.recession, t.lag, months[index], scenario ?? t.series[index].rain, areaAt(t, index, scenario).toFixed(3), scenario !== null]);
  downloadFile('tanks-demo-' + months[index] + '.csv', [keys, ...rows].map(r => r.join(',')).join('\n'), 'text/csv;charset=utf-8');
}
