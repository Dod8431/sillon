import { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext, Fragment, h, Ctx, useApp, slug, norm, GENRES, uniq, ALL_QUALS, FLAGS, NEW_TAGS, G, CONTEXTS, DIRECTIONS, LEGACY, DEFAULT_SESSION, catNo, SAVE_KEYS, VIEWS, LS, spLink, mean, fmt, isRated, inPlaylist, sessionOf, hue, discStyle, lvl, segColor, fmtMin, qualList, isFlag, batchOf, batchNum, batchLabel, batchLong, normalizeDoc, initialView, tagImpact } from "./core.js";
import { Disc, initials, Rec, Cover, Sleeve, useVizSim, reduceMotion, cssVar, VizStrip, VizRing, energyOf, Turntable, Links, TagMini, VU, TextField, TagPad, TrackCard } from "./components.js";

/* ============ Vues ============ */
export function SessionHero({ sid, children }) {
  const app = useApp();
  const s = app.sessions[sid] || DEFAULT_SESSION;
  const list = app.sessionDocs(sid);
  const rated = list.filter(isRated);
  const batches = useMemo(() => {
    const m = {};
    list.forEach(d => { const b = batchOf(d); (m[b] = m[b] || []).push(d); });
    return Object.entries(m).map(([b, l]) => ({ b: isNaN(Number(b)) ? b : Number(b), n: l.length, r: l.filter(isRated).length, avg: mean(l.filter(isRated).map(d => d.note)), hits: l.filter(inPlaylist).length }))
      .sort((a, b) => (typeof a.b === "number" ? a.b : 99) - (typeof b.b === "number" ? b.b : 99));
  }, [list]);
  return h("section", { className: "hero" },
    h("div", { className: "herorec", "aria-hidden": "true" }, h(Disc, { artist: s.seedArtist, spin: s.status !== "archived", slow: true, label: catNo(s) })),
    h("div", { className: "row" }, h("span", { className: "cat" }, catNo(s)), h("span", { className: "gchip" }, G(s.genre || "rock").label + (s.genreNote ? " · " + s.genreNote : "")),
      h("span", { className: "eyebrow" }, s.status === "archived" ? "Rangée dans le bac" : "Composition en cours")),
    h("h1", { className: "h1" }, s.title),
    h("div", { className: "seed" }, h(Disc, { artist: s.seedArtist }), h("span", null, "Point de départ : ", h("b", null, s.seedArtist + " – " + s.seedSong))),
    h("div", { className: "kpis" },
      h("div", { className: "kpi" }, h("b", null, rated.length), h("span", null, "notés")),
      h("div", { className: "kpi" }, h("b", null, rated.length ? fmt(mean(rated.map(d => d.note))) : "–"), h("span", null, "moyenne")),
      h("div", { className: "kpi" }, h("b", null, list.filter(inPlaylist).length), h("span", null, "en playlist")),
      h("div", { className: "kpi" }, h("b", null, list.filter(d => !isRated(d)).length), h("span", null, "à écouter"))),
    batches.length ? h("div", { className: "batches" }, batches.map(b => h("div", { key: String(b.b), className: "bpill" + (b.r < b.n ? " cur" : "") },
      h("b", null, batchLong(b.b)), h("span", null, b.r + "/" + b.n + " notés" + (b.r ? " · moy. " + fmt(b.avg) : "")), h("span", null, b.hits + " en playlist")))) : null,
    children);
}

export function ViewDecouvrir() {
  const app = useApp();
  const sid = app.active;
  const s = app.sessions[sid] || DEFAULT_SESSION;
  const list = app.sessionDocs(sid);
  const ids = Object.keys(app.docs).filter(id => sessionOf(app.docs[id]) === sid && (!isRated(app.docs[id]) || app.seen.has(id)));
  const todo = ids.filter(id => !isRated(app.docs[id]));
  const keyOf = d => batchOf(d) + "|" + (d.group || "Tes ajouts");
  const groups = [];
  ids.forEach(id => { const k = keyOf(app.docs[id]); if (!groups.includes(k)) groups.push(k); });
  groups.sort((a, b) => { const na = Number(a.split("|")[0]) || 99, nb = Number(b.split("|")[0]) || 99; return nb - na; });
  const nextBatch = Math.max(0, ...list.map(batchNum)) + 1;
  return h(Fragment, null,
    h(SessionHero, { sid },
      h("div", { className: "row" },
        h("button", { type: "button", className: "btn primary", disabled: !todo.length, onClick: () => app.openDeck() }, "▶  Sur la platine" + (todo.length ? " · " + todo.length : "")),
        h("button", { type: "button", className: "btn ghost", onClick: app.nowPlaying }, "🎧 Ce qui passe sur Spotify"),
        h("span", { className: "keys" }, h("kbd", null, "1"), "–", h("kbd", null, "9"), " noter · ", h("kbd", null, "0"), " = 10")),
      app.np ? h("div", { className: "panel", style: { background: "var(--panel2)" } }, app.np) : null),
    !ids.length ? h("section", { className: "panel" },
      h("h3", null, "Tout est écouté"),
      h("p", null, "Tu as noté toute la fournée. Demande la fournée " + nextBatch + " à Claude : il lit tes notes dans sillon-data et y pousse les titres. Ils apparaîtront ici à la prochaine synchronisation."),
      h("div", { className: "row" }, h("button", { type: "button", className: "btn", onClick: app.syncNow }, "↻ Synchroniser"))) : null,
    groups.map(key => {
      const [b, g] = key.split("|");
      const gid = ids.filter(id => keyOf(app.docs[id]) === key).sort((x, y) => (app.docs[y].prono || 0) - (app.docs[x].prono || 0));
      const sub = (s.groups || {})[g];
      const bb = isNaN(Number(b)) ? b : Number(b);
      return h("section", { key, className: "group" },
        h("div", { className: "ghead" }, h("h2", { className: "h2" }, g, h("span", { className: "badge amber" }, batchLong(bb))), sub ? h("p", null, sub) : null),
        h("div", { className: "cards" }, gid.map(id => h(TrackCard, { key: id, id }))));
    }),
    ids.length ? h("section", { className: "panel" }, h("h3", null, "Fournée suivante"), h("p", null, "Une fois celle-ci finie, demande la fournée " + nextBatch + " à Claude : elle arrivera ici depuis sillon-data.")) : null,
    h(AddTrack, { sid }));
}

export function AddTrack({ sid }) {
  const app = useApp();
  const [song, setSong] = useState(""), [artist, setArtist] = useState("");
  return h("section", { className: "panel" },
    h("h3", null, "Ajouter un morceau"),
    h("p", null, "Entendu ailleurs ? Ajoute-le à la composition pour le noter avec le reste."),
    h("form", { className: "row", onSubmit: e => {
      e.preventDefault();
      if (!song.trim() || !artist.trim()) { app.toast("Il faut un titre et un artiste"); return; }
      const id = slug(artist + " " + song);
      if (app.docs[id]) { app.toast("Déjà dans ta liste"); return; }
      app.createDoc(id, { song: song.trim(), artist: artist.trim(), group: "Tes ajouts", custom: true, fournee: "perso", session: sid, addedAt: new Date().toISOString() });
      setSong(""); setArtist(""); app.toast("Ajouté à Découvrir");
    } },
      h("input", { className: "field", style: { flex: "1 1 180px" }, value: song, placeholder: "Titre", "aria-label": "Titre", onChange: e => setSong(e.target.value) }),
      h("input", { className: "field", style: { flex: "1 1 160px" }, value: artist, placeholder: "Artiste", "aria-label": "Artiste", onChange: e => setArtist(e.target.value) }),
      h("button", { type: "submit", className: "btn" }, "Ajouter")));
}

export function splitSides(ids, D) {
  const dur = id => Number(D[id].spMs) || 216000;
  const total = ids.reduce((t, id) => t + dur(id), 0);
  const A = [], B = []; let acc = 0;
  ids.forEach(id => { (acc + dur(id) / 2 <= total / 2 || !A.length ? A : B).push(id); acc += dur(id); });
  if (!B.length && A.length > 1) B.push(A.pop());
  return [A, B];
}
export function ViewPlaylist() {
  const app = useApp();
  const sid = app.active;
  const s = app.sessions[sid] || DEFAULT_SESSION;
  const D = app.docs;
  const ids = Object.keys(D).filter(id => sessionOf(D[id]) === sid && inPlaylist(D[id]))
    .sort((a, b) => (D[b].heart ? 1 : 0) - (D[a].heart ? 1 : 0) || D[b].note - D[a].note || D[a].artist.localeCompare(D[b].artist));
  const pl = s.spPlaylist;
  const [name, setName] = useState(s.playlistName || (pl && pl.name) || ("Sillon · " + s.title));
  useEffect(() => { setName(s.playlistName || (pl && pl.name) || ("Sillon · " + s.title)); }, [s.playlistName]);
  const [confirmClose, setConfirmClose] = useState(false);
  const [mode, setMode] = useState(pl ? "replace" : "new");
  const taRef = useRef(null);
  const resolving = useRef(false);
  useEffect(() => {
    if (!app.spOn || resolving.current) return;
    const todo = ids.filter(id => !D[id].spUrl);
    if (!todo.length) return;
    resolving.current = true;
    (async () => { for (const id of todo) { try { await app.resolveOne(id); } catch (e) { break; } } })();
  }, [app.spOn, ids.length]);
  const [A, B] = splitSides(ids, D);
  const ms = ids.reduce((t, id) => t + (Number(D[id].spMs) || 216000), 0);
  const sideMs = l => l.reduce((t, id) => t + (Number(D[id].spMs) || 216000), 0);
  const added = pl && Array.isArray(pl.ids) ? ids.filter(id => !pl.ids.includes(id)).length : null;
  const removed = pl && Array.isArray(pl.ids) ? pl.ids.filter(id => !ids.includes(id)).length : null;
  const upToDate = pl && added === 0 && removed === 0 && (pl.name || "") === (name.trim() || pl.name);
  const text = ids.map(id => D[id].artist + " - " + D[id].song).join("\n");
  const pressings = Array.isArray(s.pressings) ? s.pressings : [];
  const saveName = () => { const n = name.trim(); if (n && n !== s.playlistName) app.saveSession(sid, { playlistName: n }); };
  const copy = () => {
    const fb = () => { if (taRef.current) { taRef.current.closest("details").open = true; taRef.current.focus(); taRef.current.select(); } app.toast("Tracklist sélectionnée, copie-la avec Ctrl+C"); };
    try { navigator.clipboard.writeText(text).then(() => app.toast("Tracklist copiée ✓"), fb); } catch (e) { fb(); }
  };
  const side = (label, list, offset) => h("section", { className: "side" },
    h("header", null, h("span", { className: "face" }, "Face " + label), h("span", null, list.length + " titres · " + fmtMin(sideMs(list)))),
    list.map((id, i) => {
      const d = D[id];
      return h("div", { key: id, className: "prow" },
        h("span", { className: "i mono" }, label + (i + 1)),
        h(Rec, { d, small: true }),
        h("div", { className: "t" }, h("b", null, (d.heart ? "♥ " : "") + d.song), h("span", null, d.artist + (d.spMs ? " · " + fmtMin(d.spMs) : "") + (d.moment ? " · " + d.moment : ""))),
        h("span", { className: "bignum " + lvl(d.note), style: { fontSize: 26 } }, String(d.note)));
    }));
  const status = !pl ? h("span", { className: "tp" }, "Test pressing · jamais pressé")
    : upToDate ? h("span", { className: "tp ok" }, "✓ Pressage à jour")
    : h("span", { className: "tp new" }, "Nouveau pressage dispo" + (added ? " · +" + added : "") + (removed ? " · −" + removed : ""));
  return h(Fragment, null,
    h("header", { className: "presshead" },
      h(Sleeve, { s }),
      h("div", { className: "info" },
        h("div", { className: "row" }, h("span", { className: "cat" }, catNo(s)), h("span", { className: "eyebrow" }, "Pressage")),
        h("h1", { className: "h1" }, name.trim() || s.title),
        h("div", { className: "row" }, status, h("span", { className: "status" }, ids.length + " titres · " + Math.round(ms / 60000) + " min · 2 faces")))),
    !app.spOn ? h("section", { className: "panel" }, h("h3", null, h("span", { className: "dot" }), "Presse hors ligne"), h("p", null, "Le pressage a besoin de ta connexion Spotify."),
      h("div", { className: "row" }, h("button", { type: "button", className: "btn primary", onClick: app.spLogin }, "Se connecter à Spotify")))
    : h("section", { className: "panel" },
      h("h3", null, h("span", { className: "dot " + (app.spOn ? "on" : "warn") }), "La presse"),
      h("label", { className: "plname" }, h("span", { className: "eyebrow", style: { width: "100%" } }, "Nom sur l'étiquette"),
        h("input", { className: "field", value: name, maxLength: 100, onChange: e => setName(e.target.value), onBlur: saveName, onKeyDown: e => { if (e.key === "Enter") e.currentTarget.blur(); } })),
      pl ? h("div", { className: "seg2", role: "group", "aria-label": "Type de pressage" },
        h("button", { type: "button", "aria-pressed": mode === "replace" ? "true" : "false", onClick: () => setMode("replace") }, "Repressage (remplace l'ancien)"),
        h("button", { type: "button", "aria-pressed": mode === "new" ? "true" : "false", onClick: () => setMode("new") }, "Nouvelle édition (garde l'ancien)")) : null,
      h("div", { className: "row", style: { gap: 16 } },
        h("button", { type: "button", className: "pressbtn", disabled: !ids.length || !app.spOn || !!app.press, onClick: () => { saveName(); app.pressPlaylist(ids, name.trim() || s.title, pl && mode === "replace", s); } },
          pl ? (mode === "replace" ? "⏺ Represser" : "⏺ Presser une édition") : "⏺ Presser le vinyle"),
        pl && pl.url ? h("a", { className: "linkbtn", href: pl.url, target: "sillon_spotify" }, "Écouter le pressage actuel ↗") : null),
      h("p", null, pl && mode === "replace" ? "Le repressage remplace le contenu de la playlist existante par la tracklist exacte ci-dessous, Face A puis Face B. Le lien ne change pas." : "Crée une nouvelle playlist avec la tracklist exacte ci-dessous, Face A puis Face B." + (pl ? " L'ancienne reste dans ta bibliothèque." : ""))),
    ids.length ? h("div", { className: "sides" }, side("A", A, 0), B.length ? side("B", B, A.length) : null) : h("p", { className: "empty" }, "Rien à 7 ou plus pour l'instant : la presse attend."),
    (() => {
      const off = Object.keys(D).filter(id => sessionOf(D[id]) === sid && isRated(D[id]) && D[id].offtopic).sort((a, b) => D[b].note - D[a].note);
      return off.length ? h("section", { className: "panel" }, h("h3", null, "Coups de cœur hors sujet"),
        h("p", null, "Notés, mais écartés de la playlist et du profil de cette composition."),
        h("div", { className: "offlist" }, off.map(id => h("div", { key: id, className: "orow" }, h("i", null, String(D[id].note)), h("b", null, D[id].song), h("span", null, D[id].artist))))) : null;
    })(),
    pressings.length ? h("section", { className: "panel" }, h("h3", null, "Registre des pressages"),
      h("div", { className: "hist2" }, pressings.slice().reverse().map((p, i) => h("div", { key: i, className: "hrow" },
        h("b", null, "N°" + p.n), h("span", null, (p.name || "Playlist") + " · " + p.count + " titres · " + new Date(p.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + (p.replaced ? " · repressage" : "")),
        p.url ? h("a", { className: "linkbtn", href: p.url, target: "sillon_spotify" }, "↗") : h("span")))) ) : null,
    h("div", { className: "row" },
      h("button", { type: "button", className: "btn", disabled: !ids.length, onClick: copy }, "Copier la tracklist"),
      h("button", { type: "button", className: "btn", disabled: !ids.length, onClick: () => app.openDeck(ids.slice()) }, "▶ Réécouter sur la platine")),
    h("details", null, h("summary", { className: "status", style: { cursor: "pointer" } }, "Tracklist en texte"), h("textarea", { ref: taRef, className: "copy", readOnly: true, value: text, "aria-label": "Tracklist" })),
    h("section", { className: "panel" },
      h("h3", null, s.status === "archived" ? "Rangée dans le bac" : "Ranger la composition"),
      s.status === "archived"
        ? h(Fragment, null, h("p", null, "Cette composition est dans le bac. Tu peux toujours la consulter, la represser ou la ressortir."),
          h("div", { className: "row" }, h("button", { type: "button", className: "btn", onClick: () => app.saveSession(sid, { status: "active", closedAt: null }) }, "Ressortir du bac"), h("button", { type: "button", className: "btn primary", onClick: () => app.setView("compositions") }, "Nouvelle composition")))
        : h(Fragment, null,
          h("p", null, "Quand le pressage te plaît, range la composition : elle rejoint la discothèque avec sa tracklist figée, et tu peux en démarrer une autre."),
          confirmClose
            ? h("div", { className: "row" }, h("button", { type: "button", className: "btn danger", onClick: () => { app.saveSession(sid, { status: "archived", closedAt: new Date().toISOString(), playlist: ids }); setConfirmClose(false); app.toast("Rangée dans le bac"); } }, "Oui, ranger « " + s.title + " »"), h("button", { type: "button", className: "btn ghost", onClick: () => setConfirmClose(false) }, "Annuler"))
            : h("button", { type: "button", className: "btn", onClick: () => setConfirmClose(true) }, "Ranger dans le bac"))));
}

export function ViewArchives() {
  const app = useApp();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("note");
  const [scope, setScope] = useState("active");
  const [tf, setTf] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const D = app.docs;
  let ids = Object.keys(D).filter(id => isRated(D[id]) && (scope === "all" || sessionOf(D[id]) === app.active));
  const used = new Set(); ids.forEach(id => Object.keys(D[id].tags || {}).forEach(k => used.add(k)));
  const qq = norm(q);
  if (qq) ids = ids.filter(id => norm(D[id].song + " " + D[id].artist + " " + (D[id].comment || "") + " " + (D[id].moment || "")).includes(qq));
  if (tf) { const [k, v] = tf.split(":"); ids = ids.filter(id => k === "heart" ? !!D[id].heart : ((D[id].tags || {})[k] || 0) === Number(v)); }
  const pd = d => typeof d.prono === "number" ? Math.abs(d.note - d.prono) : -1;
  ids.sort({ note: (a, b) => D[b].note - D[a].note, low: (a, b) => D[a].note - D[b].note, artist: (a, b) => D[a].artist.localeCompare(D[b].artist) || D[a].song.localeCompare(D[b].song),
    recent: (a, b) => String(D[b].ratedAt || D[b].updatedAt || "").localeCompare(String(D[a].ratedAt || D[a].updatedAt || "")), prono: (a, b) => pd(D[b]) - pd(D[a]) }[sort]);
  const fbtn = (key, label) => h("button", { key, type: "button", className: "fchip", "aria-pressed": tf === key ? "true" : "false", onClick: () => setTf(tf === key ? null : key) }, label);
  return h(Fragment, null,
    h("header", { style: { display: "flex", flexDirection: "column", gap: 8 } }, h("div", { className: "eyebrow" }, "Le bac · archives"), h("h1", { className: "h1" }, "Déjà écouté"),
      h("p", { className: "lede" }, "Tout ce que tu as noté. Touche une ligne pour modifier la note, les mots-clés ou le commentaire.")),
    h("div", { className: "row" },
      h("input", { type: "search", className: "field", style: { flex: "1 1 240px" }, value: q, placeholder: "Titre, artiste, commentaire…", "aria-label": "Chercher", onChange: e => setQ(e.target.value) }),
      h("select", { className: "field", value: sort, onChange: e => setSort(e.target.value), "aria-label": "Trier" },
        h("option", { value: "note" }, "Meilleure note"), h("option", { value: "low" }, "Pire note"), h("option", { value: "artist" }, "Artiste A→Z"),
        h("option", { value: "recent" }, "Noté récemment"), h("option", { value: "prono" }, "Plus gros écart avec le prono")),
      h("div", { className: "seg2", role: "group", "aria-label": "Portée" },
        h("button", { type: "button", "aria-pressed": scope === "active" ? "true" : "false", onClick: () => setScope("active") }, "Cette compo"),
        h("button", { type: "button", "aria-pressed": scope === "all" ? "true" : "false", onClick: () => setScope("all") }, "Tout"))),
    h("details", null, h("summary", { className: "status", style: { cursor: "pointer" } }, "Filtrer par mot-clé" + (tf ? " · 1 filtre actif" : "")),
      h("div", { className: "fchips", style: { marginTop: 10 } },
        fbtn("heart:1", "♥ Coups de cœur"),
        qualList(app.customTags).filter(t => used.has(t[0])).flatMap(([k, l]) => [fbtn(k + ":1", "+ " + l), fbtn(k + ":-1", "− " + l)]),
        FLAGS.filter(t => used.has(t[0])).map(([k, l]) => fbtn(k + ":1", l)))),
    h("div", { className: "status" }, ids.length + " morceaux"),
    h("div", { className: "rows" }, ids.map(id => {
      const d = D[id];
      const isOpen = open.has(id);
      return h("div", { key: id, className: "arow" },
        h("button", { type: "button", className: "sum", "aria-expanded": isOpen ? "true" : "false", onClick: () => setOpen(o => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; }) },
          h(Rec, { d, small: true, link: false }),
          h("div", { className: "t" }, h("b", null, (d.heart ? "♥ " : "") + d.song), h("span", null, d.artist + " · " + batchLabel(batchOf(d)) + (d.comment ? " · " + d.comment : ""))),
          h("div", { className: "chips" }, h(TagMini, { d, limit: 4, custom: app.customTags })),
          h("span", { className: "bignum " + lvl(d.note), style: { fontSize: 30 } }, String(d.note))),
        isOpen ? h(TrackCard, { id, openTags: true }) : null);
    })),
    !ids.length ? h("p", { className: "empty" }, "Aucun morceau ne correspond.") : null);
}

export function ViewStats() {
  const app = useApp();
  const [scope, setScope] = useState("active");
  const all = Object.values(app.docs).filter(d => scope === "all" || sessionOf(d) === app.active);
  const rated = all.filter(isRated);
  const head = h("header", { style: { display: "flex", flexDirection: "column", gap: 10 } }, h("div", { className: "eyebrow" }, "Stats"), h("h1", { className: "h1" }, "Ce qui te fait vibrer"),
    h("div", { className: "seg2", role: "group", "aria-label": "Portée" },
      h("button", { type: "button", "aria-pressed": scope === "active" ? "true" : "false", onClick: () => setScope("active") }, "Cette composition"),
      h("button", { type: "button", "aria-pressed": scope === "all" ? "true" : "false", onClick: () => setScope("all") }, "Toutes")));
  if (!rated.length) return h(Fragment, null, head, h("p", { className: "empty" }, "Les stats apparaîtront dès les premières notes."));
  const avg = mean(rated.map(d => d.note));
  const counts = Array(11).fill(0); rated.forEach(d => counts[d.note]++);
  const max = Math.max(...counts, 1);
  const bm = {}; rated.forEach(d => { const b = batchOf(d); (bm[b] = bm[b] || []).push(d); });
  const bRows = Object.entries(bm).map(([b, l]) => { const bb = isNaN(+b) ? b : +b; const wp = l.filter(d => typeof d.prono === "number"); return { b: bb, label: batchLong(bb), m: mean(l.map(d => d.note)), n: l.length, hits: l.filter(inPlaylist).length, pm: wp.length ? mean(wp.map(d => d.prono)) : null }; })
    .sort((a, b) => (typeof a.b === "number" ? a.b : 99) - (typeof b.b === "number" ? b.b : 99));
  const withP = rated.filter(d => typeof d.prono === "number");
  const mae = withP.length ? mean(withP.map(d => Math.abs(d.note - d.prono))) : null;
  const hits = withP.filter(d => Math.abs(d.note - d.prono) <= 1).length;
  const bias = withP.length ? mean(withP.map(d => d.note - d.prono)) : 0;
  const imp = tagImpact(rated, app.customTags);
  const span = Math.max(1, ...imp.map(r => Math.abs(r.diff)));
  const byA = {}; rated.forEach(d => (byA[d.artist] = byA[d.artist] || []).push(d.note));
  const aRows = Object.entries(byA).filter(([, l]) => l.length >= 2).map(([a, l]) => ({ label: a, m: mean(l), n: l.length })).sort((x, y) => y.m - x.m).slice(0, 10);
  const ctx = {}; rated.forEach(d => { if (d.context) ctx[d.context] = (ctx[d.context] || 0) + 1; });
  const ctxMax = Math.max(1, ...Object.values(ctx));
  const fresh = rated.filter(d => typeof d.fresh === "number");
  const scale = h("div", { className: "scale" }, h("div"), h("div", null, h("span", null, "0"), h("span", null, "5"), h("span", null, "10")), h("div"));
  return h(Fragment, null, head,
    h("div", { className: "sgrid" },
      h("section", { className: "panel wide" },
        h("h3", null, "Répartition des notes"),
        h("p", null, rated.length + " morceaux, moyenne " + fmt(avg) + ", " + rated.filter(inPlaylist).length + " en playlist."),
        h("div", { className: "hist" }, counts.map((c, n) => h("div", { key: n, className: "hcol" }, h("b", null, c ? String(c) : ""), h("div", { className: "hb" }, h("i", { style: { height: (c / max * 100) + "%", "--c": segColor(n) } })), h("em", null, String(n)))))),
      h("section", { className: "panel" },
        h("h3", null, "Claude contre toi"),
        withP.length ? h(Fragment, null,
          h("div", { className: "bigs" }, h("div", null, h("b", null, hits + "/" + withP.length), h("span", null, "pronos justes (±1)")), h("div", null, h("b", null, fmt(mae)), h("span", null, "écart moyen"))),
          h("p", null, bias < -0.3 ? "Je suis trop optimiste de " + fmt(-bias) + " point en moyenne. Je corrige à chaque fournée." : bias > 0.3 ? "Je suis trop prudent de " + fmt(bias) + " point en moyenne." : "Pas de biais net : mes erreurs vont dans les deux sens."),
          h("div", { className: "scroll" }, h("table", { className: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Plus gros écarts"), h("th", null, "Prono"), h("th", null, "Toi"))),
            h("tbody", null, withP.slice().sort((a, b) => Math.abs(b.note - b.prono) - Math.abs(a.note - a.prono)).slice(0, 6).map(d => h("tr", { key: d.artist + d.song }, h("td", null, d.song), h("td", { className: "n" }, String(d.prono)), h("td", { className: "n" }, String(d.note))))))))
          : h("p", null, "Note des morceaux à pronostic pour lancer le duel.")),
      h("section", { className: "panel" },
        h("h3", null, "Fournée après fournée"),
        h("p", null, "Ta moyenne (barre ambre) et mon pronostic moyen (trait bleu)."),
        h("div", { className: "hbars" }, bRows.map(r => h("div", { key: r.label, className: "hbar", title: r.n + " morceaux · " + r.hits + " en playlist" },
          h("span", { className: "lab" }, r.label), h("div", { className: "tr" }, h("i", { style: { width: (r.m * 10) + "%" } }), r.pm != null ? h("i", { className: "p", style: { width: (r.pm * 10) + "%" } }) : null), h("span", { className: "v" }, fmt(r.m))))),
        scale,
        h("div", { className: "bigs" }, bRows.filter(r => typeof r.b === "number").map(r => h("div", { key: r.label }, h("b", { style: { fontSize: 26 } }, Math.round(r.hits / r.n * 100) + "%"), h("span", null, batchLabel(r.b) + " en playlist"))))),
      h("section", { className: "panel wide" },
        h("h3", null, "Ce qui pèse sur ta note"),
        h("p", null, "Note moyenne des morceaux portant chaque mot-clé, comparée à ta moyenne (" + fmt(avg) + "). Mots-clés présents sur au moins 3 morceaux."),
        imp.length ? h(Fragment, null, h("div", { className: "ihead" }, h("span"), h("div", null, h("span", null, "← fait baisser"), h("span", null, "fait monter →")), h("span")),
          h("div", { className: "imp" }, imp.map(r => h("div", { key: r.k + r.v, className: "irow" }, h("span", null, r.label),
            h("div", { className: "b2" }, h("i", { className: r.diff >= 0 ? "pos" : "neg", style: { width: (Math.abs(r.diff) / span * 50) + "%" } })),
            h("span", { className: "v" }, fmt(r.m) + " ", h("small", null, "×" + r.n))))))
          : h("p", { className: "empty" }, "Pas encore assez de mots-clés.")),
      aRows.length ? h("section", { className: "panel" }, h("h3", null, "Artistes"), h("p", null, "Notés au moins deux fois."),
        h("div", { className: "hbars" }, aRows.map(r => h("div", { key: r.label, className: "hbar", title: r.n + " morceaux" }, h("span", { className: "lab" }, r.label), h("div", { className: "tr" }, h("i", { style: { width: (r.m * 10) + "%" } })), h("span", { className: "v" }, fmt(r.m))))), scale) : null,
      fresh.length ? h("section", { className: "panel" }, h("h3", null, "L'effet « trop connue »"), h("p", null, "Ta note réelle et celle sans l'usure."),
        h("div", { className: "scroll" }, h("table", { className: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Morceau"), h("th", null, "Note"), h("th", null, "Sans usure"))),
          h("tbody", null, fresh.map(d => h("tr", { key: d.artist + d.song }, h("td", null, d.song), h("td", { className: "n" }, String(d.note)), h("td", { className: "n" }, String(d.fresh)))))))) : null,
      false ? h("section", { className: "panel" }, h("h3", null, "Idéale pour"),
        h("div", { className: "hbars" }, Object.entries(ctx).sort((a, b) => b[1] - a[1]).map(([c, n]) => h("div", { key: c, className: "hbar" }, h("span", { className: "lab" }, c), h("div", { className: "tr" }, h("i", { style: { width: (n / ctxMax * 100) + "%" } })), h("span", { className: "v" }, String(n)))))) : null));
}

export function ViewCompositions() {
  const app = useApp();
  const [seedSong, setSeedSong] = useState(""), [seedArtist, setSeedArtist] = useState(""), [title, setTitle] = useState("");
  const [genre, setGenre] = useState("rock");
  const [genreNote, setGenreNote] = useState("");
  const [msg, setMsg] = useState({ t: "", c: "" });
  const [busy, setBusy] = useState(false);
  const list = app.sessionList;
  const create = async e => {
    e.preventDefault();
    if (!seedSong.trim() || !seedArtist.trim()) { setMsg({ t: "Il faut un titre et un artiste de départ.", c: "err" }); return; }
    let id = slug(seedArtist + " " + seedSong).slice(0, 60) || "compo";
    if (app.sessions[id]) id += "-" + Date.now().toString(36);
    const order = Math.max(0, ...list.map(([, x]) => x.order || 0)) + 1;
    app.saveSession(id, { title: title.trim() || seedSong.trim(), seedSong: seedSong.trim(), seedArtist: seedArtist.trim(), genre, genreNote: genreNote.trim(), status: "active", createdAt: new Date().toISOString(), order, playlistName: "Sillon · " + (title.trim() || seedSong.trim()) });
    app.setActive(id);
    setSeedSong(""); setSeedArtist(""); setTitle(""); setGenreNote("");
    setMsg({ t: "Composition créée (id « " + id + " »). Demande la fournée 1 à Claude : elle arrivera depuis sillon-data.", c: "ok" });
  };
  return h(Fragment, null,
    h("header", { style: { display: "flex", flexDirection: "column", gap: 8 } }, h("div", { className: "eyebrow" }, "Compositions"), h("h1", { className: "h1" }, "La discothèque"),
      h("p", { className: "lede" }, "Chaque composition part d'un morceau, avance par fournées et finit pressée sur Spotify. Clique une pochette pour la mettre sur la platine.")),
    h("div", { className: "shelf" }, list.map(([id, s]) => {
      const docs = app.sessionDocs(id);
      const rated = docs.filter(isRated);
      return h("button", { key: id, type: "button", className: "lp" + (id === app.active ? " cur" : "") + (s.status === "archived" ? " archived" : ""),
        onClick: () => { app.setActive(id); app.setView(s.status === "archived" ? "playlist" : "decouvrir"); }, "aria-label": "Ouvrir " + s.title },
        h(Sleeve, { s, spin: id === app.active && s.status !== "archived" }),
        h("div", { className: "meta2" },
          h("div", { className: "row" }, h("span", { className: "gchip" }, G(s.genre || "rock").label), h("span", { className: "badge " + (s.status === "archived" ? "" : "ok") }, s.status === "archived" ? "Dans le bac" : id === app.active ? "Sur la platine" : "En cours")),
          h("b", null, s.seedArtist + " – " + s.seedSong),
          h("span", null, rated.length + " notés · " + docs.filter(inPlaylist).length + " pressables · " + Math.max(0, ...docs.map(batchNum)) + " fournées" + (Array.isArray(s.pressings) && s.pressings.length ? " · " + s.pressings.length + " pressage(s)" : ""))));
    })),
    h("section", { className: "panel" },
      h("h3", null, "Nouvelle composition"),
      h("p", null, "Donne le morceau de départ. La composition est créée dans sillon-data ; Claude y préparera la fournée 1."),
      h("form", { onSubmit: create, style: { display: "flex", flexDirection: "column", gap: 10 } },
        h("div", { className: "row" },
          h("input", { className: "field", style: { flex: "1 1 200px" }, value: seedSong, placeholder: "Titre de départ", "aria-label": "Titre de départ", onChange: e => setSeedSong(e.target.value) }),
          h("input", { className: "field", style: { flex: "1 1 180px" }, value: seedArtist, placeholder: "Artiste", "aria-label": "Artiste", onChange: e => setSeedArtist(e.target.value) }),
          h("input", { className: "field", style: { flex: "1 1 180px" }, value: title, placeholder: "Nom de la compo (facultatif)", "aria-label": "Nom", onChange: e => setTitle(e.target.value) })),
        h("div", { className: "row" },
          h("select", { className: "field", value: genre, onChange: e => setGenre(e.target.value), "aria-label": "Genre" }, Object.entries(GENRES).map(([k, g]) => h("option", { key: k, value: k }, g.label))),
          h("input", { className: "field", style: { flex: "1 1 260px" }, value: genreNote, placeholder: "Précise si tu veux : « boom bap 90s », « techno berlinoise »…", "aria-label": "Précision du genre", onChange: e => setGenreNote(e.target.value) })),
        h("p", null, "Le genre choisit les mots-clés proposés : flow et prod pour le rap, drop et build-up pour l'électro, impro et swing pour le jazz…"),
        h("div", { className: "row" }, h("button", { type: "submit", className: "btn primary", disabled: busy }, busy ? "Création…" : "Démarrer la composition"), msg.t ? h("span", { className: "status " + msg.c, role: "status" }, msg.t) : null))),
    h("section", { className: "panel" }, h("h3", null, "Sauvegarde"), h("p", null, "Toutes tes compositions, notes et pressages dans un fichier, au cas où."),
      h("div", { className: "row" }, h("button", { type: "button", className: "btn", onClick: () => app.exportData() }, "Exporter mes données"))));
}
