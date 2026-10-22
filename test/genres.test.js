import { describe, it, expect, afterEach } from "vitest";
import { GENRES, G, ALL_QUALS, FLAGS, isFlag, registerGenres, qualList } from "../src/core.js";

const metal = {
  label: "Metal",
  sections: [
    { name: "Son", tags: [["riff", "Riff"], ["blast-beat", "Blast beat"], { id: "double-pedale", label: "Double pédale" }] },
    { name: "Voix", tags: [["growl", "Growl"], ["voix", "Voix"]] },
  ],
  flags: [["trop-brutal", "Trop brutal"], ["cris", "Cris de trop"]],
};

afterEach(() => registerGenres(null));

describe("genres définis dans le dépôt", () => {
  it("ajoute un genre complet : libellé, sections, défauts", () => {
    expect(registerGenres({ genres: { metal } })).toEqual([]);
    expect(G("metal").label).toBe("Metal");
    expect(G("metal").sections.map(s => s.name)).toEqual(["Son", "Voix"]);
    expect(G("metal").sections[0].tags).toContainEqual(["double-pedale", "Double pédale"]);
    expect(isFlag("trop-brutal")).toBe(true);
    expect(ALL_QUALS.some(t => t[0] === "blast-beat")).toBe(true);
    expect(qualList([]).some(t => t[0] === "growl")).toBe(true);
    expect(Object.keys(GENRES)).toContain("metal"); // visible dans « Nouvelle composition »
  });

  it("réutilise un mot-clé existant (même identifiant, même sens)", () => {
    registerGenres({ genres: { metal } });
    expect(ALL_QUALS.filter(t => t[0] === "voix").length).toBe(1);
    expect(FLAGS.filter(t => t[0] === "cris").length).toBe(1);
  });

  it("un genre inconnu retombe sur « Autre »", () => {
    expect(G("inconnu").label).toBe("Autre");
  });

  it("ignore ce qui casserait l'app", () => {
    const ignored = registerGenres({ genres: {
      rock: { label: "Remplacé", sections: [{ name: "x", tags: [["a", "A"]] }] }, // genre intégré
      "Mauvais Id": { label: "x", sections: [{ name: "x", tags: [["a", "A"]] }] },
      vide: { label: "Vide", sections: [], flags: [] },
      mixte: { label: "Mixte", sections: [{ name: "S", tags: [["repetitif", "Répétitif"], ["ok-tag", "OK"], ["Bad Id", "x"], ["sans-label"]] }], flags: [["riff", "Riff comme défaut"]] },
    } });
    expect(G("rock").label).toBe("Rock");
    expect(GENRES["Mauvais Id"]).toBeUndefined();
    expect(GENRES.vide).toBeUndefined();
    expect(G("mixte").sections[0].tags).toEqual([["ok-tag", "OK"]]); // "repetitif" est un défaut ailleurs
    expect(G("mixte").flags).toEqual([]);                         // "riff" est un mot-clé +/− ailleurs
    expect(isFlag("riff")).toBe(false);
    expect(ignored.length).toBe(7);
  });

  it("retirer le genre du fichier le retire de l'app", () => {
    registerGenres({ genres: { metal } });
    registerGenres({ genres: {} });
    expect(GENRES.metal).toBeUndefined();
    expect(isFlag("trop-brutal")).toBe(false);
    expect(ALL_QUALS.some(t => t[0] === "blast-beat")).toBe(false);
  });
});
