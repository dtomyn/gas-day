# 01. Product

## Intent

Show how natural gas has moved through TC Energy's Canadian pipeline network over the last 20 years, on a single interactive map, using only data anyone can download.

## Why

The flow data is public but arrives as large regulatory spreadsheets that few people open. Drawn on a map with a time slider, the same numbers show things a table hides: the western corridor more than doubling, the Niagara crossing reversing direction, a cold snap pushing a delivery point to a record.

## What it must do

- Work from public sources only. No API keys, no private feeds, no licensed data.
- Put the map first. The charts explain what the map shows; they do not replace it.
- Stay a static site: a build of HTML, JavaScript and JSON files that any web host can serve, with no server of its own.
- State on the page, in the README and in the film that it is an independent demonstration, not affiliated with or endorsed by TC Energy.
- Credit every data source and its licence where the viewer can see it (the panel footer and the README).

## Out of scope

- Liquids pipelines. They were spun off into South Bow in 2024.
- Forecasts, prices, or anything not in the public record.
- Operational or engineering use. See [08. Honest limits](08-honest-limits.md).

## Where it lives

- [README.md](../../README.md): the public description, sources and limits
- [src/App.tsx](../../src/App.tsx): the page layout, the disclaimer and the source credits
