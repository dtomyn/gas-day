# 03. Time travel

## Intent

Make any gas day since 1 January 2006 one drag or one click away, and make the whole page (map, headline numbers and charts) follow the chosen day.

## Why

The point of the project is change over time. One shared date keeps every view telling the same story, so the viewer never has to wonder which day a chart is showing.

## What it must do

- Open on the latest gas day in the data.
- Offer a slider covering every day in the data, with the first year, the selected date and the last year labelled.
- Offer a play button that runs forward a week at a time, stops at the latest day, and restarts from 2006 if pressed at the end.
- Stop playing as soon as the viewer drags the slider or picks a preset.
- Offer presets that jump to days worth seeing:

  | Preset | Gas day |
  |---|---|
  | Latest | the last day in the data |
  | Jan 2024 cold snap | 2024-01-13 |
  | Summer 2023 wildfires | 2023-06-10 |
  | Feb 2021 winter storm | 2021-02-15 |

- Drive everything from the one selected day: the map, the headline numbers, the marker on the trend and export charts, the year of the seasonal chart, the window of the heatmap and weather chart, and the year of burned area shown.

## Out of scope

- Comparing two dates side by side.
- Days before 2006.

## Where it lives

- [src/App.tsx](../../src/App.tsx): `PRESETS`, the play timer and the time bar
- [src/lib/data.ts](../../src/lib/data.ts): `dateOf` and `indexOf`, which convert between dates and day numbers
