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
  return json.features[0].geometry.coordinates; // [lng, lat]
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
