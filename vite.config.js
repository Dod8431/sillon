import { defineConfig } from "vite";
import { devGitHub } from "./scripts/dev-github.js";

// Politique de sécurité du contenu, seulement pour le build publié :
// aucun script tiers (le jeton GitHub est dans le localStorage), réseau limité à GitHub et Spotify.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://i.scdn.co",
  "connect-src 'self' https://api.github.com https://api.spotify.com https://accounts.spotify.com",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const cspPlugin = {
  name: "sillon-csp",
  apply: "build",
  transformIndexHtml: html => html.replace("<meta charset=\"utf-8\">", "<meta charset=\"utf-8\">\n  <meta http-equiv=\"Content-Security-Policy\" content=\"" + CSP + "\">"),
};

// Dev uniquement : SILLON_DEV_REPO=<clone local de sillon-data> remplace l'API GitHub par un faux serveur local.
const devRepo = process.env.SILLON_DEV_REPO;

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages sert l'app sous /sillon/ ; en dev, à la racine (http://127.0.0.1:5173/).
  base: command === "build" || isPreview ? "/sillon/" : "/",
  plugins: [cspPlugin, ...(command === "serve" && !isPreview && devRepo ? [devGitHub(devRepo)] : [])],
  define: command === "serve" && !isPreview && devRepo ? { "import.meta.env.VITE_GH_API": JSON.stringify("/__gh") } : {},
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: { target: "es2019", sourcemap: false },
  test: { environment: "node" },
}));
