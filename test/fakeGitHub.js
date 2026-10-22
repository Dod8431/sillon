import { GitHubError } from "../src/data/github.js";

// Faux dépôt GitHub en mémoire, avec le même contrat que createGitHub().
export function fakeGitHub(initial = {}) {
  let n = 0;
  const newSha = () => "sha" + (++n);
  const files = new Map();
  let version = 0;
  const calls = { tree: 0, tree304: 0, blob: 0, put: 0, getFile: 0 };
  let offline = false, badToken = false;
  for (const [p, data] of Object.entries(initial)) files.set(p, { text: typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n", sha: newSha() });
  const guard = () => {
    if (offline) throw new GitHubError("offline", 0, "offline");
    if (badToken) throw new GitHubError("token", 401, "Bad credentials");
  };
  const api = {
    async getTree(etag) {
      guard(); calls.tree++;
      if (etag === "v" + version) { calls.tree304++; return { notModified: true }; }
      return { etag: "v" + version, files: [...files].map(([path, f]) => ({ path, sha: f.sha })) };
    },
    async getBlob(sha) {
      guard(); calls.blob++;
      for (const f of files.values()) if (f.sha === sha) return f.text;
      throw new GitHubError("http", 404, "blob");
    },
    async getFile(path) {
      guard(); calls.getFile++;
      const f = files.get(path);
      return f ? { sha: f.sha, text: f.text } : null;
    },
    async putFile(path, text, sha) {
      guard(); calls.put++;
      const f = files.get(path);
      if (f && f.sha !== sha) throw new GitHubError("conflict", sha ? 409 : 422, "sha mismatch");
      if (!f && sha) throw new GitHubError("conflict", 409, "file gone");
      const s = newSha();
      files.set(path, { text, sha: s });
      version++;
      return s;
    },
  };
  return {
    api, files, calls,
    // Simule un commit externe (Claude qui pousse dans le dépôt).
    commit(path, data) { files.set(path, { text: JSON.stringify(data, null, 2) + "\n", sha: newSha() }); version++; },
    remove(path) { files.delete(path); version++; },
    read(path) { const f = files.get(path); return f ? JSON.parse(f.text) : undefined; },
    setOffline(v) { offline = v; },
    setBadToken(v) { badToken = v; },
  };
}

// Minuteurs pilotés à la main.
export function manualTimers() {
  let id = 0;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { const i = ++id; pending.set(i, { fn, ms }); return i; },
    clearTimeout(i) { pending.delete(i); },
    setInterval() { return ++id; },
    clearInterval() {},
    async runAll() { const list = [...pending.values()]; pending.clear(); for (const t of list) await t.fn(); },
    get count() { return pending.size; },
  };
}
