/**
 * notes.js – Field notes: create, edit, images, PDF export
 * Data stored in localStorage (survives offline / page reload)
 */

'use strict';

let notes = [];
let currentNoteId  = null;
let currentImages  = []; // [{dataUrl, name}]

// ── Persistence ───────────────────────────────────────────────
function loadNotes() {
  try { notes = JSON.parse(localStorage.getItem('pt_notes') || '[]'); }
  catch { notes = []; }
}
function saveNotes() {
  try { localStorage.setItem('pt_notes', JSON.stringify(notes)); }
  catch {
    // Storage full – save without images as fallback
    try { localStorage.setItem('pt_notes', JSON.stringify(notes.map(n => ({ ...n, images: [] })))); }
    catch {}
    alert('Tallennus epäonnistui – selain täynnä. Lataa PDF varmuuskopiona.');
  }
}

// ── Render list ───────────────────────────────────────────────
function renderNotesList() {
  loadNotes();
  const el = document.getElementById('notes-list');
  if (!el) return;
  if (!notes.length) {
    el.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.3);font-family:var(--ui);font-size:14px;padding:32px 0">Ei muistiinpanoja vielä.<br>Luo uusi napilla alla.</div>';
    return;
  }
  el.innerHTML = notes.map((n, i) => `
    <div class="note-card" onclick="window._editNote(${i})">
      <div class="note-card-title">${esc(n.title || 'Nimetön')}</div>
      <div class="note-card-meta">${n.date || ''}${n.gps ? ' • 📍 ' + n.gps : ''}</div>
      ${n.body ? `<div class="note-card-preview">${esc(n.body)}</div>` : ''}
      ${n.images?.length ? `<div class="note-card-imgs">${n.images.map(img =>
        `<img class="note-thumb" src="${img.dataUrl}" onclick="event.stopPropagation();window._openImg('${img.dataUrl}')">`
      ).join('')}</div>` : ''}
    </div>
  `).join('');
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Editor ────────────────────────────────────────────────────
function openNewNote() {
  currentNoteId = null; currentImages = [];
  _resetEditor('Uusi muistiinpano', '', '', '');
  document.getElementById('delete-note-btn').style.display = 'none';
  _showScreen('screen-editor');
}

function editNote(idx) {
  loadNotes();
  const n = notes[idx];
  currentNoteId = idx;
  currentImages = [...(n.images || [])];
  _resetEditor('Muokkaa muistiinpanoa', n.title || '', n.body || '', n.gps || '');
  document.getElementById('delete-note-btn').style.display = 'block';
  _renderEditorImages();
  _showScreen('screen-editor');
}

function _resetEditor(screenTitle, title, body, gps) {
  document.getElementById('editor-screen-title').textContent = screenTitle;
  document.getElementById('note-editor-title').value = title;
  document.getElementById('note-editor-body').value  = body;
  const badge = document.getElementById('note-gps-badge');
  if (gps) { badge.textContent = '📍 ' + gps; badge.classList.add('show'); badge.dataset.gps = gps; }
  else      { badge.textContent = ''; badge.classList.remove('show'); delete badge.dataset.gps; }
}

function _renderEditorImages() {
  document.getElementById('note-imgs-row').innerHTML = currentImages.map((img, i) => `
    <div class="note-img-wrap">
      <img src="${img.dataUrl}" onclick="window._openImg('${img.dataUrl}')">
      <button class="del-img-btn" onclick="window._removeImg(${i})">×</button>
    </div>
  `).join('');
}

function removeImage(i) { currentImages.splice(i, 1); _renderEditorImages(); }

function handleImages(evt) {
  Array.from(evt.target.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const s = MAX/Math.max(w,h); w = Math.round(w*s); h = Math.round(h*s); }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        currentImages.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), name: file.name });
        _renderEditorImages();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  evt.target.value = '';
}

function tagGPS(lastPos) {
  if (!lastPos) { alert('Sijainti ei saatavilla'); return; }
  const lat = lastPos.latitude.toFixed(6), lon = lastPos.longitude.toFixed(6);
  const badge = document.getElementById('note-gps-badge');
  badge.textContent = `📍 ${lat}, ${lon} (±${Math.round(lastPos.accuracy)} m)`;
  badge.classList.add('show');
  badge.dataset.gps = `${lat}, ${lon}`;
}

function saveNote() {
  loadNotes();
  const title = document.getElementById('note-editor-title').value.trim();
  const body  = document.getElementById('note-editor-body').value.trim();
  const badge = document.getElementById('note-gps-badge');
  const gps   = badge.dataset.gps || '';
  if (!title && !body && !currentImages.length) { alert('Kirjoita jotain ennen tallennusta.'); return; }
  const now  = new Date();
  const date = `${now.getDate()}.${now.getMonth()+1}.${now.getFullYear()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const note = { title: title || 'Nimetön', body, date, gps, images: currentImages };
  if (currentNoteId === null) notes.unshift(note);
  else notes[currentNoteId] = note;
  saveNotes();
  backToNotes();
}

function deleteNote() {
  if (!confirm('Poistetaanko tämä muistiinpano?')) return;
  loadNotes(); notes.splice(currentNoteId, 1); saveNotes(); backToNotes();
}

function backToNotes() {
  renderNotesList();
  _showScreen('screen-notes');
}

// ── Image viewer ──────────────────────────────────────────────
function openImgViewer(src) {
  document.getElementById('img-viewer-img').src = src;
  document.getElementById('img-viewer').classList.add('open');
}
function closeImgViewer() {
  document.getElementById('img-viewer').classList.remove('open');
  document.getElementById('img-viewer-img').src = '';
}

// ── PDF Export ────────────────────────────────────────────────
async function exportAllPDF() {
  loadNotes();
  if (!notes.length) { alert('Ei muistiinpanoja.'); return; }
  if (!window.jspdf) { alert('PDF-kirjasto ei ole saatavilla. Tarkista internetyhteys.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = 210, ph = 297, mg = 15;
  let y = mg;

  // Cover
  doc.setFillColor(13, 22, 13);
  doc.rect(0, 0, pw, ph, 'F');
  doc.setTextColor(76, 175, 80); doc.setFontSize(24); doc.setFont('helvetica','bold');
  doc.text('Päijännetunneli', pw/2, 50, { align: 'center' });
  doc.setFontSize(16); doc.setTextColor(200, 230, 200);
  doc.text('Kenttämuistiinpanot', pw/2, 62, { align: 'center' });
  doc.setFontSize(11); doc.setTextColor(120, 160, 120);
  const now = new Date();
  doc.text(`Luotu: ${now.getDate()}.${now.getMonth()+1}.${now.getFullYear()}  ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`, pw/2, 75, { align: 'center' });
  doc.text(`${notes.length} muistiinpanoa`, pw/2, 83, { align: 'center' });

  for (let ni = 0; ni < notes.length; ni++) {
    const n = notes[ni];
    doc.addPage(); doc.setFillColor(18, 28, 18); doc.rect(0,0,pw,ph,'F'); y = mg;
    doc.setFillColor(46,125,50); doc.rect(0,0,pw,14,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text('Päijännetunneli – Kenttämuistiinpanot', mg, 9);
    doc.text(`${ni+1}/${notes.length}`, pw-mg, 9, { align: 'right' });
    y = 24;
    doc.setTextColor(76,175,80); doc.setFontSize(18); doc.setFont('helvetica','bold');
    const titleLines = doc.splitTextToSize(n.title || 'Nimetön', pw-2*mg);
    doc.text(titleLines, mg, y); y += titleLines.length * 8 + 2;
    doc.setTextColor(120,160,120); doc.setFontSize(9); doc.setFont('helvetica','normal');
    if (n.date) { doc.text('📅 '+n.date, mg, y); y += 5; }
    if (n.gps)  { doc.text('📍 '+n.gps,  mg, y); y += 5; }
    y += 3;
    doc.setDrawColor(46,125,50); doc.setLineWidth(0.5); doc.line(mg, y, pw-mg, y); y += 5;
    if (n.body) {
      doc.setTextColor(220,240,220); doc.setFontSize(11); doc.setFont('helvetica','normal');
      for (const line of doc.splitTextToSize(n.body, pw-2*mg)) {
        if (y > ph-mg-10) { doc.addPage(); doc.setFillColor(18,28,18); doc.rect(0,0,pw,ph,'F'); y = mg; }
        doc.text(line, mg, y); y += 6;
      }
      y += 4;
    }
    for (const imgObj of (n.images || [])) {
      try {
        const tmpImg = new Image();
        await new Promise(res => { tmpImg.onload = res; tmpImg.src = imgObj.dataUrl; });
        const aspect = tmpImg.naturalHeight / tmpImg.naturalWidth;
        const maxW = pw-2*mg, maxH = 80;
        let iw = maxW, ih = maxW * aspect;
        if (ih > maxH) { ih = maxH; iw = maxH / aspect; }
        if (y + ih > ph-mg-10) { doc.addPage(); doc.setFillColor(18,28,18); doc.rect(0,0,pw,ph,'F'); y = mg; }
        doc.addImage(imgObj.dataUrl, imgObj.dataUrl.includes('image/png') ? 'PNG' : 'JPEG', mg, y, iw, ih);
        y += ih + 4;
        if (imgObj.name) { doc.setTextColor(100,140,100); doc.setFontSize(8); doc.text(imgObj.name, mg, y); y += 5; }
      } catch {}
    }
  }
  doc.save('paijaannetunneli_muistiinpanot.pdf');
}

// ── Screen helper (used internally) ──────────────────────────
function _showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ── Expose to global for inline onclick handlers ──────────────
window._editNote      = editNote;
window._openImg       = openImgViewer;
window._removeImg     = removeImage;

export {
  loadNotes, renderNotesList,
  openNewNote, editNote, saveNote, deleteNote, backToNotes,
  handleImages, tagGPS,
  openImgViewer, closeImgViewer,
  exportAllPDF
};
