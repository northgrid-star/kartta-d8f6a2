/**
 * auth.js – Firebase Auth + AES-GCM tunnel data decryption
 * Data on salattu alkuperäisellä salasanalla. Pyydämme sen kerran
 * Firebase-kirjautumisen jälkeen tunnelitietojen purkuun.
 */

'use strict';

const firebaseConfig = {
  apiKey:            'AIzaSyDlGdZY4DgTfcrNP5twiAqRnbHWUxDH4c0',
  authDomain:        'karttasove.firebaseapp.com',
  projectId:         'karttasove',
  storageBucket:     'karttasove.firebasestorage.app',
  messagingSenderId: '752570443662',
  appId:             '1:752570443662:web:5786925c05d5f48235a6df',
  measurementId:     'G-Z61VWK61TM'
};

firebase.initializeApp(firebaseConfig);
const auth           = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ── AES-GCM decryption ────────────────────────────────────────
// Tunneldata on salattu salasanasta johdetulla avaimella (PBKDF2+SHA-256).
// Sama prosessi kuin alkuperäinen auth.js:
// 1. sha256(salasana) → hex
// 2. PBKDF2(hex, salt, 100000) → AES-256-GCM avain
const _KDF_SALT  = 'cGFpamFhbm5ldHVubmVsaTIwMjRzYWx0';
const _KDF_ITERS = 100000;
const CORRECT_HASH = '32fbdf9c912950b0666daaaec7a522624bc07298bf9608d32466f7d12fc33000';

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function deriveKey(passwordHashHex) {
  const raw  = new TextEncoder().encode(passwordHashHex);
  const salt = Uint8Array.from(atob(_KDF_SALT), c => c.charCodeAt(0));
  const imp  = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: _KDF_ITERS, hash: 'SHA-256' },
    imp, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
}

async function decryptData(encObj, key) {
  const raw = Uint8Array.from(atob(encObj.data), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0,12) }, key, raw.slice(12));
  return new TextDecoder().decode(dec);
}

// ── UI helpers ────────────────────────────────────────────────
function setError(msg) {
  document.getElementById('login-error').textContent   = msg;
  document.getElementById('login-success').textContent = '';
}
function setSuccess(msg) {
  document.getElementById('login-success').textContent = msg;
  document.getElementById('login-error').textContent   = '';
}
function setLoading(on) {
  document.getElementById('login-spinner').style.display = on ? 'block' : 'none';
  ['login-btn','register-btn','google-login-btn','google-register-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = on;
  });
}

function _fbErr(code) {
  const m = {
    'auth/invalid-email':         'Virheellinen sähköpostiosoite.',
    'auth/user-not-found':        'Käyttäjää ei löydy.',
    'auth/wrong-password':        'Väärä salasana.',
    'auth/invalid-credential':    'Väärä sähköposti tai salasana.',
    'auth/email-already-in-use':  'Sähköposti on jo käytössä.',
    'auth/weak-password':         'Salasana vähintään 6 merkkiä.',
    'auth/popup-closed-by-user':  'Kirjautumisikkuna suljettiin.',
    'auth/popup-blocked':         'Selain esti popup-ikkunan.',
    'auth/network-request-failed':'Verkkovirhe.',
    'auth/too-many-requests':     'Liian monta yritystä.',
    'auth/operation-not-allowed': 'Kirjautumistapa ei ole käytössä.',
  };
  return m[code] || ('Virhe: ' + code);
}

// ── Boot after auth ───────────────────────────────────────────
async function _bootAfterAuth(user, dataPassword) {
  // Päivitä user badge
  const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Käyttäjä');
  const nameEl  = document.getElementById('user-badge-name');
  const avEl    = document.getElementById('user-badge-avatar');
  const emailEl = document.getElementById('um-email');
  if (nameEl)  nameEl.textContent  = displayName;
  if (emailEl) emailEl.textContent = user.email || '';
  if (avEl) {
    if (user.photoURL) {
      avEl.innerHTML = '<img src="' + user.photoURL + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else {
      avEl.textContent = (displayName[0] || '?').toUpperCase();
    }
  }

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').style.display = 'block';

  try {
    const hash       = await sha256hex(dataPassword);
    if (hash !== CORRECT_HASH) throw new Error('Väärä karttasalasana');
    const key        = await deriveKey(hash);
    const plaintext  = await decryptData(window.ENC_DATA, key);
    const tunnelData = JSON.parse(plaintext);
    window.bootApp(tunnelData, user);
  } catch (e) {
    console.error('Boot epäonnistui:', e);
    // Näytä login uudelleen virheen kera
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').style.display = 'none';
    setError('Karttasalasana väärin. Yritä uudelleen.');
    setLoading(false);
  }
}

// ── Auth state ────────────────────────────────────────────────
// Kun Firebase-kirjautuminen on voimassa, pyydä karttasalasana
let _pendingUser = null;

auth.onAuthStateChanged(user => {
  if (user) {
    _pendingUser = user;
    // Tarkista onko salasana tallennettu sessioon
    const saved = sessionStorage.getItem('_dpw');
    if (saved) {
      _bootAfterAuth(user, saved);
    } else {
      // Näytä karttasalasana-kenttä
      _showDataPasswordPrompt();
    }
  }
});

function _showDataPasswordPrompt() {
  // Vaihda login-box näyttämään karttasalasana-kenttä
  const box = document.querySelector('.login-box');
  box.innerHTML = `
    <div style="font-family:var(--mono);font-size:13px;color:var(--bright);margin-bottom:16px;text-align:center">
      ✅ Kirjautunut sisään<br>
      <span style="font-size:11px;color:rgba(255,255,255,.5)">Syötä karttasalasana</span>
    </div>
    <label class="login-label">Karttasalasana</label>
    <input class="login-input" type="password" id="data-pw-input" placeholder="Karttasalasana…" autocomplete="current-password">
    <button class="login-btn" id="data-pw-btn">Avaa kartta</button>
    <div class="login-error" id="login-error"></div>
  `;
  document.getElementById('data-pw-input').focus();
  document.getElementById('data-pw-btn').addEventListener('click', _submitDataPassword);
  document.getElementById('data-pw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') _submitDataPassword();
  });
}

async function _submitDataPassword() {
  const pw = document.getElementById('data-pw-input')?.value;
  if (!pw) { setError('Syötä karttasalasana.'); return; }
  document.getElementById('data-pw-btn').disabled = true;
  document.getElementById('data-pw-btn').textContent = 'Avataan…';
  sessionStorage.setItem('_dpw', pw);
  await _bootAfterAuth(_pendingUser, pw);
}

// ── Email login ───────────────────────────────────────────────
async function doEmailLogin() {
  const email = document.getElementById('email-input').value.trim();
  const pw    = document.getElementById('pw-input').value;
  setError('');
  if (!email || !pw) { setError('Täytä sähköposti ja salasana.'); return; }
  setLoading(true);
  try {
    await auth.signInWithEmailAndPassword(email, pw);
    // onAuthStateChanged hoitaa loput
  } catch (e) {
    setError(_fbErr(e.code));
    setLoading(false);
  }
}

// ── Register ──────────────────────────────────────────────────
async function doRegister() {
  const email = document.getElementById('reg-email-input').value.trim();
  const pw    = document.getElementById('reg-pw-input').value;
  const pw2   = document.getElementById('reg-pw2-input').value;
  setError('');
  if (!email || !pw) { setError('Täytä kaikki kentät.'); return; }
  if (pw !== pw2)    { setError('Salasanat eivät täsmää.'); return; }
  if (pw.length < 6) { setError('Salasana vähintään 6 merkkiä.'); return; }
  setLoading(true);
  try {
    await auth.createUserWithEmailAndPassword(email, pw);
  } catch (e) {
    setError(_fbErr(e.code));
    setLoading(false);
  }
}

// ── Google ────────────────────────────────────────────────────
async function doGoogleAuth() {
  setError('');
  setLoading(true);
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (e) {
    setError(_fbErr(e.code));
    setLoading(false);
  }
}

// ── Forgot password ───────────────────────────────────────────
async function doForgotPassword() {
  const email = document.getElementById('email-input')?.value.trim();
  if (!email) { setError('Syötä sähköpostiosoite ensin.'); return; }
  setLoading(true);
  try {
    await auth.sendPasswordResetEmail(email);
    setSuccess('Palautuslinkki lähetetty.');
  } catch (e) {
    setError(_fbErr(e.code));
  } finally {
    setLoading(false);
  }
}

// ── Sign out ──────────────────────────────────────────────────
async function doSignOut() {
  sessionStorage.removeItem('_dpw');
  await auth.signOut();
  window.location.reload();
}
window._doSignOut = doSignOut;

// ── Wire events ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn')
    ?.addEventListener('click', doEmailLogin);
  document.getElementById('register-btn')
    ?.addEventListener('click', doRegister);
  document.getElementById('google-login-btn')
    ?.addEventListener('click', doGoogleAuth);
  document.getElementById('google-register-btn')
    ?.addEventListener('click', doGoogleAuth);
  document.getElementById('forgot-pw-btn')
    ?.addEventListener('click', doForgotPassword);
  document.getElementById('pw-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') doEmailLogin(); });
  document.getElementById('reg-pw2-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  document.getElementById('tab-login-btn')
    ?.addEventListener('click', () => {
      document.getElementById('login-panel').style.display   = 'block';
      document.getElementById('register-panel').style.display = 'none';
      document.getElementById('tab-login-btn').classList.add('active');
      document.getElementById('tab-register-btn').classList.remove('active');
      setError(''); setSuccess('');
    });
  document.getElementById('tab-register-btn')
    ?.addEventListener('click', () => {
      document.getElementById('login-panel').style.display   = 'none';
      document.getElementById('register-panel').style.display = 'block';
      document.getElementById('tab-login-btn').classList.remove('active');
      document.getElementById('tab-register-btn').classList.add('active');
      setError(''); setSuccess('');
    });
});
