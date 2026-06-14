import { loadConfig, resolveSelectors, getApiKey } from './config.js';
import { geocode, fetchRoute, fetchMatrix } from './api.js';
import { setLoading, setResult, setError, appendBadge } from './render.js';
import { readText, parseCoords, parseExistingDistance, fmtDuration, fmtDistance, haversineKm, preprocessAddress } from './utils.js';
import * as cache from './cache.js';

// ── Auth / coords helpers ─────────────────────────────────────────────────

async function resolveAuth(proxyUrl) {
  const apiKey = proxyUrl ? null : await getApiKey();
  if (!proxyUrl && !apiKey) throw new Error(
    'No proxy configured and no API key set — click the extension icon to add one.'
  );
  return apiKey;
}

async function resolveCoords(text, proxyUrl, apiKey) {
  const coords = parseCoords(text);
  if (coords) return coords;

  const normalized = preprocessAddress(text);
  const hit = cache.get(`geo:${normalized}`);
  if (hit) return hit;

  const result = await geocode(normalized, proxyUrl, apiKey);
  cache.set(`geo:${normalized}`, result, cache.TTL_GEO);
  return result;
}

async function cachedRoute(fromText, toText, from, to, proxyUrl, apiKey, units) {
  const k = `route:${fromText}|${toText}|${units}`;
  const hit = cache.get(k);
  if (hit) return hit;

  if (haversineKm(from, to) > 5500) {
    throw new Error('Locations are too far apart for routing (>6000 km)');
  }

  const result = await fetchRoute(from, to, proxyUrl, apiKey, units);
  cache.set(k, result);
  return result;
}

// ── Simple mode ───────────────────────────────────────────────────────────

async function processGroup(originEl, destEl, outputEl, proxyUrl, units) {
  const fromText = readText(originEl);
  const toText = readText(destEl);
  if (!fromText || !toText) return;

  setLoading(outputEl);

  try {
    const apiKey = await resolveAuth(proxyUrl);
    const [from, to] = await Promise.all([
      resolveCoords(fromText, proxyUrl, apiKey),
      resolveCoords(toText, proxyUrl, apiKey),
    ]);
    const result = await cachedRoute(fromText, toText, from, to, proxyUrl, apiKey, units);
    setResult(outputEl, result, units);
  } catch (err) {
    console.error('[RoadDistance]', err);
    setError(outputEl, err.message || 'Could not calculate route');
  }
}

// ── Load mode (batched) ───────────────────────────────────────────────────

async function processBatchLoads(pending, originText, originCoords, proxyUrl, apiKey, selectors) {
  const { units, loadDistanceThreshold } = selectors;

  // Geocode all load addresses in parallel; settle individually so one bad
  // address doesn't abort the whole batch.
  const geoResults = await Promise.allSettled([
    ...pending.map(c => resolveCoords(c.origText, proxyUrl, apiKey)),
    ...pending.map(c => resolveCoords(c.destText, proxyUrl, apiKey)),
  ]);

  const n = pending.length;
  const cards = pending.map((card, i) => {
    const og = geoResults[i];
    const dg = geoResults[n + i];
    if (og.status === 'rejected' || dg.status === 'rejected') {
      setError(card.distEl, (og.reason ?? dg.reason)?.message ?? 'Address not found');
      return null;
    }
    return { ...card, loadOrigCoords: og.value, loadDestCoords: dg.value };
  }).filter(Boolean);

  if (!cards.length) return;

  // Split into cached vs needs-API, applying haversine guard.
  const deadheadCache = cards.map(c => cache.get(`route:${originText}|${c.origText}|${units}`));
  const loadDistCache = cards.map(c => cache.get(`route:${c.origText}|${c.destText}|${units}`));

  const dhNeeded  = cards.map((c, i) => !deadheadCache[i] && haversineKm(originCoords, c.loadOrigCoords) <= 5500);
  const ldNeeded  = cards.map((c, i) => !loadDistCache[i]  && haversineKm(c.loadOrigCoords, c.loadDestCoords) <= 5500);
  const dhIndices = dhNeeded.reduce((a, v, i) => (v ? [...a, i] : a), []);
  const ldIndices = ldNeeded.reduce((a, v, i) => (v ? [...a, i] : a), []);

  // Deadhead matrix: 1 origin → N loadOrigins (one HTTP call).
  const deadheadResults = [...deadheadCache];
  if (dhIndices.length) {
    const locs = [originCoords, ...dhIndices.map(i => cards[i].loadOrigCoords)];
    const { distances, durations } = await fetchMatrix(
      locs, [0], dhIndices.map((_, j) => j + 1), proxyUrl, apiKey, units
    );
    dhIndices.forEach((cardIdx, j) => {
      if (distances[0][j] == null) return;
      const r = { distance: distances[0][j], duration: durations[0][j] };
      deadheadResults[cardIdx] = r;
      cache.set(`route:${originText}|${cards[cardIdx].origText}|${units}`, r);
    });
  }

  // Load-distance matrix: N loadOrigins → N loadDests (one HTTP call, diagonal).
  const loadDistResults = [...loadDistCache];
  if (ldIndices.length === 1) {
    const i = ldIndices[0];
    const r = await fetchRoute(cards[i].loadOrigCoords, cards[i].loadDestCoords, proxyUrl, apiKey, units);
    loadDistResults[i] = r;
    cache.set(`route:${cards[i].origText}|${cards[i].destText}|${units}`, r);
  } else if (ldIndices.length > 1) {
    const m = ldIndices.length;
    const locs = [
      ...ldIndices.map(i => cards[i].loadOrigCoords),
      ...ldIndices.map(i => cards[i].loadDestCoords),
    ];
    const { distances, durations } = await fetchMatrix(
      locs,
      ldIndices.map((_, j) => j),
      ldIndices.map((_, j) => j + m),
      proxyUrl, apiKey, units
    );
    ldIndices.forEach((cardIdx, j) => {
      if (distances[j][j] == null) return;
      const r = { distance: distances[j][j], duration: durations[j][j] };
      loadDistResults[cardIdx] = r;
      cache.set(`route:${cards[cardIdx].origText}|${cards[cardIdx].destText}|${units}`, r);
    });
  }

  // Render.
  cards.forEach((c, i) => {
    const dh = deadheadResults[i];
    if (!dh) {
      const tooFar = haversineKm(originCoords, c.loadOrigCoords) > 5500;
      setError(c.distEl, tooFar ? 'Too far to route' : 'No route found');
      return;
    }
    appendBadge(c.distEl, `${fmtDistance(dh.distance, units)} · ~${fmtDuration(dh.duration)}`, 'highlight');
    c.distEl.dataset.rdcState = 'done';

    const ld = loadDistResults[i];
    if (c.loadDistEl && ld) {
      const existing = parseExistingDistance(readText(c.loadDistEl));
      const diff = existing !== null ? Math.abs(ld.distance - existing) : Infinity;
      if (diff > loadDistanceThreshold) {
        appendBadge(c.loadDistEl, `${fmtDistance(ld.distance, units)} · ~${fmtDuration(ld.duration)}`, 'warn');
        c.loadDistEl.dataset.rdcState = 'corrected';
      }
    }
  });
}

// ── DOM finding helpers ───────────────────────────────────────────────────

function findInAncestor(anchor, selector) {
  let node = anchor.parentElement;
  while (node && node !== document.documentElement) {
    const found = node.querySelector(selector);
    if (found) return found;
    node = node.parentElement;
  }
  return null;
}

function findPair(outputEl, originSel, destSel) {
  let node = outputEl.parentElement;
  while (node && node !== document.documentElement) {
    const o = node.querySelector(originSel);
    const d = node.querySelector(destSel);
    if (o && d) return { originEl: o, destEl: d };
    node = node.parentElement;
  }
  return {
    originEl: document.querySelector(originSel),
    destEl: document.querySelector(destSel),
  };
}

// ── Top-level scan ────────────────────────────────────────────────────────

async function findAndProcessLoads(selectors, proxyUrl) {
  const originEl = document.querySelector(selectors.origin);
  if (!originEl) return;

  const pending = [];
  document.querySelectorAll(`${selectors.distanceToLoadOrigin}:not([data-rdc-state])`).forEach(distEl => {
    const loadOriginEl = findInAncestor(distEl, selectors.loadOrigin);
    const loadDestEl   = findInAncestor(distEl, selectors.loadDestination);
    const loadDistEl   = selectors.loadDistance ? findInAncestor(distEl, selectors.loadDistance) : null;
    if (loadOriginEl && loadDestEl) {
      pending.push({
        distEl, loadDistEl,
        origText: readText(loadOriginEl),
        destText: readText(loadDestEl),
      });
    }
  });
  if (!pending.length) return;

  pending.forEach(({ distEl }) => { distEl.dataset.rdcState = 'loading'; });

  try {
    const apiKey      = await resolveAuth(proxyUrl);
    const originText  = readText(originEl);
    const originCoords = await resolveCoords(originText, proxyUrl, apiKey);
    await processBatchLoads(pending, originText, originCoords, proxyUrl, apiKey, selectors);
  } catch (err) {
    console.error('[RoadDistance]', err);
    pending.forEach(({ distEl }) => {
      if (distEl.dataset.rdcState === 'loading') setError(distEl, err.message || 'Could not calculate route');
    });
  }
}

function findAndProcessSimple(selectors, proxyUrl) {
  document
    .querySelectorAll(`${selectors.output}:not([data-rdc-state])`)
    .forEach((outputEl) => {
      const g = outputEl.dataset.rdcGroup;
      let originEl, destEl;

      if (g) {
        originEl = document.querySelector(`${selectors.origin}[data-rdc-group="${g}"]`);
        destEl   = document.querySelector(`${selectors.destination}[data-rdc-group="${g}"]`);
      } else {
        ({ originEl, destEl } = findPair(outputEl, selectors.origin, selectors.destination));
      }

      if (originEl && destEl) processGroup(originEl, destEl, outputEl, proxyUrl, selectors.units);
    });
}

function findAndProcess(selectors, proxyUrl) {
  if (selectors.loadOrigin && selectors.distanceToLoadOrigin) {
    findAndProcessLoads(selectors, proxyUrl);
  } else {
    findAndProcessSimple(selectors, proxyUrl);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

async function init() {
  const config = await loadConfig();
  const selectors = resolveSelectors(config);
  const proxyUrl = (config.proxyUrl || '').trim() || null;

  const run = () => findAndProcess(selectors, proxyUrl);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  let debounce;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(run, 400);
  }).observe(document.body, { childList: true, subtree: true });
}

init();
