# Päijännetunneli – Kenttäkartta PWA

Leaflet-pohjainen kenttäkarttasovellus Päijännetunnelin tarkastustyöhön.
Täysin offline-toimiva PWA, salasanasuojattu, AES-salattu data.

---

## Kansiorakenne

```
/
├── index.html              # App shell + kirjautumissivu
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── .nojekyll               # Pakollinen GitHub Pagesille (JS-moduulit)
│
├── js/
│   ├── auth.js             # SHA-256 + PBKDF2 kirjautuminen
│   ├── tunnelDataLoader.js # Salatun datan haku + purku
│   ├── map.js              # Leaflet-kartta, GPS, mittaus, reitti
│   ├── notes.js            # Kenttämuistiinpanot, kuvat, PDF-vienti
│   └── ui.js               # Näyttönavigaatio, hakupalkki, handler-wiring
│
├── data/
│   └── tunneli.enc.json    # AES-256-GCM salattu tunneli-data
│
└── icons/
    ├── icon-16.png … icon-512.png
```

---

## Arkkitehtuuri

### Kirjautumisvirta

```
Käyttäjä syöttää salasanan
    ↓
auth.js: SHA-256(salasana) → vertaa CORRECT_HASH
    ↓ (täsmää)
auth.js: PBKDF2(hash, salt, 100000 iter) → AES-256 CryptoKey
    ↓
tunnelDataLoader.js: fetch(tunneli.enc.json) → AES-GCM decrypt
    ↓
map.js: buildTunnelLayers(data) → Leaflet-kerrokset kartalle
```

### Service Worker -strategiat

| Pyyntötyyppi | Strategia | Selitys |
|---|---|---|
| App shell (HTML/JS/CSS/ikonit) | Cache-First | Nopea käynnistys, toimii offline |
| Karttaruudut (tiles) | Network-First + Cache fallback | Tuoreet ruudut kun online, välimuistista kun offline |
| Routing/Geocoding API | Network-Only | Ei tallenneta – liikaa muuttujia |

### Tile-välimuisti
- Max **2000 ruutua** (~80–120 MB)
- Vanhimmat poistetaan automaattisesti (FIFO-eviction)
- Kaikki katsotut alueet toimivat offline metsässä

---

## Tietoturva GitHub Pagesilla

### Mitä tehdään

| Toimenpide | Toteutus |
|---|---|
| Salasanahash | SHA-256, vain hash koodissa – ei plaintext |
| Avainjohdannainen | PBKDF2-SHA256, 100 000 iteraatiota |
| Data-salaus | AES-256-GCM, purku vain onnistuneen kirjautumisen jälkeen |
| Pääsynhallinta | Kartta + data ei lataudu ennen autentikointia |
| Suojattu siirto | HTTPS (GitHub Pages pakottaa) |

### Rajoitukset (static hosting)

> ⚠️ **GitHub Pages on julkinen staattinen hosting.**
> Tietoturva on "security through obscurity" -tason — ei enterprise-tason.

| Rajoitus | Selitys |
|---|---|
| Salattu data on julkinen | `tunneli.enc.json` on kaikkien ladattavissa reposta |
| Salasanahash on julkinen | Brute-force hyökkäys mahdollinen jos hash vuotaa |
| JS-koodi on näkyvissä | Salauslogiikka ja KDF-parametrit voi lukea |
| Ei rate limittiä | Kirjautumisyrityksiä ei voi rajoittaa |

### Milloin tämä riittää

✅ Suojaa satunnaisilta uteliailta  
✅ Estää datan helpon selailun page sourcesta  
✅ PBKDF2 hidastaa brute-forcea merkittävästi  
✅ Sopii ei-arkaluonteiselle tekniselle datalle  

### Milloin tarvitaan enemmän

❌ Oikea backend (Node/Python) + JWT-autentikointi  
❌ Arkaluonteinen data (henkilötiedot, turvaluokiteltu)  
❌ Kaupallinen tai kriittinen infrastruktuuri  

---

## GitHub Pages -käyttöönotto

```bash
# 1. Luo uusi repo tai käytä olemassa olevaa
git init
git add .
git commit -m "PWA v2.0"
git remote add origin https://github.com/KÄYTTÄJÄ/REPO.git
git push -u origin main

# 2. GitHub → Settings → Pages → Source: Deploy from branch → main / root
# 3. Odota ~60 sekuntia → https://KÄYTTÄJÄ.github.io/REPO/
```

**Tärkeää:** `.nojekyll`-tiedosto on pakollinen — ilman sitä GitHub Pages
estää ES-moduulien latauksen tiedostonimien perusteella.

---

## Offline-käyttö metsässä

1. Avaa sovellus kerran kun on nettiyhteys
2. Siirry tunnelin alueelle kartalla — tiles tallentuvat automaattisesti
3. Sulje selain, lennätä lentokonetila päälle
4. Avaa sovellus uudelleen → toimii täysin offline

**PWA asennus puhelimeen:**
- Chrome Android: Jaa → Lisää aloitusnäyttöön
- Safari iOS: Jaa → Lisää aloitusnäyttöön

---

## Salasanan vaihtaminen

```bash
# 1. Generoi uusi hash
echo -n "UusiSalasana123" | sha256sum
# → abc123...

# 2. Päivitä auth.js
# const CORRECT_HASH = 'abc123...';

# 3. Salaa data uudelleen uudella hashilla
# (käytä build-skriptiä tai encrypt.py)

# 4. Päivitä data/tunneli.enc.json

# 5. Päivitä sw.js VERSION = 'v3' (pakottaa SW-päivityksen)
```
