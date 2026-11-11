import type { Map as MlMap } from 'maplibre-gl'
import type { Dataset } from './data'

/**
 * Film mode. Opening the app at #film exposes this object as window.gasDayFilm so the film script
 * (film/scenes.js, driven by film/render.py) can set the app's state and clock one exact frame at a time.
 * In normal use it is null and nothing here runs.
 */
export type Film = {
  /** Film time in ms. Drives the flow pulses instead of the wall clock. */
  clock: number
  map: MlMap | null
  /** True for full-screen shots: hides key point labels. */
  bare: boolean
  data: Dataset | null
  set: (next: { day?: number; selected?: string; showFires?: boolean; playing?: boolean }) => void
}

export const film: Film | null = location.hash === '#film' ? { clock: 0, bare: false, map: null, data: null, set: () => {} } : null

if (film) {
  document.documentElement.classList.add('film')
  ;(window as unknown as { gasDayFilm: Film }).gasDayFilm = film
}
