# Road Distance Calculator — Browser Extension

A Chrome extension that calculates driving road distance between locations on any web page and injects results into existing DOM elements. Powered by [OpenRouteService](https://openrouteservice.org/) via a Cloudflare Worker proxy — no API key required for end users.

---

## How it works

```
Page elements → content.js → Cloudflare Worker → OpenRouteService → result badges
```

The extension reads addresses from CSS-selectable elements, geocodes them, fetches road distances through a server-side proxy (which holds the ORS API key), and writes result badges into designated output elements. Results are cached in memory and `localStorage` (30-day TTL) to avoid redundant API calls.

---

## Installing the extension

**Prerequisites:** Run the build step first (see [Development](#development)).

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `track/` folder
4. On first install a **registration tab** opens — enter your email and optionally your company name to activate the extension

The extension is blocked until registration is complete. After registering you can close the tab; the extension is now active on all pages.

---

## Modes

### Simple mode

Mark origin, destination, and output elements with CSS classes:

```html
<span class="road-distance-origin">New York, NY</span>
<span class="road-distance-destination">Boston, MA</span>
<div class="road-distance-output"></div>
```

Accepts free-text addresses or `lat,lng` coordinate pairs. Works with `<input>` and `<textarea>` elements too.

**Multiple independent pairs** — the extension scopes pairs by nearest common ancestor automatically:

```html
<div class="trip">
  <span class="road-distance-origin">Chicago, IL</span>
  <span class="road-distance-destination">Detroit, MI</span>
  <div class="road-distance-output"></div>
</div>
```

For elements that can't share a common ancestor, use `data-rdc-group`:

```html
<span class="road-distance-origin" data-rdc-group="a">Dallas, TX</span>
<span class="road-distance-destination" data-rdc-group="a">Houston, TX</span>
<div class="road-distance-output" data-rdc-group="a"></div>
```

### Load mode (freight load boards)

For pages with one fixed origin and multiple load cards, configure `loadOrigin`, `loadDestination`, `distanceToLoadOrigin`, and `loadDistance` selectors in `config.json`. The extension then:

- Calculates **deadhead** (origin → load pickup) and appends a highlighted badge
- Calculates **load distance** (pickup → delivery) and appends a warning badge if it differs from the displayed value by more than `loadDistanceThreshold`
- Batches all visible cards into **two ORS Matrix API calls** (not one call per card) to stay within rate limits

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
      "matches": "*",
      "units": "mi",
      "loadDistanceThreshold": 80,
      "origin": ".current-location span",
      "loadOrigin": ".load-card .pickup-address",
      "loadDestination": ".load-card .delivery-address",
      "distanceToLoadOrigin": ".load-card .deadhead-field",
      "loadDistance": ".load-card .distance-field"
    }
  ]
}
```

| Field | Description |
|---|---|
| `proxyUrl` | Deployed Cloudflare Worker URL |
| `defaults` | Fallback selectors when no rule matches |
| `rules[].matches` | Glob URL pattern — first match wins |
| `rules[].units` | `"mi"` or `"km"` (default `"km"`) |
| `rules[].loadDistanceThreshold` | Miles/km difference to trigger a load-distance correction badge |
| `rules[].origin` | Fixed origin element (load mode) |
| `rules[].loadOrigin/loadDestination` | Per-card pickup and delivery selectors (load mode) |
| `rules[].distanceToLoadOrigin` | Element to receive the deadhead badge |
| `rules[].loadDistance` | Element to receive the load-distance correction badge |

---

## Cloudflare Worker proxy

The proxy lives in `worker/` and keeps the ORS API key server-side. It also stores registered users in a D1 (SQLite) database and rate-limits routing calls to **100 requests / IP / hour**.

### Endpoints

| Method | Path | Description | Rate limited |
|--------|------|-------------|-------------|
| GET | `/geocode?text=…&country=USA` | Address → coordinates | Yes |
| POST | `/directions` | Two-point route | Yes |
| POST | `/matrix` | Multi-point distance matrix | Yes |
| POST | `/register` | Register a new user | No |
| POST | `/ping` | Update last-seen timestamp | No |

### First-time deployment

**Prerequisites:** [Node.js](https://nodejs.org) and a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```sh
# 1. Install wrangler globally
npm install -g wrangler

# 2. Authenticate
wrangler login

cd worker

# 3. Create the KV namespace for rate limiting
npx wrangler kv namespace create RATE_KV
# → copy the returned id into wrangler.toml under [[kv_namespaces]]

# 4. Create the D1 database for user storage
npx wrangler d1 create road-distance-users
# → copy the returned database_id into wrangler.toml under [[d1_databases]]

# 5. Create the users table
npx wrangler d1 execute road-distance-users --remote --command \
  "CREATE TABLE IF NOT EXISTS users (device_id TEXT PRIMARY KEY, email TEXT NOT NULL, company TEXT, version TEXT, installed_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)"

# 6. Set the ORS API key as an encrypted secret (never stored in files)
npx wrangler secret put ORS_API_KEY
# → paste your key when prompted

# 7. Deploy
npx wrangler deploy
# → outputs your *.workers.dev URL
```

After deploying, paste the URL into `config.json` → `proxyUrl`.

### Updating the worker

```sh
cd worker && npx wrangler deploy
```

### Monitoring users

```sh
# All registered users
npx wrangler d1 execute road-distance-users --remote \
  --command "SELECT email, company, version, datetime(installed_at/1000,'unixepoch') as installed, datetime(last_seen/1000,'unixepoch') as last_seen FROM users ORDER BY installed_at DESC"

# Active in the last 30 days
npx wrangler d1 execute road-distance-users --remote \
  --command "SELECT email, company, version FROM users WHERE last_seen > unixepoch('now','-30 days')*1000"
```

### Rotating the ORS API key

```sh
cd worker
npx wrangler secret put ORS_API_KEY
npx wrangler deploy
```

---

## Development

### Build

The extension uses [esbuild](https://esbuild.github.io/) to bundle `src/content.js` and its imports into a single `dist/content.js`.

```sh
# Install dependencies
npm install

# One-time build
npm run build

# Watch mode (rebuilds on save)
npm run watch
```

After every `src/` change, run `npm run build` and reload the extension in `chrome://extensions`.

### Testing on local HTML files

1. Enable **Allow access to file URLs** in `chrome://extensions` → Details for this extension
2. Open the `file://` URL in Chrome
3. The extension injects into local files just like live pages

---

## Project structure

```
track/
├── manifest.json          # Chrome Extension Manifest V3
├── config.json            # Selector rules and proxy URL
├── background.js          # Service worker: registers device on install, pings on startup
├── registration.html      # One-time registration form (opens as tab on first install)
├── registration.js
├── src/
│   ├── content.js         # Page scanner and orchestrator (ES module source)
│   ├── api.js             # ORS geocode / directions / matrix wrappers
│   ├── cache.js           # Two-level cache (memory + localStorage)
│   ├── config.js          # Config loader and selector resolver
│   ├── render.js          # DOM badge / card helpers
│   ├── utils.js           # Pure helpers (address preprocessing, haversine, formatting)
│   └── styles.css         # Result badge styles
├── dist/
│   └── content.js         # Bundled output (generated — do not edit directly)
├── popup/
│   ├── popup.html         # Extension popup
│   └── popup.js
├── icons/
│   └── icon{16,48,128}.png
├── generate-icons.py      # Regenerate icons: python3 generate-icons.py
└── worker/
    ├── index.js           # Cloudflare Worker (geocode proxy + user registration + rate limiting)
    └── wrangler.toml      # Worker config (KV binding, D1 binding, name)
```

---

## Getting an ORS API key

Free at [openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup) — no credit card required.

| Plan | Rate limit | Cost |
|---|---|---|
| Free | 40 req/min | €0 |
| Basic | 200 req/min | ~€50/mo |
| Advanced | 500 req/min | ~€250/mo |

For very high traffic, ORS can be [self-hosted](https://giscience.github.io/openrouteservice/installation/Installation-and-Usage.html) — change `ORS_BASE` in `worker/index.js` to point at your own instance.
