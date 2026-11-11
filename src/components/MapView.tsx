import { TripsLayer } from '@deck.gl/geo-layers'
import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { Map as MlMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef } from 'react'
import { type Dataset, type Fire, type Hotspot, type KeyPoint, type Pt, bcf, dominant, fmt, network, shortName, utilization } from '../lib/data'
import { film } from '../lib/film'
import '../lib/mapWorker'
import { utilColor } from '../lib/theme'

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
/** Seconds between successive flow pulses on a route. */
const SPACING = 0.7

type Props = {
  data: Dataset
  day: number
  year: number
  selected: string
  showFires: boolean
  onSelect: (keyPointId: string) => void
}

type Corridor = {
  kp: KeyPoint
  path: Pt[]
  color: [number, number, number]
  width: number
  bcf: number
  util: number | null
  direction: string
  trade: string
}
type Trip = { corridor: Corridor; path: Pt[]; timestamps: number[] }

function tripsFor(c: Corridor): Trip[] {
  // Pulse travel time grows with route length but is clamped so short stubs still animate.
  const lens = [0]
  for (let i = 1; i < c.path.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(c.path[i][0] - c.path[i - 1][0], c.path[i][1] - c.path[i - 1][1]))
  }
  const total = lens[lens.length - 1] || 1
  const duration = Math.max(1.4, Math.min(7, total / 3))
  const base = lens.map((l) => (l / total) * duration)
  const trips: Trip[] = []
  for (let k = 0; k <= Math.ceil(duration / SPACING); k++) {
    trips.push({ corridor: c, path: c.path, timestamps: base.map((t) => t - k * SPACING) })
  }
  return trips
}

function corridorsAt(data: Dataset, day: number): Corridor[] {
  const out: Corridor[] = []
  for (const kp of data.keyPoints) {
    const s = dominant(kp, day)
    if (!s || !kp.corridor) continue
    const volume = bcf(s.thr[day]) ?? 0
    if (volume <= 0) continue
    const util = utilization(s, day)
    out.push({
      kp,
      path: s.direction === kp.corridorDir ? kp.corridor : [...kp.corridor].reverse(),
      color: utilColor(util),
      width: 2 + 3.2 * Math.sqrt(volume),
      bcf: volume,
      util,
      direction: s.direction,
      trade: s.trade,
    })
  }
  return out
}

const pct = (u: number | null) => (u == null ? 'capacity not reported' : `${Math.round(u * 100)}% of capacity`)

export function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null)
  const overlay = useRef<MapboxOverlay | null>(null)
  const map = useRef<MlMap | null>(null)
  const latest = useRef(props)
  latest.current = props

  const { data, day, year, showFires } = props

  const backdrop = useMemo(() => {
    const canada = network.systems.flatMap((s) => s.paths.map((path) => ({ path, name: s.name, note: 'schematic route' })))
    const us = (data.us?.features ?? []).flatMap((f) => f.paths.map((path) => ({ path, name: f.name, note: `${f.share}, route from EIA` })))
    return { canada, us }
  }, [data.us])

  const corridors = useMemo(() => corridorsAt(data, day), [data, day])
  const trips = useMemo(() => corridors.flatMap(tripsFor), [corridors])
  const fires = useMemo(() => (showFires ? (data.burned?.fires ?? []).filter((f) => f.year === year) : []), [data.burned, year, showFires])
  const firePolys = useMemo(() => fires.flatMap((f) => f.rings.map((ring) => ({ ring, fire: f }))), [fires])
  const frame = useRef({ backdrop, corridors, trips, firePolys })
  frame.current = { backdrop, corridors, trips, firePolys }

  useEffect(() => {
    if (!el.current) return
    const m = new MlMap({
      container: el.current,
      style: BASEMAP,
      center: [-97, 50.5],
      zoom: 3.5,
      minZoom: 2.5,
      maxZoom: 9,
      attributionControl: { compact: true },
      // The film is captured frame by frame, so nothing may fade in on its own clock.
      fadeDuration: film ? 0 : 300,
      canvasContextAttributes: film ? { preserveDrawingBuffer: true } : undefined,
    })
    m.addControl(new NavigationControl({ showCompass: false }), 'top-left')
    const o = new MapboxOverlay({
      interleaved: false,
      layers: [],
      getTooltip: ({ object, layer }) => {
        if (!object || !layer) return null
        let html = ''
        if (layer.id === 'points' || layer.id === 'corridors') {
          const c: Corridor = object
          html = `<b>${c.kp.name}</b><br>${c.kp.system}<br>${fmt(c.bcf)} Bcf/d ${c.direction} (${c.trade})<br>${pct(c.util)}`
        } else if (layer.id === 'us' || layer.id === 'canada') {
          html = `<b>${object.name}</b><br>${object.note}`
        } else if (layer.id === 'burned') {
          const f: Fire = object.fire
          html = `<b>${f.year} fire, ${f.ha.toLocaleString()} ha</b><br>${f.cause ?? 'cause not recorded'}${f.km != null ? `<br>about ${f.km} km from ${f.asset}` : ''}`
        } else if (layer.id === 'hotspots') {
          const h: Hotspot = object
          html = `<b>Satellite hotspot</b><br>${h.t.replace('T', ' ').slice(0, 16)} UTC${h.km != null ? `<br>about ${h.km} km from ${h.asset}` : ''}`
        }
        return html ? { html, className: 'map-tip' } : null
      },
    })
    m.addControl(o)
    map.current = m
    if (film) film.map = m
    overlay.current = o

    let raf = 0
    const tick = (now: number) => {
      const p = latest.current
      const f = frame.current
      const zoom = m.getZoom()
      const layers = [
        new PathLayer({ id: 'us', data: f.backdrop.us, getPath: (d) => d.path, getColor: [120, 150, 180, 150], getWidth: 1.2, widthUnits: 'pixels', pickable: true }),
        new PathLayer({ id: 'canada', data: f.backdrop.canada, getPath: (d) => d.path, getColor: [150, 170, 195, 90], getWidth: 1.4, widthUnits: 'pixels', pickable: true }),
        p.showFires &&
          new PolygonLayer({
            id: 'burned',
            data: f.firePolys,
            getPolygon: (d) => d.ring,
            getFillColor: [217, 89, 38, 70],
            getLineColor: [217, 89, 38, 200],
            getLineWidth: 1,
            lineWidthUnits: 'pixels',
            pickable: true,
          }),
        new PathLayer<Corridor>({
          id: 'corridors',
          data: f.corridors,
          getPath: (d) => d.path,
          getColor: (d) => [...d.color, 150],
          getWidth: (d) => d.width,
          widthUnits: 'pixels',
          capRounded: true,
          jointRounded: true,
          pickable: true,
          onClick: ({ object }) => object && latest.current.onSelect(object.kp.id),
        }),
        new TripsLayer<Trip>({
          id: 'pulses',
          data: f.trips,
          getPath: (d) => d.path,
          getTimestamps: (d) => d.timestamps,
          getColor: [240, 246, 255],
          getWidth: (d) => Math.max(2.2, d.corridor.width * 0.45),
          widthUnits: 'pixels',
          capRounded: true,
          jointRounded: true,
          fadeTrail: true,
          trailLength: 0.45,
          currentTime: ((film ? film.clock : now) / 1000) % SPACING,
          opacity: 0.85,
        }),
        p.showFires &&
          new ScatterplotLayer<Hotspot>({
            id: 'hotspots',
            data: p.data.hotspots?.points ?? [],
            getPosition: (d) => [d.lon, d.lat],
            getRadius: 3,
            radiusUnits: 'pixels',
            getFillColor: (d) => (d.km != null && d.km <= 25 ? [230, 103, 103, 255] : [230, 103, 103, 120]),
            pickable: true,
          }),
        new ScatterplotLayer<Corridor>({
          id: 'points',
          data: f.corridors,
          getPosition: (d) => [d.kp.lon, d.kp.lat],
          getRadius: (d) => (d.kp.id === p.selected ? 8 : 5),
          radiusUnits: 'pixels',
          getFillColor: [26, 26, 25],
          getLineColor: (d) => (d.kp.id === p.selected ? [255, 255, 255] : d.color),
          getLineWidth: (d) => (d.kp.id === p.selected ? 3 : 2),
          lineWidthUnits: 'pixels',
          stroked: true,
          pickable: true,
          onClick: ({ object }) => object && latest.current.onSelect(object.kp.id),
          updateTriggers: { getRadius: p.selected, getLineColor: p.selected, getLineWidth: p.selected },
        }),
        new TextLayer<Corridor>({
          id: 'labels',
          // The film labels only the selected point, and nothing in its full-screen shots.
          data: film?.bare ? [] : f.corridors.filter((c) => (zoom >= 5.2 && !film) || c.kp.id === p.selected),
          getPosition: (d) => [d.kp.lon, d.kp.lat],
          getText: (d) => shortName(d.kp.name),
          getSize: 12,
          getColor: [240, 239, 236],
          getPixelOffset: [0, -26],
          fontFamily: 'system-ui, "Segoe UI", sans-serif',
          fontSettings: { sdf: true },
          outlineWidth: 3,
          outlineColor: [13, 13, 13, 230],
        }),
      ]
      o.setProps({ layers })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      m.remove()
    }
  }, [])

  return <div ref={el} className="map" />
}
