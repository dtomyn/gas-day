# 10. Explainer film

## Intent

Produce a short narrated film that explains the app by showing the real app, written as a script that can be re-rendered exactly after any change to the app or its data.

## Why

A film is the fastest way to show someone what Gas Day does. A screen recording goes stale the first time the app changes and cannot be corrected without re-recording. A film generated from a script can be rebuilt on demand, edited one line at a time, and always shows the app as it is.

## What it must do

- Film the real application, not a mock-up. Every frame is a screenshot of the built app.
- Keep the whole film in one file: every scene, narration line, camera move and on-screen label.
- Make each frame depend only on the film clock, so any moment can be rendered on its own and the film comes out the same every run.
- Let the narration set the pace. Each line is voiced first, and the picture retimes itself to the length of the voice.
- Voice each line once and keep it; remake a line only when its text changes. Use a human recording instead whenever one is saved under that line's name.
- Generate the music, so no licensed track is needed and the score is identical every run. The music drops under the voice.
- Produce, alongside the film: a storyboard with a real frame for every beat, the narration script with timings, captions, and a thumbnail.
- Offer quick passes for working on it: storyboard only, a small preview, a single scene, and single frames.
- Fail the run if the app reports an error while being filmed.
- Carry the unofficial disclaimer on the title card and the end card. The end card also lists the data sources and says that the routes are schematic and the voice is synthetic.

## The story it tells

Seven scenes, about 2 minutes 40 seconds: the map on its own; how to read it; 20 years played in 20 seconds; Niagara reversing direction; the January 2024 cold snap at Calgary; the 2023 fire season; and a close on "only public data".

## Film mode in the app

Opening the app at `#film` lets the film script set the date, the selected key point, the wildfire layer and the camera for each frame, and drives the flow pulses from the film clock instead of the real one. In normal use this code does nothing.

## Out of scope

- Rendering in the daily workflow. The renderer needs Microsoft Edge and the Kokoro voice files on the machine.
- Committing the finished video. It is generated and ignored by git; the storyboard, script, captions and thumbnail are committed.

## Current state

The disclaimer was added to the title card after the last render, so the committed storyboard and thumbnail still show the old card until the film is rendered again.

## Where it lives

- [film/scenes.js](../../film/scenes.js): the film itself
- [film/render.py](../../film/render.py): the renderer, voice, music and mix
- [src/lib/film.ts](../../src/lib/film.ts): film mode
- [film/storyboard.html](../../film/storyboard.html), [film/script.md](../../film/script.md), [film/gas-day-explainer.srt](../../film/gas-day-explainer.srt), [film/thumbnail.jpg](../../film/thumbnail.jpg): generated outputs
