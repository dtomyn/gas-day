# 02. Flow map

## Intent

Let a viewer read, at a glance and without a manual, how much gas each route is carrying on the selected day, how full that route is, and which way the gas is going.

## Why

Volume, fullness and direction are the three things that change over 20 years. If the map shows all three at once, the story is visible just by dragging the slider.

## What it must do

- Encode three things, and only three, on each route:
  - **Line width is volume.** Width grows with the square root of flow in Bcf/d, so a large route does not swamp the map.
  - **Colour is the share of capacity in use**, on a single blue ramp from dark (empty) to bright (full). A route with no reported capacity is neutral grey.
  - **Moving pulses are direction.** They travel the way the gas flows and reverse when the flow reverses.
- Where a key point reports flow in more than one direction, draw the direction carrying the most gas that day.
- Draw a route only when its key point reports flow above zero for that day.
- Show the rest of the network as a faint backdrop: the Canadian systems, and the US pipelines treated as TC Energy assets.
- Explain itself on hover: the key point, system, flow, direction, trade type and share of capacity; for backdrop lines, the pipeline name and where its route came from.
- Let a click on a route or a key point select it for the chart panel.
- Label every key point once zoomed in (zoom 5.2 or more), and always label the selected one.
- Keep a legend on the map that states the encoding in words, including that Canadian routes are schematic.

## Out of scope

- True Canadian pipeline geometry. No open data exists, so routes are hand-drawn. See [08. Honest limits](08-honest-limits.md).
- Flow on US pipelines. They appear as routes only.

## Where it lives

- [src/components/MapView.tsx](../../src/components/MapView.tsx): the layers, pulses, tooltips and clicks
- [src/data/network.json](../../src/data/network.json): the hand-drawn Canadian routes and the segment drawn for each key point
- [src/lib/theme.ts](../../src/lib/theme.ts): the colour ramp
- [src/lib/data.ts](../../src/lib/data.ts): `dominant` and `utilization`
