// Logique du pressage, sans interface : testable avec un faux Spotify.

// Liste des URIs à presser, dans l'ordre (Face A puis Face B), sans doublon.
export function pressList(ids, getDoc) {
  const seen = new Set(), uris = [], included = [], missing = [], dups = [];
  for (const id of ids) {
    const d = getDoc(id);
    if (!d || !d.spUri) { missing.push(id); continue; }
    if (seen.has(d.spUri)) { dups.push(id); continue; }
    seen.add(d.spUri); uris.push(d.spUri); included.push(id);
  }
  return { uris, included, missing, dups };
}

/*
  Presse une composition.
  - ids      : titres dans l'ordre Face A puis Face B
  - getDoc   : id -> titre courant
  - resolve  : id -> Promise (cherche le titre sur Spotify et enregistre spUri), pour ceux qui n'en ont pas
  - replace  : repressage (remplace le contenu de `old`, garde le lien) ; sinon nouvelle playlist
  - sp       : { createPlaylist, replaceItems, renamePlaylist, playlistUris, playlistId, playlistUrl }
  - onStep   : (étape, détail) pour l'animation
*/
export async function pressPlaylist({ ids, getDoc, resolve, name, description, replace, old, sp, onStep = () => {} }) {
  onStep("biscuit", ids.length + " titres");
  const todo = ids.filter(id => { const d = getDoc(id); return d && !d.spUri; });
  for (let i = 0; i < todo.length; i++) {
    onStep("biscuit", "Recherche sur Spotify " + (i + 1) + "/" + todo.length);
    try { await resolve(todo[i]); } catch (e) { if (e && (e.kind === "auth" || e.kind === "offline")) throw e; }
  }
  const list = pressList(ids, getDoc);
  if (!list.uris.length) throw Object.assign(new Error("Aucun titre trouvé sur Spotify"), { kind: "empty" });

  onStep("press");
  let pl = null, note = "";
  if (replace && old && old.uri) {
    const id = sp.playlistId(old.uri);
    try {
      await sp.replaceItems(id, list.uris);
      if (name && name !== old.name) { try { await sp.renamePlaylist(id, name); } catch (e) { /* le nom n'est pas bloquant */ } }
      pl = { id, uri: old.uri, url: sp.playlistUrl(id) };
    } catch (e) {
      if (e && (e.kind === "forbidden" || e.kind === "notfound")) note = "L'ancienne playlist n'est pas modifiable depuis l'app (créée par un autre outil) : nouvelle playlist créée, c'est elle qui sera représsée ensuite.";
      else throw e;
    }
  }
  if (!pl) {
    pl = await sp.createPlaylist(name, description);
    await sp.replaceItems(pl.id, list.uris);
  }

  onStep("groove");
  let exact = null;
  try {
    const actual = await sp.playlistUris(pl.id);
    exact = actual.length === list.uris.length && actual.every((u, i) => u === list.uris[i]);
  } catch (e) { exact = null; }
  return { pl, list, exact, note };
}
