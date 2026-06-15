'use strict';

const regBanner  = document.getElementById('reg-banner');
const regBadge   = document.getElementById('reg-badge');
const regEmailEl = document.getElementById('reg-email');
const openRegBtn = document.getElementById('open-reg');

chrome.storage.local.get(['registered', 'email'], ({ registered, email }) => {
  if (registered) {
    regBadge.style.display = 'flex';
    regEmailEl.textContent = email || 'Registered';
  } else {
    regBanner.style.display = '';
  }
});

openRegBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('registration.html') });
  window.close();
});
