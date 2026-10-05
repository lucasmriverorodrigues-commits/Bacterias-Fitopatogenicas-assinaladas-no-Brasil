/* The interface uses the same normalized records as the original map workflows. */
Object.assign(app, {
  searchMode: 'all',
  currentAtlas: [],
  icon(name) { return `<i data-lucide="${name}" aria-hidden="true"></i>`; },
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); },
  argument(value) { return this.escape(JSON.stringify(String(value))); },
  readStored(key, fallback = []) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } },
  saveStored(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { this.notify('Não foi possível salvar neste navegador.'); } },
  refreshIcons() { window.lucide?.createIcons(); },
  notify(message) {
    const el = document.getElementById('toast');
    el.textContent = message; el.classList.add('active');
    clearTimeout(this.toastTimeout); this.toastTimeout = setTimeout(() => el.classList.remove('active'), 4500);
  },
  initExperience() {
    const groups = [...new Set(DATABASE.hosts.map(h => h.grupo_agronomico))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
    document.getElementById('cultureGroup').innerHTML += groups.map(g => `<option>${this.escape(g)}</option>`).join('');
    const states = STATES.slice().sort((a,b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b], 'pt-BR'));
    const options = states.map(uf => `<option value="${uf}">${STATE_NAMES[uf]}</option>`).join('');
    document.getElementById('cultureState').innerHTML += options;
    document.getElementById('mapState').innerHTML += options;
    this.renderFeatured(); this.renderRecent(); this.refreshIcons();
    this.setupModalAccessibility();
    this.refreshOfflineStatus();
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); this.installPrompt = event; });
    window.addEventListener('hashchange', () => this.restoreRoute());
    if (location.hash) this.restoreRoute();
    document.addEventListener('click', event => {
      if (event.target.closest('.nav-btn, .nav-secondary button, .brand, .home-tools button')) {
        const view = document.body.dataset.view;
        if (location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
      }
    });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => this.refreshOfflineStatus());
      navigator.serviceWorker.ready.then(() => this.refreshOfflineStatus());
    }
  },
  restoreRoute() {
    const [view, query] = location.hash.slice(1).split('?');
    if (!document.getElementById(view)?.classList.contains('view')) return;
    const host = new URLSearchParams(query).get('host');
    if (host && view === 'cultureView') {
      const idx = DATABASE.hosts.findIndex(h => h.nome_cientifico === host);
      if (idx >= 0) { this.openCultureFromSmart(idx, false); return; }
    }
    this.navigate(view);
  },
  renderFeatured() {
    const selected = [
      ['Coffea arabica', 'Café arábica', 'cafe_pgarcae_foliar_01.jpg'],
      ['Solanum lycopersicum', 'Tomate', 'tomate_ptomato_foliar_01.jpg'],
      ['Solanum tuberosum', 'Batata', 'batata_streptomyces_tuberculo_01.JPG'],
      ['Phaseolus vulgaris', 'Feijão', 'feijao_ptabaci_foliar_01.jpg']
    ];
    document.getElementById('featuredCrops').innerHTML = selected.map(([scientific, label, file]) => {
      const idx = DATABASE.hosts.findIndex(h => h.nome_cientifico === scientific);
      if (idx < 0) return '';
      const host = DATABASE.hosts[idx];
      return `<button class="crop-card" onclick="app.openCultureFromSmart(${idx})"><img src="assets/fotos/${file}" alt="Imagem de referência de sintomas em ${label}" loading="lazy"><div class="crop-card-body"><strong>${label}</strong><small>${scientific}</small><span class="crop-meta">${host.patogenos.length} bactérias registradas ${this.icon('arrow-up-right')}</span></div></button>`;
    }).join('');
  },
  renderHostLink(host) {
    const idx = DATABASE.hosts.indexOf(host);
    return `<div class="recent-row"><button onclick="app.openCultureFromSmart(${idx})"><strong>${this.escape(host.nome_comum)}</strong><small>${this.escape(host.nome_cientifico)}</small></button>${this.favoriteButton(host)}</div>`;
  },
  renderRecent() {
    const hosts = this.readStored('fb-recent').map(name => DATABASE.hosts.find(h => h.nome_cientifico === name)).filter(Boolean).slice(0,4);
    document.getElementById('recentSection').hidden = !hosts.length;
    document.getElementById('recentCrops').innerHTML = hosts.map(h => this.renderHostLink(h)).join('');
    this.refreshIcons();
  },
  clearRecent() { this.saveStored('fb-recent', []); this.renderRecent(); },
  favoriteButton(host) {
    const saved = this.readStored('fb-favorites').includes(host.nome_cientifico);
    return `<button class="icon-button ${saved ? 'is-saved' : ''}" title="${saved ? 'Remover dos favoritos' : 'Salvar cultura'}" aria-label="${saved ? 'Remover dos favoritos' : 'Salvar cultura'}: ${this.escape(host.nome_comum)}" aria-pressed="${saved}" onclick="event.stopPropagation();app.toggleFavorite(${DATABASE.hosts.indexOf(host)})">${this.icon('bookmark')}</button>`;
  },
  toggleFavorite(idx) {
    const host = DATABASE.hosts[idx]; if (!host) return;
    const favorites = this.readStored('fb-favorites'); const saved = favorites.includes(host.nome_cientifico);
    this.saveStored('fb-favorites', saved ? favorites.filter(h => h !== host.nome_cientifico) : [...favorites, host.nome_cientifico]);
    this.renderRecent(); this.renderSaved();
    if (document.body.dataset.view === 'cultureView') this.searchCulture();
    this.notify(saved ? 'Cultura removida dos favoritos.' : 'Cultura salva em Meu campo.');
  },
  renderSaved() {
    const hosts = this.readStored('fb-favorites').map(name => DATABASE.hosts.find(h => h.nome_cientifico === name)).filter(Boolean);
    document.getElementById('savedCrops').innerHTML = hosts.length ? hosts.map(h => this.renderHostLink(h)).join('') : `<div class="empty-state"><h3>Nenhuma cultura salva</h3><button class="text-button" onclick="app.navigate('cultureView')">Explorar culturas ${this.icon('arrow-right')}</button></div>`;
    this.refreshIcons();
  },
  openCultureFromSmart(hostIdx, updateRoute = true) {
    const host = DATABASE.hosts[hostIdx]; if (!host) return;
    this.currentCultureFilter = 'all';
    document.getElementById('cultureGroup').value = 'all';
    document.getElementById('cultureState').value = '';
    document.getElementById('culturePhotosOnly').checked = false;
    document.getElementById('cultureSearch').value = host.nome_cientifico;
    this.exactHost = host.nome_cientifico;
    this.navigate('cultureView');
    const recent = this.readStored('fb-recent').filter(n => n !== host.nome_cientifico);
    this.saveStored('fb-recent', [host.nome_cientifico, ...recent].slice(0,6));
    this.renderRecent();
    if (updateRoute) history.pushState(null, '', `#cultureView?host=${encodeURIComponent(host.nome_cientifico)}`);
  },
  setSearchMode(mode) {
    this.searchMode = mode;
    document.querySelectorAll('[data-search-mode]').forEach(button => {
      const selected = button.dataset.searchMode === mode;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', selected);
    });
    if (document.getElementById('smartSearch').value.trim()) this.smartSearch();
  },
  queryMatches(text, query) {
    const haystack = this.normalizeText(text).replace(/[^a-z0-9]+/g, ' ');
    const terms = this.normalizeText(query).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
    return terms.every(term => haystack.includes(term));
  },
  bacteriaSearchText(name) {
    const aliases = Object.entries(taxonomyUpdates).filter(([, current]) => PhotoCatalog.key(current) === PhotoCatalog.key(name)).map(([old]) => old);
    return `${name} ${aliases.join(' ')} ${this.photoNameAliases(name).join(' ')}`;
  },
  collectSearchResults(query) {
    const results = [];
    if (this.searchMode !== 'pathogen') DATABASE.hosts.forEach((host, hostIdx) => {
      if (this.queryMatches(`${host.nome_comum} ${host.nome_cientifico} ${(host.nomes_populares || []).join(' ')} ${host.nome_original || ''}`, query)) {
        results.push({ type:'culture', hostIdx, title:host.nome_comum, meta:host.nome_cientifico, score:100 });
      }
    });
    if (this.searchMode !== 'culture') {
      const grouped = new Map();
      DATABASE.hosts.forEach((host, hostIdx) => host.patogenos.forEach((p, pathIdx) => {
        const name = this.plainName(p.bacteria);
        if (this.queryMatches(this.bacteriaSearchText(name), query)) {
          const key = PhotoCatalog.key(name);
          if (!grouped.has(key)) grouped.set(key, {type:'pathogen', title:name, hostIdx, pathIdx, count:0, score:90});
          grouped.get(key).count++;
        }
      }));
      grouped.forEach(result => { result.meta = `${result.count} hospedeiros com registro`; results.push(result); });
    }
    if (this.searchMode === 'all' && !results.length) {
      const states = STATES.filter(uf => this.queryMatches(`${uf} ${STATE_NAMES[uf]}`, query));
      states.forEach(uf => results.push({type:'state', state:uf, title:STATE_NAMES[uf], meta:'Registros por unidade federativa', score:80}));
      const rules = SYMPTOM_RULES.filter(rule => this.queryMatches(rule.label, query) || rule.terms.some(term => this.queryMatches(term, query)));
      const symptoms = new Map();
      DATABASE.hosts.forEach((host, hostIdx) => host.patogenos.forEach((p, pathIdx) => {
        if (rules.some(rule => rule.bacteria.some(genus => this.plainName(p.bacteria).startsWith(genus + ' ')))) {
          const name = this.plainName(p.bacteria);
          if (!symptoms.has(name)) symptoms.set(name, {type:'pathogen', title:name, hostIdx, pathIdx, meta:'Referência por sintoma; não confirma diagnóstico', score:50});
        }
      }));
      results.push(...symptoms.values());
    }
    return results.sort((a,b) => b.score - a.score || a.title.localeCompare(b.title,'pt-BR'));
  },
  smartSearch() {
    const query = document.getElementById('smartSearch').value.trim();
    const el = document.getElementById('smartSearchResults');
    if (query.length < 2) { el.innerHTML = query ? '<p class="search-result-count">Digite pelo menos 2 caracteres.</p>' : ''; return; }
    const results = this.collectSearchResults(query);
    el.innerHTML = results.length ? `<p class="search-result-count">${results.length} resultados${results.length > 16 ? ' · exibindo os primeiros 16' : ''}</p>${results.slice(0,16).map(result => this.createSmartResult(result)).join('')}` : `<div class="empty-state"><h3>Nenhum resultado para “${this.escape(query)}”</h3><p>Tente um nome popular, científico ou uma parte do nome.</p></div>`;
    this.refreshIcons();
  },
  createSmartResult(result) {
    const action = result.type === 'culture' ? `app.openCultureFromSmart(${result.hostIdx})` : result.type === 'state' ? `app.openState('${result.state}')` : `app.openBacteriaProfile(${this.argument(result.title)})`;
    return `<button class="smart-result" onclick="${action}"><span class="smart-result-type">${{culture:'CULTURA',pathogen:'BACTÉRIA',state:'ESTADO'}[result.type]}</span><span><span class="smart-result-title">${this.escape(result.title)}</span><span class="smart-result-meta" style="display:block">${this.escape(result.meta)}</span></span>${this.icon('arrow-up-right')}</button>`;
  },
  filterCulture(group) { this.currentCultureFilter = group; this.exactHost = ''; this.searchCulture(); },
  searchCulture() {
    const query = document.getElementById('cultureSearch').value.trim();
    if (query !== this.exactHost) this.exactHost = '';
    const state = document.getElementById('cultureState').value;
    const photosOnly = document.getElementById('culturePhotosOnly').checked;
    const results = DATABASE.hosts.filter(host => {
      if (this.exactHost && host.nome_cientifico !== this.exactHost) return false;
      if (this.currentCultureFilter !== 'all' && host.grupo_agronomico !== this.currentCultureFilter) return false;
      if (state && !host.patogenos.some(p => p.regioes.includes(state))) return false;
      if (photosOnly && !PhotoCatalog.contextual(host).length) return false;
      return !query || this.queryMatches(`${host.nome_comum} ${host.nome_cientifico} ${(host.nomes_populares || []).join(' ')} ${host.nome_original || ''}`, query);
    }).sort((a,b) => a.nome_comum.localeCompare(b.nome_comum, 'pt-BR') || a.nome_cientifico.localeCompare(b.nome_cientifico, 'pt-BR'));
    const el = document.getElementById('cultureResults');
    el.innerHTML = `<p class="results-count">${results.length} culturas${state ? ` com registro em ${STATE_NAMES[state]}` : ''}</p>` + (results.length ? results.map(host => this.createHostCard(host, DATABASE.hosts.indexOf(host), Boolean(query) && results.length <= 8)).join('') : '<div class="empty-state"><h3>Nenhuma cultura encontrada</h3><p>Altere a busca ou os filtros selecionados.</p></div>');
    this.refreshIcons();
  },
  createHostCard(host, idx, expanded = false) {
    const states = new Set(host.patogenos.flatMap(p => p.regioes).filter(uf => STATE_NAMES[uf]));
    const aliases = (host.nomes_populares || []).filter(n => this.normalizeText(n) !== this.normalizeText(host.nome_comum));
    return `<article class="host-card" data-host="${idx}"><div class="host-header"><div><h2 class="host-name">${this.escape(host.nome_comum)}</h2><div class="host-scientific">${this.escape(host.nome_cientifico)}</div>${aliases.length ? `<div class="alias-line">${this.escape(aliases.join(' · '))}</div>` : ''}</div>${this.favoriteButton(host)}</div><div class="host-tags"><span class="tag">${this.escape(host.grupo_agronomico)}</span><span class="tag">${this.escape(host.subgrupo)}</span></div><div class="host-meta"><span>${this.icon('microscope')}${host.patogenos.length} bactérias</span><span>${this.icon('map-pin')}${states.size} UFs</span></div><details ${expanded ? 'open' : ''}><summary>Bactérias registradas</summary>${host.patogenos.map((p,i) => this.createPathogenItem(p,idx,i)).join('')}</details>${this.renderHostGenericPhotoButtons(host.nome_cientifico)}</article>`;
  },
  createPathogenItem(pathogen, hostIdx, pathIdx) {
    const host = DATABASE.hosts[hostIdx], key = `${hostIdx}_${pathIdx}`;
    const selected = this.selectedPathogens.has(key);
    return `<div class="pathogen-item ${selected ? 'selected' : ''}">${this.compareMode ? `<input type="checkbox" class="pathogen-checkbox" data-host="${hostIdx}" data-path="${pathIdx}" ${selected ? 'checked' : ''} aria-label="Comparar ${this.escape(this.plainName(pathogen.bacteria))}" onchange="app.togglePathogenSelection(${hostIdx},${pathIdx},this)">` : ''}<div class="pathogen-content"><div class="pathogen-name"><button class="pathogen-title" onclick="app.openBacteriaProfile(${this.argument(this.plainName(pathogen.bacteria))})">${this.escape(this.plainName(pathogen.bacteria))}</button><div class="pathogen-actions">${this.renderPhotoButton(pathogen.bacteria,host.nome_cientifico)}<button class="map-hint" onclick="app.openPathogenMap(${hostIdx},${pathIdx})">${this.icon('map-pin')}Mapa</button></div></div><div class="pathogen-regions">${pathogen.regioes.map(r => `<span class="region-tag">${this.escape(STATE_NAMES[r] || r)}</span>`).join('')}</div></div></div>`;
  },
  searchDisease() {
    const query = document.getElementById('diseaseSearch').value.trim();
    const grouped = new Map();
    DATABASE.hosts.forEach(host => host.patogenos.forEach(p => {
      const name = this.plainName(p.bacteria);
      if (query && !this.queryMatches(this.bacteriaSearchText(name),query)) return;
      const key = PhotoCatalog.key(name);
      if (!grouped.has(key)) grouped.set(key,{name,hosts:new Set(),states:new Set(),photos:new Set()});
      const entry = grouped.get(key); entry.hosts.add(host.nome_cientifico);
      p.regioes.filter(r => STATE_NAMES[r]).forEach(r => entry.states.add(r));
      this.findPhotosForBacteria(name,host.nome_cientifico).forEach(p => entry.photos.add(p.foto));
    }));
    const results = [...grouped.values()].sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
    document.getElementById('diseaseResults').innerHTML = `<p class="results-count">${results.length} bactérias</p>` + (results.length ? results.map(r => `<div class="bacteria-row"><button onclick="app.openBacteriaProfile(${this.argument(r.name)})"><strong>${this.escape(r.name)}</strong><small>${r.hosts.size} hospedeiros · ${r.states.size} UFs${r.photos.size ? ` · ${r.photos.size} fotos` : ''}</small></button>${r.photos.size ? `<button class="icon-button" aria-label="Fotos de ${this.escape(r.name)}" title="Ver fotos" onclick="app.openTaxonPhotos(${this.argument(r.name)})">${this.icon('camera')}</button>` : ''}<button class="icon-button" aria-label="Ficha de ${this.escape(r.name)}" title="Abrir ficha" onclick="app.openBacteriaProfile(${this.argument(r.name)})">${this.icon('arrow-up-right')}</button></div>`).join('') : '<div class="empty-state"><h3>Nenhuma bactéria encontrada</h3><p>Tente outro nome ou sinônimo.</p></div>');
    this.refreshIcons();
  },
  findPhotosForBacteria(bacteria, host) { return PhotoCatalog.find(bacteria,host); },
  genericPhotoTarget() { return ''; },
  renderPhotoButton(bacteria,host,compact = false) {
    const photos = this.findPhotosForBacteria(bacteria,host); if (!photos.length) return '';
    return `<button class="photo-hint" aria-label="${photos.length} fotos de ${this.escape(this.plainName(bacteria))}" onclick="event.stopPropagation();app.openPhotoGallery(${this.argument(this.plainName(bacteria))},${this.argument(host)})">${this.icon('camera')}${compact ? photos.length : `Fotos · ${photos.length}`}</button>`;
  },
  renderHostGenericPhotoButtons(scientific) {
    const host = DATABASE.hosts.find(h => h.nome_cientifico === scientific); if (!host) return '';
    const photos = PhotoCatalog.unassigned(host); if (!photos.length) return '';
    return `<div class="host-generic-photos"><span class="host-generic-photos-label">Acervo complementar: identificação incompleta ou diferente dos registros acima.</span><button class="photo-hint" onclick="app.openHostReferencePhotos(${DATABASE.hosts.indexOf(host)})">${this.icon('images')}Ver ${photos.length} fotos de referência</button></div>`;
  },
  showGallery(photos,title,note) {
    if (!photos.length) { this.notify('Ainda não há fotos vinculadas a esta identificação.'); return; }
    this.allPhotos = photos; this.currentPhotos = photos; this.currentPhotoFilter = 'all'; this.currentPhotoIndex = 0;
    document.getElementById('photoGalleryTitle').textContent = title;
    document.getElementById('galleryNote').textContent = note;
    this.renderPhotoFilters(); this.renderPhotoGallery();
    document.getElementById('photoGalleryOverlay').classList.add('active');
  },
  openPhotoGallery(bacteria,host) { this.showGallery(this.findPhotosForBacteria(bacteria,host),this.plainName(bacteria),`${host}. Identificação conforme o arquivo do acervo; imagens não confirmam o diagnóstico de uma nova amostra.`); },
  openHostReferencePhotos(idx) {
    const host = DATABASE.hosts[idx];
    this.showGallery(PhotoCatalog.unassigned(host),`${host.nome_comum} · acervo complementar`,'Estas imagens não foram atribuídas automaticamente a espécies ou patovares. Confira a identificação de cada fotografia.');
  },
  openTaxonPhotos(name) { this.showGallery(PhotoCatalog.entries.filter(p => !p.review && PhotoCatalog.key(p.taxon) === PhotoCatalog.key(name)),name,'Cada imagem mantém o hospedeiro e a identificação do acervo.'); },
  photoCard(photo,action) {
    const labels = {genus:'Somente gênero',review:'Identificação a conferir',taxon:'Identificação do acervo'};
    return `<button class="photo-card" onclick="${action}"><img src="${this.photoBasePath()}/${encodeURIComponent(photo.foto)}" alt="${this.escape(photo.desc)}" loading="lazy" onerror="app.photoLoadError(this)"><span class="photo-card-info"><span class="photo-card-title">${this.escape(photo.taxon)}</span><span class="photo-card-desc" style="display:block">${this.escape(photo.desc)}</span><span class="tag">${labels[photo.level]}</span></span></button>`;
  },
  photoLoadError(img) { img.onerror = null; img.hidden = true; const span = document.createElement('span'); span.className = 'map-note'; span.textContent = 'Foto não disponível. Conecte-se e tente novamente.'; img.after(span); },
  renderPhotoGallery() { document.getElementById('photoGrid').innerHTML = this.currentPhotos.map((p,i) => this.photoCard(p,`app.openPhotoViewer(${i})`)).join(''); this.refreshIcons(); },
  renderAtlas() {
    const query = document.getElementById('photoSearch').value.trim(), level = document.getElementById('photoLevel').value;
    this.currentAtlas = PhotoCatalog.entries.filter(p => (level === 'all' || p.level === level) && (!query || this.queryMatches(`${p.desc} ${p.taxon} ${p.foto}`,query)));
    document.getElementById('atlasCount').textContent = `${this.currentAtlas.length} fotografias`;
    document.getElementById('atlasGrid').innerHTML = this.currentAtlas.length ? this.currentAtlas.map((p,i) => this.photoCard(p,`app.openAtlasPhoto(${i})`)).join('') : '<div class="empty-state"><h3>Nenhuma imagem encontrada</h3></div>';
  },
  openAtlasPhoto(index) { this.currentPhotos = this.currentAtlas; this.openPhotoViewer(index); },
  openPhotoViewer(index) {
    const photo = this.currentPhotos[index]; if (!photo) return;
    this.currentPhotoIndex = index;
    const img = document.getElementById('photoViewerImg'); img.hidden = false; img.src = `${this.photoBasePath()}/${encodeURIComponent(photo.foto)}`; img.alt = photo.desc;
    img.onerror = () => { img.hidden = true; this.notify('A foto não está disponível neste dispositivo.'); };
    document.getElementById('photoViewerCaption').textContent = `${photo.taxon} · ${photo.desc} · ${index + 1}/${this.currentPhotos.length}`;
    document.querySelector('.photo-viewer-nav.prev').disabled = index === 0;
    document.querySelector('.photo-viewer-nav.next').disabled = index === this.currentPhotos.length - 1;
    document.getElementById('photoViewerOverlay').classList.add('active');
    this.refreshIcons();
  },
  setupModalAccessibility() {
    const overlays = [...document.querySelectorAll('.modal-overlay')];
    this.modalStack = [];
    const observer = new MutationObserver(records => {
      let restoreFocus;
      for (const record of records) {
        const overlay = record.target;
        if (overlay.classList.contains('active') && !this.modalStack.some(m => m.overlay === overlay)) {
          this.modalStack.push({overlay, previous:document.activeElement});
          overlay.querySelector('[role=dialog]')?.focus({preventScroll:true});
        } else if (!overlay.classList.contains('active')) {
          const index = this.modalStack.findIndex(m => m.overlay === overlay);
          if (index >= 0) { const [entry] = this.modalStack.splice(index,1); restoreFocus = entry.previous; }
        }
      }
      const top = this.modalStack.at(-1)?.overlay;
      overlays.forEach(overlay => { overlay.inert = Boolean(top && overlay !== top); });
      document.querySelector('main').inert = Boolean(top);
      document.querySelector('.app-header').inert = Boolean(top);
      document.querySelector('.nav-buttons').inert = Boolean(top);
      document.body.classList.toggle('modal-open',Boolean(top));
      if (restoreFocus?.isConnected) restoreFocus.focus({preventScroll:true});
      this.refreshIcons();
    });
    overlays.forEach(overlay => observer.observe(overlay,{attributes:true,attributeFilter:['class']}));
    document.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || !this.modalStack.length) return;
      const overlay = this.modalStack.at(-1).overlay;
      const focusable = [...overlay.querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1); if (!first) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement.getAttribute('role') === 'dialog')) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  },
  closeTopModal() {
    const id = this.modalStack?.at(-1)?.overlay.id;
    const actions = {pathogenMapOverlay:'closePathogenMap',photoGalleryOverlay:'closePhotoGallery',photoViewerOverlay:'closePhotoViewer',diagnosisOverlay:'closeDiagnosisHelp',tourOverlay:'endTour'};
    if (actions[id]) this[actions[id]]();
  },
  updateFieldStatus() { if (this.refreshOfflineStatus) this.refreshOfflineStatus(); },
  async workerMessage(type,onProgress) {
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) throw new Error('Offline indisponível');
    return new Promise((resolve,reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Tempo de resposta excedido')); }, type === 'DOWNLOAD_PHOTOS' ? 600000 : 15000);
      channel.port1.onmessage = ({data}) => {
        if (data.progress) { onProgress?.(data); return; }
        clearTimeout(timeout); channel.port1.close();
        if (data.error) reject(new Error(data.error)); else resolve(data);
      };
      worker.postMessage({type},[channel.port2]);
    });
  },
  async refreshOfflineStatus() {
    const connection = document.getElementById('connectionStatus'); if (!connection) return;
    connection.textContent = navigator.onLine ? 'Conectado' : 'Sem conexão';
    const status = document.getElementById('offlineStatus'), detail = document.getElementById('offlineDetail');
    if (!('serviceWorker' in navigator)) { status.textContent = 'Indisponível'; detail.textContent = 'Abra o aplicativo por HTTPS para preparar a consulta offline.'; return; }
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.active) { status.textContent = 'Preparando'; detail.textContent = 'Mantenha esta página aberta com internet para concluir a instalação da base.'; return; }
    try {
      const result = await this.workerMessage('STATUS');
      status.textContent = result.core ? 'Base disponível' : 'Base incompleta';
      connection.textContent = result.core ? (navigator.onLine ? 'Consulta offline pronta' : 'Consulta offline') : (navigator.onLine ? 'Conectado' : 'Sem conexão');
      detail.textContent = `${result.core ? 'Dados e mapas salvos.' : 'A base ainda está sendo preparada.'} ${result.cached}/${result.total} fotos disponíveis neste dispositivo.`;
      document.getElementById('offlineProgress').max = result.total;
      document.getElementById('offlineProgress').value = result.cached;
      document.getElementById('downloadOffline').innerHTML = `${this.icon('download')}${result.cached === result.total ? 'Verificar fotos offline' : 'Baixar fotos para uso offline'}`;
      this.refreshIcons();
    } catch { status.textContent = 'Não verificado'; detail.textContent = 'Não foi possível verificar o armazenamento. Reconecte e abra o app novamente.'; }
  },
  async downloadPhotos() {
    if (!navigator.onLine) { this.notify('Conecte-se à internet para baixar as fotos que faltam.'); return; }
    const button = document.getElementById('downloadOffline'); button.disabled = true;
    try {
      const result = await this.workerMessage('DOWNLOAD_PHOTOS',data => {
        document.getElementById('offlineProgress').value = data.cached;
        document.getElementById('offlineDetail').textContent = `Salvando fotografias: ${data.cached}/${data.total}. Mantenha esta página aberta.`;
      });
      this.notify(result.cached === result.total ? 'Acervo disponível offline neste dispositivo.' : `${result.cached}/${result.total} fotos salvas. Tente novamente para baixar as restantes.`);
    } catch { this.notify('Download interrompido. Você pode tentar novamente; as fotos salvas serão mantidas.'); }
    button.disabled = false; this.refreshOfflineStatus();
  },
  async installApp() {
    if (this.installPrompt) { await this.installPrompt.prompt(); await this.installPrompt.userChoice; this.installPrompt = null; }
    else { document.getElementById('installHelp').scrollIntoView({block:'nearest'}); this.notify('Use Adicionar à tela inicial ou Instalar no menu do navegador.'); }
  },
  async getBoundaries() {
    if (this.boundaries) return this.boundaries;
    if (!this.boundariesPromise) this.boundariesPromise = fetch('assets/brasil-estados.geojson').then(r => { if(!r.ok) throw new Error('Mapa indisponível'); return r.json(); }).then(data => this.boundaries = data).catch(error => { this.boundariesPromise = null; throw error; });
    return this.boundariesPromise;
  },
  stateCode(feature) {
    const codes = {'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF'};
    return feature.properties.SIGLA_UF || codes[feature.properties.codarea] || codes[feature.properties.CD_UF];
  },
  async initMap() {
    if (this.mapInitialized) { this.map.invalidateSize(); return; }
    try {
      const data = await this.getBoundaries();
      if (this.mapInitialized) return;
      this.stateCounts = Object.fromEntries(STATES.map(s => [s,0]));
      DATABASE.hosts.forEach(h => h.patogenos.forEach(p => p.regioes.forEach(r => { if (r in this.stateCounts) this.stateCounts[r]++; })));
      this.map = L.map('map',{center:[-14.235,-51.925],zoom:4,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,zoomControl:true,scrollWheelZoom:false,minZoom:3,maxZoom:8,attributionControl:true});
      this.stateLayer = L.geoJSON(data,{style:feature => this.stateStyle(this.stateCode(feature)),onEachFeature:(feature,layer) => {
        const uf = this.stateCode(feature);
        layer.bindTooltip(`${STATE_NAMES[uf]} · ${this.stateCounts[uf]} registros`,{sticky:true});
        layer.on('click',() => this.selectState(uf));
      }}).addTo(this.map);
      this.map.attributionControl.addAttribution('Malha: IBGE');
      this.map.fitBounds(this.stateLayer.getBounds(),{padding:[12,12],animate:false});
      this.mapInitialized = true; this.selectState(document.getElementById('mapState').value);
    } catch { document.getElementById('map').innerHTML = '<div class="empty-state"><h3>Mapa indisponível</h3><p>Reconecte-se para carregar a base cartográfica.</p></div>'; }
  },
  stateStyle(uf) {
    const ratio = (this.stateCounts?.[uf] || 0) / Math.max(...Object.values(this.stateCounts || {all:1}));
    return {color:this.theme === 'dark' ? '#202923' : '#fff',weight:1.5,fillColor:ratio > .5 ? '#17694e' : ratio > .2 ? '#5c9d7b' : ratio > 0 ? '#b3d3bf' : '#e6ece8',fillOpacity:.95};
  },
  openState(uf) { document.getElementById('mapState').value = uf; this.navigate('mapView'); if(this.mapInitialized) this.selectState(uf); },
  selectState(uf) {
    if (uf && !STATE_NAMES[uf]) return;
    document.getElementById('mapState').value = uf;
    document.getElementById('stateTitle').textContent = STATE_NAMES[uf] || 'Brasil';
    const records = [];
    DATABASE.hosts.forEach((host,hostIdx) => host.patogenos.forEach((pathogen,pathIdx) => {
      if (uf ? pathogen.regioes.includes(uf) : pathogen.regioes.some(r => STATE_NAMES[r])) records.push({host,pathogen,hostIdx,pathIdx});
    }));
    document.getElementById('mapSummaryGrid').innerHTML = `<div class="map-stat"><strong>${uf ? records.length : records.reduce((n,r) => n + r.pathogen.regioes.filter(uf=>STATE_NAMES[uf]).length,0)}</strong><span>registros por UF</span></div><div class="map-stat"><strong>${new Set(records.map(r=>r.host.nome_cientifico)).size}</strong><span>hospedeiros</span></div>`;
    document.getElementById('stateList').innerHTML = STATES.map(s => `<button class="state-item ${s === uf ? 'selected' : ''}" onclick="app.selectState('${s}')" aria-label="${STATE_NAMES[s]}: ${this.stateCounts?.[s] || 0} registros">${s}<span class="count">${this.stateCounts?.[s] || 0}</span></button>`).join('');
    this.stateLayer?.eachLayer(layer => { const code = this.stateCode(layer.feature); layer.setStyle({...this.stateStyle(code),weight:code === uf ? 3 : 1.5,color:code === uf ? '#714254' : (this.theme === 'dark' ? '#202923' : '#fff')}); if(code===uf) layer.bringToFront(); });
    document.getElementById('stateResultsSection').hidden = !uf;
    document.getElementById('stateResultsTitle').textContent = `${STATE_NAMES[uf] || ''} · ${records.length} registros`;
    document.getElementById('stateResults').innerHTML = uf ? records.sort((a,b)=>a.host.nome_comum.localeCompare(b.host.nome_comum,'pt-BR')).map(r => `<div class="bacteria-row"><button onclick="app.openPathogenMap(${r.hostIdx},${r.pathIdx})"><strong>${this.escape(this.plainName(r.pathogen.bacteria))}</strong><small>${this.escape(r.host.nome_comum)} · ${this.escape(r.host.nome_cientifico)}</small></button>${this.renderPhotoButton(r.pathogen.bacteria,r.host.nome_cientifico,true)}</div>`).join('') : '';
    this.refreshIcons();
  },
  resetMap() { this.selectState(''); if(this.stateLayer) this.map.fitBounds(this.stateLayer.getBounds(),{padding:[12,12],animate:false}); },
  async renderPathogenMap(single,multiple,mode) {
    const token = Symbol(); this.mapRenderToken = token;
    try {
      const data = await this.getBoundaries();
      if (this.mapRenderToken !== token || !document.getElementById('pathogenMapOverlay').classList.contains('active')) return;
      if(this.pathogenMap) this.pathogenMap.remove();
      this.pathogenMap = L.map('pathogenMiniMap',{center:[-14.235,-51.925],zoom:4,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,scrollWheelZoom:false,minZoom:3,maxZoom:8});
      const records = mode === 'single' ? [single] : multiple.map(r => r.pathogen);
      const states = new Set(records.flatMap(p => p.regioes).filter(r => STATE_NAMES[r]));
      const layer = L.geoJSON(data,{style:feature => ({color:'#fff',weight:1.2,fillColor:states.has(this.stateCode(feature)) ? '#5c9d7b' : '#e6ece8',fillOpacity:.95}),onEachFeature:(feature,state) => {
        const uf=this.stateCode(feature);
        state.bindTooltip(`${STATE_NAMES[uf]} · ${states.has(uf) ? 'com registro nesta consulta' : 'sem registro nesta consulta'}`);
      }}).addTo(this.pathogenMap);
      if (mode === 'multi') {
        const positions = {};
        multiple.forEach((record,i) => record.pathogen.regioes.filter(r=>STATE_COORDS[r]).forEach(uf => {
          const offset=(positions[uf] || 0); positions[uf]=offset+1;
          const [lat,lng]=STATE_COORDS[uf];
          L.circleMarker([lat + offset*.25,lng + offset*.25],{radius:7,color:'#fff',weight:1.5,fillColor:PATHOGEN_COLORS[i%PATHOGEN_COLORS.length],fillOpacity:1}).addTo(this.pathogenMap).bindPopup(`${STATE_NAMES[uf]}<br>${this.escape(this.plainName(record.pathogen.bacteria))}<br>Marcador ilustrativo da UF, não do local de detecção.`);
        }));
      }
      this.pathogenMap.attributionControl.addAttribution('Malha: IBGE');
      this.pathogenMap.fitBounds(layer.getBounds(),{padding:[8,8],animate:false});
      document.getElementById('miniMapLegend').textContent = mode === 'multi' ? 'Cores dos pontos distinguem as bactérias. Posições ilustram a UF e não o local exato de detecção.' : 'Estados destacados possuem registros nesta consulta. A área não indica o local exato de detecção.';
    } catch (error) { console.error('Falha no mapa da consulta:',error); this.lastMapError = error.message; document.getElementById('pathogenMiniMap').innerHTML = '<p class="map-note">Mapa indisponível. Os registros permanecem na ficha acima.</p>'; }
  },
  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme',this.theme); this.applyTheme();
    if(this.stateLayer) this.selectState(document.getElementById('mapState').value);
  }
});
