# Chrome Web Store Listing — Cursus

## Extension name
Cursus

## Short description (132 chars max)
Enhances Amazon Relay load boards with verified road distances, deadhead recalculation, and configurable auto-refresh.

## Detailed description

Cursus is a productivity tool for freight dispatchers and owner-operators using the Amazon Relay load board.

**What it does**

- Recalculates deadhead distances from your current location to each load's pickup point
- Verifies load distances and flags cards where the posted mileage doesn't match actual road distance
- Auto-refreshes the load board at a configurable interval (1–10 seconds) so you never miss a new load

**How it works**

Once you complete the one-time registration, Cursus runs automatically whenever you open the Amazon Relay load board. Distance calculations use real road routing — not straight-line estimates — so the numbers reflect what you'll actually drive.

The auto-refresh feature keeps the board live without you needing to manually reload. Set your preferred refresh interval from the extension popup.

**Privacy**

Cursus collects only your work email address during registration, used solely to activate the extension. No browsing history, load data, or personal information is stored or shared.

---

## Category
Productivity

## Language
English

## Screenshots needed (upload to Web Store dashboard)
- 1280×800 or 640×400 PNG/JPEG
- Suggested shots:
  1. Load board with Cursus distance badges visible on cards
  2. Extension popup showing registered state + auto-refresh toggle
  3. Distance mismatch warning highlighted on a load card

## Privacy policy URL
Required — host a simple page at your domain or Cloudflare Pages.
Minimum content needed: what data you collect (email), how it's stored (Cloudflare D1), that it's not sold or shared.

## Permissions justification (filled in on store dashboard)

| Permission | Reason |
|---|---|
| `storage` | Saves registration state, auto-refresh settings, and route cache locally |
| `tabs` | Opens the registration page on first install |
| `host_permissions: <all_urls>` | Required to inject the content script on the Amazon Relay load board |
| `host_permissions: *.workers.dev` | Communicates with the Cloudflare Worker proxy for distance calculations |

---

## Release checklist

- [ ] `manifest.json` version bumped
- [ ] `npm run package` run successfully
- [ ] `releases/cursus-v<version>.zip` verified (unzip and load unpacked in Chrome)
- [ ] Screenshots captured
- [ ] Privacy policy page live
- [ ] Store listing text pasted into developer dashboard
- [ ] Submitted for review
