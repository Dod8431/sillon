// Configuration publique de l'app. Aucun secret ici : ce dépôt est public.
// - Le Client ID Spotify est public par nature (flux PKCE, pas de secret client).
// - Le jeton GitHub n'est JAMAIS dans le code : il est saisi dans Réglages et reste dans le navigateur.
export const CONFIG = {
  spotifyClientId: "3daf8f0c67b64b4ea85431def38af8f4",
  dataRepo: { owner: "Dod8431", repo: "sillon-data", branch: "main" },
  // Remplacé en dev par un faux GitHub local (voir scripts/dev-github.js).
  apiBase: import.meta.env.VITE_GH_API || "https://api.github.com",
};

// Doit correspondre exactement à une URI de redirection déclarée sur developer.spotify.com :
//   prod  https://dod8431.github.io/sillon/
//   dev   http://127.0.0.1:5173/
export const redirectUri = () => window.location.origin + import.meta.env.BASE_URL;
