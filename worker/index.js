const ORS_BASE = 'https://api.openrouteservice.org';
const RATE_LIMIT = 100; // requests per IP per hour
const RATE_TTL = 3600;  // seconds

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

async function checkRateLimit(ip, kv) {
  const key = `rl:${ip}`;
  const count = parseInt((await kv.get(key)) || '0');
  if (count >= RATE_LIMIT) return false;
  await kv.put(key, String(count + 1), { expirationTtl: RATE_TTL });
  return true;
}

async function handleGeocode(url, env) {
  const text = url.searchParams.get('text');
  if (!text) return json({ error: 'Missing "text" parameter' }, 400);

  const country = url.searchParams.get('country') || 'USA';
  const orsUrl =
    `${ORS_BASE}/geocode/search` +
    `?api_key=${encodeURIComponent(env.ORS_API_KEY)}` +
    `&text=${encodeURIComponent(text)}&size=1` +
    `&boundary.country=${encodeURIComponent(country)}`;

  const res = await fetch(orsUrl);
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

async function handleDirections(request, env) {
  const body = await request.json();
  const res = await fetch(`${ORS_BASE}/v2/directions/driving-car`, {
    method: 'POST',
    headers: {
      Authorization: env.ORS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const responseBody = await res.text();
  return new Response(responseBody, {
    status: res.status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const allowed = await checkRateLimit(ip, env.RATE_KV);
    if (!allowed) {
      return json({ error: 'Rate limit exceeded. Try again later.' }, 429);
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/geocode' && request.method === 'GET') {
        return await handleGeocode(url, env);
      }
      if (url.pathname === '/directions' && request.method === 'POST') {
        return await handleDirections(request, env);
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: err.message || 'Upstream error' }, 502);
    }
  },
};
