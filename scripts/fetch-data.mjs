// Fetches every public dataset the app uses and writes compact files to public/data/.
// Run: npm run data            (all)      npm run data -- flows hotspots   (some)
// No API keys are needed. Sources are listed in README.md.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'data')
const UA = { 'User-Agent': 'gas-day-map/0.1 (open data fetch)' }

const START = '2006-01-01'
const DAY = 86400000
const dayIndex = (iso) => Math.round((Date.parse(iso) - Date.parse(START)) / DAY)

async function get(url, as = 'text', tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(240000) })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      if (as === 'buffer') return Buffer.from(await res.arrayBuffer())
      if (as === 'latin1') return Buffer.from(await res.arrayBuffer()).toString('latin1')
      return as === 'json' ? await res.json() : await res.text()
    } catch (err) {
      if (i >= tries) throw new Error(`${url}\n  ${err.message}`)
      await new Promise((r) => setTimeout(r, 3000 * i))
    }
  }
}

const save = async (name, obj) => {
  const text = JSON.stringify(obj)
  await writeFile(join(OUT, name), text)
  console.log(`  wrote ${name} (${(text.length / 1e6).toFixed(2)} MB)`)
}

// ---------- CSV (fields may contain quoted newlines) ----------
function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

// ---------- geometry helpers ----------
const R = 6371
const rad = (d) => (d * Math.PI) / 180
function km(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
function densify(path, stepKm = 3) {
  const out = []
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1]
    const n = Math.max(1, Math.ceil(km(a, b) / stepKm))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  out.push(path[path.length - 1])
  return out
}
// Douglas-Peucker in degrees; fine at this zoom level.
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    const [ax, ay] = pts[s], [bx, by] = pts[e]
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy
    let max = 0, idx = -1
    for (let i = s + 1; i < e; i++) {
      const t = len ? Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len)) : 0
      const d = (pts[i][0] - ax - t * dx) ** 2 + (pts[i][1] - ay - t * dy) ** 2
      if (d > max) { max = d; idx = i }
    }
    if (max > tol * tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]) }
  }
  return pts.filter((_, i) => keep[i])
}
const round = (p, n = 3) => [+p[0].toFixed(n), +p[1].toFixed(n)]

/** Spatial index of points sampled along every TC line, for "how far is this from an asset". */
async function assetIndex() {
  const network = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'network.json'), 'utf8'))
  const pts = []
  for (const sys of network.systems) for (const p of sys.paths) for (const q of densify(p)) pts.push({ p: q, name: sys.name })
  try {
    const us = JSON.parse(await readFile(join(OUT, 'pipelines-us.json'), 'utf8'))
    for (const f of us.features) for (const line of f.paths) for (const q of densify(line)) pts.push({ p: q, name: f.name })
  } catch {
    console.warn('  (US pipelines not fetched yet: proximity uses Canadian routes only)')
  }
  const CELL = 0.5
  const grid = new Map()
  const key = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`
  for (const pt of pts) {
    const k = key(pt.p[0], pt.p[1])
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(pt)
  }
  /** Nearest asset within roughly 100 km, else null. */
  return (p) => {
    let best = null
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
    for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 2; dy++) {
      for (const pt of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const d = km(p, pt.p)
        if (!best || d < best.km) best = { km: d, name: pt.name }
      }
    }
    return best
  }
}

// ---------- 1. CER throughput and capacity ----------
const CER = 'https://www.cer-rec.gc.ca/open/energy/throughput-capacity/'
const SYSTEMS = [
  { file: 'ngtl', system: 'NGTL System' },
  { file: 'tcpl-mainline', system: 'Canadian Mainline' },
  { file: 'foothills', system: 'Foothills' },
  { file: 'tqm', system: 'TQM' },
]
async function flows() {
  console.log('CER throughput and capacity')
  const series = new Map()
  let maxDay = 0
  for (const { file, system } of SYSTEMS) {
    const rows = parseCsv(await get(`${CER}${file}-throughput-and-capacity.csv`))
    const col = Object.fromEntries(rows[0].map((h, i) => [h.trim(), i]))
    for (const need of ['Date', 'Key Point', 'Latitude', 'Longitude', 'Direction Of Flow', 'Trade Type', 'Capacity (1000 m3/d)', 'Throughput (1000 m3/d)']) {
      if (!(need in col)) throw new Error(`${file}: column "${need}" missing. The CER changed the file layout.`)
    }
    for (const r of rows.slice(1)) {
      if (r.length < rows[0].length) continue
      const keyPoint = r[col['Key Point']].trim()
      const direction = r[col['Direction Of Flow']].trim()
      const trade = r[col['Trade Type']].trim()
      const id = `${system}|${keyPoint}|${direction}|${trade}`
      if (!series.has(id)) {
        series.set(id, { id, system, keyPoint, direction, trade, lat: +r[col['Latitude']], lon: +r[col['Longitude']], thr: [], cap: [] })
      }
      const s = series.get(id)
      const d = dayIndex(r[col['Date']])
      if (!(d >= 0)) continue
      maxDay = Math.max(maxDay, d)
      const num = (v) => (v === '' || isNaN(+v) ? null : Math.round(+v))
      s.thr[d] = num(r[col['Throughput (1000 m3/d)']])
      s.cap[d] = num(r[col['Capacity (1000 m3/d)']])
    }
    console.log(`  ${system}: ${rows.length - 1} rows`)
  }
  const n = maxDay + 1
  const fill = (a) => Array.from({ length: n }, (_, i) => a[i] ?? null)
  await save('flows.json', {
    source: 'Canada Energy Regulator, Pipeline Throughput and Capacity Data (Open Government Licence - Canada)',
    fetched: new Date().toISOString(),
    start: START,
    days: n,
    unit: '1000 m3/d',
    series: [...series.values()].map((s) => ({ ...s, thr: fill(s.thr), cap: fill(s.cap) })),
  })
}

// ---------- 2. US pipeline routes (EIA, served by US DOT/BTS) ----------
// Ownership shares are a point-in-time editorial list. Check TC Energy's current asset list before relying on it.
const US_OPERATORS = {
  'ANR Pipeline Co': { name: 'ANR Pipeline', share: 'wholly owned' },
  'Columbia Gas Trans Co': { name: 'Columbia Gas Transmission', share: 'majority owned' },
  'Columbia Gulf Pipeline': { name: 'Columbia Gulf Transmission', share: 'majority owned' },
  'Great Lakes Gas Trans Co': { name: 'Great Lakes Gas Transmission', share: 'wholly owned' },
  'Gas Transmission - Northwest': { name: 'Gas Transmission Northwest (GTN)', share: 'wholly owned' },
  'Crossroads Pipeline Co': { name: 'Crossroads Pipeline', share: 'wholly owned' },
  'Bison Pipeline': { name: 'Bison Pipeline', share: 'wholly owned' },
  'North Baja Pipeline Co': { name: 'North Baja Pipeline', share: 'wholly owned' },
  'Tuscarora Pipeline Co': { name: 'Tuscarora Gas Transmission', share: 'wholly owned' },
  'Northern Border PL Co': { name: 'Northern Border Pipeline', share: 'partly owned' },
  'Iroquois Gas Trans Co': { name: 'Iroquois Gas Transmission', share: 'partly owned' },
  'Millennium Pipeline Co': { name: 'Millennium Pipeline', share: 'partly owned' },
}
async function pipelinesUs() {
  console.log('US pipeline routes (EIA via BTS)')
  const base = 'https://geo.dot.gov/server/rest/services/hosted/Natural_Gas_Pipelines_US_EIA/FeatureServer/0/query'
  const where = `operator IN (${Object.keys(US_OPERATORS).map((o) => `'${o}'`).join(',')})`
  const byOp = new Map()
  for (let offset = 0; ; offset += 2000) {
    const qs = new URLSearchParams({ where, outFields: 'operator,typepipe', outSR: '4326', f: 'geojson', resultOffset: offset, resultRecordCount: 2000, orderByFields: 'objectid' })
    const page = await get(`${base}?${qs}`, 'json')
    if (!page.features) throw new Error('BTS service returned no features: ' + JSON.stringify(page).slice(0, 200))
    for (const f of page.features) {
      if (!f.geometry) continue
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
      const op = f.properties.operator
      if (!byOp.has(op)) byOp.set(op, [])
      for (const l of lines) {
        const s = simplify(l, 0.004).map((p) => round(p))
        if (s.length > 1) byOp.get(op).push(s)
      }
    }
    if (page.features.length < 2000) break
  }
  const features = [...byOp].map(([op, paths]) => ({ operator: op, ...US_OPERATORS[op], paths }))
  for (const f of features) console.log(`  ${f.name}: ${f.paths.length} segments`)
  await save('pipelines-us.json', {
    source: 'U.S. Energy Information Administration, Natural Gas Interstate and Intrastate Pipelines (via US DOT BTS NTAD)',
    fetched: new Date().toISOString(),
    features,
  })
}

// ---------- 3. Wildfire: live hotspots and historical burned area (CWFIS) ----------
const WFS = 'https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows'
const wfs = (params) => `${WFS}?${new URLSearchParams({ service: 'WFS', version: '1.0.0', request: 'GetFeature', outputFormat: 'application/json', ...params })}`

async function hotspots() {
  console.log('Wildfire hotspots, last 24 h (CWFIS)')
  const nearest = await assetIndex()
  const fc = await get(wfs({ typeName: 'public:hotspots_last24hrs', propertyName: 'lat,lon,rep_date,sensor,agency,frp,hfi' }), 'json')
  const points = []
  for (const f of fc.features) {
    const p = f.properties
    if (!(p.lat > 40 && p.lon < -50)) continue
    const near = nearest([p.lon, p.lat])
    points.push({ lon: +p.lon.toFixed(3), lat: +p.lat.toFixed(3), t: p.rep_date, frp: p.frp, agency: p.agency, km: near ? Math.round(near.km) : null, asset: near?.name ?? null })
  }
  console.log(`  ${points.length} hotspots north of 40°N, ${points.filter((p) => p.km !== null && p.km <= 25).length} within 25 km of a TC route`)
  await save('hotspots.json', {
    source: 'Natural Resources Canada, Canadian Wildland Fire Information System (CWFIS) hotspots, last 24 hours',
    fetched: new Date().toISOString(),
    points,
  })
}

async function burned() {
  console.log('Burned area polygons, 2006 onward (CWFIS National Burned Area Composite)')
  const nearest = await assetIndex()
  // The raw polygons run to hundreds of MB, so page through them and simplify as we go.
  const PAGE = 40
  const seen = new Set()
  const features = []
  for (let start = 0; ; start += PAGE) {
    const page = await get(wfs({ typeName: 'public:nbac', srsName: 'EPSG:4326', propertyName: 'year,poly_ha,firecaus,geometry', CQL_FILTER: 'year>=2006 AND poly_ha>=5000', sortBy: '__gid', maxFeatures: PAGE, startIndex: start }), 'json')
    for (const f of page.features) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      features.push(f)
    }
    if (start % 400 === 0) console.log(`  ${features.length} fires read`)
    if (page.features.length < PAGE) break
  }
  const fires = []
  for (const f of features.splice(0)) {
    if (!f.geometry) continue
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    // Outer rings only: holes do not matter at this scale.
    const rings = polys.map((poly) => simplify(poly[0], 0.01).map((p) => round(p))).filter((r) => r.length >= 4)
    if (!rings.length) continue
    let best = null
    for (const ring of rings) for (const p of ring) {
      const n = nearest(p)
      if (n && (!best || n.km < best.km)) best = n
    }
    fires.push({ year: f.properties.year, ha: Math.round(f.properties.poly_ha), cause: f.properties.firecaus, km: best ? Math.round(best.km) : null, asset: best?.name ?? null, rings })
  }
  const years = fires.map((f) => f.year)
  console.log(`  ${fires.length} fires of 5,000 ha or more, ${Math.min(...years)} to ${Math.max(...years)}`)
  await save('burned.json', {
    source: 'Natural Resources Canada, National Burned Area Composite (NBAC), fires of 5,000 ha or more',
    fetched: new Date().toISOString(),
    fires,
  })
}

// ---------- 4. Weather (Open-Meteo historical archive) ----------
const CITIES = [
  { id: 'calgary', name: 'Calgary', lat: 51.05, lon: -114.07 },
  { id: 'winnipeg', name: 'Winnipeg', lat: 49.9, lon: -97.14 },
  { id: 'toronto', name: 'Toronto', lat: 43.65, lon: -79.38 },
  { id: 'montreal', name: 'Montréal', lat: 45.5, lon: -73.57 },
]
async function weather() {
  console.log('Daily mean temperature (Open-Meteo archive)')
  const end = new Date(Date.now() - 6 * DAY).toISOString().slice(0, 10)
  const cities = []
  for (const c of CITIES) {
    const qs = new URLSearchParams({ latitude: c.lat, longitude: c.lon, start_date: START, end_date: end, daily: 'temperature_2m_mean', timezone: 'UTC' })
    const j = await get(`https://archive-api.open-meteo.com/v1/archive?${qs}`, 'json')
    if (j.daily.time[0] !== START) throw new Error('Open-Meteo series does not start on ' + START)
    cities.push({ ...c, temp: j.daily.temperature_2m_mean.map((t) => (t === null ? null : Math.round(t * 10) / 10)) })
    console.log(`  ${c.name}: ${j.daily.time.length} days`)
  }
  await save('weather.json', { source: 'Open-Meteo Historical Weather API (ERA5 reanalysis), CC BY 4.0', fetched: new Date().toISOString(), start: START, unit: '°C daily mean', cities })
}

// ---------- 5. Wellhead to water: the Coastal GasLink route and its elevation ----------
// The route is the line mapped by OpenStreetMap contributors (ODbL). Elevation is sampled from the
// Copernicus 90 m model through Open-Meteo's elevation API.
const PROFILE_STEP_KM = 0.5
async function route() {
  console.log('Coastal GasLink route (OpenStreetMap) and elevation profile (Copernicus DEM via Open-Meteo)')
  const query = '[out:json][timeout:90];way["man_made"="pipeline"]["name"~"Coastal GasLink",i](53.5,-129.5,56.5,-119.5);out tags geom;'
  const osm = await get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, 'json')
  const ways = osm.elements.filter((e) => e.geometry?.length > 1).map((e) => e.geometry.map((g) => [g.lon, g.lat]))
  if (!ways.length) throw new Error('OpenStreetMap returned no Coastal GasLink line')
  const length = (p) => p.slice(1).reduce((a, q, i) => a + km(p[i], q), 0)
  let path = ways.sort((a, b) => length(b) - length(a))[0]
  // Gas flows east to west, so the line starts at the Montney end.
  if (path[0][0] < path[path.length - 1][0]) path = path.reverse()
  const total = length(path)
  if (total < 600) throw new Error(`The longest mapped line is only ${Math.round(total)} km. The route may have been split in OpenStreetMap.`)

  // Points every PROFILE_STEP_KM along the line.
  const samples = [path[0]]
  let next = PROFILE_STEP_KM, done = 0
  for (let i = 1; i < path.length; i++) {
    const seg = km(path[i - 1], path[i])
    while (next <= done + seg) {
      const f = (next - done) / seg
      samples.push([path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f])
      next += PROFILE_STEP_KM
    }
    done += seg
  }
  const elev = []
  for (let i = 0; i < samples.length; i += 100) {
    const chunk = samples.slice(i, i + 100)
    const qs = `latitude=${chunk.map((p) => p[1].toFixed(5)).join(',')}&longitude=${chunk.map((p) => p[0].toFixed(5)).join(',')}`
    const j = await get(`https://api.open-meteo.com/v1/elevation?${qs}`, 'json')
    if (j.elevation?.length !== chunk.length) throw new Error('Open-Meteo returned the wrong number of elevations')
    elev.push(...j.elevation.map((e) => Math.round(e)))
    // Open-Meteo counts every coordinate against a limit of 600 a minute.
    if (i + 100 < samples.length) await new Promise((r) => setTimeout(r, 11000))
  }
  console.log(`  ${Math.round(total)} km, ${path.length} points, ${elev.length} elevation samples, ${Math.min(...elev)} to ${Math.max(...elev)} m`)
  await save('story-route.json', {
    source: 'Route: OpenStreetMap contributors (ODbL). Elevation: Copernicus DEM GLO-90 via the Open-Meteo elevation API.',
    fetched: new Date().toISOString(),
    km: +total.toFixed(1),
    path: path.map((p) => round(p, 4)),
    stepKm: PROFILE_STEP_KM,
    elev,
  })
}

// ---------- 6. Wellhead to water: British Columbia gas production (BC Energy Regulator) ----------
/** Reads the named entries of a zip archive held in memory. Enough for the BCER downloads (deflate, no zip64). */
function* unzip(buf, wanted) {
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('Not a zip archive')
  let at = buf.readUInt32LE(eocd + 16)
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('Zip directory is damaged')
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20)
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.toString('latin1', at + 46, at + 46 + nameLen)
    at += 46 + nameLen + extraLen + commentLen
    if (!wanted(name)) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + size)
    yield { name, text: (method === 8 ? inflateRawSync(raw) : raw).toString('latin1') }
  }
}

// Formation 5000 is the Montney in the regulator's coding. It grows from about 1% of BC gas in 2005 to over 90% today.
const MONTNEY = '5000'
const PROD_START = 2000
async function montney() {
  console.log('BC gas production by well and formation (BC Energy Regulator). A 125 MB download.')
  const zip = await get('https://iris.bc-er.ca/download/prod_csv.zip', 'buffer')
  const ym = (p) => (+p.slice(0, 4) - PROD_START) * 12 + (+p.slice(4, 6) - 1)
  const montneyGas = [], otherGas = []
  const firstMonth = new Map() // well authority number -> first month of Montney gas
  let files = 0
  // The archive holds the history twice: once split by period and once whole. Read the split files.
  for (const { name, text } of unzip(zip, (n) => /^zone_prd_\d{4}_to_/i.test(n))) {
    files++
    const headAt = text.indexOf('\n') + 1 // the first line is a title
    let pos = text.indexOf('\n', headAt) + 1
    const head = text.slice(headAt, pos).replace(/["\r\n]/g, '').split(',')
    const col = { wa: head.indexOf('Wa_num'), period: head.indexOf('Prod_period'), formation: head.indexOf('Formtn_code'), gas: head.indexOf('Gas_prod_vol (e3m3)') }
    if (Object.values(col).some((i) => i < 0)) throw new Error(`${name}: a column is missing. The regulator changed the file layout.`)
    while (pos < text.length) {
      let end = text.indexOf('\n', pos)
      if (end < 0) end = text.length
      const f = text.slice(pos, end).replace(/\r$/, '').slice(1, -1).split('","')
      pos = end + 1
      const gas = +f[col.gas]
      if (!(gas > 0)) continue
      const m = ym(f[col.period])
      const isMontney = f[col.formation] === MONTNEY
      if (isMontney) {
        const wa = f[col.wa]
        if (!firstMonth.has(wa) || m < firstMonth.get(wa)) firstMonth.set(wa, m)
      }
      if (m < 0) continue
      const into = isMontney ? montneyGas : otherGas
      into[m] = (into[m] ?? 0) + gas
    }
    console.log(`  read ${name}`)
  }
  if (!files) throw new Error('No production files found in the archive')
  const months = Math.max(montneyGas.length, otherGas.length)
  const fill = (a) => Array.from({ length: months }, (_, i) => Math.round(a[i] ?? 0))

  console.log('  well surface locations (BC Energy Regulator map service)')
  const base = 'https://geoweb-ags.bc-er.ca/arcgis/rest/services/PASR/PASR_WELL_SURFACE_STATE_PT/FeatureServer/0/query'
  const wells = []
  for (let offset = 0; ; offset += 2000) {
    const qs = new URLSearchParams({ where: '1=1', outFields: 'WELL_AUTHORITY_NUMBER', outSR: '4326', geometryPrecision: 3, f: 'json', resultOffset: offset, resultRecordCount: 2000, orderByFields: 'OBJECTID' })
    const page = await get(`${base}?${qs}`, 'json')
    if (!page.features) throw new Error('BCER map service returned no features: ' + JSON.stringify(page).slice(0, 200))
    for (const f of page.features) {
      const m = firstMonth.get(f.attributes.WELL_AUTHORITY_NUMBER)
      if (m == null || !f.geometry) continue
      // [lon, lat, year of first Montney gas as a decimal]
      wells.push([f.geometry.x, f.geometry.y, +(PROD_START + m / 12).toFixed(2)])
    }
    if (page.features.length < 2000) break
  }
  wells.sort((a, b) => a[2] - b[2])
  console.log(`  ${months} months from ${PROD_START}, ${firstMonth.size} Montney gas wells, ${wells.length} with a mapped location`)
  await save('story-montney.json', {
    source: 'BC Energy Regulator: monthly production by well and zone, and well surface locations',
    fetched: new Date().toISOString(),
    start: `${PROD_START}-01`,
    unit: '1000 m3 of raw gas per month',
    montney: fill(montneyGas),
    other: fill(otherGas),
    wells,
  })
}

// ---------- 7. Wellhead to water: LNG shipments leaving Kitimat (CER) ----------
async function lng() {
  console.log('LNG export shipments from Kitimat (CER)')
  const rows = parseCsv(await get('https://www.cer-rec.gc.ca/open/imports-exports/liquefied-natural-gas-exports-detail.csv', 'latin1'))
  const col = Object.fromEntries(rows[0].map((h, i) => [h.trim(), i]))
  for (const need of ['Period', 'Activity', 'ToCountryName', 'Terminal', 'Vessel', 'Volume']) {
    if (!(need in col)) throw new Error(`column "${need}" missing. The CER changed the file layout.`)
  }
  const cargoes = []
  for (const r of rows.slice(1)) {
    if (r[col['Activity']] !== 'Exports' || !/^Kitimat/i.test(r[col['Terminal']])) continue
    const [mm, , yyyy] = r[col['Period']].split('/')
    const vol = +r[col['Volume']]
    if (!(vol > 0)) continue
    // Volume is in 1000 m3 of gas. Each row is one vessel and one destination in one month.
    cargoes.push({ month: `${yyyy}-${mm}`, to: r[col['ToCountryName']].trim(), vessel: r[col['Vessel']].trim().toUpperCase(), vol: Math.round(vol) })
  }
  if (!cargoes.length) throw new Error('No Kitimat exports found')
  cargoes.sort((a, b) => a.month.localeCompare(b.month))
  console.log(`  ${cargoes.length} shipment records, ${cargoes[0].month} to ${cargoes[cargoes.length - 1].month}, ${new Set(cargoes.map((c) => c.to)).size} destinations`)
  await save('story-lng.json', {
    source: 'Canada Energy Regulator, Liquefied Natural Gas Exports, shipment detail (Open Government Licence - Canada)',
    fetched: new Date().toISOString(),
    unit: '1000 m3 of gas',
    cargoes,
  })
}

// Order matters: wildfire proximity reads the US routes written by pipelinesUs.
const TASKS = { flows, 'pipelines-us': pipelinesUs, hotspots, burned, weather, route, montney, lng }
const wanted = process.argv.slice(2)
await mkdir(OUT, { recursive: true })
let failed = 0
for (const [name, task] of Object.entries(TASKS)) {
  if (wanted.length && !wanted.includes(name)) continue
  try {
    await task()
  } catch (err) {
    failed++
    console.error(`FAILED ${name}: ${err.message}`)
  }
}
process.exit(failed ? 1 : 0)
