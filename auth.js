/**
 * auth.js – SHA-256 login + AES-GCM key derivation
 * Password is NEVER stored. Only the SHA-256 hash is embedded.
 */

'use strict';

// SHA-256 hash of the correct password (generated offline)
const CORRECT_HASH = '32fbdf9c912950b0666daaaec7a522624bc07298bf9608d32466f7d12fc33000';

// KDF parameters (must match encryption)
const KDF_SALT    = 'cGFpamFhbm5ldHVubmVsaTIwMjRzYWx0'; // base64
const KDF_ITERS   = 100000;

let _derivedKey = null; // CryptoKey, only set after successful login

/**
 * Hash a string with SHA-256, return hex string
 */
async function sha256hex(str) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive AES-256-GCM CryptoKey from password hash using PBKDF2
 */
async function deriveKey(passwordHashHex) {
  const rawKey = new TextEncoder().encode(passwordHashHex);
  const salt   = Uint8Array.from(atob(KDF_SALT), c => c.charCodeAt(0));

  const importedKey = await crypto.subtle.importKey(
    'raw', rawKey, 'PBKDF2', false, ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERS, hash: 'SHA-256' },
    importedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Attempt login. Returns true on success, false on wrong password.
 * On success, derivedKey is stored and can be used to decrypt data.
 */
async function attemptLogin(password) {
  const hash = await sha256hex(password);
  if (hash !== CORRECT_HASH) return false;

  _derivedKey = await deriveKey(hash);
  return true;
}

/**
 * Decrypt AES-GCM encrypted blob.
 * Payload format: 12-byte IV | ciphertext+GCM-tag
 */
async function decryptData(encryptedObj) {
  if (!_derivedKey) throw new Error('Not authenticated');

  const raw = Uint8Array.from(atob(encryptedObj.data), c => c.charCodeAt(0));
  const iv         = raw.slice(0, 12);
  const ciphertext = raw.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    _derivedKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Check if user is already authenticated this session
 */
function isAuthenticated() {
  return _derivedKey !== null;
}

export { attemptLogin, decryptData, isAuthenticated };
