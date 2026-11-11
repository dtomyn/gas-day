import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// MapLibre locates its worker relative to its own file, which bundlers cannot follow. Hand it a bundled copy.
setWorkerUrl(workerUrl)
