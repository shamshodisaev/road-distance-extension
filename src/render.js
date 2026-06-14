import { fmtDuration, fmtDistance } from './utils.js';

export function setLoading(el) {
  el.innerHTML =
    '<div class="rdc-card rdc-card--loading">' +
    '<span class="rdc-spinner"></span>' +
    '<span class="rdc-msg">Calculating route…</span>' +
    '</div>';
  el.dataset.rdcState = 'loading';
}

export function setResult(el, { distance, duration }, units = 'km') {
  el.innerHTML =
    '<div class="rdc-card">' +
    '<span class="rdc-ico" aria-hidden="true">🚗</span>' +
    '<div class="rdc-info">' +
    `<strong class="rdc-dist">${fmtDistance(distance, units)}</strong>` +
    `<span class="rdc-dur">~${fmtDuration(duration)} drive</span>` +
    '</div></div>';
  el.dataset.rdcState = 'done';
}

export function setError(el, msg) {
  el.innerHTML =
    '<div class="rdc-card rdc-card--err">' +
    '<span class="rdc-ico" aria-hidden="true">⚠️</span>' +
    `<span class="rdc-msg">${msg}</span>` +
    '</div>';
  el.dataset.rdcState = 'error';
}

// Scratch existing content (strikethrough) then append a highlighted badge.
// variant: 'highlight' (blue) | 'warn' (orange)
export function appendBadge(el, text, variant) {
  const existing = el.innerHTML.trim();
  if (existing) {
    const s = document.createElement('s');
    s.className = 'rdc-scratch';
    s.innerHTML = existing;
    el.innerHTML = '';
    el.appendChild(s);
  } else {
    el.innerHTML = '';
  }
  const badge = document.createElement('span');
  badge.className = `rdc-badge rdc-badge--${variant}`;
  badge.textContent = text;
  el.appendChild(badge);
}
