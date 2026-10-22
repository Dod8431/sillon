import { b64ToUtf8 } from "../lib/json.js";

// Client minimal de l'API GitHub pour le dépôt de données.
// Erreurs typées : kind = "token" | "conflict" | "offline" | "rate" | "http"
export class GitHubError extends Error {
  constructor(kind, status, message) { super(message || kind); this.kind = kind; this.status = status; }
}

export function createGitHub({ owner, repo, branch = "main", getToken, fetchImpl, apiBase = "https://api.github.com" }) {
  const doFetch = (...a) => (fetchImpl || globalThis.fetch)(...a);
  const root = apiBase + "/repos/" + owner + "/" + repo;

  async function call(method, path, { body, headers } = {}) {
    const token = getToken();
    if (!token) throw new GitHubError("token", 0, "Pas de jeton GitHub");
    let res;
    try {
      res = await doFetch(root + path, {
        method, cache: "no-store",
        headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}), ...(headers || {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new GitHubError("offline", 0, "Réseau indisponible");
    }
    if (res.status === 304) return { status: 304, res };
    if (res.ok) return { status: res.status, res, json: res.status === 204 ? null : await res.json() };
    let msg = "";
    try { msg = (await res.json()).message || ""; } catch (e) { /* corps vide */ }
    if (res.status === 401) throw new GitHubError("token", 401, msg);
    if (res.status === 403 || res.status === 429) {
      if (res.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(msg)) throw new GitHubError("rate", res.status, msg);
      throw new GitHubError("token", res.status, msg);
    }
    if (res.status === 409 || (res.status === 422 && /sha/i.test(msg))) throw new GitHubError("conflict", res.status, msg);
    throw new GitHubError("http", res.status, msg || "Erreur GitHub " + res.status);
  }

  return {
    // Arbre complet du dépôt. Avec l'ETag précédent, GitHub répond 304 sans consommer de quota.
    async getTree(etag) {
      const r = await call("GET", "/git/trees/" + encodeURIComponent(branch) + "?recursive=1", { headers: etag ? { "If-None-Match": etag } : {} });
      if (r.status === 304) return { notModified: true };
      const files = (r.json.tree || []).filter(e => e.type === "blob").map(e => ({ path: e.path, sha: e.sha }));
      return { etag: r.res.headers.get("etag"), files, truncated: !!r.json.truncated };
    },
    async getBlob(sha) {
      const r = await call("GET", "/git/blobs/" + sha);
      return b64ToUtf8(r.json.content);
    },
    // Tête de la branche : { commit, tree }.
    async getHead() {
      const r = await call("GET", "/git/ref/heads/" + encodeURIComponent(branch));
      const commit = r.json.object.sha;
      const c = await call("GET", "/git/commits/" + commit);
      return { commit, tree: c.json.tree.sha };
    },
    // Contenu d'un arbre précis : Map chemin -> sha du fichier.
    async getTreeMap(treeSha) {
      const r = await call("GET", "/git/trees/" + treeSha + "?recursive=1");
      return new Map((r.json.tree || []).filter(e => e.type === "blob").map(e => [e.path, e.sha]));
    },
    // Écrit plusieurs fichiers en UN commit au-dessus de `head`.
    // Si la branche a bougé entre-temps, GitHub refuse (pas d'avance rapide) : erreur "conflict", à relire et refaire.
    async commitFiles(head, files, message) {
      const t = await call("POST", "/git/trees", { body: { base_tree: head.tree, tree: files.map(f => ({ path: f.path, mode: "100644", type: "blob", content: f.text })) } });
      const c = await call("POST", "/git/commits", { body: { message, tree: t.json.sha, parents: [head.commit] } });
      try {
        await call("PATCH", "/git/refs/heads/" + encodeURIComponent(branch), { body: { sha: c.json.sha, force: false } });
      } catch (e) {
        if (e.kind === "http" && e.status === 422) throw new GitHubError("conflict", 422, e.message);
        throw e;
      }
      return c.json.sha;
    },
    async checkAccess() {
      const r = await call("GET", "");
      return { name: r.json.full_name, private: r.json.private, push: !!(r.json.permissions && r.json.permissions.push) };
    },
  };
}
