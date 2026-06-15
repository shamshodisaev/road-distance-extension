'use strict';

const emailEl  = document.getElementById('email');
const companyEl = document.getElementById('company');
const submitBtn = document.getElementById('submit-btn');
const errorEl  = document.getElementById('error');
const formView = document.getElementById('form-view');
const successView = document.getElementById('success-view');

async function getProxyUrl() {
  const res = await fetch(chrome.runtime.getURL('config.json'));
  const cfg = await res.json();
  return (cfg.proxyUrl || '').trim() || null;
}

submitBtn.addEventListener('click', async () => {
  const email   = emailEl.value.trim();
  const company = companyEl.value.trim();
  errorEl.textContent = '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errorEl.textContent = 'Please enter a valid email address.';
    emailEl.focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Registering…';

  try {
    const [proxyUrl, storage, manifest] = await Promise.all([
      getProxyUrl(),
      chrome.storage.local.get('deviceId'),
      Promise.resolve(chrome.runtime.getManifest()),
    ]);

    if (!proxyUrl) throw new Error('Proxy URL not configured.');

    const res = await fetch(`${proxyUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: storage.deviceId,
        email,
        company: company || null,
        version: manifest.version,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error (${res.status})`);
    }

    await chrome.storage.local.set({ registered: true, email });
    formView.style.display = 'none';
    successView.style.display = '';
  } catch (err) {
    errorEl.textContent = err.message || 'Registration failed. Please try again.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Get started';
  }
});

emailEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitBtn.click();
});
