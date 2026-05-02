/**
 * auth.js – Yksinkertainen salasanakirjautuminen + AES-GCM purku
 * Täsmälleen sama logiikka kuin alkuperäinen versio.
 */

'use strict';

const CORRECT_HASH = '32fbdf9c912950b0666daaaec7a522624bc07298bf9608d32466f7d12fc33000';
const KDF_SALT     = 'cGFpamFhbm5ldHVubmVsaTIwMjRzYWx0';
const KDF_ITERS    = 100000;

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function deriveKey(hashHex) {
  const raw  = new TextEncoder().encode(hashHex);
  const salt = Uint8Array.from(atob(KDF_SALT), c => c.charCodeAt(0));
  const imp  = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERS, hash: 'SHA-256' },
    imp, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
}

async function decryptData(encObj, key) {
  const raw = Uint8Array.from(atob(encObj.data), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12)
  );
  return new TextDecoder().decode(dec);
}

async function doLogin() {
  const pw    = document.getElementById('pw-input').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');
  const spin  = document.getElementById('login-spinner');

  if (!pw) { errEl.textContent = 'Syötä salasana.'; return; }
  errEl.textContent = '';
  btn.style.display  = 'none';
  spin.style.display = 'block';

  await new Promise(r => setTimeout(r, 60));

  try {
    const hash = await sha256hex(pw);
    if (hash !== CORRECT_HASH) throw new Error('wrong');
    const key       = await deriveKey(hash);
    const plaintext = await decryptData(window.ENC_DATA, key);
    const tunnelData = JSON.parse(plaintext);
    window.bootApp(tunnelData, { displayName: 'Käyttäjä', email: '' });
  } catch (e) {
    spin.style.display = 'none';
    btn.style.display  = 'block';
    if (e.message === 'wrong') {
      errEl.textContent = 'Väärä salasana. Yritä uudelleen.';
      document.getElementById('pw-input').value = '';
      document.getElementById('pw-input').focus();
    } else {
      errEl.textContent = 'Virhe: ' + e.message;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn')
    ?.addEventListener('click', doLogin);
  document.getElementById('pw-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});
