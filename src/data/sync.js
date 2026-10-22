import { stableStringify, deepEqual } from "../lib/json.js";
import { merge3 } from "./merge.js";

// Fichiers du dépôt suivis par l'app.
export const TRACKED = /^data\/(ratings|sessions|requests)\/[^/]+\.json$|^data\/meta\/tags\.json$/;

const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

function commitMessage(path) {
  const m = path.match(/^data\/(\w+)\/(.+)\.json$/);
  if (!m) return "Sillon : " + path;
  const kind = { ratings: "titre", sessions: "composition", meta: "mots-clés", requests: "demande" }[m[1]] || m[1];
  return "Sillon (app) : " + kind + " " + m[2];
}

/*
  Moteur de synchronisation IndexedDB <-> dépôt GitHub.
  - set() écrit tout de suite en local, puis pousse après `debounceMs` sans nouvelle modif.
  - Les écritures partent une par une, avec le sha attendu. Conflit : relecture, fusion champ par champ, nouvel essai.
  - pull() lit l'arbre du dépôt avec ETag (304 = rien à faire) et ne télécharge que les fichiers dont le sha a changé.
  - Toutes les opérations réseau passent par une seule file : jamais de lecture pendant une écriture.
*/
export function createSync({ api, store, debounceMs = 3000, hasToken = () => true, timers = globalThis, log = () => {} }) {
  const files = new Map();
  const listeners = new Set();
  const recentWrites = new Map(); // path -> sha remplacé par notre écriture (ignore un arbre en retard)
  let state = { status: "loading", message: "", pending: 0, lastSync: null };
  let chain = Promise.resolve();
  let flushTimer = null, retryTimer = null;
  let ready = false;

  const pendingCount = () => [...files.values()].filter(r => r.dirty).length;
  const emit = () => { const s = { ...state, pending: pendingCount() }; state = s; listeners.forEach(fn => { try { fn(s); } catch (e) { log(e); } }); };
  const setStatus = (status, message = "") => { state = { ...state, status, message }; emit(); };
  const settle = () => {
    if (!hasToken()) return setStatus("notoken");
    setStatus(pendingCount() ? "pending" : "synced");
  };
  const fail = e => {
    log(e);
    const kind = e && e.kind;
    if (kind === "offline") setStatus("offline");
    else if (kind === "token") setStatus(hasToken() ? "token" : "notoken", e.message);
    else if (kind === "rate") setStatus("error", "Quota GitHub atteint, nouvel essai plus tard");
    else setStatus("error", (e && e.message) || "Erreur");
    timers.clearTimeout(retryTimer);
    if (kind !== "token") retryTimer = timers.setTimeout(() => flush(), 30000);
  };
  const enqueue = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
  const save = rec => store.put(rec);

  async function init() {
    const all = await store.getAll();
    all.forEach(r => files.set(r.path, r));
    ready = true;
    state = { ...state, lastSync: (await store.getMeta("lastSync")) || null };
    settle();
  }

  function get(path) { const r = files.get(path); return r ? r.data : undefined; }
  function list(prefix) { return [...files.values()].filter(r => r.path.startsWith(prefix) && r.data !== undefined); }

  function set(path, data) {
    const rec = files.get(path) || { path, base: null, sha: null, rev: 0 };
    if (rec.data !== undefined && deepEqual(rec.data, data)) return;
    const next = { ...rec, data: clone(data), dirty: true, rev: (rec.rev || 0) + 1 };
    files.set(path, next);
    save(next).catch(log);
    if (state.status === "synced") state = { ...state, status: "pending" };
    emit();
    schedule();
  }

  function schedule(delay = debounceMs) {
    timers.clearTimeout(flushTimer);
    flushTimer = timers.setTimeout(() => flush(), delay);
  }

  async function pushOne(path) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const rec = files.get(path);
      if (!rec || !rec.dirty) return;
      const rev = rec.rev;
      const text = stableStringify(rec.data);
      const written = JSON.parse(text);
      try {
        const newSha = await api.putFile(path, text, rec.sha, commitMessage(path));
        if (rec.sha) recentWrites.set(path, rec.sha);
        const cur = files.get(path);
        const done = { ...cur, base: written, sha: newSha, dirty: cur.rev !== rev };
        files.set(path, done);
        await save(done);
        emit();
        return;
      } catch (e) {
        if (e.kind !== "conflict") throw e;
        // Le fichier a changé côté dépôt : on relit, on fusionne, on réessaie.
        const remote = await api.getFile(path);
        const cur = files.get(path);
        if (!remote) { const n = { ...cur, sha: null }; files.set(path, n); await save(n); continue; }
        const rdata = JSON.parse(remote.text);
        const merged = merge3(cur.base, cur.data, rdata);
        const n = { ...cur, data: merged, base: rdata, sha: remote.sha };
        files.set(path, n);
        await save(n);
        emit();
      }
    }
    throw Object.assign(new Error("Conflit persistant sur " + path), { kind: "http" });
  }

  function flush() {
    timers.clearTimeout(flushTimer);
    if (!hasToken()) { settle(); return Promise.resolve(); }
    return enqueue(async () => {
      try {
        for (const rec of [...files.values()]) if (rec.dirty) await pushOne(rec.path);
        settle();
      } catch (e) { fail(e); }
    });
  }

  function pull() {
    if (!hasToken()) { settle(); return Promise.resolve(); }
    if (["notoken", "token", "error", "offline"].includes(state.status)) setStatus("loading");
    return enqueue(async () => {
      try {
        const etag = await store.getMeta("treeEtag");
        const tree = await api.getTree(etag);
        if (!tree.notModified) {
          const remote = new Map(tree.files.filter(f => TRACKED.test(f.path)).map(f => [f.path, f.sha]));
          const todo = [...remote].filter(([p, sha]) => { const r = files.get(p); return !r || (r.sha !== sha && recentWrites.get(p) !== sha); });
          for (let i = 0; i < todo.length; i += 8) {
            const part = todo.slice(i, i + 8);
            const texts = await Promise.all(part.map(([, sha]) => api.getBlob(sha)));
            for (let j = 0; j < part.length; j++) {
              const [p, sha] = part[j];
              let rdata;
              try { rdata = JSON.parse(texts[j]); } catch (e) { log("JSON invalide : " + p); continue; }
              const cur = files.get(p);
              let n;
              if (!cur) n = { path: p, data: rdata, base: rdata, sha, dirty: false, rev: 0 };
              else if (!cur.dirty) n = { ...cur, data: rdata, base: rdata, sha };
              else n = { ...cur, data: merge3(cur.base, cur.data, rdata), base: rdata, sha };
              files.set(p, n);
              await save(n);
            }
            if (todo.length > 8) emit();
          }
          // Fichiers supprimés du dépôt
          for (const rec of [...files.values()]) {
            if (remote.has(rec.path) || !rec.sha) continue;
            if (recentWrites.has(rec.path)) continue;
            if (rec.dirty) { const n = { ...rec, sha: null, base: null }; files.set(rec.path, n); await save(n); }
            else { files.delete(rec.path); await store.del(rec.path); }
          }
          recentWrites.clear();
          await store.setMeta("treeEtag", tree.etag);
        }
        const now = new Date().toISOString();
        await store.setMeta("lastSync", now);
        state = { ...state, lastSync: now };
        // Modifs locales en attente (ex. faites hors ligne) : on les pousse maintenant.
        for (const rec of [...files.values()]) if (rec.dirty) await pushOne(rec.path);
        settle();
      } catch (e) { fail(e); }
    });
  }

  // Mise en route : sync au démarrage, toutes les `intervalMs`, au retour du réseau et quand l'onglet revient au premier plan.
  function start({ intervalMs = 60000, win = globalThis.window } = {}) {
    pull();
    const iv = timers.setInterval(() => { if (!win || !win.navigator || win.navigator.onLine !== false) pull(); }, intervalMs);
    const onOnline = () => pull();
    const onOffline = () => setStatus("offline");
    const onVisible = () => { if (win.document.visibilityState === "visible") pull(); };
    if (win && win.addEventListener) {
      win.addEventListener("online", onOnline);
      win.addEventListener("offline", onOffline);
      if (win.document) win.document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      timers.clearInterval(iv);
      if (win && win.removeEventListener) {
        win.removeEventListener("online", onOnline);
        win.removeEventListener("offline", onOffline);
        if (win.document) win.document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }

  return {
    init, get, list, set, flush, pull, start, settle,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get state() { return { ...state, pending: pendingCount() }; },
    get ready() { return ready; },
    _files: files,
  };
}
