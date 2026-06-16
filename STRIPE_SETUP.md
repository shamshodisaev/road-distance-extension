# Stripe Setup Guide

Follow these steps when you're ready to enable billing in Cursus.
All steps use **test mode first** — switch to live keys only when you're confident the flow works.

---

## Step 1 — Create a Stripe account

Go to [dashboard.stripe.com](https://dashboard.stripe.com) and sign up (or log in).

Make sure you're in **Test mode** (toggle in the top-right corner of the dashboard).

---

## Step 2 — Create the product and price

1. In the Stripe dashboard go to **Product catalog → + Add product**
2. Fill in:
   - **Name**: Cursus Pro
   - **Description**: Monthly/quarterly subscription for Amazon Relay distance tools
3. Under **Pricing**, click **Add a price**:
   - Pricing model: **Standard pricing**
   - Price: set your amount (e.g. $29.00)
   - Billing period: **Every 3 months** (or Monthly — your choice)
   - Currency: USD
4. Click **Save product**
5. On the product page, click the price you just created and copy the **Price ID** — it looks like `price_1AbCdEfG…`

---

## Step 3 — Get your API keys

1. Stripe dashboard → **Developers → API keys**
2. Copy the **Secret key** — it looks like `sk_test_…` (test) or `sk_live_…` (live)

---

## Step 4 — Register the webhook endpoint

1. Stripe dashboard → **Developers → Webhooks → + Add endpoint**
2. **Endpoint URL**:
   ```
   https://road-distance-proxy.abdushamshod.workers.dev/stripe-webhook
   ```
3. **Events to listen for** — select these three:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`
4. Click **Add endpoint**
5. On the webhook detail page, click **Reveal** under **Signing secret** and copy the value — it looks like `whsec_…`

---

## Step 5 — Add secrets to the Worker

Run these four commands from inside the `worker/` directory:

```bash
cd worker

npx wrangler secret put STRIPE_SECRET_KEY
# paste: sk_test_… (or sk_live_… for production)

npx wrangler secret put STRIPE_WEBHOOK_SECRET
# paste: whsec_…

npx wrangler secret put STRIPE_PRICE_ID
# paste: price_…
```

Then redeploy the Worker:

```bash
npx wrangler deploy
```

---

## Step 6 — Test the full flow

Use Stripe's test card numbers to simulate a payment without real money.

**Test card (always succeeds):**
```
Card number:  4242 4242 4242 4242
Expiry:       Any future date (e.g. 12/29)
CVC:          Any 3 digits
ZIP:          Any 5 digits
```

**Test flow:**
1. Open the admin dashboard → pick a user → click **Request Payment**
2. Copy the checkout URL from the dashboard (or let the user open their extension popup — the payment banner will appear)
3. Complete checkout using the test card above
4. Check the admin dashboard — the user's plan should switch to **Pro**
5. Check D1 to confirm: `wrangler d1 execute road-distance-users --remote --command "SELECT email, plan, paid_at FROM users"`

**Simulate a failed payment:**
```
Card number:  4000 0000 0000 0002
```

**Simulate a subscription cancellation:**
Go to Stripe dashboard → Subscriptions → find the test subscription → Cancel

---

## Step 7 — Go live

When you're satisfied with test mode:

1. Switch the Stripe dashboard toggle to **Live mode**
2. Repeat Steps 3–4 using live keys (different secret key, new webhook endpoint with live signing secret)
3. Re-run `wrangler secret put` for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` with the live values
4. Redeploy: `npx wrangler deploy`

The `STRIPE_PRICE_ID` stays the same — prices work in both modes if created under the correct mode. If you created the price in test mode, create an equivalent price in live mode and update `STRIPE_PRICE_ID`.

---

## Useful D1 queries

```sql
-- See all users and their plan status
SELECT email, company, plan, paid_at, plan_expires_at FROM users ORDER BY last_seen DESC;

-- See pending payment requests
SELECT email, payment_requested_at, stripe_checkout_url FROM users WHERE payment_requested_at IS NOT NULL;

-- Manually reset a user to free (e.g. for refunds)
UPDATE users SET plan='free', stripe_subscription_id=NULL, paid_at=NULL, plan_expires_at=NULL WHERE email='user@example.com';
```

Run any query with:
```bash
npx wrangler d1 execute road-distance-users --remote --command "YOUR SQL HERE"
```
