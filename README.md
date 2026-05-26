# Wedge's World of Birds

A single-page web app that turns a wall-mounted Android tablet into a digital
bird-cam frame. Cycles through ~20 live YouTube and iframe bird cameras, sorts
live streams to the top, tucks off-season cams at the bottom, and lets you tap
a tile to watch fullscreen.

Built as a birthday gift; v0.1 is intentionally static and client-only.

## Status

v0.1 — feature-complete per [`birdcam-spec.md`](./birdcam-spec.md):

- Dashboard grid of 21 seeded streams (Cornell, Explore.org, Big Bear, etc.)
- YouTube Data API v3 liveness detection, batched and cached in localStorage
- `activeMonths` fallback when no API key is configured or for non-YouTube streams
- Sort order: live → upcoming → unknown → offline; off-season tiles get a badge
- Tap a tile → fullscreen iframe; tap anywhere → back
- `+` tile adds streams by URL (YouTube `/watch`, `/embed`, `/live`, `/shorts`,
  `youtu.be`, `twitch.tv/CHANNEL`, `twitch.tv/videos/ID`, or raw iframe URL)
- Shuffle tile rotates random live streams on 1 / 5 / 15 / 30 / 60 min intervals
- All state in localStorage; no server, no build step

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. First load seeds [`streams.json`](./streams.json)
into localStorage and paints the grid; liveness results arrive a moment later
and re-sort the tiles.

## YouTube API key

Liveness detection is much more accurate with a YouTube Data API v3 key. To
enable it locally:

```sh
cp config.local.example.js config.local.js
# then paste your key into config.local.js
```

`config.local.js` is gitignored — the key never lands in commit history.

Without a key, the app falls back to the `activeMonths` heuristic in
[`streams.json`](./streams.json): if the current month is in a stream's window
(or the field is omitted), it stays `unknown`; otherwise it shows offline with
an *Off-season* badge.

How to get a key: Google Cloud Console → APIs & Services → Library → enable
**YouTube Data API v3** → Credentials → Create API Key. Quota is 10k units/day;
one page load costs 1 unit, so the free tier is effectively unlimited here.

## Files

```
index.html                  the whole app — HTML, CSS, JS inline
streams.json                seed list of 21 bird cams
config.local.example.js     template for your API key
config.local.js             gitignored; holds the real key
birdcam-spec.md             v0.1 spec
```

## Deploying to the tablet

1. Host `index.html` + `streams.json` (+ `config.local.js` for the API key) on
   any static host. Railway, Vercel, Netlify, GitHub Pages all work.
2. On the tablet, install **Fully Kiosk Browser** from the Play Store.
3. Settings → Start URL → the app's URL.
4. Settings → Web Content → enable JavaScript and autoplay.
5. Settings → Web Auto Reload → ~6 hours (recovers from dropped streams).
6. Settings → Power → keep screen on, prevent sleep.

If you switch domains, update the YouTube API key's HTTP referrer restriction
in Google Cloud Console.

## v0.2 ideas

Server-side stream list (Postgres), server-side liveness cron, an admin UI for
adding/reordering streams from a phone, day/night dimming on a schedule,
notifications when a long-dormant seasonal cam comes back online. See the
roadmap section in [`birdcam-spec.md`](./birdcam-spec.md) for the full list.
