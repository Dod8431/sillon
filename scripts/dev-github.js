// Faux GitHub pour le développement uniquement (jamais dans le build publié).
// Imite les routes de l'API utilisées par l'app, sur un clone LOCAL de sillon-data,
// et fait un vrai commit git à chaque écriture : on peut vérifier avec `git log` sans toucher au dépôt distant.
// Activation : SILLON_DEV_REPO=/chemin/vers/clone npm run dev
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const blobSha = buf => createHash("sha1").update("blob " + buf.length + "\0").update(buf).digest("hex");

function walk(root, dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(root, p, out);
    else out.push(relative(root, p).split(sep).join("/"));
  }
  return out;
}

export function devGitHub(repoDir) {
  const prefix = "/__gh/repos/";
  const bySha = new Map(); // cache sha -> chemin
  const pendingTrees = new Map(), pendingCommits = new Map();
  let seq = 0;
  const send = (res, status, body, headers = {}) => {
    res.statusCode = status;
    Object.entries({ "Content-Type": "application/json", ...headers }).forEach(([k, v]) => res.setHeader(k, v));
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const readBody = req => new Promise(r => { let s = ""; req.on("data", c => { s += c; }); req.on("end", () => r(s ? JSON.parse(s) : {})); });
  return {
    name: "sillon-dev-github",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith(prefix)) return next();
        const url = new URL(req.url, "http://x");
        const rest = url.pathname.slice(prefix.length).split("/").slice(2).join("/"); // retire owner/repo
        try {
          if (req.method === "GET" && rest === "") return send(res, 200, { full_name: "dev/sillon-data (local)", private: true, permissions: { push: true } });
          if (req.method === "GET" && rest.startsWith("git/trees/")) {
            const files = walk(repoDir).map(p => ({ path: p, type: "blob", sha: blobSha(readFileSync(join(repoDir, p))) }));
            const etag = '"' + createHash("sha1").update(JSON.stringify(files)).digest("hex") + '"';
            if (req.headers["if-none-match"] === etag) return send(res, 304, undefined, { ETag: etag });
            return send(res, 200, { tree: files, truncated: false }, { ETag: etag });
          }
          if (req.method === "GET" && rest.startsWith("git/blobs/")) {
            const sha = rest.slice("git/blobs/".length);
            if (!bySha.has(sha)) walk(repoDir).forEach(f => bySha.set(blobSha(readFileSync(join(repoDir, f))), f));
            const p = bySha.get(sha);
            if (!p) return send(res, 404, { message: "Not Found" });
            return send(res, 200, { sha, content: readFileSync(join(repoDir, p)).toString("base64"), encoding: "base64" });
          }
          // API git (commit groupé) : tête de branche, arbre, commit, déplacement de la branche.
          const headSha = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir }).toString().trim();
          if (req.method === "GET" && rest.startsWith("git/ref/heads/")) return send(res, 200, { object: { sha: headSha() } });
          if (req.method === "GET" && rest.startsWith("git/commits/")) return send(res, 200, { tree: { sha: "tree-" + rest.slice("git/commits/".length) } });
          if (req.method === "POST" && rest === "git/trees") {
            const body = await readBody(req);
            const id = "pt" + (++seq);
            pendingTrees.set(id, body.tree || []);
            return send(res, 201, { sha: id });
          }
          if (req.method === "POST" && rest === "git/commits") {
            const body = await readBody(req);
            const id = "pc" + (++seq);
            pendingCommits.set(id, { tree: body.tree, message: body.message, parent: (body.parents || [])[0] });
            return send(res, 201, { sha: id });
          }
          if (req.method === "PATCH" && rest.startsWith("git/refs/heads/")) {
            const body = await readBody(req);
            const c = pendingCommits.get(body.sha);
            if (!c) return send(res, 422, { message: "Object does not exist" });
            if (c.parent !== headSha()) return send(res, 422, { message: "Update is not a fast forward" });
            const entries = pendingTrees.get(c.tree) || [];
            for (const e of entries) {
              const abs = join(repoDir, e.path);
              mkdirSync(dirname(abs), { recursive: true });
              writeFileSync(abs, e.content);
              execFileSync("git", ["add", e.path], { cwd: repoDir });
            }
            execFileSync("git", ["commit", "-q", "-m", c.message || "dev"], { cwd: repoDir });
            return send(res, 200, { object: { sha: headSha() } });
          }
          return send(res, 404, { message: "Route non simulée : " + req.method + " " + rest });
        } catch (e) {
          return send(res, 500, { message: String(e && e.message) });
        }
      });
    },
  };
}
