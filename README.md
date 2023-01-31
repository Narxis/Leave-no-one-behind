# LNOB

- [Setup](#setup)
- [Routes](#routes)
- [Ajouter une page](#ajouter-une-page)
- [Event Listeners](#event-listeners)
- [API](#api)
    - [Cards](#cards)
    - [Players](#players)
    - [Spaceship](#spaceship)




## SETUP

Cloner le repo

run `npm i`

run `npm start`

http://localhost:8080

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
| Event name   | Description                 | Event detail                                                                                                                                                                                                                                                                                                                                                  |
|--------------|-----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| join         | player join game (creation) | <pre>"action":"join",<br>"uid":"discord_id",<br>"nick":"pseudo#1234"</pre>                                                                                                                                                                                                                                                                                    |
| set-race     | player set race (creation)  | <pre>"action": "set-race",<br>"data": {<br>    "action": "set-race",<br>    "uid": "discord_id",<br>    "race": "race",<br>    "nick": "pseudo"<br>}</pre>                                                                                                                                                                                                    |
| set-name     | player set name (creation)  | <pre>"action": "set-name",<br>"data": {<br>    "action": "set-name",<br>    "uid": "discord_id",<br>    "nick": "pseudo"<br>}                                                                                                                                                                                                                                 |
| roll-stats   | player stat roll (creation) | <pre>"action": "roll-stats",<br>"data": {<br>    "action": "roll-stats",<br>    "uid": "discord_id","data": {<br>    "combat": [20,38],<br>    "pilotage": [28],<br>    "engineering": [35,36],<br>    "survival": [35],<br>    "recon": [32,44],<br>    "moral": 100<br>}}</pre>                                                                             |
| playerStat   | update stat player (IG)     | <pre>"action": "playerStat",<br>"data": {<br>    "id": 7,        <br>    "name": "pseudo",        <br>    "discord_id": "discord_id",        <br>    "race": "race",        <br>    "combat": 0,        <br>    "pilotage": 0,        <br>    "engineering": 0,        <br>    "survival": 0,        <br>    "recon": 0,        <br>    "moral": 0<br>}</pre> |
| roll         | player made a roll (IG)     | <pre>"action": "roll",<br>"data": {<br>    "discord_id": "discord_id",<br>    "stat": "combat",<br>    "module": false,<br>    "success": false,<br>    "result": -12,<br>    "dice_result": 87<br>}</pre>                                                                                                                                                    |

## API

### Cards
```http
GET /api/getNextCard
# Obtient les infos de la prochaine carte (ne la marque pas comme jouée)
GET /api/popNextCard
# Obtient les infos de la prochaine carte (marque la carte comme jouée)
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