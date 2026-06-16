'use strict';

const regBanner      = document.getElementById('reg-banner');
const registeredView = document.getElementById('registered-view');
const regEmailEl     = document.getElementById('reg-email');
const openRegBtn     = document.getElementById('open-reg');
const toggle         = document.getElementById('auto-click-toggle');
const range          = document.getElementById('interval-range');
const display        = document.getElementById('interval-display');
const paymentBanner  = document.getElementById('payment-banner');
const payBtn         = document.getElementById('pay-btn');
const enableToggle   = document.getElementById('enable-toggle');
const enableLabel    = document.getElementById('enable-label');
const statusDot      = document.getElementById('status-dot');
const regLabel       = document.getElementById('reg-label');
const featuresPanel  = document.getElementById('features-panel');

function applyEnabledState(enabled) {
  enableToggle.checked = enabled;
  enableLabel.textContent = enabled ? 'On' : 'Off';
  enableLabel.classList.toggle('on', enabled);
  statusDot.classList.toggle('off', !enabled);
  regLabel.textContent = enabled ? 'Active' : 'Paused';
  regLabel.classList.toggle('off', !enabled);
  featuresPanel.classList.toggle('panel-disabled', !enabled);
}

chrome.storage.local.get(
  ['registered', 'email', 'extensionEnabled', 'autoClickEnabled', 'autoClickInterval', 'paymentRequired', 'checkoutUrl'],
  (data) => {
    if (data.registered) {
      registeredView.style.display = '';
      regEmailEl.textContent = data.email || 'Registered';

      const enabled = data.extensionEnabled !== false; // default on
      applyEnabledState(enabled);

      toggle.checked = !!data.autoClickEnabled;
      const interval = data.autoClickInterval ?? 2;
      range.value = interval;
      display.textContent = `${parseFloat(interval).toFixed(1)}s`;

      if (data.paymentRequired && data.checkoutUrl) {
        paymentBanner.style.display = '';
        payBtn.addEventListener('click', () => {
          chrome.tabs.create({ url: data.checkoutUrl });
          window.close();
        });
      }
    } else {
      regBanner.style.display = '';
    }
  }
);

openRegBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('registration.html') });
  window.close();
});

enableToggle.addEventListener('change', () => {
  const enabled = enableToggle.checked;
  applyEnabledState(enabled);
  chrome.storage.local.set({ extensionEnabled: enabled });
});

toggle.addEventListener('change', () => {
  chrome.storage.local.set({ autoClickEnabled: toggle.checked });
});

range.addEventListener('input', () => {
  const v = parseFloat(range.value);
  display.textContent = `${v.toFixed(1)}s`;
  chrome.storage.local.set({ autoClickInterval: v });
});
