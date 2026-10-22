import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { slug, trackId, norm } from "../src/lib/slug.js";

describe("slug", () => {
  it("minuscules et tirets", () => {
    expect(slug("Arctic Monkeys When the Sun Goes Down")).toBe("arctic-monkeys-when-the-sun-goes-down");
  });
  it("retire les accents", () => {
    expect(slug("L'Impératrice Agitations tropicales")).toBe("l-imperatrice-agitations-tropicales");
    expect(slug("Beyoncé Déjà Vu")).toBe("beyonce-deja-vu");
    expect(slug("Motörhead Ace of Spades")).toBe("motorhead-ace-of-spades");
    expect(slug("Sigur Rós Hoppípolla")).toBe("sigur-ros-hoppipolla");
  });
  it("caractères spéciaux", () => {
    expect(trackId("AC/DC", "Back in Black")).toBe("ac-dc-back-in-black");
    expect(trackId("Arctic Monkeys", "Don't Sit Down 'Cause I've Moved Your Chair")).toBe("arctic-monkeys-don-t-sit-down-cause-i-ve-moved-your-chair");
    expect(trackId("Radiohead", "2 + 2 = 5")).toBe("radiohead-2-2-5");
    expect(trackId("Suchmos", "A.G.I.T.")).toBe("suchmos-a-g-i-t");
    expect(slug("  --Hello!!  ")).toBe("hello");
  });
  it("titres japonais en romaji (déjà stockés)", () => {
    expect(trackId("Creepy Nuts", "Bling-Bang-Bang-Born")).toBe("creepy-nuts-bling-bang-bang-born");
    expect(trackId("King Gnu", "Hakujitsu")).toBe("king-gnu-hakujitsu");
    expect(trackId("Yunosuke", "Kocho ga Gotoku")).toBe("yunosuke-kocho-ga-gotoku");
    expect(trackId("Fujii Kaze", "Shinunoga E-Wa")).toBe("fujii-kaze-shinunoga-e-wa");
    expect(trackId("ZUTOMAYO", "Byoushin wo Kamu")).toBe("zutomayo-byoushin-wo-kamu");
    expect(trackId("Kenshi Yonezu", "KICK BACK")).toBe("kenshi-yonezu-kick-back");
  });
  it("romaji avec macrons", () => {
    expect(trackId("Yōko Kanno", "Tank!")).toBe("yoko-kanno-tank");
  });
  it("écriture japonaise : rien d'ASCII, slug vide", () => {
    // Comportement hérité de l'artifact, gardé tel quel : les titres sont stockés en romaji.
    expect(slug("白日")).toBe("");
  });
  it("norm compare des noms", () => {
    expect(norm("Beyoncé – Déjà Vu!")).toBe("beyonce deja vu");
  });
});

// Les 193 fichiers existants de sillon-data doivent garder leur identifiant.
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sillon-data", "data", "ratings");
describe.skipIf(!existsSync(dataDir))("identifiants existants de sillon-data", () => {
  it("chaque nom de fichier = slug(artiste + titre)", () => {
    const files = readdirSync(dataDir).filter(f => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(100);
    const bad = files.filter(f => { const d = JSON.parse(readFileSync(join(dataDir, f), "utf8")); return trackId(d.artist, d.song) + ".json" !== f; });
    expect(bad).toEqual([]);
  });
});
