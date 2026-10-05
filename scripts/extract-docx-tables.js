const fs = require('fs');
const path = require('path');

const xmlPath = process.argv[2];
const outDir = process.argv[3] || path.dirname(xmlPath);

if (!xmlPath) {
  console.error('Usage: node scripts/extract-docx-tables.js <document.xml> [outDir]');
  process.exit(1);
}

const xml = fs.readFileSync(xmlPath, 'utf8');

function decodeXml(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function textFromCell(cellXml) {
  const paras = [...cellXml.matchAll(/<w:p(?:\s|>)[\s\S]*?<\/w:p>/g)].map(match => match[0]);
  return paras
    .map(para =>
      [...para.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map(match => decodeXml(match[1]))
        .join('')
    )
    .join(' ')
    .trim()
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ');
}

const tables = [...xml.matchAll(/<w:tbl(?:\s|>)[\s\S]*?<\/w:tbl>/g)].map(match => match[0]);

tables.forEach((tableXml, tableIndex) => {
  const rows = [...tableXml.matchAll(/<w:tr(?:\s|>)[\s\S]*?<\/w:tr>/g)].map(match => match[0]);
  const lines = rows.map(rowXml => {
    const cells = [...rowXml.matchAll(/<w:tc(?:\s|>)[\s\S]*?<\/w:tc>/g)].map(match => match[0]);
    return cells.map(textFromCell).join('\t');
  });
  fs.writeFileSync(path.join(outDir, `table${tableIndex}.utf8.tsv`), lines.join('\n'), 'utf8');
});

console.log(tables.map((tableXml, index) => {
  const rowCount = [...tableXml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)].length;
  return `table${index}: ${rowCount} rows`;
}).join('\n'));
