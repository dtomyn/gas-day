# Intents

What each part of Gas Day is for, and why it is built the way it is. The root [README](../../README.md) explains how to run the project; these pages explain what it is trying to achieve, so a change can be judged against the purpose it serves.

These intents were written down after the fact, from the code, the README and the film script. Where the code and an intent disagree, one of them needs fixing: raise it instead of assuming the page is right.

| # | Intent | In one line |
|---|---|---|
| 01 | [Product](01-product.md) | Show 20 years of gas flow on one map, from public data only, without claiming to be official |
| 02 | [Flow map](02-flow-map.md) | Let a viewer see volume, fullness and direction at a glance |
| 03 | [Time travel](03-time-travel.md) | Make any gas day since 2006 one drag or one click away |
| 04 | [Headline numbers and key point selection](04-headline-numbers.md) | Summarise the selected day and let the viewer pick one point to study |
| 05 | [Charts](05-charts.md) | Answer one plain question per chart, each with a table behind it |
| 06 | [Wildfire layer](06-wildfire-layer.md) | Screen which fires burned near the network, past and present |
| 07 | [Data pipeline](07-data-pipeline.md) | Rebuild every dataset from public sources with one command and no keys |
| 08 | [Honest limits](08-honest-limits.md) | Say plainly what is schematic, late, estimated or editorial |
| 09 | [Refresh and deploy](09-refresh-and-deploy.md) | Keep the public site current every day without anyone touching it |
| 10 | [Explainer film](10-explainer-film.md) | Produce a narrated film of the real app that can be re-rendered exactly |

## How each page is laid out

- **Intent**: the purpose, in a sentence or two.
- **Why**: the reason it matters.
- **What it must do**: the behaviour that serves the intent, with the numbers the code uses today.
- **Out of scope**: what was left out on purpose.
- **Where it lives**: the files to read or change.

## Keeping these current

When a change alters what a part of the project is for, or one of the numbers quoted here, update the matching page in the same change. A new capability gets a new numbered page and a row in the table above.
