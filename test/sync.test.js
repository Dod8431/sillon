import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { createSync, commitMessage } from "../src/data/sync.js";
import { memoryStore, openStore } from "../src/data/idb.js";
import { fakeGitHub, manualTimers } from "./fakeGitHub.js";

const R = id => "data/ratings/" + id + ".json";
const track = (song, extra = {}) => ({ artist: "A", song, note: null, comment: "", tags: {}, ...extra });

function setup(initial, opts = {}) {
  const gh = fakeGitHub(initial);
  const store = opts.store || memoryStore();
  const timers = manualTimers();
  let token = opts.token === undefined ? "t" : opts.token;
  const sync = createSync({ api: gh.api, store, timers, now: timers.now, hasToken: () => !!token });
  return { gh, store, timers, sync, setToken: t => { token = t; } };
}

describe("lecture du dépôt", () => {
  it("charge tous les fichiers suivis au premier pull", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x"), "data/sessions/s1.json": { title: "S1" }, "data/meta/tags.json": { custom: [] }, "README.md": "# hi" });
    await sync.init();
    await sync.pull();
    expect(sync.get(R("a-x")).song).toBe("x");
    expect(sync.get("data/sessions/s1.json").title).toBe("S1");
    expect(sync.get("README.md")).toBeUndefined();
    expect(gh.calls.blob).toBe(3);
    expect(sync.state.status).toBe("synced");
  });

  it("ETag : un second pull sans changement ne télécharge rien", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x") });
    await sync.init(); await sync.pull(); await sync.pull();
    expect(gh.calls.tree304).toBe(1);
    expect(gh.calls.blob).toBe(1);
  });

  it("détecte un fichier ajouté par un autre commit (nouvelle fournée)", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x") });
    await sync.init(); await sync.pull();
    gh.commit(R("a-y"), track("y", { fournee: 7, prono: 6 }));
    await sync.pull();
    expect(sync.get(R("a-y")).fournee).toBe(7);
    expect(gh.calls.blob).toBe(2);
  });

  it("applique une modif distante et une suppression distante", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x"), [R("a-y")]: track("y") });
    await sync.init(); await sync.pull();
    gh.commit(R("a-x"), track("x", { why: "nouveau" }));
    gh.remove(R("a-y"));
    await sync.pull();
    expect(sync.get(R("a-x")).why).toBe("nouveau");
    expect(sync.get(R("a-y"))).toBeUndefined();
  });
});

describe("écriture groupée", () => {
  it("plusieurs titres modifiés = un seul commit, après le délai", async () => {
    const { sync, gh, timers } = setup({ [R("a-x")]: track("x"), [R("a-y")]: track("y"), [R("a-z")]: track("z") });
    await sync.init(); await sync.pull();
    sync.set(R("a-x"), track("x", { note: 8 }));
    sync.set(R("a-y"), track("y", { note: 3 }));
    sync.set(R("a-z"), track("z", { heart: true }));
    expect(sync.state.status).toBe("pending");
    expect(timers.delays()).toEqual([15000]);
    expect(gh.calls.commit).toBe(0);
    await timers.runAll();
    expect(gh.calls.commit).toBe(1);
    expect(gh.commits[0].paths.sort()).toEqual([R("a-x"), R("a-y"), R("a-z")]);
    expect(gh.read(R("a-x")).note).toBe(8);
    expect(gh.read(R("a-z")).heart).toBe(true);
    expect(gh.files.get(R("a-x")).text).toMatch(/^\{\n  "artist": "A",/); // clés triées
    expect(sync.state.status).toBe("synced");
    // Notre propre commit ne provoque pas de re-téléchargement
    await sync.pull();
    expect(gh.calls.blob).toBe(3);
  });

  it("délai maximal : une séance qui dure part quand même au bout de 2 min", async () => {
    const { sync, timers } = setup({ [R("a-x")]: track("x") });
    await sync.init(); await sync.pull();
    sync.set(R("a-x"), track("x", { note: 1 }));
    timers.advance(100000);
    sync.set(R("a-x"), track("x", { note: 2 }));
    expect(timers.delays()).toEqual([15000]);
    timers.advance(10000);
    sync.set(R("a-x"), track("x", { note: 3 }));
    expect(timers.delays()).toEqual([10000]);
  });

  it("crée un nouveau fichier (titre ajouté dans l'app)", async () => {
    const { sync, gh } = setup({});
    await sync.init(); await sync.pull();
    sync.set(R("b-new"), track("new", { artist: "B" }));
    await sync.flush();
    expect(gh.read(R("b-new")).song).toBe("new");
  });

  it("une modif faite pendant l'envoi reste en attente puis part", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x") });
    await sync.init(); await sync.pull();
    const orig = gh.api.commitFiles;
    gh.api.commitFiles = async (...a) => { sync.set(R("a-x"), track("x", { note: 4, comment: "en route" })); gh.api.commitFiles = orig; return orig(...a); };
    sync.set(R("a-x"), track("x", { note: 3 }));
    await sync.flush();
    expect(sync.state.pending).toBe(1);
    await sync.flush();
    expect(gh.read(R("a-x"))).toMatchObject({ note: 4, comment: "en route" });
    expect(sync.state.pending).toBe(0);
  });
});

describe("conflits", () => {
  it("fichier modifié côté dépôt : relit, fusionne champ par champ, un seul commit de l'app", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x", { tags: { energie: 1 } }) });
    await sync.init(); await sync.pull();
    gh.commit(R("a-x"), track("x", { why: "Claude", tags: { energie: 1, voix: -1 } }));
    sync.set(R("a-x"), track("x", { note: 7, tags: { energie: 1, basse: 1 } }));
    await sync.flush();
    expect(gh.read(R("a-x"))).toMatchObject({ note: 7, why: "Claude", tags: { energie: 1, voix: -1, basse: 1 } });
    expect(sync.get(R("a-x")).why).toBe("Claude");
    expect(gh.calls.commit).toBe(1);
    expect(sync.state.status).toBe("synced");
  });

  it("la branche bouge pendant l'écriture : relit, fusionne, recommence", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x"), [R("a-y")]: track("y") });
    await sync.init(); await sync.pull();
    gh.raceOnce(() => gh.commit(R("a-x"), track("x", { why: "poussé en même temps" })));
    sync.set(R("a-x"), track("x", { note: 9 }));
    sync.set(R("a-y"), track("y", { note: 2 }));
    await sync.flush();
    expect(gh.read(R("a-x"))).toMatchObject({ note: 9, why: "poussé en même temps" });
    expect(gh.read(R("a-y")).note).toBe(2);
    expect(gh.commits.map(c => c.message.split("\n")[0])).toEqual(["externe", "Sillon (app) : 2 titres"]);
  });

  it("modif locale + modif distante lue par pull : fusion sans perte", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x") });
    await sync.init(); await sync.pull();
    sync.set(R("a-x"), track("x", { note: 6 }));
    gh.commit(R("a-x"), track("x", { spUri: "spotify:track:1" }));
    await sync.pull();
    expect(sync.get(R("a-x"))).toMatchObject({ note: 6, spUri: "spotify:track:1" });
    await sync.flush();
    expect(gh.read(R("a-x"))).toMatchObject({ note: 6, spUri: "spotify:track:1" });
    expect(sync.state.pending).toBe(0);
  });

  it("fichier créé des deux côtés en même temps", async () => {
    const { sync, gh } = setup({});
    await sync.init(); await sync.pull();
    gh.commit(R("a-z"), track("z", { why: "par Claude" }));
    sync.set(R("a-z"), track("z", { note: 5 }));
    await sync.flush();
    expect(gh.read(R("a-z"))).toMatchObject({ note: 5, why: "par Claude" });
  });
});

describe("hors ligne", () => {
  it("garde les modifs, affiche Hors ligne, et repart au retour du réseau", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x"), [R("a-y")]: track("y") });
    await sync.init(); await sync.pull();
    gh.setOffline(true);
    sync.set(R("a-x"), track("x", { note: 8 }));
    sync.set(R("a-y"), track("y", { note: 2 }));
    await sync.flush();
    expect(sync.state.status).toBe("offline");
    expect(sync.state.pending).toBe(2);
    expect(sync.get(R("a-x")).note).toBe(8);
    gh.setOffline(false);
    await sync.pull(); await sync.flush(); // événement "online"
    expect(gh.read(R("a-x")).note).toBe(8);
    expect(gh.read(R("a-y")).note).toBe(2);
    expect(gh.calls.commit).toBe(1);
    expect(sync.state.status).toBe("synced");
  });

  it("les modifs survivent à un rechargement (IndexedDB) et repartent au démarrage", async () => {
    const store = openStore(indexedDB, "test-" + Math.random());
    const a = setup({ [R("a-x")]: track("x") }, { store });
    await a.sync.init(); await a.sync.pull();
    a.gh.setOffline(true);
    a.sync.set(R("a-x"), track("x", { note: 10 }));
    await new Promise(r => setTimeout(r, 20));
    const timers = manualTimers();
    const b = createSync({ api: a.gh.api, store, timers, now: timers.now, hasToken: () => true });
    await b.init();
    expect(b.get(R("a-x")).note).toBe(10);
    expect(b.state.pending).toBe(1);
    expect(timers.count).toBe(1); // envoi programmé dès le démarrage
    a.gh.setOffline(false);
    await timers.runAll();
    expect(a.gh.read(R("a-x")).note).toBe(10);
  });
});

describe("jeton", () => {
  it("jeton refusé : statut Erreur de jeton, modifs conservées", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x") });
    await sync.init(); await sync.pull();
    gh.setBadToken(true);
    sync.set(R("a-x"), track("x", { note: 1 }));
    await sync.flush();
    expect(sync.state.status).toBe("token");
    expect(sync.state.pending).toBe(1);
  });
  it("sans jeton : tout marche en local", async () => {
    const { sync, gh, setToken } = setup({ [R("a-x")]: track("x") }, { token: "" });
    await sync.init(); await sync.pull();
    expect(sync.state.status).toBe("notoken");
    sync.set(R("a-x"), track("x", { note: 7 }));
    await sync.flush();
    expect(gh.calls.commit).toBe(0);
    setToken("t");
    await sync.pull(); await sync.flush();
    expect(gh.read(R("a-x")).note).toBe(7);
  });
});

describe("message de commit", () => {
  const rec = (path, base, data) => ({ path, base, data });
  it("un seul titre noté", () => {
    expect(commitMessage([rec(R("ado-odo"), { artist: "Ado", song: "Odo", note: 4 }, { artist: "Ado", song: "Odo", note: 6 })]))
      .toBe("Sillon (app) : Ado – Odo (6)\n\n- Ado – Odo : note 4 → 6");
  });
  it("une séance : résumé + détail par titre", () => {
    const m = commitMessage([
      rec(R("a-x"), { artist: "A", song: "X", note: null }, { artist: "A", song: "X", note: 8, comment: "top", tags: { voix: 1 } }),
      rec(R("b-y"), { artist: "B", song: "Y", note: 5 }, { artist: "B", song: "Y", note: 5, heart: true }),
      rec("data/sessions/vanished.json", { title: "T" }, { title: "T", playlistName: "P" }),
    ]);
    expect(m).toBe("Sillon (app) : 2 titres, composition vanished\n\n- A – X : note 8, commentaire, mots-clés\n- B – Y : coup de cœur\n- composition vanished");
  });
});
