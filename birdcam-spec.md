# Bird Cam Streamer — Spec (v0.1)

## Overview

A single-page web app that displays a grid of live bird-camera streams on an Android 11 tablet acting as a wall-mounted digital frame. The user can tap a thumbnail to watch a stream fullscreen, tap a "+" tile to add a new stream by URL, and tap a "Shuffle" tile to auto-rotate through streams on a configurable timer.

This is the gift-version prototype. State lives on the device (localStorage). A future v0.2 will move the stream list to Postgres and add admin / multi-device support.

## Target Hardware

Android 11 tablet (Amazon ASIN B0GKG7Z6B2). The app is delivered as a hosted web page. The tablet runs Fully Kiosk Browser locked to the app's URL.

## Goals & Non-Goals

In scope for v0.1:

- Dashboard grid of 20+ stream thumbnails
- Live-status detection that demotes offline / seasonal-off streams to the bottom
- Tap a thumbnail to play fullscreen
- Tap a "+" tile to add a new stream by URL
- Tap a "Shuffle" tile to auto-rotate (1, 5, 15, 30, or 60 minute intervals)
- Persist stream list and shuffle settings in localStorage
- Support YouTube and Twitch URLs at minimum, with a generic iframe fallback

Out of scope for v0.1:

- Server-side persistence (deferred to v0.2 with Postgres)
- User accounts
- Custom thumbnails per stream (use platform defaults)
- Audio control (let the embed handle it; default to muted to satisfy autoplay)
- Live thumbnail previews (use static YouTube thumb)
- Removing or reordering streams via UI (manual edit of localStorage for now)
- Notifications when a seasonal stream comes back online

## User Flows

### Initial load

1. App fetches `streams.json` from the server.
2. If localStorage has a saved list, use that; otherwise seed from `streams.json` and save it.
3. Kick off liveness detection in the background (does not block render).
4. Render the dashboard with all streams in seeded order, marking each as `status: 'unknown'`.
5. As liveness results return, re-sort and re-render.

### Watch a stream

1. User taps a thumbnail tile (live or not — non-live tiles are still tappable in case the classifier is wrong).
2. App swaps to a fullscreen view with an iframe loading the stream's embed URL.
3. Tapping anywhere on the screen returns to the dashboard.

### Add a stream

1. User taps the "+" tile.
2. Modal opens with a URL field and an optional name field.
3. On submit, the app parses the URL, detects platform, extracts the ID, derives the thumbnail, persists to localStorage, runs a liveness check on the new ID, and refreshes the dashboard.

### Shuffle

1. User taps the "Shuffle" tile.
2. Modal opens with interval options: 1, 5, 15, 30, 60 minutes.
3. On selection, the fullscreen player starts with a random *live* stream and rotates on the chosen interval. Non-live streams are excluded from shuffle.
4. Tapping the screen exits shuffle and returns to the dashboard.

## Data Model

```json
{
  "version": 1,
  "streams": [
    {
      "id": "string (unique slug)",
      "name": "string (display name)",
      "description": "string (location or context, optional)",
      "platform": "youtube | twitch | iframe",
      "videoId": "string (for youtube and twitch)",
      "url": "string (raw URL, required only for platform='iframe')",
      "source": "string (org name, optional)",
      "activeMonths": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    }
  ]
}
```

`activeMonths` is a fallback hint when no API key is configured (or for non-YouTube streams). It's an array of 1-indexed months in which the stream is *expected* to be live. Omit the field for year-round streams. The API result always wins over this hint.

Runtime adds the following transient fields to each stream (not persisted to JSON):

```js
stream.status      // 'live' | 'upcoming' | 'offline' | 'unknown'
stream.lastChecked // ISO timestamp of last liveness check
```

## Liveness Detection

### Primary: YouTube Data API v3

For all YouTube streams, batch-query the `videos.list` endpoint with `part=snippet`:

```
GET https://www.googleapis.com/youtube/v3/videos
    ?id=ID1,ID2,...,ID50
    &part=snippet
    &key={API_KEY}
```

The response includes `snippet.liveBroadcastContent` for each video, which returns:

- `"live"` → set `status: 'live'`
- `"upcoming"` → set `status: 'upcoming'`
- `"none"` → set `status: 'offline'` (video exists but isn't live)
- Missing from response → set `status: 'offline'` (video deleted or private)

One API call per page load batches all videos (max 50 per call). Quota cost: 1 unit per call. Free quota is 10k units/day — effectively unlimited for this use.

### Configuring the API key

The key is set in `index.html` as a top-level config object:

```js
const CONFIG = {
  youtubeApiKey: "AIza...",          // or null to skip API checks
  livenessCacheMinutes: 15,          // how long to trust a cached status
  refreshIntervalMinutes: 60         // how often to re-check
};
```

For the gift install, hardcode the key. For v0.2, move it server-side.

How to get a key: Google Cloud Console → APIs & Services → Library → enable "YouTube Data API v3" → Credentials → Create API Key. Restrict the key to "HTTP referrers" matching the app's domain (e.g. `https://birdcam.chiptown.io/*`).

### Fallback (no API key)

If `CONFIG.youtubeApiKey` is null or the API call fails:

1. Use `activeMonths` to classify each stream. If the current month is in `activeMonths` (or the field is missing), mark `status: 'unknown'`. Otherwise mark `status: 'offline'`.
2. Twitch streams: try a HEAD request to the live thumbnail URL. A 200 response with `Content-Length > 1000` suggests live (placeholders are tiny). A 404 means offline.
3. Generic iframe streams: always `status: 'unknown'`.

### Caching

Store the most recent classification per stream in localStorage:

```js
{
  "livenessCache": {
    "x10vL6_47Dw": { "status": "live",     "checkedAt": "2026-05-26T14:30:00Z" },
    "afsaYKQ3vac": { "status": "offline",  "checkedAt": "2026-05-26T14:30:00Z" }
  }
}
```

On load, use the cached value if `checkedAt` is within `livenessCacheMinutes` of now. Otherwise, re-check. Run a background refresh every `refreshIntervalMinutes` so the dashboard stays accurate without the user reloading.

## Sort Order

After classification, sort tiles in this order:

1. `live` (most recent first by ID order, or alphabetical by name — be deterministic)
2. `upcoming`
3. `unknown`
4. `offline`

Within each bucket, preserve seed order from `streams.json`. The "+" and "Shuffle" tiles always render first regardless of stream sorting (top-left, fixed position).

The first screen on the tablet should hold ~12 tiles. With 20+ streams seeded, the live ones (typically 8-15 of the 20 depending on season) will fill the visible area, and offline ones will be reachable by scrolling.

## Visual Treatment

- **Live tiles**: full color, small green dot in the corner, name overlay.
- **Upcoming tiles**: full color, small yellow dot, with "Soon" label.
- **Unknown tiles**: full color, no indicator (this is the default before classification returns).
- **Offline tiles**: greyscale or 40% opacity, "Off-season" label if the offline reason was `activeMonths`, otherwise no label.

## URL Parsing

| Input pattern | Platform | Extract |
|---|---|---|
| `youtube.com/watch?v=ABC` | youtube | videoId = `ABC` |
| `youtu.be/ABC` | youtube | videoId = `ABC` |
| `youtube.com/embed/ABC` | youtube | videoId = `ABC` |
| `youtube.com/live/ABC` | youtube | videoId = `ABC` |
| `twitch.tv/CHANNEL` | twitch | videoId = `CHANNEL` (live channel) |
| `twitch.tv/videos/123` | twitch | videoId = `123` (VOD) |
| anything else | iframe | url = raw input |

## Embed URL Construction

**YouTube:**
```
https://www.youtube.com/embed/{videoId}?autoplay=1&mute=1&controls=0&rel=0&playsinline=1
```

**Twitch (live channel):**
```
https://player.twitch.tv/?channel={videoId}&parent={HOST}&autoplay=true&muted=true
```
The `parent` parameter must equal the domain hosting the app (e.g. `birdcam.chiptown.io`). Twitch will refuse to load if it doesn't match. For local dev on the Mac mini, set `parent=localhost`.

**Generic iframe:** use `url` directly.

## Thumbnails

**YouTube:** `https://img.youtube.com/vi/{videoId}/maxresdefault.jpg`. Some streams don't have a maxres variant; wrap the `<img>` in an `onerror` handler that falls back to `hqdefault.jpg`.

**Twitch:** `https://static-cdn.jtvnw.net/previews-ttv/live_user_{videoId}-440x248.jpg`. Live previews are time-stamped, so add a cache-busting query string (e.g. `?t=` + minute) to refresh.

**Generic iframe:** no thumbnail available; render a placeholder tile with the stream name on a colored background. (Long-term: allow user to paste a thumbnail URL when adding the stream.)

## Tile Layout

- CSS grid, responsive columns (3–4 columns on tablet portrait, 4–5 landscape).
- Each tile: thumbnail image, name overlay at the bottom, source caption, status indicator dot.
- "+" and "Shuffle" tiles match the visual size of stream tiles and sit pinned at top-left.

## File Structure

```
birdcam/
├── index.html      # entire app
├── streams.json    # seed stream list
└── README.md
```

Single-file `index.html` (inline CSS + JS) for v0.1.

## Tablet Setup (Fully Kiosk Browser)

1. Install **Fully Kiosk Browser** from the Play Store (free version is fine).
2. Settings → Start URL: set to the app's hosted URL.
3. Settings → Web Content Settings: enable JavaScript, enable autoplay.
4. Settings → Web Auto Reload: ~6h (recovers from streams that drop or YouTube's ~8h iframe timeout).
5. Settings → Power: keep screen on, prevent sleep.
6. Optional: Settings → Kiosk Mode (PLUS feature) for full lockdown. Free version's fullscreen browsing is sufficient for a single-user gift.

## Hosting

Deploy as a static site to the same Railway account that powers RoastMyCompost. Subdomain like `birdcam.chiptown.io` — Twitch needs the `parent` param to match whatever domain serves the page, so commit to one host early. Vercel or Netlify also work; any static host is fine since there's no server-side code in v0.1.

## v0.2 Roadmap (Postgres-backed)

- Move `streams.json` to a Postgres `streams` table.
- Move API key server-side so it isn't in the client bundle.
- Server-side liveness checks on a cron, cached in Postgres; client just reads the cached `status`.
- Add an admin UI (separate page, password-protected) to add / remove / reorder streams from a phone.
- Add a `last_verified_at` column and flag dead streams in the admin.
- Auto-refresh the dashboard when the list changes (server-sent events or polling).
- Day/night mode: dim or sleep the display on a schedule (Wake Lock API + CSS overlay).
- Notifications when a long-dormant seasonal stream comes back online ("Royal Albatross is live again!").

## Open Questions

- Should the "Shuffle" pick streams randomly or rotate in a fixed order? **Default: random with no immediate repeat.**
- Should fullscreen play one stream until the user exits, or auto-return to the dashboard after N minutes if no interaction? **Default: stay on the stream until tapped.**
- Default shuffle interval? **Suggest 15 minutes.**
- What happens if a stream loaded fullscreen suddenly goes offline mid-watch? **For v0.1, no special handling — YouTube's own "stream has ended" message will show. For v0.2, listen for the iframe message event and auto-advance.**
