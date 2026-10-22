// Identifiant d'un titre : slug(artiste + " " + titre).
// Même règle que l'artifact v10 : minuscules, accents retirés, tout ce qui n'est pas a-z0-9 devient "-".
// Ne pas modifier : les noms de fichiers de sillon-data en dépendent.
export const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const trackId = (artist, song) => slug(artist + " " + song);

// Version "mots" pour comparer des noms (recherche Spotify, filtres).
export const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
