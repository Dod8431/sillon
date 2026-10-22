import { describe, it, expect } from "vitest";
import { createPlayback } from "../src/spotify/playback.js";
import { SpotifyError } from "../src/spotify/api.js";

function fakeApi({ devices = [], activeDevice = true } = {}) {
  const calls = [];
  return {
    calls,
    async startPlayback(uris, deviceId) {
      calls.push(["start", uris[0], deviceId || null]);
      if (!deviceId && !activeDevice) throw new SpotifyError("notfound", 404, "NO_ACTIVE_DEVICE");
    },
    async resumePlayback(d) { calls.push(["resume", d || null]); },
    async pausePlayback(d) { calls.push(["pause", d || null]); },
    async seekPlayback(ms, d) { calls.push(["seek", ms, d || null]); },
    async playerState() { return null; },
    async devices() { return devices; },
  };
}

function fakeSdk({ fail } = {}) {
  const players = [];
  class Player {
    constructor(opts) { this.opts = opts; this.l = {}; this.toggled = 0; this.activated = 0; players.push(this); }
    addListener(ev, fn) { this.l[ev] = fn; }
    async connect() {
      setTimeout(() => { if (fail === "account") this.l.account_error({ message: "premium" }); else this.l.ready({ device_id: "dev-sillon" }); }, 0);
      return true;
    }
    activateElement() { this.activated++; }
    async togglePlay() { this.toggled++; }
    async pause() {}
    async seek() {}
    disconnect() {}
  }
  return { Spotify: { Player }, players };
}

const base = (over = {}) => ({ getToken: async () => "tok", supported: () => true, hasStreaming: () => true, ...over });

describe("lecture dans l'app (Web Playback SDK)", () => {
  it("joue sur l'appareil Sillon, puis le même titre fait pause/reprise", async () => {
    const api = fakeApi(), sdk = fakeSdk();
    const pb = createPlayback(base({ api, loadSdk: async () => sdk.Spotify }));
    const r = await pb.play("spotify:track:A");
    expect(r).toMatchObject({ ok: true, where: "Sillon" });
    expect(api.calls[0]).toEqual(["start", "spotify:track:A", "dev-sillon"]);
    expect(pb.state.mode).toBe("sdk");
    await pb.play("spotify:track:A");
    expect(sdk.players[0].toggled).toBe(1);
    expect(api.calls.length).toBe(1);
  });

  it("compte non Premium : bascule sur Spotify Connect", async () => {
    const api = fakeApi(), sdk = fakeSdk({ fail: "account" });
    const pb = createPlayback(base({ api, loadSdk: async () => sdk.Spotify }));
    await pb.play("spotify:track:A");
    expect(pb.state.mode).toBe("connect");
    expect(pb.state.error).toBe("premium");
    expect(api.calls[0]).toEqual(["start", "spotify:track:A", null]);
  });

  it("SDK introuvable (réseau, bloqueur) : bascule sur Spotify Connect", async () => {
    const api = fakeApi();
    const pb = createPlayback(base({ api, loadSdk: async () => { throw new Error("blocked"); } }));
    const r = await pb.play("spotify:track:A");
    expect(r.ok).toBe(true);
    expect(pb.state.mode).toBe("connect");
  });
});

describe("Spotify Connect", () => {
  it("connexion d'avant la phase 2 (sans scope streaming) : Connect + demande de reconnexion", async () => {
    const api = fakeApi();
    let loaded = false;
    const pb = createPlayback(base({ api, hasStreaming: () => false, loadSdk: async () => { loaded = true; } }));
    await pb.play("spotify:track:A");
    expect(loaded).toBe(false);
    expect(pb.state.error).toBe("reauth");
  });

  it("aucun appareil actif : réveille le premier appareil disponible", async () => {
    const api = fakeApi({ activeDevice: false, devices: [{ id: "phone", name: "Téléphone", is_active: false, is_restricted: false }] });
    const pb = createPlayback(base({ api, supported: () => false }));
    const r = await pb.play("spotify:track:A");
    expect(r).toMatchObject({ ok: true, where: "Téléphone" });
    expect(api.calls.map(c => c[0] + ":" + c[2])).toEqual(["start:null", "start:phone"]);
  });

  it("aucun appareil du tout : échec propre (l'interface garde le lien)", async () => {
    const api = fakeApi({ activeDevice: false, devices: [] });
    const pb = createPlayback(base({ api, supported: () => false }));
    expect(await pb.play("spotify:track:A")).toEqual({ ok: false, reason: "nodevice" });
  });

  it("pause puis reprise sur le même titre", async () => {
    const api = fakeApi();
    const pb = createPlayback(base({ api, supported: () => false }));
    await pb.play("spotify:track:A");
    await pb.play("spotify:track:A");
    expect(pb.state.paused).toBe(true);
    await pb.play("spotify:track:A");
    expect(pb.state.paused).toBe(false);
    expect(api.calls.map(c => c[0])).toEqual(["start", "pause", "resume"]);
  });

  it("autre titre : nouvelle lecture", async () => {
    const api = fakeApi();
    const pb = createPlayback(base({ api, supported: () => false }));
    await pb.play("spotify:track:A");
    await pb.play("spotify:track:B");
    expect(api.calls.filter(c => c[0] === "start").map(c => c[1])).toEqual(["spotify:track:A", "spotify:track:B"]);
    expect(pb.state.uri).toBe("spotify:track:B");
  });
});
