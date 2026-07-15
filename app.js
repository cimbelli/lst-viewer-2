// Mappa interattiva LST v3 - vanilla JS, statico.
// - manifest.json elenca i comuni (con `regione`); ogni TopoJSON ha i valori
//   {stat}_YYYY (stat in {min, med, mdn, max}), COD_TIPO_S e SHAPE_AREA per ogni feature.
// - Layer stack: basemap -> tematizzazione COD_TIPO_S (macro v3) -> LST semi-trasparente.
// - Selezione persistente col bordo nero; download CSV sezioni (temperature) generato lato client.

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

// --- Tassonomia macro v3 (10 classi + escluso) ---
const TIPO_S_MACRO = [
  { id: 1,  nome: 'Tessuto urbano continuo',    colore: '#c0392b' },
  { id: 2,  nome: 'Superficie impervia pesante',colore: '#7f0000' },
  { id: 3,  nome: 'Rete infrastrutturale',      colore: '#212121' },
  { id: 4,  nome: 'Superficie minerale nuda',   colore: '#8b7355' },
  { id: 5,  nome: 'Edifici pubblici e servizi', colore: '#e08a5b' },
  { id: 6,  nome: 'Impianti sportivi',          colore: '#c39bd3' },
  { id: 7,  nome: 'Verde urbano',               colore: '#27ae60' },
  { id: 8,  nome: 'Vegetazione naturale',       colore: '#0f6b3d' },
  { id: 9,  nome: 'Colture agricole',           colore: '#f4d35e' },
  { id: 10, nome: 'Acqua e zone umide',         colore: '#2166ac' },
  { id: 0,  nome: 'Escluso/residuale',          colore: '#cccccc' },
];

const TIPO_S_TO_MACRO = {
  1: 1,
  12: 2, 34: 2, 55: 2,
  6: 3, 7: 3, 10: 3, 36: 3,
  21: 4, 28: 4, 79: 4,
  2: 5, 3: 5, 4: 5, 8: 5, 9: 5, 15: 5, 18: 5, 24: 5, 25: 5, 29: 5,
  30: 5, 31: 5, 32: 5, 33: 5, 35: 5, 37: 5, 50: 5, 53: 5, 60: 5, 78: 5,
  16: 6,
  5: 7,
  22: 8, 69: 8,
  26: 9, 61: 9, 62: 9, 63: 9, 64: 9, 65: 9, 66: 9, 68: 9, 81: 9,
  23: 10, 56: 10, 80: 10,
  19: 0, 20: 0, 27: 0, 99: 0, 100: 0,
};

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

const SELECTED_STYLE = { color: '#000', weight: 2.2, opacity: 1 };

function macroForCodice(cod) {
  if (cod == null || cod === '') return 0;
  const n = Number(cod);
  return TIPO_S_TO_MACRO[n] ?? 0;
}
function coloreMacro(idMacro) {
  const m = TIPO_S_MACRO.find(m => m.id === idMacro);
  return m ? m.colore : '#cccccc';
}
function nomeMacro(idMacro) {
  const m = TIPO_S_MACRO.find(m => m.id === idMacro);
  return m ? m.nome : 'Sconosciuta';
}

// Sanitizza il nome comune per costruire i path dei download (deve corrispondere
// alla funzione python sanitize_filename del notebook)
function sanitizeName(name) {
  return String(name)
    .trim()
    .replace(/'/g, '').replace(/\u2019/g, '')
    .replace(/\//g, '-')
    .replace(/[^A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF0-9._ -]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._\- ]+|[._\- ]+$/g, '') || 'Comune';
}

const state = {
  manifest: null,
  dataCache: new Map(),
  lstLayer: null,
  tipoSLayer: null,
  map: null,
  tileLayer: null,
  currentComuneCode: null,
  currentTipoSVisible: null,
  currentEntry: null,
  currentGeojson: null,
  currentBreaks: null,
  currentColors: null,
  currentField: null,
  selectedLayer: null,
  selectedSez21: null,
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

function styleFeatureLST(feature) {
  const v = feature.properties[state.currentField];
  const op = currentOpacity();
  return {
    fillColor: v == null ? '#eeeeee' : colorForValue(v, state.currentBreaks, state.currentColors),
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

function renderLegend() {
  const box = el('legend');
  const swatches = state.currentColors.map(c => `<div class="swatch" style="background:${c}"></div>`).join('');
  const labels = state.currentBreaks.map(b => Math.round(b * 10) / 10).join('&nbsp;&nbsp;');
  const statLabel = STAT_LABEL[currentStat()];
  const y = currentYear();
  const yLabel = YEARS_PARZIALI.has(y) ? `<em>${y}*</em>` : `${y}`;

  let macroBlock = '';
  if (el('tipoSToggle').checked) {
    // Escludo la classe "0 - Escluso" dalla legenda visibile
    const rows = TIPO_S_MACRO.filter(m => m.id !== 0).map(m =>
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

function renderInfoPanel() {
  const entry = state.currentEntry;
  const geojson = state.currentGeojson;
  const field = state.currentField;
  const values = geojson.features.map(f => f.properties[field]).filter(v => v != null);
  if (values.length === 0) return;

  const dl = el('infoPanel');
  const min = Math.min(...values), max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const statLabel = STAT_LABEL[currentStat()];
  const y = currentYear();
  const yTag = YEARS_PARZIALI.has(y) ? `<em>*</em>` : '';
  dl.innerHTML = `
    <dt>Comune</dt><dd>${entry.name}</dd>
    <dt>Codice</dt><dd>${entry.code}</dd>
    <dt>Sezioni</dt><dd>${geojson.features.length}</dd>
    <dt>Statistica</dt><dd>${statLabel} ${y}${yTag}</dd>
    <dt>Minimo (tra sezioni)</dt><dd>${min.toFixed(2)} &deg;C</dd>
    <dt>Massimo (tra sezioni)</dt><dd>${max.toFixed(2)} &deg;C</dd>
    <dt>Media (tra sezioni)</dt><dd>${mean.toFixed(2)} &deg;C</dd>
    <dt>Mediana (tra sezioni)</dt><dd>${median.toFixed(2)} &deg;C</dd>`;

  if (state.selectedLayer == null) resetDataTable();
}

function resetDataTable() {
  const table = el('dataTable');
  table.querySelector('thead').innerHTML = '';
  table.querySelector('tbody').innerHTML =
    '<tr><td style="color:var(--muted);font-style:italic;padding:8px 4px;">Clicca una sezione sulla mappa per vedere i dettagli</td></tr>';
}

function renderSectionInfo(feature) {
  const entry = state.currentEntry;
  const p = feature.properties;
  const stat = currentStat();
  const statLabel = STAT_LABEL[stat];

  const cod = p.COD_TIPO_S;
  const codLabel = cod == null || cod === '' ? 'n/d'
    : `${cod} \u2013 ${COD_TIPO_S_LABEL[Number(cod)] ?? 'sconosciuto'}`;
  const macroId = macroForCodice(cod);

  // Area in ettari (SHAPE_AREA in m^2)
  const area = p.SHAPE_AREA;
  const areaLabel = area == null ? 'n/d'
    : (Number(area) < 10000
        ? `${Math.round(Number(area))} m²`
        : `${(Number(area)/10000).toFixed(2)} ha`);

  const serieRows = entry.years.map(y => {
    const key = `${stat}_${y}`;
    const val = p[key];
    const cls = YEARS_PARZIALI.has(y) ? ' class="parziale"' : '';
    const yLabel = YEARS_PARZIALI.has(y) ? `<em>${y}*</em>` : y;
    return `<tr${cls}><td>${yLabel}</td><td>${val == null ? 'n/d' : val + ' °C'}</td></tr>`;
  }).join('');

  const table = el('dataTable');
  table.querySelector('thead').innerHTML = `
    <tr><th colspan="2" style="text-align:left;padding-top:12px;">
      Sezione ${p.SEZ21_ID ?? p.SEZ21 ?? ''}
    </th></tr>
    <tr>
      <th>Area</th><td>${areaLabel}</td>
    </tr>
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

// ---------- selezione sezione ----------
function clearSelection() {
  if (state.selectedLayer) {
    try {
      state.selectedLayer.setStyle(styleFeatureLST(state.selectedLayer.feature));
    } catch (e) { /* ignore */ }
  }
  state.selectedLayer = null;
  state.selectedSez21 = null;
  resetDataTable();
}

function selectSection(layer, feature) {
  const sez = feature.properties.SEZ21 ?? feature.properties.SEZ21_ID;
  if (state.selectedSez21 != null && state.selectedSez21 === sez) {
    clearSelection();
    return;
  }
  if (state.selectedLayer && state.selectedLayer !== layer) {
    try {
      state.selectedLayer.setStyle(styleFeatureLST(state.selectedLayer.feature));
    } catch (e) { /* ignore */ }
  }
  layer.setStyle(SELECTED_STYLE);
  if (layer.bringToFront) layer.bringToFront();
  state.selectedLayer = layer;
  state.selectedSez21 = sez;
  renderSectionInfo(feature);
}

// ---------- download CSV (generato lato client) ----------
// Il report PDF e' stato rimosso. Il CSV delle sezioni con le temperature viene
// costruito al volo dai dati gia' caricati (state.currentGeojson), quindi non serve
// piu' la cartella reports/ ne' file pre-generati: funziona per qualsiasi comune.

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Costruisce il testo CSV di tutte le sezioni del comune, con le temperature LST
// (min, media, mediana, max) per ogni anno disponibile.
function buildSezioniCsv(entry, geojson) {
  const stats = ['min', 'med', 'mdn', 'max'];       // ordine colonne temperature
  const years = entry.years || [];
  const header = [
    'SEZ21_ID', 'PRO_COM', 'COD_TIPO_S', 'TIPO_S_DESC',
    'MACRO_ID', 'MACRO_CLASSE', 'SHAPE_AREA_M2', 'POP21',
  ];
  for (const y of years) {
    for (const s of stats) header.push(`LST_${s}_${y}`);
  }

  const lines = [header.join(',')];
  for (const f of geojson.features) {
    const p = f.properties;
    const cod = p.COD_TIPO_S;
    const macroId = macroForCodice(cod);
    const row = [
      p.SEZ21_ID ?? p.SEZ21 ?? '',
      p.PRO_COM ?? entry.code ?? '',
      cod ?? '',
      cod == null || cod === '' ? '' : (COD_TIPO_S_LABEL[Number(cod)] ?? ''),
      macroId,
      nomeMacro(macroId),
      p.SHAPE_AREA ?? '',
      p.POP21 ?? '',
    ];
    for (const y of years) {
      for (const s of stats) row.push(p[`${s}_${y}`] ?? '');
    }
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

function updateDownloadLinks(entry) {
  const nameSlug = sanitizeName(entry.name);
  const csv = el('dlCsv');
  const geojson = state.currentGeojson;

  // Libera l'eventuale blob del comune precedente per non accumulare memoria.
  if (csv._blobUrl) { URL.revokeObjectURL(csv._blobUrl); csv._blobUrl = null; }

  if (!geojson || !geojson.features || !geojson.features.length) {
    csv.setAttribute('aria-disabled', 'true');
    csv.removeAttribute('href');
    return;
  }

  const text = buildSezioniCsv(entry, geojson);
  // BOM UTF-8 per far leggere correttamente gli accenti a Excel.
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  csv._blobUrl = url;

  csv.setAttribute('href', url);
  csv.setAttribute('download', `sezioni_${nameSlug}.csv`);
  csv.removeAttribute('aria-disabled');
  csv.removeAttribute('target');   // il download deve avvenire nella stessa scheda
}

function setBasemap(key) {
  if (state.tileLayer) { state.map.removeLayer(state.tileLayer); state.tileLayer = null; }
  const b = BASEMAPS[key];
  if (!b) return;
  state.tileLayer = L.tileLayer(b.url, { attribution: b.attr, subdomains: 'abc', maxZoom: 19 }).addTo(state.map);
  ensureLayerOrder();
}

function ensureLayerOrder() {
  if (state.tileLayer && state.tileLayer.bringToBack) state.tileLayer.bringToBack();
  if (state.tipoSLayer && state.tipoSLayer.bringToFront) state.tipoSLayer.bringToFront();
  if (state.lstLayer && state.lstLayer.bringToFront) state.lstLayer.bringToFront();
  if (state.selectedLayer && state.selectedLayer.bringToFront) state.selectedLayer.bringToFront();
}

function updateYearDisplay() {
  const y = currentYear();
  const yv = el('yearVal');
  yv.textContent = YEARS_PARZIALI.has(y) ? `${y}*` : `${y}`;
  yv.classList.toggle('parziale', YEARS_PARZIALI.has(y));
}
function updateOpacityLabel() {
  el('opacityVal').textContent = `${el('opacitySlider').value}%`;
}

function computeCurrentStyleParams() {
  const entry = state.currentEntry;
  const geojson = state.currentGeojson;
  const stat = currentStat();
  state.currentField = currentFieldKey();

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
  state.currentBreaks = computeBreaks(allYearsValues, method, k);
  state.currentColors = rampColors(PALETTES[el('paletteSelect').value], state.currentBreaks.length - 1);
}

async function refresh(reason) {
  const entry = state.manifest.comuni.find(c => c.code === el('comuneSelect').value);
  if (!entry) return;

  const comuneChanged = state.currentComuneCode !== entry.code;
  const tipoSVisible = el('tipoSToggle').checked;
  const tipoSChanged = state.currentTipoSVisible !== tipoSVisible;

  if (comuneChanged) {
    state.currentEntry = entry;
    state.currentGeojson = await loadComune(entry);
    state.currentComuneCode = entry.code;
    updateDownloadLinks(entry);
  }

  computeCurrentStyleParams();

  const needRebuild = comuneChanged || tipoSChanged
    || !state.lstLayer
    || reason === 'rebuild';

  if (needRebuild) {
    clearSelection();

    if (state.lstLayer) { state.map.removeLayer(state.lstLayer); state.lstLayer = null; }
    if (state.tipoSLayer) { state.map.removeLayer(state.tipoSLayer); state.tipoSLayer = null; }

    if (tipoSVisible) {
      state.tipoSLayer = L.geoJSON(state.currentGeojson, {
        renderer: L.canvas(),
        style: styleFeatureTipoS,
        interactive: false,
      }).addTo(state.map);
    }

    state.lstLayer = L.geoJSON(state.currentGeojson, {
      renderer: L.canvas(),
      style: styleFeatureLST,
      onEachFeature: (f, layer) => {
        layer.bindTooltip('', { sticky: true });
        layer.on('mouseover', () => {
          const v = f.properties[state.currentField];
          const vLabel = v == null ? 'n/d' : `${v} °C`;
          const cod = f.properties.COD_TIPO_S;
          const codShort = cod == null || cod === '' ? '' :
            ` \u00b7 ${COD_TIPO_S_LABEL[Number(cod)] ?? 'tipo ' + cod}`;
          layer.setTooltipContent(`Sezione ${f.properties.SEZ21_ID ?? ''}${codShort}<br>${vLabel}`);
        });
        layer.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          selectSection(layer, f);
        });
      },
    }).addTo(state.map);

    state.currentTipoSVisible = tipoSVisible;
    ensureLayerOrder();
  } else {
    if (state.lstLayer) state.lstLayer.setStyle(styleFeatureLST);
    if (state.selectedLayer) {
      state.selectedLayer.setStyle(SELECTED_STYLE);
      if (state.selectedLayer.bringToFront) state.selectedLayer.bringToFront();
    }
    ensureLayerOrder();
  }

  renderLegend();
  renderInfoPanel();
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
  await refresh('rebuild');
  try { state.map.fitBounds(state.lstLayer.getBounds(), { padding: [20, 20] }); } catch (e) {}
}

async function init() {
  state.map = L.map('map', {
    renderer: L.canvas(),
    preferCanvas: true,
  }).setView([43.6, 13.5], 12);

  setBasemap('osm');
  await loadManifest();
  populateComuneSelect();
  updateYearDisplay();
  updateOpacityLabel();
  await onComuneChange();

  el('comuneSelect').addEventListener('change', onComuneChange);
  el('statSelect').addEventListener('change', () => refresh('style'));
  el('classSelect').addEventListener('change', () => refresh('style'));
  el('paletteSelect').addEventListener('change', () => refresh('style'));
  el('numClasses').addEventListener('input', () => {
    el('numClassesVal').textContent = el('numClasses').value;
    refresh('style');
  });
  el('yearSlider').addEventListener('input', () => { updateYearDisplay(); refresh('style'); });
  el('opacitySlider').addEventListener('input', () => { updateOpacityLabel(); refresh('style'); });
  el('tipoSToggle').addEventListener('change', () => refresh('rebuild'));
  el('basemapSelect').addEventListener('change', () => setBasemap(el('basemapSelect').value));

  state.map.on('click', () => clearSelection());
}
init();
