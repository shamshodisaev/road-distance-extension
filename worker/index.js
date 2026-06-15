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

async function handleMatrix(request, env) {
  const body = await request.json();
  const res = await fetch(`${ORS_BASE}/v2/matrix/driving-car`, {
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

async function handleRegister(request, env) {
  const { device_id, email, company, version } = await request.json();
  if (!device_id || !email) return json({ error: 'device_id and email are required' }, 400);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (device_id, email, company, version, installed_at, last_seen)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET email=excluded.email, company=excluded.company,
       version=excluded.version, last_seen=excluded.last_seen`
  ).bind(device_id, email.trim().toLowerCase(), company?.trim() || null, version || null, now, now).run();

  return json({ ok: true });
}

async function handlePing(request, env) {
  const { device_id, version } = await request.json();
  if (!device_id) return json({ error: 'device_id required' }, 400);

  await env.DB.prepare(
    `UPDATE users SET last_seen=?, version=? WHERE device_id=?`
  ).bind(Date.now(), version || null, device_id).run();

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Registration and ping are exempt from rate limiting.
    try {
      if (url.pathname === '/register' && request.method === 'POST') {
        return await handleRegister(request, env);
      }
      if (url.pathname === '/ping' && request.method === 'POST') {
        return await handlePing(request, env);
      }
    } catch (err) {
      return json({ error: err.message || 'Server error' }, 500);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const allowed = await checkRateLimit(ip, env.RATE_KV);
    if (!allowed) {
      return json({ error: 'Rate limit exceeded. Try again later.' }, 429);
    }

    try {
      if (url.pathname === '/geocode' && request.method === 'GET') {
        return await handleGeocode(url, env);
      }
      if (url.pathname === '/directions' && request.method === 'POST') {
        return await handleDirections(request, env);
      }
      if (url.pathname === '/matrix' && request.method === 'POST') {
        return await handleMatrix(request, env);
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: err.message || 'Upstream error' }, 502);
    }
  },
};
