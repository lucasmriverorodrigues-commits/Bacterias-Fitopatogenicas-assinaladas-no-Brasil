const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const dist = path.join(root,'dist');
const vendor = path.join(root,'assets','vendor');
fs.mkdirSync(vendor,{recursive:true});
const vendorFiles = [
  ['leaflet/dist/leaflet.js','leaflet.js'],['leaflet/dist/leaflet.css','leaflet.css'],
  ['leaflet/LICENSE','leaflet-LICENSE.txt'],['lucide/dist/umd/lucide.js','lucide.js'],['lucide/LICENSE','lucide-LICENSE.txt']
];
for (const [source,target] of vendorFiles) fs.copyFileSync(path.join(root,'node_modules',source),path.join(vendor,target));
fs.cpSync(path.join(root,'node_modules/leaflet/dist/images'),path.join(vendor,'images'),{recursive:true});
const core = ['index.html','manifest.json','icon-192.png.png','icon-512.png.png',
  'assets/interface.css','assets/app.js','assets/data.js','assets/catalog.js','assets/experience.js','assets/photoDatabase.js',
  'assets/brasil-estados.geojson','assets/vendor/leaflet.js','assets/vendor/leaflet.css','assets/vendor/lucide.js',
  'assets/fotos/cafe_pgarcae_foliar_01.jpg','assets/fotos/tomate_ptomato_foliar_01.jpg',
  'assets/fotos/batata_streptomyces_tuberculo_01.JPG','assets/fotos/feijao_ptabaci_foliar_01.jpg',
  ...fs.readdirSync(path.join(vendor,'images')).map(file=>`assets/vendor/images/${file}`)];
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/photoDatabase.js'),'utf8'),context);
const photos=[...new Set(Object.values(context.window.PHOTO_DATABASE).flatMap(hosts=>Object.values(hosts).flatMap(items=>items.map(p=>`assets/fotos/${p.foto}`))))].sort();
for (const file of [...core,...photos]) {
  if(!fs.existsSync(path.join(root,file))) throw new Error(`Missing asset: ${file}`);
  if(fs.statSync(path.join(root,file)).size > 25*1024*1024) throw new Error(`Cloudflare asset too large: ${file}`);
}
const hash=crypto.createHash('sha256');
for(const file of [...core,...photos]) { hash.update(file); hash.update(fs.readFileSync(path.join(root,file))); }
const build=`v5.0.0-${hash.digest('hex').slice(0,12)}`;
fs.writeFileSync(path.join(root,'assets/cache-manifest.js'),`self.APP_BUILD=${JSON.stringify(build)};\nself.CORE_FILES=${JSON.stringify(core)};\nself.PHOTO_FILES=${JSON.stringify(photos)};\n`);
// This exact workspace-owned output directory is the only cleanup target.
if (path.dirname(dist) !== root || path.basename(dist) !== 'dist') throw new Error('Invalid output directory');
if(fs.existsSync(dist) && fs.lstatSync(dist).isSymbolicLink()) throw new Error('Output cannot be a symbolic link');
fs.rmSync(dist,{recursive:true,force:true}); fs.mkdirSync(dist);
for(const file of [...core,...photos,'sw.js','assets/cache-manifest.js','_headers']) {
  const dest=path.join(dist,file); fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.copyFileSync(path.join(root,file),dest);
}
for(const [,file] of vendorFiles.filter(([,name])=>name.endsWith('.txt'))) fs.copyFileSync(path.join(vendor,file),path.join(dist,'assets/vendor',file));
console.log(`Build ${build}: ${core.length} core files, ${photos.length} photos. Output: dist/`);
