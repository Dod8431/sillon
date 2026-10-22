# Sillon

App perso de découverte musicale : des **fournées** de titres, notées sur 10 sur une **platine**, rangées dans **le bac**, puis **pressées** en playlist Spotify.

En ligne : https://dod8431.github.io/sillon/

## Architecture

- **App statique** (Vite + React 18, sans JSX : `h = React.createElement`), publiée sur GitHub Pages.
- **Données** dans le dépôt privé `Dod8431/sillon-data`, un fichier JSON par titre (`data/ratings/<slug>.json`), par composition (`data/sessions/<id>.json`) et par demande Explorer (`data/requests/<id>.json`).
- **Copie locale** dans IndexedDB : tout marche hors ligne, la synchro reprend au retour du réseau.
- **Synchro GitHub** (`src/data/sync.js`) : écriture 3 s après la dernière modif, un fichier à la fois avec son `sha`. En cas de conflit, l'app relit le fichier, fusionne champ par champ (`src/data/merge.js`) et réessaie. Lecture au démarrage, toutes les 60 s et au retour au premier plan, avec ETag (une réponse 304 ne consomme pas de quota).
- **Spotify** en PKCE, sans serveur (`src/spotify/`), avec les endpoints de février 2026 (`/me/playlists`, `/playlists/{id}/items`, recherche limitée à 10 résultats).
- **Pressage** (`src/press.js`) : liste exacte, sans doublon, Face A puis Face B. Le représsage remplace le contenu de la même playlist, donc le lien ne change pas.

## Secrets

Aucun dans ce dépôt.
- Le **Client ID Spotify** (`src/config.js`) est public par nature.
- Le **jeton GitHub** est saisi dans Réglages et reste dans le `localStorage` du navigateur. C'est un jeton « fine-grained » limité à `sillon-data`, avec **Contents : Read and write**.
- Le build publié embarque une CSP stricte : aucun script tiers, réseau limité à GitHub et Spotify.

## Développement

```bash
npm install
npm run dev     # http://127.0.0.1:5173/ (adresse à déclarer aussi comme redirection Spotify)
npm test        # slug, fusion, sync (conflits, hors ligne), pressage
npm run build
```

Pour tester sans toucher au vrai dépôt, lance un faux GitHub local qui fait de vrais commits dans un clone de sillon-data :

```bash
git clone ../sillon-data /tmp/sillon-data-dev
SILLON_DEV_REPO=/tmp/sillon-data-dev npm run dev
```

Puis colle n'importe quel jeton dans Réglages, et vérifie avec `git -C /tmp/sillon-data-dev log`.

## Déploiement

Chaque push sur `main` lance les tests, le build, puis la publication sur Pages (`.github/workflows/deploy.yml`).
Une seule fois : Settings → Pages → Source : **GitHub Actions**.
