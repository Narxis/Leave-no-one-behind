# Relais LNOB

Le relais met en relation le MJ et les joueurs d'une partie en ligne. Le jeu tourne sur le PC du MJ ; le relais ne connaît pas les règles, il fait seulement passer les messages entre le MJ et les joueurs qui ont le code de la partie. Il sert aussi la page joueur, pour rejoindre une partie depuis un navigateur avec le lien donné par le MJ.

- `lobby-core.js` : la logique (codes de partie, arrivées, départs, reconnexion du MJ, partie oubliée après 12 h sans MJ).
- `worker.js` + `wrangler.toml` : le relais en ligne, sur Cloudflare Workers (offre gratuite).
- `dev-server.js` : le même relais en Node, pour jouer ou tester en local (`npm run relay` à la racine du dépôt).

## Jouer en local

À la racine du dépôt : `npm run relay`, puis `npm run app` et « Créer une partie ». Le relais local écoute sur http://127.0.0.1:8787, l'adresse utilisée par défaut.

## Mettre le relais en ligne (une seule fois)

1. Créer un compte gratuit sur https://dash.cloudflare.com/sign-up.
2. Dans ce dossier : `npm install`, puis `npx wrangler login` (ouvre le navigateur pour autoriser).
3. `npm run deploy`. Wrangler affiche l'adresse du relais, par exemple `https://lnob-relay.ton-compte.workers.dev`.
4. Mettre cette adresse dans `package.json` à la racine, champ `lnob.relayUrl`, puis refaire l'app (`npm run dist` ou le workflow **App de bureau**).

Pour tester une autre adresse sans refaire l'app : variable d'environnement `LNOB_RELAY_URL`.

## Limites

8 joueurs par partie, messages de 64 Ko au plus. Sur l'offre gratuite de Cloudflare : 100 000 requêtes par jour, où les messages WebSocket reçus comptent pour 1/20e de requête chacun ([tarifs](https://developers.cloudflare.com/durable-objects/platform/pricing/)). Une partie en utilise une infime partie.

## Tests

`node tests/relay.js` (lancé par `npm test`) teste le relais Node. Pour tester la version Cloudflare : `npm run dev` dans ce dossier, puis `RELAY_URL=http://127.0.0.1:8787 node tests/relay.js` à la racine.
