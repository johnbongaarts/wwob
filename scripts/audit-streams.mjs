#!/usr/bin/env node
// scripts/audit-streams.mjs
//
// Audits streams.json against the YouTube Data API and suggests replacements.
//
// Usage:
//   YOUTUBE_API_KEY=AIza... node scripts/audit-streams.mjs
// or (auto-reads the key from ./config.local.js if YOUTUBE_API_KEY is unset):
//   node scripts/audit-streams.mjs
//
// What it does:
//   1. Batched videos.list call for every YouTube stream — reports
//      liveBroadcastContent (live/upcoming/none) per id, plus the channel.
//   2. For each stream the API says is not live, queries
//      search.list?eventType=live for that channel and prints any
//      currently-broadcasting videos as replacement candidates.
//   3. Lists every iframe stream so you can decide whether to replace
//      the iframe URL with a YouTube videoId.
//
// Quota cost: ~1 unit per 50 youtube streams (videos.list) + 100 units per
// unique channel searched (search.list). Free quota is 10k/day.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  try {
    const text = fs.readFileSync(path.join(root, 'config.local.js'), 'utf8');
    const m = text.match(/youtubeApiKey\s*:\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
  } catch {}
  return null;
}

const KEY = loadKey();
if (!KEY) {
  console.error('No API key. Set YOUTUBE_API_KEY or create config.local.js.');
  process.exit(1);
}

const streamsPath = path.join(root, 'streams.json');
const data = JSON.parse(fs.readFileSync(streamsPath, 'utf8'));
const yt = data.streams.filter(s => s.platform === 'youtube');
const iframes = data.streams.filter(s => s.platform === 'iframe');

console.log(`Auditing ${yt.length} YouTube + ${iframes.length} iframe streams\n`);

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Send a Referer that matches the key's HTTP referrer allowlist so the
// API accepts a call from a non-browser context. Falls back to localhost
// for keys set up with only the dev allowlist entry.
const REFERER = process.env.WWOB_REFERER || 'https://wwob.chiptown.ai/';

async function api(url) {
  const res = await fetch(url, { headers: { Referer: REFERER } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// 1) videos.list for every YouTube stream
const videoData = {};
for (const batch of chunk(yt.map(s => s.videoId), 50)) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.join(',')}&key=${KEY}`;
  const data = await api(url);
  for (const item of data.items || []) {
    videoData[item.id] = {
      title: item.snippet.title,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      lbc: item.snippet.liveBroadcastContent,
    };
  }
}

// 2) Report per-stream status and collect the "not live" set
const stale = [];
const tag = s => s === 'live' ? 'LIVE'
              : s === 'upcoming' ? 'UPCOMING'
              : s === 'none' ? 'OFFLINE'
              : 'MISSING';

console.log('Per-stream status:');
for (const s of yt) {
  const d = videoData[s.videoId];
  if (!d) {
    console.log(`  ${'MISSING'.padEnd(9)} ${s.id.padEnd(36)} videoId=${s.videoId} (deleted or private)`);
    stale.push({ ...s, channelId: null, channelTitle: '(unknown)' });
    continue;
  }
  console.log(`  ${tag(d.lbc).padEnd(9)} ${s.id.padEnd(36)} ch="${d.channelTitle}"`);
  if (d.lbc === 'none') stale.push({ ...s, channelId: d.channelId, channelTitle: d.channelTitle });
}

if (stale.length === 0) {
  console.log('\nAll YouTube streams live or upcoming. Nothing to fix.');
} else {
  // 3) For each unique channel of a stale stream, search for current live broadcasts
  console.log(`\n${stale.length} stream(s) not live. Searching their channels for current broadcasts:\n`);

  const channels = new Map();
  for (const s of stale) {
    if (!s.channelId) continue;
    if (!channels.has(s.channelId)) channels.set(s.channelId, []);
    channels.get(s.channelId).push(s);
  }

  for (const [channelId, members] of channels) {
    const channelTitle = members[0].channelTitle;
    console.log(`channel: ${channelTitle}  (${channelId})`);
    console.log(`  affects: ${members.map(m => m.id).join(', ')}`);
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${KEY}`;
      const data = await api(searchUrl);
      if (!data.items || data.items.length === 0) {
        console.log('  → no live broadcasts on this channel right now');
      } else {
        for (const item of data.items) {
          console.log(`  → LIVE NOW: videoId=${item.id.videoId}`);
          console.log(`              "${item.snippet.title}"`);
          console.log(`              https://www.youtube.com/watch?v=${item.id.videoId}`);
        }
      }
    } catch (e) {
      console.log(`  → search failed: ${e.message}`);
    }
    console.log();
  }
}

// 4) Iframe streams — flag for manual review
if (iframes.length > 0) {
  console.log('iframe streams (often page URLs that won\'t embed; consider switching to youtube):');
  for (const s of iframes) {
    console.log(`  ${s.id.padEnd(36)} ${s.url}`);
  }
}
