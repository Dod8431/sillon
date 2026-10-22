import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { App } from "./App.js";
import { openStore, memoryStore } from "./data/idb.js";
import { createGitHub } from "./data/github.js";
import { createSync } from "./data/sync.js";
import { handleRedirect } from "./spotify/auth.js";
import { CONFIG } from "./config.js";

// Le jeton GitHub ne vit que dans le localStorage de ce navigateur.
const TOKEN_KEY = "sillon-gh-token";
const ghToken = {
  get() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } },
  set(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* stockage bloqué */ } },
};

async function boot() {
  const spRedirect = await handleRedirect();
  let store = openStore();
  try { await store.getMeta("probe"); } catch (e) { store = memoryStore(); }
  const gh = createGitHub({ ...CONFIG.dataRepo, apiBase: CONFIG.apiBase, getToken: ghToken.get });
  const sync = createSync({ api: gh, store, hasToken: () => !!ghToken.get(), log: e => console.warn("[sync]", e && e.message ? e.message : e) });
  await sync.init();
  createRoot(document.getElementById("root")).render(React.createElement(App, { sync, gh, ghToken, store, spRedirect }));
  if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
}
boot();
