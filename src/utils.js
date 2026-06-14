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

export function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

export function fmtDistance(distance, units) {
  return `${distance.toFixed(1)} ${units === 'mi' ? 'mi' : 'km'}`;
}
