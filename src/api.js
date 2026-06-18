const ORS_BASE = 'https://api.openrouteservice.org';

export async function geocode(address, proxyUrl, apiKey) {
  const url = proxyUrl
    ? `${proxyUrl}/geocode?text=${encodeURIComponent(address)}&country=USA`
    : `${ORS_BASE}/geocode/search?api_key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(address)}&size=1`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limit reached — try again in an hour');
    throw new Error(`Geocoding failed (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!json.features?.length) throw new Error(`Address not found: "${address}"`);
  const coords = json.features[0].geometry.coordinates; // [lng, lat]
  assertUSCoords(coords, address);
  return coords;
}

function assertUSCoords([lng, lat], address) {
  const inUS = (
    (lat >= 24.5 && lat <= 49.5 && lng >= -125   && lng <= -66.9) || // continental
    (lat >= 51   && lat <= 72   && lng >= -180    && lng <= -130)  || // Alaska
    (lat >= 18.9 && lat <= 22.2 && lng >= -160.2  && lng <= -154.8)|| // Hawaii
    (lat >= 17.9 && lat <= 18.5 && lng >= -67.3   && lng <= -65.2)    // Puerto Rico
  );
  if (!inUS) throw new Error(`Address not found in USA: "${address}"`);
}

// locations: array of [lng,lat]; sources/destinations: index arrays into locations.
// Returns { distances: number[][], durations: number[][] } — null cells = unreachable.
export async function fetchMatrix(locations, sources, destinations, proxyUrl, apiKey, units = 'km') {
  const endpoint = proxyUrl
    ? `${proxyUrl}/matrix`
    : `${ORS_BASE}/v2/matrix/driving-car`;
  const headers = proxyUrl
    ? { 'Content-Type': 'application/json', Accept: 'application/json' }
    : { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ locations, sources, destinations, metrics: ['distance', 'duration'], units }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limit reached — try again in an hour');
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Matrix request failed (HTTP ${res.status})`);
  }
  const json = await res.json();
  return { distances: json.distances, durations: json.durations };
}

// Multi-stop route: coords is [origin, stop1, stop2, ...].
// Returns { segments: [{ distance, duration }, ...] } — one per leg.
// Reuses the existing /directions Worker endpoint which proxies ORS directions natively.
export async function fetchRouteWaypoints(coords, proxyUrl, apiKey, units = 'km') {
  const endpoint = proxyUrl
    ? `${proxyUrl}/directions`
    : `${ORS_BASE}/v2/directions/driving-car`;
  const headers = proxyUrl
    ? { 'Content-Type': 'application/json', Accept: 'application/json' }
    : { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ coordinates: coords, units }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limit reached — try again in an hour');
    const body = await res.json().catch(() => null);
    if (res.status === 400 && body?.error?.code === 2004)
      throw new Error('Locations are too far apart for routing (>6000 km)');
    throw new Error(body?.error?.message || `Routing failed (HTTP ${res.status})`);
  }

  const json = await res.json();
  const segments = json.routes?.[0]?.segments;
  if (!segments?.length) throw new Error('No route found');
  return { segments: segments.map(s => ({ distance: s.distance, duration: s.duration })) };
}

export async function fetchRoute(from, to, proxyUrl, apiKey, units = 'km') {
  const endpoint = proxyUrl
    ? `${proxyUrl}/directions`
    : `${ORS_BASE}/v2/directions/driving-car`;
  const headers = proxyUrl
    ? { 'Content-Type': 'application/json', Accept: 'application/json' }
    : { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ coordinates: [from, to], units }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limit reached — try again in an hour');
    const body = await res.json().catch(() => null);
    const orsMsg = body?.error?.message;
    if (res.status === 400 && body?.error?.code === 2004) {
      throw new Error('Locations are too far apart for routing (>6000 km)');
    }
    throw new Error(orsMsg || `Routing failed (HTTP ${res.status})`);
  }
  const json = await res.json();
  const summary = json.routes?.[0]?.summary;
  if (!summary) throw new Error('No route found between these locations');
  return { distance: summary.distance, duration: summary.duration };
}
