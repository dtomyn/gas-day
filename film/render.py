"""Render the Gas Day explainer film from the real app, one exact frame at a time.

The scenes, narration and camera moves live in film/scenes.js. This script builds the app, opens it at #film in a
headless Microsoft Edge, voices each narration line with Kokoro, asks the page for every frame, and mixes picture,
voice and a generated music bed with ffmpeg. Re-run it after a data refresh: the picture retimes itself to the voice.

  python film/render.py --storyboard           Storyboard page, script, captions and thumbnail. About a minute.
  python film/render.py --stills 5,40,95       Save test frames as JPEGs.
  python film/render.py --preview              Quick 960x540 film to check timing and sound.
  python film/render.py --preview --only fire  Preview one scene, no sound.
  python film/render.py                        The 1080p film and all of the above. About 20 minutes.

Needs: pip install -r film/requirements.txt, Microsoft Edge, Node (to build the app), and the Kokoro voice files
kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx. Point KOKORO_DIR at their folder; the
default is the copy in ../IRISIdeas/.venv/kokoro. The voice (af_heart at 0.97 speed) matches that project's films.

Narration is made once per line and kept in film/out/vo; a line is remade only when its text changes. To use a real
voice, save a WAV named after the line in film/out/vo/recorded (for example recorded/niagara-3.wav).
"""
import argparse
import base64
import functools
import hashlib
import html
import http.server
import json
import os
import pathlib
import re
import subprocess
import threading
import time

import imageio_ffmpeg
import numpy
import soundfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILM = ROOT / "film"
OUT = FILM / "out"
VOICE_DIR = OUT / "vo"
NAME = "gas-day-explainer"
LAYOUT = (1600, 900)
SCALE_MASTER, SCALE_PREVIEW, SCALE_BOARD = 1.2, 0.6, 0.6  # 1920x1080, 960x540, 960x540
KOKORO_DIR = pathlib.Path(os.environ.get("KOKORO_DIR", ROOT.parent / "IRISIdeas" / ".venv" / "kokoro"))
VOICE, VOICE_SPEED, VOICE_RATE = "af_heart", 0.97, 24000
CAPTION_MAX = 84
THUMBNAIL_BOARD = "2025: flowing west"
RATE = 48000


# ---------- the app ----------
class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows can report .js as text/plain, which stops module scripts loading.
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css"}

    def log_message(self, *args):
        pass


def serve():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT / "dist")))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def open_page(playwright, port, scale):
    browser = playwright.chromium.launch(channel="msedge", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
    page = browser.new_page(viewport={"width": LAYOUT[0], "height": LAYOUT[1]}, device_scale_factor=scale)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"http://127.0.0.1:{port}/#film")
    page.wait_for_function("window.gasDayFilm && window.gasDayFilm.data && window.gasDayFilm.map", timeout=60000)
    page.add_script_tag(path=str(FILM / "scenes.js"))
    page.evaluate("() => Director.prepare()")
    page.evaluate("lengths => Director.start(lengths)", make_voice(page.evaluate("Director.script()")))
    return browser, page, errors


# ---------- voice ----------
def make_voice(lines):
    """Returns each line's length in ms, voicing only the lines that are new or changed."""
    (VOICE_DIR / "recorded").mkdir(parents=True, exist_ok=True)
    book = VOICE_DIR / "made.json"
    made = json.loads(book.read_text(encoding="utf-8")) if book.exists() else {}
    engine = None
    lengths = {}
    for line in lines:
        path = VOICE_DIR / "recorded" / f"{line['id']}.wav"
        if not path.exists():
            path = VOICE_DIR / f"{line['id']}.wav"
            key = hashlib.sha1(f"{VOICE}|{VOICE_SPEED}|{line['text']}".encode()).hexdigest()
            if made.get(line["id"]) != key or not path.exists():
                if engine is None:
                    if not (KOKORO_DIR / "kokoro-v1.0.onnx").exists():
                        raise SystemExit(f"Kokoro voice files not found in {KOKORO_DIR}. Set KOKORO_DIR to the folder that holds them.")
                    from kokoro_onnx import Kokoro
                    engine = Kokoro(str(KOKORO_DIR / "kokoro-v1.0.onnx"), str(KOKORO_DIR / "voices-v1.0.bin"))
                audio, rate = engine.create(line["text"], voice=VOICE, speed=VOICE_SPEED, lang="en-us")
                soundfile.write(str(path), audio, rate)
                made[line["id"]] = key
                book.write_text(json.dumps(made, indent=1), encoding="utf-8")
                print("voice", line["id"], flush=True)
        lengths[line["id"]] = round(soundfile.info(str(path)).duration * 1000)
    return lengths


def write_narration(timeline, path):
    """Lays every line on one track at the moment the picture expects it."""
    track = numpy.zeros(int(timeline["total"] / 1000 * VOICE_RATE) + VOICE_RATE, dtype="float32")
    for said in timeline["voiced"]:
        recorded = VOICE_DIR / "recorded" / f"{said['id']}.wav"
        audio, rate = soundfile.read(str(recorded if recorded.exists() else VOICE_DIR / f"{said['id']}.wav"), dtype="float32", always_2d=True)
        audio = audio.mean(axis=1)
        if rate != VOICE_RATE:
            audio = numpy.interp(numpy.arange(int(len(audio) * VOICE_RATE / rate)) * rate / VOICE_RATE, numpy.arange(len(audio)), audio)
        start = int(said["at"] / 1000 * VOICE_RATE)
        track[start:start + len(audio)] += audio[:len(track) - start]
    soundfile.write(str(path), track, VOICE_RATE)


# ---------- music bed ----------
# A generated ambient score, so the film needs no licensed music and comes out the same every run.
CHORDS = [  # D minor 9, B flat major 7, F major 9, C 6/9. Frequencies in Hz.
    [73.42, 110.0, 174.61, 261.63, 329.63],
    [58.27, 87.31, 146.83, 220.0, 349.23],
    [87.31, 130.81, 220.0, 329.63, 392.0],
    [65.41, 98.0, 164.81, 220.0, 293.66],
]
CHORD_SECONDS = 8.0
# How busy the score is in each scene: (pad level, pulse level, pulse notes per second).
MOOD = {"open": (0.7, 0.0, 2), "read": (0.85, 0.45, 2), "lapse": (1.0, 1.0, 4), "niagara": (0.8, 0.35, 2), "cold": (0.6, 0.2, 1), "fire": (0.9, 0.55, 2), "close": (1.0, 0.3, 2)}


def smooth(values, seconds):
    width = max(1, int(seconds * RATE))
    return numpy.convolve(values, numpy.ones(width) / width, mode="same")


def write_score(timeline, path):
    seconds = timeline["total"] / 1000 + 1
    n = int(seconds * RATE)
    t = numpy.arange(n) / RATE
    rng = numpy.random.default_rng(7)
    left, right = numpy.zeros(n), numpy.zeros(n)

    pad_level, pulse_level = numpy.zeros(n), numpy.zeros(n)
    for chapter in timeline["chapters"]:
        a, b = int(chapter["at"] / 1000 * RATE), int(chapter["end"] / 1000 * RATE)
        pad_level[a:b], pulse_level[a:b] = MOOD[chapter["id"]][0], MOOD[chapter["id"]][1]
    pad_level[b:], pulse_level[b:] = pad_level[b - 1], 0
    pad_level, pulse_level = smooth(pad_level, 2.5), smooth(pulse_level, 1.5)

    # Pad: each chord swells in and out over its neighbours, with slow, slightly detuned partials.
    for index in range(int(seconds / CHORD_SECONDS) + 1):
        centre = (index + 0.5) * CHORD_SECONDS
        swell = numpy.clip(1 - numpy.abs(t - centre) / (CHORD_SECONDS * 0.75), 0, 1) ** 1.5
        for k, freq in enumerate(CHORDS[index % len(CHORDS)]):
            weight = 0.5 / (1 + k * 0.55)
            for detune, pan in ((-0.0035, 0.25), (0.0, 0.5), (0.004, 0.75)):
                phase = rng.uniform(0, 6.283)
                wave = numpy.sin(6.283185 * freq * (1 + detune) * t + phase) + 0.25 * numpy.sin(6.283185 * freq * 2 * (1 + detune) * t + phase * 1.7)
                wobble = 1 + 0.18 * numpy.sin(6.283185 * (0.07 + 0.013 * k) * t + phase)
                voice = wave * swell * wobble * weight
                left += voice * (1 - pan)
                right += voice * pan
    left *= pad_level
    right *= pad_level

    # Pulse: soft plucked notes from the current chord, bouncing between the speakers.
    for chapter in timeline["chapters"]:
        per_second = MOOD[chapter["id"]][2]
        at, step = chapter["at"] / 1000, 1 / per_second
        count = 0
        while at < chapter["end"] / 1000:
            chord = CHORDS[int(at / CHORD_SECONDS) % len(CHORDS)]
            freq = chord[2 + (count * 3 + count // 4) % 3] * (2 if count % 4 != 0 else 1)
            start = int(at * RATE)
            length = min(int(0.9 * RATE), n - start)
            if length > 0:
                tt = numpy.arange(length) / RATE
                note = numpy.sin(6.283185 * freq * tt) * numpy.exp(-tt * 6) * numpy.minimum(tt * 400, 1) * 0.22 * pulse_level[start]
                pan = 0.25 if count % 2 else 0.75
                left[start:start + length] += note * (1 - pan)
                right[start:start + length] += note * pan
            at += step
            count += 1

    # A breath of filtered noise across each scene change.
    for chapter in timeline["chapters"][1:]:
        centre = chapter["at"] / 1000
        a, b = max(0, int((centre - 1.6) * RATE)), min(n, int((centre + 1.2) * RATE))
        noise = smooth(rng.standard_normal(b - a), 0.0012)
        shape = numpy.exp(-(((t[a:b] - centre) / 0.7) ** 2))
        left[a:b] += noise * shape * 0.5
        right[a:b] += noise[::-1] * shape * 0.5

    fade = numpy.minimum(numpy.minimum(t / 2.5, 1), numpy.clip((seconds - 0.6 - t) / 3.0, 0, 1))
    stereo = numpy.stack([left, right], axis=1) * fade[:, None]
    stereo *= 0.5 / numpy.abs(stereo).max()
    soundfile.write(str(path), stereo.astype("float32"), RATE)


def mix(ffmpeg, video, timeline, final):
    """Muxes picture, score and narration, levelled for online video. The score ducks under the voice."""
    narration, score = VOICE_DIR / "narration.wav", OUT / f"{NAME}-score.wav"
    write_narration(timeline, narration)
    write_score(timeline, score)
    graph = ("[2:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=70,acompressor=threshold=0.12:ratio=2.5:attack=8:release=160:makeup=1.6,asplit[voice][key];"
             "[1:a][key]sidechaincompress=threshold=0.02:ratio=7:attack=25:release=650[bed];"
             "[bed][voice]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11:linear=false,aresample=48000[out]")
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(video), "-i", str(score), "-i", str(narration), "-filter_complex", graph, "-map", "0:v", "-map", "[out]",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(final)], check=True)


# ---------- text outputs ----------
def stamp(ms):
    total = int(ms)
    return f"{total // 3600000:02}:{total // 60000 % 60:02}:{total // 1000 % 60:02},{total % 1000:03}"


def clock_label(ms):
    seconds = int(ms // 1000)
    return f"{seconds // 60}:{seconds % 60:02}"


def caption_parts(text):
    """Breaks a line at its sentences, then its commas, so no caption is too long to read."""
    parts = []
    for sentence in re.split(r"(?<=[.?!:])\s+", text):
        current = ""
        for piece in re.split(r"(?<=,)\s+", sentence):
            if current and len(current) + len(piece) + 1 > CAPTION_MAX:
                parts.append(current)
                current = piece
            else:
                current = f"{current} {piece}".strip()
        parts.append(current)
    return parts


def shown(text):
    """Narration is spelled for the voice. This is how it should read on screen."""
    return text.replace("T C Energy", "TC Energy")


def write_captions(timeline):
    lines = []
    count = 0
    for said in timeline["voiced"]:
        parts = caption_parts(shown(said["text"]))
        total = sum(map(len, parts))
        at = said["at"]
        for part in parts:
            end = at + (said["end"] - said["at"]) * len(part) / total
            count += 1
            lines += [str(count), f"{stamp(at)} --> {stamp(end)}", part, ""]
            at = end
    (FILM / f"{NAME}.srt").write_text("\n".join(lines), encoding="utf-8")


def write_script(timeline):
    parts = [f"# Gas Day: narration script\n\n{clock_label(timeline['total'])} in all. Written by `film/render.py` from `film/scenes.js`, filmed on flow data to "
             f"{timeline['dataTo']}. Voice: Kokoro `{VOICE}` at {VOICE_SPEED} speed. To replace a line with a real recording, save it as "
             f"`film/out/vo/recorded/<id>.wav`.\n"]
    for chapter in timeline["chapters"]:
        parts.append(f"\n## {clock_label(chapter['at'])} {chapter['title']}\n\n**Shows:** {chapter['feature']}\n\n**Camera:** {chapter['camera']}\n\n**Sound:** {chapter['sound']}\n")
        parts.extend(f"\n`{clock_label(said['at'])}` `{said['id']}` {shown(said['text'])}\n" for said in timeline["voiced"] if said["scene"] == chapter["id"])
    (FILM / "script.md").write_text("".join(parts), encoding="utf-8")


STORYBOARD_CSS = """
:root { --bg: #f6f6f4; --panel: #fff; --ink: #14161a; --muted: #5d6470; --line: #dcdcd6; --accent: #1c5cab; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0d0d0d; --panel: #1a1a19; --ink: #f0efec; --muted: #a3a29a; --line: #2c2c2a; --accent: #6da7ec; } }
:root[data-theme="dark"] { --bg: #0d0d0d; --panel: #1a1a19; --ink: #f0efec; --muted: #a3a29a; --line: #2c2c2a; --accent: #6da7ec; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 15px/1.5 system-ui, "Segoe UI", sans-serif; }
main { max-width: 1120px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 6px; }
.lede { color: var(--muted); margin: 0 0 28px; max-width: 72ch; }
section { margin-top: 36px; border-top: 1px solid var(--line); padding-top: 18px; }
h2 { font-size: 20px; margin: 0 0 2px; }
h2 time { color: var(--accent); font-variant-numeric: tabular-nums; margin-right: 10px; }
dl { display: grid; grid-template-columns: 76px 1fr; gap: 3px 12px; margin: 10px 0 16px; }
dt { color: var(--muted); font-size: 13px; }
dd { margin: 0; }
.boards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
figure { margin: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
figure img { display: block; width: 100%; height: auto; }
figcaption { padding: 10px 12px 12px; font-size: 14px; }
figcaption b { display: block; font-weight: 600; }
figcaption time { color: var(--accent); font-variant-numeric: tabular-nums; }
.said { margin: 0 0 16px; padding-left: 14px; border-left: 3px solid var(--accent); }
.said p { margin: 0 0 6px; }
.said time { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; margin-right: 6px; }
code { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; font-size: 13px; }
"""


def write_storyboard(timeline, boards):
    parts = []
    for chapter in timeline["chapters"]:
        figures = "".join(
            f"<figure><img alt=\"{html.escape(b['title'])}\" src=\"data:image/jpeg;base64,{b['image']}\"><figcaption>"
            f"<time>{clock_label(b['at'])}</time> <b>{html.escape(b['title'])}</b>{html.escape(b['why'])}</figcaption></figure>"
            for b in boards if b["scene"] == chapter["id"])
        said = "".join(f"<p><time>{clock_label(s['at'])}</time>{html.escape(shown(s['text']))}</p>" for s in timeline["voiced"] if s["scene"] == chapter["id"])
        parts.append(
            f"<section><h2><time>{clock_label(chapter['at'])}</time>{html.escape(chapter['title'])}</h2><dl>"
            f"<dt>Shows</dt><dd>{html.escape(chapter['feature'])}</dd>"
            f"<dt>Camera</dt><dd>{html.escape(chapter['camera'])}</dd>"
            f"<dt>Sound</dt><dd>{html.escape(chapter['sound'])}</dd></dl>"
            f"<div class=\"said\">{said}</div><div class=\"boards\">{figures}</div></section>")
    page = (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        f"<title>Gas Day Storyboard</title><style>{STORYBOARD_CSS}</style></head><body><main>"
        "<h1>Gas Day: explainer storyboard</h1>"
        f"<p class=\"lede\">{clock_label(timeline['total'])} in {len(timeline['chapters'])} scenes. Every frame here is a real frame of the application, captured by "
        "<code>python film/render.py --storyboard</code>. The narration, camera moves and on-screen labels come from <code>film/scenes.js</code>. "
        f"Filmed on flow data to {html.escape(timeline['dataTo'])}.</p>" + "".join(parts) + "</main></body></html>")
    path = FILM / "storyboard.html"
    path.write_text(page, encoding="utf-8")
    print("wrote", path, round(path.stat().st_size / 1e6, 1), "MB", flush=True)


# ---------- passes ----------
def storyboard_pass(playwright, port):
    browser, page, errors = open_page(playwright, port, SCALE_BOARD)
    timeline = page.evaluate("Director.timeline()")
    boards = []
    for board in timeline["boards"]:
        page.evaluate("ms => Director.seek(ms)", board["at"])
        shot = page.screenshot(type="jpeg", quality=74)
        board["image"] = base64.b64encode(shot).decode()
        boards.append(board)
        if board["title"] == THUMBNAIL_BOARD:
            (FILM / "thumbnail.jpg").write_bytes(page.screenshot(type="jpeg", quality=90))
    browser.close()
    write_storyboard(timeline, boards)
    write_captions(timeline)
    write_script(timeline)
    print("storyboard frames", len(boards), "length", clock_label(timeline["total"]), "errors", errors, flush=True)
    if errors:
        raise SystemExit("the page reported errors")


def save_stills(playwright, port, args):
    browser, page, errors = open_page(playwright, port, 1.0)
    for seconds in sorted(float(s) for s in args.stills.split(",")):
        scene = page.evaluate("ms => Director.seek(ms)", seconds * 1000)
        path = OUT / f"still-{seconds:06.1f}.jpg"
        path.write_bytes(page.screenshot(type="jpeg", quality=88))
        print("still", seconds, scene, path, flush=True)
    print("errors", errors, flush=True)
    browser.close()


def render_video(playwright, port, args):
    preview = args.preview
    fps = 24 if preview else args.fps
    browser, page, errors = open_page(playwright, port, SCALE_PREVIEW if preview else SCALE_MASTER)
    timeline = page.evaluate("Director.timeline()")
    first, last = 0, timeline["total"]
    if args.only:
        chapter = next((c for c in timeline["chapters"] if c["id"] == args.only), None)
        if not chapter:
            raise SystemExit(f"no scene called {args.only}. Scenes: {', '.join(c['id'] for c in timeline['chapters'])}")
        first, last = chapter["at"], chapter["end"]
    suffix = ("-preview" if preview else "") + (f"-{args.only}" if args.only else "")
    silent = OUT / f"{NAME}{suffix}-silent.mp4"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    encoder = subprocess.Popen(
        [ffmpeg, "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-r", str(fps), "-i", "-",
         # Screenshot JPEGs are full-range BT.601. Convert to standard video range so every player shows the same colours.
         "-vf", "scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=pc:out_range=tv,format=yuv420p",
         "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
         "-c:v", "libx264", "-preset", "veryfast" if preview else "medium", "-crf", "26" if preview else "18", "-movflags", "+faststart", str(silent)],
        stdin=subprocess.PIPE)
    started = time.time()
    frames = int((last - first) / 1000 * fps)
    for frame in range(frames):
        scene = page.evaluate("ms => Director.seek(ms)", first + frame * 1000 / fps)
        encoder.stdin.write(page.screenshot(type="jpeg", quality=72 if preview else 94))
        if frame % 240 == 0:
            print(f"frame {frame} of {frames} ({frame / fps:.0f}s of film), {time.time() - started:.0f}s elapsed, scene {scene}", flush=True)
    encoder.stdin.close()
    encoder.wait()
    browser.close()
    print("frames", frames, "seconds", round(frames / fps, 2), "errors", errors, flush=True)
    if errors:
        raise SystemExit("the page reported errors")
    if args.only:
        print("wrote", silent, "(one scene, no sound)", flush=True)
        return
    final = (OUT if preview else FILM) / f"{NAME}{suffix}.mp4"
    mix(ffmpeg, silent, timeline, final)
    silent.unlink()
    print("wrote", final, round(final.stat().st_size / 1e6, 1), "MB", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--storyboard", action="store_true", help="only the storyboard, script, captions and thumbnail")
    parser.add_argument("--preview", action="store_true", help="quick 960x540 render")
    parser.add_argument("--only", help="render one scene by id, no sound")
    parser.add_argument("--stills", help="comma-separated seconds to save as JPEGs")
    parser.add_argument("--no-build", action="store_true", help="film the existing dist folder instead of rebuilding the app")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if not args.no_build:
        subprocess.run("npm run build", shell=True, check=True, cwd=str(ROOT))
    server = serve()
    port = server.server_address[1]
    with sync_playwright() as playwright:
        if args.stills:
            save_stills(playwright, port, args)
        elif args.storyboard:
            storyboard_pass(playwright, port)
        else:
            if not args.preview and not args.only:
                storyboard_pass(playwright, port)
            render_video(playwright, port, args)


if __name__ == "__main__":
    main()
