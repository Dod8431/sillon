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
          if (rest.startsWith("contents/")) {
            const path = decodeURIComponent(rest.slice("contents/".length));
            const abs = join(repoDir, path);
            const cur = existsSync(abs) ? readFileSync(abs) : null;
            if (req.method === "GET") {
              if (!cur) return send(res, 404, { message: "Not Found" });
              return send(res, 200, { sha: blobSha(cur), content: cur.toString("base64") });
            }
            if (req.method === "PUT") {
              const body = await readBody(req);
              if (cur && body.sha !== blobSha(cur)) return send(res, body.sha ? 409 : 422, { message: body.sha ? "sha does not match" : "\"sha\" wasn't supplied." });
              if (!cur && body.sha) return send(res, 409, { message: "sha does not match (file missing)" });
              const buf = Buffer.from(body.content, "base64");
              mkdirSync(dirname(abs), { recursive: true });
              writeFileSync(abs, buf);
              execFileSync("git", ["add", path], { cwd: repoDir });
              execFileSync("git", ["commit", "-q", "-m", body.message || "dev"], { cwd: repoDir });
              return send(res, cur ? 200 : 201, { content: { sha: blobSha(buf), path } });
            }
          }
          return send(res, 404, { message: "Route non simulée : " + req.method + " " + rest });
        } catch (e) {
          return send(res, 500, { message: String(e && e.message) });
        }
      });
    },
  };
}
