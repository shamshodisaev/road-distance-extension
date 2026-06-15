'use strict';

const regBanner      = document.getElementById('reg-banner');
const registeredView = document.getElementById('registered-view');
const regEmailEl     = document.getElementById('reg-email');
const openRegBtn     = document.getElementById('open-reg');
const toggle         = document.getElementById('auto-click-toggle');
const range          = document.getElementById('interval-range');
const display        = document.getElementById('interval-display');

chrome.storage.local.get(['registered', 'email', 'autoClickEnabled', 'autoClickInterval'], (data) => {
  if (data.registered) {
    registeredView.style.display = '';
    regEmailEl.textContent = data.email || 'Registered';

    toggle.checked = !!data.autoClickEnabled;
    const interval = data.autoClickInterval ?? 2;
    range.value = interval;
    display.textContent = `${parseFloat(interval).toFixed(1)}s`;
  } else {
    regBanner.style.display = '';
  }
});

openRegBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('registration.html') });
  window.close();
});

toggle.addEventListener('change', () => {
  chrome.storage.local.set({ autoClickEnabled: toggle.checked });
});

range.addEventListener('input', () => {
  const v = parseFloat(range.value);
  display.textContent = `${v.toFixed(1)}s`;
  chrome.storage.local.set({ autoClickInterval: v });
});
