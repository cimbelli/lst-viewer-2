// Mappa interattiva LST - vanilla JS, statico.
// - manifest.json elenca i comuni (con `regione`); ogni TopoJSON ha i valori
//   {stat}_YYYY (stat in {min, med, mdn, max}) e COD_TIPO_S per ogni feature.
// - Layer stack: basemap OSM/Positron/Satellite -> tematizzazione COD_TIPO_S
//   (macro-aree, opaca) -> tematizzazione LST (semi-trasparente).

const PALETTES = {
  giallorosso: ['#ffffcc', '#fee187', '#fdae61', '#f46d43', '#a50026'],
  blurosso:    ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'],
  viridis:     ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  grigi:       ['#f7f7f7', '#cccccc', '#969696', '#636363', '#252525'],
};

const BASEMAPS = {
  osm:       { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap contributors' },
  positron:  { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap, &copy; CARTO' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri' },
  none:      null,
};

const STAT_LABEL = { med: 'Media', mdn: 'Mediana', min: 'Minimo', max: 'Massimo' };
const YEARS_PARZIALI = new Set([2026]);

const ORDINE_REGIONI = [
  "Piemonte", "Valle d'Aosta", "Lombardia", "Trentino-Alto Adige",
  "Veneto", "Friuli-Venezia Giulia", "Liguria", "Emilia-Romagna",
  "Toscana", "Umbria", "Marche", "Lazio", "Abruzzo", "Molise",
  "Campania", "Puglia", "Basilicata", "Calabria", "Sicilia", "Sardegna"
];

// Aggregazione COD_TIPO_S -> 8 macro-classi (id, nome, colore).
// Le macro-classi sono ordinate secondo un gradiente attesto di
// impermeabilita'/temperatura (piu' impervious -> piu' caldo, in cima).
// Ogni sezione appartiene esattamente a una macro; il codice 0 (non mappato)
// e i codici non presenti vengono raccolti nella macro 8 (Altro).
const TIPO_S_MACRO = [
  { id: 1, nome: 'Residenziale denso',        colore: '#c0392b' },
  { id: 2, nome: 'Produttivo/infrastrutture', colore: '#7f0000' },
  { id: 3, nome: 'Servizi e istituzioni',     colore: '#e08a5b' },
  { id: 4, nome: 'Verde urbano',              colore: '#27ae60' },
  { id: 5, nome: 'Agricolo',                  colore: '#f4d35e' },
  { id: 6, nome: 'Vegetazione naturale',      colore: '#0f6b3d' },
  { id: 7, nome: 'Acqua e zone umide',        colore: '#2166ac' },
  { id: 8, nome: 'Altro/residuali',           colore: '#9e9e9e' },
];

// Lookup COD_TIPO_S -> id_macro
const TIPO_S_TO_MACRO = {
  1:1,
  6:2, 7:2, 10:2, 12:2, 21:2, 30:2, 32:2, 33:2, 34:2, 36:2, 55:2,
  2:3, 3:3, 4:3, 8:3, 9:3, 15:3, 16:3, 18:3, 24:3, 25:3, 29:3, 31:3, 35:3, 37:3, 50:3, 53:3, 60:3, 78:3,
  5:4,
  26:5, 61:5, 62:5, 63:5, 64:5, 65:5, 66:5, 68:5, 81:5,
  22:6, 28:6, 69:6, 79:6,
  23:7, 56:7, 80:7,
  19:8, 20:8, 27:8, 99:8, 100:8,
};

// Etichetta descrittiva per singolo codice (per il tooltip del layer tipologia)
const COD_TIPO_S_LABEL = {
  1: 'Residenziale', 2: 'Culto', 3: 'Monumento/palazzo storico', 4: 'Piazza monumentale',
  5: 'Area verde/parco urbano', 6: 'Porto', 7: 'Aeroporto', 8: 'Caserma',
  9: 'Ospedale/ASL', 10: 'Ferrovia', 12: 'Attivita\u2019 produttive',
  15: 'Cimitero', 16: 'Impianto sportivo', 18: 'Universita\u2019/ricerca',
  19: 'Centro accoglienza temporaneo', 20: 'Insediamento post-calamita\u2019',
  21: 'Cava/miniera', 22: 'Bosco/copertura forestale', 23: 'Acque interne/zone umide',
  24: 'Carcere', 25: 'Struttura ricettiva', 26: 'Area agricola', 27: 'Faro',
  28: 'Rocce nude/veg. rada', 29: 'Municipio', 30: 'Impianto produzione energia',
  31: 'Museo', 32: 'Impianto TLC', 33: 'Rifiuti', 34: 'Logistica/stoccaggio merci',
  35: 'Villa monumentale', 36: 'Strade principali', 37: 'Scuole/istituti',
  50: 'Depuratore', 53: 'Ludico-ricreativo/teatro/cinema', 55: 'Centro commerciale/fiera',
  56: 'Litoranea (no stabilimenti)', 60: 'Impianti idrici', 61: 'Risaia',
  62: 'Prateria temporanea', 63: 'Frutteto', 64: 'Oliveto', 65: 'Vigneto',
  66: 'Altre colture permanenti', 68: 'Pascolo/alpeggio', 69: 'Cespuglieto',
  78: 'Area archeologica', 79: 'Incolto/cantiere', 80: 'Saline', 81: 'Serre',
  99: 'Altro', 100: 'Senza fissa dimora',
};

function macroForCodice(cod) {
  if (cod == null || cod === '') return 8;
  const n = Number(cod);
  return TIPO_S_TO_MACRO[n] ?? 8;
}
function coloreMacro(idMacro) {
  const m = TIPO_S_MACRO.find(m => m.id === idMacro);
  return m ? m.colore : '#cccccc';
}
function nomeMacro(idMacro) {
  const m = TIPO_S_MACRO.find(m => m.id === idMacro);
  return m ? m.nome : 'Sconosciuta';
}

const state = {
  manifest: null,
  dataCache: new Map(),
  lstLayer: null,
  tipoSLayer: null,
  map: null,
  tileLayer: null,
};
const el = (id) => document.getElementById(id);
const loading = (on) => { const l = el('loading'); if (l) l.style.display = on ? 'block' : 'none'; };

// ---------- classification ----------
function classQuantile(values, k) {
  const s = [...values].sort((a, b) => a - b);
  const breaks = [s[0]];
  for (let i = 1; i < k; i++) {
    const idx = Math.floor((i / k) * (s.length - 1));
    breaks.push(s[idx]);
  }
  breaks.push(s[s.length - 1]);
  return [...new Set(breaks)];
}
function classEqual(values, k) {
  const min = Math.min(...values), max = Math.max(...values);
  const step = (max - min) / k;
  const breaks = [];
  for (let i = 0; i <= k; i++) breaks.push(min + step * i);
  return breaks;
}
function classJenks(data, k) {
  const values = [...data].sort((a, b) => a - b);
  const n = values.length;
  if (n <= k) return [...new Set(values)];
  const mat1 = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));
  const mat2 = Array.from({ length: n + 1 }, () => Array(k + 1).fill(Infinity));
  for (let i = 1; i <= k; i++) { mat1[1][i] = 1; mat2[1][i] = 0; for (let j = 2; j <= n; j++) mat2[j][i] = Infinity; }
  let v = 0;
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1;
      const val = values[i3 - 1];
      s2 += val * val; s1 += val; w++;
      v = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= k; j++) {
          if (mat2[l][j] >= v + mat2[i4][j - 1]) {
            mat1[l][j] = i3; mat2[l][j] = v + mat2[i4][j - 1];
          }
        }
      }
    }
    mat1[l][1] = 1; mat2[l][1] = v;
  }
  const breaks = Array(k + 1);
  breaks[k] = values[n - 1]; breaks[0] = values[0];
  let kk = n;
  for (let j = k; j >= 2; j--) {
    const id = mat1[kk][j] - 2;
    breaks[j - 1] = values[id];
    kk = mat1[kk][j] - 1;
  }
  return breaks;
}
function computeBreaks(values, method, k) {
  if (method === 'quantile') return classQuantile(values, k);
  if (method === 'equal') return classEqual(values, k);
  if (method === 'jenks') return classJenks(values, k);
  return classQuantile(values, k);
}

// ---------- color ramp ----------
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex([r, g, b]) { return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join(''); }
function rampColors(stops, k) {
  const rgb = stops.map(hexToRgb);
  const out = [];
  for (let i = 0; i < k; i++) {
    const t = k === 1 ? 0 : i / (k - 1);
    const scaled = t * (rgb.length - 1);
    const i0 = Math.floor(scaled), i1 = Math.min(i0 + 1, rgb.length - 1);
    const f = scaled - i0;
    const c = rgb[i0].map((v, idx) => v + (rgb[i1][idx] - v) * f);
    out.push(rgbToHex(c));
  }
  return out;
}
function colorForValue(v, breaks, colors) {
  for (let i = 0; i < breaks.length - 1; i++) {
    if (v <= breaks[i + 1] || i === breaks.length - 2) return colors[i];
  }
  return colors[colors.length - 1];
}

// ---------- data loading ----------
async function loadManifest() {
  const res = await fetch('data/manifest.json');
  state.manifest = await res.json();
}
async function loadComune(entry) {
  if (state.dataCache.has(entry.code)) return state.dataCache.get(entry.code);
  loading(true);
  const res = await fetch(entry.file);
  const raw = await res.json();
  let geojson;
  if (entry.format === 'topojson') {
    const objName = Object.keys(raw.objects)[0];
    geojson = topojson.feature(raw, raw.objects[objName]);
  } else {
    geojson = raw;
  }
  state.dataCache.set(entry.code, geojson);
  loading(false);
  return geojson;
}

// ---------- rendering ----------
function currentStat() { return el('statSelect').value; }
function currentYear() { return parseInt(el('yearSlider').value, 10); }
function currentFieldKey() { return `${currentStat()}_${currentYear()}`; }
function currentOpacity() { return parseInt(el('opacitySlider').value, 10) / 100; }

function styleFeatureLST(feature, breaks, colors, field) {
  const v = feature.properties[field];
  const op = currentOpacity();
  return {
    fillColor: v == null ? '#eeeeee' : colorForValue(v, breaks, colors),
    fillOpacity: v == null ? 0 : op,
    color: '#666',
    weight: 0.15,
    opacity: op > 0 ? 0.6 : 0,
  };
}
function styleFeatureTipoS(feature) {
  const id = macroForCodice(feature.properties.COD_TIPO_S);
  return {
    fillColor: coloreMacro(id),
    fillOpacity: 0.85,
    color: '#ffffff',
    weight: 0.1,
  };
}

function renderLegend(breaks, colors, field) {
  const box = el('legend');
  const swatches = colors.map(c => `<div class="swatch" style="background:${c}"></div>`).join('');
  const labels = breaks.map(b => Math.round(b * 10) / 10).join('&nbsp;&nbsp;');
  const statLabel = STAT_LABEL[currentStat()];
  const y = currentYear();
  const yLabel = YEARS_PARZIALI.has(y) ? `${y} <em>parziale</em>` : `${y}`;

  let macroBlock = '';
  if (el('tipoSToggle').checked) {
    const rows = TIPO_S_MACRO.map(m =>
      `<div class="macro-row"><div class="macro-sw" style="background:${m.colore}"></div><span>${m.nome}</span></div>`
    ).join('');
    macroBlock = `<div class="macro-list"><div style="font-weight:600;font-size:10px;">Tipologia (Istat)</div>${rows}</div>`;
  }

  box.innerHTML =
    `<div class="swatches">${swatches}</div>` +
    `<div>${labels}</div>` +
    `<div class="label">${statLabel} ${yLabel} (&deg;C)</div>` +
    macroBlock;
}

function renderInfoPanel(entry, geojson, field, values) {
  const dl = el('infoPanel');
  const min = Math.min(...values), max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const statLabel = STAT_LABEL[currentStat()];
  const y = currentYear();
  const yTag = YEARS_PARZIALI.has(y) ? ` <em>(parziale)</em>` : '';
  dl.innerHTML = `
    <dt>Comune</dt><dd>${entry.name}</dd>
    <dt>Codice</dt><dd>${entry.code}</dd>
    <dt>Sezioni</dt><dd>${geojson.features.length}</dd>
    <dt>Statistica</dt><dd>${statLabel} ${y}${yTag}</dd>
    <dt>Minimo (tra sezioni)</dt><dd>${min.toFixed(2)} &deg;C</dd>
    <dt>Massimo (tra sezioni)</dt><dd>${max.toFixed(2)} &deg;C</dd>
    <dt>Media (tra sezioni)</dt><dd>${mean.toFixed(2)} &deg;C</dd>
    <dt>Mediana (tra sezioni)</dt><dd>${median.toFixed(2)} &deg;C</dd>`;

  const table = el('dataTable');
  table.querySelector('thead').innerHTML = '';
  table.querySelector('tbody').innerHTML =
    '<tr><td style="color:var(--muted);font-style:italic;padding:8px 4px;">Clicca una sezione sulla mappa per vedere i dettagli</td></tr>';
}

function renderSectionInfo(feature, entry) {
  const p = feature.properties;
  const stat = currentStat();
  const statLabel = STAT_LABEL[stat];

  const cod = p.COD_TIPO_S;
  const codLabel = cod == null || cod === '' ? 'n/d'
    : `${cod} \u2013 ${COD_TIPO_S_LABEL[Number(cod)] ?? 'sconosciuto'}`;
  const macroId = macroForCodice(cod);

  const serieRows = entry.years.map(y => {
    const key = `${stat}_${y}`;
    const val = p[key];
    const cls = YEARS_PARZIALI.has(y) ? ' class="parziale"' : '';
    return `<tr${cls}><td>${y}</td><td>${val == null ? 'n/d' : val + ' °C'}</td></tr>`;
  }).join('');

  const table = el('dataTable');
  table.querySelector('thead').innerHTML = `
    <tr><th colspan="2" style="text-align:left;padding-top:12px;">
      Sezione ${p.SEZ21_ID ?? p.SEZ21 ?? ''}
    </th></tr>
    <tr>
      <th>Popolazione (POP21)</th><td>${p.POP21 ?? 'n/d'}</td>
    </tr>
    <tr>
      <th>Tipologia (COD_TIPO_S)</th><td>${codLabel}</td>
    </tr>
    <tr>
      <th>Macro-classe</th><td><span style="display:inline-block;width:10px;height:10px;background:${coloreMacro(macroId)};margin-right:5px;border:1px solid rgba(0,0,0,.15);vertical-align:middle;"></span>${nomeMacro(macroId)}</td>
    </tr>
    <tr>
      <th style="padding-top:8px;">Anno</th><th style="padding-top:8px;">${statLabel} (°C)</th>
    </tr>`;
  table.querySelector('tbody').innerHTML = serieRows;
}

function setBasemap(key) {
  if (state.tileLayer) { state.map.removeLayer(state.tileLayer); state.tileLayer = null; }
  const b = BASEMAPS[key];
  if (!b) return;
  state.tileLayer = L.tileLayer(b.url, { attribution: b.attr, subdomains: 'abc', maxZoom: 19 }).addTo(state.map);
  if (state.tileLayer && state.tileLayer.bringToBack) state.tileLayer.bringToBack();
}

function updateYearDisplay() {
  const y = currentYear();
  const yv = el('yearVal');
  yv.textContent = y;
  yv.classList.toggle('parziale', YEARS_PARZIALI.has(y));
  const note = el('yearNote');
  if (YEARS_PARZIALI.has(y)) {
    const oggi = new Date().toLocaleDateString('it-IT',
      { day: '2-digit', month: 'long', year: 'numeric' });
    el('yearNoteDate').textContent = oggi;
    note.classList.add('visible');
  } else {
    note.classList.remove('visible');
  }
}

function updateOpacityLabel() {
  el('opacityVal').textContent = `${el('opacitySlider').value}%`;
}

async function refresh() {
  const entry = state.manifest.comuni.find(c => c.code === el('comuneSelect').value);
  if (!entry) return;
  const geojson = await loadComune(entry);
  const field = currentFieldKey();
  const stat = currentStat();

  const values = geojson.features.map(f => f.properties[field]).filter(v => v != null);
  if (values.length === 0) { console.warn(`Nessun valore per ${field}`); return; }

  // Break FISSI su tutti gli anni del comune per la statistica corrente
  const yearFields = entry.years.map(y => `${stat}_${y}`);
  const allYearsValues = [];
  for (const f of geojson.features) {
    for (const yf of yearFields) {
      const v = f.properties[yf];
      if (v != null) allYearsValues.push(v);
    }
  }
  const k = parseInt(el('numClasses').value, 10);
  const method = el('classSelect').value;
  const breaks = computeBreaks(allYearsValues, method, k);
  const colors = rampColors(PALETTES[el('paletteSelect').value], breaks.length - 1);

  // Rimuove i layer precedenti
  if (state.lstLayer) { state.map.removeLayer(state.lstLayer); state.lstLayer = null; }
  if (state.tipoSLayer) { state.map.removeLayer(state.tipoSLayer); state.tipoSLayer = null; }

  // Layer tipologia sezione (sotto la LST)
  if (el('tipoSToggle').checked) {
    state.tipoSLayer = L.geoJSON(geojson, {
      renderer: L.canvas(),
      style: styleFeatureTipoS,
      interactive: false,
    }).addTo(state.map);
  }

  // Layer LST (sopra)
  state.lstLayer = L.geoJSON(geojson, {
    renderer: L.canvas(),
    style: (f) => styleFeatureLST(f, breaks, colors, field),
    onEachFeature: (f, layer) => {
      const v = f.properties[field];
      const vLabel = v == null ? 'n/d' : `${v} °C`;
      const cod = f.properties.COD_TIPO_S;
      const codShort = cod == null || cod === '' ? '' :
        ` \u00b7 ${COD_TIPO_S_LABEL[Number(cod)] ?? 'tipo ' + cod}`;
      layer.bindTooltip(`Sezione ${f.properties.SEZ21_ID ?? ''}${codShort}<br>${vLabel}`, { sticky: true });
      layer.on('click', () => renderSectionInfo(f, entry));
    },
  }).addTo(state.map);

  renderLegend(breaks, colors, field);
  renderInfoPanel(entry, geojson, field, values);
}

// ---------- wiring ----------
function populateComuneSelect() {
  const sel = el('comuneSelect');
  sel.innerHTML = '';
  const perRegione = {};
  for (const c of state.manifest.comuni) {
    const reg = c.regione || 'Altro';
    (perRegione[reg] ||= []).push(c);
  }
  const regioniOrdinate = [...ORDINE_REGIONI];
  for (const reg of Object.keys(perRegione).sort()) {
    if (!regioniOrdinate.includes(reg)) regioniOrdinate.push(reg);
  }
  for (const reg of regioniOrdinate) {
    const comuni = perRegione[reg];
    if (!comuni || !comuni.length) continue;
    comuni.sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const og = document.createElement('optgroup');
    og.label = reg;
    for (const c of comuni) {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = c.name;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
}

function populateYearSlider(entry) {
  const slider = el('yearSlider');
  slider.min = entry.years[0];
  slider.max = entry.years[entry.years.length - 1];
  if (parseInt(slider.value, 10) < slider.min || parseInt(slider.value, 10) > slider.max) {
    slider.value = entry.years[entry.years.length - 1];
  }
  updateYearDisplay();
}

async function onComuneChange() {
  const entry = state.manifest.comuni.find(c => c.code === el('comuneSelect').value);
  populateYearSlider(entry);
  await refresh();
  try { state.map.fitBounds(state.lstLayer.getBounds(), { padding: [20, 20] }); } catch (e) {}
}

async function init() {
  state.map = L.map('map', { renderer: L.canvas() }).setView([43.6, 13.5], 12);
  setBasemap('osm');
  await loadManifest();
  populateComuneSelect();
  updateYearDisplay();
  updateOpacityLabel();
  await onComuneChange();

  el('comuneSelect').addEventListener('change', onComuneChange);
  el('statSelect').addEventListener('change', refresh);
  el('classSelect').addEventListener('change', refresh);
  el('paletteSelect').addEventListener('change', refresh);
  el('numClasses').addEventListener('input', () => { el('numClassesVal').textContent = el('numClasses').value; refresh(); });
  el('yearSlider').addEventListener('input', () => { updateYearDisplay(); refresh(); });
  el('opacitySlider').addEventListener('input', () => { updateOpacityLabel(); refresh(); });
  el('tipoSToggle').addEventListener('change', refresh);
  el('basemapSelect').addEventListener('change', () => setBasemap(el('basemapSelect').value));
}
init();
