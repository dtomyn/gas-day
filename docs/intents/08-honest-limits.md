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

Any new approximation or editorial choice should be added to this table and disclosed in the same way: next to the thing it affects, and in the README's "Known limits".

## Out of scope

- Fixing the limits themselves. This intent is about disclosing them.

## Where it lives

- [README.md](../../README.md): "Known limits"
- [src/App.tsx](../../src/App.tsx): legend text and footer
- [src/components/Charts.tsx](../../src/components/Charts.tsx): chart subtitles
- [src/components/MapView.tsx](../../src/components/MapView.tsx): tooltips
- [scripts/fetch-data.mjs](../../scripts/fetch-data.mjs): `US_OPERATORS`
