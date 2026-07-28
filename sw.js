const SHARED_PHOTO_DB = 'your-knowledge-shared-photos';
const SHARED_PHOTO_STORE = 'incoming';

function openSharedPhotoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARED_PHOTO_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHARED_PHOTO_STORE)) {
        request.result.createObjectStore(SHARED_PHOTO_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function storeSharedPhotos(files) {
  const db = await openSharedPhotoDb();
  const transaction = db.transaction(SHARED_PHOTO_STORE, 'readwrite');
  const store = transaction.objectStore(SHARED_PHOTO_STORE);
  files.slice(0, 120).forEach((file, index) => {
    store.put({
      id: `${Date.now()}-${index}-${crypto.randomUUID()}`,
      name: file.name || `shared-${index + 1}.jpg`,
      type: file.type || 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
      blob: file
    });
  });
  await transactionDone(transaction);
  db.close();
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;
  event.respondWith((async () => {
    try {
      const formData = await event.request.formData();
      const files = formData.getAll('photos').filter(value =>
        value instanceof File && value.type.startsWith('image/')
      );
      await storeSharedPhotos(files);
      return Response.redirect(new URL(`index.html?shared=${files.length}`, self.registration.scope).toString(), 303);
    } catch {
      return Response.redirect(new URL('index.html?shared=error', self.registration.scope).toString(), 303);
    }
  })());
});
