import { describe, it, expect } from "vitest";
import { pressList, pressPlaylist } from "../src/press.js";
import { scoreTrack, pickBest, playlistId, playlistUrl, SpotifyError } from "../src/spotify/api.js";

function fakeSpotify({ forbidden = [] } = {}) {
  const lists = new Map();
  let n = 0;
  return {
    lists,
    created: 0,
    playlistId, playlistUrl,
    async createPlaylist() { this.created++; const id = "new" + (++n); lists.set(id, []); return { id, uri: "spotify:playlist:" + id, url: playlistUrl(id) }; },
    async replaceItems(id, uris) { if (forbidden.includes(id)) throw new SpotifyError("forbidden", 403, "not owner"); lists.set(id, uris.slice()); },
    async renamePlaylist() {},
    async playlistUris(id) { return lists.get(id) || []; },
  };
}

const docs = {
  a: { spUri: "spotify:track:A" }, b: { spUri: "spotify:track:B" }, c: {}, d: { spUri: "spotify:track:A" }, e: { spUri: "spotify:track:E" },
};
const getDoc = id => docs[id];

describe("pressList", () => {
  it("garde l'ordre, retire les doublons et signale les introuvables", () => {
    const r = pressList(["b", "a", "c", "d", "e"], getDoc);
    expect(r.uris).toEqual(["spotify:track:B", "spotify:track:A", "spotify:track:E"]);
    expect(r.missing).toEqual(["c"]);
    expect(r.dups).toEqual(["d"]);
  });
});

describe("pressPlaylist", () => {
  it("premier pressage : crée une playlist avec la liste exacte", async () => {
    const sp = fakeSpotify();
    const D = { x: { spUri: "u:1" }, y: {}, z: { spUri: "u:3" } };
    const resolve = async id => { if (id === "y") D.y.spUri = "u:2"; };
    const r = await pressPlaylist({ ids: ["x", "y", "z"], getDoc: id => D[id], resolve, name: "SILLON", sp });
    expect(sp.lists.get(r.pl.id)).toEqual(["u:1", "u:2", "u:3"]);
    expect(r.exact).toBe(true);
  });

  it("repressage : même playlist, même lien, contenu remplacé", async () => {
    const sp = fakeSpotify();
    sp.lists.set("OLD", ["u:9", "u:1"]);
    const D = { x: { spUri: "u:1" }, z: { spUri: "u:3" } };
    const old = { uri: "spotify:playlist:OLD", name: "SILLON" };
    const r = await pressPlaylist({ ids: ["x", "z"], getDoc: id => D[id], resolve: async () => {}, name: "SILLON", replace: true, old, sp });
    expect(r.pl.uri).toBe(old.uri);
    expect(r.pl.url).toBe("https://open.spotify.com/playlist/OLD");
    expect(sp.created).toBe(0);
    expect(sp.lists.get("OLD")).toEqual(["u:1", "u:3"]);
    const r2 = await pressPlaylist({ ids: ["z"], getDoc: id => D[id], resolve: async () => {}, name: "SILLON", replace: true, old, sp });
    expect(r2.pl.uri).toBe(old.uri);
    expect(sp.lists.get("OLD")).toEqual(["u:3"]);
  });

  it("ancienne playlist non modifiable : en crée une nouvelle et le signale", async () => {
    const sp = fakeSpotify({ forbidden: ["OLD"] });
    const D = { x: { spUri: "u:1" } };
    const r = await pressPlaylist({ ids: ["x"], getDoc: id => D[id], resolve: async () => {}, name: "S", replace: true, old: { uri: "spotify:playlist:OLD" }, sp });
    expect(r.pl.uri).not.toBe("spotify:playlist:OLD");
    expect(r.note).toMatch(/nouvelle playlist/);
  });
});

describe("recherche Spotify : choix du meilleur résultat", () => {
  const items = [
    { name: "Hakujitsu (Live)", artists: [{ name: "King Gnu" }] },
    { name: "Hakujitsu", artists: [{ name: "King Gnu" }] },
    { name: "Hakujitsu", artists: [{ name: "Some Cover Band" }] },
  ];
  it("préfère le titre exact du bon artiste", () => {
    expect(pickBest(items, "Hakujitsu", "King Gnu")).toBe(items[1]);
  });
  it("refuse un autre artiste", () => {
    expect(scoreTrack({ name: "Hakujitsu", artists: ["Some Cover Band"] }, "Hakujitsu", "King Gnu")).toBe(0);
    expect(pickBest([items[2]], "Hakujitsu", "King Gnu")).toBe(null);
  });
  it("tolère accents et versions remasterisées", () => {
    expect(scoreTrack({ name: "Agitations tropicales - Remastered 2020", artists: ["L'Impératrice"] }, "Agitations tropicales", "L'Imperatrice")).toBeGreaterThan(0);
  });
});
