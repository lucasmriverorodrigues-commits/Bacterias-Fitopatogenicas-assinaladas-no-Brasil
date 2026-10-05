/* Photo labels follow the filename, never the number of matching pathogens. */
const PhotoCatalog = (() => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const taxa = {
    acidovorax: 'Acidovorax', aanthurii: 'Acidovorax anthurii', aavenae: 'Paracidovorax avenae',
    agrobacterium: 'Agrobacterium', bgladioli: 'Burkholderia gladioli', clavibacter: 'Clavibacter',
    curtobacterium: 'Curtobacterium', dickeyazeae: 'Dickeya zeae', erwinia: 'Erwinia', epsidii: 'Erwinia psidii',
    pectobacterium: 'Pectobacterium', pmediterranea: 'Pseudomonas mediterranea', pseudomonas: 'Pseudomonas',
    pcichorii: 'Pseudomonas cichorii', pcorrugata: 'Pseudomonas corrugata', pfuscovaginae: 'Pseudomonas fuscovaginae',
    pmarginalis: 'Pseudomonas marginalis', pglycinea: 'Pseudomonas savastanoi pv. glycinea',
    papii: 'Pseudomonas syringae pv. apii', pgarcae: 'Pseudomonas coronafaciens pv. garcae',
    psyringae: 'Pseudomonas syringae', placrhymans: 'Pseudomonas syringae pv. lachrymans',
    placrimans: 'Pseudomonas syringae pv. lachrymans', pmaculicola: 'Pseudomonas syringae pv. maculicola',
    pstriafaciens: 'Pseudomonas syringae pv. striafaciens', ptabaci: 'Pseudomonas amygdali pv. tabaci',
    ptomato: 'Pseudomonas syringae pv. tomato', pviridiflava: 'Pseudomonas viridiflava',
    ralstonia: 'Ralstonia', robbisia: 'Robbsia', streptomyces: 'Streptomyces', xanthomonas: 'Xanthomonas',
    xpruni: 'Xanthomonas arboricola pv. pruni', xbegoniae: 'Xanthomonas axonopodis pv. begoniae',
    xcitri: 'Xanthomonas citri', xdieffenbachieae: 'Xanthomonas axonopodis pv. dieffenbachiae',
    xmalvacearum: 'Xanthomonas citri pv. malvacearum', xphaseoli: 'Xanthomonas phaseoli',
    xvitians: 'Xanthomonas hortorum pv. vitians', xcampestris: 'Xanthomonas campestris',
    xpassiflorae: 'Xanthomonas axonopodis pv. passiflorae', xviticola: 'Xanthomonas citri pv. viticola',
    xfragarie: 'Xanthomonas fragariae', xmelonis: 'Xanthomonas melonis',
    xcerealis: 'Xanthomonas translucens pv. cerealis', xsecalis: 'Xanthomonas translucens pv. secalis'
  };
  // These abbreviations do not establish a unique modern taxon.
  const uncertain = { pwoodsi: 'P. woodsi (identificação a conferir)', xvesicatoria: 'Xanthomonas vesicatoria (identificação a conferir)' };
  const hostAliases = {
    cafe: ['cafeeiro', 'coffea arabica'], batata: ['batatinha', 'solanum tuberosum'], tomate: ['tomateiro', 'solanum lycopersicum'],
    goiaba: ['goiabeira'], mamao: ['mamoeiro'], manga: ['mangueira'], uva: ['videira'],
    rosa: ['roseira'], melao: ['meloeiro'], laranja: ['laranjeira', 'laranja doce'],
    maracuja: ['maracujazeiro'], morango: ['morangueiro'], pimenta: ['pimenteira'],
    mandioquinha: ['mandioquinha salsa'], salsao: ['aipo salsao', 'aipo', 'salsao'],
    rabano: ['rabanete'], aster: ['aster'], cristadegalo: ['crista de galo'], couve: ['couve manteiga'],
    couveflor: ['couve flor'], comigo: ['comigo ninguem pode']
  };
  const entries = [];
  const seen = new Set();
  const keyCache = new Map();
  const hostCache = new Map();
  const resultCache = new Map();
  let hostArray;
  for (const [originalTaxon, hosts] of Object.entries(window.PHOTO_DATABASE || {})) {
    for (const [originalHost, photos] of Object.entries(hosts)) {
      for (const photo of photos) {
        if (seen.has(photo.foto)) continue;
        seen.add(photo.foto);
        const parts = photo.foto.replace(/\.[^.]+$/, '').split('_');
        const token = normalize(parts[1]);
        const taxon = taxa[token] || uncertain[token] || originalTaxon;
        const review = Boolean(uncertain[token] || !taxa[token]);
        const level = review ? 'review' : taxon.split(' ').length === 1 ? 'genus' : 'taxon';
        entries.push({ ...photo, taxon, level, review, originalTaxon, originalHost, crop: normalize(parts[0]), token });
      }
    }
  }
  function resolveHost(host) {
    if (typeof host === 'object') return host;
    if (hostArray !== DATABASE.hosts) { hostArray = DATABASE.hosts; hostCache.clear(); resultCache.clear(); }
    if (!hostCache.has(host)) {
      const name = normalize(host);
      hostCache.set(host,DATABASE.hosts.find(h => normalize(h.nome_cientifico) === name) || DATABASE.hosts.find(h => normalize(h.nome_comum) === name));
    }
    return hostCache.get(host);
  }
  function hostMatches(photo, host) {
    const target = resolveHost(host);
    if (!target) return false;
    const scientific = normalize(target.nome_cientifico);
    // The historical cafe set is not evidence for every species of Coffea.
    if (photo.crop === 'cafe') return scientific === 'coffea arabica';
    const names = [target.nome_comum, target.nome_cientifico, ...(target.nomes_populares || [])].map(normalize);
    const allowed = [normalize(photo.originalHost), photo.crop, ...(hostAliases[photo.crop] || [])];
    return names.some(name => allowed.includes(name));
  }
  function key(name) {
    if (keyCache.has(name)) return keyCache.get(name);
    let clean = String(name).replace(/<[^>]*>/g, '').replace(/\(syn\..*$/i, '').trim();
    const update = Object.entries(taxonomyUpdates).find(([old]) => normalize(old) === normalize(clean));
    const result = normalize(update ? update[1] : clean);
    keyCache.set(name,result);
    return result;
  }
  const byTaxon = new Map();
  for(const photo of entries) {
    const taxon = key(photo.taxon);
    if(!byTaxon.has(taxon)) byTaxon.set(taxon,[]);
    byTaxon.get(taxon).push(photo);
  }
  function find(taxon,host) {
    const target = resolveHost(host); if(!target) return [];
    const normalized = key(taxon), cacheKey = `${normalized}\0${target.nome_cientifico}`;
    if(!resultCache.has(cacheKey)) resultCache.set(cacheKey,(byTaxon.get(normalized) || []).filter(p => !p.review && hostMatches(p,target)));
    return resultCache.get(cacheKey);
  }
  return {
    entries, normalize, key, hostMatches,
    find,
    contextual: host => entries.filter(p => hostMatches(p, host)),
    unassigned: host => entries.filter(p => hostMatches(p, host) && (p.level !== 'taxon' || !host.patogenos.some(b => key(b.bacteria) === key(p.taxon)))),
    audit: () => entries.map(({ foto, originalHost, originalTaxon, taxon, level, review }) => ({ foto, originalHost, originalTaxon, taxon, level, review }))
  };
})();
