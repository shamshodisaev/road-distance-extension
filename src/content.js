import { loadConfig, resolveSelectors, getApiKey } from './config.js';
import { geocode, fetchRoute } from './api.js';
import { setLoading, setResult, setError, appendBadge } from './render.js';
import { readText, parseCoords, parseExistingDistance, fmtDuration, fmtDistance, haversineKm } from './utils.js';
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

  const hit = cache.get(`geo:${text}`);
  if (hit) return hit;

  const result = await geocode(text, proxyUrl, apiKey);
  cache.set(`geo:${text}`, result, cache.TTL_GEO);
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

// ── Load mode ─────────────────────────────────────────────────────────────

async function processLoadGroup(
  originEl, loadOriginEl, loadDestEl,
  distToLoadOriginEl, loadDistEl,
  proxyUrl, selectors
) {
  const originText   = readText(originEl);
  const loadOrigText = readText(loadOriginEl);
  const loadDestText = readText(loadDestEl);
  if (!originText || !loadOrigText || !loadDestText) return;

  distToLoadOriginEl.dataset.rdcState = 'loading';

  try {
    const apiKey = await resolveAuth(proxyUrl);
    const { units, loadDistanceThreshold } = selectors;

    const [originCoords, loadOrigCoords, loadDestCoords] = await Promise.all([
      resolveCoords(originText, proxyUrl, apiKey),
      resolveCoords(loadOrigText, proxyUrl, apiKey),
      resolveCoords(loadDestText, proxyUrl, apiKey),
    ]);

    const [toLoadOrig, loadRoute] = await Promise.all([
      cachedRoute(originText, loadOrigText, originCoords, loadOrigCoords, proxyUrl, apiKey, units),
      cachedRoute(loadOrigText, loadDestText, loadOrigCoords, loadDestCoords, proxyUrl, apiKey, units),
    ]);

    // Always write origin → loadOrigin distance.
    appendBadge(
      distToLoadOriginEl,
      `${fmtDistance(toLoadOrig.distance, units)} · ~${fmtDuration(toLoadOrig.duration)}`,
      'highlight'
    );
    distToLoadOriginEl.dataset.rdcState = 'done';

    // Only correct loadDistance if the difference exceeds the threshold.
    if (loadDistEl) {
      const existing = parseExistingDistance(readText(loadDistEl));
      const diff = existing !== null ? Math.abs(loadRoute.distance - existing) : Infinity;
      if (diff > loadDistanceThreshold) {
        appendBadge(
          loadDistEl,
          `${fmtDistance(loadRoute.distance, units)} · ~${fmtDuration(loadRoute.duration)}`,
          'warn'
        );
        loadDistEl.dataset.rdcState = 'corrected';
      }
    }
  } catch (err) {
    console.error('[RoadDistance]', err);
    setError(distToLoadOriginEl, err.message || 'Could not calculate route');
  }
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

function findAndProcessLoads(selectors, proxyUrl) {
  const originEl = document.querySelector(selectors.origin);
  if (!originEl) return;

  document
    .querySelectorAll(`${selectors.distanceToLoadOrigin}:not([data-rdc-state])`)
    .forEach((distEl) => {
      const loadOriginEl = findInAncestor(distEl, selectors.loadOrigin);
      const loadDestEl   = findInAncestor(distEl, selectors.loadDestination);
      const loadDistEl   = selectors.loadDistance
        ? findInAncestor(distEl, selectors.loadDistance)
        : null;

      if (loadOriginEl && loadDestEl) {
        processLoadGroup(originEl, loadOriginEl, loadDestEl, distEl, loadDistEl, proxyUrl, selectors);
      }
    });
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
