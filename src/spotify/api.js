import { getAccessToken } from "./auth.js";
import { norm } from "../lib/slug.js";

// API Web Spotify (règles de février 2026 : recherche limitée à 10 résultats,
// POST /me/playlists pour créer, PUT/POST /playlists/{id}/items pour remplir).
export class SpotifyError extends Error {
  constructor(kind, status, message) { super(message || kind); this.kind = kind; this.status = status; }
}
const BASE = "https://api.spotify.com/v1";
const wait = ms => new Promise(r => setTimeout(r, ms));

export async function spFetch(path, { method = "GET", body, query } = {}, _retry = 0) {
  const token = await getAccessToken(_retry === 1);
  if (!token) throw new SpotifyError("auth", 0, "Pas connecté à Spotify");
  const url = BASE + path + (query ? "?" + new URLSearchParams(query) : "");
  let res;
  try {
    res = await fetch(url, { method, headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { throw new SpotifyError("offline", 0, "Réseau indisponible"); }
  if (res.status === 401 && _retry === 0) return spFetch(path, { method, body, query }, 1);
  if (res.status === 429 && _retry < 2) { await wait(Math.min(10, Number(res.headers.get("Retry-After")) || 2) * 1000); return spFetch(path, { method, body, query }, 2); }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json && json.error && (json.error.message || json.error)) || "Spotify " + res.status;
    if (res.status === 401) throw new SpotifyError("auth", 401, msg);
    if (res.status === 403) throw new SpotifyError(/premium/i.test(msg) ? "premium" : "forbidden", 403, msg);
    if (res.status === 404) throw new SpotifyError("notfound", 404, msg);
    if (res.status === 429) throw new SpotifyError("rate", 429, msg);
    throw new SpotifyError("http", res.status, msg);
  }
  return json;
}

export const errText = e => {
  const k = e && e.kind;
  if (k === "auth") return "Connexion Spotify expirée : reconnecte-toi dans Réglages.";
  if (k === "premium") return "Spotify demande un compte Premium pour cette action.";
  if (k === "forbidden") return "Spotify refuse l'accès (" + e.message + ").";
  if (k === "offline") return "Pas de réseau.";
  if (k === "rate") return "Spotify sature, réessaie dans un moment.";
  return "Spotify : " + ((e && e.message) || "erreur");
};

export const me = () => spFetch("/me");

const clean = s => norm(String(s || "").replace(/\s*[([].*?[)\]]\s*/g, " ").replace(/\s+-\s+.*$/, ""));
const toTrack = t => ({ uri: t.uri, url: t.external_urls && t.external_urls.spotify, album: t.album && t.album.name, ms: t.duration_ms || null, name: t.name, artists: (t.artists || []).map(a => a.name) });

// Note un candidat : il faut l'artiste, puis le titre le plus proche.
export function scoreTrack(t, song, artist) {
  const a = norm(artist);
  const artistOk = (t.artists || []).some(x => { const n = norm(x.name || x); return n && (n === a || n.includes(a) || a.includes(n)); });
  if (!artistOk) return 0;
  if (norm(t.name) === norm(song)) return 5; // titre identique, sans « (Live) » ni « - Remastered »
  const s = clean(song), n = clean(t.name);
  if (!s || !n) return 0;
  if (n === s) return 4;
  if (n.startsWith(s) || s.startsWith(n)) return 3;
  if (n.startsWith(s.slice(0, 10)) || s.startsWith(n.slice(0, 10))) return 2;
  if (n.includes(s) || s.includes(n)) return 1;
  return 0;
}
export function pickBest(items, song, artist) {
  let best = null, bestScore = 0;
  for (const t of items || []) { const sc = scoreTrack({ name: t.name, artists: (t.artists || []).map(a => a.name || a) }, song, artist); if (sc > bestScore) { best = t; bestScore = sc; } }
  return best;
}

// Retrouve un titre : d'abord une recherche ciblée, puis une recherche libre. null si rien de sûr.
export async function searchTrack(song, artist) {
  const queries = ['track:"' + song + '" artist:"' + artist + '"', artist + " " + song];
  for (const q of queries) {
    const r = await spFetch("/search", { query: { q, type: "track", limit: "10" } });
    const best = pickBest(r && r.tracks && r.tracks.items, song, artist);
    if (best) return toTrack(best);
  }
  return null;
}

export async function currentlyPlaying() {
  const r = await spFetch("/me/player/currently-playing");
  const it = r && r.item;
  if (!it || it.type !== "track") return null;
  return { song: it.name, artist: (it.artists && it.artists[0] && it.artists[0].name) || "", ...toTrack(it) };
}

export const playlistId = uri => String(uri || "").split(":").pop().split("?")[0];
export const playlistUrl = id => "https://open.spotify.com/playlist/" + id;

export async function createPlaylist(name, description) {
  const p = await spFetch("/me/playlists", { method: "POST", body: { name, description: description || "", public: false } });
  return { id: p.id, uri: p.uri, url: playlistUrl(p.id) };
}
export const renamePlaylist = (id, name) => spFetch("/playlists/" + id, { method: "PUT", body: { name } });

// Remplace tout le contenu (même playlist, même lien). Au-delà de 100 titres : ajout par paquets.
export async function replaceItems(id, uris) {
  await spFetch("/playlists/" + id + "/items", { method: "PUT", body: { uris: uris.slice(0, 100) } });
  for (let i = 100; i < uris.length; i += 100) await spFetch("/playlists/" + id + "/items", { method: "POST", body: { uris: uris.slice(i, i + 100) } });
}

/* ---- Lecture (Spotify Connect) ---- */
const dev = deviceId => deviceId ? { device_id: deviceId } : undefined;
export const startPlayback = (uris, deviceId) => spFetch("/me/player/play", { method: "PUT", query: dev(deviceId), body: { uris } });
export const resumePlayback = deviceId => spFetch("/me/player/play", { method: "PUT", query: dev(deviceId) });
export const pausePlayback = deviceId => spFetch("/me/player/pause", { method: "PUT", query: dev(deviceId) });
export const seekPlayback = (ms, deviceId) => spFetch("/me/player/seek", { method: "PUT", query: { position_ms: String(Math.max(0, Math.round(ms))), ...(dev(deviceId) || {}) } });
export const playerState = () => spFetch("/me/player");
export const devices = async () => ((await spFetch("/me/player/devices")) || {}).devices || [];

// Contenu réel de la playlist, pour vérifier que la liste est exacte.
export async function playlistUris(id) {
  const out = [];
  for (let offset = 0; offset < 1000; offset += 50) {
    const r = await spFetch("/playlists/" + id + "/items", { query: { limit: "50", offset: String(offset) } });
    const items = (r && r.items) || [];
    items.forEach(x => { const t = x.item || x.track; if (t && t.uri) out.push(t.uri); });
    if (!r || !r.next) break;
  }
  return out;
}
