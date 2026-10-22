import { describe, it, expect } from "vitest";
import { merge3 } from "../src/data/merge.js";
import { stableStringify } from "../src/lib/json.js";

describe("merge3", () => {
  const base = { song: "S", artist: "A", note: 5, comment: "", tags: { energie: 1 } };
  it("garde les modifs des deux côtés sur des champs différents", () => {
    const local = { ...base, note: 8 };
    const remote = { ...base, comment: "ajouté par Claude" };
    expect(merge3(base, local, remote)).toEqual({ ...base, note: 8, comment: "ajouté par Claude" });
  });
  it("fusionne les tags clé par clé", () => {
    const local = { ...base, tags: { energie: 1, voix: 1 } };
    const remote = { ...base, tags: { energie: -1 } };
    expect(merge3(base, local, remote).tags).toEqual({ energie: -1, voix: 1 });
  });
  it("même champ modifié des deux côtés : la modif locale gagne", () => {
    expect(merge3(base, { ...base, note: 9 }, { ...base, note: 3 }).note).toBe(9);
  });
  it("suppression locale d'un champ", () => {
    const b = { ...base, heart: true };
    const local = { ...base };
    expect(merge3(b, local, b).heart).toBeUndefined();
  });
  it("champ ajouté côté dépôt", () => {
    expect(merge3(base, base, { ...base, spUri: "spotify:track:x" }).spUri).toBe("spotify:track:x");
  });
  it("sans base (fichier créé des deux côtés)", () => {
    const out = merge3(null, { song: "S", note: 7, tags: { a: 1 } }, { song: "S", why: "w", tags: { b: 1 } });
    expect(out).toEqual({ song: "S", note: 7, why: "w", tags: { a: 1, b: 1 } });
  });
});

describe("stableStringify", () => {
  it("trie les clés et finit par un saut de ligne", () => {
    expect(stableStringify({ b: 1, a: { d: 1, c: 2 } })).toBe('{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}\n');
  });
});
