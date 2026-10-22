import { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext, Fragment, h, Ctx, useApp, slug, norm, GENRES, uniq, ALL_QUALS, FLAGS, NEW_TAGS, G, CONTEXTS, DIRECTIONS, LEGACY, DEFAULT_SESSION, catNo, SAVE_KEYS, VIEWS, LS, spLink, mean, fmt, isRated, inPlaylist, sessionOf, hue, discStyle, lvl, segColor, fmtMin, qualList, isFlag, batchOf, batchNum, batchLabel, batchLong, normalizeDoc, initialView, tagImpact } from "./core.js";

/* ============ Petits composants ============ */
export function Disc({ artist, spin, label, slow }) {
  return h("span", { className: "disc" + (spin ? " spin" : "") + (slow ? " slow" : ""), style: discStyle(artist), "aria-hidden": "true" }, label ? h("span", { className: "lbl" }, label) : null);
}
export const initials = a => String(a || "?").replace(/^the\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("");
export function Rec({ d, small, link }) {
  const hh = hue(d.artist);
  const style = { "--sl": "hsl(" + hh + " 40% 30%)", "--sl2": "hsl(" + ((hh + 50) % 360) + " 58% 56%)" };
  const kids = [h("span", { key: "s", className: "slv p" + (hh % 3) }, h("b", null, initials(d.artist))), h("span", { key: "d", className: "disc", style: discStyle(d.artist) })];
  const cls = "rec" + (small ? " sm" : "");
  if (link !== false && spLink(d)) return h("a", { className: cls, style, href: spLink(d), target: "sillon_spotify", title: d.spUrl ? "Écouter sur Spotify" : "Chercher sur Spotify", "aria-label": "Écouter " + d.song + " sur Spotify" }, kids);
  return h("span", { className: cls, style, "aria-hidden": "true" }, kids);
}
export function Cover({ s }) {
  const hh = hue((s.title || "") + (s.seedArtist || ""));
  const style = { "--c1": "hsl(" + hh + " 58% 46%)", "--c2": "hsl(" + ((hh + 140) % 360) + " 62% 62%)", "--c3": "hsl(" + ((hh + 30) % 360) + " 38% 15%)" };
  return h("div", { className: "cover v" + (hh % 4), style, "aria-hidden": "true" },
    h("span", { className: "cn" }, catNo(s) + " · " + G(s.genre || "rock").label), h("span", { className: "ct" }, s.title || "Sans titre"));
}
export function Sleeve({ s, spin }) {
  return h("div", { className: "sleeve" }, h(Disc, { artist: s.seedArtist || s.title, spin, slow: true, label: catNo(s) }), h(Cover, { s }));
}

/* Visualiseur d'ambiance : Spotify ne partage pas le son avec la page, donc l'animation est générée,
   calée sur le tempo que tu tapes et sur l'énergie du morceau (ses mots-clés). */
export function useVizSim(playing, bpm, energy, n) {
  const st = useRef(null);
  if (!st.current || st.current.n !== n) st.current = { n, lv: new Float32Array(n), pk: new Float32Array(n), t0: performance.now(), seed: Math.random() * 100 };
  return now => {
    const S = st.current, t = (now - S.t0) / 1000;
    const beat = 60 / (bpm || 118), ph = (t % beat) / beat, kick = Math.exp(-ph * 7), snare = Math.exp(-(((t + beat / 2) % beat) / beat) * 9);
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const wob = .5 + .5 * Math.sin(t * (1.1 + f * 3.3) + i * 1.7 + S.seed) * Math.sin(t * (.6 + f * .9) + i * .4);
      let target = 0.03;
      if (playing) {
        target = energy * (0.18 + 0.55 * wob * (1 - f * .55));
        if (f < .18) target += kick * .55 * energy;
        else if (f < .5) target += snare * .25 * energy;
        else if (Math.random() < .04) target += .25 * energy;
      }
      target = Math.min(1, target);
      S.lv[i] += (target - S.lv[i]) * (target > S.lv[i] ? .55 : .1);
      S.pk[i] = Math.max(S.pk[i] - .006, S.lv[i]);
    }
    return S;
  };
}
export const reduceMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
export function cssVar(name) { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888"; } catch (e) { return "#888"; } }
export function VizStrip({ playing, bpm, energy }) {
  const ref = useRef(null);
  const sim = useVizSim(playing, bpm, energy, 44);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const cols = [cssVar("--plus"), cssVar("--accent"), cssVar("--hot")];
    let raf;
    const draw = now => {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, hh = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hh);
      const S = sim(now), n = S.n, gap = 3, bw = (w - 16 - gap * (n - 1)) / n, seg = 4, sgap = 2, rows = Math.floor((hh - 14) / (seg + sgap));
      for (let i = 0; i < n; i++) {
        const lit = Math.round(S.lv[i] * rows), x = 8 + i * (bw + gap);
        for (let r = 0; r < rows; r++) {
          const y = hh - 7 - (r + 1) * (seg + sgap) + sgap, fr = r / rows;
          ctx.fillStyle = fr > .82 ? cols[2] : fr > .6 ? cols[1] : cols[0];
          ctx.globalAlpha = r < lit ? .95 : .08;
          ctx.fillRect(x, y, bw, seg);
        }
        const pr = Math.round(S.pk[i] * rows);
        if (pr > 0) { ctx.globalAlpha = .9; ctx.fillStyle = "#fff"; ctx.fillRect(x, hh - 7 - pr * (seg + sgap), bw, 1.5); }
      }
      ctx.globalAlpha = 1;
      if (!reduceMotion()) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playing, bpm, energy]);
  return h("canvas", { ref, className: "viz", "aria-hidden": "true" });
}
export function VizRing({ playing, bpm, energy, color }) {
  const ref = useRef(null);
  const sim = useVizSim(playing, bpm, energy, 72);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const acc = cssVar("--accent"), hot = cssVar("--hot");
    let raf;
    const draw = now => {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, hh = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hh);
      const S = sim(now), cx = w / 2, cy = hh / 2, r0 = Math.min(w, hh) * .43, len = Math.min(w, hh) * .075;
      ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.5, w / 160);
      for (let i = 0; i < S.n; i++) {
        const a = (i / S.n) * Math.PI * 2 - Math.PI / 2, v = S.lv[i % S.n];
        ctx.strokeStyle = v > .75 ? hot : color || acc; ctx.globalAlpha = .25 + v * .75;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * (r0 + 2 + v * len), cy + Math.sin(a) * (r0 + 2 + v * len)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (playing && !reduceMotion()) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playing, bpm, energy, color]);
  return h("canvas", { ref, className: "ring", "aria-hidden": "true" });
}
export const energyOf = d => { const t = d.tags || {}; let e = .82; if (t.energie > 0) e += .12; if (t.energie < 0) e -= .25; if (t.explosion > 0 || t.drop > 0) e += .1; if (t.lent) e -= .2; return Math.max(.35, Math.min(1, e)); };

export function Turntable({ d, playing, onPlay, platterRef, bpm }) {
  const arm = h("span", { className: "arm", "aria-hidden": "true" }, h("i", { className: "bar" }), h("i", { className: "hd" }), h("i", { className: "pv" }));
  const disc = h("span", { className: "disc" + (playing ? " spin" : ""), style: discStyle(d.artist) }, h("span", { className: "lbl" }, initials(d.artist)));
  const platter = spLink(d)
    ? h("a", { ref: platterRef, className: "platter", href: spLink(d), target: "sillon_spotify", onClick: onPlay, title: d.spUrl ? "Lancer sur Spotify" : "Chercher sur Spotify", "aria-label": "Lancer " + d.song + " sur Spotify" }, disc)
    : h("span", { className: "platter", "aria-disabled": "true", title: "Recherche du morceau sur Spotify" }, disc);
  return h("div", { className: "tt" + (playing ? " playing" : "") }, h(VizRing, { playing, bpm, energy: energyOf(d), color: "hsl(" + hue(d.artist) + " 70% 62%)" }), h("span", { className: "led", "aria-hidden": "true" }), platter, arm,
    h("span", { className: "hint" }, spLink(d) ? (playing ? (d.spUrl ? "● Lancé sur Spotify" : "● Recherche ouverte sur Spotify") : (d.spUrl ? "Clique le vinyle · P" : "Clique le vinyle : recherche Spotify")) : ""));
}
export function Links({ d, explore }) {
  const app = useApp();
  const q = encodeURIComponent(d.artist + " " + d.song);
  return h(Fragment, null,
    d.spUrl ? h("a", { className: "linkbtn", href: d.spUrl, target: "_blank", rel: "noopener" }, "Spotify ♫")
      : h("a", { className: "linkbtn", href: "https://open.spotify.com/search/" + q, target: "_blank", rel: "noopener" }, "Spotify ↗"),
    h("a", { className: "linkbtn", href: "https://www.youtube.com/results?search_query=" + q, target: "_blank", rel: "noopener" }, "YouTube ↗"),
    explore && isRated(d) && d.note >= 6 ? h("button", { type: "button", className: "linkbtn", onClick: () => app.exploreFrom(d) }, "Explorer depuis ✦") : null);
}
export function TagMini({ d, limit, custom }) {
  const out = [];
  Object.entries(d.tags || {}).forEach(([k, v]) => {
    if (!v) return;
    const f = isFlag(k);
    const label = (qualList(custom).concat(FLAGS).find(t => t[0] === k) || [k, k])[1];
    out.push({ k, pos: v > 0 && !f, text: (f ? "" : v > 0 ? "+ " : "− ") + label });
  });
  out.sort((a, b) => (a.pos ? 0 : 1) - (b.pos ? 0 : 1));
  return h(Fragment, null, out.slice(0, limit || 99).map(t => h("span", { key: t.k, className: "mini " + (t.pos ? "p" : "m") }, t.text)));
}

export function VU({ value, onPick, big, label }) {
  const [hover, setHover] = useState(null);
  const shown = hover != null ? hover : value;
  return h("div", { className: "vu" + (big ? " big" : ""), role: "group", "aria-label": label, onMouseLeave: () => setHover(null) },
    Array.from({ length: 11 }, (_, i) => {
      const lit = shown != null && i <= shown;
      return h("button", {
        key: i, type: "button", className: (lit ? "lit" : "") + (value === i ? " peak" : ""), style: { "--c": segColor(i) },
        "aria-pressed": value === i ? "true" : "false", "aria-label": "Note " + i,
        onMouseEnter: () => setHover(i), onClick: () => onPick(i),
      }, h("span", { className: "bar", style: { height: (22 + i * 7.8) + "%" } }), h("span", { className: "lab" }, String(i)));
    }));
}

/* Champ texte : garde sa valeur locale pendant la frappe, enregistre en pause ou à la sortie */
export function TextField({ value, onCommit, placeholder }) {
  const [v, setV] = useState(value || "");
  const focused = useRef(false);
  const timer = useRef(null);
  const last = useRef(value || "");
  useEffect(() => { if (!focused.current) { setV(value || ""); last.current = value || ""; } }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const commit = nv => { if ((nv || "") !== last.current) { last.current = nv || ""; onCommit(nv || ""); } };
  return h("input", {
    type: "text", className: "line", value: v, placeholder,
    onFocus: () => { focused.current = true; },
    onChange: e => { const nv = e.target.value; setV(nv); clearTimeout(timer.current); timer.current = setTimeout(() => commit(nv), 900); },
    onBlur: e => { focused.current = false; clearTimeout(timer.current); commit(e.target.value); },
    onKeyDown: e => { if (e.key === "Enter") e.currentTarget.blur(); },
  });
}

export function TagPad({ id, d }) {
  const app = useApp();
  const [draft, setDraft] = useState("");
  const setTag = (k, nv) => app.updateDoc(id, cur => { const t = { ...(cur.tags || {}) }; if (nv) t[k] = nv; else delete t[k]; return { tags: t }; }, 600);
  const genre = app.genreOfDoc(d);
  const mine = app.customTags.filter(t => (t[2] || "rock") === genre);
  const sections = G(genre).sections.concat(mine.length ? [{ name: "Tes mots-clés", tags: mine }] : []);
  return h("div", { className: "tagsecs" },
    sections.map(sec => h("div", { key: sec.name, className: "tagsec" },
      h("div", { className: "eyebrow" }, sec.name),
      sec.tags.map(([k, label]) => {
        const v = (d.tags || {})[k] || 0;
        return h("span", { key: k, className: "tg" + (v > 0 ? " plus" : v < 0 ? " minus" : "") },
          h("button", { type: "button", className: "bm", "aria-pressed": v < 0 ? "true" : "false", "aria-label": label + " moins", onClick: () => setTag(k, v < 0 ? 0 : -1) }, "−"),
          h("span", null, label, NEW_TAGS.has(k) ? h("sup", { className: "mono", style: { color: "var(--accent)", fontSize: 9, marginLeft: 3 } }, "new") : null),
          h("button", { type: "button", className: "bp", "aria-pressed": v > 0 ? "true" : "false", "aria-label": label + " plus", onClick: () => setTag(k, v > 0 ? 0 : 1) }, "+"));
      }))),
    h("div", { className: "tagsec" },
      h("div", { className: "eyebrow" }, "Défauts · " + G(genre).label),
      G(genre).flags.map(([k, label]) => {
        const on = !!(d.tags || {})[k];
        return h("button", { key: k, type: "button", className: "flag", "aria-pressed": on ? "true" : "false", onClick: () => setTag(k, on ? 0 : 1) }, label);
      }),
      h("input", { className: "newtag", value: draft, placeholder: "+ mot-clé " + G(genre).label, maxLength: 24, "aria-label": "Créer un mot-clé",
        onChange: e => setDraft(e.target.value), onKeyDown: e => { if (e.key === "Enter") { e.preventDefault(); app.addCustomTag(draft, genre); setDraft(""); } } })));
}

export function TrackCard({ id, mode, openTags }) {
  const app = useApp();
  const d = app.docs[id];
  if (!d) return null;
  const rated = isRated(d);
  const deck = mode === "deck";
  const bet = !rated && typeof d.prono === "number" && d.prono >= 9;
  const diff = rated && typeof d.prono === "number" ? d.note - d.prono : null;
  return h("article", { className: "card" + (app.seen.has(id) && !deck ? " done" : "") + (bet && !deck ? " bet" : "") },
    !deck ? h("div", { className: "chead" },
      h(Rec, { d }),
      h("div", { className: "ctitle" },
        h("b", null, d.song),
        h("div", { className: "by" }, h("span", null, d.artist + (d.spAlbum ? " · " + d.spAlbum : "")), h(Links, { d, explore: true }))),
      h("div", { className: "cnote" },
        bet ? h("span", { className: "badge hot" }, "Pari fort") : null,
        d.spMs ? h("span", { className: "badge" }, fmtMin(d.spMs)) : null,
        h("span", { className: "bignum " + lvl(d.note) }, rated ? String(d.note) : "–"),
        h("button", { type: "button", className: "heart", "aria-pressed": d.heart ? "true" : "false", "aria-label": "Coup de cœur", title: "Coup de cœur : va dans la playlist quelle que soit la note",
          onClick: () => app.updateDoc(id, { heart: !d.heart }) }, "♥"),
        rated ? h("button", { type: "button", className: "offbtn", "aria-pressed": d.offtopic ? "true" : "false", title: "J'aime, mais hors sujet : garde la note, sort de la playlist et du profil de la composition",
          onClick: () => app.updateDoc(id, { offtopic: !d.offtopic }) }, d.offtopic ? "Hors sujet ✓" : "Hors sujet") : null)) : null,
    d.why && !rated ? h("p", { className: "why" }, d.why) : null,
    h(VU, { value: rated ? d.note : null, onPick: n => app.setNote(id, n), big: deck, label: "Note pour " + d.song }),
    typeof d.prono === "number" ? h("div", { className: "prono" + (rated ? " reveal" : ""), key: rated ? "r" : "h" },
      rated ? h(Fragment, null, "Pronostic de Claude : ", h("b", { style: { color: "var(--ink)" } }, String(d.prono)),
        Math.abs(diff) <= 1 ? h("span", { className: "badge ok" }, "vu juste") : diff > 0 ? h("span", { className: "badge cool" }, "+" + diff + " : mieux que prévu") : h("span", { className: "badge ko" }, "raté de " + (-diff)))
        : "Pronostic de Claude caché jusqu'à ta note") : null,
    h("details", { className: "tz", open: openTags ? true : undefined },
      h("summary", null, "Mots-clés", h(TagMini, { d, custom: app.customTags }), Object.keys(d.tags || {}).length ? null : h("span", { className: "mini" }, "aucun")),
      h(TagPad, { id, d })),
    h("div", { className: "extras" },
      h("label", { className: "wide" }, h("span", null, "Commentaire"), h(TextField, { value: d.comment, placeholder: "Ton ressenti en une phrase", onCommit: v => app.updateDoc(id, { comment: v }) })),
      h("label", null, h("span", null, "Moment fort"), h(TextField, { value: d.moment, placeholder: "ex. 2:40, le solo", onCommit: v => app.updateDoc(id, { moment: v.trim() }) })),
      h("label", { title: "Si tu ne la connaissais pas déjà" }, h("span", null, "Note sans l'usure"),
        h("select", { className: "line", value: typeof d.fresh === "number" ? String(d.fresh) : "", onChange: e => app.updateDoc(id, { fresh: e.target.value === "" ? null : Number(e.target.value) }) },
          h("option", { value: "" }, "—"), Array.from({ length: 11 }, (_, n) => h("option", { key: n, value: String(n) }, String(n))))),
      h("label", null, h("span", null, "Tempo"), h("span", { className: "line", style: { color: d.bpm ? "var(--ink)" : "var(--muted)" } }, d.bpm ? "♩ " + d.bpm + " BPM" : "Tape-le sur la platine (T)"))));
}
