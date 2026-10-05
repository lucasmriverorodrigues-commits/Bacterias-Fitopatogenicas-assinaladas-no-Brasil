const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function redirectingHost() {
  const root = path.resolve(__dirname, '../dist');
  const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json', '.png': 'image/png', '.jpg': 'image/jpeg'};
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/index.html') {
      response.writeHead(302, {Location: '/'});
      response.end();
      return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(response);
  });
}

(async () => {
  const server = process.env.APP_URL ? null : redirectingHost();
  if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.env.APP_URL || `http://127.0.0.1:${server.address().port}`;
  console.log(`Offline check: ${url}`);
  let browser;
  try {
    browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') console.log('Browser:', message.text());
    });
    await page.goto(url, {waitUntil: 'networkidle'});
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    const cacheState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cachesFound = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith('fitobacterias-')) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (request.url !== registration.scope && !new URL(request.url).pathname.endsWith('index.html')) continue;
          const response = await cache.match(request);
          cachesFound.push({name, request: request.url, status: response.status, redirected: response.redirected, responseUrl: response.url});
        }
      }
      return {scope: registration.scope, controller: navigator.serviceWorker.controller.scriptURL, html: cachesFound};
    });
    console.log(JSON.stringify(cacheState, null, 2));
    assert(cacheState.html.some(entry => !entry.redirected), 'The cached home page must not be a redirected response');
    await context.setOffline(true);
    await page.reload({waitUntil: 'load'});
    await page.waitForFunction(() => document.querySelectorAll('#featuredCrops .crop-card').length === 4);
    await page.fill('#smartSearch', 'batata');
    await page.waitForFunction(() => document.getElementById('smartSearchResults').textContent.includes('Solanum tuberosum'));
    assert(await page.locator('.brand').isVisible());
    console.log('Offline reload and potato search passed.');
  } finally {
    if (browser) await browser.close();
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
