const ORS_BASE = 'https://api.openrouteservice.org';
const RATE_LIMIT = 100; // requests per IP per hour
const RATE_TTL = 3600;  // seconds

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────

function requireAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === env.ADMIN_SECRET;
}

// ── Rate limit ────────────────────────────────────────────────────────────

async function checkRateLimit(ip, kv) {
  const key = `rl:${ip}`;
  const count = parseInt((await kv.get(key)) || '0');
  if (count >= RATE_LIMIT) return false;
  await kv.put(key, String(count + 1), { expirationTtl: RATE_TTL });
  return true;
}

// ── Stripe helpers ────────────────────────────────────────────────────────

async function stripePost(path, params, secretKey) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return data;
}

async function stripeGet(path, secretKey) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return data;
}

// Verify Stripe webhook signature (HMAC-SHA256).
async function verifyStripeSignature(rawBody, sigHeader, secret) {
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  const timestamp = parts.t;
  const sig = parts.v1;
  if (!timestamp || !sig) return false;

  const payload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const computed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === sig;
}

// ── ORS handlers ──────────────────────────────────────────────────────────

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

// ── Registration / ping ───────────────────────────────────────────────────

async function handleRegister(request, env) {
  const { device_id, email, company, version } = await request.json();
  if (!device_id || !email) return json({ error: 'device_id and email are required' }, 400);

  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();

  // If this email already exists under a different device_id, migrate that record
  // to the new device (preserving billing state) and drop the old row.
  const existing = await env.DB.prepare(
    `SELECT * FROM users WHERE email=? AND device_id != ?`
  ).bind(normalizedEmail, device_id).first();

  if (existing) {
    await env.DB.prepare(`DELETE FROM users WHERE device_id=?`).bind(existing.device_id).run();
    await env.DB.prepare(
      `INSERT INTO users (device_id, email, company, version, installed_at, last_seen,
         plan, stripe_customer_id, stripe_subscription_id, paid_at, plan_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         email=excluded.email, company=excluded.company, version=excluded.version,
         last_seen=excluded.last_seen, plan=excluded.plan,
         stripe_customer_id=excluded.stripe_customer_id,
         stripe_subscription_id=excluded.stripe_subscription_id,
         paid_at=excluded.paid_at, plan_expires_at=excluded.plan_expires_at`
    ).bind(
      device_id, normalizedEmail, company?.trim() || existing.company || null,
      version || null, existing.installed_at ?? now, now,
      existing.plan ?? 'free', existing.stripe_customer_id ?? null,
      existing.stripe_subscription_id ?? null, existing.paid_at ?? null,
      existing.plan_expires_at ?? null
    ).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO users (device_id, email, company, version, installed_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET email=excluded.email, company=excluded.company,
         version=excluded.version, last_seen=excluded.last_seen`
    ).bind(device_id, normalizedEmail, company?.trim() || null, version || null, now, now).run();
  }

  return json({ ok: true });
}

async function handlePing(request, env) {
  const { device_id, version } = await request.json();
  if (!device_id) return json({ error: 'device_id required' }, 400);

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE users SET last_seen=?, version=? WHERE device_id=?`
  ).bind(now, version || null, device_id).run();

  const row = await env.DB.prepare(
    `SELECT plan, payment_requested_at, stripe_checkout_url FROM users WHERE device_id=?`
  ).bind(device_id).first();

  if (!row) return json({ ok: true, plan: 'free', payment_required: false });

  return json({
    ok: true,
    plan: row.plan ?? 'free',
    payment_required: row.payment_requested_at != null,
    checkout_url: row.stripe_checkout_url ?? null,
  });
}

// ── Admin: list users ─────────────────────────────────────────────────────

async function handleAdminUsers(request, env) {
  if (!requireAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);

  const { results } = await env.DB.prepare(
    `SELECT device_id, email, company, version, plan,
            installed_at, last_seen, paid_at, plan_expires_at,
            payment_requested_at, stripe_checkout_url
     FROM users ORDER BY last_seen DESC`
  ).all();

  return json(results);
}

// ── Admin: request payment ────────────────────────────────────────────────

async function handleRequestPayment(request, env) {
  if (!requireAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);

  const { device_id, email: emailParam } = await request.json();
  if (!device_id && !emailParam) return json({ error: 'device_id or email required' }, 400);

  const user = device_id
    ? await env.DB.prepare(`SELECT * FROM users WHERE device_id=?`).bind(device_id).first()
    : await env.DB.prepare(`SELECT * FROM users WHERE email=?`).bind(emailParam.trim().toLowerCase()).first();

  if (!user) return json({ error: 'User not found' }, 404);

  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Stripe not configured' }, 503);

  // Create or reuse Stripe Customer.
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripePost('/customers', { email: user.email }, env.STRIPE_SECRET_KEY);
    customerId = customer.id;
  }

  // Create Checkout Session (subscription).
  const workerOrigin = new URL(request.url).origin;
  const session = await stripePost('/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    client_reference_id: user.device_id,
    success_url: `${workerOrigin}/payment-success`,
    cancel_url: `${workerOrigin}/payment-cancel`,
  }, env.STRIPE_SECRET_KEY);

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE users SET stripe_customer_id=?, stripe_checkout_url=?, payment_requested_at=? WHERE device_id=?`
  ).bind(customerId, session.url, now, user.device_id).run();

  return json({ ok: true, checkout_url: session.url });
}

// ── Stripe webhook ────────────────────────────────────────────────────────

async function handleStripeWebhook(request, env) {
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature') || '';

  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Webhook secret not configured' }, 503);

  const valid = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return json({ error: 'Invalid signature' }, 400);

  const event = JSON.parse(rawBody);
  const now = Date.now();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const deviceId = session.client_reference_id;
    if (!deviceId) return json({ ok: true });

    const thirtyDays = now + 30 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      `UPDATE users SET plan='pro', paid_at=?, plan_expires_at=?,
       stripe_subscription_id=?, payment_requested_at=NULL, stripe_checkout_url=NULL
       WHERE device_id=?`
    ).bind(now, thirtyDays, session.subscription ?? null, deviceId).run();
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    const subId = invoice.subscription;
    if (!subId) return json({ ok: true });

    const thirtyDays = now + 30 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      `UPDATE users SET plan='pro', paid_at=?, plan_expires_at=? WHERE stripe_subscription_id=?`
    ).bind(now, thirtyDays, subId).run();
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    await env.DB.prepare(
      `UPDATE users SET plan='free', stripe_subscription_id=NULL,
       paid_at=NULL, plan_expires_at=NULL WHERE stripe_subscription_id=?`
    ).bind(sub.id).run();
  }

  return json({ ok: true });
}

// ── Static pages ──────────────────────────────────────────────────────────

function htmlPage(title, message) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0d1117;color:#e2e8f0}
    .card{background:#161b22;border:1px solid #21262d;border-radius:14px;padding:40px;text-align:center;max-width:360px}
    h1{margin:0 0 10px;font-size:20px}p{margin:0;color:#8b949e;font-size:14px}</style>
    </head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html', ...corsHeaders() } }
  );
}

// ── Router ────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Static pages for Stripe redirect.
    if (url.pathname === '/payment-success') {
      return htmlPage('Payment successful', 'Your Cursus Pro subscription is now active. You can close this tab.');
    }
    if (url.pathname === '/payment-cancel') {
      return htmlPage('Payment cancelled', 'No charge was made. You can close this tab.');
    }

    // Stripe webhook — must read raw body before anything else.
    if (url.pathname === '/stripe-webhook' && request.method === 'POST') {
      try { return await handleStripeWebhook(request, env); }
      catch (err) { return json({ error: err.message }, 500); }
    }

    // Admin endpoints.
    if (url.pathname === '/admin/users' && request.method === 'GET') {
      try { return await handleAdminUsers(request, env); }
      catch (err) { return json({ error: err.message }, 500); }
    }
    if (url.pathname === '/admin/request-payment' && request.method === 'POST') {
      try { return await handleRequestPayment(request, env); }
      catch (err) { return json({ error: err.message }, 500); }
    }

    // Registration and ping — exempt from rate limiting.
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
