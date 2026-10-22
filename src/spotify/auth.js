import { CONFIG, redirectUri } from "../config.js";

// Connexion Spotify en PKCE, sans serveur. Les jetons restent dans le localStorage de ce navigateur.
export const SCOPES = [
  "playlist-modify-private", "playlist-modify-public", "playlist-read-private",
  "user-library-read", "user-library-modify",
  "user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state",
];
const KEY = "sillon-sp";
const PKCE = "sillon-sp-pkce";

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n); };

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
const write = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) { /* stockage bloqué */ } };

export const isConfigured = () => !!CONFIG.spotifyClientId;
export const hasSession = () => !!(read() && read().refresh);
export function logout() { write(null); }

export async function login() {
  if (!isConfigured()) throw new Error("Client ID Spotify manquant dans src/config.js");
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = randomString(16);
  sessionStorage.setItem(PKCE, JSON.stringify({ verifier, state, back: window.location.hash || "" }));
  const q = new URLSearchParams({
    response_type: "code", client_id: CONFIG.spotifyClientId, scope: SCOPES.join(" "),
    redirect_uri: redirectUri(), state, code_challenge_method: "S256", code_challenge: challenge,
  });
  window.location.assign("https://accounts.spotify.com/authorize?" + q);
}

async function tokenRequest(params) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CONFIG.spotifyClientId, ...params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error_description || json.error || "Spotify " + res.status), { status: res.status, code: json.error });
  return json;
}
const store = (json, prevRefresh) => {
  const v = { access: json.access_token, refresh: json.refresh_token || prevRefresh, expiresAt: Date.now() + (json.expires_in || 3600) * 1000, scope: json.scope };
  write(v);
  return v;
};

// Au chargement : si l'URL revient de Spotify (?code=…), échange le code contre des jetons et nettoie l'URL.
export async function handleRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code"), err = url.searchParams.get("error"), state = url.searchParams.get("state");
  if (!code && !err) return null;
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(PKCE)) || {}; } catch (e) { /* rien */ }
  sessionStorage.removeItem(PKCE);
  window.history.replaceState(null, "", url.pathname + (saved.back || ""));
  if (err) return { error: err === "access_denied" ? "Connexion Spotify annulée." : "Spotify : " + err };
  if (!saved.verifier || saved.state !== state) return { error: "Connexion Spotify invalide, réessaie." };
  try {
    store(await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: saved.verifier }));
    return { ok: true };
  } catch (e) {
    return { error: "Connexion Spotify refusée : " + e.message };
  }
}

let refreshing = null;
// Jeton d'accès valide (rafraîchi si besoin). null si pas connecté.
export async function getAccessToken(force) {
  const t = read();
  if (!t || !t.refresh) return null;
  if (!force && t.access && t.expiresAt - Date.now() > 60000) return t.access;
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh })
      .then(json => store(json, t.refresh).access)
      .catch(e => { if (e.status === 400 || e.status === 401) write(null); throw e; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}
