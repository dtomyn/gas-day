import networkJson from '../data/network.json'

export type Pt = [number, number]

export type Series = {
  id: string
  system: string
  keyPoint: string
  direction: string
  trade: string
  lat: number
  lon: number
  /** Daily values in 1000 m3/d, index 0 = flows.start. */
  thr: (number | null)[]
  cap: (number | null)[]
}
export type Flows = { source: string; fetched: string; start: string; days: number; series: Series[] }
export type UsPipelines = { source: string; features: { name: string; share: string; paths: Pt[][] }[] }
export type Hotspot = { lon: number; lat: number; t: string; frp: number | null; agency: string | null; km: number | null; asset: string | null }
export type Hotspots = { source: string; fetched: string; points: Hotspot[] }
export type Fire = { year: number; ha: number; cause: string | null; km: number | null; asset: string | null; rings: Pt[][] }
export type Burned = { source: string; fetched: string; fires: Fire[] }
export type Weather = { source: string; start: string; cities: { id: string; name: string; lat: number; lon: number; temp: (number | null)[] }[] }

export type Dataset = {
  flows: Flows
  us: UsPipelines | null
  hotspots: Hotspots | null
  burned: Burned | null
  weather: Weather | null
  keyPoints: KeyPoint[]
}

export type KeyPoint = {
  id: string
  name: string
  system: string
  lat: number
  lon: number
  series: Series[]
  /** Route segment drawn for this key point, in the direction named by corridorDir. */
  corridor: Pt[] | null
  corridorDir: string | null
}

export const network = networkJson as unknown as {
  systems: { id: string; name: string; paths: Pt[][] }[]
  corridors: Record<string, { dir: string; path: Pt[] }>
}

const DAY = 86400000
/** 1000 m3/d to billion cubic feet per day. */
export const BCF = 3.53147e-5
export const bcf = (v: number | null | undefined) => (v == null ? null : v * BCF)

export const dateOf = (flows: Flows, i: number) => new Date(Date.parse(flows.start) + i * DAY)
export const indexOf = (flows: Flows, iso: string) =>
  Math.max(0, Math.min(flows.days - 1, Math.round((Date.parse(iso) - Date.parse(flows.start)) / DAY)))
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
export const fmt = (v: number | null | undefined, digits = 2) => (v == null || !isFinite(v) ? 'n/a' : v.toFixed(digits))

async function load<T>(name: string, required: true): Promise<T>
async function load<T>(name: string, required: false): Promise<T | null>
async function load<T>(name: string, required: boolean): Promise<T | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    return (await res.json()) as T
  } catch (err) {
    if (required) throw err
    console.warn(`Optional dataset ${name} is unavailable`, err)
    return null
  }
}

export async function loadAll(): Promise<Dataset> {
  const [flows, us, hotspots, burned, weather] = await Promise.all([
    load<Flows>('flows.json', true),
    load<UsPipelines>('pipelines-us.json', false),
    load<Hotspots>('hotspots.json', false),
    load<Burned>('burned.json', false),
    load<Weather>('weather.json', false),
  ])
  const byPoint = new Map<string, KeyPoint>()
  for (const s of flows.series) {
    const id = `${s.system}|${s.keyPoint}`
    let kp = byPoint.get(id)
    if (!kp) {
      const c = network.corridors[s.keyPoint]
      kp = { id, name: s.keyPoint, system: s.system, lat: s.lat, lon: s.lon, series: [], corridor: c?.path ?? null, corridorDir: c?.dir ?? null }
      byPoint.set(id, kp)
    }
    kp.series.push(s)
  }
  return { flows, us, hotspots, burned, weather, keyPoints: [...byPoint.values()] }
}

/** The series carrying the most gas at this key point on this day (key points can flow both ways). */
export function dominant(kp: KeyPoint, day: number): Series | null {
  let best: Series | null = null
  for (const s of kp.series) {
    const v = s.thr[day]
    if (v != null && (best == null || v > (best.thr[day] ?? -1))) best = s
  }
  return best
}

export function utilization(s: Series, day: number): number | null {
  const t = s.thr[day]
  const c = s.cap[day]
  return t != null && c != null && c > 0 ? t / c : null
}

/** Centred-ish trailing mean that skips gaps. */
export function rolling(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length)
  let sum = 0
  let n = 0
  for (let i = 0; i < values.length; i++) {
    const add = values[i]
    if (add != null) { sum += add; n++ }
    if (i >= window) {
      const drop = values[i - window]
      if (drop != null) { sum -= drop; n-- }
    }
    out[i] = n >= Math.ceil(window / 2) ? sum / n : null
  }
  return out
}

export const shortName = (name: string) => name.replace('Eastern Triangle - ', 'ET: ').replace(' Interconnect', '')

/** Export regions for the cross-border chart. Net = export minus import. */
export const BORDER_REGIONS: { name: string; points: string[] }[] = [
  { name: 'Kingsgate (BC)', points: ['Kingsgate'] },
  { name: 'Monchy (SK)', points: ['Monchy'] },
  { name: 'Emerson (MB)', points: ['Emerson I', 'Emerson II'] },
  { name: 'Southern Ontario', points: ['St Clair', 'Niagara', 'Chippawa'] },
  { name: 'Iroquois and Québec', points: ['Iroquois', 'Other US Northeast', 'East Hereford'] },
]

export function netExports(flows: Flows, points: string[] | null, day: number): number {
  let total = 0
  for (const s of flows.series) {
    if (s.trade === 'intracanada') continue
    if (points && !points.includes(s.keyPoint)) continue
    const v = s.thr[day]
    if (v != null) total += s.trade === 'export' ? v : -v
  }
  return total
}

export function cityFor(weather: Weather, lon: number) {
  const id = lon < -105 ? 'calgary' : lon < -88 ? 'winnipeg' : lon < -76 ? 'toronto' : 'montreal'
  return weather.cities.find((c) => c.id === id) ?? weather.cities[0]
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 10) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}
