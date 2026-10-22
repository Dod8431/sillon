import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { createSync } from "../src/data/sync.js";
import { memoryStore, openStore } from "../src/data/idb.js";
import { fakeGitHub, manualTimers } from "./fakeGitHub.js";

const R = id => "data/ratings/" + id + ".json";
const track = (song, extra = {}) => ({ artist: "A", song, note: null, comment: "", tags: {}, ...extra });

function setup(initial, opts = {}) {
  const gh = fakeGitHub(initial);
  const store = opts.store || memoryStore();
  const timers = manualTimers();
  let token = opts.token === undefined ? "t" : opts.token;
  const sync = createSync({ api: gh.api, store, timers, hasToken: () => !!token, debounceMs: 3000 });
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
    expect(gh.calls.blob).toBe(2); // seul le nouveau fichier est téléchargé
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

describe("écriture", () => {
  it("pousse après le délai, une écriture par fichier, avec le bon contenu", async () => {
    const { sync, gh, timers } = setup({ [R("a-x")]: track("x") });
    await sync.init(); await sync.pull();
    sync.set(R("a-x"), track("x", { note: 8 }));
    sync.set(R("a-x"), track("x", { note: 9 }));
    expect(sync.state.status).toBe("pending");
    expect(gh.calls.put).toBe(0);
    await timers.runAll();
    expect(gh.calls.put).toBe(1);
    expect(gh.read(R("a-x")).note).toBe(9);
    expect(gh.files.get(R("a-x")).text).toMatch(/^\{\n  "artist": "A",/); // clés triées
    expect(sync.state.status).toBe("synced");
    // Notre propre écriture ne provoque pas de re-téléchargement
    await sync.pull();
    expect(gh.calls.blob).toBe(1);
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
    const put = gh.api.putFile;
    gh.api.putFile = async (...a) => { sync.set(R("a-x"), track("x", { note: 4, comment: "en route" })); gh.api.putFile = put; return put(...a); };
    sync.set(R("a-x"), track("x", { note: 3 }));
    await sync.flush();
    expect(sync.state.pending).toBe(1);
    await sync.flush();
    expect(gh.read(R("a-x"))).toMatchObject({ note: 4, comment: "en route" });
    expect(sync.state.pending).toBe(0);
  });
});

describe("conflits", () => {
  it("fichier modifié côté dépôt : relit, fusionne champ par champ, réessaie", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x", { tags: { energie: 1 } }) });
    await sync.init(); await sync.pull();
    gh.commit(R("a-x"), track("x", { why: "Claude", tags: { energie: 1, voix: -1 } })); // commit externe pas encore lu
    sync.set(R("a-x"), track("x", { note: 7, tags: { energie: 1, basse: 1 } }));
    await sync.flush();
    expect(gh.read(R("a-x"))).toMatchObject({ note: 7, why: "Claude", tags: { energie: 1, voix: -1, basse: 1 } });
    expect(gh.calls.getFile).toBe(1);
    expect(sync.get(R("a-x")).why).toBe("Claude");
    expect(sync.state.status).toBe("synced");
  });

  it("modif locale + modif distante lue par pull : fusion sans perte", async () => {
    const { sync, gh } = setup({ [R("a-x")]: track("x") });
    await sync.init(); await sync.pull();
    sync.set(R("a-x"), track("x", { note: 6 }));
    gh.commit(R("a-x"), track("x", { spUri: "spotify:track:1" }));
    await sync.pull(); // fusionne puis pousse
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
    await sync.pull(); // déclenché par l'événement "online"
    expect(gh.read(R("a-x")).note).toBe(8);
    expect(gh.read(R("a-y")).note).toBe(2);
    expect(sync.state.status).toBe("synced");
  });

  it("les modifs survivent à un rechargement (IndexedDB)", async () => {
    const store = openStore(indexedDB, "test-" + Math.random());
    const a = setup({ [R("a-x")]: track("x") }, { store });
    await a.sync.init(); await a.sync.pull();
    a.gh.setOffline(true);
    a.sync.set(R("a-x"), track("x", { note: 10 }));
    await new Promise(r => setTimeout(r, 20));
    // "rechargement" : nouveau moteur sur le même stockage
    const b = createSync({ api: a.gh.api, store, timers: manualTimers(), hasToken: () => true });
    await b.init();
    expect(b.get(R("a-x")).note).toBe(10);
    expect(b.state.pending).toBe(1);
    a.gh.setOffline(false);
    await b.pull();
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
    expect(gh.calls.put).toBe(0);
    setToken("t");
    await sync.pull(); // fusionne avec le fichier distant puis pousse
    expect(gh.read(R("a-x")).note).toBe(7);
  });
});
