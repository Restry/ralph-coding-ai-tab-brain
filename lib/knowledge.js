// Tab Brain - Knowledge Base Module
// IndexedDB-backed storage for tab activity entries

const DB_NAME = 'TabBrainDB';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        store.createIndex('domain', 'domain', { unique: false });
        store.createIndex('lastSeen', 'lastSeen', { unique: false });
        store.createIndex('archived', 'archived', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(new Error(`IndexedDB open failed: ${event.target.error}`));
  });
}

/**
 * Save a new entry to the knowledge base. If url already exists, it will be overwritten.
 * @param {Object} entry - {url, title, domain, favIconUrl, firstSeen, lastSeen, totalFocusTime, category, archived}
 * @returns {Promise<void>}
 */
export async function saveEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (event) => { db.close(); reject(new Error(`saveEntry failed: ${event.target.error}`)); };
  });
}

/**
 * Get a single entry by URL.
 * @param {string} url
 * @returns {Promise<Object|undefined>}
 */
export async function getEntry(url) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(url);
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = (event) => { db.close(); reject(new Error(`getEntry failed: ${event.target.error}`)); };
  });
}

/**
 * Update specific fields of an existing entry by URL.
 * @param {string} url
 * @param {Object} updates - partial fields to merge
 * @returns {Promise<void>}
 */
export async function updateEntry(url, updates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(url);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        db.close();
        resolve(); // Nothing to update
        return;
      }
      const updated = { ...existing, ...updates };
      store.put(updated);
    };

    getReq.onerror = (event) => { db.close(); reject(new Error(`updateEntry get failed: ${event.target.error}`)); };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (event) => { db.close(); reject(new Error(`updateEntry failed: ${event.target.error}`)); };
  });
}

/**
 * Get all entries from the knowledge base.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = (event) => { db.close(); reject(new Error(`getAllEntries failed: ${event.target.error}`)); };
  });
}

/**
 * Search entries by substring match on title, url, and domain.
 * @param {string} query - search string
 * @returns {Promise<Array<Object>>}
 */
export async function searchEntries(query) {
  const all = await getAllEntries();
  const lowerQuery = query.toLowerCase();
  return all
    .filter(entry =>
      (entry.title && entry.title.toLowerCase().includes(lowerQuery)) ||
      (entry.url && entry.url.toLowerCase().includes(lowerQuery)) ||
      (entry.domain && entry.domain.toLowerCase().includes(lowerQuery))
    )
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

/**
 * Delete entries older than maxAgeDays (based on lastSeen).
 * @param {number} maxAgeDays
 * @returns {Promise<number>} - count of pruned entries
 */
export async function pruneOldEntries(maxAgeDays) {
  const db = await openDB();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('lastSeen');
    const range = IDBKeyRange.upperBound(cutoff);
    const request = index.openCursor(range);
    let pruned = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        pruned++;
        cursor.continue();
      }
    };

    request.onerror = (event) => { db.close(); reject(new Error(`pruneOldEntries failed: ${event.target.error}`)); };
    tx.oncomplete = () => { db.close(); resolve(pruned); };
    tx.onerror = (event) => { db.close(); reject(new Error(`pruneOldEntries tx failed: ${event.target.error}`)); };
  });
}
