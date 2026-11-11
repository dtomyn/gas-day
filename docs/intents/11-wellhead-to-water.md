# 11. Wellhead to water

## Intent

Tell one story from start to finish: how gas gets from a Montney well in northeast British Columbia, through Coastal GasLink, onto an LNG carrier at Kitimat. The viewer scrolls; the map flies.

## Why

The main map answers "what is flowing today?". It cannot show the newest part of the system, because Coastal GasLink is provincially regulated and files no throughput with the Canada Energy Regulator. A guided story can still show it, using what is public: where the wells are, where the pipe runs, how high it climbs, and what left the dock.

## What it must do

- Live at `#story`, linked from the main map's header, and load only when asked for. The main map must not get heavier.
- Be driven by scrolling alone. Scrolling forward advances the story; scrolling back rewinds it. Nothing plays on a timer that the viewer cannot stop, apart from the flow pulses and the scroll hint.
- Ease the camera toward where the scroll position says it should be, so a jerky scroll wheel still gives a smooth flight. Turn the easing and pulses off for viewers who ask for reduced motion.
- Tell the story in five chapters, between a title screen and a closing screen:

  | Chapter | What the map does | Chart |
  |---|---|---|
  | The basin | Lights each Montney well in the month it first produced, 2004 to the latest month | Production growth: Montney against all other formations |
  | The gathering system | Pulls back to show NGTL heading south and east, and the new line heading west | |
  | The pipeline | Flies the 662 km route in 3D, east to west, with the gas drawn in behind the camera | Elevation profile, filling in as the flight advances |
  | The terminal | Circles Kitimat and Douglas Channel | |
  | The water | Pulls back to the globe and sends each recorded shipment along a sea lane | Export volumes by destination, one bar per month |

- Keep the three charts in the same card as every other chart in the project, each with a table behind it (see [05. Charts](05-charts.md)).
- Work every number quoted in the text out of the data at run time (shares, elevations, distances, counts), so the words cannot drift from the charts.
- Fly lower and closer where the ground is rugged, higher over the plateau. Ruggedness comes from the elevation profile, not from a hand-written list.
- Show, during the flight, the distance covered, the ground elevation and the nearest town.
- Say on the closing screen what is illustrative. See [08. Honest limits](08-honest-limits.md).
- Stay usable on a phone: cards move to the bottom and the chapter rail is hidden.

## Numbers the code uses today

- Terrain is drawn 1.5 times taller than life.
- The elevation profile is sampled every 0.5 km.
- A ship takes 1.15 months of story time to cross. This is a pacing choice, not a transit time.
- Sailings are spread evenly through their month, because the regulator gives the month and not the day.
- The export chart names the four largest destinations and groups the rest as "Other".

## Out of scope

- Coastal GasLink throughput. It is not public.
- Real ship tracks, discharge ports or sailing dates. The regulator publishes the destination country and the month only.
- Free navigation of the 3D map. The camera belongs to the story; the main map is the place to explore.
- A film render of the story. The explainer film covers the main map only.

## Where it lives

- [src/story/Story.tsx](../../src/story/Story.tsx): the chapters, the text, and how scroll position becomes a camera and a date
- [src/story/scene.ts](../../src/story/scene.ts): the 3D map and its layers
- [src/story/StoryCharts.tsx](../../src/story/StoryCharts.tsx): the three charts
- [src/story/data.ts](../../src/story/data.ts): loading, units, towns and the illustrative sea lanes
- [src/story/geo.ts](../../src/story/geo.ts): distance, heading and great-circle arithmetic
- [src/Root.tsx](../../src/Root.tsx): the switch between the map and the story
- [scripts/fetch-data.mjs](../../scripts/fetch-data.mjs): the `route`, `montney` and `lng` tasks
