// JSON stable : clés triées, indentation de 2 espaces, saut de ligne final.
// Même format que les fichiers de sillon-data, pour des diffs git propres.
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    Object.keys(v).sort().forEach(k => { if (v[k] !== undefined) out[k] = sortDeep(v[k]); });
    return out;
  }
  return v;
}
export const stableStringify = v => JSON.stringify(sortDeep(v), null, 2) + "\n";

export const deepEqual = (a, b) => JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));

// Sha git d'un fichier texte (sha1 de "blob <taille>\0<contenu>"), identique à celui de GitHub.
export async function gitBlobSha(text) {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode("blob " + body.length + "\0");
  const all = new Uint8Array(head.length + body.length);
  all.set(head); all.set(body, head.length);
  const d = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-1", all));
  return Array.from(d, b => b.toString(16).padStart(2, "0")).join("");
}

// Base64 <-> texte UTF-8 (l'API GitHub transporte le contenu en base64).
export function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
