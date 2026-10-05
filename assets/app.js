const app = {
currentPhotos: [],
allPhotos: [],
currentPhotoIndex: 0,
currentPhotoFilter: 'all',
selectedSymptom: '',
map: null,
mapInitialized: false,
theme: localStorage.getItem('theme') || 'light',
searchTimeout: null,
currentCultureFilter: 'all',
pathogenMap: null,
tourStep: 0,
compareMode: false,
selectedPathogens: new Map(),
tourSteps: [
{ emoji:"👋", title:"Bem-vindo(a)!", text:"O Fitobactérias BR agora permite comparar múltiplas bactérias no mesmo mapa. Vamos conhecer?" },
{ emoji:"🎨", title:"Modo Comparar", text:"Na aba Culturas, ative o 'Modo Comparar' para selecionar vários patógenos diferentes e ver suas ocorrências sobrepostas em cores distintas." },
{ emoji:"🗺️", title:"Mapa individual", text:"Mesmo sem o modo Comparar, toque em qualquer bactéria para abrir seu mapa específico de distribuição." },
{ emoji:"🦠", title:"Busca por Bactéria", text:"Já sabe o nome? Use a aba 'Bactérias' para buscá-lo diretamente." },
{ emoji:"🎯", title:"Pronto!", text:"Explore à vontade. Seus dados ficam 100% offline!" }
],

init() {
document.body.dataset.view = 'homeView';
this.applyTheme();
this.applyTaxonomyUpdates();
this.applyHostTaxonomyUpdates();
this.mergeEquivalentHosts();
this.mergeEquivalentPathogens();
this.mergeCoffeeHybrids();
this.sortAllHostPathogens();
this.generateCultureFilters();
this.generateGlossary();
this.setupEvents();
this.updateFieldStatus();
this.initExperience();
if ('serviceWorker' in navigator) {
navigator.serviceWorker.register('sw.js').catch(()=>{});
}
},

applyTaxonomyUpdates() {
DATABASE.hosts.forEach(host => {
host.patogenos.forEach(p => {
for (let [oldName, newName] of Object.entries(taxonomyUpdates)) {
if (this.normalizeText(this.plainName(p.bacteria)) === this.normalizeText(oldName)) {
if (!p.bacteria.includes('(syn.')) {
const original = p.bacteria;
if (oldName.toLowerCase() !== newName.toLowerCase()) {
// Verifica se tem sinonímia histórica especial
if (HISTORICAL_SYNONYMS[oldName]) {
p.bacteria = `${newName} <span class="synonym" style="font-size:0.8em; color:var(--text-tertiary); font-style:italic;">(syn. ${original}; historicamente ${HISTORICAL_SYNONYMS[oldName]})</span>`;
} else {
p.bacteria = `${newName} <span class="synonym" style="font-size:0.8em; color:var(--text-tertiary); font-style:italic;">(syn. ${original})</span>`;
}
}
p._needsReview = TAXONOMY_REVIEW_REQUIRED.has(oldName);
}
break;
}
}
// Verifica se precisa de revisão mesmo sem atualização
if (!p._needsReview) {
for (let reviewName of TAXONOMY_REVIEW_REQUIRED) {
if (p.bacteria.toLowerCase().includes(reviewName.toLowerCase())) {
p._needsReview = true;
break;
}
}
}
});
});
console.log("✅ Taxonomia revisada conforme literatura 2024-2025");
},

applyHostTaxonomyUpdates() {
DATABASE.hosts.forEach(host => {
for (let [oldName, newName] of Object.entries(hostTaxonomyUpdates)) {
if (host.nome_cientifico === oldName) {
host.nome_original = oldName;
host.nome_cientifico = newName;
break;
}
}
});
console.log("✅ Nomes científicos de hospedeiras atualizados");
},

canonicalPathogenName(value) {
let name = this.plainName(value).replace(/\(syn\..*$/i, '').trim();
for (let [oldName, newName] of Object.entries(taxonomyUpdates)) {
if (this.normalizeText(name) === this.normalizeText(oldName)) {
name = newName;
break;
}
}
return name;
},

mergeEquivalentPathogens() {
DATABASE.hosts.forEach(host => {
const merged = new Map();
host.patogenos.forEach(pathogen => {
const canonical = this.canonicalPathogenName(pathogen.bacteria);
const key = this.normalizeText(canonical).replace(/[^a-z0-9]+/g, ' ').trim();
if (!merged.has(key)) {
merged.set(key, {
bacteria: canonical,
regioes: [],
_needsReview: Boolean(pathogen._needsReview)
});
}
const target = merged.get(key);
pathogen.regioes.forEach(region => {
if (!target.regioes.includes(region)) target.regioes.push(region);
});
if (pathogen._needsReview) target._needsReview = true;
});
host.patogenos = Array.from(merged.values());
});
},

upsertPathogen(host, bacteria, regioes) {
const targetName = this.canonicalPathogenName(bacteria);
const targetKey = this.normalizeText(targetName).replace(/[^a-z0-9]+/g, ' ').trim();
let pathogen = host.patogenos.find(p => this.normalizeText(this.canonicalPathogenName(p.bacteria)).replace(/[^a-z0-9]+/g, ' ').trim() === targetKey);
if (!pathogen) {
pathogen = { bacteria: targetName, regioes: [] };
host.patogenos.push(pathogen);
}
regioes.forEach(region => {
if (!pathogen.regioes.includes(region)) pathogen.regioes.push(region);
});
},

mergeEquivalentHosts() {
const merged = new Map();
DATABASE.hosts.forEach(host => {
const key = this.normalizeText(host.nome_cientifico).replace(/[^a-z0-9]+/g, ' ').trim();
if (!merged.has(key)) {
merged.set(key, {
...host,
patogenos: []
});
}
const target = merged.get(key);
if (host.nome_comum && !this.normalizeText(target.nome_comum).includes(this.normalizeText(host.nome_comum))) {
target.nome_comum = target.nome_comum || host.nome_comum;
}
if (host.nome_original && host.nome_original !== target.nome_cientifico) {
target.nome_original = target.nome_original ? `${target.nome_original}; ${host.nome_original}` : host.nome_original;
}
host.patogenos.forEach(pathogen => this.upsertPathogen(target, pathogen.bacteria, pathogen.regioes));
});
DATABASE.hosts = Array.from(merged.values());
},

mergeCoffeeHybrids() {
const hybridHosts = DATABASE.hosts.filter(host => {
const scientific = this.normalizeText(host.nome_cientifico).replace(/[^a-z0-9]+/g, ' ').trim();
return scientific.startsWith('coffea arabica x coffea') || scientific.startsWith('coffea arabica coffea');
});
if (hybridHosts.length <= 1) return;
const mergedHost = {
nome_comum: "Café híbrido",
nome_cientifico: "Coffea arabica híbridos",
nome_original: "Coffea arabica × Coffea spp.",
grupo_agronomico: hybridHosts[0].grupo_agronomico,
subgrupo: hybridHosts[0].subgrupo,
patogenos: []
};
hybridHosts.forEach(host => {
host.patogenos.forEach(pathogen => this.upsertPathogen(mergedHost, pathogen.bacteria, pathogen.regioes));
});
DATABASE.hosts = DATABASE.hosts.filter(host => !hybridHosts.includes(host));
DATABASE.hosts.push(mergedHost);
},

sortAllHostPathogens() {
DATABASE.hosts.forEach(host => {
host.patogenos.forEach(pathogen => {
pathogen.regioes.sort((a, b) => {
const aName = STATE_NAMES[a] || a;
const bName = STATE_NAMES[b] || b;
return this.normalizeText(aName).localeCompare(this.normalizeText(bName), 'pt-BR');
});
});
host.patogenos.sort((a, b) => {
const aHasPhotos = this.hasPhotosForBacteria(a.bacteria, host.nome_cientifico);
const bHasPhotos = this.hasPhotosForBacteria(b.bacteria, host.nome_cientifico);
if (aHasPhotos !== bHasPhotos) return aHasPhotos ? -1 : 1;
if (a.regioes.length !== b.regioes.length) return b.regioes.length - a.regioes.length;
return this.normalizeText(this.plainName(a.bacteria)).localeCompare(this.normalizeText(this.plainName(b.bacteria)), 'pt-BR');
});
});
},

applyTheme() {
document.documentElement.setAttribute('data-theme', this.theme);
document.getElementById('themeToggle').innerHTML = `<i data-lucide="${this.theme === 'dark' ? 'sun' : 'moon'}"></i>`;
window.lucide?.createIcons();
},

toggleTheme() {
this.theme = this.theme === 'light' ? 'dark' : 'light';
localStorage.setItem('theme', this.theme);
this.applyTheme();
if (this.mapInitialized && this.map) {
const tileUrl = this.theme === 'dark'
? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
this.map.eachLayer(l => { if (l._url) this.map.removeLayer(l); });
L.tileLayer(tileUrl, {
attribution: this.theme === 'dark' ? '© CartoDB' : '© OpenStreetMap'
}).addTo(this.map);
}
},

navigate(viewId) {
document.body.dataset.view = viewId;
document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
document.getElementById(viewId).classList.add('active');
document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
if (navBtn) navBtn.classList.add('active');
window.scrollTo({ top: 0, behavior: 'smooth' });
if (viewId === 'mapView') {
setTimeout(() => this.initMap(), 150);
}
if (viewId === 'cultureView') this.searchCulture();
if (viewId === 'diseaseView') this.searchDisease();
if (viewId === 'photosView') this.renderAtlas();
if (viewId === 'fieldView') { this.renderSaved(); this.refreshOfflineStatus(); }
document.querySelectorAll('.nav-btn').forEach(button => {
if (button.dataset.view === viewId) button.setAttribute('aria-current', 'page');
else button.removeAttribute('aria-current');
});
if (viewId !== 'cultureView') {
this.clearSelection();
const toggle = document.getElementById('compareModeToggle');
if (toggle) toggle.checked = false;
this.compareMode = false;
this.updateCompareFab();
}
},

generateCultureFilters() {
const groups = [...new Set(DATABASE.hosts.map(h => h.grupo_agronomico))].sort();
const container = document.getElementById('cultureFilters');
container.innerHTML = `<button class="filter-chip active" onclick="app.filterCulture('all', this)">Todos</button>`;
groups.forEach(g => {
container.innerHTML += `<button class="filter-chip" onclick="app.filterCulture('${g.replace(/'/g,"\\'")}', this)">${g}</button>`;
});
},

filterCulture(group, btn) {
this.currentCultureFilter = group;
document.querySelectorAll('#cultureFilters .filter-chip').forEach(c => c.classList.remove('active'));
if (btn) btn.classList.add('active');
this.searchCulture();
},

repairMojibake(value) {
let text = String(value || '');
const replacements = {
'Ã¡':'á','Ã¢':'â','Ã£':'ã','Ãà':'à','Ã©':'é','Ãª':'ê','Ã­':'í','Ã³':'ó','Ã´':'ô','Ãµ':'õ','Ãº':'ú','Ã§':'ç',
'Ã':'Á','Ã‚':'Â','Ãƒ':'Ã','Ã‰':'É','ÃŠ':'Ê','Ã':'Í','Ã“':'Ó','Ã”':'Ô','Ã•':'Õ','Ãš':'Ú','Ã‡':'Ç',
'Ã¼':'ü','Ãœ':'Ü'
};
Object.entries(replacements).forEach(([bad, good]) => {
text = text.split(bad).join(good);
});
return text;
},

normalizeText(value) {
return this.repairMojibake(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
},

plainName(value) {
return this.repairMojibake(value).replace(/<[^>]*>/g, '');
},

getHostPhotos(bacteriaName, hostName) {
return this.findPhotosForBacteria ? this.findPhotosForBacteria(bacteriaName, hostName) : [];
},

getPhotoOrgans(photos) {
const found = new Set();
photos.forEach(photo => {
const text = this.normalizeText(`${photo.desc || ''} ${photo.foto || ''}`);
Object.entries(PHOTO_ORGANS).forEach(([organ, terms]) => {
if (terms.some(term => text.includes(term))) found.add(organ);
});
});
return found;
},

smartSearch() {
const input = document.getElementById('smartSearch');
const container = document.getElementById('smartSearchResults');
const query = this.normalizeText(input ? input.value.trim() : '');
if (!container) return;
if (query.length < 2) {
container.innerHTML = `<div class="empty-state"><h3>Digite pelo menos 2 caracteres</h3><p>Busque por cultura, bacteria, sintoma, estado ou sinonimo.</p></div>`;
return;
}
const stateMatches = Object.entries(STATE_NAMES).filter(([uf, name]) =>
this.normalizeText(uf).includes(query) || this.normalizeText(name).includes(query)
).map(([uf]) => uf);
const symptomMatches = SYMPTOM_RULES.filter(rule =>
this.normalizeText(rule.label).includes(query) || rule.terms.some(t => this.normalizeText(t).includes(query))
);
const results = [];
DATABASE.hosts.forEach((host, hostIdx) => {
const hostText = this.normalizeText(`${host.nome_comum} ${(host.nomes_populares || []).join(' ')} ${host.nome_cientifico} ${host.nome_original || ''} ${host.grupo_agronomico} ${host.subgrupo}`);
if (hostText.includes(query)) {
results.push({type:'culture', score: 90, host, hostIdx, title: host.nome_comum, meta: `${host.patogenos.length} patogeno(s) associados`});
}
host.patogenos.forEach((pathogen, pathIdx) => {
const cleanBacteria = this.plainName(pathogen.bacteria);
const photos = this.getHostPhotos(cleanBacteria, host.nome_comum);
const photoText = this.normalizeText(photos.map(p => `${p.desc} ${p.foto}`).join(' '));
const text = this.normalizeText(`${cleanBacteria} ${host.nome_comum} ${(host.nomes_populares || []).join(' ')} ${host.nome_cientifico} ${pathogen.regioes.join(' ')} ${photoText}`);
let score = text.includes(query) ? 80 : 0;
if (stateMatches.some(uf => pathogen.regioes.includes(uf))) score += 20;
if (symptomMatches.some(rule => rule.bacteria.some(b => cleanBacteria.includes(b)) || rule.terms.some(t => text.includes(this.normalizeText(t))))) score += 18;
if (score > 0) {
results.push({type:'pathogen', score, host, pathogen, hostIdx, pathIdx, title: cleanBacteria, meta: `${host.nome_comum} - ${pathogen.regioes.length} localidade(s)`});
}
});
});
const unique = new Map();
results.sort((a,b) => b.score - a.score).forEach(r => {
const key = `${r.type}_${r.hostIdx}_${r.pathIdx ?? 'host'}`;
if (!unique.has(key)) unique.set(key, r);
});
const top = Array.from(unique.values()).slice(0, 12);
if (top.length === 0) {
container.innerHTML = `<div class="empty-state"><h3>Nenhum resultado</h3><p>Tente outro termo, cultura, bactéria, sintoma ou estado.</p></div><div class="diagnosis-inline"><span>Se a dúvida veio de uma amostra real, registre sintomas e consulte o laboratório.</span><button class="diagnosis-action ghost" onclick="app.openDiagnosisHelp()">Orientações</button></div>`;
return;
}
container.innerHTML = top.map(r => this.createSmartResult(r)).join('');
},

createSmartResult(result) {
const action = result.type === 'culture'
? `app.openCultureFromSmart(${result.hostIdx})`
: `app.openBacteriaProfile('${this.plainName(result.pathogen.bacteria).replace(/'/g, "\\'")}')`;
const typeLabel = result.type === 'culture' ? 'Cultura' : 'Bactéria / ficha';
return `<div class="smart-result" onclick="${action}">
<div class="smart-result-type">${typeLabel}</div>
<div class="smart-result-title">${result.title}</div>
<div class="smart-result-meta">${result.meta}</div>
</div>`;
},

openCultureFromSmart(hostIdx) {
const host = DATABASE.hosts[hostIdx];
this.navigate('cultureView');
const input = document.getElementById('cultureSearch');
if (input && host) input.value = host.nome_comum;
this.searchCulture();
},

focusFieldSearch(inputId) {
if (inputId === 'cultureSearch') this.navigate('cultureView');
if (inputId === 'diseaseSearch') this.navigate('diseaseView');
setTimeout(() => {
const input = document.getElementById(inputId);
if (input) input.focus();
}, 180);
},

setSmartSearch(term) {
const input = document.getElementById('smartSearch');
if (!input) return;
input.value = term;
this.smartSearch();
input.focus();
},

openDiagnosisHelp() {
document.getElementById('diagnosisOverlay')?.classList.add('active');
},

closeDiagnosisHelp() {
document.getElementById('diagnosisOverlay')?.classList.remove('active');
},

updateFieldStatus() {
const el = document.getElementById('offlineStatus');
if (!el) return;
if ('serviceWorker' in navigator) {
el.textContent = navigator.onLine ? 'Online + offline' : 'Offline ativo';
} else {
el.textContent = 'Navegador sem PWA';
}
},

generateGlossary() {
const GLOSSARY_TERMS = [
{term:"pv. (Pathovar)",def:"Variedade patogênica: subdivisão de uma espécie bacteriana baseada na especificidade por hospedeiro e sintomas causados."},
{term:"subsp. (Subespécie)",def:"Categoria taxonômica abaixo de espécie, com diferenças genéticas e fenotípicas consistentes."},
{term:"syn. (Sinonímia)",def:"Nome taxonômico anterior ou alternativo para a mesma espécie bacteriana, mantido por razões históricas."},
{term:"biovar",def:"Variante fisiológica ou bioquímica dentro de uma espécie, diferenciada por características metabólicas."},
{term:"Ralstonia solanacearum",def:"Complexo de espécies gram-negativas que causa murcha bacteriana em solanáceas e outras famílias. Uma das fitobactérias mais destrutivas em climas tropicais."},
{term:"Xanthomonas",def:"Gênero de bactérias gram-negativas da família Xanthomonadaceae que causa manchas, cancros e murchas em ampla gama de hospedeiros."},
{term:"Xanthomonas citri subsp. citri",def:"Agente causal do cancro cítrico. As formas A, B e C correspondem a categorias epidemiológicas com diferentes níveis de agressividade e gama de hospedeiros."},
{term:"Pectobacterium",def:"Gênero que causa podridão mole em tecidos vegetais, degradando pectinas. Anteriormente classificado como Erwinia."},
{term:"Xylella fastidiosa",def:"Bactéria gram-negativa de importância quarentenária que causa clorose variegada dos citros (CVC) e amarelecimento do café. Transmitida por cigarrinhas."},
{term:"Pseudomonas",def:"Gênero diverso de bactérias gram-negativas fitopatogênicas causando manchas, crestamentos e podridões."},
{term:"Clavibacter",def:"Gênero de bactérias gram-positivas causadoras de murchas e cancros, como C. michiganensis."},
{term:"Cancroses A, B, C",def:"Categorias epidemiológicas do cancro cítrico causadas por Xanthomonas citri subsp. citri, com diferentes níveis de agressividade e gama de hospedeiros."},
{term:"Agrobacterium radiobacter",def:"Espécie bacteriana que inclui patógenos causadores de galha-da-coroa. Sinonímia histórica: Agrobacterium tumefaciens."},
{term:"Burkholderia",def:"Gênero de bactérias gram-negativas que inclui espécies fitopatogênicas importantes como B. gladioli e B. cepacia."},
{term:"Acidovorax",def:"Gênero de bactérias que causa doenças como a mancha bacteriana em orquídeas (A. cattleyae) e manchas em cucurbitáceas (A. citrulli)."}
];

const GLOSSARY_SYMPTOMS = [
{
term:"🔴 Mancha Angular",
def:`<strong>Definição:</strong> Lesões delimitadas pelas nervuras da folha, formando padrões angulares ou poligonais.<br>
<strong>Como reconhecer:</strong> Manchas marrons ou necróticas com bordas retilíneas seguindo o trajeto das nervuras. Comuns em folhas de cucurbitáceas e leguminosas.<br>
<strong>Diferença para fungos:</strong> Manchas fúngicas geralmente são circulares com anéis concêntricos e presença de estruturas reprodutivas visíveis (pontuações, esporos). Bacterianas não têm essas estruturas.<br>
<strong>Doenças associadas:</strong> Pseudomonas syringae pv. lachrymans (mancha angular do pepino), Xanthomonas spp.`
},
{
term:"🔴 Mancha Encharcada",
def:`<strong>Aspecto translúcido:</strong> Lesões iniciais com aspecto aquoso, como se o tecido estivesse encharcado de água.<br>
<strong>Evolução para necrose:</strong> Em 24-48h as lesões tornam-se marrons e necróticas, frequentemente com halo clorótico amarelado ao redor.<br>
<strong>Principais bactérias associadas:</strong> Pseudomonas spp., Xanthomonas spp., Acidovorax spp.<br>
<strong>Diagnóstico:</strong> Sintoma clássico de infecção bacteriana ativa, especialmente em condições de alta umidade.`
},
{
term:"🔴 Cancro",
def:`<strong>Lesões deprimidas:</strong> Úlceras corticosas, deprimidas no tecido, com bordas elevadas e frequentemente com tecido necrosado no centro.<br>
<strong>Rachaduras:</strong> Lesões podem apresentar fissuras e exsudação bacteriana visível.<br>
<strong>Exsudação:</strong> Presença de gotículas ou crostas bacterianas na superfície das lesões.<br>
<strong>Característico de:</strong> Xanthomonas citri subsp. citri (cancro cítrico), Clavibacter michiganensis (cancro bacteriano do tomateiro).`
},
{
term:"🔴 Murcha Vascular",
def:`<strong>Sintoma clássico:</strong> Murchamento rápido da planta, começando pelas folhas mais velhas e progredindo para toda a planta, mesmo com solo úmido.<br>
<strong>Teste do copo d'água:</strong> Corte transversal do caule imerso em água libera fluxo bacteriano leitoso (streaming) visível em 2-5 minutos.<br>
<strong>Principais agentes:</strong> Ralstonia solanacearum (murcha bacteriana), Clavibacter michiganensis subsp. michiganensis.<br>
<strong>Diagnóstico diferencial:</strong> Diferencia-se de murchas fúngicas pela velocidade e pelo teste do copo d'água positivo.`
},
{
term:"🔴 Podridão Mole",
def:`<strong>Tecido macerado:</strong> Tecido vegetal torna-se aquoso, mole e facilmente desintegrável ao toque.<br>
<strong>Odor característico:</strong> Odor fétido intenso devido à degradação anaeróbica de pectinas.<br>
<strong>Agentes causais:</strong> Pectobacterium carotovorum, Dickeya chrysanthemi (anteriormente Erwinia chrysanthemi).<br>
<strong>Condições favoráveis:</strong> Alta umidade, temperaturas entre 25-30°C, ferimentos nos tecidos.<br>
<strong>Hospedeiros comuns:</strong> Tubérculos (batata), bulbos (cebola), raízes (cenoura), hortaliças.`
},
{
term:"🔴 Exsudação Bacteriana",
def:`<strong>Como identificar:</strong> Gotículas, crostas ou fluxo visível de bactérias em lesões, especialmente em condições de alta umidade.<br>
<strong>Visualização:</strong> Pode ser observada a olho nu ou com lupa de 10-20x. Em microscópio, observa-se grande quantidade de bactérias em movimento browniano.<br>
<strong>Condições favoráveis:</strong> Alta umidade relativa (>90%), temperatura amena (20-28°C), lesões recentes.<br>
<strong>Diferenças para goma vegetal:</strong> Exsudação bacteriana é aquosa e contém células bacterianas; goma vegetal é viscosa e amorfa.`
},
{
term:"🔴 Galha",
def:`<strong>Agrobacterium:</strong> Tumores ou protuberanças causadas por Agrobacterium radiobacter (sin. A. tumefaciens) devido à transferência de genes T-DNA do plasmídeo Ti.<br>
<strong>Localização típica:</strong> Colo da planta (região entre raiz e caule), raízes superficiais.<br>
<strong>Diferencial com nematoides:</strong> Galhas de Agrobacterium ocorrem no colo e raízes superficiais, são irregulares e têm tecido desorganizado. Galhas de nematoides ocorrem em raízes finas, são mais uniformes e têm estrutura organizada.<br>
<strong>Hospedeiros:</strong> Amplamente distribuído em dicotiledôneas (roseiras, videiras, frutíferas).`
},
{
term:"🔴 Crestamento",
def:`<strong>Evolução:</strong> Necrose rápida e extensa de folhas, especialmente em condições de alta umidade e temperatura.<br>
<strong>Progressão:</strong> Inicia com pequenas manchas que coalescem rapidamente, formando grandes áreas de tecido morto.<br>
<strong>Condições climáticas:</strong> Favorecido por chuvas frequentes, alta umidade (>85%), temperaturas entre 20-30°C e vento (disseminação).<br>
<strong>Comum em:</strong> Pseudomonas spp. e Xanthomonas spp. em hortaliças (tomate, pimentão, cebola) e leguminosas.`
},
{
term:"🔴 Epifitia",
def:`<strong>Definição:</strong> Epidemia em populações vegetais. Ocorre quando três condições se alinham: (1) hospedeiros suscetíveis, (2) patógeno virulento em quantidade suficiente, (3) condições ambientais favoráveis.<br>
<strong>Fatores ambientais:</strong> Temperatura, umidade relativa, molhamento foliar, vento e chuva são críticos para o desenvolvimento de epifitias bacterianas.<br>
<strong>Importância:</strong> Epifitias podem causar perdas econômicas devastadoras em culturas suscetíveis.<br>
<strong>Prevenção:</strong> Monitoramento, uso de cultivares resistentes, práticas culturais adequadas e aplicação preventiva de bactericidas.`
}
];

const termsHtml = GLOSSARY_TERMS.map(g =>
`<div class="glossary-item"><div class="glossary-term">${g.term}</div><div class="glossary-def">${g.def}</div></div>`
).join('');
const symptomsHtml = GLOSSARY_SYMPTOMS.map(g =>
`<div class="glossary-item symptom"><div class="glossary-term">${g.term}</div><div class="glossary-def">${g.def}</div></div>`
).join('');

document.getElementById('glossaryList').innerHTML = `
<h3 class="glossary-section-title">🧬 Termos Taxonômicos</h3>
${termsHtml}
<h3 class="glossary-section-title">🩺 Glossário de Sintomas (Prioridade Máxima)</h3>
<p style="color:var(--text-secondary);margin-bottom:14px;font-size:0.9em;">O usuário normalmente vê primeiro o sintoma. Aqui estão os principais sintomas bacterianos e como diferenciá-los de doenças fúngicas.</p>
${symptomsHtml}
`;
},

setupEvents() {
document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
document.getElementById('cultureSearch').addEventListener('input', (e) => {
clearTimeout(this.searchTimeout);
this.searchTimeout = setTimeout(() => this.searchCulture(), 250);
});
document.getElementById('cultureSearch').addEventListener('keypress', (e) => { if (e.key === 'Enter') this.searchCulture(); });
document.getElementById('diseaseSearch').addEventListener('input', (e) => {
clearTimeout(this.searchTimeout);
this.searchTimeout = setTimeout(() => this.searchDisease(), 250);
});
document.getElementById('diseaseSearch').addEventListener('keypress', (e) => { if (e.key === 'Enter') this.searchDisease(); });
const smartInput = document.getElementById('smartSearch');
if (smartInput) {
smartInput.addEventListener('input', () => {
clearTimeout(this.searchTimeout);
this.searchTimeout = setTimeout(() => this.smartSearch(), 220);
});
smartInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.smartSearch(); });
}
window.addEventListener('online', () => this.updateFieldStatus());
window.addEventListener('offline', () => this.updateFieldStatus());
document.addEventListener('keydown', (e) => {
if (e.key === 'Escape') {
this.closeTopModal();
}
if (document.getElementById('photoViewerOverlay')?.classList.contains('active')) {
if (e.key === 'ArrowLeft') this.prevPhoto();
if (e.key === 'ArrowRight') this.nextPhoto();
}
});
},

toggleCompareMode(checked) {
this.compareMode = checked;
if (!checked) {
this.clearSelection();
}
this.updateCompareFab();
const results = document.getElementById('cultureResults');
if (results && results.innerHTML.trim()) {
this.searchCulture();
}
},

clearSelection() {
this.selectedPathogens.clear();
this.updateCompareFab();
document.querySelectorAll('.pathogen-item.selected').forEach(el => {
el.classList.remove('selected');
const cb = el.querySelector('.pathogen-checkbox');
if (cb) cb.checked = false;
});
},

togglePathogenSelection(hostIdx, pathIdx, checkbox) {
const key = `${hostIdx}_${pathIdx}`;
if (this.selectedPathogens.has(key)) {
this.selectedPathogens.delete(key);
checkbox.closest('.pathogen-item').classList.remove('selected');
} else {
if (this.selectedPathogens.size >= 8) {
alert('⚠️ Máximo de 8 bactérias para comparação simultânea');
checkbox.checked = false;
return;
}
const host = DATABASE.hosts[hostIdx];
const pathogen = host.patogenos[pathIdx];
this.selectedPathogens.set(key, {host, pathogen, hostIdx, pathIdx});
checkbox.closest('.pathogen-item').classList.add('selected');
}
this.updateCompareFab();
},

updateCompareFab() {
const fab = document.getElementById('compareFab');
const countEl = document.getElementById('compareFabCount');
const count = this.selectedPathogens.size;
if (count > 0) {
fab.classList.add('visible');
countEl.textContent = count;
} else {
fab.classList.remove('visible');
}
const info = document.getElementById('compareInfo');
if (info) {
if (count === 0) {
info.textContent = 'Marque bactérias diferentes e compare no mapa';
} else {
info.textContent = `${count} selecionada(s) — clique em "Comparar"`;
}
}
},

startTour() {
this.tourStep = 0;
this.showTourStep();
document.getElementById('tourOverlay').classList.add('active');
},
showTourStep() {
const s = this.tourSteps[this.tourStep];
document.getElementById('tourEmoji').textContent = s.emoji;
document.getElementById('tourTitle').textContent = s.title;
document.getElementById('tourText').textContent = s.text;
const dots = document.getElementById('tourDots');
dots.innerHTML = this.tourSteps.map((_, i) =>
`<div class="tour-dot ${i === this.tourStep ? 'active' : ''}"></div>`
).join('');
const nextBtn = document.getElementById('tourNextBtn');
nextBtn.textContent = this.tourStep === this.tourSteps.length - 1 ? 'Concluir ✓' : 'Próximo →';
},
nextTourStep() {
if (this.tourStep < this.tourSteps.length - 1) {
this.tourStep++;
this.showTourStep();
} else {
this.endTour();
}
},
endTour() {
document.getElementById('tourOverlay').classList.remove('active');
localStorage.setItem('tourDone_v3', '1');
},

searchCulture() {
const query = this.normalizeText(document.getElementById('cultureSearch').value.trim());
const container = document.getElementById('cultureResults');
let results = DATABASE.hosts;
if (this.currentCultureFilter !== 'all') {
results = results.filter(h => h.grupo_agronomico === this.currentCultureFilter);
}
if (query.length > 0) {
if (query.length < 2) {
container.innerHTML = `<div class="empty-state"><h3>🔎 Digite pelo menos 2 caracteres</h3></div>`;
return;
}
results = results.filter(h =>
this.normalizeText(h.nome_comum).includes(query) ||
this.normalizeText((h.nomes_populares || []).join(' ')).includes(query) ||
this.normalizeText(h.nome_cientifico).includes(query) ||
(h.nome_original && this.normalizeText(h.nome_original).includes(query)) ||
this.normalizeText(h.subgrupo).includes(query)
);
}
if (results.length === 0) {
container.innerHTML = `<div class="empty-state"><h3>❌ Nenhum resultado</h3><p>Nenhuma cultura encontrada</p></div><div class="diagnosis-inline"><span>Confira nomes populares ou científicos. Para amostras com sintoma duvidoso, veja as orientações.</span><button class="diagnosis-action ghost" onclick="app.openDiagnosisHelp()">Diagnóstico</button></div>`;
return;
}
container.innerHTML = results.map((h, i) => {
const realIdx = DATABASE.hosts.indexOf(h);
return this.createHostCard(h, realIdx, query.length > 0);
}).join('');
container.innerHTML += `<div class="results-count">${results.length} cultura(s) encontrada(s)</div>`;
if (this.compareMode) {
setTimeout(() => {
this.selectedPathogens.forEach((val, key) => {
const [hIdx, pIdx] = key.split('_').map(Number);
const checkbox = document.querySelector(`.pathogen-checkbox[data-host="${hIdx}"][data-path="${pIdx}"]`);
if (checkbox) {
checkbox.checked = true;
checkbox.closest('.pathogen-item').classList.add('selected');
}
});
}, 50);
}
},

searchDisease() {
const query = this.normalizeText(document.getElementById('diseaseSearch').value.trim());
const container = document.getElementById('diseaseResults');
if (query.length < 2) {
container.innerHTML = `<div class="empty-state"><h3>🔎 Digite pelo menos 2 caracteres</h3></div>`;
return;
}
const results = [];
DATABASE.hosts.forEach((h, hIdx) => {
h.patogenos.forEach((p, pIdx) => {
const plainName = this.normalizeText(this.plainName(p.bacteria));
if (plainName.includes(query)) {
results.push({host: h, pathogen: p, hostIdx: hIdx, pathIdx: pIdx});
}
});
});
if (results.length === 0) {
container.innerHTML = `<div class="empty-state"><h3>❌ Nenhuma bactéria encontrada</h3></div><div class="diagnosis-inline"><span>Nem todo sintoma fecha diagnóstico visual. Em caso de dúvida, organize a amostra para análise.</span><button class="diagnosis-action ghost" onclick="app.openDiagnosisHelp()">Amostras</button></div>`;
return;
}
container.innerHTML = results.map(r => this.createPathogenCard(r.host, r.pathogen, r.hostIdx, r.pathIdx)).join('');
container.innerHTML += `<div class="results-count">${results.length} ocorrência(s) encontrada(s)</div>`;
},

createHostCard(host, hostIdx, expanded = false) {
const pathogenCount = host.patogenos.length;
const uniqueStates = new Set();
host.patogenos.forEach(p => p.regioes.forEach(r => { if (STATE_NAMES[r]) uniqueStates.add(r); }));
const stateCount = uniqueStates.size;

let scientificDisplay = host.nome_cientifico;
if (host.nome_original && host.nome_original !== host.nome_cientifico) {
scientificDisplay = `${host.nome_cientifico} <span class="synonym">(syn. ${host.nome_original})</span>`;
}
const aliasList = (host.nomes_populares || [])
.filter(name => this.normalizeText(name) !== this.normalizeText(host.nome_comum))
.slice(0, 4);
const aliasHtml = aliasList.length
? `<div class="alias-line">Também conhecido como: ${aliasList.join(', ')}</div>`
: '';

return `
<article class="host-card">
<div class="host-header">
<div>
<div class="host-name">${host.nome_comum}</div>
<div class="host-scientific">${scientificDisplay}</div>
${aliasHtml}
</div>
</div>
<div class="host-tags">
<span class="tag">${host.grupo_agronomico}</span>
<span class="tag">${host.subgrupo}</span>
</div>
<div class="host-meta">
<span>🦠 ${pathogenCount} patógeno(s)</span>
<span>📍 ${stateCount} estado(s)</span>
</div>
${this.renderHostGenericPhotoButtons(host.nome_comum)}
<details ${expanded ? 'open' : ''}>
<summary>Ver patógenos associados (${pathogenCount})</summary>
${host.patogenos.map((p, pIdx) => this.createPathogenItem(p, hostIdx, pIdx)).join('')}
</details>
</article>`;
},

createPathogenCard(host, pathogen, hostIdx, pathIdx) {
const regioesHtml = pathogen.regioes.map(r => {
let cls = 'region-tag';
if (r === 'BR') cls += ' brasil';
if (r.startsWith('Região')) cls += ' regiao';
return `<span class="${cls}">${STATE_NAMES[r] || r}</span>`;
}).join('');
let scientificDisplay = host.nome_cientifico;
if (host.nome_original && host.nome_original !== host.nome_cientifico) {
scientificDisplay = `${host.nome_cientifico} <span class="synonym" style="color:var(--text-tertiary);font-size:0.9em;">(syn. ${host.nome_original})</span>`;
}
return `
<article class="host-card" style="cursor:pointer" onclick="app.openPathogenMap(${hostIdx}, ${pathIdx})">
<div class="pathogen-name">
<span>${pathogen.bacteria}</span>
<span class="pathogen-actions">
<span class="map-hint">🗺️ Ver mapa →</span>
<span class="photo-hint" onclick="event.stopPropagation(); app.openBacteriaProfile('${this.plainName(pathogen.bacteria).replace(/'/g, "\\'")}')">Ficha</span>
${this.renderPhotoButton(pathogen.bacteria, host.nome_comum)}
</span>
</div>
<div style="font-size:0.85em;color:var(--text-secondary);margin-bottom:10px">
<strong>Hospedeiro:</strong> ${host.nome_comum} <em>(${scientificDisplay})</em>
</div>
<div class="host-tags">
<span class="tag">${host.grupo_agronomico}</span>
<span class="tag">${host.subgrupo}</span>
</div>
<div style="margin-top:8px">
<strong style="font-size:0.8em;color:var(--text-tertiary)">OCORRÊNCIA:</strong>
<div class="pathogen-regions" style="margin-top:6px">${regioesHtml}</div>
</div>
</article>`;
},

createPathogenItem(pathogen, hostIdx, pathIdx) {
const regioesHtml = pathogen.regioes.map(r => {
let cls = 'region-tag';
if (r === 'BR') cls += ' brasil';
if (r.startsWith('Região')) cls += ' regiao';
return `<span class="${cls}">${STATE_NAMES[r] || r}</span>`;
}).join('');
const key = `${hostIdx}_${pathIdx}`;
const isSelected = this.selectedPathogens.has(key);
const needsReview = pathogen._needsReview;

if (this.compareMode) {
const reviewTag = needsReview ? '<span class="tag review" style="font-size:0.7em;padding:1px 5px;margin-left:5px;">⚠️ revisão</span>' : '';
return `
<div class="pathogen-item ${isSelected ? 'selected' : ''}">
<input type="checkbox" class="pathogen-checkbox"
data-host="${hostIdx}" data-path="${pathIdx}"
${isSelected ? 'checked' : ''}
onclick="event.stopPropagation(); app.togglePathogenSelection(${hostIdx}, ${pathIdx}, this)">
<div class="pathogen-content" onclick="event.stopPropagation(); app.openPathogenMap(${hostIdx}, ${pathIdx})">
<div class="pathogen-name">
<span>${pathogen.bacteria}${reviewTag}</span>
<span class="pathogen-actions">
<span class="map-hint">🗺️ →</span>
<span class="photo-hint" onclick="event.stopPropagation(); app.openBacteriaProfile('${this.plainName(pathogen.bacteria).replace(/'/g, "\\'")}')">Ficha</span>
${this.renderPhotoButton(pathogen.bacteria, DATABASE.hosts[hostIdx].nome_comum, true)}
</span>
</div>
<div class="pathogen-regions">${regioesHtml}</div>
</div>
</div>`;
} else {
const reviewTag = needsReview ? '<span class="tag review" style="font-size:0.7em;padding:1px 5px;margin-left:5px;">⚠️ revisão</span>' : '';
return `
<div class="pathogen-item" onclick="app.openPathogenMap(${hostIdx}, ${pathIdx})">
<div class="pathogen-content" style="width:100%">
<div class="pathogen-name">
<span>${pathogen.bacteria}${reviewTag}</span>
<span class="pathogen-actions">
<span class="map-hint">🗺️ Ver mapa →</span>
<span class="photo-hint" onclick="event.stopPropagation(); app.openBacteriaProfile('${this.plainName(pathogen.bacteria).replace(/'/g, "\\'")}')">Ficha</span>
${this.renderPhotoButton(pathogen.bacteria, DATABASE.hosts[hostIdx].nome_comum)}
</span>
</div>
<div class="pathogen-regions">${regioesHtml}</div>
</div>
</div>`;
}
},


getBacteriaOccurrences(bacteriaName) {
const target = PhotoCatalog.key(bacteriaName);
const occurrences = [];
DATABASE.hosts.forEach((host, hostIdx) => {
host.patogenos.forEach((pathogen, pathIdx) => {
const clean = this.plainName(pathogen.bacteria);
const cleanNorm = PhotoCatalog.key(clean);
if (cleanNorm === target) {
occurrences.push({host, pathogen, hostIdx, pathIdx, clean});
}
});
});
return occurrences;
},

openBacteriaProfile(bacteriaName) {
const occurrences = this.getBacteriaOccurrences(bacteriaName);
if (!occurrences.length) return;
const cleanName = occurrences[0].clean;
const hosts = [...new Set(occurrences.map(o => o.host.nome_comum))].sort();
const groups = [...new Set(occurrences.map(o => o.host.grupo_agronomico))].sort();
const states = new Set();
let photoCount = 0;
let reviewCount = 0;
occurrences.forEach(o => {
o.pathogen.regioes.forEach(r => { if (STATE_NAMES[r] && !r.startsWith('Regi')) states.add(r); });
photoCount += this.getHostPhotos(o.clean, o.host.nome_cientifico).length;
if (o.pathogen._needsReview) reviewCount++;
});

document.getElementById('pathogenMapOverlay').classList.add('active');
document.getElementById('pathogenMapTitle').textContent = cleanName;
document.getElementById('pathogenMapScientific').textContent = 'Ficha completa da bacteria';
const rows = occurrences.map(o => {
const stateNames = o.pathogen.regioes.map(r => STATE_NAMES[r] || r).join(', ');
return `<tr>
<td><strong>${o.host.nome_comum}</strong><br><em>${o.host.nome_cientifico}</em></td>
<td>${o.host.grupo_agronomico}<br><span style="color:var(--text-tertiary)">${o.host.subgrupo}</span></td>
<td>${stateNames || 'Registro amplo'}</td>
<td>${this.renderPhotoButton(o.pathogen.bacteria, o.host.nome_cientifico, true) || '-'}</td>
</tr>`;
}).join('');
document.getElementById('pathogenMapInfoContainer').innerHTML = `
<div class="pathogen-map-info">
<div class="profile-grid">
<div class="profile-stat"><strong>${hosts.length}</strong><span>culturas</span></div>
<div class="profile-stat"><strong>${states.size}</strong><span>estados</span></div>
<div class="profile-stat"><strong>${groups.length}</strong><span>grupos</span></div>
<div class="profile-stat"><strong>${photoCount}</strong><span>fotos</span></div>
</div>
${reviewCount ? `<div style="margin-bottom:10px;padding:8px;background:#fef3c7;border-radius:8px;color:#92400e;font-size:0.85em;"><strong>Atencao:</strong> ${reviewCount} registro(s) marcado(s) para revisao taxonomica.</div>` : ''}
<strong>Culturas associadas</strong>
<div class="profile-list">${hosts.map(h => `<span class="tag">${h}</span>`).join('')}</div>
<div class="diagnosis-inline"><span>Suspeita em campo ou viveiro? Prepare material vegetal e dados do local para confirmação.</span><button class="diagnosis-action ghost" onclick="app.openDiagnosisHelp()">Orientações</button></div>
</div>
<div class="compare-table-wrap">
<table class="compare-table">
<thead><tr><th>Hospedeiro</th><th>Grupo</th><th>Ocorrencia</th><th>Fotos</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div>`;
document.getElementById('miniMapLegend').innerHTML = `
<span class="minimap-legend-dot"></span>
<span>Estados com registros desta bacteria em qualquer cultura</span>
`;
setTimeout(() => this.renderPathogenMap(null, occurrences, 'profile'), 120);
},

renderPhotoButton(bacteriaName, hostName, compact = false) {
if (!this.hasPhotosForBacteria(bacteriaName, hostName)) return '';
const cleanBacteria = bacteriaName.replace(/<[^>]*>/g, '').replace(/'/g, "\\'");
const cleanHost = hostName.replace(/'/g, "\\'");
const label = compact ? '\u{1F4F7}' : '\u{1F4F7} Fotos';
return `<span class="photo-hint" onclick="event.stopPropagation(); app.openPhotoGallery('${cleanBacteria}', '${cleanHost}')">${label}</span>`;
},
photoBasePath() {
return ((window.PHOTO_BASE_PATH || 'assets/fotos')).replace(/\/$/, '');
},
photoDatabase() {
return window.PHOTO_DATABASE || {};
},
isGenericPhotoKey(bacteriaName) {
return this.normalizeText(this.plainName(bacteriaName)).split(/\s+/).filter(Boolean).length === 1;
},
photoNameAliases(bacteriaName) {
const clean = this.plainName(bacteriaName).replace(/\(syn\..*$/i, '').trim();
const aliases = new Set([clean]);
const synonymMatch = this.plainName(bacteriaName).match(/\(syn\.\s*([^;)]+)/i);
if (synonymMatch) aliases.add(synonymMatch[1].trim());
const aliasMap = {
"Pseudomonas amygdali pv. tabaci": ["Pseudomonas syringae pv. tabaci"],
"Pseudomonas coronafaciens pv. garcae": ["Pseudomonas syringae pv. garcae"],
"Robbsia andropogonis": ["Burkholderia andropogonis"],
"Acidovorax citrulli": ["Acidovorax avenae subsp. citrulli"],
"Acidovorax cattleyae": ["Acidovorax avenae subsp. cattleyae"],
"Paracidovorax avenae": ["Acidovorax avenae subsp. avenae"],
"Xanthomonas euvesicatoria": ["Xanthomonas campestris pv. vesicatoria", "Xanthomonas axonopodis pv. vesicatoria"],
"Xanthomonas citri subsp. citri": ["Xanthomonas axonopodis pv. citri"],
"Agrobacterium radiobacter": ["Rhizobium radiobacter", "Agrobacterium tumefaciens"],
"Pectobacterium carotovorum": ["Erwinia carotovora pv. carotovora", "Erwinia carotovora subsp. não determinada"],
"Dickeya chrysanthemi": ["Pectobacterium chrysanthemi", "Erwinia chrysanthemi"]
};
const cleanNorm = this.normalizeText(clean).replace(/[^a-z0-9]+/g, ' ').trim();
Object.entries(aliasMap).forEach(([accepted, oldNames]) => {
if (this.normalizeText(accepted).replace(/[^a-z0-9]+/g, ' ').trim() === cleanNorm) {
oldNames.forEach(name => aliases.add(name));
}
});
return [...aliases];
},
findHostByCommonName(hostName) {
const targetHost = this.normalizeText(hostName).replace(/[^a-z0-9]+/g, ' ').trim();
return DATABASE.hosts.find(host => {
const common = this.normalizeText(host.nome_comum).replace(/[^a-z0-9]+/g, ' ').trim();
return common === targetHost || common.includes(targetHost) || targetHost.includes(common);
});
},
genericPhotoTarget(genericName, hostName) {
const host = this.findHostByCommonName(hostName);
if (!host) return '';
const generic = this.normalizeText(genericName).replace(/[^a-z0-9]+/g, ' ').trim();
const candidates = host.patogenos.filter(pathogen => {
const words = this.normalizeText(this.plainName(pathogen.bacteria)).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
return words[0] === generic;
});
return candidates.length === 1 ? this.plainName(candidates[0].bacteria) : '';
},
renderHostGenericPhotoButtons(hostName) {
const photoDb = this.photoDatabase();
if (!Object.keys(photoDb).length) return '';
const buttons = [];
for (const bacteriaName in photoDb) {
if (!this.isGenericPhotoKey(bacteriaName)) continue;
if (this.genericPhotoTarget(bacteriaName, hostName)) continue;
const photos = this.findPhotosForBacteria(bacteriaName, hostName);
if (!photos.length) continue;
const cleanBacteria = bacteriaName.replace(/'/g, "\\'");
const cleanHost = hostName.replace(/'/g, "\\'");
buttons.push(`<span class="photo-hint" onclick="event.stopPropagation(); app.openPhotoGallery('${cleanBacteria}', '${cleanHost}')">\u{1F4F7} Fotos de ${bacteriaName}</span>`);
}
if (!buttons.length) return '';
return `<div class="host-generic-photos"><div class="host-generic-photos-label">Fotos identificadas apenas em nivel de genero</div>${buttons.join('')}</div>`;
},
findPhotosForBacteria(bacteriaName, hostName) {
const photoDb = this.photoDatabase();
if (!Object.keys(photoDb).length) return [];
const cleanBacteria = this.plainName(bacteriaName);
const normalize = value => this.normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
const targetNames = new Set(this.photoNameAliases(cleanBacteria));
const targetBacteriaNames = new Set([...targetNames].map(normalize).filter(Boolean));
const targetHost = normalize(hostName);
const hostMatches = photosByHost => {
for (const registeredHost in photosByHost) {
const registeredHostNorm = normalize(registeredHost);
if (registeredHostNorm === targetHost || targetHost.includes(registeredHostNorm) || registeredHostNorm.includes(targetHost)) return photosByHost[registeredHost];
}
return [];
};
for (const registeredBacteria in photoDb) {
const registeredNorm = normalize(registeredBacteria);
if (targetBacteriaNames.has(registeredNorm)) {
const photos = hostMatches(photoDb[registeredBacteria]);
if (photos.length) return photos;
}
}
const firstWord = normalize(cleanBacteria).split(/\s+/)[0];
if (firstWord && normalize(cleanBacteria).split(/\s+/).length > 1) {
for (const registeredBacteria in photoDb) {
if (normalize(registeredBacteria) !== firstWord) continue;
const target = this.genericPhotoTarget(registeredBacteria, hostName);
if (!target || normalize(target) !== normalize(cleanBacteria.replace(/\(syn\..*$/i, '').trim())) continue;
const photos = hostMatches(photoDb[registeredBacteria]);
if (photos.length) return photos;
}
}
return [];
},
hasPhotosForBacteria(bacteriaName, hostName) { return this.findPhotosForBacteria(bacteriaName, hostName).length > 0; },
openPhotoGallery(bacteriaName, hostName) {
const photos = this.findPhotosForBacteria(bacteriaName, hostName);
if (photos.length === 0) { alert('\u{1F4F7} Nenhuma foto disponivel para esta bacteria neste hospedeiro ainda.'); return; }
this.allPhotos = photos;
this.currentPhotos = photos;
this.currentPhotoIndex = 0;
this.currentPhotoFilter = 'all';
document.getElementById('photoGalleryTitle').textContent = `${bacteriaName} - ${hostName}`;
this.renderPhotoFilters();
this.renderPhotoGallery();
document.getElementById('photoGalleryOverlay').classList.add('active');
},
renderPhotoFilters() {
const bar = document.getElementById('photoFilterBar');
if (!bar) return;
const organs = this.getPhotoOrgans(this.allPhotos);
const labels = {all:'Todas', folha:'Folha', fruto:'Fruto', caule:'Caule', raiz:'Raiz', planta:'Planta'};
const options = ['all', ...Object.keys(PHOTO_ORGANS).filter(o => organs.has(o))];
bar.innerHTML = options.map(opt =>
`<button class="photo-filter ${this.currentPhotoFilter === opt ? 'active' : ''}" onclick="app.filterPhotoGallery('${opt}')">${labels[opt]}</button>`
).join('');
},
filterPhotoGallery(filter) {
this.currentPhotoFilter = filter;
if (filter === 'all') {
this.currentPhotos = this.allPhotos;
} else {
const terms = PHOTO_ORGANS[filter] || [];
this.currentPhotos = this.allPhotos.filter(photo => {
const text = this.normalizeText(`${photo.desc || ''} ${photo.foto || ''}`);
return terms.some(term => text.includes(term));
});
}
this.renderPhotoFilters();
this.renderPhotoGallery();
},
renderPhotoGallery() {
const grid = document.getElementById('photoGrid');
if (!grid) return;
const basePath = this.photoBasePath();
grid.innerHTML = this.currentPhotos.map((photo, idx) => `<div class="photo-card" onclick="app.openPhotoViewer(${idx})"><img src="${basePath}/${photo.foto}" alt="${photo.desc}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22180%22><rect fill=%22%23ddd%22 width=%22200%22 height=%22180%22/><text fill=%22%23666%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22>Foto nao encontrada</text></svg>'"><div class="photo-card-info"><div class="photo-card-title">${photo.desc}</div><div class="photo-card-desc">${photo.foto}</div></div></div>`).join('');
},
closePhotoGallery() { document.getElementById('photoGalleryOverlay').classList.remove('active'); },
openPhotoViewer(index) {
this.currentPhotoIndex = index;
const photo = this.currentPhotos[index];
if (!photo) return;
const img = document.getElementById('photoViewerImg');
img.src = `${this.photoBasePath()}/${photo.foto}`;
img.alt = photo.desc;
img.onerror = function() { this.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22><rect fill=%22%23ddd%22 width=%22400%22 height=%22300%22/><text fill=%22%23666%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22>Foto nao disponivel</text></svg>'; };
document.getElementById('photoViewerCaption').textContent = `${photo.desc} - ${photo.foto} (${index + 1}/${this.currentPhotos.length})`;
document.getElementById('photoViewerOverlay').classList.add('active');
},
closePhotoViewer() { document.getElementById('photoViewerOverlay').classList.remove('active'); },
prevPhoto() { if (this.currentPhotoIndex > 0) this.openPhotoViewer(this.currentPhotoIndex - 1); },
nextPhoto() { if (this.currentPhotoIndex < this.currentPhotos.length - 1) this.openPhotoViewer(this.currentPhotoIndex + 1); },

openPathogenMap(hostIdx, pathIdx) {
const host = DATABASE.hosts[hostIdx];
const pathogen = host.patogenos[pathIdx];
if (!host || !pathogen) return;

document.getElementById('pathogenMapOverlay').classList.add('active');
const cleanBacteria = pathogen.bacteria.replace(/<[^>]*>/g, '');
document.getElementById('pathogenMapTitle').textContent = cleanBacteria;

let scientificDisplay = host.nome_cientifico;
if (host.nome_original && host.nome_original !== host.nome_cientifico) {
scientificDisplay = `${host.nome_cientifico} <em style="color:var(--text-tertiary);font-size:0.85em;">(syn. ${host.nome_original})</em>`;
}
document.getElementById('pathogenMapScientific').innerHTML =
`Hospedeiro: <strong>${host.nome_comum}</strong> (${scientificDisplay})`;

const regioes = pathogen.regioes.filter(r => STATE_NAMES[r]);
const estados = regioes.filter(r => !r.startsWith('Região') && r !== 'BR');
const regioesOutras = regioes.filter(r => r.startsWith('Região') || r === 'BR');

let infoHtml = `
<div><strong>🌱 Grupo:</strong> ${host.grupo_agronomico} — ${host.subgrupo}</div>
<div style="margin-top:4px"><strong>📍 Estados com registro:</strong> ${estados.length > 0 ? estados.map(e => STATE_NAMES[e]).join(', ') : 'Nenhum estado específico'}</div>
<div style="margin-top:6px;font-size:0.82em;color:var(--text-tertiary)">Os pontos no mapa indicam a unidade federativa de ocorrência e são posicionados na capital do estado apenas como referência visual, não como local exato de detecção.</div>
`;
if (regioesOutras.length > 0) {
infoHtml += `<div style="margin-top:4px"><strong>🌎 Regiões/País:</strong> ${regioesOutras.map(r => STATE_NAMES[r] || r).join(', ')}</div>`;
}
infoHtml += `<div class="diagnosis-inline"><span>Confirme suspeitas em amostras reais com análise laboratorial.</span><button class="diagnosis-action ghost" onclick="app.openDiagnosisHelp()">Enviar amostra</button></div>`;
if (pathogen._needsReview) {
infoHtml += `<div style="margin-top:8px;padding:8px;background:#fef3c7;border-radius:6px;color:#92400e;font-size:0.85em;">⚠️ <strong>Revisão taxonômica pendente</strong> — consulte literatura especializada.</div>`;
}

document.getElementById('pathogenMapInfoContainer').innerHTML =
`<div class="pathogen-map-info" id="pathogenMapInfo">${infoHtml}</div>`;
document.getElementById('miniMapLegend').innerHTML = `
<span class="minimap-legend-dot"></span>
<span>Ponto informativo do estado, posicionado na capital; não representa o local exato da detecção</span>
`;

setTimeout(() => this.renderPathogenMap(pathogen, null, 'single'), 120);
},

openMultiPathogenMap() {
if (this.selectedPathogens.size === 0) return;

const pathogens = Array.from(this.selectedPathogens.values());

document.getElementById('pathogenMapOverlay').classList.add('active');
document.getElementById('pathogenMapTitle').textContent =
`Comparação de ${pathogens.length} bactéria(s)`;
document.getElementById('pathogenMapScientific').textContent =
`Mapa sobreposto — cada cor representa uma espécie distinta`;

let legendHtml = `
<div class="multi-pathogen-info">
<h4>🎨 Legenda de cores</h4>
${pathogens.map((p, idx) => {
const cleanName = p.pathogen.bacteria.replace(/<[^>]*>/g, '');
const stateCount = p.pathogen.regioes.filter(r => STATE_NAMES[r] && !r.startsWith('Região') && r !== 'BR').length;
return `
<div class="pathogen-legend-item">
<div class="legend-color" style="background:${PATHOGEN_COLORS[idx % PATHOGEN_COLORS.length]}"></div>
<div class="legend-bacteria-name">${cleanName}</div>
<div class="legend-states-count">${stateCount} UF${stateCount !== 1 ? 's' : ''}</div>
</div>`;
}).join('')}
</div>`;
const tableHtml = `
<div class="compare-table-wrap">
<table class="compare-table">
<thead><tr><th>Cor</th><th>Bactéria</th><th>Hospedeiro</th><th>Estados</th><th>Fotos</th></tr></thead>
<tbody>
${pathogens.map((p, idx) => {
const cleanName = this.plainName(p.pathogen.bacteria);
const states = p.pathogen.regioes.filter(r => STATE_NAMES[r] && !r.startsWith('Regi') && r !== 'BR').map(r => STATE_NAMES[r]).join(', ');
const photos = this.getHostPhotos(cleanName, p.host.nome_cientifico).length;
return `<tr>
<td><span class="legend-color" style="display:inline-block;background:${PATHOGEN_COLORS[idx % PATHOGEN_COLORS.length]}"></span></td>
<td><em>${cleanName}</em></td>
<td>${p.host.nome_comum}</td>
<td>${states || 'Registro amplo'}</td>
<td>${photos}</td>
</tr>`;
}).join('')}
</tbody>
</table>
</div>`;
const diagnosisHtml = `<div class="diagnosis-inline"><span>Comparação ajuda a formular hipóteses, mas não substitui confirmação por isolamento, testes ou análise molecular.</span><button class="diagnosis-action ghost" onclick="app.openDiagnosisHelp()">Diagnóstico</button></div>`;
document.getElementById('pathogenMapInfoContainer').innerHTML = legendHtml + tableHtml + diagnosisHtml;
document.getElementById('miniMapLegend').innerHTML = `
<span class="minimap-legend-dot" style="background:transparent;border:2px solid var(--text-tertiary)"></span>
<span>Clique nos círculos para ver detalhes. Os pontos representam estados, não coordenadas exatas de detecção.</span>
`;

setTimeout(() => this.renderPathogenMap(null, pathogens, 'multi'), 120);
},

renderPathogenMap(singlePathogen, multiPathogens, mode) {
const mapDiv = document.getElementById('pathogenMiniMap');
if (this.pathogenMap) {
this.pathogenMap.remove();
this.pathogenMap = null;
}
this.pathogenMap = L.map(mapDiv, {
center: [-14.235, -51.925],
zoom: 4,
minZoom: 3,
maxZoom: 7,
zoomControl: true
});
const tileUrl = this.theme === 'dark'
? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
L.tileLayer(tileUrl, {
attribution: this.theme === 'dark' ? '© CartoDB' : '© OpenStreetMap'
}).addTo(this.pathogenMap);

const allMarkers = [];

if (mode === 'single' && singlePathogen) {
const cleanBacteria = singlePathogen.bacteria.replace(/<[^>]*>/g, '');
singlePathogen.regioes.forEach(r => {
if (r === 'BR' || r.startsWith('Região')) return;
if (!STATE_COORDS[r]) return;
const [lat, lng] = STATE_COORDS[r];
const m = L.circleMarker([lat, lng], {
radius: 14,
fillColor: '#2e7d32',
color: '#ffffff',
weight: 2,
opacity: 1,
fillOpacity: 0.9
}).addTo(this.pathogenMap);
m.bindPopup(`<strong>${STATE_NAMES[r]} (${r})</strong><br><em style="font-size:0.9em">${cleanBacteria}</em><br><span style="font-size:11px;color:#666">Ponto na capital apenas para indicar o estado de ocorrência.</span>`);
allMarkers.push(m);
});
} else if (mode === 'multi' && multiPathogens) {
// CORREÇÃO: offset angular para evitar sobreposição
const stateOccurrences = {};
multiPathogens.forEach((p, idx) => {
const color = PATHOGEN_COLORS[idx % PATHOGEN_COLORS.length];
const cleanBacteria = p.pathogen.bacteria.replace(/<[^>]*>/g, '');
p.pathogen.regioes.forEach(r => {
if (r === 'BR' || r.startsWith('Região')) return;
if (!STATE_COORDS[r]) return;
if (!stateOccurrences[r]) stateOccurrences[r] = [];
stateOccurrences[r].push({idx, color, cleanBacteria, host: p.host});
});
});

Object.entries(stateOccurrences).forEach(([r, occurrences]) => {
const [lat, lng] = STATE_COORDS[r];
occurrences.forEach((occ, occIdx) => {
// Offset angular inteligente
const angle = (occIdx / occurrences.length) * 2 * Math.PI;
const radius = occurrences.length > 1 ? 0.4 : 0;
const offsetLat = lat + Math.cos(angle) * radius;
const offsetLng = lng + Math.sin(angle) * radius;

const m = L.circleMarker([offsetLat, offsetLng], {
radius: 10,
fillColor: occ.color,
color: '#ffffff',
weight: 2,
opacity: 1,
fillOpacity: 0.85
}).addTo(this.pathogenMap);
m.bindPopup(`
<div style="min-width:160px">
<strong style="font-size:13px">${STATE_NAMES[r]} (${r})</strong><br>
<div style="margin-top:6px;padding:4px 8px;background:${occ.color};color:white;border-radius:4px;font-size:0.85em;font-style:italic;">
${occ.cleanBacteria}
</div>
<div style="margin-top:4px;font-size:0.8em;color:#666">
Hospedeiro: ${occ.host.nome_comum}
</div>
<div style="margin-top:4px;font-size:11px;color:#666">
Ponto na capital apenas para indicar o estado de ocorrência.
</div>
</div>
`);
allMarkers.push(m);
});
});
} else if (mode === 'profile' && multiPathogens) {
const stateOccurrences = {};
multiPathogens.forEach((o) => {
const cleanBacteria = this.plainName(o.pathogen.bacteria);
o.pathogen.regioes.forEach(r => {
if (r === 'BR' || r.startsWith('Regi')) return;
if (!STATE_COORDS[r]) return;
if (!stateOccurrences[r]) stateOccurrences[r] = {hosts: new Set(), bacteria: cleanBacteria};
stateOccurrences[r].hosts.add(o.host.nome_comum);
});
});
Object.entries(stateOccurrences).forEach(([r, info]) => {
const [lat, lng] = STATE_COORDS[r];
const m = L.circleMarker([lat, lng], {
radius: Math.min(22, 10 + info.hosts.size),
fillColor: '#2e7d32',
color: '#ffffff',
weight: 2,
opacity: 1,
fillOpacity: 0.85
}).addTo(this.pathogenMap);
const hosts = Array.from(info.hosts).slice(0, 8).join(', ');
m.bindPopup(`<strong>${STATE_NAMES[r]} (${r})</strong><br><em>${info.bacteria}</em><br><span>${info.hosts.size} cultura(s): ${hosts}</span><br><span style="font-size:11px;color:#666">Ponto na capital apenas para indicar o estado de ocorrência.</span>`);
allMarkers.push(m);
});
}

if (allMarkers.length > 0) {
const group = L.featureGroup(allMarkers);
this.pathogenMap.fitBounds(group.getBounds().pad(0.3));
} else {
this.pathogenMap.setView([-14.235, -51.925], 4);
}
setTimeout(() => this.pathogenMap.invalidateSize(), 250);
},

closePathogenMap() {
document.getElementById('pathogenMapOverlay').classList.remove('active');
if (this.pathogenMap) {
this.pathogenMap.remove();
this.pathogenMap = null;
}
},

initMap() {
if (this.mapInitialized) {
setTimeout(() => this.map.invalidateSize(), 100);
return;
}
try {
this.map = L.map('map', {
center: [-14.235, -51.925], zoom: 4,
minZoom: 3, maxZoom: 8, zoomControl: true
});
const tileUrl = this.theme === 'dark'
? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
L.tileLayer(tileUrl, {
attribution: this.theme === 'dark' ? '© CartoDB' : '© OpenStreetMap'
}).addTo(this.map);
this.addStateMarkers();
this.mapInitialized = true;
setTimeout(() => this.map.invalidateSize(), 200);
} catch (e) { console.error('Erro mapa:', e); }
},

addStateMarkers() {
const stateCounts = {};
STATES.forEach(s => stateCounts[s] = 0);
const stateData = {};
STATES.forEach(s => stateData[s] = {hosts: new Set(), pathogens: new Set()});
DATABASE.hosts.forEach(h => {
h.patogenos.forEach(p => {
p.regioes.forEach(r => {
if (STATE_NAMES[r] && stateCounts[r] !== undefined) {
stateCounts[r]++;
stateData[r].hosts.add(h.nome_comum);
const cleanBac = p.bacteria.replace(/<[^>]*>/g, '');
stateData[r].pathogens.add(cleanBac);
}
});
});
});
const maxCount = Math.max(...Object.values(stateCounts), 1);
const activeStates = STATES.filter(state => stateCounts[state] > 0);
const hostTotal = new Set();
const pathogenTotal = new Set();
activeStates.forEach(state => {
stateData[state].hosts.forEach(host => hostTotal.add(host));
stateData[state].pathogens.forEach(pathogen => pathogenTotal.add(pathogen));
});
const topState = [...STATES].sort((a, b) => stateCounts[b] - stateCounts[a])[0];
const summary = document.getElementById('mapSummaryGrid');
if (summary) {
summary.innerHTML = `
<div class="map-stat"><strong>${activeStates.length}</strong><span>estados com registro</span></div>
<div class="map-stat"><strong>${hostTotal.size}</strong><span>culturas no mapa</span></div>
<div class="map-stat"><strong>${pathogenTotal.size}</strong><span>bactérias distintas</span></div>
<div class="map-stat"><strong>${topState}</strong><span>maior volume</span></div>
`;
}
STATES.forEach(state => {
const [lat, lng] = STATE_COORDS[state];
const count = stateCounts[state];
const ratio = count / maxCount;
let color = '#e2e8f0';
if (ratio > 0.5) color = '#ef4444';
else if (ratio > 0.2) color = '#f59e0b';
else if (ratio > 0) color = '#22c55e';
const marker = L.circleMarker([lat, lng], {
radius: count ? Math.max(9, Math.min(24, 8 + Math.sqrt(count) * 1.25)) : 7,
fillColor: color, color: '#ffffff',
weight: 3, opacity: 1, fillOpacity: count ? 0.88 : 0.55
}).addTo(this.map);
const hosts = Array.from(stateData[state].hosts).slice(0, 6).join(', ');
const moreHosts = stateData[state].hosts.size > 6 ? `... e mais ${stateData[state].hosts.size - 6}` : '';
const popupContent = `
<div style="min-width:180px">
<strong style="font-size:14px">${STATE_NAMES[state]} (${state})</strong><br>
<span style="color:#2e7d32;font-weight:700">${count} registro(s)</span><br>
<div style="margin-top:8px;font-size:12px">
<strong>Culturas:</strong><br>${hosts || 'Nenhuma'}${moreHosts}
</div>
<div style="margin-top:6px;font-size:11px;color:#666">
${stateData[state].pathogens.size} patógeno(s) distinto(s)
</div>
<div style="margin-top:6px;font-size:11px;color:#666">
Marcador posicionado na capital apenas para indicar a unidade federativa.
</div>
</div>`;
marker.bindPopup(popupContent);
});
document.getElementById('stateList').innerHTML = [...STATES].sort((a, b) => stateCounts[b] - stateCounts[a]).map(s =>
`<div class="state-item ${stateCounts[s] ? 'active' : ''}">${s}<div class="count">${stateCounts[s]} regs.</div></div>`
).join('');
}
};

window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
