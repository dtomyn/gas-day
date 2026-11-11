# 06. Wildfire layer

## Intent

Show which large wildfires burned near the network in the selected year, and where satellites are detecting fire right now, as a screening view of exposure.

## Why

Wildfire is the most visible physical risk to pipelines in western and northern Canada, and both the history and the live detections are public. Laying them over the network makes the 2023 season, and today's situation, easy to see.

## What it must do

- Stay off until the viewer switches it on, so the flow story is not cluttered.
- When on, draw two things:
  - **Burned areas** for the year of the selected gas day, as orange shapes.
  - **Satellite hotspots** from the last 24 hours, as red dots. These are always today's, whatever day the slider is on; the legend gives their date.
- Draw hotspots within 25 km of a route more strongly than the rest.
- On hover, give the fire's year, size and cause, or the hotspot's time, and the approximate distance to the nearest route.
- Add a chart of area burned within 50 km of a route by year, with the selected year highlighted.
- Say in the legend how many large fires burned within 50 km that year, or that there is no data for that year.
- Count nearby hotspots in the headline row.

## How distance is worked out

The data pipeline measures each fire outline and each hotspot against points sampled every 3 km or so along the Canadian routes and the US pipelines, and stores the nearest distance and asset name. Anything more than roughly 100 km away is stored without a distance.

## Out of scope

- Fires under 5,000 hectares.
- Fire perimeters for the current season: history goes only as far as Natural Resources Canada has published.
- Engineering distances. Canadian routes are hand-drawn, so every distance to them is an estimate. See [08. Honest limits](08-honest-limits.md).
- Any statement that a fire damaged or threatened a pipeline.

## Where it lives

- [scripts/fetch-data.mjs](../../scripts/fetch-data.mjs): `hotspots`, `burned` and `assetIndex`
- [src/components/MapView.tsx](../../src/components/MapView.tsx): the `burned` and `hotspots` layers
- [src/components/Charts.tsx](../../src/components/Charts.tsx): `FireChart` and `FIRE_RADIUS_KM`
- [src/App.tsx](../../src/App.tsx): the toggle and the legend note
