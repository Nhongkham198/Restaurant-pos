
// Firebase Messaging Service Worker (This part remains the same)
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCVLo7EeWsDSR1tWmucYuZq7uOuV8zvqXI",
  authDomain: "restaurant-pos-f8bd4.firebaseapp.com",
  projectId: "restaurant-pos-f8bd4",
  storageBucket: "restaurant-pos-f8bd4.firebasestorage.app",
  messagingSenderId: "822986056017",
  appId: "1:822986056017:web:a1955349d8d94adcda3370",
  measurementId: "G-2B6ZS4VYMF"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[sw.js] Received background message ', payload);
  const notificationTitle = payload.data?.title || 'มีออเดอร์ใหม่!';
  const notificationOptions = {
    body: payload.data?.body || 'มีรายการอาหารใหม่ส่งเข้าครัว',
    icon: payload.data?.icon || '/icon.svg',
    sound: payload.data?.sound,
    vibrate: payload.data?.vibrate ? JSON.parse(payload.data.vibrate) : [200, 100, 200]
  };
  return self.registration.showNotification(notificationTitle, notificationOptions);
});


// --- ADVANCED CACHING SERVICE WORKER ---

// Define cache names for better management
const STATIC_CACHE_NAME = 'restaurant-pos-static-v5'; // For app shell files
const IMAGE_CACHE_NAME = 'restaurant-pos-images-v1';  // Dedicated cache for images

// List of core app files to cache on install
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  // Note: External resources from CDNs are cached via the fetch handler, not pre-cached here.
];

// --- INSTALL EVENT ---
// Pre-cache the essential app shell files.
self.addEventListener('install', event => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('[SW] Failed to pre-cache app shell:', error);
      })
  );
});

// --- ACTIVATE EVENT ---
// Clean up old caches to save space and ensure new versions are used.
self.addEventListener('activate', event => {
  console.log('[SW] Activate event');
  const cacheWhitelist = [STATIC_CACHE_NAME, IMAGE_CACHE_NAME]; // Keep both current caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// --- FETCH EVENT ---
// This is the core logic that intercepts network requests.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignore non-GET requests and Firestore calls
  if (event.request.method !== 'GET' || url.hostname.includes('firestore.googleapis.com')) {
    return; // Let the browser handle it
  }

  // --- Image Caching Strategy: Cache First, then Network Fallback ---
  // This strategy makes images load instantly after the first time.
  const isImageRequest = /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(url.pathname);

  if (isImageRequest) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
        // IMPORTANT: Ignore search parameters (like ?retry=1) when looking in cache.
        const cacheKey = event.request.url.split('?')[0];
        const cachedResponse = await cache.match(cacheKey);
        
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network
        try {
          const fetchResponse = await fetch(event.request);
          // Check for a valid response
          if (fetchResponse.ok) {
            // Put a copy in the image cache for next time, using the URL without query params as the key.
            cache.put(cacheKey, fetchResponse.clone());
          }
          return fetchResponse;
        } catch (error) {
          console.error(`[SW] Failed to fetch image: ${event.request.url}`, error);
          // Optional: return a placeholder image on failure
          // return caches.match('/placeholder-image.svg');
        }
      })
    );
    return; // End execution for image requests
  }

  // --- App Shell & Other Requests Strategy: Stale-While-Revalidate ---
  // This strategy provides a fast "offline-first" experience for the app itself.
  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      // Fetch in the background to get the latest version for the next visit.
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(error => {
        console.error(`[SW] Fetch failed for ${event.request.url}`, error);
        // Do not return anything here, rely on cached response if it exists.
      });

      // Return cached response immediately if available, otherwise wait for the network.
      return cachedResponse || fetchPromise;
    })
  );
});
