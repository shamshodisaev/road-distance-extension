# Road Distance Calculator — Browser Extension

A Chrome extension that calculates driving road distance between two locations and injects the result into an existing element on any web page. Powered by [OpenRouteService](https://openrouteservice.org/) via a Cloudflare Worker proxy — no API key required for end users.

---

## How it works

The extension reads origin and destination values from CSS-selectable elements on the page, calls a Cloudflare Worker proxy (which holds the ORS API key server-side), and writes a result card into the output element.

```
Page elements → content.js → Cloudflare Worker → OpenRouteService → result card
```

---

## Installing the extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `track/` folder
4. The extension is now active on all pages

No API key entry needed — the built-in proxy handles everything. If you want to use your own ORS key instead, click the extension icon and paste it in.

---

## Using it on a page

Add CSS classes to existing elements. The extension auto-detects and calculates on page load.

```html
<span class="road-distance-origin">New York, NY</span>
<span class="road-distance-destination">Boston, MA</span>
<div class="road-distance-output"></div>
```

Accepts **free-text addresses** or **`lat,lng` coordinate pairs** in origin/destination elements, including `<input>` and `<textarea>`.

### Multiple independent pairs

Wrap each set in any container — the extension scopes pairs by nearest common ancestor automatically:

```html
<div class="trip">
  <span class="road-distance-origin">Paris</span>
  <span class="road-distance-destination">Lyon</span>
  <div class="road-distance-output"></div>
</div>

<div class="trip">
  <span class="road-distance-origin">London</span>
  <span class="road-distance-destination">Manchester</span>
  <div class="road-distance-output"></div>
</div>
```

For elements that can't share a common ancestor, use `data-rdc-group`:

```html
<span class="road-distance-origin" data-rdc-group="a">Oslo</span>
<span class="road-distance-destination" data-rdc-group="a">Bergen</span>
<div class="road-distance-output" data-rdc-group="a"></div>
```

---

## config.json

Edit `config.json` to configure selectors per site. Reload the extension after changes (`chrome://extensions` → ↺).

```json
{
  "proxyUrl": "https://road-distance-proxy.abdushamshod.workers.dev",
  "defaults": {
    "origin": ".road-distance-origin",
    "destination": ".road-distance-destination",
    "output": ".road-distance-output"
  },
  "rules": [
    {
      "matches": "https://myapp.example.com/*",
      "origin": "#departure-city",
      "destination": "#arrival-city",
      "output": "#route-distance"
    }
  ]
}
```

| Field | Description |
|---|---|
| `proxyUrl` | Cloudflare Worker URL. Omit to require users to supply their own ORS key. |
| `defaults` | Fallback selectors used when no rule matches. |
| `rules[].matches` | Glob URL pattern (`*` matches anything). First match wins. |
| `rules[].origin/destination/output` | CSS selectors for this site. Unset fields fall back to `defaults`. |

---

## Cloudflare Worker proxy

The proxy lives in `worker/` and keeps the ORS API key server-side. It rate-limits to **100 requests / IP / hour** to prevent abuse.

### First-time deployment

**Prerequisites:** [Node.js](https://nodejs.org) and a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```sh
# 1. Install wrangler
npm install -g wrangler

# 2. Authenticate
wrangler login

# 3. Create the KV namespace for rate limiting
cd worker
npx wrangler kv namespace create RATE_KV
# → copy the returned id into wrangler.toml under [[kv_namespaces]]

# 4. Set the ORS API key as an encrypted secret (never stored in files)
npx wrangler secret put ORS_API_KEY
# → paste your key when prompted

# 5. Deploy
npx wrangler deploy
# → outputs your *.workers.dev URL
```

After deploying, paste the URL into `config.json` → `proxyUrl`.

### Updating the worker

```sh
cd worker
npx wrangler deploy
```

### Rotating the ORS API key

```sh
cd worker
npx wrangler secret put ORS_API_KEY
npx wrangler deploy
```

### Changing the rate limit

Edit the `RATE_LIMIT` constant at the top of `worker/index.js`, then redeploy.

---

## Getting an ORS API key

Free at [openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup) — no credit card required.

| Plan | Rate limit | Cost |
|---|---|---|
| Free | 40 req/min | €0 |
| Basic | 200 req/min | ~€50/mo |
| Advanced | 500 req/min | ~€250/mo |

For very high traffic, ORS can be [self-hosted](https://giscience.github.io/openrouteservice/installation/Installation-and-Usage.html) — change `ORS_BASE` in `worker/index.js` to point at your own instance.

---

## Project structure

```
track/
├── manifest.json          # Chrome Extension Manifest V3
├── config.json            # Selector rules and proxy URL
├── src/
│   ├── content.js         # Injected into every page
│   └── styles.css         # Result card styles
├── popup/
│   ├── popup.html         # Extension popup (optional key override)
│   └── popup.js
├── icons/
│   └── icon{16,48,128}.png
├── generate-icons.py      # Regenerate icons: python3 generate-icons.py
└── worker/
    ├── index.js           # Cloudflare Worker source
    └── wrangler.toml      # Worker config (KV binding, name)
```
