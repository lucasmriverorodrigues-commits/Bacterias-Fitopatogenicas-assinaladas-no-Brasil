const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const vm=require('node:vm');
const c={window:{}};
vm.runInNewContext(fs.readFileSync('assets/photoDatabase.js','utf8'),c);
const photos=[...new Set(Object.values(c.window.PHOTO_DATABASE).flatMap(h=>Object.values(h).flatMap(ps=>ps.map(p=>p.foto))))];
(async()=>{
 const report=[];
 for(const file of photos) {
  const meta=await sharp(path.join('assets/fotos',file)).metadata();
  if(meta.width<32 || meta.height<32) throw new Error(`Placeholder or invalid photo: ${file}`);
  report.push({file,width:meta.width,height:meta.height,format:meta.format});
 }
 fs.writeFileSync('reports/photo-files-v5.json',JSON.stringify(report,null,2));
 console.log(`${report.length} valid photograph files; no tiny placeholders.`);
})().catch(error=>{console.error(error);process.exitCode=1});
