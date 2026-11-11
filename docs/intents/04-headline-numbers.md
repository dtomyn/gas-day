# 04. Headline numbers and key point selection

## Intent

Summarise the selected gas day in a handful of numbers, and let the viewer choose one key point to study in detail.

## Why

A map shows the pattern; a number makes it concrete. The headline row answers "what is happening on this day?" before the viewer reads a single chart, and the selected key point gives the charts a subject.

## What it must do

- Show these numbers across the top, recalculated for the selected day:

  | Number | Meaning |
  |---|---|
  | Gas day | The selected date |
  | Western supply past James River | Flow at the NGTL key point "Upstream of James River", in Bcf/d |
  | Net exports to the US | Exports minus imports across every border point, in Bcf/d |
  | Key points at 90% or more | How many reporting points are using at least 90% of capacity |
  | Hotspots within 25 km, last 24 h | Live count from the wildfire data; hidden if that data is missing |

- Open with "Upstream of James River" selected, because it carries the western supply story.
- Let the viewer select a key point three ways: clicking it on the map, choosing it from a list grouped by pipeline system, or clicking its row in the utilization heatmap.
- For the selected point, show its flow, its direction and trade type, and its share of capacity for the selected day.
- Use the direction carrying the most gas that day; if the point is idle, fall back to its first series.
- Report in billion cubic feet per day (Bcf/d), converted from the regulator's thousand cubic metres per day.
- Show "n/a" where a value is not reported instead of a zero.

## Out of scope

- Choosing units.
- Selecting more than one key point.

## Where it lives

- [src/App.tsx](../../src/App.tsx): the headline row, the key point list and the two large numbers
- [src/lib/data.ts](../../src/lib/data.ts): `dominant`, `utilization`, `netExports`, `bcf`
