import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { BorderChart, FIRE_RADIUS_KM, FireChart, SeasonalChart, TrendChart, UtilizationHeatmap, WeatherScatter } from './components/Charts'
import { MapView } from './components/MapView'
import { BCF, type Dataset, bcf, dateOf, dominant, fmt, fmtDate, indexOf, loadAll, netExports, utilization } from './lib/data'
import { film } from './lib/film'
import { SEQ } from './lib/theme'

const PRESETS = [
  { label: 'Latest', iso: null },
  { label: 'Jan 2024 cold snap', iso: '2024-01-13' },
  { label: 'Summer 2023 wildfires', iso: '2023-06-10' },
  { label: 'Feb 2021 winter storm', iso: '2021-02-15' },
]
const SUPPLY_POINT = 'NGTL System|Upstream of James River'

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [day, setDay] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState(SUPPLY_POINT)
  const [showFires, setShowFires] = useState(false)
  // Film mode only: shows the pause icon while the film script drives the clock.
  const [filmPlaying, setFilmPlaying] = useState(false)

  useEffect(() => {
    loadAll()
      .then((d) => {
        setData(d)
        setDay(d.flows.days - 1)
      })
      .catch((e) => setError(String(e.message ?? e)))
  }, [])

  useEffect(() => {
    if (!playing || !data) return
    const last = data.flows.days - 1
    const timer = setInterval(() => setDay((d) => (d + 7 > last ? (setPlaying(false), last) : d + 7)), 120)
    return () => clearInterval(timer)
  }, [playing, data])

  // Film mode: let the film script set the app's state directly and synchronously.
  useEffect(() => {
    if (!film || !data) return
    film.data = data
    film.set = (next) =>
      flushSync(() => {
        if (next.day != null) setDay(next.day)
        if (next.selected != null) setSelected(next.selected)
        if (next.showFires != null) setShowFires(next.showFires)
        if (next.playing != null) setFilmPlaying(next.playing)
      })
  }, [data])

  const kp = useMemo(() => data?.keyPoints.find((k) => k.id === selected) ?? data?.keyPoints[0] ?? null, [data, selected])

  if (error) {
    return (
      <div className="splash">
        <h1>Data not found</h1>
        <p>{error}</p>
        <p>Run <code>npm run data</code> to download the public datasets, then reload.</p>
      </div>
    )
  }
  if (!data || !kp) return <div className="splash"><p>Loading flow data…</p></div>

  const date = dateOf(data.flows, day)
  const year = date.getUTCFullYear()
  // Chart the direction that is flowing today; fall back to the first series when the point is idle.
  const series = dominant(kp, day) ?? kp.series[0]
  const util = utilization(series, day)

  const supply = data.keyPoints.find((k) => k.id === SUPPLY_POINT)
  const supplyNow = supply ? dominant(supply, day) : null
  const tight = data.keyPoints.map((k) => dominant(k, day)).filter((s) => s && (utilization(s, day) ?? 0) >= 0.9).length
  const reporting = data.keyPoints.filter((k) => dominant(k, day)).length
  const nearHotspots = data.hotspots?.points.filter((h) => h.km != null && h.km <= 25).length ?? null
  const fireYears = data.burned ? [...new Set(data.burned.fires.map((f) => f.year))] : []
  const yearFires = data.burned?.fires.filter((f) => f.year === year && f.km != null && f.km <= FIRE_RADIUS_KM).length ?? 0

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Gas Day</h1>
          <p>Natural gas moving through TC Energy's Canadian network, from public regulatory data</p>
        </div>
        <div className="kpis">
          <Kpi label="Gas day" value={fmtDate(date)} />
          <Kpi label="Western supply past James River" value={`${fmt(bcf(supplyNow?.thr[day]), 1)} Bcf/d`} />
          <Kpi label="Net exports to the US" value={`${fmt(netExports(data.flows, null, day) * BCF, 1)} Bcf/d`} />
          <Kpi label="Key points at 90% or more" value={`${tight} of ${reporting}`} />
          {nearHotspots != null && <Kpi label="Hotspots within 25 km, last 24 h" value={String(nearHotspots)} />}
        </div>
      </header>

      <main>
        <div className="map-wrap">
          <MapView data={data} day={day} year={year} selected={kp.id} showFires={showFires} onSelect={setSelected} />

          <div className="legend">
            <div className="legend-title">Share of capacity in use</div>
            <div className="ramp" style={{ background: `linear-gradient(90deg, ${SEQ.join(',')})` }} />
            <div className="ramp-labels"><span>0%</span><span>50%</span><span>100%</span></div>
            <p>Line width shows volume. Pulses show direction. Canadian routes are schematic. US routes are from the EIA.</p>
            <label className="toggle">
              <input type="checkbox" checked={showFires} onChange={(e) => setShowFires(e.target.checked)} />
              Wildfire layer
            </label>
            {showFires && (
              <p className="fire-note">
                <span className="swatch burned" /> Burned in {year}
                {fireYears.includes(year) ? ` (${yearFires} large fires within ${FIRE_RADIUS_KM} km)` : ' (no data for this year)'}
                <br />
                <span className="swatch hotspot" /> Satellite hotspots, last 24 h
                {data.hotspots ? `, as of ${data.hotspots.fetched.slice(0, 10)}` : ' (not loaded)'}
              </p>
            )}
          </div>

          <div className="timebar">
            <button className="play" onClick={() => { if (!playing && day >= data.flows.days - 1) setDay(0); setPlaying(!playing) }} aria-label={playing ? 'Pause' : 'Play'}>
              {playing || filmPlaying ? '❚❚' : '▶'}
            </button>
            <div className="slider">
              <input
                type="range"
                min={0}
                max={data.flows.days - 1}
                value={day}
                onChange={(e) => { setPlaying(false); setDay(+e.target.value) }}
                aria-label="Gas day"
              />
              <div className="ticks">
                <span>{dateOf(data.flows, 0).getUTCFullYear()}</span>
                <span className="now">{fmtDate(date)}</span>
                <span>{dateOf(data.flows, data.flows.days - 1).getUTCFullYear()}</span>
              </div>
            </div>
            <div className="presets">
              {PRESETS.map((p) => (
                <button key={p.label} className="ghost" onClick={() => { setPlaying(false); setDay(p.iso ? indexOf(data.flows, p.iso) : data.flows.days - 1) }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="panel">
          <div className="filter-row">
            <label htmlFor="kp">Key point</label>
            <select id="kp" value={kp.id} onChange={(e) => setSelected(e.target.value)}>
              {[...new Set(data.keyPoints.map((k) => k.system))].map((sys) => (
                <optgroup key={sys} label={sys}>
                  {data.keyPoints.filter((k) => k.system === sys).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="hero">
            <div>
              <div className="hero-value">{fmt(bcf(series.thr[day]))} <small>Bcf/d</small></div>
              <div className="hero-label">{kp.name}, {kp.system}. Flowing {series.direction} ({series.trade}).</div>
            </div>
            <div>
              <div className="hero-value">{util == null ? 'n/a' : `${Math.round(util * 100)}%`}</div>
              <div className="hero-label">of {fmt(bcf(series.cap[day]))} Bcf/d capacity</div>
            </div>
          </div>

          <TrendChart data={data} day={day} series={series} />
          <SeasonalChart data={data} year={year} series={series} />
          <WeatherScatter data={data} day={day} series={series} />
          {showFires && <FireChart data={data} year={year} />}
          <UtilizationHeatmap data={data} day={day} selected={kp.id} onSelect={setSelected} />
          <BorderChart data={data} day={day} />

          <footer>
            Flows: Canada Energy Regulator, to {fmtDate(dateOf(data.flows, data.flows.days - 1))} (Open Government Licence, Canada).
            US routes: US Energy Information Administration. Wildfire: Natural Resources Canada (CWFIS). Weather: Open-Meteo.
            An independent demonstration. Not affiliated with or endorsed by TC Energy.
          </footer>
        </aside>
      </main>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  )
}
