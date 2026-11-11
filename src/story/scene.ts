import { type ExpressionSpecification, type GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Pt } from '../lib/data'
import '../lib/mapWorker'
import type { StoryData } from './data'
import { clamp } from './geo'

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
// Open elevation tiles (Mapzen "terrarium" encoding, hosted on AWS Open Data).
const TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
// Sentinel-2 cloudless 2016 by EOX, CC BY 4.0.
const SATELLITE = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'
export const MAP_CREDITS =
  'Basemap © CARTO, © OpenStreetMap contributors. Terrain: Mapzen Terrain Tiles (AWS Open Data). Imagery: Sentinel-2 cloudless by EOX (contains modified Copernicus Sentinel data 2016), CC BY 4.0. Pipeline route © OpenStreetMap contributors (ODbL).'
/** The land is drawn this many times taller than it is, so relief reads from the air. */
export const EXAGGERATION = 1.5

/** How long a ship takes to cross, in months of story time. */
export const VOYAGE = 1.15
/** Flow pulses trail this far behind the head of the gas, in km. */
const PULSE_WINDOW = 150
const PULSES = 12

export type Frame = {
  center: Pt
  zoom: number
  pitch: number
  bearing: number
  /** Screen padding in pixels: keeps the subject clear of the text card and the bottom panel. */
  padLeft: number
  padBottom: number
  /** Layer strengths, 0 to 1. */
  sat: number
  wells: number
  ngtl: number
  route: number
  lanes: number
  /** Wells are shown once their first production date is at or before this decimal year. */
  year: number
  /** How far the gas has travelled along the pipeline, km. */
  km: number
  /** Position in the export record, in months from the first shipment. */
  month: number
}

type Label = { marker: Marker; el: HTMLElement; group: 'route' | 'lanes' }

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features })
const line = (path: Pt[], properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: path } })
const point = (at: Pt, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: at } })

/** The 3D map behind the story. It knows how to draw one frame and nothing about scrolling. */
export class Scene {
  readonly map: MlMap
  private data: StoryData
  private ready = false
  private last: Partial<Frame> & { yearStep?: number } = {}
  private labels: Label[] = []
  private still: boolean

  constructor(container: HTMLElement, data: StoryData, first: Frame, onReady: () => void) {
    this.data = data
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches
    this.map = new MlMap({
      container,
      style: BASEMAP,
      center: first.center,
      zoom: first.zoom,
      pitch: first.pitch,
      bearing: first.bearing,
      maxPitch: 80,
      interactive: false,
      // The map's own credits bar opens by itself and covers the read-outs. The story shows the same
      // credits behind its own button (see MAP_CREDITS) and again on the closing screen.
      attributionControl: false,
    })
    this.map.on('style.load', () => {
      this.build()
      this.ready = true
      onReady()
    })
  }

  private build() {
    const m = this.map
    const d = this.data
    m.setProjection({ type: 'globe' })

    m.addSource('dem', { type: 'raster-dem', tiles: [TERRAIN], encoding: 'terrarium', tileSize: 256, maxzoom: 12 })
    m.addSource('dem-shade', { type: 'raster-dem', tiles: [TERRAIN], encoding: 'terrarium', tileSize: 256, maxzoom: 12 })
    m.addSource('sat', { type: 'raster', tiles: [SATELLITE], tileSize: 256, maxzoom: 13 })
    m.setTerrain({ source: 'dem', exaggeration: EXAGGERATION })
    m.setSky({
      'sky-color': '#071226',
      'horizon-color': '#35557a',
      'fog-color': '#0b1524',
      'sky-horizon-blend': 0.7,
      'horizon-fog-blend': 0.8,
      'fog-ground-blend': 0.55,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 5, 0.5, 8, 0],
    })

    // Relief and imagery sit under the basemap's borders and labels.
    const under = m.getLayer('boundary_country_outline') ? 'boundary_country_outline' : undefined
    m.addLayer({ id: 'shade', type: 'hillshade', source: 'dem-shade', paint: { 'hillshade-exaggeration': 0.55, 'hillshade-shadow-color': '#000309', 'hillshade-highlight-color': '#5f7ea6', 'hillshade-accent-color': '#0a1626' } }, under)
    m.addLayer({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-opacity': 0, 'raster-brightness-max': 0.76, 'raster-saturation': -0.2, 'raster-contrast': 0.12, 'raster-fade-duration': 0 } }, under)

    m.addSource('ngtl', { type: 'geojson', data: fc(d.ngtl.map((p) => line(p))) })
    m.addLayer({ id: 'ngtl-glow', type: 'line', source: 'ngtl', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3987e5', 'line-width': 9, 'line-blur': 8, 'line-opacity': 0 } })
    m.addLayer({ id: 'ngtl', type: 'line', source: 'ngtl', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#9ec5f4', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.8, 8, 3], 'line-opacity': 0 } })

    m.addSource('wells', { type: 'geojson', data: fc(d.wells.map((w) => point([w[0], w[1]], { y: w[2] }))) })
    m.addLayer({ id: 'wells-glow', type: 'circle', source: 'wells', filter: ['<=', ['get', 'y'], 0], paint: { 'circle-color': '#3987e5', 'circle-blur': 1, 'circle-opacity': 0, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 8, 9, 11, 10] } })
    m.addLayer({ id: 'wells', type: 'circle', source: 'wells', filter: ['<=', ['get', 'y'], 0], paint: { 'circle-color': '#cde2fb', 'circle-opacity': 0, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 8, 1.7, 11, 3] } })

    m.addSource('route', { type: 'geojson', lineMetrics: true, data: line(d.route.path) })
    m.addLayer({ id: 'route-rest', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#eaf3ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 1.5], 'line-dasharray': [2, 2.5], 'line-opacity': 0 } })
    m.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 6, 11, 22], 'line-blur': ['interpolate', ['linear'], ['zoom'], 4, 5, 11, 16], 'line-opacity': 0, 'line-gradient': this.gradient(0, '#3987e5') } })
    m.addLayer({ id: 'route-core', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.6, 11, 4.5], 'line-opacity': 0, 'line-gradient': this.gradient(0, '#eaf3ff') } })

    m.addSource('pulses', { type: 'geojson', data: fc([]) })
    m.addLayer({ id: 'pulses', type: 'circle', source: 'pulses', paint: { 'circle-color': '#ffffff', 'circle-blur': 0.6, 'circle-opacity': ['get', 'a'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 11, 7] } })
    m.addSource('head', { type: 'geojson', data: fc([]) })
    m.addLayer({ id: 'head-halo', type: 'circle', source: 'head', paint: { 'circle-color': '#6da7ec', 'circle-blur': 1, 'circle-opacity': 0.75, 'circle-radius': ['get', 'r'] } })
    m.addLayer({ id: 'head', type: 'circle', source: 'head', paint: { 'circle-color': '#ffffff', 'circle-radius': 4.5, 'circle-stroke-color': '#3987e5', 'circle-stroke-width': 2 } })

    m.addSource('lanes', { type: 'geojson', data: fc(d.destinations.map((x) => line(x.lane.path, { vol: x.vol }))) })
    const top = Math.max(...d.destinations.map((x) => x.vol))
    m.addLayer({ id: 'lanes-glow', type: 'line', source: 'lanes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3987e5', 'line-width': ['interpolate', ['linear'], ['get', 'vol'], 0, 4, top, 14], 'line-blur': 7, 'line-opacity': 0 } })
    m.addLayer({ id: 'lanes', type: 'line', source: 'lanes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#cde2fb', 'line-width': ['interpolate', ['linear'], ['get', 'vol'], 0, 0.8, top, 2.6], 'line-opacity': 0 } })
    m.addSource('ships', { type: 'geojson', data: fc([]) })
    m.addLayer({ id: 'ships-glow', type: 'circle', source: 'ships', paint: { 'circle-color': '#6da7ec', 'circle-blur': 1, 'circle-opacity': 0.8, 'circle-radius': ['*', 3, ['get', 'r']] } })
    m.addLayer({ id: 'ships', type: 'circle', source: 'ships', paint: { 'circle-color': '#ffffff', 'circle-radius': ['get', 'r'] } })

    const start = d.route.path[0], end = d.route.path[d.route.path.length - 1]
    this.label(start, 'Start of Coastal GasLink', `${d.elev[0].toLocaleString()} m`, 'route')
    this.label(d.route.point(d.summit.km), 'Highest point', `${d.summit.m.toLocaleString()} m`, 'route')
    this.label(end, 'Kitimat', 'LNG Canada terminal', 'route')
    for (const x of d.destinations) this.label(x.port, x.name, '', 'lanes')
  }

  private label(at: Pt, title: string, note: string, group: Label['group']) {
    const el = document.createElement('div')
    el.className = `story-pin ${group}`
    const b = el.appendChild(document.createElement('b'))
    b.textContent = title
    if (note) el.appendChild(document.createElement('span')).textContent = note
    const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat(at).addTo(this.map)
    this.labels.push({ marker, el, group })
  }

  /** Paints the line up to a fraction of its length and leaves the rest clear. */
  private gradient(done: number, color: string): ExpressionSpecification {
    const p = clamp(done, 0.0005, 0.9995)
    return ['step', ['line-progress'], color, p, 'rgba(0,0,0,0)']
  }

  draw(f: Frame, now: number) {
    if (!this.ready) return
    const m = this.map
    const d = this.data
    const was = this.last
    const changed = (k: keyof Frame, eps = 0.002) => was[k] == null || Math.abs((was[k] as number) - (f[k] as number)) > eps

    m.jumpTo({ center: f.center, zoom: f.zoom, pitch: f.pitch, bearing: f.bearing, padding: { left: f.padLeft, bottom: f.padBottom, top: 0, right: 0 } })

    if (changed('sat')) m.setPaintProperty('sat', 'raster-opacity', f.sat)
    if (changed('ngtl')) {
      m.setPaintProperty('ngtl', 'line-opacity', 0.9 * f.ngtl)
      m.setPaintProperty('ngtl-glow', 'line-opacity', 0.5 * f.ngtl)
    }
    if (changed('wells')) {
      m.setPaintProperty('wells', 'circle-opacity', 0.95 * f.wells)
      m.setPaintProperty('wells-glow', 'circle-opacity', 0.22 * f.wells)
    }
    // Re-filtering thousands of points is not free, so the well layer moves in monthly steps.
    const yearStep = Math.round(f.year * 12)
    if (was.yearStep !== yearStep) {
      was.yearStep = yearStep
      m.setFilter('wells', ['<=', ['get', 'y'], yearStep / 12])
      m.setFilter('wells-glow', ['<=', ['get', 'y'], yearStep / 12])
    }
    if (changed('route')) {
      m.setPaintProperty('route-rest', 'line-opacity', 0.8 * f.route)
      m.setPaintProperty('route-glow', 'line-opacity', 0.75 * f.route)
      m.setPaintProperty('route-core', 'line-opacity', f.route)
    }
    if (changed('km', 0.02)) {
      const done = d.route.progress(f.km)
      m.setPaintProperty('route-glow', 'line-gradient', this.gradient(done, '#3987e5'))
      m.setPaintProperty('route-core', 'line-gradient', this.gradient(done, '#eaf3ff'))
    }
    if (changed('lanes')) {
      m.setPaintProperty('lanes', 'line-opacity', 0.7 * f.lanes)
      m.setPaintProperty('lanes-glow', 'line-opacity', 0.3 * f.lanes)
    }

    // The head of the gas and the pulses behind it move on the clock, so they are redrawn every frame.
    const flowing = f.route > 0.05 && f.km > 0.2
    const t = this.still ? 0 : now / 1000
    const head: GeoJSON.Feature[] = [], pulses: GeoJSON.Feature[] = []
    if (flowing) {
      head.push(point(d.route.point(f.km), { r: 13 + 4 * Math.sin(t * 3) }))
      const window = Math.min(PULSE_WINDOW, f.km)
      for (let k = 0; k < PULSES; k++) {
        const along = ((k / PULSES + t * 0.22) % 1) * window
        pulses.push(point(d.route.point(f.km - window + along), { a: 0.15 + 0.75 * (along / window) }))
      }
    }
    ;(m.getSource('head') as GeoJSONSource).setData(fc(head))
    ;(m.getSource('pulses') as GeoJSONSource).setData(fc(pulses))

    const ships: GeoJSON.Feature[] = []
    if (f.lanes > 0.05) {
      for (const c of d.cargoes) {
        const p = (f.month - c.depart) / VOYAGE
        if (p <= 0 || p >= 1) continue
        const lane = d.destinations[c.dest].lane
        ships.push(point(lane.point(p * lane.length), { r: 2.2 + c.vol / 60000 }))
      }
    }
    ;(m.getSource('ships') as GeoJSONSource).setData(fc(ships))

    const zoomedIn = f.zoom > 5.2
    for (const l of this.labels) {
      const on = l.group === 'route' ? f.route > 0.6 && zoomedIn : f.lanes > 0.6
      l.el.classList.toggle('on', on)
    }
    this.last = { ...f, yearStep }
  }

  destroy() {
    for (const l of this.labels) l.marker.remove()
    this.map.remove()
  }
}
