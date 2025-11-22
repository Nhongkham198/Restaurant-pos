// Firebase Messaging Service Worker
// NOTE: These scripts are imported from the web, not locally.
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging.js');

// IMPORTANT: This config must match your project's firebaseConfig.
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

  const notificationTitle = payload.notification?.title || 'มีออเดอร์ใหม่!';
  const notificationOptions = {
    body: payload.notification?.body || 'มีรายการอาหารใหม่ส่งเข้าครัว',
    icon: '/icon.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});


// --- Original Caching Service Worker ---
const CACHE_NAME = 'restaurant-pos-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  'https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/heroicons/2.1.3/24/outline/heroicons.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0/'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request because it's a stream and can only be consumed once
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
              return response;
            }

            // Clone the response because it's also a stream
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // We don't cache POST requests or firebase calls
                if (event.request.method !== 'GET' || event.request.url.includes('firestore.googleapis.com')) {
                    return;
                }
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
    );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});