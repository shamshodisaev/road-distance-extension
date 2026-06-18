// Strip leading warehouse/facility codes like "TEB4", "BOS5", "ONT8" that
// prefix Amazon and 3PL addresses on load boards, so the geocoder sees a
// plain city/state/zip string it can resolve.
export function preprocessAddress(text) {
  return text.replace(/^[A-Z]{2,5}\d+\s+/, '').trim();
}

export function readText(el) {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
    ? el.value.trim()
    : el.textContent.trim();
}

// Returns [lng, lat] for ORS, or null if text is not a coordinate pair.
export function parseCoords(text) {
  const m = text.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  return m ? [parseFloat(m[2]), parseFloat(m[1])] : null;
}

// Extracts a numeric distance from text like "211.1 mi", "211 miles", "340 km".
export function parseExistingDistance(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:mi(?:les?)?|km)/i);
  return m ? parseFloat(m[1]) : null;
}

// Straight-line distance in km between two ORS [lng, lat] coordinate pairs.
export function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

export function fmtDistance(distance, units) {
  return `${distance.toFixed(1)} ${units === 'mi' ? 'mi' : 'km'}`;
}

// Extracts ordered stop addresses from an array of .load-expander elements.
// Each expander may contain multiple address blocks (one per stop).
// Skips first <p> in each block (facility/vendor name), joins remaining non-empty texts.
// De-duplicates consecutive identical addresses (shared waypoints between segments).
export function extractStopAddresses(expanderEls, addressBlockSel = '.css-w1kk5u') {
  const addresses = [];
  for (const expander of expanderEls) {
    for (const block of expander.querySelectorAll(addressBlockSel)) {
      const paras = Array.from(block.querySelectorAll('p'));
      const addr = paras.slice(1).map(p => p.textContent.trim()).filter(Boolean).join(' ');
      if (addr) addresses.push(addr);
    }
  }
  return addresses.filter((a, i) => i === 0 || a !== addresses[i - 1]);
}
