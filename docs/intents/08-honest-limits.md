# 08. Honest limits

## Intent

Tell the viewer plainly what on the page is exact, what is approximate, and what is a judgement call, at the place where they would otherwise be misled.

## Why

The map looks authoritative. Some of it is: the flow numbers and key point locations come straight from the regulator. Some of it is not: the Canadian routes are drawn by hand. A viewer who cannot tell the difference could take a sketch for a survey, so the page has to say which is which.

## What it must do

| Limit | Where the viewer is told |
|---|---|
| **Not official.** An independent demonstration, not affiliated with or endorsed by TC Energy. | Panel footer, README, the film's title card |
| **Canadian routes are schematic.** Hand-drawn from public maps because no open geometry exists. | Map legend, route tooltips, README |
| **Wildfire distances are screening estimates**, because they are measured to those hand-drawn routes. | Fire chart subtitle, "about" in tooltips, README |
| **Flow data lags.** Companies file quarterly, so the latest gas day is usually one to four months old. | The gas day in the headline row, the "to" date in the footer, README |
| **Wildfire history covers large fires only**, and only published years. | Fire chart subtitle, legend ("no data for this year"), README |
| **The US ownership list is editorial**: a point-in-time list of pipelines treated as TC Energy assets. | Ownership wording in route tooltips, a comment beside `US_OPERATORS`, README |
| **Heatmap values above 100% are shown as 100%.** | Heatmap subtitle |
| **Missing values are missing**, not zero. | "n/a", "capacity not reported", "cause not recorded" |
| **The story's pipeline route is volunteer-mapped.** It comes from OpenStreetMap and measures 662 km; the operator quotes 670 km. | Story closing screen, README |
| **Story terrain is exaggerated** 1.5 times, so relief reads from the air. | First pipeline card, story closing screen, README |
| **Ship tracks are illustrative.** The regulator publishes the destination country and the month, not the port, the route or the sailing date. | Export card, story closing screen, README |
| **Production is raw gas at the wellhead**, and the latest months may still be revised. | Production chart subtitle, story closing screen, README |
| **Pipeline size and capacity, and liquefaction figures, are the operators' public statements**, not data. | Wording in the cards ("its operator puts"), story closing screen |
| **Satellite imagery is a 2016 mosaic** stitched from different seasons, so snow cover changes abruptly in places. | README |

Any new approximation or editorial choice should be added to this table and disclosed in the same way: next to the thing it affects, and in the README's "Known limits".

## Out of scope

- Fixing the limits themselves. This intent is about disclosing them.

## Where it lives

- [README.md](../../README.md): "Known limits"
- [src/App.tsx](../../src/App.tsx): legend text and footer
- [src/components/Charts.tsx](../../src/components/Charts.tsx): chart subtitles
- [src/components/MapView.tsx](../../src/components/MapView.tsx): tooltips
- [scripts/fetch-data.mjs](../../scripts/fetch-data.mjs): `US_OPERATORS`
- [src/story/Story.tsx](../../src/story/Story.tsx): the story's cards and closing screen
- [src/story/data.ts](../../src/story/data.ts): the illustrative sea lanes
