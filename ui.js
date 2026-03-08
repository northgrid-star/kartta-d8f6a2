/**
 * ui.js – Screen navigation, tab bar, layer panel, search
 */

'use strict';

import {
  setBase, toggleKiinteisto, toggleTLayer, zoomTunneli,
  toggleFollow, toggleMeasure, closeMeasure, clearMeasure,
  openRoute, closeRoute, setRouteMode, gpsAsFrom,
  startPickOnMap, calcRoute, getLastPos, getMap
} from './map.js';

import {
  renderNotesList, openNewNote, backToNotes,
  saveNote, deleteNote, handleImages, tagGPS,
  openImgViewer, closeImgViewer, exportAllPDF
} from './notes.js';

// ── Layer panel ───────────────────────────────────────────────
let lpOpen = false;

function toggleLP() {
  lpOpen = !lpOpen;
  document.getElementById('layer-panel').classList.toggle('open', lpOpen);
}
function closeLP() {
  lpOpen = false;
  document.getElementById('layer-panel').classList.remove('open');
}

// ── Tab / screen navigation ───────────────────────────────────
function showMap() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  _setActiveTab('tab-map');
}

function showNotes() {
  renderNotesList();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-notes')?.classList.add('active');
  _setActiveTab('tab-notes');
}

function _setActiveTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ── Coords popup ──────────────────────────────────────────────
function showCoords() {
  const pos = getLastPos();
  if (!pos) { alert('Sijainti ei saatavilla'); return; }
  alert(
    `📍 Sijaintisi\n\n` +
    `${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}\n` +
    `Tarkkuus: ±${Math.round(pos.accuracy)} m\n` +
    `Nopeus: ${pos.speed != null ? (pos.speed * 3.6).toFixed(1) + ' km/h' : '—'}`
  );
}

// ── Search ────────────────────────────────────────────────────
function searchPrompt() {
  const q = prompt('Hae paikkaa tai koordinaatit (lat, lon):');
  if (!q) return;
  const map = getMap();
  const c = q.split(',').map(parseFloat);
  if (c.length === 2 && !isNaN(c[0]) && !isNaN(c[1])) {
    map.setView(c, 16);
    L.marker(c).addTo(map).bindPopup(q).openPopup();
    return;
  }
  fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`)
    .then(r => r.json())
    .then(d => {
      if (d.length) {
        map.setView([+d[0].lat, +d[0].lon], 16);
        L.marker([+d[0].lat, +d[0].lon]).addTo(map).bindPopup(d[0].display_name).openPopup();
      } else {
        alert('Ei löydy');
      }
    })
    .catch(() => alert('Haku epäonnistui – tarkista internetyhteys'));
}

// ── Wire ALL global window handlers ──────────────────────────
// Called once after login succeeds, before map init.
// All onclick="..." attributes in HTML route through these.
function wireHandlers() {
  // Base map
  window._setBase          = setBase;
  window._toggleKiinteisto = toggleKiinteisto;
  window._toggleTLayer     = toggleTLayer;
  window._zoomTunneli      = zoomTunneli;
  // Layer panel
  window._toggleLP         = toggleLP;
  window._closeLP          = closeLP;
  // Map controls
  window._toggleFollow     = toggleFollow;
  window._toggleMeasure    = toggleMeasure;
  window._closeMeasure     = closeMeasure;
  window._clearMeasure     = clearMeasure;
  window._openRoute        = openRoute;
  window._closeRoute       = closeRoute;
  window._setRouteMode     = setRouteMode;
  window._gpsAsFrom        = gpsAsFrom;
  window._pickOnMap        = startPickOnMap;
  window._calcRoute        = calcRoute;
  // Navigation
  window._showMap          = showMap;
  window._showNotes        = showNotes;
  window._showCoords       = showCoords;
  window._searchPrompt     = searchPrompt;
  // Notes list screen
  window._openNewNote      = openNewNote;
  window._exportPDF        = exportAllPDF;
  // Note editor screen
  window._backToNotes      = backToNotes;
  window._saveNote         = saveNote;
  window._deleteNote       = deleteNote;
  window._handleImages     = handleImages;
  window._tagGPS           = () => tagGPS(getLastPos());
  // Image viewer
  window._closeImgViewer   = closeImgViewer;
}

export { toggleLP, closeLP, showMap, showNotes, showCoords, searchPrompt, wireHandlers };
