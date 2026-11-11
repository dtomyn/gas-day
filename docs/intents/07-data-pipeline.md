# 07. Data pipeline

## Intent

Rebuild every dataset the app uses from its public source with one command, no API keys and no manual steps, and hand the browser files small enough to load quickly.

## Why

Anyone should be able to clone the project and reproduce the data. Keeping the heavy work in one script, run ahead of time, is what lets the app be a static site.

## What it must do

- Run as `npm run data` for everything, or `npm run data -- flows hotspots` for named sources.
- Produce one compact JSON file per source in `public/data/`:

  | Task | Source | Output |
  |---|---|---|
  | `flows` | Canada Energy Regulator throughput and capacity for NGTL, Canadian Mainline, Foothills and TQM | `flows.json` |
  | `pipelines-us` | US Energy Information Administration pipeline routes, via US DOT | `pipelines-us.json` |
  | `hotspots` | Natural Resources Canada (CWFIS) hotspots, last 24 hours | `hotspots.json` |
  | `burned` | Natural Resources Canada burned-area polygons, 2006 onward, 5,000 ha or more | `burned.json` |
  | `weather` | Open-Meteo daily mean temperature for four cities | `weather.json` |

- Line every daily series up on the same calendar, starting 2006-01-01, so the app can look up any day by its position.
- Record the source and the time fetched inside each file.
- Shrink geometry before saving: simplify lines and outlines, round coordinates to three decimal places, and keep only the outer ring of each fire.
- Work out each fire's and hotspot's distance to the nearest route here, not in the browser.
- Fail loudly when a source changes shape (for example a missing column in a regulator file), rather than writing bad data.
- Retry a failed download up to three times, and carry on with the other sources if one fails, exiting with an error so automation notices.
- Run `pipelines-us` before the wildfire tasks, because distance uses the US routes.

## What the app expects in return

Only `flows.json` is required. If it is missing the app says so and tells the viewer to run `npm run data`. Every other file is optional: without it, the matching layer or chart is simply left out.

## Out of scope

- Storing history of the fetched files. Each run overwrites the last.
- Sources that need an account or a key.

## Where it lives

- [scripts/fetch-data.mjs](../../scripts/fetch-data.mjs): the whole pipeline
- [src/lib/data.ts](../../src/lib/data.ts): `loadAll`, and the types that describe each file
- [public/data/](../../public/data/): the fetched files, committed so the site can build without a fetch
