// Lecture depuis le vinyle.
//   1. "sdk"     : Web Playback SDK, Sillon devient un appareil Spotify et joue dans la page (Premium).
//   2. "connect" : sinon, commande l'appareil Spotify actif (téléphone, ordinateur…) via l'API.
// Si aucun des deux ne marche, l'interface garde le lien Spotify (comportement d'origine).
// Aucun React ici : les dépendances sont injectées pour pouvoir tester.

export const SDK_URL = "https://sdk.scdn.co/spotify-player.js";

let sdkPromise = null;
export function loadSdk(win = globalThis.window) {
  if (win.Spotify && win.Spotify.Player) return Promise.resolve(win.Spotify);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    win.onSpotifyWebPlaybackSDKReady = () => resolve(win.Spotify);
    const s = win.document.createElement("script");
    s.src = SDK_URL; s.async = true;
    s.onerror = () => { sdkPromise = null; reject(new Error("SDK Spotify introuvable")); };
    win.document.head.appendChild(s);
    setTimeout(() => reject(new Error("SDK Spotify trop lent")), 15000);
  });
  return sdkPromise;
}

// Le SDK a besoin des DRM du navigateur (EME).
export const sdkSupported = (nav = globalThis.navigator) => !!(nav && typeof nav.requestMediaKeySystemAccess === "function");

/*
  deps : {
    api: { startPlayback, resumePlayback, pausePlayback, seekPlayback, playerState, devices },
    getToken: () => Promise<string>,
    hasStreaming: () => bool,        // scope "streaming" accordé
    supported: () => bool,
    loadSdk: () => Promise<Spotify>,
    name: "Sillon",
    onChange: state => void,
  }
*/
export function createPlayback(deps) {
  const { api, getToken, hasStreaming = () => true, supported = sdkSupported, name = "Sillon", onChange = () => {} } = deps;
  const load = deps.loadSdk || (() => loadSdk());
  let player = null;
  let initP = null;
  let state = { mode: "idle", deviceId: null, deviceName: "", uri: null, paused: true, position: 0, duration: 0, at: Date.now(), error: "" };
  const set = patch => { state = { ...state, ...patch }; onChange(state); };

  function init() {
    if (initP) return initP;
    if (!supported() || !hasStreaming()) {
      set({ mode: "connect", error: hasStreaming() ? "" : "reauth" });
      initP = Promise.resolve(state);
      return initP;
    }
    set({ mode: "loading" });
    initP = (async () => {
      try {
        const Spotify = await load();
        player = new Spotify.Player({ name, getOAuthToken: cb => { getToken().then(t => t && cb(t), () => {}); }, volume: 0.8 });
        const ready = new Promise(resolve => {
          player.addListener("ready", ({ device_id }) => { set({ mode: "sdk", deviceId: device_id, deviceName: name, error: "" }); resolve(true); });
          player.addListener("initialization_error", ({ message }) => { set({ mode: "connect", error: "init: " + message }); resolve(false); });
          player.addListener("authentication_error", () => { set({ mode: "connect", error: "reauth" }); resolve(false); });
          player.addListener("account_error", () => { set({ mode: "connect", error: "premium" }); resolve(false); });
          setTimeout(() => resolve(false), 12000);
        });
        player.addListener("not_ready", () => set({ mode: "connect", deviceId: null }));
        player.addListener("autoplay_failed", () => set({ paused: true, error: "autoplay" }));
        player.addListener("player_state_changed", s => {
          if (!s) return;
          const t = s.track_window && s.track_window.current_track;
          set({ uri: t ? t.uri : null, paused: !!s.paused, position: s.position || 0, duration: s.duration || 0, at: Date.now() });
        });
        const ok = await player.connect();
        if (!ok) set({ mode: "connect", error: "init: connexion refusée" });
        else await ready;
      } catch (e) {
        set({ mode: "connect", error: "init: " + ((e && e.message) || e) });
      }
      if (state.mode === "loading") set({ mode: "connect" });
      return state;
    })();
    return initP;
  }

  // À appeler pendant le clic (geste utilisateur) : débloque l'audio sur mobile.
  function activate() { try { if (player && player.activateElement) player.activateElement(); } catch (e) { /* rien */ } }

  async function connectDevice() {
    const list = await api.devices();
    const d = list.find(x => x.is_active) || list.find(x => !x.is_restricted);
    return d || null;
  }

  // Joue `uri`. Même titre : pause / reprise. Renvoie { ok, where } ou { ok: false, reason }.
  async function play(uri) {
    await init();
    if (state.uri === uri) return toggle();
    if (state.mode === "sdk" && state.deviceId) {
      await api.startPlayback([uri], state.deviceId);
      set({ uri, paused: false, position: 0, at: Date.now() });
      return { ok: true, where: state.deviceName };
    }
    // Spotify Connect
    try {
      await api.startPlayback([uri]);
    } catch (e) {
      if (e && e.kind !== "notfound") throw e;
      const d = await connectDevice();
      if (!d) return { ok: false, reason: "nodevice" };
      await api.startPlayback([uri], d.id);
      set({ deviceId: d.id, deviceName: d.name });
    }
    if (!state.deviceName) { try { const d = await connectDevice(); if (d) set({ deviceId: d.id, deviceName: d.name }); } catch (e) { /* nom facultatif */ } }
    set({ uri, paused: false, position: 0, duration: 0, at: Date.now() });
    return { ok: true, where: state.deviceName || "ton appareil Spotify" };
  }

  async function toggle() {
    if (state.mode === "sdk" && player) { await player.togglePlay(); return { ok: true, where: state.deviceName }; }
    if (state.paused) await api.resumePlayback(state.deviceId || undefined);
    else await api.pausePlayback(state.deviceId || undefined);
    set({ paused: !state.paused, at: Date.now() });
    return { ok: true, where: state.deviceName };
  }

  async function pause() {
    if (state.paused || !state.uri) return;
    if (state.mode === "sdk" && player) await player.pause();
    else await api.pausePlayback(state.deviceId || undefined);
    set({ paused: true });
  }

  async function seek(ms) {
    if (state.mode === "sdk" && player) await player.seek(ms);
    else await api.seekPlayback(ms, state.deviceId || undefined);
    set({ position: ms, at: Date.now() });
  }

  // Mode Connect : relit l'état réel (durée, position, pause) depuis l'API.
  async function refresh() {
    if (state.mode !== "connect" || !state.uri) return;
    const s = await api.playerState();
    if (!s || !s.item) return;
    set({ uri: s.item.uri, paused: !s.is_playing, position: s.progress_ms || 0, duration: s.item.duration_ms || 0, at: Date.now(), deviceName: (s.device && s.device.name) || state.deviceName });
  }

  // Position estimée maintenant (entre deux événements).
  const positionNow = () => state.paused ? state.position : Math.min(state.duration || Infinity, state.position + (Date.now() - state.at));

  function disconnect() { try { if (player) player.disconnect(); } catch (e) { /* rien */ } player = null; initP = null; set({ mode: "idle", deviceId: null, uri: null, paused: true }); }

  return { init, activate, play, toggle, pause, seek, refresh, positionNow, disconnect, get state() { return state; } };
}
