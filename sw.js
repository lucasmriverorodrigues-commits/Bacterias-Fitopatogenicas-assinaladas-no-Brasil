importScripts('assets/cache-manifest.js');
const CACHE_PREFIX = 'fitobacterias-';
const CACHE_NAME = `${CACHE_PREFIX}${self.APP_BUILD}`;
const BASE = self.registration.scope;
// Cache the canonical home URL: static hosts may redirect index.html.
const url = path => new URL(path === 'index.html' ? './' : path, BASE).href;
const coreFiles = self.CORE_FILES.map(url);
const photoFiles = self.PHOTO_FILES.map(url);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(coreFiles)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    await Promise.all(old.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Keep HTML and scripts from one release together, including when offline.
    if (event.request.mode === 'navigate') {
      return await cache.match(url('index.html')) || fetch(event.request);
    }
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && photoFiles.includes(event.request.url)) await cache.put(event.request, response.clone());
      return response;
    } catch { return new Response('Recurso indisponivel offline', {status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}}); }
  })());
});

async function status() {
  const cache = await caches.open(CACHE_NAME);
  const keys = new Set((await cache.keys()).map(request => request.url));
  return {core:coreFiles.every(file => keys.has(file)),cached:photoFiles.filter(file => keys.has(file)).length,total:photoFiles.length};
}
let downloading;
self.addEventListener('message', event => {
  const port = event.ports[0]; if (!port) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'DOWNLOAD_PHOTOS') {
        if (!downloading) {
          downloading = (async () => {
            const cache = await caches.open(CACHE_NAME);
            let index = 0, cached = (await status()).cached;
            const workers = Array.from({length:4}, async () => {
              while (index < photoFiles.length) {
                const file = photoFiles[index++];
                if (await cache.match(file)) continue;
                try {
                  const response = await fetch(file);
                  if (response.ok && response.headers.get('Content-Type')?.startsWith('image/')) {
                    await cache.put(file,response); cached++;
                  }
                } catch { /* A retry resumes from photos already saved. */ }
                port.postMessage({progress:true,cached,total:photoFiles.length});
              }
            });
            await Promise.all(workers);
          })().finally(() => { downloading = null; });
        }
        await downloading;
      }
      port.postMessage(await status());
    } catch (error) { port.postMessage({error:error.message}); }
  })());
});
