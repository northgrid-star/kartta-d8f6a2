/**
 * tunnelDataLoader.js – Fetch & decrypt tunnel alignment data
 * Data is only loaded AFTER successful authentication.
 */

'use strict';

import { decryptData } from './auth.js';

let _tunnelData = null;

/**
 * Fetch encrypted JSON from /data/tunneli.enc.json,
 * decrypt it, parse and cache it in memory.
 * Throws if not authenticated or decryption fails.
 */
async function loadTunnelData() {
  if (_tunnelData) return _tunnelData;

  const resp = await fetch('./data/tunneli.enc.json');
  if (!resp.ok) throw new Error(`Failed to fetch tunnel data: ${resp.status}`);

  const encObj = await resp.json();
  const plaintext = await decryptData(encObj);
  _tunnelData = JSON.parse(plaintext);
  return _tunnelData;
}

/**
 * Return cached data (null if not yet loaded)
 */
function getTunnelData() {
  return _tunnelData;
}

export { loadTunnelData, getTunnelData };
