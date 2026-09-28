/**
 * TermChat — Service Worker v2.3.0
 * Network-First strategy with Offline Cache & Background Workspace Syncing.
 */
const CACHE_NAME = "termchat-static-v2.3.0";
const VFS_CACHE_NAME = "termchat-vfs-v2.3.0";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./css/style.css",
  "./manifest.json",
  "./firebase-applet-config.json",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./js/icons.js",
  "./js/auth.js",
  "./js/firebase-db.js",
  "./js/devices.js",
  "./js/integrations.js",
  "./js/vfs.js",
  "./js/editor.js",
  "./js/terminal.js",
  "./js/git.js",
  "./js/agents.js",
  "./js/gmaps.js",
  "./js/gworkspace.js",
  "./js/cloudsql.js",
  "./js/voice.js",
  "./js/logs.js",
  "./js/app.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("[ServiceWorker] Caching warning on install:", err);
      });
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME && k !== VFS_CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Never cache API endpoints or Auth requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  // Network-First with Cache Fallback for IDE code & static assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline: Recurso indisponível no momento.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
  );
});

// Background Sync Event: Fire when connection returns
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-workspace-data") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "EVENT_ONLINE_SYNC" });
        });
      })
    );
  }
});

// PostMessage Communications with client
self.addEventListener("message", (event) => {
  if (!event.data) return;

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (event.data.type === "TRIGGER_SYNC") {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: "EVENT_ONLINE_SYNC" });
      });
    });
  } else if (event.data.type === "CACHE_VFS_FILE") {
    const { path, content } = event.data;
    if (path && content) {
      caches.open(VFS_CACHE_NAME).then((cache) => {
        const dummyUrl = new URL(`/vfs/${path}`, self.location.origin);
        const response = new Response(content, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
        cache.put(dummyUrl, response);
      });
    }
  }
});
