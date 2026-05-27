#!/usr/bin/env node
// scripts/find-live-by-name.mjs
//
// For a list of free-text queries, asks the YouTube Data API for any
// currently-live broadcasts that match. Useful when we know what a cam
// is called but don't know its current videoId.
//
// Usage:
//   node scripts/find-live-by-name.mjs
//   (edit the QUERIES array below to change the search terms)
//
// Quota cost: 100 units per query (search.list).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const QUERIES = [
  ['decorah-eagles',              'Decorah Eagles bald eagle nest'],
  ['decorah-north-eagles',        'Decorah North Eagles'],
  ['audubon-osprey-hog-island',   'Hog Island Osprey Audubon'],
  ['audubon-puffin-loafing-ledge', 'Hog Island Puffin Audubon'],
  ['great-horned-owl-montana',    'Great Horned Owl cam'],
  ['panama-fruit-feeder-explore', 'Panama Fruit Feeder Cornell'],
];

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
if (!KEY) { console.error('No API key.'); process.exit(1); }
const REFERER = process.env.WWOB_REFERER || 'https://wwob.chiptown.ai/';

async function api(url) {
  const res = await fetch(url, { headers: { Referer: REFERER } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0,300)}`);
  return res.json();
}

for (const [streamId, q] of QUERIES) {
  console.log(`\n[${streamId}] query: "${q}"`);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&eventType=live&type=video&maxResults=5&key=${KEY}`;
  try {
    const data = await api(url);
    if (!data.items || data.items.length === 0) {
      console.log('  → no live results');
      continue;
    }
    for (const item of data.items) {
      console.log(`  → ${item.id.videoId}  ch="${item.snippet.channelTitle}"`);
      console.log(`    "${item.snippet.title}"`);
    }
  } catch (e) {
    console.log(`  → ${e.message}`);
  }
}
