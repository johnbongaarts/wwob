# Wedge's World of Birds

A single-page web app that turns a wall-mounted Android tablet into a digital
bird-cam frame. Cycles through ~40 live bird cams from 6 continents, sorts
live streams to the top, tucks off-season cams at the bottom, and lets you tap
a tile to watch fullscreen.

Built as a birthday gift; v0.1 is intentionally static and client-only.

**Live at:** [wwob.chiptown.ai](https://wwob.chiptown.ai) (deployed to Railway,
auto-redeploys on push to `main`)

## Status

v0.1 — feature-complete per [`birdcam-spec.md`](./birdcam-spec.md):

- 39 seeded YouTube streams; ~30 live at any given time
- YouTube Data API v3 liveness detection, batched and cached in localStorage
- `activeMonths` fallback when no API key is configured
- Sort order: live → upcoming → unknown → offline; off-season tiles get a badge
- Tap a tile → fullscreen iframe; tap anywhere → back
- `+` tile adds streams by URL (YouTube `/watch`, `/embed`, `/live`, `/shorts`,
  `youtu.be`, `twitch.tv/CHANNEL`, `twitch.tv/videos/ID`, or raw iframe URL)
- Shuffle tile rotates random live streams on 1 / 5 / 15 / 30 / 60 min intervals
- Canonical stream list ([`streams.json`](./streams.json)) is served by
  Railway and re-fetched on every page load; merge-on-load reconciles
  cached browsers automatically (adds new seeds, updates rotated videoIds,
  drops removed seeds, preserves user-added streams)
- User-added streams (via the `+` tile) and the liveness cache live in
  localStorage; no database, no build step

## Run locally

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>. First load seeds [`streams.json`](./streams.json)
into localStorage and paints the grid; liveness results arrive a moment later
and re-sort the tiles.

To enable YouTube liveness detection locally:

```sh
cp config.local.example.js config.local.js
# paste your YouTube Data API v3 key into config.local.js
```

`config.local.js` is gitignored. Without it, the app uses the `activeMonths`
heuristic only — coarser but functional.

## Troubleshooting

> Look here first. Each fix is one or two commands.

**A tile shows offline but the stream is actually live**
```sh
node scripts/audit-streams.mjs
```
Prints the current status of every YouTube stream. For each offline one, it
also searches the channel for currently-broadcasting videos and prints
candidate replacement videoIds. Edit [`streams.json`](./streams.json) with the
new id, `git push`, done. Railway redeploys in ~90 seconds; cached browsers
pick up the change on next reload.

**A tile is missing entirely / I want to remove a stream**

Delete it from [`streams.json`](./streams.json), `git push`. The merge logic
tracks which ids are seeds, so cached browsers drop it on next load.

**A tile says "Off-season"**

Working as designed. The stream's `activeMonths` window says it isn't broadcast
this time of year. Will come back in season.

**Site won't load at all**

Check Railway → wwob project → Deployments. Most recent deploy should be green.
If a deploy failed, the **Build Logs** tab tells you why. Common cause: a typo
in `streams.json` breaking JSON parsing.

**Liveness detection stopped working (all tiles `unknown`)**

The API key got blocked or hit quota. Open browser DevTools → Network → look
at the call to `googleapis.com/youtube/v3/videos`. A 403 means the referrer
restriction needs updating (Google Cloud Console → Credentials → key → HTTP
referrers must include `https://wwob.chiptown.ai/*`). A 429 means daily quota
hit — wait until midnight Pacific.

**I changed something and the dashboard looks weird**

Nuke local cache and re-seed from scratch:
```js
// In browser DevTools console:
localStorage.clear(); location.reload();
```

**Add a brand-new stream by URL** (without editing `streams.json`)

Tap the `+` tile in the bottom right, paste the YouTube watch URL, give it a
name. Saved to localStorage only (just on that one device). To share across
devices, add it to `streams.json` and push.

**Find the YouTube videoId for a cam you only have a webpage for**
```sh
node scripts/find-live-by-name.mjs
# edit the QUERIES array in that file with what you're looking for
```
Returns currently-live YouTube broadcasts matching free-text queries.

**Update the YouTube API key**

Two places:
1. Locally: edit `config.local.js`.
2. Production: Railway → Variables → `YOUTUBE_API_KEY`. Save triggers redeploy.

## Files

```
index.html                  the whole app — HTML, CSS, JS inline
streams.json                seed list of bird cams
config.local.example.js     template for your API key
config.local.js             gitignored; holds the real key
birdcam-spec.md             v0.1 spec
Dockerfile                  nginx image, used by Railway
nginx.conf.template         server config (listens on $PORT)
docker-entrypoint.d/        writes config.local.js from $YOUTUBE_API_KEY at startup
scripts/audit-streams.mjs   reports liveness + suggests replacements
scripts/find-live-by-name.mjs  searches YouTube for currently-live cams by name
```

## Deploying to the tablet

1. App is already live at <https://wwob.chiptown.ai>.
2. On the tablet, install **Fully Kiosk Browser** from the Play Store.
3. Settings → Start URL → `https://wwob.chiptown.ai`
4. Settings → Web Content → enable JavaScript and autoplay.
5. Settings → Web Auto Reload → ~6 hours (recovers from dropped streams).
6. Settings → Power → keep screen on, prevent sleep.

If you ever change domains, update the YouTube API key's HTTP referrer
restriction in Google Cloud Console.

## v0.2 ideas

The canonical stream list is already on Railway; v0.2 would make it *mutable
without a git push*. That means a Postgres-backed list with an admin API and
a phone-friendly UI for adding / reordering / removing streams. Also: server-
side liveness cron (so the dashboard reads a cached status instead of calling
the YouTube API from the browser), day/night dimming on a schedule, and
notifications when a long-dormant seasonal cam comes back online. See the
roadmap section in [`birdcam-spec.md`](./birdcam-spec.md) for the full list.
