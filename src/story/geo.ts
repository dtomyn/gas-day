import type { Pt } from '../lib/data'

const R = 6371
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (t: number) => {
  const x = clamp(t)
  return x * x * (3 - 2 * x)
}
/** Interpolates an angle in degrees the short way round. */
export const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t

export function km(a: Pt, b: Pt) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function bearing(a: Pt, b: Pt) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** A line with distances along it, so a position can be asked for by distance. */
export class Track {
  readonly path: Pt[]
  readonly at: number[]
  readonly length: number
  /** Distance along the line as the map measures it: on the flat Web Mercator plane, not on the ground. */
  private flat: number[]

  constructor(path: Pt[]) {
    this.path = path
    this.at = [0]
    this.flat = [0]
    const y = (lat: number) => deg(Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2)))
    for (let i = 1; i < path.length; i++) {
      this.at.push(this.at[i - 1] + km(path[i - 1], path[i]))
      this.flat.push(this.flat[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], y(path[i][1]) - y(path[i - 1][1])))
    }
    this.length = this.at[this.at.length - 1]
  }

  private segment(x: number) {
    let lo = 0, hi = this.at.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.at[mid] <= x) lo = mid
      else hi = mid
    }
    return { lo, hi, f: (x - this.at[lo]) / (this.at[hi] - this.at[lo] || 1) }
  }

  /**
   * The share of the drawn line that lies behind distance d. The map's own measure of progress along
   * a line is in Mercator units, which stretch with latitude, so it is not simply d / length.
   */
  progress(d: number) {
    const { lo, hi, f } = this.segment(clamp(d, 0, this.length))
    return (this.flat[lo] + (this.flat[hi] - this.flat[lo]) * f) / this.flat[this.flat.length - 1]
  }

  point(d: number): Pt {
    const { lo, hi, f } = this.segment(clamp(d, 0, this.length))
    const a = this.path[lo], b = this.path[hi]
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  }

  /** Direction of travel, measured over a long window so the camera does not twitch on small bends. */
  heading(d: number, back = 10, ahead = 30) {
    return bearing(this.point(d - back), this.point(d + ahead))
  }
}

/**
 * Points along the great circle from a to b. Longitudes continue past the antimeridian instead of
 * jumping by 360, so the line can be drawn in one piece.
 */
export function greatCircle(a: Pt, b: Pt, stepKm = 150): Pt[] {
  const [l1, p1, l2, p2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2))
  const n = Math.max(1, Math.ceil((d * R) / stepKm))
  const out: Pt[] = []
  let prev = a[0]
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2)
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2)
    const z = A * Math.sin(p1) + B * Math.sin(p2)
    let lon = deg(Math.atan2(y, x))
    while (lon - prev > 180) lon -= 360
    while (lon - prev < -180) lon += 360
    prev = lon
    out.push([lon, deg(Math.atan2(z, Math.hypot(x, y)))])
  }
  return out
}

/** Joins waypoints with great-circle legs. */
export function seaLane(waypoints: Pt[]): Pt[] {
  const out: Pt[] = [waypoints[0]]
  for (let i = 1; i < waypoints.length; i++) {
    const from = out[out.length - 1]
    // Carry the unwrapped longitude forward so each leg starts where the last one ended.
    let to = waypoints[i]
    while (to[0] - from[0] > 180) to = [to[0] - 360, to[1]]
    while (to[0] - from[0] < -180) to = [to[0] + 360, to[1]]
    out.push(...greatCircle(from, to).slice(1))
  }
  return out
}
