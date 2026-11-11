// The Gas Day explainer film: every scene, every narration line and every camera move.
//
// film/render.py opens the built app at #film, injects this file and asks window.Director for one exact frame at a
// time. Each frame is a pure function of the film clock, so any moment can be re-rendered on its own and the whole
// film comes out the same on every run. To change the film, edit SCENES below and re-run render.py.
(() => {
  const app = window.gasDayFilm
  const $ = (css) => document.querySelector(css)

  // ---------- small maths ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
  const lerp = (a, b, k) => a + (b - a) * k
  const ease = (k) => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2 }
  /** Progress of t through the window [a, b], clamped to 0..1. */
  const seg = (t, a, b) => clamp((t - a) / (b - a))
  /** 0 to 1 and back to 0: rises over `rise` ms after a, falls over `rise` ms before b. */
  const bump = (t, a, b, rise = 400) => Math.min(seg(t, a, a + rise), 1 - seg(t, b - rise, b))

  // ---------- camera poses ----------
  const P = {
    WIDE: { c: [-96, 55], z: 2.6, p: 0, b: 0 },
    HERO: { c: [-98, 49.5], z: 3.55, p: 40, b: -10 },
    APP: { c: [-97, 50.5], z: 3.45, p: 0, b: 0 },
    WEST: { c: [-114.6, 52.9], z: 5.3, p: 32, b: 12 },
    LAPSE: { c: [-99, 51.5], z: 3.5, p: 0, b: 0 },
    NIAGARA: { c: [-79.25, 43.25], z: 7.6, p: 0, b: 0 },
    NIAGARA2: { c: [-79.2, 43.25], z: 7.2, p: 20, b: -8 },
    ONTARIO: { c: [-78.6, 44.3], z: 5.5, p: 28, b: -14 },
    CALGARY: { c: [-114.2, 51.5], z: 6.6, p: 38, b: 18 },
    CALGARY2: { c: [-114.3, 51.6], z: 6.2, p: 30, b: 6 },
    FIRE: { c: [-117.5, 56.4], z: 5.0, p: 46, b: -18 },
    FIRE2: { c: [-112.5, 55.2], z: 4.7, p: 40, b: 14 },
    END: { c: [-97, 50.5], z: 3.3, p: 36, b: 8 },
  }
  const cam = (a, b, k) => {
    k = ease(k)
    return { c: [lerp(a.c[0], b.c[0], k), lerp(a.c[1], b.c[1], k)], z: lerp(a.z, b.z, k), p: lerp(a.p, b.p, k), b: lerp(a.b, b.b, k) }
  }

  // ---------- app helpers ----------
  const DAY = 86400000
  const dayOf = (iso) => Math.round((Date.parse(iso) - Date.parse(app.data.flows.start)) / DAY)
  const yearOf = (day) => new Date(Date.parse(app.data.flows.start) + day * DAY).getUTCFullYear()
  const LAST = () => app.data.flows.days - 1
  const UJR = 'NGTL System|Upstream of James River'
  const NIAGARA = 'Canadian Mainline|Niagara'
  const CALGARY = 'NGTL System|Calgary'
  const keyPoint = (id) => app.data.keyPoints.find((k) => k.id === id)

  const mapBox = () => $('.map').getBoundingClientRect()
  /** Screen position of a place on the map. */
  const onMap = (lon, lat) => { const p = app.map.project([lon, lat]); const r = mapBox(); return [r.left + p.x, r.top + p.y] }
  const centreOf = (css) => { const r = $(css).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }
  const card = (title) => [...document.querySelectorAll('.card')].find((c) => c.querySelector('h3').textContent.startsWith(title))
  const between = (a, b, k) => { k = ease(k); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)] }

  // ---------- the film ----------
  // Each scene: narration lines (voiced in order), storyboard frames, and draw(t, s, F), which fills in the frame F
  // for scene time t (ms). s.at(id) and s.end(id) give a line's start and end; s.p(id) its progress from 0 to 1.
  const SCENES = [
    {
      id: 'open',
      title: 'Beneath your feet',
      feature: 'The flow map on its own, full screen, on the latest gas day.',
      camera: 'Fades up from black high over Canada, then pushes in and tilts along the network.',
      sound: 'A low pad fades in under the first line.',
      lead: 1500, tail: 2400,
      lines: [
        { id: 'open-1', text: 'Right now, natural gas is moving beneath your feet. Across mountains, prairie and shield, through steel you will never see.' },
        { id: 'open-2', gap: 500, text: 'This is twenty years of that movement, drawn from public records, on a single map.' },
      ],
      boards: [
        { line: 'open-1', k: 0.6, title: 'The network in the dark', why: 'Open on the map alone, so the first thing seen is gas moving.' },
        { line: 'open-2', k: 1.2, title: 'Title card', why: 'The name and the promise: twenty years, one map.' },
      ],
      draw(t, s, F) {
        F.chrome = 0; F.ui = 0; F.vignette = 1
        F.cam = cam(P.WIDE, P.HERO, t / s.dur)
        F.black = 1 - seg(t, 200, 1900)
        F.title = bump(t, s.at('open-2') + 2200, s.dur + 300, 700)
      },
    },
    {
      id: 'read',
      title: 'How to read the map',
      feature: 'The whole application: map, legend, time bar and chart panel. Line width, colour and pulses.',
      camera: 'Levels out as the app slides in around the map, then flies west into Alberta.',
      sound: 'The pad opens up. A soft pulse starts.',
      lead: 1700, tail: 500,
      lines: [
        { id: 'read-1', text: "This is Gas Day. Every line follows a route on T C Energy's Canadian network, and every number comes from flow data filed with the Canada Energy Regulator." },
        { id: 'read-2', gap: 450, text: 'Thick lines carry more gas. Brighter blue means a route is closer to full. And the pulses show which way the gas is flowing.' },
      ],
      boards: [
        { line: 'read-1', k: 0.5, title: 'The app slides in', why: 'The full-screen map becomes the real application, so the viewer knows this is a working tool.' },
        { line: 'read-2', k: 0.75, title: 'Width, colour, direction', why: 'Three labels teach the whole visual language in one shot.' },
      ],
      draw(t, s, F) {
        F.chrome = ease(seg(t, 0, 1700)); F.ui = seg(t, 900, 1900); F.vignette = 1 - F.chrome
        const fly = seg(t, s.at('read-2') - 600, s.end('read-2') - 1500)
        F.cam = fly > 0 ? cam(P.APP, P.WEST, fly) : cam(P.HERO, P.APP, t / 2400)
        F.tag = { text: 'TC Energy Canadian gas network', o: bump(t, 1900, s.end('read-1'), 500) }
        const p = s.p('read-2')
        F.ring = { css: '.legend', o: bump(p, 0.02, 0.62, 0.08) }
        F.callouts = [
          { at: [-116.5, 53.7], text: 'Wider line, more gas', o: bump(p, 0.3, 1.25, 0.08), dy: -34 },
          { at: [-112.02, 53.64], text: 'Brighter blue, closer to full', o: bump(p, 0.5, 1.25, 0.08), dy: -30 },
          { at: [-112.6, 51.25], text: 'Pulses show direction', o: bump(p, 0.74, 1.25, 0.08), dy: 34 },
        ]
      },
    },
    {
      id: 'lapse',
      title: 'Twenty years in twenty seconds',
      feature: 'The time slider playing from 2006 to the latest gas day, with the throughput chart following.',
      camera: 'Pulls back to the whole network and holds while the years run.',
      sound: 'The pulse quickens and the pad lifts through the time-lapse.',
      lead: 300, tail: 1200,
      lines: [
        { id: 'lapse-1', gap: 1300, text: 'Press play, and twenty years run past in seconds. More than seven thousand days of flow.' },
        { id: 'lapse-2', gap: 600, text: 'Watch the west. In 2010, about five billion cubic feet a day came down this corridor, out of Alberta and British Columbia.' },
        { id: 'lapse-3', gap: 400, text: 'By 2025, it was more than twelve.' },
      ],
      boards: [
        { line: 'lapse-1', k: 0.1, title: 'Press play', why: 'The cursor presses the real play button. From here the slider drives everything.' },
        { line: 'lapse-2', k: 0.5, title: 'The west grows', why: 'The year counter and the chart marker move together as the western corridor thickens.' },
        { line: 'lapse-3', k: 0.9, title: 'More than doubled', why: 'The payoff: the same corridor at more than twice the volume.' },
      ],
      draw(t, s, F) {
        F.cam = cam(P.WEST, P.LAPSE, t / 2600)
        const press = 1300
        const play = centreOf('.play')
        F.cursor = { xy: between([play[0] + 380, play[1] - 260], play, seg(t, 150, press - 150)), o: bump(t, 100, press + 900, 250), click: seg(t, press, press + 450) }
        F.playing = t >= press && t < s.dur - 500
        const run = seg(t, press, s.dur - 900)
        F.day = Math.round(lerp(0, LAST(), run))
        F.year = { text: String(yearOf(F.day)), o: bump(t, press, s.dur - 200, 500) }
        F.ring = { card: 'Throughput against capacity', o: bump(t, s.at('lapse-2'), s.end('lapse-3') + 600, 500) }
        F.callouts = [{ at: [-116.43, 53.58], text: 'The western corridor', o: bump(t, s.at('lapse-2') + 300, s.end('lapse-3') + 600, 500), dy: -36 }]
      },
    },
    {
      id: 'niagara',
      title: 'The pipe that changed direction',
      feature: 'Clicking a key point. The pulses at Niagara reverse between 2007 and 2025. The net exports chart.',
      camera: 'Dives from the whole network to the Niagara River, then lifts over southern Ontario.',
      sound: 'The pulse drops out for the reveal, then returns.',
      lead: 400, tail: 900,
      lines: [
        { id: 'niagara-1', gap: 1500, text: 'Click any point, and the panel tells its story. This is Niagara, on the border with New York.' },
        { id: 'niagara-2', gap: 500, text: 'In 2007, gas flowed east here, out of Canada, at around eight hundred million cubic feet a day.' },
        { id: 'niagara-3', gap: 500, text: 'Then American shale changed everything. Watch the pulses. By 2025, the same pipe was carrying gas the other way, into Ontario.' },
        { id: 'niagara-4', gap: 600, text: 'One chart shows the whole border shifting, region by region.' },
      ],
      boards: [
        { line: 'niagara-1', k: 0.55, title: 'Click a key point', why: 'The cursor clicks Niagara on the map and the whole panel changes to that point.' },
        { line: 'niagara-2', k: 0.6, title: '2007: flowing east', why: 'Hold on the pulses leaving Canada so the direction registers before it changes.' },
        { line: 'niagara-3', k: 0.95, title: '2025: flowing west', why: 'The reversal. The strongest single image in the film.' },
        { line: 'niagara-4', k: 0.7, title: 'The whole border', why: 'Scroll to the net exports chart to show this was one part of a larger shift.' },
      ],
      draw(t, s, F) {
        const from = dayOf('2007-02-10'), to = dayOf('2025-02-10')
        F.day = Math.round(lerp(from, to, seg(s.p('niagara-3'), 0.2, 0.86)))
        const dive = seg(t, 0, 3000)
        const out = seg(t, s.at('niagara-4') - 300, s.end('niagara-4'))
        F.cam = out > 0 ? cam(P.NIAGARA2, P.ONTARIO, out) : dive < 1 ? cam(P.LAPSE, P.NIAGARA, dive) : cam(P.NIAGARA, P.NIAGARA2, seg(t, s.at('niagara-2'), s.end('niagara-3')))
        const click = s.at('niagara-1') + 1900
        const kp = keyPoint(NIAGARA)
        const target = onMap(kp.lon, kp.lat)
        F.cursor = { xy: between([target[0] - 300, target[1] + 240], target, seg(t, click - 1300, click - 100)), o: bump(t, click - 1400, click + 1000, 250), click: seg(t, click, click + 450) }
        F.selected = t >= click ? NIAGARA : UJR
        F.tag = { text: String(yearOf(F.day)), o: bump(t, 2400, s.at('niagara-4'), 500) }
        F.callouts = [
          { at: [kp.lon, kp.lat], text: '2007: east, out of Canada', o: bump(t, s.at('niagara-2') + 500, lerp(s.at('niagara-3'), s.end('niagara-3'), 0.2), 400), dy: 44 },
          { at: [kp.lon, kp.lat], text: '2025: west, into Ontario', o: bump(t, lerp(s.at('niagara-3'), s.end('niagara-3'), 0.84), s.at('niagara-4') + 400, 400), dy: 44 },
        ]
        F.scroll = ['top', 'Net exports', seg(t, s.at('niagara-4') - 500, s.at('niagara-4') + 900)]
        F.ring = { card: 'Net exports', o: bump(t, s.at('niagara-4') + 700, s.dur, 400) }
      },
    },
    {
      id: 'cold',
      title: 'The coldest week',
      feature: 'January 2024 at the Calgary key point: the headline numbers, the weather scatter and the utilization grid.',
      camera: 'Crosses the continent to Calgary and settles low over the city.',
      sound: 'The pad darkens and thins. A cold, high tone.',
      lead: 500, tail: 700,
      lines: [
        { id: 'cold-1', gap: 1900, text: "January 2024. An Arctic front settles over the prairies, and Calgary's average temperature falls to minus thirty-four." },
        { id: 'cold-2', gap: 450, text: 'Gas delivered toward the city jumps by more than half in a week, to the highest level this point has ever recorded.' },
        { id: 'cold-3', gap: 600, text: 'Here, every dot is one day. The colder it gets, the further right it sits, and the more gas this point moves.' },
        { id: 'cold-4', gap: 600, text: 'And one grid shows, month by month, which points are running close to full.' },
      ],
      boards: [
        { line: 'cold-1', k: 0.7, title: 'The front arrives', why: 'The day counter walks through the cold snap while the Calgary line thickens.' },
        { line: 'cold-2', k: 0.8, title: 'A record for this point', why: 'The headline number and the chart marker sit on the peak.' },
        { line: 'cold-3', k: 0.6, title: 'Flow against cold', why: 'The scatter makes the link between weather and demand visible at a glance.' },
        { line: 'cold-4', k: 0.7, title: 'Running close to full', why: 'The utilization grid: every key point, every month.' },
      ],
      draw(t, s, F) {
        F.selected = CALGARY
        F.day = Math.round(lerp(dayOf('2024-01-03'), dayOf('2024-01-12'), seg(t, s.at('cold-1') + 800, s.end('cold-1') + 300)))
        F.cam = t < s.at('cold-2') ? cam(P.ONTARIO, P.CALGARY, t / 3600) : cam(P.CALGARY, P.CALGARY2, seg(t, s.at('cold-2'), s.dur))
        const date = new Date(Date.parse(app.data.flows.start) + F.day * DAY)
        F.tag = { text: `January ${date.getUTCDate()}, 2024`, o: bump(t, 1500, s.at('cold-3'), 500) }
        const toScatter = seg(t, s.at('cold-3') - 700, s.at('cold-3') + 600)
        const toGrid = seg(t, s.at('cold-4') - 700, s.at('cold-4') + 700)
        F.scroll = toGrid > 0 ? ['Flow against cold', 'Capacity utilization', toGrid] : toScatter > 0 ? ['top', 'Flow against cold', toScatter] : ['Net exports', 'top', seg(t, 0, 1400)]
        F.ring = t < s.at('cold-3') - 700
          ? { css: '.hero', o: bump(t, s.at('cold-2') + 200, s.at('cold-3') - 700, 400) }
          : t < s.at('cold-4') - 700
            ? { card: 'Flow against cold', o: bump(t, s.at('cold-3') + 500, s.at('cold-4') - 700, 400) }
            : { card: 'Capacity utilization', o: bump(t, s.at('cold-4') + 600, s.dur, 400) }
        F.callouts = [{ at: [-114.6, 51.6], text: 'Deliveries toward Calgary', o: bump(t, s.at('cold-1') + 1500, s.at('cold-3') - 400, 400), dy: -38 }]
      },
    },
    {
      id: 'fire',
      title: 'Fire season',
      feature: 'The wildfire layer: burned areas for the slider year, live satellite hotspots, and the burned-area chart.',
      camera: 'Rises north over the boreal forest, tilted, and drifts east across the 2023 burn scars.',
      sound: 'A low swell as the burned areas appear.',
      lead: 400, tail: 900,
      lines: [
        { id: 'fire-1', gap: 1700, text: 'Now switch on the wildfire layer, and go back to the summer of 2023. The worst fire season Canada has ever recorded.' },
        { id: 'fire-2', gap: 500, text: "Each orange shape is a large fire. By this map's estimate, more than half a million hectares burned within fifty kilometres of these routes that year." },
        { id: 'fire-3', gap: 500, text: 'And the red dots are live: satellite hotspots from the last twenty-four hours.' },
      ],
      boards: [
        { line: 'fire-1', k: 0.15, title: 'Switch on the wildfire layer', why: 'The cursor ticks the real checkbox in the legend.' },
        { line: 'fire-1', k: 0.95, title: 'Summer 2023', why: 'The burn scars appear around the northern routes as the camera rises.' },
        { line: 'fire-2', k: 0.8, title: 'Half a million hectares', why: 'The chart puts 2023 in context against every year since 2006.' },
        { line: 'fire-3', k: 0.6, title: 'Live hotspots', why: 'History and the present on the same layer.' },
      ],
      draw(t, s, F) {
        const tick = 1500
        F.showFires = t >= tick
        F.day = Math.round(lerp(dayOf('2023-05-05'), dayOf('2023-09-20'), seg(t, tick, s.dur)))
        F.cam = t < s.at('fire-2') ? cam(P.CALGARY2, P.FIRE, t / 4200) : cam(P.FIRE, P.FIRE2, seg(t, s.at('fire-2'), s.dur))
        const box = centreOf('.toggle input')
        F.cursor = { xy: between([box[0] - 330, box[1] + 250], box, seg(t, 250, tick - 100)), o: bump(t, 200, tick + 900, 250), click: seg(t, tick, tick + 450) }
        F.tag = { text: 'Summer 2023', o: bump(t, tick + 400, s.at('fire-3'), 500) }
        F.scroll = t < s.at('fire-2') ? ['Capacity utilization', 'top', seg(t, 0, 1300)] : ['top', 'Area burned', seg(t, s.at('fire-2') + 2600, s.at('fire-2') + 3900)]
        F.ring = t < s.at('fire-2') + 2600
          ? { css: '.legend', o: bump(t, tick + 200, s.at('fire-1') + 2600, 400) }
          : { card: 'Area burned', o: bump(t, s.at('fire-2') + 3800, s.end('fire-2') + 400, 400) }
        F.callouts = [
          { at: [-118.9, 57.6], text: 'Burned in 2023', o: bump(t, s.at('fire-2') + 200, s.at('fire-2') + 4200, 400), dy: -30 },
          { at: [-111.81, 56.95], text: 'Northern routes', o: bump(t, s.at('fire-2') + 900, s.at('fire-2') + 4200, 400), dy: -34 },
        ]
      },
    },
    {
      id: 'close',
      title: 'Only public data',
      feature: 'The map alone again on the latest gas day, then the end card with the data sources.',
      camera: 'The app slides away and the camera pulls back to the whole network.',
      sound: 'The pad resolves and fades.',
      lead: 1700, tail: 4200,
      lines: [
        { id: 'close-1', text: 'No private feeds. No licences. Only public data, a time slider, and a new way to see a network that never stops.' },
        { id: 'close-2', gap: 900, text: 'This is Gas Day.' },
      ],
      boards: [
        { line: 'close-1', k: 0.5, title: 'The network, today', why: 'Return to the opening shot so the film closes where it began.' },
        { line: 'close-2', k: 2.2, title: 'End card', why: 'The name, the sources and the disclaimer.' },
      ],
      draw(t, s, F) {
        F.chrome = 1 - ease(seg(t, 0, 1700)); F.ui = 1 - seg(t, 0, 700); F.vignette = 1 - F.chrome
        F.cam = cam(P.FIRE2, P.END, t / (s.dur - 1500))
        F.scroll = ['Area burned', 'top', seg(t, 0, 500)]
        F.showFires = t < 500
        F.end = seg(t, s.at('close-2') - 300, s.at('close-2') + 900)
        F.black = seg(t, s.dur - 900, s.dur - 100)
      },
    },
  ]

  // ---------- overlay ----------
  const CSS = `
    #film { position: fixed; inset: 0; z-index: 9999; pointer-events: none; font-family: system-ui, "Segoe UI", sans-serif; color: #f0efec; overflow: hidden; }
    #film > * { position: absolute; }
    #film .vignette { inset: 0; background: radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0,0,0,.72) 100%); }
    #film .title { inset: 0; display: grid; place-content: end center; padding-bottom: 96px; text-align: center; }
    #film .title h1 { margin: 0; font-size: 132px; font-weight: 700; letter-spacing: .14em; text-indent: .14em; text-shadow: 0 4px 60px rgba(0,0,0,.9); }
    #film .title p { margin: 10px 0 0; font-size: 27px; letter-spacing: .05em; color: #c3c2b7; text-shadow: 0 2px 24px #000; }
    #film .rule { width: 120px; height: 3px; background: #3987e5; margin: 22px auto 0; border-radius: 2px; }
    #film .year { font-size: 136px; font-weight: 700; line-height: 1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; text-shadow: 0 2px 40px rgba(0,0,0,.95); }
    #film .tag { font-size: 15px; letter-spacing: .16em; text-transform: uppercase; padding: 9px 16px 9px 14px; background: rgba(13,13,13,.82); border-left: 3px solid #3987e5; border-radius: 0 4px 4px 0; white-space: nowrap; }
    #film .ring { border: 2px solid #3987e5; border-radius: 10px; box-shadow: 0 0 0 4px rgba(57,135,229,.22), 0 0 34px rgba(57,135,229,.55); }
    #film .callout { transform: translate(-50%, -50%); font-size: 15px; font-weight: 600; padding: 6px 12px; background: rgba(240,239,236,.96); color: #0d0d0d; border-radius: 5px; white-space: nowrap; box-shadow: 0 4px 22px rgba(0,0,0,.6); }
    #film .dot { width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #f0efec; box-shadow: 0 0 0 4px rgba(240,239,236,.25); }
    #film .stem { width: 2px; margin-left: -1px; background: rgba(240,239,236,.8); }
    #film .cursor { width: 30px; height: 30px; margin: -3px 0 0 -6px; filter: drop-shadow(0 3px 6px rgba(0,0,0,.8)); }
    #film .ripple { width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; border: 3px solid #f0efec; }
    #film .end { inset: 0; display: grid; place-content: center; text-align: center; background: rgba(8,8,8,.74); }
    #film .end h1 { margin: 0; font-size: 104px; font-weight: 700; letter-spacing: .14em; text-indent: .14em; }
    #film .end h2 { margin: 26px 0 0; font-size: 25px; font-weight: 400; color: #f0efec; }
    #film .end p { margin: 14px 0 0; font-size: 18px; color: #c3c2b7; }
    #film .end small { display: block; margin-top: 34px; font-size: 14px; color: #898781; letter-spacing: .04em; }
    #film .black { inset: 0; background: #000; }
  `
  let layer
  const el = {}
  function build() {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    layer = document.createElement('div')
    layer.id = 'film'
    layer.innerHTML = `
      <div class="vignette"></div>
      <div class="ring"></div>
      <div class="callouts"></div>
      <div class="year"></div>
      <div class="tag"></div>
      <div class="ripple"></div>
      <svg class="cursor" viewBox="0 0 24 24"><path d="M5 2l14 11h-7.2l4 8-2.8 1.3-3.9-8L5 19z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>
      <div class="title"><div><h1>GAS DAY</h1><div class="rule"></div><p>Twenty years of natural gas, on one map</p></div></div>
      <div class="end"><div><h1>GAS DAY</h1><div class="rule"></div>
        <h2>Built entirely from public data</h2>
        <p>Canada Energy Regulator · US Energy Information Administration · Natural Resources Canada · Open-Meteo</p>
        <small>An independent demonstration. Not affiliated with or endorsed by TC Energy. Canadian routes are schematic. Narration uses a synthetic voice.</small></div></div>
      <div class="black"></div>`
    document.body.append(layer)
    for (const name of ['vignette', 'ring', 'callouts', 'year', 'tag', 'ripple', 'cursor', 'title', 'end', 'black']) el[name] = layer.querySelector('.' + name)
  }

  const show = (node, o) => { node.style.opacity = o; node.style.visibility = o > 0.001 ? 'visible' : 'hidden' }
  const panel = () => $('.panel')
  function scrollPos(name) {
    if (name === 'top') return 0
    const c = card(name)
    return c ? Math.min(c.offsetTop - panel().offsetTop - 10, panel().scrollHeight - panel().clientHeight) : 0
  }

  function apply(F) {
    // 1. App state first, so everything measured below is in its final place.
    app.set({ day: F.day, selected: F.selected, showFires: F.showFires, playing: F.playing })
    const root = document.documentElement.style
    root.setProperty('--film-panel', `${Math.round(470 * F.chrome)}px`)
    root.setProperty('--film-top', `${Math.round($('.top').offsetHeight * (1 - F.chrome))}px`)
    root.setProperty('--film-chrome', F.ui)
    app.bare = F.chrome < 0.5
    app.map.resize()
    app.map.jumpTo({ center: F.cam.c, zoom: F.cam.z, pitch: F.cam.p, bearing: F.cam.b })
    panel().scrollTop = lerp(scrollPos(F.scroll[0]), scrollPos(F.scroll[1]), ease(F.scroll[2]))

    // 2. Overlay.
    show(el.vignette, F.vignette)
    show(el.title, F.title)
    show(el.end, F.end)
    show(el.black, F.black)
    const m = mapBox()
    show(el.year, F.year.o * 0.92)
    el.year.textContent = F.year.text
    el.year.style.left = `${m.left + 30}px`
    el.year.style.bottom = `${innerHeight - m.bottom + 118}px`
    show(el.tag, F.tag.o)
    el.tag.textContent = F.tag.text
    el.tag.style.left = `${m.left}px`
    el.tag.style.top = `${m.top + 96}px`

    const target = F.ring.o > 0.001 ? (F.ring.card ? card(F.ring.card) : $(F.ring.css)) : null
    show(el.ring, target ? F.ring.o : 0)
    if (target) {
      const r = target.getBoundingClientRect()
      Object.assign(el.ring.style, { left: `${r.left - 5}px`, top: `${r.top - 5}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` })
    }

    el.callouts.innerHTML = ''
    for (const c of F.callouts) {
      if (c.o <= 0.001) continue
      const [x, y] = onMap(c.at[0], c.at[1])
      const dy = c.dy ?? -32
      const stemTop = dy < 0 ? y + dy : y
      el.callouts.insertAdjacentHTML('beforeend',
        `<div style="position:absolute;opacity:${c.o}">
           <div class="stem" style="position:absolute;left:${x}px;top:${stemTop}px;height:${Math.abs(dy)}px"></div>
           <div class="dot" style="position:absolute;left:${x}px;top:${y}px"></div>
           <div class="callout" style="position:absolute;left:${x}px;top:${y + dy + (dy < 0 ? -15 : 15)}px">${c.text}</div>
         </div>`)
    }

    show(el.cursor, F.cursor.o)
    el.cursor.style.left = `${F.cursor.xy[0]}px`
    el.cursor.style.top = `${F.cursor.xy[1]}px`
    const k = F.cursor.click
    show(el.ripple, k > 0 && k < 1 ? (1 - k) * F.cursor.o : 0)
    Object.assign(el.ripple.style, { left: `${F.cursor.xy[0]}px`, top: `${F.cursor.xy[1]}px`, transform: `scale(${0.25 + k * 0.9})` })
  }

  const frame = () => new Promise((done) => requestAnimationFrame(() => done()))
  /** Wait until the map, the flow layers and the charts have all drawn this frame. */
  async function settle() {
    await frame()
    await frame()
    const started = performance.now()
    while (!(app.map.loaded() && app.map.areTilesLoaded()) && performance.now() - started < 6000) await frame()
    await frame()
  }

  // ---------- timeline ----------
  let total = 0
  function schedule(lengths) {
    let at = 0
    for (const scene of SCENES) {
      scene.start = at
      let cursor = scene.lead ?? 500
      for (const line of scene.lines) {
        cursor += line.gap ?? 350
        line.at = cursor
        const length = lengths[line.id]
        if (!length) throw new Error(`no voice length for ${line.id}`)
        cursor += length
        line.end = cursor
      }
      scene.dur = cursor + (scene.tail ?? 700)
      at += scene.dur
    }
    total = at
  }
  const sceneAt = (ms) => SCENES.findLast((s) => ms >= s.start) ?? SCENES[0]
  const lineOf = (scene, id) => { const l = scene.lines.find((x) => x.id === id); if (!l) throw new Error(`no line ${id}`); return l }

  window.Director = {
    /** Builds the overlay once the app has its data and map. */
    async prepare() {
      const started = performance.now()
      while (!(app.data && app.map && app.map.loaded())) {
        if (performance.now() - started > 60000) throw new Error('the app did not finish loading')
        await frame()
      }
      build()
      await document.fonts.ready
    },
    /** Every narration line, in order. */
    script: () => SCENES.flatMap((s) => s.lines.map((l) => ({ id: l.id, text: l.text, scene: s.id }))),
    /** Takes each line's spoken length in ms and lays out the whole film. */
    start(lengths) { schedule(lengths); return total },
    /** Draws the film at one moment and resolves once that frame is fully on screen. */
    async seek(ms) {
      const scene = sceneAt(Math.min(ms, total - 1))
      const t = ms - scene.start
      const s = {
        dur: scene.dur,
        at: (id) => lineOf(scene, id).at,
        end: (id) => lineOf(scene, id).end,
        p: (id) => seg(t, lineOf(scene, id).at, lineOf(scene, id).end),
      }
      const F = {
        day: LAST(), selected: UJR, showFires: false, playing: false, cam: P.APP, chrome: 1, ui: 1, scroll: ['top', 'top', 0],
        vignette: 0, title: 0, end: 0, black: 0, year: { text: '', o: 0 }, tag: { text: '', o: 0 }, ring: { css: '.legend', o: 0 },
        callouts: [], cursor: { xy: [0, 0], o: 0, click: 0 },
      }
      app.clock = ms
      // Twice: the first pass puts the layout and camera in place, the second measures against them.
      for (let pass = 0; pass < 2; pass++) { scene.draw(t, s, F); apply(F) }
      await settle()
      return scene.id
    },
    timeline: () => ({
      total,
      dataTo: new Date(Date.parse(app.data.flows.start) + LAST() * DAY).toISOString().slice(0, 10),
      chapters: SCENES.map((s) => ({ id: s.id, title: s.title, at: s.start, end: s.start + s.dur, feature: s.feature, camera: s.camera, sound: s.sound })),
      voiced: SCENES.flatMap((s) => s.lines.map((l) => ({ id: l.id, scene: s.id, text: l.text, at: s.start + l.at, end: s.start + l.end }))),
      boards: SCENES.flatMap((s) => s.boards.map((b) => {
        const l = lineOf(s, b.line)
        return { scene: s.id, title: b.title, why: b.why, at: Math.min(s.start + l.at + (l.end - l.at) * b.k, s.start + s.dur - 50) }
      })),
    }),
  }
})()
