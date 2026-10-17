const CACHE_NAME = 'truckauto-najaf-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Só intercepta GET. Nunca deixa o service worker "envenenar" uma resposta
  // boa da rede: antes, um token {{SITE_*}} antigo podia voltar do cache mesmo
  // com o servidor ja servindo o valor certo.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(() => {
      // Offline: usa o cache apenas como ultimo recurso.
      return caches.match(event.request).then((r) => r || Response.error());
    })
  );
});
