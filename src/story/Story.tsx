import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { fmt, fmtDate } from '../lib/data'
import { ElevationChart, ExportsChart, ProductionChart } from './StoryCharts'
import { type StoryData, TOWNS, elevationAt, loadStory, monthLabel, nearestTown, reliefAt } from './data'
import { clamp, km as distance, lerp, lerpAngle, smooth } from './geo'
import { EXAGGERATION, type Frame, MAP_CREDITS, Scene, VOYAGE } from './scene'
import './story.css'

/** Chapters in scroll order. `vh` is how much scrolling each one takes, in screen heights. */
const CHAPTERS = [
  { id: 'hero', title: 'Wellhead to water', vh: 100, blend: 0 },
  { id: 'basin', title: 'The basin', vh: 340, blend: 0.22 },
  { id: 'ngtl', title: 'The gathering system', vh: 170, blend: 0.35 },
  { id: 'route', title: 'The pipeline', vh: 1100, blend: 0.045 },
  { id: 'kitimat', title: 'The terminal', vh: 200, blend: 0.3 },
  { id: 'pacific', title: 'The water', vh: 420, blend: 0.22 },
  { id: 'outro', title: 'Sources', vh: 100, blend: 0.6 },
] as const
type ChapterId = (typeof CHAPTERS)[number]['id']
const INDEX = Object.fromEntries(CHAPTERS.map((c, i) => [c.id, i])) as Record<ChapterId, number>

const FIRST_YEAR = 2004
/** The pipeline chapter spends its first and last few percent arriving and leaving. */
const ROUTE_FROM = 0.06, ROUTE_TO = 0.95
const routeT = (km: number, total: number) => ROUTE_FROM + (ROUTE_TO - ROUTE_FROM) * (km / total)

type View = { w: number; h: number }
type Cam = Pick<Frame, 'center' | 'zoom' | 'pitch' | 'bearing' | 'padLeft' | 'padBottom' | 'sat'>

/** Where the camera is for a chapter at progress t (0 to 1), before blending with its neighbour. */
function camera(id: ChapterId, t: number, d: StoryData, v: View): Cam {
  const wide = v.w >= 900
  const side = wide ? Math.min(470, v.w * 0.36) : 0
  const small = wide ? 0 : 0.7
  const globe = wide ? 2.2 : 1.3
  switch (id) {
    case 'hero':
      return { center: [-125, 54.6], zoom: 3.7 - small + 0.5 * t, pitch: 0, bearing: 0, padLeft: 0, padBottom: 0, sat: 0.75 }
    case 'basin':
      return { center: [-121.4, 56.4], zoom: lerp(6.7, 7.3, t) - small, pitch: lerp(35, 54, t), bearing: lerp(-14, 24, t), padLeft: side, padBottom: wide ? 0 : v.h * 0.35, sat: 0.3 }
    case 'ngtl':
      return { center: [lerp(-118.6, -117.4, t), lerp(54.6, 53.4, t)], zoom: lerp(5.4, 5.1, t) - small, pitch: lerp(32, 18, t), bearing: lerp(12, 0, t), padLeft: side, padBottom: 0, sat: 0.25 }
    case 'route': {
      const km = d.route.length * clamp((t - ROUTE_FROM) / (ROUTE_TO - ROUTE_FROM))
      const relief = reliefAt(d, km)
      return {
        // Look a little ahead of the gas, and swing gently from side to side for a view of both flanks.
        center: d.route.point(km + 4),
        zoom: 10.5 + 0.7 * relief - small,
        pitch: 62 + 10 * relief,
        bearing: d.route.heading(km) + 24 * Math.sin(km / 70),
        padLeft: v.w >= 1200 ? side * 0.7 : 0,
        padBottom: wide ? 210 : 150,
        sat: 0.95,
      }
    }
    case 'kitimat':
      return { center: [lerp(-128.69, -128.8, t), lerp(54.01, 53.88, t)], zoom: lerp(11.2, 10.1, t) - small, pitch: lerp(66, 58, t), bearing: 195 + 95 * t, padLeft: side * 0.6, padBottom: 0, sat: 0.95 }
    case 'pacific':
      return { center: [lerp(-168, -206, t) - (wide ? 0 : 16), lerp(42, 32, t)], zoom: globe, pitch: 0, bearing: 0, padLeft: side * 0.8, padBottom: wide ? 0 : v.h * 0.3, sat: 0.6 }
    case 'outro':
      return { center: [-214, 30], zoom: globe - 0.15, pitch: 0, bearing: 0, padLeft: 0, padBottom: 0, sat: 0.5 }
  }
}

const mix = (a: Cam, b: Cam, t: number): Cam => ({
  center: [lerp(a.center[0], b.center[0], t), lerp(a.center[1], b.center[1], t)],
  zoom: lerp(a.zoom, b.zoom, t),
  pitch: lerp(a.pitch, b.pitch, t),
  bearing: lerpAngle(a.bearing, b.bearing, t),
  padLeft: lerp(a.padLeft, b.padLeft, t),
  padBottom: lerp(a.padBottom, b.padBottom, t),
  sat: lerp(a.sat, b.sat, t),
})

/** Everything the map should show at chapter `ci`, progress `t`. */
function frameAt(ci: number, t: number, d: StoryData, v: View): Frame {
  const ch = CHAPTERS[ci]
  let cam = camera(ch.id, t, d, v)
  if (ci > 0 && t < ch.blend) cam = mix(camera(CHAPTERS[ci - 1].id, 1, d, v), cam, smooth(t / ch.blend))

  const lastYear = d.prod.year[d.prod.year.length - 1] + 1 / 12
  const before = (id: ChapterId) => ci < INDEX[id]
  const after = (id: ChapterId) => ci > INDEX[id]
  const is = (id: ChapterId) => ci === INDEX[id]

  return {
    ...cam,
    year: before('basin') ? FIRST_YEAR : is('basin') ? lerp(FIRST_YEAR, lastYear, clamp((t - 0.12) / 0.72)) : lastYear,
    wells: before('basin') ? 0 : is('basin') ? clamp(t / 0.1) : is('ngtl') ? 0.9 : is('route') ? 0.7 : 0,
    ngtl: is('ngtl') ? clamp(t / 0.3) : is('route') ? 1 - clamp(t / 0.05) : 0,
    route: before('ngtl') ? 0 : is('ngtl') ? clamp((t - 0.5) / 0.3) : 1,
    km: before('route') ? 0 : is('route') ? d.route.length * clamp((t - ROUTE_FROM) / (ROUTE_TO - ROUTE_FROM)) : d.route.length,
    lanes: before('pacific') ? 0 : is('pacific') ? clamp(t / 0.15) : 1,
    month: before('pacific') ? -1 : is('pacific') ? lerp(-0.2, d.months.length + VOYAGE, clamp((t - 0.14) / 0.8)) : d.months.length + VOYAGE,
    ...(after('pacific') ? { padLeft: 0 } : {}),
  }
}

/** What the page (as opposed to the map) needs to know. Rounded so React only re-renders on visible change. */
type Hud = { ch: number; year: number; km: number; month: number; departed: number }

export default function Story() {
  const [data, setData] = useState<StoryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [hud, setHud] = useState<Hud>({ ch: 0, year: FIRST_YEAR, km: 0, month: -1, departed: 0 })
  const scroller = useRef<HTMLDivElement>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const sections = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    document.title = 'Wellhead to water: following gas from the Montney to the Pacific'
    loadStory().then(setData, (e) => setError(String(e.message ?? e)))
    return () => { document.title = 'Gas Day: TC Energy network flows' }
  }, [])

  useEffect(() => {
    const box = scroller.current, el = mapEl.current
    if (!data || !box || !el) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches

    /** Which chapter is under the middle of the screen, and how far through it we are. */
    const where = () => {
      const mid = box.scrollTop + box.clientHeight / 2
      for (let i = CHAPTERS.length - 1; i >= 0; i--) {
        const s = sections.current[i]
        if (s && mid >= s.offsetTop) return { ci: i, t: clamp((mid - s.offsetTop) / s.offsetHeight) }
      }
      return { ci: 0, t: 0 }
    }
    const view = (): View => ({ w: box.clientWidth, h: box.clientHeight })
    const target = () => {
      const { ci, t } = where()
      return { ci, frame: frameAt(ci, t, data, view()) }
    }

    let cur = target().frame
    const scene = new Scene(el, data, cur, () => setReady(true))
    let raf = 0, then = performance.now()
    const tick = (now: number) => {
      const { ci, frame: to } = target()
      // Ease toward the target so a jerky scroll wheel still gives a smooth flight.
      const k = still ? 1 : 1 - Math.exp(-(now - then) / 240)
      then = now
      const ease = (a: number, b: number) => (Math.abs(b - a) < 1e-5 ? b : lerp(a, b, k))
      cur = {
        center: [ease(cur.center[0], to.center[0]), ease(cur.center[1], to.center[1])],
        zoom: ease(cur.zoom, to.zoom),
        pitch: ease(cur.pitch, to.pitch),
        bearing: lerpAngle(cur.bearing, to.bearing, k),
        padLeft: ease(cur.padLeft, to.padLeft),
        padBottom: ease(cur.padBottom, to.padBottom),
        sat: ease(cur.sat, to.sat),
        wells: ease(cur.wells, to.wells),
        ngtl: ease(cur.ngtl, to.ngtl),
        route: ease(cur.route, to.route),
        lanes: ease(cur.lanes, to.lanes),
        year: ease(cur.year, to.year),
        km: ease(cur.km, to.km),
        month: ease(cur.month, to.month),
      }
      scene.draw(cur, now)

      if (bar.current) bar.current.style.transform = `scaleX(${box.scrollTop / Math.max(1, box.scrollHeight - box.clientHeight)})`
      const next: Hud = {
        ch: ci,
        year: Math.round(cur.year * 12) / 12,
        km: Math.round(cur.km * 2) / 2,
        month: Math.floor(cur.month),
        departed: data.cargoes.filter((c) => c.depart <= cur.month).length,
      }
      setHud((h) => (h.ch === next.ch && h.year === next.year && h.km === next.km && h.month === next.month && h.departed === next.departed ? h : next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      scene.destroy()
      setReady(false)
    }
  }, [data])

  const facts = useMemo(() => (data ? deriveFacts(data) : null), [data])

  if (error) {
    return (
      <div className="splash">
        <h1>Story data not found</h1>
        <p>{error}</p>
        <p>Run <code>npm run data -- route montney lng</code> to download it, then reload.</p>
        <p><a href="#">Back to the Gas Day map</a></p>
      </div>
    )
  }
  if (!data || !facts) return <div className="splash"><p>Loading the route…</p></div>

  const total = data.route.length
  const chapter = CHAPTERS[hud.ch]
  const goto = (i: number) => {
    const s = sections.current[i], box = scroller.current
    if (s && box) box.scrollTo({ top: i === 0 ? 0 : s.offsetTop - box.clientHeight * 0.42, behavior: 'smooth' })
  }

  // Basin read-outs for the year on the map.
  const pi = clamp(Math.round((hud.year - data.prod.year[0]) * 12), 0, data.prod.year.length - 1)
  const wellsNow = countUpTo(data.wells, hud.year)

  // Pipeline read-outs.
  const here = data.route.point(hud.km)
  const town = nearestTown(here)

  // Export read-outs.
  const monthsShown = clamp(hud.month + 1, 0, data.months.length)
  const departed = data.cargoes.slice(0, hud.departed)
  const shippedBcm = departed.reduce((a, c) => a + c.vol, 0) / 1e6
  const atSea = departed.filter((c) => hud.month < c.depart + VOYAGE).length

  const section = (id: ChapterId, children: ReactNode) => {
    const i = INDEX[id]
    return (
      <section key={id} ref={(el) => { sections.current[i] = el }} className={`chapter ch-${id}`} style={{ height: `${CHAPTERS[i].vh}vh` }} aria-label={CHAPTERS[i].title}>
        {children}
      </section>
    )
  }

  return (
    <div className={`story ${ready ? 'ready' : ''} at-${chapter.id}`} ref={scroller}>
      <div className="stage" aria-hidden="true">
        <div ref={mapEl} className="story-map" />
        <div className="shade" />
      </div>

      <header className="story-top">
        <a className="back" href="#">← Gas Day map</a>
        <span className="where">{hud.ch === 0 || hud.ch === CHAPTERS.length - 1 ? '' : `${hud.ch} of ${CHAPTERS.length - 2} · ${chapter.title}`}</span>
        <div className="progress"><div ref={bar} /></div>
      </header>

      <nav className="rail" aria-label="Chapters">
        {CHAPTERS.map((c, i) => (
          <button key={c.id} className={i === hud.ch ? 'on' : ''} onClick={() => goto(i)} aria-label={c.title} aria-current={i === hud.ch}>
            <span>{c.title}</span>
          </button>
        ))}
      </nav>

      <details className="credits">
        <summary aria-label="Map credits">i</summary>
        <p>{MAP_CREDITS}</p>
      </details>

      <div className="flight" aria-hidden={chapter.id !== 'route'}>
        <div className="readouts">
          <Readout label="Distance" value={`${fmt(hud.km, 0)}`} unit={`of ${fmt(total, 0)} km`} />
          <Readout label="Elevation" value={Math.round(elevationAt(data, hud.km)).toLocaleString()} unit="m" />
          <Readout label="Nearest town" value={town.name} unit={`${fmt(town.km, 0)} km away`} />
        </div>
        <ElevationChart data={data} km={hud.km} />
      </div>

      <div className="chapters">
        {section('hero', (
          <div className="hero-block">
            <p className="kicker">A Gas Day story</p>
            <h1>Wellhead<br />to water</h1>
            <p className="lede">
              Follow natural gas for {fmt(total, 0)} kilometres: out of the Montney shale of northeast British Columbia, over two mountain ranges, and onto a ship at Kitimat.
            </p>
            <button className="begin" onClick={() => goto(1)}>Scroll to begin <span aria-hidden="true">↓</span></button>
            <p className="fine">An independent demonstration built from public data. Not affiliated with or endorsed by TC Energy.</p>
          </div>
        ))}

        {section('basin', (
          <div className="pinned">
            <article className="note">
              <p className="kicker">1 · The basin</p>
              <h2>The Montney wakes up</h2>
              <p>
                Each dot is a well that has reported Montney gas to the BC Energy Regulator, lit in the month it first produced.
                In {FIRST_YEAR + 1} the formation supplied {facts.shareThen}% of the province's gas. Today it supplies {facts.shareNow}%.
              </p>
              <div className="stats">
                <Stat value={String(Math.floor(hud.year + 1e-6))} label="Year" />
                <Stat value={wellsNow.toLocaleString()} label="Montney wells so far" />
                <Stat value={fmt(data.prod.montney[pi], 1)} unit="Bcf/d" label="Montney gas" />
              </div>
              <ProductionChart data={data} year={hud.year} />
            </article>
          </div>
        ))}

        {section('ngtl', (
          <div className="pinned">
            <article className="note">
              <p className="kicker">2 · The gathering system</p>
              <h2>One direction: south and east</h2>
              <p>
                For decades, gas leaving this corner of the province has been gathered into the NGTL System and carried toward Alberta, eastern Canada and the United States.
                Until {facts.firstMonth}, Canada had no large terminal for sending it overseas.
              </p>
              <p>The dashed line running west is the way out to the Pacific.</p>
              <p className="fine">NGTL routes are schematic, drawn by hand from public maps.</p>
            </article>
          </div>
        ))}

        {section('route', (
          <>
            <Passing at={0.03}>
              <p className="kicker">3 · The pipeline</p>
              <h2>Coastal GasLink</h2>
              <p>
                A buried pipeline 48 inches across starts here, west of Dawson Creek, {data.elev[0].toLocaleString()} m above the sea it is heading for.
                Its operator, TC Energy, puts its first-phase capacity at about 2.1 billion cubic feet a day.
              </p>
              <p className="fine">Keep scrolling to fly the route. The land is drawn {EXAGGERATION} times taller than life.</p>
            </Passing>
            <Passing at={routeT(facts.rockies.km - 22, total)}>
              <h2>Over the Rockies</h2>
              <p>
                The first range arrives early. The route threads the northern Rockies and tops out at {facts.rockies.m.toLocaleString()} m.
              </p>
            </Passing>
            <Passing at={routeT(285, total)}>
              <h2>The Interior Plateau</h2>
              <p>
                Then about {facts.plateau.span} km of rolling forest, lakes and ranch land, between {facts.plateau.min.toLocaleString()} and {facts.plateau.max.toLocaleString()} m.
                The line passes within {facts.vanderhoof} km of Vanderhoof and {facts.burnsLake} km of Burns Lake.
              </p>
            </Passing>
            <Passing at={routeT(data.summit.km - 28, total)}>
              <h2>The last wall</h2>
              <p>
                The highest point of the whole route comes almost at the end: {data.summit.m.toLocaleString()} m, in the Coast Mountains, just {fmt(total - data.summit.km, 0)} km from the terminal.
              </p>
            </Passing>
            <Passing at={routeT(total - 9, total)}>
              <h2>Down to tidewater</h2>
              <p>
                From that pass the pipeline drops {facts.drop.toLocaleString()} m to sea level at Kitimat. The ocean is in sight.
              </p>
            </Passing>
          </>
        ))}

        {section('kitimat', (
          <div className="pinned">
            <article className="note">
              <p className="kicker">4 · The terminal</p>
              <h2>Gas becomes liquid</h2>
              <p>
                At LNG Canada the gas is chilled to about −162 °C. It condenses into a liquid roughly one six-hundredth of its volume, which is what makes it worth carrying across an ocean.
              </p>
              <p>
                The terminal sits at the head of Douglas Channel, a fjord deep enough for tankers nearly 300 m long. The first recorded shipment left in {facts.firstMonth}.
              </p>
            </article>
          </div>
        ))}

        {section('pacific', (
          <div className="pinned">
            <article className="note">
              <p className="kicker">5 · The water</p>
              <h2>Across the Pacific</h2>
              <p>
                The Canada Energy Regulator has recorded {data.cargoes.length} shipments from Kitimat on {data.vessels} vessels, to {data.destinations.length} countries.
                Scroll to send them on their way.
              </p>
              <div className="stats">
                <Stat value={hud.month < 0 ? '—' : monthLabel(data.months[Math.min(data.months.length - 1, hud.month)])} label={hud.month >= data.months.length ? 'Latest month on record' : 'Month'} />
                <Stat value={`${hud.departed}`} unit={`of ${data.cargoes.length}`} label={`Shipments sent, ${atSea} at sea`} />
                <Stat value={fmt(shippedBcm, 1)} unit="billion m³" label="Gas shipped" />
              </div>
              <ExportsChart data={data} shown={monthsShown} />
              <ol className="log" aria-label="Latest departures">
                {departed.slice(-3).reverse().map((c, k) => (
                  <li key={`${hud.departed - k}`}>
                    <b>{c.vessel}</b>
                    <span>to {data.destinations[c.dest].name} · {monthLabel(data.months[c.month])} · {fmt(c.vol / 1000, 0)} million m³</span>
                  </li>
                ))}
              </ol>
              <p className="fine">Ship tracks are illustrative. The regulator publishes the destination country and the month, not the port, the route or the sailing date.</p>
            </article>
          </div>
        ))}

        {section('outro', (
          <div className="outro-block">
            <h2>From a well in the Montney to a harbour in Asia</h2>
            <p className="lede">
              Busiest month so far: {facts.peak.bcfd} Bcf/d left Kitimat in {facts.peak.month}{facts.peak.share != null && `, equal to about ${facts.peak.share}% of British Columbia's raw gas production that month`}.
            </p>
            <div className="actions">
              <a className="begin" href="#">Explore the live network map</a>
              <button className="ghost" onClick={() => goto(0)}>Back to the start</button>
            </div>
            <div className="sources">
              <p>
                <b>Sources.</b> Production and well locations: BC Energy Regulator, to {monthLabel(data.prod.label[data.prod.label.length - 1])}.
                LNG shipments: Canada Energy Regulator, to {monthLabel(data.months[data.months.length - 1])} (Open Government Licence, Canada).
                Pipeline route: OpenStreetMap contributors (ODbL). Elevation: Copernicus DEM through Open-Meteo, and Mapzen Terrain Tiles.
                Imagery: Sentinel-2 cloudless by EOX (CC BY 4.0). Data fetched {fmtDate(new Date(data.fetched.lng))}.
              </p>
              <p>
                <b>Limits.</b> The route is {fmt(total, 0)} km as mapped by volunteers; the operator quotes 670 km. Terrain is exaggerated {EXAGGERATION} times.
                Production is raw gas, and the latest months may still be revised. Ship tracks, NGTL routes and the timing of sailings within a month are illustrative.
                Pipeline size and capacity, and the liquefaction figures, are as publicly reported by the operators.
              </p>
              <p>An independent demonstration. Not affiliated with or endorsed by TC Energy or LNG Canada.</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A card that scrolls past at a fixed point in a chapter (0 = chapter start, 1 = chapter end). */
function Passing({ at, children }: { at: number; children: ReactNode }) {
  return <article className="note passing" style={{ top: `${at * 100}%` }}>{children}</article>
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}{unit && <small> {unit}</small>}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function Readout({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="readout">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{unit}</div>
    </div>
  )
}

/** Wells are sorted by first production date, so count with a binary search. */
function countUpTo(wells: [number, number, number][], year: number) {
  let lo = 0, hi = wells.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (wells[mid][2] <= year) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Numbers quoted in the text, worked out from the data so the words cannot drift from the charts. */
function deriveFacts(d: StoryData) {
  const share = (from: number, to: number) => {
    let a = 0, b = 0
    for (let i = from; i < to; i++) { a += d.prod.montney[i]; b += d.prod.montney[i] + d.prod.other[i] }
    return Math.round((a / b) * 100)
  }
  const n = d.prod.year.length
  const then = d.prod.year.findIndex((y) => y >= FIRST_YEAR + 1)
  const slice = (fromKm: number, toKm: number) => d.elev.slice(Math.round(fromKm / d.stepKm), Math.round(toKm / d.stepKm))

  const rockies = slice(30, 170)
  const rockiesMax = Math.max(...rockies)
  const plateau = slice(170, 430)
  /** Closest the route comes to a town, in km. */
  const closest = (name: string) => {
    const at = TOWNS.find((t) => t.name === name)!.at
    let best = Infinity
    for (let k = 0; k <= d.route.length; k++) best = Math.min(best, distance(d.route.point(k), at))
    return Math.round(best)
  }

  // Peak export month against that month's provincial production, both in Bcf/d.
  const monthly = d.months.map((_, k) => d.exports.reduce((a, e) => a + e[k], 0))
  const top = monthly.indexOf(Math.max(...monthly))
  const pi = d.prod.label.indexOf(d.months[top])
  const produced = pi >= 0 ? d.prod.montney[pi] + d.prod.other[pi] : null

  return {
    shareThen: share(then, then + 12),
    shareNow: share(n - 12, n),
    rockies: { m: rockiesMax, km: 30 + rockies.indexOf(rockiesMax) * d.stepKm },
    plateau: { min: Math.min(...plateau), max: Math.max(...plateau), span: 260 },
    vanderhoof: closest('Vanderhoof'),
    burnsLake: closest('Burns Lake'),
    drop: d.summit.m - d.elev[d.elev.length - 1],
    firstMonth: new Date(`${d.months[0]}-01T00:00:00Z`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    peak: { bcfd: monthly[top].toFixed(1), month: monthLabel(d.months[top]), share: produced ? Math.round((monthly[top] / produced) * 100) : null },
  }
}
