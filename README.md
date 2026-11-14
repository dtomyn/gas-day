# Gas Day

An interactive map of natural gas moving through TC Energy's Canadian pipeline network, built entirely from public data.

Drag the time slider (or press play) to watch 20 years of daily flows. Line width shows volume, colour shows how much of the pipeline's capacity is in use, and moving pulses show direction. Click any key point to see its history, seasonal pattern and sensitivity to cold weather. A wildfire layer overlays burned areas and live satellite hotspots on the network.

It also tells one story in full: **Wellhead to water**, a scroll-driven 3D fly-through that follows gas from the Montney basin, along Coastal GasLink over the Rockies and the Coast Mountains, to LNG Canada at Kitimat and on across the Pacific. Open it from the button in the header, or at `#story`.

> An independent demonstration. Not affiliated with or endorsed by TC Energy.

## What it shows

| View | Question it answers |
|---|---|
| Animated flow map | Where is gas moving today, and how full is each route? |
| Throughput against capacity | How has this point's flow and capacity changed since 2006? |
| Seasonal profile | Is this year running above or below the previous five? |
| Flow against cold weather | How strongly does this point respond to heating demand? |
| Capacity utilization heatmap | Which key points have been running close to full? |
| Net exports to the United States | How has the cross-border balance shifted by region? |
| Wildfire layer | Which large fires burned near the network, and where are today's hotspots? |

And in the story at `#story`:

| View | Question it answers |
|---|---|
| Montney wells lighting up by year | Where did British Columbia's gas boom happen, and when? |
| Production growth | How much of the province's gas now comes from one formation? |
| 3D fly-through of Coastal GasLink | What country does the pipeline cross to reach the coast? |
| Elevation profile | How high does the route climb, and where? |
| Export volumes and ship lanes | How much LNG has left Kitimat, and for which countries? |

## Run it

```bash
npm install
npm run data
npm run dev
```

`npm run data` downloads every dataset into `public/data/`. No API keys are needed. To refresh only some sources, name them: `npm run data -- flows hotspots`. The burned-area history takes several minutes, the Montney production history is a 125 MB download, and the route's elevation profile takes about three minutes because the elevation service is rate-limited. The rest take seconds.

### In a dev container

The repository includes a VS Code dev container (`.devcontainer/`) with Node 22, Python 3.12 and the GitHub CLI. In VS Code, run **Dev Containers: Reopen in Container**. The container runs `npm ci` when it is created, keeps `node_modules` in its own volume, and forwards ports 5173 (dev server) and 4173 (preview). The film renderer drives Microsoft Edge with Direct3D, so it is meant to run on Windows, not in the container.

## Data sources

| Data | Source | Licence |
|---|---|---|
| Daily throughput and capacity at key points (NGTL, Canadian Mainline, Foothills, TQM) | [Canada Energy Regulator](https://open.canada.ca/data/en/dataset/dc343c43-a592-4a27-8ee7-c77df56afb34) | Open Government Licence, Canada |
| US pipeline routes | [US Energy Information Administration, via US DOT](https://geo.dot.gov/server/rest/services/hosted/Natural_Gas_Pipelines_US_EIA/FeatureServer/0) | US public domain |
| Wildfire hotspots (last 24 h) and burned-area polygons | [Natural Resources Canada, CWFIS](https://cwfis.cfs.nrcan.gc.ca/) | Open Government Licence, Canada |
| Daily mean temperature | [Open-Meteo historical archive](https://open-meteo.com/) | CC BY 4.0 |
| Basemap | CARTO, OpenStreetMap contributors | See map credits |
| Story: monthly gas production by well and formation, and well locations | [BC Energy Regulator](https://www.bc-er.ca/data-reports/data-centre/) | See the regulator's data centre |
| Story: LNG export shipments from Kitimat | [Canada Energy Regulator](https://www.cer-rec.gc.ca/open/imports-exports/liquefied-natural-gas-exports-detail.csv) | Open Government Licence, Canada |
| Story: Coastal GasLink route | [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) | ODbL |
| Story: elevation profile | Copernicus DEM GLO-90, via the [Open-Meteo elevation API](https://open-meteo.com/en/docs/elevation-api) | See Open-Meteo's terms |
| Story: 3D terrain | [Mapzen Terrain Tiles on AWS Open Data](https://registry.opendata.aws/terrain-tiles/) | See the registry page |
| Story: satellite imagery | [Sentinel-2 cloudless 2016 by EOX](https://s2maps.eu) (contains modified Copernicus Sentinel data 2016) | CC BY 4.0 |

## Known limits

- **Canadian routes are schematic.** No open line geometry exists for the Canadian systems, so the routes in `src/data/network.json` are hand-drawn from public maps. Key point coordinates and all flow numbers are real. Wildfire distances to Canadian routes are therefore screening estimates, not engineering measurements.
- **Flow data lags.** Companies file throughput with the regulator quarterly, so the latest gas day is usually one to four months old.
- **Wildfire history covers large fires only** (5,000 ha or more), up to the most recent year Natural Resources Canada has published.
- **The US ownership list is editorial.** `US_OPERATORS` in `scripts/fetch-data.mjs` lists the US pipelines treated as TC Energy assets and should be checked against the company's current asset list.
- Liquids pipelines are out of scope: they were spun off into South Bow in 2024.

In the story:

- **The Coastal GasLink route is volunteer-mapped.** It comes from OpenStreetMap and measures 662 km; the operator quotes 670 km. The NGTL lines beside it are the same schematic routes as the main map.
- **Terrain is drawn 1.5 times taller than life**, so relief reads from the air. The elevation chart shows true heights.
- **Ship tracks are illustrative.** The regulator publishes each shipment's destination country and month, not its port, route or sailing date. Lanes end at a representative LNG port, and sailings are spread evenly through their month.
- **Production is raw gas at the wellhead**, and the latest months may still be revised. Formation code 5000 in the regulator's files is treated as the Montney.
- **Coastal GasLink's own throughput is not public**, so the story shows what entered the basin and what left the dock, not what is in the pipe.
- **Pipeline size and capacity, and the liquefaction figures, are the operators' public statements.**
- **Satellite imagery is a 2016 mosaic** stitched from different seasons, so snow cover changes abruptly in places.

## The explainer film

A narrated film of the app, about 2 minutes 40 seconds long, is rendered from the real application one frame at a time, so it can be recreated exactly after any change.

| File | What it is |
|---|---|
| `film/scenes.js` | The film itself: every scene, narration line, camera move and on-screen label |
| `film/render.py` | The renderer: builds the app, voices the narration, captures each frame, generates the music and mixes it |
| `film/storyboard.html` | Storyboard with a real frame for every beat (generated) |
| `film/script.md` | Narration script with timings (generated) |
| `film/gas-day-explainer.mp4` | The finished film, 1080p (generated, not committed) |

```bash
pip install -r film/requirements.txt
```

```bash
python film/render.py
```

`python film/render.py --storyboard` makes only the storyboard, script and captions. `--preview` makes a quick small film, `--only fire` one scene, and `--stills 5,40,95` single frames.

The renderer needs Microsoft Edge and the Kokoro voice files (`kokoro-v1.0.onnx` and `voices-v1.0.bin` from [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx)). Set `KOKORO_DIR` to the folder that holds them. The voice is `af_heart` at 0.97 speed. Each line is voiced once and cached in `film/out/vo`; to use a human voice, save a WAV named after the line in `film/out/vo/recorded`. The picture retimes itself to the narration.

The app has a film mode for this: opened at `#film`, it lets the film script set the date, selection and camera for each frame (`src/lib/film.ts`). In normal use that code does nothing.

## How it is built

- React, TypeScript and Vite
- MapLibre GL for the basemap, deck.gl for the flow layers
- MapLibre's 3D terrain and globe for the story (`src/story/`), loaded only when the story is opened
- Apache ECharts for the charts (every chart has a table view)
- A single Node script (`scripts/fetch-data.mjs`) for the data pipeline
- A GitHub Action (`.github/workflows/deploy.yml`) that refreshes the data daily and publishes to GitHub Pages
