import React from "react";
import { slug, norm } from "./lib/slug.js";

export const { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext, Fragment } = React;
export const h = React.createElement;
export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);
export { slug, norm };

/* ============ Constantes ============ */
export const GENRES = {
  rock: { label: "Rock", sections: [
    { name: "Instruments", tags: [["riff","Riff"],["guitare","Guitare qui hurle"],["solo","Solo"],["batterie","Batterie"],["basse","Basse"],["voix","Voix"]] },
    { name: "Structure", tags: [["intro","Intro"],["rythme","Ruptures de rythme"],["montee","Montée"],["explosion","Explosion / chaos"],["refrain","Refrain"],["break","Break / pont"],["outro","Outro"]] },
    { name: "Ressenti", tags: [["energie","Énergie"],["melodie","Mélodie"],["surprise","Surprise / folie"],["son","Son saturé"],["theatral","Théâtral"],["groove","Groove"],["modernite","Modernité"]] }],
    flags: [["repetitif","Répétitif"],["sage","Trop sage"],["poprock","Pop rock / radio"],["classique","Daté / classique"],["lent","Trop lent"],["plat","Plat"],["long","Trop long"],["entendue","Trop connue"],["cris","Cris de trop"],["parle","Chant parlé"],["lassitude","Lassitude du groupe"],["strident","Son strident"]] },
  rap: { label: "Rap FR", sections: [
    { name: "Prod", tags: [["prod","Prod / beat"],["basse808","Basses / 808"],["sample","Sample"],["batterie","Drums"],["instru","Instru"]] },
    { name: "Rappeur", tags: [["flow","Flow"],["textes","Textes"],["punchlines","Punchlines"],["voix","Voix / timbre"],["technique","Technique"],["storytelling","Storytelling"]] },
    { name: "Ressenti", tags: [["refrain","Refrain / hook"],["energie","Énergie"],["ambiance","Ambiance"],["melodie","Mélodie"],["surprise","Surprise"],["feat","Feat"],["modernite","Modernité"]] }],
    flags: [["autotune","Autotune de trop"],["creux","Textes creux"],["commercial","Trop commercial"],["repetitif","Répétitif"],["prodatee","Prod datée"],["long","Trop long"],["entendue","Trop connue"],["lassitude","Lassitude de l'artiste"]] },
  electro: { label: "Électro", sections: [
    { name: "Son", tags: [["kick","Kick / drums"],["basse","Basse"],["lead","Lead / mélodie"],["texture","Texture / sound design"],["voix","Voix / samples"]] },
    { name: "Structure", tags: [["buildup","Build-up"],["drop","Drop"],["break","Break"],["transitions","Transitions"],["outro","Outro"]] },
    { name: "Ressenti", tags: [["energie","Énergie"],["groove","Groove"],["hypnotique","Hypnotique"],["euphorie","Euphorie"],["sombre","Sombre"],["surprise","Surprise"],["modernite","Modernité"]] }],
    flags: [["dropdecu","Drop décevant"],["repetitif","Répétitif"],["commercial","Trop commercial"],["soncheap","Son cheap"],["lent","Trop lent"],["long","Trop long"],["entendue","Trop connue"]] },
  jazz: { label: "Jazz", sections: [
    { name: "Instruments", tags: [["cuivres","Cuivres"],["piano","Piano"],["contrebasse","Contrebasse"],["batterie","Batterie"],["guitare","Guitare"],["voix","Voix"]] },
    { name: "Jeu", tags: [["theme","Thème"],["impro","Impro / solos"],["interplay","Interplay"],["swing","Swing / groove"],["harmonie","Harmonie"],["virtuosite","Virtuosité"]] },
    { name: "Ressenti", tags: [["energie","Énergie"],["ambiance","Ambiance"],["melancolie","Mélancolie"],["surprise","Surprise"],["modernite","Modernité"]] }],
    flags: [["academique","Trop académique"],["decousu","Trop décousu"],["lounge","Musique d'ascenseur"],["long","Trop long"],["date","Daté"],["entendue","Trop connue"]] },
  fusion: { label: "Fusion J-rock", sections: [
    { name: "Groove", tags: [["slap","Basse slap"],["funk","Groove funk"],["batterie","Batterie"],["cuivres","Cuivres"],["claviers","Claviers / piano"],["guitare","Guitare"]] },
    { name: "Structure", tags: [["rupture","Ruptures math-rock"],["intro","Intro"],["montee","Montée"],["explosion","Explosion"],["refrain","Refrain d'anime"],["break","Break / pont"],["outro","Outro"]] },
    { name: "Voix", tags: [["voix","Voix"],["rap","Passage rap"],["langue","Langue / accent"],["choeurs","Chœurs"]] },
    { name: "Ressenti", tags: [["energie","Énergie"],["virtuosite","Virtuosité"],["melodie","Mélodie"],["surprise","Surprise / folie"],["theatral","Théâtral"],["ambiance","Ambiance"],["modernite","Modernité"]] }],
    flags: [["poppy","Trop pop"],["kpop","Trop K-pop"],["repetitif","Répétitif"],["sage","Trop sage"],["lent","Trop lent"],["long","Trop long"],["strident","Son strident"],["entendue","Trop connue"]] },
  autre: { label: "Autre", sections: [
    { name: "Musique", tags: [["melodie","Mélodie"],["rythme","Rythme"],["instru","Instrumentation"],["prod","Production"],["voix","Voix"],["paroles","Paroles"]] },
    { name: "Ressenti", tags: [["energie","Énergie"],["ambiance","Ambiance"],["surprise","Surprise"],["emotion","Émotion"],["modernite","Modernité"]] }],
    flags: [["repetitif","Répétitif"],["sage","Trop sage"],["commercial","Trop commercial"],["long","Trop long"],["entendue","Trop connue"]] },
};
export const uniq = arr => { const seen = new Set(); return arr.filter(t => seen.has(t[0]) ? false : (seen.add(t[0]), true)); };
export const ALL_QUALS = uniq(Object.values(GENRES).flatMap(g => g.sections.flatMap(s => s.tags)));
export const FLAGS = uniq(Object.values(GENRES).flatMap(g => g.flags));
export const NEW_TAGS = new Set();
export const G = g => GENRES[g] || GENRES.autre;
export const CONTEXTS = ["", "Voiture", "Sport", "Concentration", "Soirée", "Réveil", "À faire découvrir"];
export const DIRECTIONS = [["folie","Plus de folie"],["energie","Plus d'énergie"],["lourd","Plus lourd / plus sombre"],["outro","Grosse fin"],["recent","Plus récent"],["obscur","Moins connu"],["court","Moins de 4 min"],["autre","Autre scène / pays"]];
export const LEGACY = {
  1: ["Punk mélodique, scène UK 2000s","Indie / garage","Les ancêtres punk","La relève","Plus lourd, plus bluesy","Les classiques"],
  2: ["Arctic Monkeys, face cachée","Gros riffs mélodiques modernes","Garage saturé et folie","Les paris"],
};
export const DEFAULT_SESSION = { title: "When the Sun Goes Down", seedSong: "When the Sun Goes Down", seedArtist: "Arctic Monkeys", status: "active", createdAt: "2026-10-22T00:24:00.000Z", order: 1, genre: "rock", playlistName: "Riffs à noter" };
export const catNo = s => "SLN " + String((s && s.order) || 0).padStart(3, "0");
export const SAVE_KEYS = ["song","artist","group","why","prono","fournee","custom","heart","fresh","moment","context","year","seed","spUri","spUrl","spAlbum","spMs","liked","session","addedAt","ratedAt","verified","bpm","offtopic"];
export const VIEWS = [
  ["decouvrir", "Découvrir", "◉"], ["explorer", "Explorer", "✦"], ["playlist", "Pressage", "⏺"],
  ["archives", "Le bac", "▤"], ["stats", "Stats", "▮"], ["compositions", "Compos", "◐"],
];

/* ============ Utilitaires ============ */
export const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
export const spLink = d => d && (d.spUrl || (d.song ? "https://open.spotify.com/search/" + encodeURIComponent((d.artist || "") + " " + d.song) : ""));
export const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
export const fmt = n => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
export const isRated = d => !!d && typeof d.note === "number";
export const inPlaylist = d => isRated(d) && !d.offtopic && (d.note >= 7 || !!d.heart);
export const sessionOf = d => d.session || "wtsgd";
export const hue = s => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
export const discStyle = artist => ({ "--lab": "hsl(" + hue(artist) + " 62% 56%)" });
export const lvl = n => n == null ? "" : n >= 9 ? "lvl-top" : n >= 7 ? "lvl-good" : "lvl-mid";
export const segColor = i => i >= 9 ? "var(--hot)" : i >= 7 ? "var(--accent)" : "var(--plus)";
export const fmtMin = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
export const qualList = custom => ALL_QUALS.concat((custom || []).map(t => [t[0], t[1]]));
export const isFlag = k => FLAGS.some(f => f[0] === k);
export function batchOf(d) {
  if (d.fournee) return d.fournee;
  for (const [b, gs] of Object.entries(LEGACY)) if (gs.includes(d.group)) return Number(b);
  if (d.custom) return "perso";
  return "?";
}
export const batchNum = d => { const b = batchOf(d); return typeof b === "number" ? b : 0; };
export const batchLabel = b => typeof b === "number" ? "F" + b : b === "X" ? "Explorer" : b === "perso" ? "Ajouts" : "Autre";
export const batchLong = b => typeof b === "number" ? "Fournée " + b : b === "X" ? "Explorer" : b === "perso" ? "Tes ajouts" : "Autre";
export function normalizeDoc(v) {
  return { ...v, note: typeof v.note === "number" ? v.note : null, comment: v.comment || "", tags: v.tags && typeof v.tags === "object" ? { ...v.tags } : {} };
}
export function initialView() {
  const hsh = (location.hash || "").slice(1);
  if (VIEWS.some(v => v[0] === hsh) || hsh === "reglages") return hsh;
  return LS.get("sillon-view", "decouvrir");
}

/* ============ Analyse ============ */
export function tagImpact(list, custom) {
  const rated = list.filter(isRated);
  if (rated.length < 4) return [];
  const avg = mean(rated.map(d => d.note));
  const rows = [];
  qualList(custom).concat(FLAGS).forEach(([k, label]) => {
    (isFlag(k) ? [1] : [1, -1]).forEach(v => {
      const set = rated.filter(d => ((d.tags || {})[k] || 0) === v);
      if (set.length < 3) return;
      const m = mean(set.map(d => d.note));
      rows.push({ k, v, label: (isFlag(k) ? "" : v > 0 ? "+ " : "− ") + label, m, n: set.length, diff: m - avg });
    });
  });
  return rows.sort((a, b) => b.diff - a.diff);
}
