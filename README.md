# LNOB

- [Setup](#setup)
- [App de bureau](#app-de-bureau)
- [Partie en ligne](#partie-en-ligne)
- [Routes](#routes)
- [Ajouter une page](#ajouter-une-page)
- [Event Listeners](#event-listeners)
- [API](#api)
    - [Cards](#cards)
    - [Players](#players)
    - [Spaceship](#spaceship)
    - [Statuses](#statuses)
    - [Items](#items)




## SETUP

Cloner le repo

run `npm i`

run `npm start`

http://localhost:8080

## APP DE BUREAU

Le jeu peut aussi se lancer dans une app (Electron), sans navigateur ni terminal :

run `npm run app`

L'app démarre le serveur et ouvre l'écran principal. Le menu **Jeu** (touche Alt sous Windows et Linux) ouvre le panneau MJ dans une autre fenêtre, ou affiche l'adresse et le QR code pour l'ouvrir sur un téléphone du même Wi-Fi.

Ce que le jeu écrit (bases SQLite, `storage/cache`, images des races customs) va dans le dossier de données de l'utilisateur (menu **Jeu > Dossier des données**), pas dans le dossier du jeu. Avec `npm start`, rien ne change : tout reste dans le dossier de lancement. La variable `LNOB_DATA_DIR` permet de choisir un autre dossier.

Le bot Discord ne démarre pas dans l'app : son code reste dans le dépôt mais n'est plus utilisé.

Pour fabriquer l'installeur du système en cours (`.exe` sous Windows, `.dmg` sous macOS, `.AppImage` sous Linux) dans `dist/` :

run `npm run dist`

Le workflow GitHub **App de bureau** (onglet Actions, bouton *Run workflow*) fabrique les trois et les met dans les artefacts du run. L'app n'est pas signée : Windows et macOS affichent un avertissement au premier lancement.

## PARTIE EN LIGNE

À l'ouverture, l'app demande « Créer une partie » (MJ) ou « Rejoindre une partie » (joueur).

Le MJ lance le jeu sur son PC comme avant ; la page **Partie en ligne** (`/lobby`, ouverte d'office dans l'app) donne un code et un lien à transmettre aux joueurs, et montre qui est connecté. Les joueurs entrent le code dans l'app, ou ouvrent le lien dans leur navigateur. Ils suivent ensuite la partie sur leur écran : carte en cours, fiche de leur perso, plan et modules du vaisseau, inventaire et équipage. Pendant la création (page des persos du MJ), ils créent leur perso eux-mêmes : nom, race, puis tirage des stats dé par dé. Pendant la partie, ils lancent leurs dés et envoient des emotes. Le chat écrit a un salon commun et une conversation privée entre le MJ et chaque joueur ; le MJ l'a sur la page **Partie en ligne** (`src/controllers/chat.js`, historique gardé pendant la partie).

Chaque joueur a un identifiant d'app, créé à sa première connexion et gardé sur son appareil. Il remplit la colonne `discord_id` du jeu : en revenant, le joueur retrouve son personnage. Les pages du MJ ont droit à toutes les actions du WebSocket ; un joueur en ligne seulement à celles de `src/controllers/remote.js` (rejoindre, nom, race, tirage des stats, dés, emote, donner un objet), toujours en son nom. Ce qu'il voit du jeu part de `src/controllers/playerView.js`, sans les secrets du MJ (révélations, suites des choix, butin, valeurs des planètes).

La page joueur (`public/player`) est servie telle quelle par le relais : après l'avoir modifiée, redéployer le relais (`npm run deploy` dans `relay/`). Le plan du vaisseau y est copié par `node scripts/player-assets.js` (les tests vérifient que la copie est à jour).

Les messages passent par un relais (dossier `relay/`, voir [relay/README.md](relay/README.md)) : en local `npm run relay`, en ligne sur Cloudflare Workers. Son adresse est dans `package.json` (`lnob.relayUrl`) ou dans la variable `LNOB_RELAY_URL`.

## ROUTES

Les fichiers dans les dossiers `public/css`, `public/js`, `public/img` répondront respectivement sur les uri `/css`, `/js`, `/img`
Il suffira d'un `src="/js/script.js"` ou `href="/img/image.png"` pour y accèder depuis un template.

## AJOUTER UNE PAGE

Ajouter sa route dans `src/routers/default.js` à la suite des autres :

```javascript
router.get('/nouvelle_route', controller.nouvelle_fonction);
```

Il faudra ensuite créer la fonction qui gère l'affichage dans `src/controllers/default.js` :
```javascript
module.exports.nouvelle_fonction = function (req, res) {
    res.render('nom_du_template');
}
```
La fonction `res.render()` ira chercher le template dans `public/views/nom_du_template.ejs`

Il faudra que les templates soient au format ejs. Le html est accepté donc il suffit de renommer le `nom_du_template.html` en `nom_du_template.ejs`

Il est également possible de passer des variables dans le template.
Il suffira de les passer dans un bojet, dans la fonction `res.render()` appelée dans le controller comme suit :
```javascript
module.exports.nouvelle_fonction = function (req, res) {
    let variable_texte = 'Texte random';
    res.render('nom_du_template', {var_text: variable_texte});
}
```
Puis, pour l'appeler dans le template, dans notre `nom_du_template.ejs`, on pourra afficher la variable avec la balise suivante :
```ejs
<%= var_text %>
```

Il est aussi possible d'insérer un template dans un autre en utilisant cette balise dans notre template :
```ejs
<%- include("nom_du_template_a_inclure") %>
```

## EVENT LISTENERS

Le websocket va trigger des events listener qu'il sera possible d'utiliser  via un addEventListener() sur le document.
```javascript
document.addEventListener('set-race', function(e) {
  console.log(e);
  // e.detail contiendra les infos propres à l'action, ici l'ID du joueur et la race choisie
})
```
| Event name | Description                 | Event detail                                                                                                                                                                                                                                                                                                                                                  |
|------------|-----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| join       | player join game (creation) | <pre>"action":"join",<br>"uid":"discord_id",<br>"nick":"pseudo#1234"</pre>                                                                                                                                                                                                                                                                                    |
| set-race   | player set race (creation)  | <pre>"action": "set-race",<br>"data": {<br>    "action": "set-race",<br>    "uid": "discord_id",<br>    "race": "race",<br>    "nick": "pseudo"<br>}</pre>                                                                                                                                                                                                    |
| set-name   | player set name (creation)  | <pre>"action": "set-name",<br>"data": {<br>    "action": "set-name",<br>    "uid": "discord_id",<br>    "nick": "pseudo"<br>}                                                                                                                                                                                                                                 |
| roll-stats | player stat roll (creation) | <pre>"action": "roll-stats",<br>"data": {<br>    "action": "roll-stats",<br>    "uid": "discord_id","data": {<br>    "combat": [20,38],<br>    "pilotage": [28],<br>    "engineering": [35,36],<br>    "survival": [35],<br>    "recon": [32,44],<br>    "moral": 100<br>}}</pre>                                                                             |
| playerStat | update stat player (IG)     | <pre>"action": "playerStat",<br>"data": {<br>    "id": 7,        <br>    "name": "pseudo",        <br>    "discord_id": "discord_id",        <br>    "race": "race",        <br>    "combat": 0,        <br>    "pilotage": 0,        <br>    "engineering": 0,        <br>    "survival": 0,        <br>    "recon": 0,        <br>    "moral": 0<br>}</pre> |
| roll       | player made a roll (IG)     | <pre>"action": "roll",<br>"data": {<br>    "discord_id": "discord_id",<br>    "stat": "combat",<br>    "module": false,<br>    "success": false,<br>    "result": -12,<br>    "dice_result": 87<br>}</pre>                                                                                                                                                    |
| item       | add or remove item (IG)     | <pre></pre>                                                                                                                                                                                                                                                                                                                                                   |
| status     | modify a status (IG)        | <pre></pre>                                                                                                                                                                                                                                                                                                                                                   |

## API

### Cards
```http
GET /api/nextCard/get
# Obtient les infos de la prochaine carte (ne la marque pas comme jouée)
GET /api/nexCard/pop
# Obtient les infos de la prochaine carte (marque la carte comme jouée)
GET /api/nextCard/get/:name
# Obtient les infos de la carte avec le nom {:name} (ne la marque pas comme jouée)
```
```json
{
  "id": 1, // id de la carte
  "type": 1, // 0:planète,1:neutre,2:positive,3:negative,4:lieu
  "value": -1, // >0 pour les cartes planète
  "name": "", // renseigné si followup carte lieu
  "desc": "", // texte de la carte
  "timer": 0, // 0||1 
  "choices": [  // rempli si carte !planète
    {
      "value": "", // texte choix
      "reveal": "", // texte si le choix est fait (unset si il y a un followup dans le cas des cartes lieu)
      "next": "" // name de la carte qui va suivre (carte lieu uniquement)
    }
  ]
}
```
### Players 
```http
GET /api/players
# Obtient un tableau des infos de tous les joueurs
```
```json
[
  {
    "id": 1,
    "discord_id": "discord_id",
    "name": "",
    "race": "",
    "combat": 0,
    "pilotage": 0,
    "engineering": 0,
    "survival": 0,
    "recon": 0,
    "moral": 0
  }
]
```
```http
GET /api/player/:discordId'
# Obtient les infos d'un joueur depuis son discordId
```
```json
{
    "id": 1,
    "discord_id": "discord_id",
    "name": "",
    "race": "",
    "combat": 0,
    "pilotage": 0,
    "engineering": 0,
    "survival": 0,
    "recon": 0,
    "moral": 0
}
```
### Spaceship
```http
GET /api/ship'
# Obtient les infos du vaisseau
```
```json
{
  "id": 1,
  "name": "",
  "cryopods": 1000,
  "scanner": 100,
  "proximity": 100,
  "motors": 100,
  "shield": 100,
  "oxygen": 100,
  "energy": 100,
  "gravity": 100,
  "landing": 100,
  "construction": 100,
  "scanner_up": 0,
  "oxygen_up": 0,
  "energy_up": 0,
  "gravity_up": 0
}
```
### Statuses
```http
GET /api/statuses'
# Obtient un tableau contenant tous les statuts
GET /api/statuses/active'
# Obtient un tableau contenant tous les statuts actifs (duration > 0)
```
```json
[
  {
    "id": 1,
    "name": "",
    "desc": "",
    "slug": "",
    "duration": 0
  }
]
```
### Items
```http
GET /api/items'
# Obtient un tableau contenant tous les items
GET /api/items/owned'
# Obtient un tableau contenant tous les items possédéss (quantity > 0)
```
```json
[
  {
    "name": "",
    "slug": "",
    "desc": "",
    "race": "",
    "pool": "",
    "quantity": ""
  }
]
```
```http
GET /api/items/owned/:discord_id'
# Obtient un tableau contenant tous les items de départ actuellement en possession du joueur avec ce discord_id
```
```json
[
  {
    "name": "",
    "slug": "",
    "owners": [],
    "desc": "",
    "race": "",
    "pool": ""
  }
]
```
