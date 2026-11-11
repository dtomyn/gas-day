# 05. Charts

## Intent

Give each chart one plain question to answer about the selected key point or the network, and give every chart a table so the numbers can be read without the picture.

## Why

A chart with one job can carry a title that says what it shows and a subtitle that says how to read it. The table view is there for people who cannot use the chart, and for anyone who wants the exact figures.

## The charts

| Chart | Question it answers | How |
|---|---|---|
| Throughput against capacity | How has this point's flow and capacity changed since 2006? | Flow as a 30-day average against stepped capacity, with a marker on the selected day. Scroll to zoom. |
| Seasonal profile | Is this year running above or below the previous five? | The selected year as a 7-day average over the range and average of the five years before it. |
| Flow against cold weather | How strongly does this point respond to heating demand? | One dot per day for the three years to the selected month: heating degree days (below 18 °C) against flow, with the correlation in the subtitle. |
| Area burned near a TC route | How much burned near the network each year? | Hectares in large fires within 50 km, by year. Shown only when the wildfire layer is on. |
| Capacity utilization by key point | Which key points have been running close to full? | Monthly share of capacity for every point over the 24 months to the selected day. |
| Net exports to the United States | How has the cross-border balance shifted by region? | Monthly exports minus imports for five border regions over the full record. |

## What every chart must do

- Follow the selected gas day and, where it has a subject, the selected key point.
- Offer a **Table** button that swaps the chart for its figures.
- Share one look: a dark surface, quiet grid and axes, and colours from the validated palette.
- Say in its subtitle anything the viewer needs to read it correctly (for example, that the heatmap shows values above 100% as 100%, or that below zero means gas is flowing into Canada).
- Step aside if its data is missing: the weather and fire charts are not drawn without their datasets.

## Choices worth knowing

- The weather chart uses the nearest of four cities, picked by the key point's longitude: Calgary, Winnipeg, Toronto or Montréal.
- The five border regions are Kingsgate (BC), Monchy (SK), Emerson (MB), Southern Ontario, and Iroquois and Québec.
- Clicking a heatmap row selects that key point.

## Out of scope

- Exporting charts or data from the page.
- Charts for the US pipelines.

## Where it lives

- [src/components/Charts.tsx](../../src/components/Charts.tsx): the six charts
- [src/components/ChartCard.tsx](../../src/components/ChartCard.tsx): the shared card, look and table view
- [src/lib/data.ts](../../src/lib/data.ts): `rolling`, `pearson`, `cityFor`, `BORDER_REGIONS`
- [src/lib/theme.ts](../../src/lib/theme.ts): the palette
