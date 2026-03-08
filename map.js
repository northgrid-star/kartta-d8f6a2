/**
 * map.js – Leaflet map, tile layers, tunnel layer rendering
 */

'use strict';

let map = null;
const tGroups = {};
const tLayerState = {
  tunnelilinja: true, paalut: true, ilmareikat: true,
  ajotunnelit: true,  suuaukot: true, erityis: true
};

const baseLayers = {};
let kiiOn = true;

// ── Init map ──────────────────────────────────────────────────
function initMap() {
  map = L.map('map', {
    center: [60.75, 25.2], zoom: 10,
    zoomControl: false, maxZoom: 25, minZoom: 4
  });

  baseLayers.osm = L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }
  );
  baseLayers.otm = L.tileLayer(
    'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    { attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a>', maxZoom: 17 }
  );
  baseLayers.sat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri / Maxar', maxZoom: 19 }
  );

  baseLayers.osm.addTo(map);

  map.on('zoomend moveend', updateScale);
  updateScale();

  return map;
}

function getMap() { return map; }

// ── Scale bar ─────────────────────────────────────────────────
function updateScale() {
  if (!map) return;
  const z = map.getZoom(), lat = map.getCenter().lat;
  const m = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z) * 80;
  const el = document.getElementById('scale-label');
  if (el) el.textContent = m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// ── Base layer switch ─────────────────────────────────────────
function setBase(name) {
  Object.keys(baseLayers).forEach(k => {
    map.removeLayer(baseLayers[k]);
    document.getElementById('chk-' + k)?.classList.add('off');
  });
  baseLayers[name].addTo(map);
  document.getElementById('chk-' + name)?.classList.remove('off');
}

function toggleKiinteisto() {
  kiiOn = !kiiOn;
  document.getElementById('chk-kii')?.classList.toggle('off', !kiiOn);
  if (kiiOn) alert('Kiinteistörajat eivät ole saatavilla ilman MML API-avainta.');
}

// ── Popup helper ──────────────────────────────────────────────
function popupHtml(name, desc) {
  let d = desc || '';
  if (d.startsWith('http'))
    d = `<a href="${d}" target="_blank" style="color:#4fc3f7">Karttapaikka ↗</a>`;
  return `<div class="pop-title">${name}</div><div class="pop-desc">${d}</div>`;
}

// ── Build tunnel overlay layers ───────────────────────────────
function buildTunnelLayers(D) {
  // Tunnelilinja
  const lineGroup = L.layerGroup();
  (D['Tunnelilinja'] || []).forEach(i => {
    if (i.t === 'l')
      L.polyline(i.c, { color: '#ff4444', weight: 3, opacity: .9 })
       .bindPopup(popupHtml(i.n, i.d)).addTo(lineGroup);
  });
  tGroups.tunnelilinja = lineGroup;

  // Paaluvälit
  const pG = L.layerGroup();
  const pI = L.divIcon({ className: '', html: '<div style="width:8px;height:8px;background:#4fc3f7;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>', iconSize: [8,8], iconAnchor: [4,4] });
  (D['Paaluvälit'] || []).forEach(i =>
    L.marker([i.lat, i.lon], { icon: pI }).bindPopup(popupHtml(i.n, i.d)).addTo(pG)
  );
  tGroups.paalut = pG;

  // Ilmareiät
  const iG = L.layerGroup();
  const iI = L.divIcon({ className: '', html: '<div style="width:12px;height:12px;background:#ff4444;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,.6)"></div>', iconSize: [12,12], iconAnchor: [6,6] });
  (D['Ilmareiät'] || []).forEach(i =>
    L.marker([i.lat, i.lon], { icon: iI }).bindPopup(popupHtml(i.n, i.d)).addTo(iG)
  );
  tGroups.ilmareikat = iG;

  // Ajotunnelit
  const aG = L.layerGroup();
  (D['Ajotunnelit'] || []).forEach(i => {
    const ic = L.divIcon({ className: '', html: `<div style="background:#2e7d32;color:#fff;font-family:monospace;font-size:10px;padding:2px 6px;border-radius:5px;border:1.5px solid #fff;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.5)">${i.n}</div>`, iconAnchor: [0,10] });
    L.marker([i.lat, i.lon], { icon: ic }).bindPopup(popupHtml(i.n, i.d)).addTo(aG);
  });
  tGroups.ajotunnelit = aG;

  // Suuaukot
  const sG = L.layerGroup();
  const sI = L.divIcon({ className: '', html: '<div style="width:12px;height:12px;background:#00e5ff;border:2px solid #fff;border-radius:2px;box-shadow:0 1px 6px rgba(0,0,0,.6)"></div>', iconSize: [12,12], iconAnchor: [6,6] });
  (D['Ajokuilujen suuaukot (maanpinta)'] || []).forEach(i =>
    L.marker([i.lat, i.lon], { icon: sI }).bindPopup(popupHtml(i.n, i.d)).addTo(sG)
  );
  tGroups.suuaukot = sG;

  // Erityiskohteet
  const eG = L.layerGroup();
  const eC = { 'Ohitustunneli': '#ffa726', 'Sortuma': '#ef5350', 'Betoniholvi': '#00e5ff' };
  (D['Erityiskohteet'] || []).forEach(i => {
    const col = Object.keys(eC).find(k => i.n.includes(k)) || 'Ohitustunneli';
    const w = i.n.includes('Betoniholvi') ? 8 : i.n.includes('Sortuma') ? 6 : 3;
    L.polyline(i.c, { color: eC[col], weight: w, opacity: .9 })
     .bindPopup(popupHtml(i.n, i.d)).addTo(eG);
  });
  tGroups.erityis = eG;

  // Add all to map
  Object.values(tGroups).forEach(g => g.addTo(map));
}

function toggleTLayer(key) {
  tLayerState[key] = !tLayerState[key];
  document.getElementById('chk-' + key)?.classList.toggle('off', !tLayerState[key]);
  tLayerState[key] ? tGroups[key].addTo(map) : map.removeLayer(tGroups[key]);
}

function zoomTunneli() {
  map.fitBounds([[60.268, 24.89158], [61.2491, 25.51797]], { padding: [40, 40] });
}

// ── GPS ───────────────────────────────────────────────────────
let gpsM = null, gpsC = null, follow = true;
let lastPos = null;

function initGPS() {
  if (!navigator.geolocation) {
    document.getElementById('gps-status').textContent = 'GPS: ei tuettu';
    return;
  }
  navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
    lastPos = pos.coords;
    const kmh = speed != null ? (speed * 3.6).toFixed(1).replace('.', ',') : '0,0';
    document.getElementById('speed-val').textContent = kmh;
    const st = document.getElementById('gps-status');
    st.textContent = `GPS: ±${Math.round(accuracy)} m`;
    st.classList.add('fix');
    const ll = [lat, lon];
    if (!gpsM) {
      gpsM = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="gps-dot"></div>', iconSize: [14,14], iconAnchor: [7,7] }), zIndexOffset: 9999 }).addTo(map);
      gpsC = L.circle(ll, { radius: accuracy, color: '#4caf50', weight: 1, fillColor: '#4caf50', fillOpacity: .07, interactive: false }).addTo(map);
    } else {
      gpsM.setLatLng(ll);
      gpsC.setLatLng(ll).setRadius(accuracy);
    }
    if (follow) map.setView(ll, map.getZoom(), { animate: true, duration: .4 });
  }, err => {
    const st = document.getElementById('gps-status');
    st.classList.remove('fix');
    st.textContent = err.code === 1 ? 'GPS: lupa evätty' : err.code === 2 ? 'GPS: ei signaalia' : 'GPS: aikakatkaisu';
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
}

function toggleFollow() {
  follow = !follow;
  document.getElementById('follow-btn').style.background = follow ? '#1b5e20' : '#2e7d32';
  if (follow && lastPos) map.setView([lastPos.latitude, lastPos.longitude], map.getZoom());
}

function getLastPos() { return lastPos; }

// ── Measure ───────────────────────────────────────────────────
let measuring = false, mPts = [], mLines = [], mMarkers = [], mTips = [];

function hvD(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const dl = r(b[0]-a[0]), dlo = r(b[1]-a[1]);
  const x = Math.sin(dl/2)**2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dlo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
function fmtDist(m) { return m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`; }

function toggleMeasure() {
  if (measuring) { closeMeasure(); return; }
  measuring = true;
  document.getElementById('measure-btn')?.classList.add('active-tool');
  document.getElementById('measure-panel')?.classList.add('open');
  map.getContainer().style.cursor = 'crosshair';
}
function closeMeasure() {
  measuring = false;
  document.getElementById('measure-btn')?.classList.remove('active-tool');
  document.getElementById('measure-panel')?.classList.remove('open');
  clearMeasure();
}
function clearMeasure() {
  mPts = []; [...mLines, ...mMarkers, ...mTips].forEach(l => map.removeLayer(l));
  mLines = []; mMarkers = []; mTips = [];
  document.getElementById('measure-dist').textContent = '0,0 m';
  document.getElementById('measure-hint').textContent = 'Napauta karttaa lisätäksesi pisteitä';
  if (!measuring) map.getContainer().style.cursor = '';
}
function doMeasure(ll) {
  const pt = [ll.lat, ll.lng];
  const dot = L.circleMarker(pt, { radius: 6, color: '#fff', weight: 2, fillColor: '#4caf50', fillOpacity: 1, zIndexOffset: 500 }).addTo(map);
  dot.on('click', ev => { L.DomEvent.stopPropagation(ev); if (mPts.length > 0) { mPts.pop(); map.removeLayer(mMarkers.pop()); rebuildMeasure(); } });
  mMarkers.push(dot); mPts.push(pt); rebuildMeasure();
}
function rebuildMeasure() {
  [...mLines, ...mTips].forEach(l => map.removeLayer(l)); mLines = []; mTips = [];
  if (mPts.length < 2) { document.getElementById('measure-dist').textContent = '0,0 m'; return; }
  let tot = 0;
  for (let i = 1; i < mPts.length; i++) {
    const d = hvD(mPts[i-1], mPts[i]); tot += d;
    const seg = L.polyline([mPts[i-1], mPts[i]], { color: '#4caf50', weight: 3, opacity: .9, dashArray: '6,4' }).addTo(map);
    const mid = [(mPts[i-1][0]+mPts[i][0])/2, (mPts[i-1][1]+mPts[i][1])/2];
    const tip = L.tooltip({ permanent: true, direction: 'top', className: 'ms-tip' }).setContent(fmtDist(d)).setLatLng(mid).addTo(map);
    mLines.push(seg); mTips.push(tip);
  }
  document.getElementById('measure-dist').textContent = fmtDist(tot);
  document.getElementById('measure-hint').textContent = `${mPts.length} pistettä • yhteensä`;
}
function isMeasuring() { return measuring; }

// ── Routing ───────────────────────────────────────────────────
let routeLayer = null, routeMs = [], rMode = 'car', pickingDest = false;

function openRoute() { document.getElementById('route-panel')?.classList.add('open'); }
function closeRoute() { document.getElementById('route-panel')?.classList.remove('open'); pickingDest = false; map.getContainer().style.cursor = ''; }
function setRouteMode(m) { rMode = m; ['car','foot','bike'].forEach(x => document.getElementById('mode-'+x)?.classList.toggle('sel', x===m)); }
function gpsAsFrom() {
  if (!lastPos) { alert('Sijainti ei saatavilla'); return; }
  document.getElementById('route-from').value = `${lastPos.latitude.toFixed(6)}, ${lastPos.longitude.toFixed(6)}`;
}
function startPickOnMap() { pickingDest = true; map.getContainer().style.cursor = 'crosshair'; document.getElementById('route-panel')?.classList.remove('open'); }
function isPickingDest() { return pickingDest; }
function setPickedDest(ll) {
  pickingDest = false; map.getContainer().style.cursor = '';
  document.getElementById('route-to').value = `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`;
  document.getElementById('route-panel')?.classList.add('open');
}

async function geocode(q) {
  const c = q.trim().split(',').map(parseFloat);
  if (c.length === 2 && !isNaN(c[0]) && !isNaN(c[1])) return { lat: c[0], lon: c[1] };
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`);
  const d = await r.json();
  if (!d.length) throw new Error('Ei löydy: ' + q);
  return { lat: +d[0].lat, lon: +d[0].lon };
}

async function calcRoute() {
  const fv = document.getElementById('route-from').value.trim();
  const tv = document.getElementById('route-to').value.trim();
  if (!fv || !tv) { alert('Anna lähtö- ja määränpää'); return; }
  const btn = document.getElementById('route-go');
  btn.textContent = 'Lasketaan…'; btn.disabled = true;
  try {
    const [from, to] = await Promise.all([geocode(fv), geocode(tv)]);
    const prof = rMode === 'car' ? 'driving' : rMode === 'bike' ? 'cycling' : 'walking';
    const resp = await fetch(`https://router.project-osrm.org/route/v1/${prof}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`);
    const data = await resp.json();
    if (data.code !== 'Ok') throw new Error('Reitti ei löydy');
    _drawRoute(data, from, to);
  } catch(e) { alert('Virhe: ' + e.message); }
  btn.textContent = 'Laske reitti'; btn.disabled = false;
}

function _drawRoute(data, from, to) {
  if (routeLayer) map.removeLayer(routeLayer);
  routeMs.forEach(m => map.removeLayer(m)); routeMs = [];
  const route = data.routes[0];
  routeLayer = L.polyline(route.geometry.coordinates.map(c => [c[1],c[0]]), { color: '#2196f3', weight: 5, opacity: .88 }).addTo(map);
  map.fitBounds(routeLayer.getBounds(), { padding: [50,50] });
  const mk = (txt, col) => L.divIcon({ className: '', html: `<div style="background:${col};color:#fff;font-family:monospace;font-size:11px;padding:3px 7px;border-radius:6px;border:2px solid #fff;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)">${txt}</div>`, iconAnchor: [0,14] });
  routeMs.push(L.marker([from.lat,from.lon], { icon: mk('A','#2e7d32') }).addTo(map));
  routeMs.push(L.marker([to.lat,to.lon], { icon: mk('B','#c62828') }).addTo(map));
  const dist = route.distance >= 1000 ? `${(route.distance/1000).toFixed(1)} km` : `${Math.round(route.distance)} m`;
  const dur  = route.duration < 3600  ? `${Math.round(route.duration/60)} min` : `${Math.floor(route.duration/3600)}t ${Math.round((route.duration%3600)/60)}min`;
  document.getElementById('route-summary').textContent = `${dist}  •  ${dur}`;
  document.getElementById('route-steps').innerHTML = route.legs[0].steps.slice(0,12).map(s =>
    `<div class="route-step">→ ${s.maneuver.type==='arrive'?'Saavut perille':s.name||s.maneuver.type}<span class="step-dist">${s.distance>=1000?(s.distance/1000).toFixed(1)+' km':Math.round(s.distance)+' m'}</span></div>`
  ).join('');
  document.getElementById('route-result').style.display = 'block';
}

export {
  initMap, getMap, setBase, toggleKiinteisto,
  buildTunnelLayers, toggleTLayer, zoomTunneli,
  initGPS, toggleFollow, getLastPos,
  toggleMeasure, closeMeasure, clearMeasure, doMeasure, isMeasuring,
  openRoute, closeRoute, setRouteMode, gpsAsFrom,
  startPickOnMap, isPickingDest, setPickedDest, calcRoute
};
