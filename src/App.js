import {
  h, useState, useEffect, useRef, useMemo, useCallback, Ctx,
  LS, G, VIEWS, DEFAULT_SESSION, catNo, slug, isRated, inPlaylist, sessionOf, batchNum, normalizeDoc, initialView, registerGenres,
} from "./core.js";
import { Disc, reduceMotion } from "./components.js";
import { ViewDecouvrir, ViewPlaylist, ViewArchives, ViewStats, ViewCompositions } from "./views.js";
import { ViewExplorer } from "./explorer.js";
import { ViewReglages, syncLabel } from "./settings.js";
import { Deck, PressOverlay } from "./deck.js";
import * as SP from "./spotify/api.js";
import { login as spLoginRedirect, logout as spLogoutLocal, hasSession, isConfigured, hasScope, getAccessToken } from "./spotify/auth.js";
import { createPlayback } from "./spotify/playback.js";
import { pressPlaylist as runPress } from "./press.js";
import { CONFIG } from "./config.js";

/* ============ Fichiers du dépôt ============ */
const RATING = id => "data/ratings/" + id + ".json";
const SESSION = id => "data/sessions/" + id + ".json";
const REQUEST = id => "data/requests/" + id + ".json";
const TAGS = "data/meta/tags.json";
const GENRES_FILE = "data/meta/genres.json";
const baseName = p => p.replace(/^.*\//, "").replace(/\.json$/, "");
const isObj = v => v && typeof v === "object" && !Array.isArray(v);

// Titre -> contenu du fichier (mêmes règles que l'artifact : on n'écrit pas les champs vides).
function serializeDoc(d) {
  const body = {};
  Object.entries(d).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "" && v !== false) body[k] = v; });
  body.session = sessionOf(d);
  body.note = isRated(d) ? d.note : null;
  body.comment = d.comment || "";
  body.tags = isObj(d.tags) ? d.tags : {};
  body.updatedAt = new Date().toISOString();
  return body;
}

let lastGenres = null;
function derive(sync) {
  // Genres définis dans le dépôt : appliqués avant tout rendu.
  const gf = sync.get(GENRES_FILE);
  if (gf !== lastGenres) {
    lastGenres = gf;
    const ignored = registerGenres(gf);
    if (ignored.length) console.warn("[genres] entrées ignorées dans " + GENRES_FILE + " :", ignored);
  }
  const docs = {}, sessions = {}, requests = {};
  sync.list("data/ratings/").forEach(r => { if (isObj(r.data) && r.data.song && r.data.artist) docs[baseName(r.path)] = normalizeDoc(r.data); });
  sync.list("data/sessions/").forEach(r => { if (isObj(r.data)) sessions[baseName(r.path)] = r.data; });
  sync.list("data/requests/").forEach(r => { if (isObj(r.data)) requests[baseName(r.path)] = r.data; });
  const tf = sync.get(TAGS);
  const customTags = isObj(tf) && Array.isArray(tf.custom) ? tf.custom.filter(t => t && t.id && t.label).map(t => [String(t.id), String(t.label), String(t.genre || "rock")]) : [];
  return { docs, sessions, requests, customTags };
}

export function App({ sync, gh, ghToken, store, spRedirect }) {
  const [data, setData] = useState(() => derive(sync));
  const [syncState, setSyncState] = useState(sync.state);
  const { docs, sessions, requests, customTags } = data;
  const [active, setActiveS] = useState(() => LS.get("sillon-active", "wtsgd"));
  const [view, setViewS] = useState(initialView);
  const [toastS, setToastS] = useState(null);
  const [deck, setDeck] = useState(null);
  const [seen, setSeen] = useState(() => new Set());
  const [np, setNp] = useState(null);
  const [exploreSeed, setExploreSeed] = useState("");
  const [press, setPress] = useState(null);
  const [hasGhToken, setHasGhToken] = useState(() => !!ghToken.get());
  const [spOn, setSpOn] = useState(() => isConfigured() && hasSession());
  const [spUser, setSpUser] = useState("");
  const docsRef = useRef(docs);
  const sessRef = useRef(sessions);
  const toastTimer = useRef(null);
  const notFound = useRef(new Set());

  const toast = useCallback((text, undo) => {
    clearTimeout(toastTimer.current);
    setToastS({ text, undo, k: Date.now() });
    toastTimer.current = setTimeout(() => setToastS(null), undo ? 5000 : 2400);
  }, []);
  const setView = useCallback(v => { setViewS(v); LS.set("sillon-view", v); setSeen(new Set()); try { window.history.replaceState(null, "", "#" + v); } catch (e) { /* rien */ } window.scrollTo(0, 0); }, []);
  const setActive = useCallback(id => { setActiveS(id); LS.set("sillon-active", id); setSeen(new Set()); }, []);
  useEffect(() => {
    const onHash = () => { const v = initialView(); if (v !== view) { setViewS(v); setSeen(new Set()); } };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [view]);

  /* ---- données : le moteur de sync est la seule source ---- */
  useEffect(() => {
    let raf = 0;
    const refresh = () => { raf = 0; const d = derive(sync); docsRef.current = d.docs; sessRef.current = d.sessions; setData(d); };
    const unsub = sync.subscribe(st => { setSyncState(st); if (!raf) raf = requestAnimationFrame(refresh); });
    refresh();
    const stop = sync.start();
    return () => { unsub(); stop(); cancelAnimationFrame(raf); };
  }, [sync]);

  useEffect(() => {
    if (spRedirect && spRedirect.error) toast(spRedirect.error);
    else if (spRedirect && spRedirect.ok) toast("Spotify connecté ✓");
  }, []);
  useEffect(() => {
    if (!spOn) { setSpUser(""); return; }
    SP.me().then(u => setSpUser(u.display_name || u.id || ""), e => { if (e.kind === "auth") setSpOn(false); });
  }, [spOn]);

  const updateDoc = useCallback((id, patch) => {
    const cur = docsRef.current[id] || {};
    const p = typeof patch === "function" ? patch(cur) : patch;
    const next = { ...cur, ...p };
    docsRef.current = { ...docsRef.current, [id]: next };
    sync.set(RATING(id), serializeDoc(next));
  }, [sync]);
  const createDoc = useCallback((id, d) => updateDoc(id, { note: null, comment: "", tags: {}, ...d }), [updateDoc]);
  const setNote = useCallback((id, n) => {
    const prev = docsRef.current[id] ? docsRef.current[id].note : null;
    const nn = prev === n ? null : n;
    updateDoc(id, { note: nn, ratedAt: nn == null ? null : new Date().toISOString() });
    setSeen(s => { const x = new Set(s); x.add(id); return x; });
    const d = docsRef.current[id];
    toast(nn == null ? "Note retirée" : d.song + " · " + nn + "/10" + (typeof d.prono === "number" ? "  (prono " + d.prono + ")" : ""), () => updateDoc(id, { note: prev }));
  }, [updateDoc, toast]);
  const saveSession = useCallback((id, patch) => {
    const cur = { ...(id === "wtsgd" && !sessRef.current[id] ? DEFAULT_SESSION : {}), ...(sessRef.current[id] || {}), ...patch };
    Object.keys(cur).forEach(k => { if (cur[k] === null || cur[k] === undefined) delete cur[k]; });
    sessRef.current = { ...sessRef.current, [id]: cur };
    sync.set(SESSION(id), cur);
  }, [sync]);
  const addCustomTag = useCallback((raw, genre) => {
    const label = (raw || "").trim().slice(0, 24);
    if (!label) return;
    const g = genre || "rock";
    const id = "x-" + slug(label);
    if (G(g).sections.flatMap(x => x.tags).concat(G(g).flags).concat(customTags.filter(t => (t[2] || "rock") === g)).some(t => t[0] === id || t[1].toLowerCase() === label.toLowerCase())) { toast("Ce mot-clé existe déjà"); return; }
    const next = customTags.filter(t => t[0] !== id).concat([[id, label, g]]);
    sync.set(TAGS, { ...(isObj(sync.get(TAGS)) ? sync.get(TAGS) : {}), custom: next.map(([i, l, gg]) => ({ id: i, label: l, genre: gg || "rock" })) });
    toast("Mot-clé « " + label + " » ajouté");
  }, [customTags, toast, sync]);
  const createRequest = useCallback((id, body) => sync.set(REQUEST(id), body), [sync]);
  const updateRequest = useCallback((id, patch) => sync.set(REQUEST(id), { ...(sync.get(REQUEST(id)) || {}), ...patch }), [sync]);

  /* ---- réglages ---- */
  const syncNow = useCallback(() => { sync.pull(); }, [sync]);
  const setGhToken = useCallback(t => { ghToken.set(t); setHasGhToken(!!t); if (t) sync.pull(); else sync.settle(); }, [sync, ghToken]);
  const testGh = useCallback(async () => {
    try {
      const r = await gh.checkAccess();
      if (!r.push) return { t: "Jeton valide pour " + r.name + ", mais en lecture seule : il faut Contents en lecture ET écriture.", c: "err" };
      sync.pull();
      return { t: "Jeton OK : lecture et écriture sur " + r.name + ".", c: "ok" };
    } catch (e) {
      return { t: e.kind === "token" ? "Jeton refusé par GitHub (" + (e.message || e.status) + "). Vérifie qu'il cible " + CONFIG.dataRepo.repo + "." : e.kind === "offline" ? "Pas de réseau." : "GitHub : " + e.message, c: "err" };
    }
  }, [gh, sync]);
  const resetLocal = useCallback(async () => { await store.clear(); window.location.reload(); }, [store]);
  const spLogin = useCallback(() => { spLoginRedirect().catch(e => toast(e.message)); }, [toast]);
  const spLogout = useCallback(() => {
    if (pbRef.current) { pbRef.current.disconnect(); pbRef.current = null; setPb(null); }
    spLogoutLocal(); setSpOn(false); toast("Spotify déconnecté");
  }, [toast]);

  /* ---- lecture depuis le vinyle (phase 2) ---- */
  const pbRef = useRef(null);
  const [pb, setPb] = useState(null);
  const getPb = useCallback(() => {
    if (!spOn) return null;
    if (!pbRef.current) pbRef.current = createPlayback({ api: SP, getToken: () => getAccessToken(), hasStreaming: () => hasScope("streaming"), name: "Sillon", onChange: s => setPb(s) });
    return pbRef.current;
  }, [spOn]);
  const pbInit = useCallback(() => { const c = getPb(); if (c) c.init(); }, [getPb]);
  // Lit (ou met en pause) le titre. Renvoie false si la lecture dans l'app n'est pas possible.
  const playTrack = useCallback(d => {
    const c = getPb();
    if (!c || !d || !d.spUri) return false;
    c.activate(); // pendant le clic : débloque l'audio (mobile)
    c.play(d.spUri).then(r => {
      if (!r.ok) toast("Aucun appareil Spotify disponible : ouvre Spotify quelque part, ou utilise le lien Spotify ↗");
    }, e => toast(e && e.kind === "premium" ? "La lecture demande Spotify Premium." : spFail(e)));
    return true;
  }, [getPb, toast]);

  /* ---- dérivés ---- */
  const sessionList = useMemo(() => {
    const m = { ...sessions };
    if (!m.wtsgd) m.wtsgd = DEFAULT_SESSION;
    Object.values(docs).forEach(d => { const s = sessionOf(d); if (!m[s]) m[s] = { title: s, seedSong: "?", seedArtist: "?", status: "active" }; });
    return Object.entries(m).sort((a, b) => (a[1].status === "archived" ? 1 : 0) - (b[1].status === "archived" ? 1 : 0) || (b[1].order || 0) - (a[1].order || 0));
  }, [sessions, docs]);
  const sessionsFull = useMemo(() => Object.fromEntries(sessionList), [sessionList]);
  const docsBySession = useMemo(() => { const m = {}; Object.values(docs).forEach(d => { const s = sessionOf(d); (m[s] = m[s] || []).push(d); }); return m; }, [docs]);
  const sessionDocs = useCallback(sid => docsBySession[sid] || [], [docsBySession]);
  const genreOfDoc = useCallback(d => ((sessionsFull[sessionOf(d)] || {}).genre) || "rock", [sessionsFull]);

  /* ---- Spotify ---- */
  const spFail = useCallback(e => { if (e && e.kind === "auth") setSpOn(false); return SP.errText(e); }, []);
  const resolveDoc = useCallback(async id => {
    const d = docsRef.current[id];
    if (!d) return false;
    if (d.spUri) return true;
    if (notFound.current.has(id)) return false;
    const t = await SP.searchTrack(d.song, d.artist);
    if (!t) { notFound.current.add(id); return false; }
    updateDoc(id, { spUri: t.uri, spUrl: t.url, spAlbum: t.album, spMs: t.ms, verified: true });
    return true;
  }, [updateDoc]);

  const pressPlaylist = useCallback(async (ids, name, replace, sObj) => {
    const sleep = ms => new Promise(r => setTimeout(r, reduceMotion() ? 150 : ms));
    const sid = active;
    const sess = sessRef.current[sid] || {};
    const old = sess.spPlaylist;
    const plName = (name || "").trim() || "Sillon";
    const steps = [
      { k: "biscuit", label: "Préparation du biscuit de vinyle", sub: ids.length + " titres" },
      { k: "press", label: replace && old && old.uri ? "Repressage sur Spotify (même playlist)" : "Pressage sur Spotify" },
      { k: "groove", label: "Gravure et contrôle du sillon" },
      { k: "sleeve", label: "Mise sous pochette" },
    ];
    const base = { s: sObj || sess || DEFAULT_SESSION, name: plName, count: ids.length, replace: !!replace, steps };
    const go = (step, extra) => setPress(p => ({ ...(p || base), ...base, steps: p ? p.steps : steps, step, ...(extra || {}) }));
    const fail = (k, msg) => setPress(p => ({ ...(p || base), step: "err", failAt: steps.findIndex(x => x.k === k), msg }));
    let cur = "biscuit";
    go("biscuit");
    let res;
    try {
      [res] = await Promise.all([runPress({
        ids, getDoc: id => docsRef.current[id], resolve: resolveDoc, name: plName, replace, old,
        description: "Sillon · " + catNo(base.s) + " · pressé depuis l'app",
        sp: SP,
        onStep: (k, sub) => {
          cur = k;
          if (k === "biscuit") setPress(p => p ? { ...p, steps: p.steps.map(s => s.k === "biscuit" ? { ...s, sub } : s) } : p);
          else go(k);
        },
      }), sleep(2600)]);
    } catch (e) {
      fail(cur, e && e.kind === "empty" ? "Aucun titre retrouvé sur Spotify : rien à presser." : spFail(e));
      return;
    }
    await sleep(900);
    go("sleeve");
    await sleep(900);
    const { pl, list, exact, note } = res;
    const prev = Array.isArray(sess.pressings) ? sess.pressings : [];
    const entry = { n: prev.length + 1, at: new Date().toISOString(), count: list.uris.length, name: plName, url: pl.url, uri: pl.uri, replaced: !!(old && pl.uri === old.uri) };
    saveSession(sid, { playlistName: plName, spPlaylist: { uri: pl.uri, url: pl.url, name: plName, n: list.uris.length, ids: list.included, at: entry.at }, pressings: prev.concat([entry]).slice(-30) });
    const D = docsRef.current;
    const miss = list.missing.map(id => D[id] ? D[id].artist + " – " + D[id].song : id);
    go("done", { url: pl.url, msg: "Pressage n°" + entry.n + " : " + list.uris.length + " titres" + (exact === true ? ", liste vérifiée sur Spotify ✓." : exact === false ? ". Attention : le contenu lu sur Spotify ne correspond pas exactement." : ".")
      + (miss.length ? " Introuvables sur Spotify (non pressés) : " + miss.join(", ") + "." : "") + (list.dups.length ? " " + list.dups.length + " doublon(s) retiré(s)." : "") + (note ? " " + note : "") });
  }, [active, saveSession, resolveDoc, spFail]);
  const closePress = useCallback(() => setPress(null), []);

  const nowPlaying = useCallback(async () => {
    if (!spOn) { setNp(h("div", { className: "row" }, h("span", null, "Connecte Spotify pour voir ce qui passe."), h("button", { type: "button", className: "btn sm primary", onClick: spLogin }, "Se connecter"))); return; }
    setNp("Je regarde ce qui passe sur Spotify…");
    try {
      const t = await SP.currentlyPlaying();
      if (!t) { setNp("Rien ne passe sur Spotify en ce moment."); return; }
      const id = slug(t.artist + " " + t.song);
      const known = docsRef.current[id];
      setNp(h("div", { className: "row" }, h(Disc, { artist: t.artist, spin: true }), h("span", null, "En écoute sur Spotify : ", h("b", null, t.song), " · " + t.artist),
        known && isRated(known) ? h("span", { className: "badge ok" }, "déjà noté " + known.note) : null,
        h("button", { type: "button", className: "btn sm primary", onClick: () => {
          if (!docsRef.current[id]) createDoc(id, { song: t.song, artist: t.artist, group: "Entendu sur Spotify", custom: true, fournee: "perso", session: active, spUri: t.uri, spUrl: t.url, spAlbum: t.album, spMs: t.ms, verified: true, addedAt: new Date().toISOString() });
          setNp(null); setDeck({ queue: [id], i: 0 });
        } }, known && isRated(known) ? "Revoir" : "Noter maintenant")));
    } catch (e) { setNp(spFail(e)); }
  }, [spOn, spLogin, active, createDoc, spFail]);

  const exportData = useCallback(() => {
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), sessions: sessionsFull, tracks: docsRef.current, customTags, requests }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "sillon-export-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Export téléchargé");
  }, [sessionsFull, customTags, requests, toast]);

  const openDeck = useCallback(ids => {
    const D = docsRef.current;
    const q = ids || Object.keys(D).filter(id => sessionOf(D[id]) === active && !isRated(D[id]))
      .sort((a, b) => batchNum(D[b]) - batchNum(D[a]) || (D[b].prono || 0) - (D[a].prono || 0));
    if (!q.length) { toast("Rien à écouter pour l'instant"); return; }
    setDeck({ queue: q, i: 0 });
  }, [active, toast]);
  // Fermer la platine relève le bras : la lecture s'arrête et les notes de la séance partent en un commit.
  const closeDeck = useCallback(() => { setDeck(null); setSeen(new Set()); if (pbRef.current) pbRef.current.pause().catch(() => {}); sync.flush(); }, [sync]);
  useEffect(() => { document.body.style.overflow = deck || press ? "hidden" : ""; }, [deck, press]);
  const exploreFrom = useCallback(d => { setExploreSeed(slug(d.artist + " " + d.song)); setDeck(null); setView("explorer"); }, [setView]);

  const ctx = {
    docs, sessions: sessionsFull, sessionsRaw: sessions, sessionList, sessionDocs, customTags, requests, active, setActive, view, setView, seen,
    updateDoc, createDoc, setNote, saveSession, addCustomTag, createRequest, updateRequest, toast,
    spOn, spUser, spConfigured: isConfigured(), spLogin, spLogout, pressPlaylist, press, closePress, nowPlaying, np, exportData, genreOfDoc, resolveOne: resolveDoc,
    deck, setDeck, openDeck, closeDeck, exploreFrom, exploreSeed,
    syncState, syncNow, hasGhToken, setGhToken, testGh, resetLocal,
    pb, pbCtl: pbRef.current, pbInit, playTrack, spStreaming: spOn && hasScope("streaming"),
  };
  const cur = sessionsFull[active] || DEFAULT_SESSION;
  const sd = docsBySession[active] || [];
  const todoN = sd.filter(d => !isRated(d)).length, playN = sd.filter(inPlaylist).length, ratedN = sd.filter(isRated).length;
  const counts = { decouvrir: todoN, playlist: playN, archives: ratedN };
  const V = { decouvrir: ViewDecouvrir, explorer: ViewExplorer, playlist: ViewPlaylist, archives: ViewArchives, stats: ViewStats, compositions: ViewCompositions, reglages: ViewReglages }[view] || ViewDecouvrir;
  const prog = sd.length ? ratedN / sd.length : 0;
  const lab = syncLabel(syncState);
  const firstRun = !hasGhToken && !Object.keys(docs).length && view !== "reglages";

  return h(Ctx.Provider, { value: ctx },
    h("div", { className: "shell" },
      h("aside", { className: "rail" },
        h("a", { className: "logo", href: "#decouvrir", onClick: e => { e.preventDefault(); setView("decouvrir"); } }, h("span", { className: "groove" }), h("span", null, h("b", null, "Sillon"), h("small", null, "Music finder · 33⅓ tr/min"))),
        h("div", { className: "railcard" },
          h("span", { className: "k" }, catNo(cur) + " · " + G(cur.genre || "rock").label + " · " + (cur.status === "archived" ? "dans le bac" : "en cours")),
          h("span", { className: "t" }, cur.title),
          h("span", { className: "s" }, "Départ : " + cur.seedArtist + " – " + cur.seedSong),
          h("div", { className: "meter" }, h("i", { style: { width: (prog * 100) + "%" } })),
          h("span", { className: "s mono", style: { fontSize: 11.5 } }, ratedN + " notés · " + playN + " en playlist · " + todoN + " à écouter"),
          h("button", { type: "button", className: "btn sm primary", disabled: !todoN, onClick: () => openDeck() }, "▶ Sur la platine"),
          h("button", { type: "button", className: "btn sm ghost", onClick: () => setView("playlist") }, "⏺ Aller à la presse")),
        h("nav", { className: "nav", "aria-label": "Sections" }, VIEWS.concat([["reglages", "Réglages", "⚙"]]).map(([k, label, ic]) => h("button", { key: k, type: "button", "aria-current": view === k ? "page" : undefined, onClick: () => setView(k) },
          h("span", { className: "ic", "aria-hidden": "true" }, ic), label === "Compos" ? "Discothèque" : label, counts[k] != null ? h("span", { className: "ct" }, counts[k]) : null))),
        h("div", { className: "railfoot" },
          h("button", { type: "button", className: "footbtn", onClick: () => setView("reglages"), title: syncState.message || "" }, h("span", { className: "dot " + lab.c }), lab.t),
          h("button", { type: "button", className: "footbtn", onClick: () => setView("reglages") }, h("span", { className: "dot " + (spOn ? "on" : "") }), "Spotify " + (spOn ? "connecté" : "non connecté")),
          h("button", { type: "button", className: "footbtn", onClick: syncNow, disabled: !hasGhToken }, "↻ Synchroniser"))),
      h("div", null,
        h("header", { className: "topbar" },
          h("a", { className: "logo", href: "#decouvrir", onClick: e => { e.preventDefault(); setView("decouvrir"); } }, h("span", { className: "groove" }), h("b", null, "Sillon")),
          h("button", { type: "button", className: "chip", onClick: () => setView("compositions"), title: "Changer de composition" }, h("span", { className: "dot " + (cur.status === "archived" ? "" : "on") }), cur.title),
          h("button", { type: "button", className: "chip syncchip", onClick: () => setView("reglages"), "aria-label": "Réglages · " + lab.t, title: lab.t }, h("span", { className: "dot " + lab.c }), "⚙")),
        h("main", { className: "main" }, h("div", { className: "col" },
          firstRun ? h("section", { className: "panel" }, h("h3", null, h("span", { className: "dot warn" }), "Branche tes données"),
            h("p", null, "Sillon lit et écrit tes notes dans le dépôt privé " + CONFIG.dataRepo.owner + "/" + CONFIG.dataRepo.repo + ". Colle un jeton GitHub dans les réglages pour récupérer tes titres et tes compositions."),
            h("div", { className: "row" }, h("button", { type: "button", className: "btn primary", onClick: () => setView("reglages") }, "Ouvrir les réglages"))) : null,
          h(V, { key: view + "|" + active })))),
      h("nav", { className: "tabbar", "aria-label": "Sections" }, VIEWS.map(([k, label, ic]) => h("button", { key: k, type: "button", "aria-current": view === k ? "page" : undefined, onClick: () => setView(k) },
        h("span", { className: "ic", "aria-hidden": "true" }, ic), label)))),
    deck ? h(Deck, null) : null,
    press ? h(PressOverlay, null) : null,
    toastS ? h("div", { className: "toast", role: "status", "aria-live": "polite", key: toastS.k }, h("span", null, toastS.text),
      toastS.undo ? h("button", { type: "button", onClick: () => { toastS.undo(); setToastS(null); } }, "Annuler") : null) : null);
}
