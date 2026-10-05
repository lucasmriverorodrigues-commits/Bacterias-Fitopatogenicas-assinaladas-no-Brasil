const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.resolve(__dirname,'..');
const context={console:{log(){}},localStorage:{getItem(){return null},setItem(){}},document:{addEventListener(){}},navigator:{},setTimeout,clearTimeout};
context.window=context;
vm.createContext(context);
for(const file of ['assets/photoDatabase.js','assets/data.js','assets/catalog.js','assets/app.js','assets/experience.js']) {
  const source=fs.readFileSync(path.join(root,file),'utf8');
  new vm.Script(source,{filename:file}); vm.runInContext(source,context,{filename:file});
}
vm.runInContext('globalThis.data=DATABASE;globalThis.catalog=PhotoCatalog;',context);
const {app,data,catalog}=context;
app.applyTaxonomyUpdates();app.applyHostTaxonomyUpdates();app.mergeEquivalentHosts();app.mergeEquivalentPathogens();app.mergeCoffeeHybrids();app.sortAllHostPathogens();
const counts={hosts:data.hosts.length,records:data.hosts.reduce((n,h)=>n+h.patogenos.length,0),regions:data.hosts.reduce((n,h)=>n+h.patogenos.reduce((s,p)=>s+p.regioes.length,0),0)};
assert.deepEqual(counts,{hosts:388,records:776,regions:1670});
assert.equal(catalog.entries.length,275);
assert.equal(new Set(catalog.entries.map(p=>p.foto)).size,275);
for(const photo of catalog.entries) {
  assert(fs.existsSync(path.join(root,'assets/fotos',photo.foto)),photo.foto);
  assert(!/[<>]/.test(photo.foto));
}
const photos=(name,host)=>app.findPhotosForBacteria(name,host);
assert.equal(photos('Pseudomonas coronafaciens pv. garcae','Coffea arabica').length,2);
assert.equal(photos('Pseudomonas coronafaciens pv. garcae','Solanum lycopersicum').length,0);
assert.equal(photos('Robbsia andropogonis','Coffea arabica').length,0,'Genus-only photo must not establish a species');
assert.equal(photos('Pseudomonas cichorii','Coffea eugenioides').length,0,'No photos borrowed from arabica');
assert.equal(photos('Xanthomonas cucurbitae','Cucumis melo').length,0,'Melonis photo must not be assigned to cucurbitae');
assert.equal(photos('Pseudomonas mediterranea','Solanum lycopersicum').length,1);
assert.equal(photos('Dickeya zeae','Zea mays').length,3);
assert.equal(photos('Streptomyces scabiei','Solanum tuberosum').length,0,'Genus-only photo remains a reference');
const arabica=data.hosts.find(h=>h.nome_cientifico==='Coffea arabica');
assert(catalog.unassigned(arabica).some(p=>p.taxon==='Robbsia'));
assert.deepEqual(Array.from(arabica.patogenos.find(p=>p.bacteria==='Pseudomonas amygdali pv. tabaci').regioes).sort(),['MG','PR','SP']);
const batata=app.collectSearchResults('batata');
assert(batata.some(r=>r.type==='culture' && data.hosts[r.hostIdx].nome_cientifico==='Solanum tuberosum'));
assert(app.collectSearchResults('cafe arabica').some(r=>r.type==='culture' && data.hosts[r.hostIdx].nome_cientifico==='Coffea arabica'));
assert(app.collectSearchResults('Burkholderia andropogonis').some(r=>r.title==='Robbsia andropogonis'));
assert(app.collectSearchResults('São Paulo').some(r=>r.type==='state' && r.state==='SP'));
for(const occurrence of app.getBacteriaOccurrences('Pseudomonas syringae')) assert.equal(catalog.key(occurrence.pathogen.bacteria),catalog.key('Pseudomonas syringae'));
for(const host of data.hosts) {
  const allocations=new Map();
  for(const pathogen of host.patogenos) {
    for(const photo of photos(pathogen.bacteria,host.nome_cientifico)) {
      const previous=allocations.get(photo.foto);
      assert(!previous || previous===catalog.key(pathogen.bacteria),`Duplicate pathogen allocation: ${photo.foto}`);
      allocations.set(photo.foto,catalog.key(pathogen.bacteria));
      assert.equal(photo.level,'taxon',`Incomplete ID on pathogen button: ${photo.foto}`);
    }
  }
}
const boundaries=JSON.parse(fs.readFileSync(path.join(root,'assets/brasil-estados.geojson'),'utf8'));
assert.equal(new Set(boundaries.features.map(feature=>app.stateCode(feature))).size,27);
assert(boundaries.features.every(feature=>app.stateCode(feature)));
const offline={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/cache-manifest.js'),'utf8'),{self:offline});
for(const file of [...offline.CORE_FILES,...offline.PHOTO_FILES]) assert(fs.existsSync(path.join(root,'dist',file)),`Missing published asset: ${file}`);
assert(!offline.CORE_FILES.some(file=>file.startsWith('/')),'PWA must support subdirectories');
const audit={counts,photos:catalog.entries.length,review:catalog.entries.filter(p=>p.review).map(p=>({file:p.foto,label:p.taxon})),corrections:catalog.audit().filter(p=>p.taxon!==p.originalTaxon),unlinked:catalog.entries.filter(p=>!data.hosts.some(h=>catalog.hostMatches(p,h))).map(p=>({file:p.foto,host:p.originalHost,taxon:p.taxon})),verifiedAt:new Date().toISOString()};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/catalog-audit-v5.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify({status:'passed',...counts,photos:catalog.entries.length,review:audit.review.length,unlinked:audit.unlinked.length,checks:'names, exclusive photo allocation, all image files, searches, 27 state polygons, build assets'},null,2));
