import { stableStringify, deepEqual, gitBlobSha } from "../lib/json.js";
import { merge3 } from "./merge.js";

// Fichiers du dépôt suivis par l'app.
export const TRACKED = /^data\/(ratings|sessions|requests)\/[^/]+\.json$|^data\/meta\/(tags|genres)\.json$/;

const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const idOf = path => path.replace(/^.*\//, "").replace(/\.json$/, "");

/* ---- Message de commit : un résumé lisible du lot (aussi pour Claude) ---- */
const FIELD = { note: "note", comment: "commentaire", tags: "mots-clés", heart: "coup de cœur", offtopic: "hors sujet", moment: "moment fort", bpm: "tempo", fresh: "note sans l'usure", spUri: "lien Spotify", verified: "", spUrl: "", spAlbum: "", spMs: "" };
const IGNORE = new Set(["updatedAt", "ratedAt", "session"]);
function describe(rec) {
  const d = rec.data || {}, b = rec.base || {};
  const id = idOf(rec.path);
  if (rec.path.startsWith("data/ratings/")) {
    const name = (d.artist || "?") + " – " + (d.song || id);
    if (!rec.base) return { line: name + " : ajouté", short: name };
    const out = [];
    if (b.note !== d.note) out.push(d.note == null ? "note retirée" : "note " + (typeof b.note === "number" ? b.note + " → " : "") + d.note);
    Object.keys({ ...b, ...d }).forEach(k => {
      if (k === "note" || IGNORE.has(k) || deepEqual(b[k], d[k])) return;
      const label = k in FIELD ? FIELD[k] : k;
      if (label && !out.includes(label)) out.push(label);
    });
    return { line: name + (out.length ? " : " + out.join(", ") : ""), short: name + (b.note !== d.note && d.note != null ? " (" + d.note + ")" : "") };
  }
  if (rec.path.startsWith("data/sessions/")) return { line: "composition " + id + (rec.base ? "" : " : créée"), short: "composition " + id };
  if (rec.path.startsWith("data/requests/")) return { line: "demande Explorer " + id + (rec.base ? "" : " : envoyée"), short: "demande Explorer" };
  return { line: "mots-clés personnalisés", short: "mots-clés" };
}
export function commitMessage(recs) {
  const items = recs.map(describe);
  const tracks = recs.filter(r => r.path.startsWith("data/ratings/")).length;
  let title;
  if (recs.length === 1) title = items[0].short;
  else {
    const parts = [];
    if (tracks) parts.push(tracks + " titre" + (tracks > 1 ? "s" : ""));
    recs.forEach((r, i) => { if (!r.path.startsWith("data/ratings/") && !parts.includes(items[i].short)) parts.push(items[i].short); });
    title = parts.join(", ");
  }
  return "Sillon (app) : " + title + (recs.length > 1 || items[0].line !== items[0].short ? "\n\n" + items.map(i => "- " + i.line).join("\n") : "");
}

/*
  Moteur de synchronisation IndexedDB <-> dépôt GitHub.
  - set() écrit tout de suite en local (IndexedDB). Les modifs en attente partent ensemble, en UN commit :
    `debounceMs` après la dernière modif, au plus tard `maxWaitMs` après la première, ou tout de suite avec flush().
  - Avant d'écrire, l'app relit la tête de la branche : un fichier changé côté dépôt est fusionné champ par champ.
    Si la branche bouge pendant l'écriture (pas d'avance rapide), on relit et on recommence.
  - pull() lit l'arbre du dépôt avec ETag (304 = rien à faire) et ne télécharge que les fichiers dont le sha a changé.
  - Toutes les opérations réseau passent par une seule file : jamais de lecture pendant une écriture.
*/
export function createSync({ api, store, debounceMs = 15000, maxWaitMs = 120000, hasToken = () => true, timers = globalThis, now = () => Date.now(), log = () => {} }) {
  const files = new Map();
  const listeners = new Set();
  const recentWrites = new Map(); // path -> sha remplacé par notre commit (ignore un arbre en retard)
  let state = { status: "loading", message: "", pending: 0, lastSync: null };
  let chain = Promise.resolve();
  let flushTimer = null, retryTimer = null, firstDirtyAt = null;
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
    if (pendingCount()) schedule();
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

  // Prochain envoi : après `debounceMs` de calme, sans dépasser `maxWaitMs` depuis la première modif en attente.
  function schedule() {
    if (firstDirtyAt == null) firstDirtyAt = now();
    const delay = Math.max(0, Math.min(debounceMs, firstDirtyAt + maxWaitMs - now()));
    timers.clearTimeout(flushTimer);
    flushTimer = timers.setTimeout(() => flush(), delay);
  }

  // Envoie toutes les modifs en attente en un seul commit.
  async function pushAll() {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!pendingCount()) return;
      const head = await api.getHead();
      const remote = await api.getTreeMap(head.tree);
      // 1. Fusion avec ce qui a changé côté dépôt depuis notre dernière lecture
      for (const rec of [...files.values()].filter(r => r.dirty)) {
        const rsha = remote.get(rec.path);
        if (rsha && rsha !== rec.sha) {
          let rdata;
          try { rdata = JSON.parse(await api.getBlob(rsha)); } catch (e) { if (e && e.kind) throw e; continue; }
          const cur = files.get(rec.path);
          const n = { ...cur, data: merge3(cur.base, cur.data, rdata), base: rdata, sha: rsha };
          files.set(rec.path, n); await save(n); emit();
        } else if (!rsha && rec.sha) {
          const n = { ...files.get(rec.path), sha: null, base: null }; // supprimé côté dépôt : on le recrée
          files.set(rec.path, n); await save(n);
        }
      }
      // 2. Un commit pour tout le lot
      const batch = [...files.values()].filter(r => r.dirty).map(r => ({ path: r.path, rev: r.rev, text: stableStringify(r.data), rec: r }));
      try {
        await api.commitFiles(head, batch.map(b => ({ path: b.path, text: b.text })), commitMessage(batch.map(b => b.rec)));
      } catch (e) {
        if (e && e.kind === "conflict") continue; // la branche a bougé : on relit et on recommence
        throw e;
      }
      // 3. Le dépôt contient maintenant exactement ce qu'on a écrit
      for (const b of batch) {
        const sha = await gitBlobSha(b.text);
        const cur = files.get(b.path);
        if (cur.sha) recentWrites.set(b.path, cur.sha);
        const done = { ...cur, base: JSON.parse(b.text), sha, dirty: cur.rev !== b.rev };
        files.set(b.path, done); await save(done);
      }
      firstDirtyAt = pendingCount() ? now() : null;
      emit();
      return;
    }
    throw Object.assign(new Error("La branche change trop vite, nouvel essai plus tard"), { kind: "http" });
  }

  function flush() {
    timers.clearTimeout(flushTimer);
    if (!hasToken()) { settle(); return Promise.resolve(); }
    return enqueue(async () => {
      try { await pushAll(); settle(); } catch (e) { fail(e); }
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
            if (remote.has(rec.path) || !rec.sha || recentWrites.has(rec.path)) continue;
            if (rec.dirty) { const n = { ...rec, sha: null, base: null }; files.set(rec.path, n); await save(n); }
            else { files.delete(rec.path); await store.del(rec.path); }
          }
          recentWrites.clear();
          await store.setMeta("treeEtag", tree.etag);
        }
        const t = new Date().toISOString();
        await store.setMeta("lastSync", t);
        state = { ...state, lastSync: t };
        emit();
        settle();
      } catch (e) { fail(e); }
    });
  }

  // Mise en route : lecture au démarrage, toutes les `intervalMs`, au retour du réseau et au retour au premier plan.
  // Les modifs en attente partent quand l'onglet passe en arrière-plan.
  function start({ intervalMs = 60000, win = globalThis.window } = {}) {
    pull();
    const iv = timers.setInterval(() => { if (!win || !win.navigator || win.navigator.onLine !== false) pull(); }, intervalMs);
    const onOnline = () => { pull(); if (pendingCount()) flush(); };
    const onOffline = () => setStatus("offline");
    const onVisible = () => { if (win.document.visibilityState === "visible") pull(); else if (pendingCount()) flush(); };
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
