import { deepEqual } from "../lib/json.js";

const isObj = v => v && typeof v === "object" && !Array.isArray(v);

// Fusion à trois voies, champ par champ.
// base   = dernière version connue du dépôt (avant les modifs locales)
// local  = version de l'app
// remote = version actuelle du dépôt
// Un champ modifié d'un seul côté garde cette modif. Modifié des deux côtés : les objets
// (ex. tags) sont fusionnés clé par clé, sinon la modif locale gagne (c'est la plus récente pour l'utilisateur).
export function merge3(base, local, remote) {
  base = isObj(base) ? base : {};
  local = isObj(local) ? local : {};
  remote = isObj(remote) ? remote : {};
  const out = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const k of keys) {
    const b = base[k], l = local[k], r = remote[k];
    let v;
    if (deepEqual(l, b)) v = r;
    else if (deepEqual(r, b)) v = l;
    else if (deepEqual(l, r)) v = l;
    else if (isObj(l) && isObj(r)) v = merge3(isObj(b) ? b : {}, l, r);
    else v = l;
    if (v !== undefined) out[k] = v;
  }
  return out;
}
