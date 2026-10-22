import { h, Fragment, useState, useEffect, useMemo, useApp, LS, DIRECTIONS, G, slug, isRated, inPlaylist } from "./core.js";
import { Rec, Links } from "./components.js";

/*
  Explorer : file de demandes.
  L'app écrit data/requests/<id>.json ; Claude y répond dans le dépôt en remplissant `results` et en passant `status` à "done".
  Format d'une demande :
    { createdAt, status: "pending" | "done" | "archived", session, genre,
      seed: { id, artist, song, note, comment } | null, free: "Artiste – Titre" | "",
      directions: ["Plus d'énergie", …], count,
      results: [{ song, artist, year, why, prono, spUri?, spUrl?, spAlbum?, spMs? }], note: "réponse de Claude" }
*/
const fmtDate = s => { try { return new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };

export function ViewExplorer() {
  const app = useApp();
  const saved = useMemo(() => LS.get("sillon-explore", {}), []);
  const [seed, setSeed] = useState(app.exploreSeed || saved.seed || "");
  const [free, setFree] = useState("");
  const [dirs, setDirs] = useState(() => new Set());
  const [count, setCount] = useState(6);
  const [msg, setMsg] = useState({ t: "", c: "" });
  const [showOld, setShowOld] = useState(false);
  useEffect(() => { if (app.exploreSeed) setSeed(app.exploreSeed); }, [app.exploreSeed]);
  useEffect(() => { LS.set("sillon-explore", { seed }); }, [seed]);
  const rated = Object.entries(app.docs).filter(([, d]) => isRated(d)).sort((a, b) => b[1].note - a[1].note);
  const reqs = Object.entries(app.requests).sort((a, b) => String(b[1].createdAt || "").localeCompare(String(a[1].createdAt || "")));
  const live = reqs.filter(([, r]) => r.status !== "archived");
  const old = reqs.filter(([, r]) => r.status === "archived");

  const send = () => {
    const d = seed && app.docs[seed];
    const freeTxt = free.trim();
    if (!freeTxt && !d) { setMsg({ t: "Choisis un morceau de départ.", c: "err" }); return; }
    const genre = d && !freeTxt ? app.genreOfDoc(d) : ((app.sessions[app.active] || {}).genre || "rock");
    const now = new Date();
    const label = freeTxt || (d.artist + " – " + d.song);
    const id = now.toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2") + "-" + (slug(label).slice(0, 40) || "demande");
    app.createRequest(id, {
      createdAt: now.toISOString(), status: "pending", session: app.active, genre,
      seed: d && !freeTxt ? { id: seed, artist: d.artist, song: d.song, note: isRated(d) ? d.note : null, comment: d.comment || "" } : null,
      free: freeTxt, directions: DIRECTIONS.filter(([k]) => dirs.has(k)).map(([, l]) => l), count, results: [],
    });
    setFree(""); setDirs(new Set());
    setMsg({ t: "Demande envoyée dans sillon-data. Demande à Claude d'y répondre : les propositions apparaîtront ici.", c: "ok" });
  };

  const add = (r, req) => {
    const id = slug(r.artist + " " + r.song);
    if (app.docs[id]) return;
    const seedLabel = req.free || (req.seed ? req.seed.artist + " – " + req.seed.song : "Explorer");
    app.createDoc(id, { song: r.song, artist: r.artist, year: r.year || null, why: r.why || "", prono: typeof r.prono === "number" ? r.prono : null, group: "Explorer · " + seedLabel, fournee: "X", seed: seedLabel,
      session: req.session || app.active, spUri: r.spUri, spUrl: r.spUrl, spAlbum: r.spAlbum, spMs: r.spMs, verified: !!r.spUri, addedAt: new Date().toISOString() });
  };

  const reqCard = ([rid, req]) => {
    const label = req.free || (req.seed ? req.seed.artist + " – " + req.seed.song : "?");
    const results = Array.isArray(req.results) ? req.results.filter(r => r && r.song && r.artist) : [];
    const done = req.status === "done";
    return h("section", { key: rid, className: "group" },
      h("div", { className: "ghead" },
        h("h2", { className: "h2" }, label,
          done ? h("span", { className: "badge ok" }, results.length + " propositions") : req.status === "archived" ? h("span", { className: "badge" }, "rangée") : h("span", { className: "badge amber" }, "en attente de Claude")),
        h("p", null, G(req.genre).label + " · " + req.count + " titres" + (req.directions && req.directions.length ? " · " + req.directions.join(", ") : "") + " · " + fmtDate(req.createdAt)),
        req.note ? h("p", { className: "why" }, req.note) : null),
      results.length ? h("div", { className: "cards" }, results.map(r => {
        const id = slug(r.artist + " " + r.song);
        const added = !!app.docs[id];
        return h("div", { key: id, className: "sugg" },
          h(Rec, { d: r, small: true }),
          h("div", { className: "ctitle" }, h("b", null, r.song), h("div", { className: "by" }, h("span", null, r.artist + (r.year ? " · " + r.year : "")), h(Links, { d: r }))),
          h("div", { className: "pr" }, "prono", h("b", null, typeof r.prono === "number" ? String(r.prono) : "?")),
          r.why ? h("p", { className: "why" }, r.why) : null,
          h("div", { className: "act" },
            h("button", { type: "button", className: added ? "btn sm ghost" : "btn sm primary", disabled: added, onClick: () => { add(r, req); app.toast("Ajouté à Découvrir"); } }, added ? "Dans Découvrir ✓" : "+ Ajouter à Découvrir"),
            r.spUri ? h("span", { className: "badge ok" }, "✓ sur Spotify") : h("span", { className: "badge" }, "non vérifié")));
      })) : null,
      h("div", { className: "row" },
        results.length ? h("button", { type: "button", className: "btn sm", onClick: () => { let n = 0; results.forEach(r => { if (!app.docs[slug(r.artist + " " + r.song)]) { add(r, req); n++; } }); app.toast(n + " titres ajoutés à Découvrir"); } }, "Tout ajouter à Découvrir") : null,
        req.status !== "archived"
          ? h("button", { type: "button", className: "btn sm ghost", onClick: () => app.updateRequest(rid, { status: "archived" }) }, "Ranger la demande")
          : h("button", { type: "button", className: "btn sm ghost", onClick: () => app.updateRequest(rid, { status: results.length ? "done" : "pending" }) }, "Ressortir")));
  };

  return h(Fragment, null,
    h("header", { style: { display: "flex", flexDirection: "column", gap: 8 } }, h("div", { className: "eyebrow" }, "Explorer"), h("h1", { className: "h1" }, "Pars d'un morceau"),
      h("p", { className: "lede" }, "Choisis un titre que tu aimes et une direction. La demande part dans sillon-data ; Claude y répond avec des morceaux proches, en tenant compte de toutes tes notes.")),
    h("section", { className: "panel" },
      h("div", { className: "eyebrow" }, "Point de départ"),
      h("div", { className: "row" },
        h("select", { className: "field", style: { flex: "1 1 260px" }, value: seed, onChange: e => { setSeed(e.target.value); setFree(""); }, "aria-label": "Morceau de départ" },
          h("option", { value: "" }, "Choisis un morceau…"),
          h("optgroup", { label: "Tes préférés" }, rated.filter(([, d]) => inPlaylist(d)).map(([id, d]) => h("option", { key: id, value: id }, d.note + " · " + d.artist + " – " + d.song))),
          h("optgroup", { label: "Les autres" }, rated.filter(([, d]) => !inPlaylist(d)).map(([id, d]) => h("option", { key: id, value: id }, d.note + " · " + d.artist + " – " + d.song)))),
        h("input", { className: "field", style: { flex: "1 1 220px" }, value: free, placeholder: "…ou tape « Artiste – Titre »", onChange: e => setFree(e.target.value), "aria-label": "Morceau libre" })),
      h("div", { className: "eyebrow" }, "Direction (facultatif)"),
      h("div", { className: "row" }, DIRECTIONS.map(([k, l]) => h("button", { key: k, type: "button", className: "dchip", "aria-pressed": dirs.has(k) ? "true" : "false",
        onClick: () => setDirs(sv => { const n = new Set(sv); n.has(k) ? n.delete(k) : n.add(k); return n; }) }, l))),
      h("div", { className: "row" },
        h("select", { className: "field", value: String(count), onChange: e => setCount(Number(e.target.value)), "aria-label": "Nombre" }, [4, 6, 8, 10].map(c => h("option", { key: c, value: String(c) }, c + " titres"))),
        h("button", { type: "button", className: "btn primary", onClick: send }, "Envoyer la demande à Claude"),
        h("button", { type: "button", className: "btn ghost", onClick: app.syncNow }, "↻ Synchroniser"),
        msg.t ? h("span", { className: "status " + msg.c, role: "status" }, msg.t) : null)),
    live.length ? live.map(reqCard) : h("p", { className: "empty" }, "Aucune demande en cours."),
    old.length ? h("details", { open: showOld, onToggle: e => setShowOld(e.currentTarget.open) },
      h("summary", { className: "status", style: { cursor: "pointer" } }, old.length + " demande(s) rangée(s)"),
      showOld ? h("div", { style: { display: "flex", flexDirection: "column", gap: 26, marginTop: 16 } }, old.map(reqCard)) : null) : null);
}
