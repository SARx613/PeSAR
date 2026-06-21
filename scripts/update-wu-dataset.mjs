#!/usr/bin/env node
/**
 * Regenerate public/wu-argentina.json — the bundled list of Western Union
 * points across Argentina, pulled from OpenStreetMap via the Overpass API.
 *
 * The app loads that JSON instead of querying Overpass live (Overpass is
 * frequently slow/overloaded, which made the in-app locator hang). Run this
 * occasionally to refresh the data.
 *
 *   node scripts/update-wu-dataset.mjs
 *
 * Requires Node 18+ (uses the built-in global fetch). No npm dependencies.
 *
 * Notes / honest limitations:
 *  - Coverage = whatever the OSM community has tagged. It's good in Buenos
 *    Aires, thinner in small towns. Western Union also operates through
 *    Pago Fácil / casas de cambio that aren't all tagged as WU in OSM.
 *  - Overpass mirrors throttle aggressively; the script retries across
 *    several mirrors before giving up.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'public', 'wu-argentina.json');

// Bounding box of Argentina: south, west, north, east.
const BBOX = '-55.1,-73.6,-21.8,-53.6';

// Mirrors in preference order. The .fr mirror has been the most reliable
// for this query, so it goes first.
const MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const QUERY = `[out:json][timeout:120];
(
  node["name"~"Western Union",i](${BBOX});
  node["brand"~"Western Union",i](${BBOX});
  node["money_transfer"="western_union"](${BBOX});
  way["name"~"Western Union",i](${BBOX});
  way["brand"~"Western Union",i](${BBOX});
);
out center;`;

const REQUEST_TIMEOUT_MS = 180_000;
const MAX_ROUNDS = 3;

function log(...args) {
  console.log('[wu-update]', ...args);
}

async function fetchFromOverpass() {
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    for (const mirror of MIRRORS) {
      const name = mirror.replace('https://', '').replace(/\/api.*/, '');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const started = Date.now();
      try {
        log(`round ${round} — trying ${name}…`);
        const res = await fetch(mirror, {
          method: 'POST',
          headers: {
            // Overpass requires a descriptive User-Agent; without one several
            // mirrors reject the request with 403/406.
            'User-Agent': 'PeSAR-WU-updater/1.0 (https://github.com/; rate dataset refresh)',
            'Content-Type': 'text/plain',
            Accept: 'application/json',
          },
          body: QUERY,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const elements = data.elements || [];
        log(`  → ${elements.length} raw elements in ${((Date.now() - started) / 1000).toFixed(0)}s`);
        if (elements.length > 0) return elements;
      } catch (err) {
        log(`  ✗ ${name}: ${err.message}`);
      } finally {
        clearTimeout(timer);
      }
      // Be gentle between mirror attempts.
      await new Promise((r) => setTimeout(r, 4000));
    }
    log(`round ${round} found nothing usable; waiting before retry…`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error('All Overpass mirrors failed. Try again later — they throttle a lot.');
}

/** Keep only points that are actually inside Argentina (the bbox spills into
 *  Uruguay, Chile, Paraguay & Brazil). */
function inArgentina(lat, lon) {
  if (lat > -21.7 || lat < -55.2) return false;
  if (lon < -73.6 || lon > -53.6) return false;
  // Rough Uruguay exclusion (east of the Uruguay river).
  if (lon > -58.0 && lat > -34.9 && lat < -30.0) return false;
  return true;
}

function normalize(elements) {
  const seen = new Set();
  const points = [];

  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    if (!inArgentina(lat, lon)) continue;

    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const t = e.tags || {};
    const tags = {};
    if (t.name) tags.name = t.name;
    if (t.brand && t.brand !== t.name) tags.brand = t.brand;
    if (t['addr:street']) tags['addr:street'] = t['addr:street'];
    if (t['addr:housenumber']) tags['addr:housenumber'] = t['addr:housenumber'];
    if (t['addr:city']) tags['addr:city'] = t['addr:city'];
    if (t['addr:suburb']) tags['addr:suburb'] = t['addr:suburb'];

    points.push({
      lat: +Number(lat).toFixed(6),
      lon: +Number(lon).toFixed(6),
      name: t.name || t.brand || 'Western Union',
      tags,
    });
  }

  return points;
}

async function main() {
  const elements = await fetchFromOverpass();
  const points = normalize(elements);

  if (points.length === 0) {
    throw new Error('No Argentina points after filtering — aborting so we do not overwrite good data with an empty file.');
  }

  const output = {
    source: 'OpenStreetMap (Overpass)',
    country: 'AR',
    updated: new Date().toISOString().slice(0, 10),
    count: points.length,
    points,
  };

  await writeFile(OUT_PATH, JSON.stringify(output));
  const withCity = points.filter((p) => p.tags['addr:city']).length;
  log(`Wrote ${points.length} points → ${OUT_PATH}`);
  log(`(${withCity} have a city address; the rest still have coordinates + name)`);
  log('Done. Review the diff, commit, and push to publish.');
}

main().catch((err) => {
  console.error('[wu-update] FAILED:', err.message);
  process.exit(1);
});
