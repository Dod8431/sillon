import { h, Fragment, useState, useApp } from "./core.js";
import { CONFIG, redirectUri } from "./config.js";

export const SYNC_LABEL = {
  loading: ["Synchronisation…", "warn"], synced: ["Synchronisé", "on"], pending: ["En attente de sync", "warn"],
  offline: ["Hors ligne", "warn"], token: ["Erreur de jeton", "err"], notoken: ["Jeton GitHub manquant", "warn"], error: ["Erreur de sync", "err"],
};
export const syncLabel = st => { const [t, c] = SYNC_LABEL[st.status] || ["…", "warn"]; return { t: t + (st.status === "pending" && st.pending ? " · " + st.pending : ""), c }; };
const ago = iso => {
  if (!iso) return "jamais";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? "il y a " + s + " s" : s < 3600 ? "il y a " + Math.round(s / 60) + " min" : new Date(iso).toLocaleString("fr-FR");
};

export function ViewReglages() {
  const app = useApp();
  const st = app.syncState;
  const [tok, setTok] = useState("");
  const [test, setTest] = useState({ t: "", c: "" });
  const [confirmReset, setConfirmReset] = useState(false);
  const repo = CONFIG.dataRepo.owner + "/" + CONFIG.dataRepo.repo;
  const lab = syncLabel(st);
  const saveTok = async e => {
    e.preventDefault();
    const t = tok.trim();
    if (!t) return;
    app.setGhToken(t); setTok("");
    setTest({ t: "Vérification…", c: "" });
    setTest(await app.testGh());
  };
  return h(Fragment, null,
    h("header", { style: { display: "flex", flexDirection: "column", gap: 8 } }, h("div", { className: "eyebrow" }, "Réglages"), h("h1", { className: "h1" }, "La cabine"),
      h("p", { className: "lede" }, "Tes notes vivent dans le dépôt privé " + repo + ". Cet appareil en garde une copie pour marcher hors ligne.")),

    h("section", { className: "panel" },
      h("h3", null, h("span", { className: "dot " + lab.c }), "Données · " + repo),
      h("p", null, lab.t + (st.message ? " (" + st.message + ")" : "") + " · dernière synchro " + ago(st.lastSync) + " · " + Object.keys(app.docs).length + " titres, " + Object.keys(app.sessionsRaw).length + " compositions."),
      h("div", { className: "row" },
        h("button", { type: "button", className: "btn", onClick: app.syncNow, disabled: !app.hasGhToken }, "↻ Synchroniser maintenant"),
        app.hasGhToken ? h("button", { type: "button", className: "btn ghost", onClick: async () => { setTest({ t: "Vérification…", c: "" }); setTest(await app.testGh()); } }, "Tester le jeton") : null),
      h("form", { className: "row", onSubmit: saveTok },
        h("input", { className: "field", style: { flex: "1 1 280px" }, type: "password", autoComplete: "off", spellCheck: false, value: tok, onChange: e => setTok(e.target.value),
          placeholder: app.hasGhToken ? "Jeton enregistré · colle un nouveau jeton pour le remplacer" : "github_pat_…", "aria-label": "Jeton GitHub" }),
        h("button", { type: "submit", className: "btn primary", disabled: !tok.trim() }, "Enregistrer le jeton"),
        app.hasGhToken ? h("button", { type: "button", className: "btn danger", onClick: () => { app.setGhToken(""); setTest({ t: "Jeton oublié sur cet appareil.", c: "" }); } }, "Oublier") : null),
      test.t ? h("p", { className: "status " + test.c, role: "status" }, test.t) : null,
      h("details", null, h("summary", { className: "status", style: { cursor: "pointer" } }, "Créer le jeton"),
        h("ol", { style: { margin: "10px 0 0", paddingLeft: 20, color: "var(--muted)", fontSize: 13.5, display: "flex", flexDirection: "column", gap: 4 } },
          h("li", null, "Ouvre ", h("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener", className: "linkbtn" }, "GitHub → Fine-grained token ↗"), "."),
          h("li", null, "Repository access : « Only select repositories » → ", h("b", null, repo), "."),
          h("li", null, "Permissions → Repository → ", h("b", null, "Contents : Read and write"), " (Metadata passe en lecture tout seul)."),
          h("li", null, "Colle le jeton ici. Il reste dans ce navigateur, jamais dans le code.")))),

    h("section", { className: "panel" },
      h("h3", null, h("span", { className: "dot " + (app.spOn ? "on" : "") }), "Spotify"),
      !app.spConfigured ? h("p", null, "Client ID Spotify absent de src/config.js : la connexion est désactivée.")
        : app.spOn ? h(Fragment, null,
          h("p", null, "Connecté" + (app.spUser ? " en tant que " + app.spUser : "") + ". Recherche, « ce qui passe » et pressage disponibles."),
          h("p", null, !app.spStreaming
            ? "Lecture depuis le vinyle : reconnecte Spotify une fois pour autoriser la lecture dans Sillon (nouvelle permission « streaming »)."
            : app.pb && app.pb.mode === "sdk" ? "Lecture depuis le vinyle : dans Sillon (appareil « Sillon » dans Spotify Connect)."
            : app.pb && app.pb.mode === "connect" ? "Lecture depuis le vinyle : sur ton appareil Spotify actif" + (app.pb.error === "premium" ? " (la lecture dans le navigateur demande Premium)." : app.pb.error && app.pb.error.startsWith("init") ? " (ce navigateur ne peut pas lire Spotify lui-même)." : ".")
            : "Lecture depuis le vinyle : dans Sillon, ou sur ton appareil Spotify actif si le navigateur ne peut pas lire."),
          h("div", { className: "row" },
            !app.spStreaming ? h("button", { type: "button", className: "btn primary", onClick: app.spLogin }, "Reconnecter Spotify") : null,
            h("button", { type: "button", className: "btn danger", onClick: app.spLogout }, "Se déconnecter")))
        : h(Fragment, null,
          h("p", null, "Connecte ton compte pour retrouver les titres, voir ce qui passe et presser les playlists."),
          h("div", { className: "row" }, h("button", { type: "button", className: "btn primary", onClick: app.spLogin }, "Se connecter à Spotify")),
          h("p", { className: "status" }, "URI de redirection à déclarer : " + redirectUri()))),

    h("section", { className: "panel" },
      h("h3", null, "Cet appareil"),
      h("p", null, "Exporter une copie complète, ou effacer la copie locale (le dépôt n'est pas touché, tout revient à la prochaine synchro)."),
      h("div", { className: "row" },
        h("button", { type: "button", className: "btn", onClick: app.exportData }, "Exporter mes données"),
        confirmReset
          ? h(Fragment, null,
            h("button", { type: "button", className: "btn danger", onClick: () => { setConfirmReset(false); app.resetLocal(); } }, st.pending ? "Effacer quand même (" + st.pending + " modif(s) perdue(s))" : "Oui, effacer la copie locale"),
            h("button", { type: "button", className: "btn ghost", onClick: () => setConfirmReset(false) }, "Annuler"))
          : h("button", { type: "button", className: "btn ghost", onClick: () => setConfirmReset(true) }, "Effacer la copie locale"))));
}
