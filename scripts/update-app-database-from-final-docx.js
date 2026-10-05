const fs = require('fs');
const path = require('path');

const root = process.cwd();
const hostTablePath = path.join(root, '_docx_extract_final', 'table1.utf8.tsv');
const commonNamesPath = path.join(root, '_docx_extract_final', 'table3.utf8.tsv');
const indexPath = path.join(root, 'assets', 'data.js');

const STATE_NAMES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO', 'BR'
]);

const oldDbMatch = fs.readFileSync(indexPath, 'utf8').match(/const DATABASE = ([\s\S]*?);\r?\n\r?\nconst STATE_COORDS/);
if (!oldDbMatch) throw new Error('Could not find DATABASE block in assets/data.js');
const oldDb = JSON.parse(oldDbMatch[1]);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPathogenName(value) {
  return cleanText(value)
    .replace(/\s*\(AMAZÔNIA\)\s*\d+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function acceptedHostName(value) {
  return cleanText(value).replace(/\s*\(sin\..*?\)\s*/gi, '').trim();
}

function firstCommonName(value, fallback) {
  const clean = cleanText(value);
  if (!clean) return fallback;
  return clean.split(',').map(s => s.trim()).filter(Boolean)[0] || fallback;
}

function commonAliases(value) {
  return cleanText(value).split(',').map(s => s.trim()).filter(Boolean);
}

function parseRegions(value) {
  const text = cleanText(value).replace(/[;,]/g, ' ');
  const regions = [];
  const regionPattern = /Região\s+(?:Centro-Oeste|Nordeste|Norte|Sudeste|Sul|Amazônica)|\b(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO|BR)\b/g;
  for (const match of text.matchAll(regionPattern)) {
    const region = match[0].trim();
    if (STATE_NAMES.has(region) || region.startsWith('Região ')) {
      if (!regions.includes(region)) regions.push(region);
    }
  }
  return regions;
}

function fallbackGroup(scientific, commonName) {
  const text = normalize(`${scientific} ${commonName}`);
  if (/(citrus|mangifera|vitis|coffea|malus|prunus|musa|ananas|cucumis|citrullus|passiflora|carica|fragaria|eucalyptus|psidium|annona|persea|cocos|bixa)/.test(text)) return ['Frutíferas', 'Atualização 2008-2026'];
  if (/(solanum|capsicum|allium|brassica|lactuca|daucus|beta vulgaris|manihot|zea mays|phaseolus|glycine|max|triticum|avena|oryza|sorghum|cucurbita|abelmoschus|cichorium|eruca|raphanus)/.test(text)) return ['Hortaliças e culturas anuais', 'Atualização 2008-2026'];
  if (/(orchid|cattleya|dendrobium|phalaenopsis|anthurium|begonia|rosa|chrysanthemum|cyclamen|dracaena|dieffenbachia|aglaonema|zantedeschia|caladium|clorofito|primula|violeta|gladiolus|heliconia|gerbera|kalanchoe)/.test(text)) return ['Ornamentais', 'Atualização 2008-2026'];
  if (/(euphorbia|ageratum|chenopodium|alternanthera|acanthospermum|chamaecrista|vernonia|catharanthus)/.test(text)) return ['Hospedeiras silvestres', 'Atualização 2008-2026'];
  return ['Outras', 'Atualização 2008-2026'];
}

const oldHostMeta = new Map();
for (const host of oldDb.hosts) {
  oldHostMeta.set(normalize(host.nome_cientifico), host);
}

const commonNames = new Map();
const commonLines = fs.readFileSync(commonNamesPath, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
for (const line of commonLines) {
  const [scientific, popular] = line.split('\t');
  const accepted = acceptedHostName(scientific);
  if (accepted) commonNames.set(normalize(accepted), cleanText(popular));
}

const hosts = [];
const hostMap = new Map();
let currentHost = '';
const lines = fs.readFileSync(hostTablePath, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);

for (const line of lines) {
  const [hostCell, pathogenCell, regionCell] = line.split('\t');
  if ([hostCell, pathogenCell, regionCell].some(cell => String(cell || '').includes('<w:'))) continue;
  const hostName = acceptedHostName(hostCell) || currentHost;
  const pathogenName = cleanPathogenName(pathogenCell).replace(/[‘’]/g, "'");
  const regions = parseRegions(regionCell);
  if (hostCell && acceptedHostName(hostCell)) currentHost = acceptedHostName(hostCell);
  if (!hostName || !pathogenName || !regions.length) continue;
  if (hostName.includes('w:') || pathogenName.includes('w:')) continue;

  const hostKey = normalize(hostName);
  if (!hostMap.has(hostKey)) {
    const oldMeta = oldHostMeta.get(hostKey);
    const commonRaw = commonNames.get(hostKey);
    const common = firstCommonName(commonRaw, oldMeta?.nome_comum || hostName);
    const aliases = commonAliases(commonRaw);
    const [grupo, subgrupo] = oldMeta ? [oldMeta.grupo_agronomico, oldMeta.subgrupo] : fallbackGroup(hostName, common);
    const host = {
      nome_comum: common,
      nome_cientifico: hostName,
      grupo_agronomico: grupo,
      subgrupo,
      patogenos: []
    };
    if (aliases.length > 1) host.nomes_populares = aliases;
    hostMap.set(hostKey, host);
    hosts.push(host);
  }

  const host = hostMap.get(hostKey);
  let pathogen = host.patogenos.find(p => normalize(p.bacteria) === normalize(pathogenName));
  if (!pathogen) {
    pathogen = { bacteria: pathogenName, regioes: [] };
    host.patogenos.push(pathogen);
  }
  for (const region of regions) {
    if (!pathogen.regioes.includes(region)) pathogen.regioes.push(region);
  }
}

for (const host of hosts) {
  host.patogenos.sort((a, b) => normalize(a.bacteria).localeCompare(normalize(b.bacteria), 'pt-BR'));
}
hosts.sort((a, b) => normalize(a.nome_cientifico).localeCompare(normalize(b.nome_cientifico), 'pt-BR'));

const database = { hosts };
const formatted = `const DATABASE = ${JSON.stringify(database, null, 2)};`;
const index = fs.readFileSync(indexPath, 'utf8');
const updated = index.replace(/const DATABASE = [\s\S]*?;\r?\n\r?\nconst STATE_COORDS/, `${formatted}\n\nconst STATE_COORDS`);
fs.writeFileSync(indexPath, updated, 'utf8');

const recordCount = hosts.reduce((sum, host) => sum + host.patogenos.length, 0);
const regionCount = hosts.reduce((sum, host) => sum + host.patogenos.reduce((inner, p) => inner + p.regioes.length, 0), 0);
console.log(JSON.stringify({ hosts: hosts.length, records: recordCount, regions: regionCount }, null, 2));
