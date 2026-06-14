'use strict';

const input = document.getElementById('apiKey');
const statusEl = document.getElementById('status');

chrome.storage.sync.get('orsApiKey', (data) => {
  if (data.orsApiKey) input.value = data.orsApiKey;
});

document.getElementById('save').addEventListener('click', () => {
  const key = input.value.trim();
  chrome.storage.sync.set({ orsApiKey: key }, () => {
    statusEl.textContent = key ? 'Saved!' : 'Key cleared.';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  });
});
