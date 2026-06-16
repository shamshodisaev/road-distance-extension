'use strict';

async function getProxyUrl() {
  const url = chrome.runtime.getURL('config.json');
  try {
    const res = await fetch(url);
    const cfg = await res.json();
    return (cfg.proxyUrl || '').trim() || null;
  } catch {
    return null;
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  const { deviceId } = await chrome.storage.local.get('deviceId');
  if (!deviceId) {
    await chrome.storage.local.set({ deviceId: crypto.randomUUID() });
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('registration.html') });
});

chrome.runtime.onStartup.addListener(async () => {
  const { deviceId, registered } = await chrome.storage.local.get(['deviceId', 'registered']);
  if (!registered || !deviceId) return;

  const proxyUrl = await getProxyUrl();
  if (!proxyUrl) return;

  const manifest = chrome.runtime.getManifest();
  fetch(`${proxyUrl}/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, version: manifest.version }),
  }).then(r => r.ok ? r.json() : null).then(data => {
    if (!data) return;
    chrome.storage.local.set({
      plan: data.plan ?? 'free',
      paymentRequired: data.payment_required ?? false,
      checkoutUrl: data.checkout_url ?? null,
    });
  }).catch(() => {});
});
