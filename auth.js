/**
 * auth.js – Firebase Auth (email + Google) + AES-GCM tunnel data decryption
 *
 * Käyttää Firebase compat SDK:ta (ei ES-moduuleja).
 * Firebase SDK ladataan index.html:ssä <script>-tageilla ennen tätä tiedostoa.
 */

'use strict';

// ── Firebase config ───────────────────────────────────────────
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

// ── AES-GCM tunnel data decryption ────────────────────────────
const _APP_SECRET_HASH = '32fbdf9c912950b0666daaaec7a522624bc07298bf9608d32466f7d12fc33000';
const _KDF_SALT        = 'cGFpamFhbm5ldHVubmVsaTIwMjRzYWx0';
const _KDF_ITERS       = 100000;
let   _derivedKey      = null;

async function _deriveKey() {
  if (_derivedKey) return _derivedKey;
  const raw  = new TextEncoder().encode(_APP_SECRET_HASH);
  const salt = Uint8Array.from(atob(_KDF_SALT), c => c.charCodeAt(0));
  const imp  = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  _derivedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: _KDF_ITERS, hash: 'SHA-256' },
    imp,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  return _derivedKey;
}

async function decryptData(encryptedObj) {
  const key = await _deriveKey();
  const raw  = Uint8Array.from(atob(encryptedObj.data), c => c.charCodeAt(0));
  const iv   = raw.slice(0, 12);
  const ct   = raw.slice(12);
  const dec  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
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

function _fbErrorFi(code) {
  const map = {
    'auth/invalid-email':          'Virheellinen sähköpostiosoite.',
    'auth/user-not-found':         'Käyttäjää ei löydy.',
    'auth/wrong-password':         'Väärä salasana.',
    'auth/invalid-credential':     'Väärä sähköposti tai salasana.',
    'auth/email-already-in-use':   'Sähköposti on jo käytössä.',
    'auth/weak-password':          'Salasanan tulee olla vähintään 6 merkkiä.',
    'auth/popup-closed-by-user':   'Kirjautumisikkuna suljettiin.',
    'auth/popup-blocked':          'Selain esti popup-ikkunan. Salli popupit tälle sivulle.',
    'auth/network-request-failed': 'Verkkovirhe. Tarkista yhteys.',
    'auth/too-many-requests':      'Liian monta yritystä. Yritä myöhemmin.',
    'auth/operation-not-allowed':  'Kirjautumistapa ei ole käytössä. Tarkista Firebase Console.',
  };
  return map[code] || ('Virhe: ' + code);
}

// ── Boot app after successful auth ───────────────────────────
async function _waitForModules(maxMs) {
  const start = Date.now();
  while (!window._mapMod || !window._uiMod || !window._notesMod) {
    if (Date.now() - start > maxMs) throw new Error('Moduulit eivät latautuneet ajoissa');
    await new Promise(r => setTimeout(r, 50));
  }
}

async function _bootAfterAuth(user) {
  const nameEl   = document.getElementById('user-badge-name');
  const avatarEl = document.getElementById('user-badge-avatar');
  const emailEl  = document.getElementById('um-email');

  const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Käyttäjä');
  if (nameEl)  nameEl.textContent  = displayName;
  if (emailEl) emailEl.textContent = user.email || '';
  if (avatarEl) {
    if (user.photoURL) {
      avatarEl.innerHTML = '<img src="' + user.photoURL + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else {
      avatarEl.textContent = (displayName[0] || '?').toUpperCase();
    }
  }

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').style.display = 'block';

  try {
    await _waitForModules(10000);
    const plaintext  = await decryptData(window.ENC_DATA);
    const tunnelData = JSON.parse(plaintext);
    if (typeof window.bootApp === 'function') {
      window.bootApp(tunnelData, user);
    } else {
      console.error('window.bootApp ei ole määritelty – tarkista tunnelDataLoader.js');
    }
  } catch (e) {
    console.error('Tunnelitietojen purku epäonnistui:', e);
    alert('Tunnelitietojen purku epäonnistui: ' + e.message);
  }
}

// ── Auth state observer ───────────────────────────────────────
auth.onAuthStateChanged(user => {
  if (user) _bootAfterAuth(user);
});

// ── Email login ───────────────────────────────────────────────
async function doEmailLogin() {
  const email = document.getElementById('email-input').value.trim();
  const pw    = document.getElementById('pw-input').value;
  setError('');
  if (!email || !pw) { setError('Täytä sähköposti ja salasana.'); return; }
  setLoading(true);
  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch (e) {
    setError(_fbErrorFi(e.code));
    setLoading(false);
  }
}

// ── Email register ────────────────────────────────────────────
async function doRegister() {
  const email = document.getElementById('reg-email-input').value.trim();
  const pw    = document.getElementById('reg-pw-input').value;
  const pw2   = document.getElementById('reg-pw2-input').value;
  setError('');
  if (!email || !pw) { setError('Täytä kaikki kentät.'); return; }
  if (pw !== pw2)    { setError('Salasanat eivät täsmää.'); return; }
  if (pw.length < 6) { setError('Salasanan tulee olla vähintään 6 merkkiä.'); return; }
  setLoading(true);
  try {
    await auth.createUserWithEmailAndPassword(email, pw);
  } catch (e) {
    setError(_fbErrorFi(e.code));
    setLoading(false);
  }
}

// ── Google auth ───────────────────────────────────────────────
async function doGoogleAuth() {
  setError('');
  setLoading(true);
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (e) {
    setError(_fbErrorFi(e.code));
    setLoading(false);
  }
}

// ── Forgot password ───────────────────────────────────────────
async function doForgotPassword() {
  const email = document.getElementById('email-input').value.trim();
  if (!email) { setError('Syötä sähköpostiosoite ensin.'); return; }
  setLoading(true);
  try {
    await auth.sendPasswordResetEmail(email);
    setSuccess('Salasanan palautuslinkki lähetetty sähköpostiisi.');
  } catch (e) {
    setError(_fbErrorFi(e.code));
  } finally {
    setLoading(false);
  }
}

// ── Sign out ──────────────────────────────────────────────────
async function doSignOut() {
  try {
    await auth.signOut();
    window.location.reload();
  } catch (e) {
    console.error('Uloskirjautuminen epäonnistui:', e);
  }
}

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

  document.getElementById('user-badge')
    ?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('user-menu').classList.toggle('open');
    });
  document.getElementById('um-logout')
    ?.addEventListener('click', doSignOut);

  document.addEventListener('click', () => {
    document.getElementById('user-menu')?.classList.remove('open');
  });
});
