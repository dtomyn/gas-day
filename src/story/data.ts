import { BCF, type Pt, network } from '../lib/data'
import { Track, km, seaLane } from './geo'

type RouteFile = { source: string; fetched: string; km: number; path: Pt[]; stepKm: number; elev: number[] }
type MontneyFile = { source: string; fetched: string; start: string; montney: number[]; other: number[]; wells: [number, number, number][] }
type LngFile = { source: string; fetched: string; cargoes: { month: string; to: string; vessel: string; vol: number }[] }

export type Destination = {
  id: string
  name: string
  /** Where the label sits and the lane ends: a representative LNG port, not a recorded one. */
  port: Pt
  lane: Track
  /** Total volume shipped, 1000 m3 of gas. */
  vol: number
}
export type Cargo = { month: number; dest: number; vessel: string; vol: number; depart: number }

export type StoryData = {
  route: Track
  stepKm: number
  elev: number[]
  summit: { km: number; m: number }
  /** Decimal year of each production month, and gas in Bcf/d. */
  prod: { year: number[]; label: string[]; montney: number[]; other: number[] }
  wells: [number, number, number][]
  ngtl: Pt[][]
  destinations: Destination[]
  cargoes: Cargo[]
  /** Export months, oldest first, as "2025-06". */
  months: string[]
  /** Bcf/d by [destination][month]. */
  exports: number[][]
  vessels: number
  fetched: { route: string; montney: string; lng: string }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

// Towns used to say roughly where the camera is. Coordinates are town centres.
export const TOWNS: { name: string; at: Pt }[] = [
  { name: 'Dawson Creek', at: [-120.235, 55.76] },
  { name: 'Chetwynd', at: [-121.633, 55.698] },
  { name: 'Mackenzie', at: [-123.09, 55.338] },
  { name: 'Prince George', at: [-122.75, 53.917] },
  { name: 'Fort St. James', at: [-124.25, 54.443] },
  { name: 'Vanderhoof', at: [-124.01, 54.017] },
  { name: 'Fraser Lake', at: [-124.85, 54.05] },
  { name: 'Burns Lake', at: [-125.76, 54.23] },
  { name: 'Houston', at: [-126.65, 54.4] },
  { name: 'Smithers', at: [-127.17, 54.78] },
  { name: 'Terrace', at: [-128.6, 54.52] },
  { name: 'Kitimat', at: [-128.65, 54.05] },
]
export function nearestTown(p: Pt) {
  let best = { name: '', km: Infinity }
  for (const t of TOWNS) {
    const d = km(p, t.at)
    if (d < best.km) best = { name: t.name, km: d }
  }
  return best
}

// Illustrative sea lanes. The regulator publishes the destination country only, so each lane ends at a
// representative LNG port and follows a plausible great-circle passage, not a recorded voyage.
const KITIMAT: Pt = [-128.69, 54.0]
const OUT_TO_SEA: Pt[] = [KITIMAT, [-129.2, 53.45], [-129.9, 52.9], [-130.9, 51.5], [-134, 51.2]]
const NORTH_PACIFIC: Pt[] = [...OUT_TO_SEA, [-165, 50.5], [172, 47]]
const SOUTH_OF_JAPAN: Pt[] = [...NORTH_PACIFIC, [143, 34], [132, 29.8]]
const LUZON_STRAIT: Pt[] = [...SOUTH_OF_JAPAN, [123.5, 21.6], [120.6, 21]]
const LANES: { match: string; id: string; name: string; port: Pt; via: Pt[] }[] = [
  // Taiwan comes before China: the regulator's name for it contains both words.
  { match: 'Taiwan', id: 'taiwan', name: 'Taiwan', port: [120.45, 24.25], via: [...SOUTH_OF_JAPAN, [123.2, 26.2], [121.2, 25.6]] },
  { match: 'Korea', id: 'korea', name: 'South Korea', port: [128.45, 34.8], via: [...NORTH_PACIFIC, [142.5, 41.6], [139.6, 41.4], [130.4, 35.4]] },
  { match: 'China', id: 'china', name: 'China', port: [122.2, 30.9], via: SOUTH_OF_JAPAN },
  { match: 'Japan', id: 'japan', name: 'Japan', port: [139.75, 35.3], via: [...NORTH_PACIFIC, [141.2, 35.2], [139.9, 34.6]] },
  { match: 'Viet Nam', id: 'vietnam', name: 'Vietnam', port: [107.2, 10.3], via: [...LUZON_STRAIT, [112, 14], [109.8, 11]] },
  { match: 'Thailand', id: 'thailand', name: 'Thailand', port: [101.15, 12.6], via: [...LUZON_STRAIT, [112, 13], [108.6, 7.2], [104.2, 7.8], [102.5, 9.5]] },
  { match: 'Philippines', id: 'philippines', name: 'Philippines', port: [120.95, 13.7], via: [...LUZON_STRAIT, [119.3, 16.5], [119.9, 14.2], [120.5, 13.75]] },
]

async function load<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function loadStory(): Promise<StoryData> {
  const [r, m, l] = await Promise.all([load<RouteFile>('story-route.json'), load<MontneyFile>('story-montney.json'), load<LngFile>('story-lng.json')])

  const peak = r.elev.reduce((best, e, i) => (e > r.elev[best] ? i : best), 0)

  const y0 = +m.start.slice(0, 4), m0 = +m.start.slice(5, 7) - 1
  const prod: StoryData['prod'] = { year: [], label: [], montney: [], other: [] }
  for (let i = 0; i < m.montney.length; i++) {
    const year = y0 + Math.floor((m0 + i) / 12), month = (m0 + i) % 12
    const perDay = BCF / daysIn(year, month)
    prod.year.push(year + month / 12)
    prod.label.push(`${year}-${String(month + 1).padStart(2, '0')}`)
    prod.montney.push(+(m.montney[i] * perDay).toFixed(3))
    prod.other.push(+(m.other[i] * perDay).toFixed(3))
  }

  // Every month from the first shipment to the last, so a month with no shipments still shows as a gap.
  const first = l.cargoes[0].month, last = l.cargoes[l.cargoes.length - 1].month
  const months: string[] = []
  for (let y = +first.slice(0, 4), mo = +first.slice(5, 7); `${y}-${String(mo).padStart(2, '0')}` <= last; mo === 12 ? (y++, (mo = 1)) : mo++) {
    months.push(`${y}-${String(mo).padStart(2, '0')}`)
  }

  const destinations: Destination[] = []
  const cargoes: Cargo[] = []
  for (const c of l.cargoes) {
    const lane = LANES.find((x) => c.to.includes(x.match))
    if (!lane) {
      console.warn(`No sea lane drawn for ${c.to}. Its shipments are left off the map.`)
      continue
    }
    let dest = destinations.findIndex((d) => d.id === lane.id)
    if (dest < 0) dest = destinations.push({ id: lane.id, name: lane.name, port: lane.port, lane: new Track(seaLane([...lane.via, lane.port])), vol: 0 }) - 1
    destinations[dest].vol += c.vol
    cargoes.push({ month: months.indexOf(c.month), dest, vessel: c.vessel, vol: c.vol, depart: 0 })
  }
  // Spread each month's sailings evenly through the month. The data gives the month, not the day.
  months.forEach((_, k) => {
    const inMonth = cargoes.filter((c) => c.month === k)
    inMonth.forEach((c, j) => (c.depart = k + (j + 0.5) / inMonth.length))
  })
  const exports = destinations.map((_, d) =>
    months.map((ym, k) => {
      const vol = cargoes.filter((c) => c.dest === d && c.month === k).reduce((a, c) => a + c.vol, 0)
      return +((vol * BCF) / daysIn(+ym.slice(0, 4), +ym.slice(5, 7) - 1)).toFixed(3)
    }),
  )

  return {
    route: new Track(r.path),
    stepKm: r.stepKm,
    elev: r.elev,
    summit: { km: peak * r.stepKm, m: r.elev[peak] },
    prod,
    wells: m.wells,
    ngtl: network.systems.filter((s) => s.name === 'NGTL System' || s.name === 'Foothills').flatMap((s) => s.paths),
    destinations,
    cargoes,
    months,
    exports,
    vessels: new Set(cargoes.map((c) => c.vessel)).size,
    fetched: { route: r.fetched, montney: m.fetched, lng: l.fetched },
  }
}

/** Elevation in metres at a distance along the route. */
export function elevationAt(d: StoryData, at: number) {
  const x = Math.max(0, Math.min(d.elev.length - 1, at / d.stepKm))
  const i = Math.floor(x)
  return d.elev[i] + ((d.elev[Math.min(d.elev.length - 1, i + 1)] - d.elev[i]) * (x - i))
}

/** How rugged the ground is around a point on the route, 0 (flat) to 1 (mountains). */
export function reliefAt(d: StoryData, at: number, windowKm = 14) {
  const lo = Math.max(0, Math.round((at - windowKm) / d.stepKm)), hi = Math.min(d.elev.length - 1, Math.round((at + windowKm) / d.stepKm))
  let min = Infinity, max = -Infinity
  for (let i = lo; i <= hi; i++) {
    min = Math.min(min, d.elev[i])
    max = Math.max(max, d.elev[i])
  }
  return Math.max(0, Math.min(1, (max - min - 150) / 550))
}
