# Relais LNOB

Le relais met en relation le MJ et les joueurs d'une partie en ligne. Le jeu tourne sur le PC du MJ ; le relais ne connaît pas les règles, il fait seulement passer les messages entre le MJ et les joueurs qui ont le code de la partie. Il sert aussi la page joueur, pour rejoindre une partie depuis un navigateur avec le lien donné par le MJ.

- `lobby-core.js` : la logique (codes de partie, arrivées, départs, reconnexion du MJ, partie oubliée après 12 h sans MJ).
- `worker.js` + `wrangler.toml` : le relais en ligne, sur Cloudflare Workers (offre gratuite).
- `dev-server.js` : le même relais en Node, pour jouer ou tester en local (`npm run relay` à la racine du dépôt).
- `discord-auth.js` : la connexion Discord des joueurs (facultative, voir plus bas).

## Jouer en local

L'app utilise le relais en ligne, https://lnob-relay.narxis.workers.dev (`lnob.relayUrl` dans `package.json`). Pour jouer avec un relais local : `npm run relay` à la racine du dépôt, puis `LNOB_RELAY_URL=http://127.0.0.1:8787 npm run app` et « Créer une partie ».

## Mettre le relais en ligne (une seule fois)

1. Créer un compte gratuit sur https://dash.cloudflare.com/sign-up.
2. Dans ce dossier : `npm install`, puis `npx wrangler login` (ouvre le navigateur pour autoriser).
3. `npm run deploy`. Wrangler affiche l'adresse du relais, par exemple `https://lnob-relay.ton-compte.workers.dev`.
4. Mettre cette adresse dans `package.json` à la racine, champ `lnob.relayUrl`, puis refaire l'app (`npm run dist` ou le workflow **App de bureau**).

Pour tester une autre adresse sans refaire l'app : variable d'environnement `LNOB_RELAY_URL`.

## Mettre à jour la page joueur

Le relais sert la page joueur (`public/player`) telle qu'elle était au moment du déploiement. Il faut donc le redéployer quand cette page change. Mieux vaut le faire entre deux parties : le déploiement coupe les connexions en cours, même si le MJ et les joueurs se reconnectent tout seuls.

### Automatiquement (recommandé)

Le workflow **Relais** (`.github/workflows/relay.yml`) redéploie le relais à chaque fusion sur `prod` qui touche `relay/` ou `public/player/`. On peut aussi le lancer à la main depuis l'onglet Actions. Réglage à faire une seule fois :

1. Sur https://dash.cloudflare.com/profile/api-tokens : **Create Token**, modèle **Edit Cloudflare Workers**. Dans « Account Resources », choisir ton compte ; dans « Zone Resources », **All zones**. Puis **Continue to summary** et **Create Token**. Copier le jeton affiché.
2. L'identifiant du compte (**Account ID**) est sur https://dash.cloudflare.com, dans le menu « ⋯ » à côté du nom du compte (« Copy account ID »), ou affiché par `npx wrangler whoami` dans ce dossier.
3. Sur GitHub, dépôt → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** : `CLOUDFLARE_API_TOKEN` avec le jeton, puis `CLOUDFLARE_ACCOUNT_ID` avec l'identifiant.

### À la main

Dans ce dossier, sur `prod` à jour : `npm run deploy`.

## Connexion Discord (facultative)

Les joueurs peuvent se connecter avec Discord dans l'app : leur pseudo et leur avatar Discord s'affichent à côté de leur perso (écrans du MJ, lobby, onglet Équipage des autres joueurs), pour se reconnaître même avec des noms de persos différents. Sans réglage, rien ne change : le bouton n'apparaît pas et le nom saisi dans le lobby sert comme avant. Le bot Discord n'est pas utilisé.

**Pourquoi le relais.** Discord renvoie le joueur sur une adresse fixe, déclarée dans l'application Discord, et l'échange du code contre un jeton demande le secret de l'application. Le relais est la seule adresse fixe et publique de la partie en ligne (le serveur du MJ tourne sur son PC, souvent injoignable depuis Internet), et le secret y reste dans les variables de Cloudflare : il n'est jamais dans la page joueur, l'app ni chez le MJ. Le relais ne garde rien : après la connexion, il renvoie à la page joueur un profil signé (id, pseudo, URL de l'avatar ; scope `identify` seulement, ni e-mail ni jeton Discord), valable 30 jours. La page le présente en rejoignant une partie ; le relais vérifie la signature, donc un joueur ne peut pas prendre le compte Discord d'un autre.

Réglage, une seule fois :

1. Sur https://discord.com/developers/applications : **New Application** (nom : LNOB par exemple).
2. Onglet **OAuth2** : copier le **Client ID**, puis **Reset Secret** et copier le **Client Secret**.
3. Toujours dans **OAuth2**, **Redirects** → **Add Redirect** : `https://lnob-relay.narxis.workers.dev/auth/discord/callback` (l'adresse du relais suivie de `/auth/discord/callback`), puis **Save Changes**. Pour le relais local, ajouter aussi `http://127.0.0.1:8787/auth/discord/callback`.
4. Dans ce dossier : `npx wrangler secret put DISCORD_CLIENT_ID` puis `npx wrangler secret put DISCORD_CLIENT_SECRET` (chacun demande la valeur). On peut aussi les saisir sur le tableau de bord Cloudflare : Workers → lnob-relay → Settings → Variables and Secrets.
5. Rien à redéployer pour les secrets ; la page joueur doit seulement être à jour (voir plus bas).

Relais local : `DISCORD_CLIENT_ID=… DISCORD_CLIENT_SECRET=… npm run relay`.

Pour tout désactiver : supprimer les deux secrets (`npx wrangler secret delete DISCORD_CLIENT_SECRET`). Changer le secret sur Discord déconnecte tous les joueurs (les profils signés avec l'ancien ne sont plus acceptés).

## Limites

8 joueurs par partie, messages de 64 Ko au plus. Sur l'offre gratuite de Cloudflare : 100 000 requêtes par jour, où les messages WebSocket reçus comptent pour 1/20e de requête chacun ([tarifs](https://developers.cloudflare.com/durable-objects/platform/pricing/)). Une partie en utilise une infime partie.

## Tests

`node tests/relay.js` (lancé par `npm test`) teste le relais Node. Pour tester la version Cloudflare : `npm run dev` dans ce dossier, puis `RELAY_URL=http://127.0.0.1:8787 node tests/relay.js` à la racine. Le relais en ligne se teste de la même façon : `RELAY_URL=https://lnob-relay.narxis.workers.dev node tests/relay.js`.
