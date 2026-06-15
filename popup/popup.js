'use strict';

const apiKeyInput = document.getElementById('apiKey');
const statusEl    = document.getElementById('status');
const regBanner   = document.getElementById('reg-banner');
const regBadge    = document.getElementById('reg-badge');
const regEmailEl  = document.getElementById('reg-email');
const apiSection  = document.getElementById('api-section');
const openRegBtn  = document.getElementById('open-reg');
const saveBtn     = document.getElementById('save');

chrome.storage.local.get(['registered', 'email'], ({ registered, email }) => {
  if (registered) {
    regBadge.style.display = 'flex';
    regEmailEl.textContent = email || 'Registered';
  } else {
    regBanner.style.display = '';
    apiSection.style.display = 'none';
  }
});

openRegBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('registration.html') });
  window.close();
});

chrome.storage.sync.get('orsApiKey', ({ orsApiKey }) => {
  if (orsApiKey) apiKeyInput.value = orsApiKey;
});

saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  chrome.storage.sync.set({ orsApiKey: key }, () => {
    statusEl.textContent = key ? 'Saved!' : 'Key cleared.';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  });
});
