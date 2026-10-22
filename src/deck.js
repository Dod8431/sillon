import { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext, Fragment, h, Ctx, useApp, slug, norm, GENRES, uniq, ALL_QUALS, FLAGS, NEW_TAGS, G, CONTEXTS, DIRECTIONS, LEGACY, DEFAULT_SESSION, catNo, SAVE_KEYS, VIEWS, LS, spLink, mean, fmt, isRated, inPlaylist, sessionOf, hue, discStyle, lvl, segColor, fmtMin, qualList, isFlag, batchOf, batchNum, batchLabel, batchLong, normalizeDoc, initialView, tagImpact } from "./core.js";
import { Disc, initials, Rec, Cover, Sleeve, useVizSim, reduceMotion, cssVar, VizStrip, VizRing, energyOf, Turntable, Links, TagMini, VU, TextField, TagPad, TrackCard } from "./components.js";

/* ============ Barre de lecture (Spotify dans l'app ou sur un appareil) ============ */
function PlayBar({ d }) {
  const app = useApp();
  const s = app.pb, ctl = app.pbCtl;
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick(x => x + 1), 500); return () => clearInterval(iv); }, []);
  useEffect(() => {
    if (s.mode !== "connect") return;
    const go = () => ctl.refresh().catch(() => {});
    go();
    const iv = setInterval(go, 5000);
    return () => clearInterval(iv);
  }, [s.mode, s.uri]);
  const dur = s.duration || Number(d.spMs) || 0;
  const pos = Math.min(dur || Infinity, ctl.positionNow());
  const seek = e => { if (!dur) return; const r = e.currentTarget.getBoundingClientRect(); ctl.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur).catch(() => {}); };
  return h("div", { className: "playbar" },
    h("button", { type: "button", className: "tap", onClick: () => app.playTrack(d) }, s.paused ? "▶ Lire" : "❚❚ Pause"),
    h("span", { className: "mono t" }, fmtMin(pos)),
    h("div", { className: "pbar", role: "slider", tabIndex: 0, "aria-label": "Position dans le morceau", "aria-valuemin": 0, "aria-valuemax": Math.round(dur / 1000), "aria-valuenow": Math.round(pos / 1000), onClick: seek,
      onKeyDown: e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); ctl.seek(Math.max(0, pos + (e.key === "ArrowRight" ? 10000 : -10000))).catch(() => {}); } } },
      h("i", { style: { width: (dur ? Math.min(100, pos / dur * 100) : 0) + "%" } })),
    h("span", { className: "mono t" }, dur ? fmtMin(dur) : "–:––"),
    h("span", { className: "where" }, "♪ " + (s.mode === "sdk" ? "dans Sillon" : "sur " + (s.deviceName || "Spotify"))));
}

/* ============ Mode écoute ============ */
export function Deck() {
  const app = useApp();
  const dk = app.deck;
  const [auto, setAuto] = useState(() => LS.get("sillon-auto", false));
  const [playing, setPlaying] = useState(null);
  const prevUri = useRef(null);
  const boxRef = useRef(null);
  const platterRef = useRef(null);
  const taps = useRef([]);
  const [tapHit, setTapHit] = useState(false);
  useEffect(() => { LS.set("sillon-auto", auto); }, [auto]);
  const id = dk.queue[dk.i];
  const d = app.docs[id];
  const done = dk.queue.filter(x => isRated(app.docs[x])).length;
  const tap = () => {
    const now = performance.now();
    taps.current = taps.current.filter(t => now - t < 3000).concat(now);
    setTapHit(true); setTimeout(() => setTapHit(false), 90);
    if (taps.current.length >= 3) {
      const iv = []; for (let i = 1; i < taps.current.length; i++) iv.push(taps.current[i] - taps.current[i - 1]);
      const bpm = Math.round(60000 / mean(iv.slice(-6)));
      if (bpm >= 50 && bpm <= 240 && bpm !== app.docs[id].bpm) app.updateDoc(id, { bpm }, 1200);
    }
  };
  const next = useCallback(() => { if (dk.i < dk.queue.length - 1) app.setDeck({ ...dk, i: dk.i + 1 }); else { app.toast("Session terminée · " + done + " notés"); app.closeDeck(); } }, [dk, done, app]);
  const prev = useCallback(() => { if (dk.i > 0) app.setDeck({ ...dk, i: dk.i - 1 }); }, [dk, app]);
  useEffect(() => {
    const onKey = e => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) { if (e.key === "Escape") t.blur(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") { e.preventDefault(); app.closeDeck(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); const n = e.key === "0" ? 10 : Number(e.key); if (app.docs[id] && app.docs[id].note !== n) { app.setNote(id, n); if (auto) setTimeout(next, 700); } }
      else if (e.key === "h" || e.key === "H") { e.preventDefault(); app.updateDoc(id, { heart: !app.docs[id].heart }); }
      else if ((e.key === "o" || e.key === "O") && isRated(app.docs[id])) { e.preventDefault(); app.updateDoc(id, { offtopic: !app.docs[id].offtopic }); }
      else if ((e.key === "p" || e.key === "P") && platterRef.current) { e.preventDefault(); platterRef.current.click(); }
      else if (e.key === "t" || e.key === "T") { e.preventDefault(); tap(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, next, prev, auto, app, tap]);
  useEffect(() => { if (boxRef.current && boxRef.current.parentElement) boxRef.current.parentElement.scrollTop = 0; }, [id]);
  useEffect(() => {
    if (!app.spOn) return;
    [dk.queue[dk.i], dk.queue[dk.i + 1]].forEach(x => { if (x && app.docs[x] && !app.docs[x].spUrl) app.resolveOne(x).catch(() => {}); });
  }, [id, app.spOn]);
  // Prépare le lecteur dès l'ouverture de la platine (le SDK met une seconde à se connecter).
  useEffect(() => { if (app.spOn) app.pbInit(); }, [app.spOn]);
  // Changement de titre pendant la lecture : on enchaîne sur le nouveau vinyle.
  useEffect(() => {
    const pb = app.pb, cur = d && d.spUri;
    if (pb && !pb.paused && pb.uri && pb.uri === prevUri.current && cur && cur !== pb.uri) app.playTrack(d);
    prevUri.current = cur || null;
  }, [id]);
  if (!d) return null;
  const pb = app.pb;
  const inApp = app.spOn && d.spUri ? () => app.playTrack(d) : null;
  const mine = !!(pb && d.spUri && pb.uri === d.spUri);
  const isPlaying = inApp ? mine && !pb.paused : playing === id;
  const hint = inApp ? (isPlaying ? "● Lecture " + (pb.mode === "sdk" ? "dans Sillon" : "sur " + (pb.deviceName || "Spotify")) : mine ? "En pause · P" : pb && pb.mode === "loading" ? "Préparation du lecteur…" : "Clique le vinyle · P") : null;
  return h("div", { className: "deck", onClick: e => { if (e.target === e.currentTarget) app.closeDeck(); } },
    h("div", { className: "deckbox", ref: boxRef, role: "dialog", "aria-modal": "true", "aria-label": "Platine" },
      h("div", { className: "dbar" },
        h("span", { className: "pos" }, (dk.i + 1) + " / " + dk.queue.length + " · " + done + " notés"),
        h("label", { className: "toggle" }, h("input", { type: "checkbox", checked: auto, onChange: e => setAuto(e.target.checked) }), "Suivant auto"),
        h("button", { type: "button", className: "btn sm ghost", disabled: dk.i === 0, onClick: prev, "aria-label": "Précédent" }, "←"),
        h("button", { type: "button", className: "btn sm", onClick: next }, dk.i === dk.queue.length - 1 ? "Terminer" : "Suivant →"),
        h("button", { type: "button", className: "btn sm ghost", onClick: app.closeDeck, "aria-label": "Fermer" }, "✕")),
      h("div", { className: "meter" }, h("i", { style: { width: (done / dk.queue.length * 100) + "%" } })),
      h("div", { className: "dstage" },
        h(Turntable, { d, playing: isPlaying, platterRef, onPlay: () => setPlaying(id), bpm: d.bpm, inApp, hint }),
        h("div", { style: { minWidth: 0 } },
          h("div", { className: "row eyebrow" }, batchLong(batchOf(d)) + (d.group ? " · " + d.group : ""), typeof d.prono === "number" && d.prono >= 9 && !isRated(d) ? h("span", { className: "badge hot" }, "Pari fort") : null),
          h("div", { className: "ttl" }, d.song),
          h("div", { className: "by" }, h("span", null, d.artist + (d.spAlbum ? " · " + d.spAlbum : "") + (d.spMs ? " · " + fmtMin(d.spMs) : "")), h(Links, { d })),
          h("div", { className: "row", style: { marginTop: 10 } },
            h("span", { className: "bignum " + lvl(d.note), style: { fontSize: 64 } }, isRated(d) ? String(d.note) : "–"),
            h("button", { type: "button", className: "heart", "aria-pressed": d.heart ? "true" : "false", "aria-label": "Coup de cœur", onClick: () => app.updateDoc(id, { heart: !d.heart }) }, "♥"),
            isRated(d) ? h("button", { type: "button", className: "offbtn", "aria-pressed": d.offtopic ? "true" : "false", title: "Hors sujet (O)", onClick: () => app.updateDoc(id, { offtopic: !d.offtopic }) }, d.offtopic ? "Hors sujet ✓" : "Hors sujet") : null))),
      h(VizStrip, { playing: isPlaying, bpm: d.bpm, energy: energyOf(d) }),
      mine ? h(PlayBar, { d }) : null,
      h("div", { className: "vizbar" },
        h("button", { type: "button", className: "tap" + (tapHit ? " hit" : ""), onClick: tap }, "Tape le tempo · T"),
        d.bpm ? h("span", { className: "bpm" }, "♩ " + d.bpm + " BPM") : h("span", null, "tempo par défaut 118"),
        h("span", null, isPlaying ? "Le visualiseur danse sur ton tempo et l'énergie du morceau (Spotify ne partage pas le son)." : "Lance le vinyle pour réveiller le visualiseur."),
        app.spOn && pb && pb.error === "reauth" ? h("button", { type: "button", className: "linkbtn", onClick: app.spLogin }, "Reconnecte Spotify pour lire dans Sillon") : null),
      h(TrackCard, { key: id, id, mode: "deck", openTags: true }),
      h("div", { className: "keys" }, h("span", null, h("kbd", null, "P"), inApp ? " lire / pause" : " lancer sur Spotify"), h("span", null, h("kbd", null, "T"), " taper le tempo"), h("span", null, h("kbd", null, "1"), "–", h("kbd", null, "9"), " noter"), h("span", null, h("kbd", null, "0"), " = 10"), h("span", null, h("kbd", null, "H"), " coup de cœur"),
        h("span", null, h("kbd", null, "←"), h("kbd", null, "→"), " naviguer"), h("span", null, h("kbd", null, "Échap"), " fermer"))));
}

/* ============ La presse (animation de pressage) ============ */
export function PressOverlay() {
  const app = useApp();
  const p = app.press;
  const order = p.steps.map(x => x.k);
  const cur = p.step;
  const idx = order.indexOf(cur);
  const lab = { "--lab": "hsl(" + hue((p.s.title || "") + (p.s.seedArtist || "")) + " 62% 56%)" };
  const finished = cur === "done" || cur === "err";
  return h("div", { className: "pressov", "data-step": cur, role: "dialog", "aria-modal": "true", "aria-label": "Pressage en cours" },
    h("div", { className: "pressbox" },
      h("div", { className: "row" }, h("span", { className: "cat" }, catNo(p.s)), h("span", { className: "eyebrow" }, p.replace ? "Repressage" : "Pressage"), h("span", { className: "eyebrow", style: { marginLeft: "auto" } }, p.count + " titres")),
      h("div", { className: "h2", style: { fontSize: 30 } }, p.name),
      h("div", { className: "machine", "aria-hidden": "true", style: lab },
        h("span", { className: "col1" }), h("span", { className: "col2" }),
        h("span", { className: "steam s1" }), h("span", { className: "steam s2" }), h("span", { className: "steam s3" }),
        h("span", { className: "ram" }), h("span", { className: "bed" }), h("span", { className: "puck" }),
        h("span", { className: "record" }, h(Disc, { artist: (p.s.seedArtist || p.s.title), spin: cur === "groove" || cur === "old", label: p.name.slice(0, 18) })),
        h("span", { className: "sl" }, h(Cover, { s: { ...p.s, title: p.name } }))),
      h("ul", { className: "psteps" }, p.steps.map((st, i) => {
        const state = cur === "err" ? (i < p.failAt ? "ok" : i === p.failAt ? "ko" : "") : cur === "done" ? "ok" : i < idx ? "ok" : i === idx ? "on" : "";
        return h("li", { key: st.k, className: state }, h("i", null, state === "ok" ? "✓" : state === "ko" ? "!" : ""), st.label, st.sub ? h("small", null, st.sub) : null);
      })),
      p.msg ? h("p", { className: "status " + (cur === "err" ? "err" : cur === "done" ? "ok" : ""), role: "status", style: { margin: 0 } }, p.msg) : null,
      finished ? h("div", { className: "row" },
        p.url ? h("a", { className: "btn primary", href: p.url, target: "sillon_spotify" }, "Écouter le pressage ↗") : null,
        h("button", { type: "button", className: "btn", onClick: app.closePress }, "Fermer")) : null));
}
