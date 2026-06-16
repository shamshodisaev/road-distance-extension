# Billing Plan — Cursus Monthly Subscription

## Status: IN PROGRESS

---

## Overview

Admin-initiated Stripe subscription flow. Admin selects a user in the dashboard and
requests payment. The user sees a payment banner in the extension popup on next open.
After successful Stripe payment, the extension unlocks and the user's record is updated.

---

## Technical Stack

| Layer | Tool |
|---|---|
| Payments | Stripe Subscriptions + Checkout |
| Worker | Cloudflare Worker (existing) |
| Database | Cloudflare D1 (existing) |
| Admin dashboard | Cloudflare Pages (new) |
| Admin auth | Cloudflare Access (Google SSO, free tier) |
| Email (optional) | Resend (free tier: 3 000 emails/month) |

---

## Step 1 — D1 Schema Migration

### Changes to `users` table

Add columns:

```sql
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN payment_requested_at INTEGER;
ALTER TABLE users ADD COLUMN stripe_checkout_url TEXT;
ALTER TABLE users ADD COLUMN paid_at INTEGER;
ALTER TABLE users ADD COLUMN plan_expires_at INTEGER;
```

### DoD
- [x] Migration applied to remote D1 (`wrangler d1 execute ... --remote`)
- [x] `SELECT * FROM users LIMIT 1` shows all new columns with correct defaults

---

## Step 2 — Stripe Setup (one-time, manual)

1. Create Stripe account → dashboard.stripe.com
2. Create a **Product**: "Cursus Pro" with a **monthly recurring Price** (e.g. $X/month)
   → note the `price_id` (e.g. `price_abc123`)
3. Add Stripe secrets to Worker env:
   - `STRIPE_SECRET_KEY` — Stripe secret key (`sk_live_…`)
   - `STRIPE_WEBHOOK_SECRET` — from Stripe dashboard after creating webhook endpoint
   - `STRIPE_PRICE_ID` — the monthly price ID
4. Register webhook endpoint in Stripe dashboard:
   - URL: `https://road-distance-proxy.abdushamshod.workers.dev/stripe-webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `invoice.paid`
     - `customer.subscription.deleted`

### DoD
- [ ] Stripe product + price created
- [ ] Three secrets added via `wrangler secret put`
- [ ] Webhook endpoint registered in Stripe with correct events

---

## Step 3 — Worker: New Endpoints

### `POST /admin/request-payment`

- Auth: `Authorization: Bearer <ADMIN_SECRET>` header (env var `ADMIN_SECRET`)
- Body: `{ "device_id": "..." }` or `{ "email": "..." }`
- Actions:
  1. Look up user in D1
  2. Create or reuse Stripe Customer (`stripe.customers.create` with `email`)
  3. Create Stripe Checkout Session:
     - `mode: 'subscription'`
     - `line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }]`
     - `customer: stripe_customer_id`
     - `success_url` + `cancel_url` pointing to a static confirmation page
     - `client_reference_id: device_id` (used in webhook to match back to user)
  4. Store `stripe_customer_id`, `stripe_checkout_url`, `payment_requested_at` in D1
  5. Return `{ ok: true, checkout_url }`

### `POST /stripe-webhook`

- Verifies Stripe signature with `STRIPE_WEBHOOK_SECRET`
- Handles:
  - `checkout.session.completed`:
    - Extract `client_reference_id` (device_id)
    - Set `plan='pro'`, `paid_at=now`, `plan_expires_at=now+30days`,
      `stripe_subscription_id`, clear `payment_requested_at` + `stripe_checkout_url`
  - `invoice.paid`:
    - Extend `plan_expires_at` by 30 days (renewal)
  - `customer.subscription.deleted`:
    - Set `plan='free'`, clear subscription fields

### `POST /ping` (updated)

- After updating `last_seen`, query current user record
- Return:
  ```json
  {
    "ok": true,
    "plan": "free|pro",
    "payment_required": true,
    "checkout_url": "https://checkout.stripe.com/..."
  }
  ```
  `payment_required` is `true` only when `payment_requested_at IS NOT NULL`

### DoD
- [x] `POST /admin/request-payment` creates Stripe customer + checkout session
- [x] Checkout URL stored in D1
- [x] `/ping` returns `payment_required: true` + `checkout_url` when requested
- [x] Webhook updates D1 on `checkout.session.completed`
- [x] Webhook updates `plan_expires_at` on `invoice.paid`
- [x] Webhook reverts to `free` on `customer.subscription.deleted`
- [x] Invalid webhook signature returns 400

---

## Step 4 — Admin Dashboard (Cloudflare Pages)

Single-file HTML page (`admin/index.html`) deployed to Cloudflare Pages.
Protected by **Cloudflare Access** (Google SSO — zero auth code needed).

### UI

- **Users table**: email, company, plan badge (free/pro), registered date,
  last seen, paid_at
- Per row: **"Request Payment"** button
  - Calls `POST /admin/request-payment` with `ADMIN_SECRET` in header
  - Shows the returned checkout URL as a copyable link + success toast
- Filter: free / pro / all
- Sort: by last_seen desc (default)

### Admin endpoint auth

- Dashboard stores `ADMIN_SECRET` in a `<meta>` tag injected at build time
  via a Cloudflare Pages environment variable (never public — page is behind Access)
- Alternatively: prompt for secret on load, store in `sessionStorage`

### DoD
- [ ] Dashboard deployed to `*.pages.dev`
- [ ] Cloudflare Access policy applied (only `abdushamshod@gmail.com` can access)
- [x] Users table loads from a `GET /admin/users` Worker endpoint
- [x] "Request Payment" button works end-to-end
- [x] Checkout URL displayed after clicking button

---

## Step 5 — Extension: Payment Banner in Popup

### `background.js` — ping response handling

Update `/ping` call to read the response body:
```js
const data = await res.json();
chrome.storage.local.set({
  plan: data.plan ?? 'free',
  paymentRequired: data.payment_required ?? false,
  checkoutUrl: data.checkout_url ?? null,
});
```

### `popup/popup.html` + `popup/popup.js`

When `paymentRequired === true`, show a banner **above** the auto-refresh panel
(but below the registered badge) inside `#registered-view`:

```
┌─────────────────────────────────────────┐
│ ● Active    you@mail.com                │
├─────────────────────────────────────────┤
│ ⚠  Subscription required               │
│  Activate your Cursus Pro plan to       │
│  keep using distance verification.      │
│  [  Pay now — $X/month  ]              │
├─────────────────────────────────────────┤
│ Auto refresh board   2.0s       ◯      │
└─────────────────────────────────────────┘
```

- "Pay now" button opens `checkoutUrl` in a new tab
- Banner is hidden when `paymentRequired === false`
- After payment, Stripe webhook → D1 → next `/ping` clears `paymentRequired` → banner disappears

### DoD
- [x] Banner appears in popup when `paymentRequired: true` in storage
- [x] "Pay now" opens correct Stripe Checkout URL in new tab
- [x] Banner is absent when `paymentRequired: false`
- [x] Banner is absent for `plan: 'pro'` users with no pending request

---

## Step 6 — Worker: `GET /admin/users` Endpoint

- Auth: `Authorization: Bearer <ADMIN_SECRET>`
- Query D1: all users, ordered by `last_seen DESC`
- Return array of user objects (exclude `stripe_customer_id` from response for brevity)

### DoD
- [x] Returns JSON array of users
- [x] Unauthorized requests return 401

---

## End-to-End Verification Checklist

- [ ] Fresh install → register → `/ping` returns `plan: free`, no banner
- [ ] Admin opens dashboard → sees user in table with `plan: free`
- [ ] Admin clicks "Request Payment" → checkout URL generated → stored in D1
- [ ] User opens popup → banner visible with "Pay now" button
- [ ] User completes Stripe test payment → webhook fires → D1 updated
- [ ] User opens popup → banner gone, plan shows `pro`
- [ ] Stripe subscription cancelled → next `/ping` returns `plan: free`
- [ ] Non-admin hitting `/admin/*` routes → 401

---

## Deferred / Out of Scope

- Email delivery (Resend) — nice to have, not blocking
- In-extension plan badge ("Pro" label) — can add post-launch
- Grace period after subscription lapses — Stripe handles retry/dunning, Worker
  only acts on `customer.subscription.deleted`
- Self-serve upgrade (user pays without admin request) — future iteration
