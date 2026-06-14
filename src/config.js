const FALLBACK_SELECTORS = {
  origin: '.road-distance-origin',
  destination: '.road-distance-destination',
  output: '.road-distance-output',
  loadOrigin: null,
  loadDestination: null,
  distanceToLoadOrigin: null,
  loadDistance: null,
  units: 'km',
  loadDistanceThreshold: 80,
};

export function getApiKey() {
  return new Promise((resolve) =>
    chrome.storage.sync.get('orsApiKey', (d) => resolve(d.orsApiKey || ''))
  );
}

export async function loadConfig() {
  try {
    const res = await fetch(chrome.runtime.getURL('config.json'));
    return await res.json();
  } catch {
    return { defaults: {}, rules: [] };
  }
}

function urlMatches(pattern, url) {
  const re = new RegExp(
    '^' +
      pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') +
      '$'
  );
  return re.test(url);
}

function validated(sel, fallback) {
  if (!sel) return fallback;
  try {
    document.querySelector(sel);
    return sel;
  } catch {
    console.warn(`[RoadDistance] Invalid selector "${sel}" in config.json — falling back to "${fallback}"`);
    return fallback;
  }
}

export function resolveSelectors(config) {
  const defaults = { ...FALLBACK_SELECTORS, ...config.defaults };
  const rule = (config.rules || []).find(
    (r) => r.matches && urlMatches(r.matches, window.location.href)
  );
  const r = rule || {};

  return {
    origin:               validated(r.origin               || defaults.origin,               FALLBACK_SELECTORS.origin),
    destination:          validated(r.destination          || defaults.destination,          FALLBACK_SELECTORS.destination),
    output:               validated(r.output               || defaults.output,               FALLBACK_SELECTORS.output),
    loadOrigin:           validated(r.loadOrigin           || defaults.loadOrigin,           null),
    loadDestination:      validated(r.loadDestination      || defaults.loadDestination,      null),
    distanceToLoadOrigin: validated(r.distanceToLoadOrigin || defaults.distanceToLoadOrigin, null),
    loadDistance:         validated(r.loadDistance         || defaults.loadDistance,         null),
    units:                r.units                ?? defaults.units,
    loadDistanceThreshold: r.loadDistanceThreshold ?? defaults.loadDistanceThreshold,
  };
}
