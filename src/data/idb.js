// Stockage local (IndexedDB). Un enregistrement par fichier du dépôt :
// { path, data, base, sha, dirty, rev }
//   data  = contenu courant dans l'app
//   base  = dernier contenu connu du dépôt (sert à la fusion en cas de conflit)
//   sha   = sha git de "base" (null si le fichier n'existe pas encore dans le dépôt)
//   dirty = modif locale pas encore poussée
const DB_NAME = "sillon";
const VERSION = 1;

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

export function openStore(idb = globalThis.indexedDB, name = DB_NAME) {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((resolve, reject) => {
    const o = idb.open(name, VERSION);
    o.onupgradeneeded = () => {
      const d = o.result;
      if (!d.objectStoreNames.contains("files")) d.createObjectStore("files", { keyPath: "path" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
    };
    o.onsuccess = () => resolve(o.result);
    o.onerror = () => reject(o.error);
  }));
  const write = async (store, fn) => {
    const d = await db();
    const t = d.transaction(store, "readwrite");
    fn(t.objectStore(store));
    await new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); });
  };
  return {
    async getAll() { const d = await db(); return req(d.transaction("files").objectStore("files").getAll()); },
    put(rec) { return write("files", s => s.put(rec)); },
    del(path) { return write("files", s => s.delete(path)); },
    async getMeta(k) { const d = await db(); return req(d.transaction("meta").objectStore("meta").get(k)); },
    setMeta(k, v) { return write("meta", s => s.put(v, k)); },
    async clear() { await write("files", s => s.clear()); await write("meta", s => s.clear()); },
  };
}

// Variante en mémoire (tests, ou navigateur sans IndexedDB).
export function memoryStore() {
  const files = new Map(), meta = new Map();
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  return {
    async getAll() { return [...files.values()].map(clone); },
    async put(rec) { files.set(rec.path, clone(rec)); },
    async del(path) { files.delete(path); },
    async getMeta(k) { return clone(meta.get(k)); },
    async setMeta(k, v) { meta.set(k, clone(v)); },
    async clear() { files.clear(); meta.clear(); },
    _files: files,
  };
}
