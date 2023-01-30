**SETUP**

Cloner le repo

run `npm i`

run `node server.js`

http://localhost:8080

**ROUTES**

Les fichiers dans les dossiers `public/css`, `public/js`, `public/img` répondront respectivement sur les uri `/css`, `/js`, `/img`
Il suffira d'un `src="/js/script.js"` ou `href="/img/image.png"` pour y accèder depuis un template.

**AJOUTER UNE PAGE**

Ajouter sa route dans `src/routers/default.js` à la suite des autres :

```
router.get('/nouvelle_route', controller.nouvelle_fonction);
```

Il faudra ensuite créer la fonction qui gère l'affichage dans `src/controllers/default.js` :
```
module.exports.nouvelle_fonction = function (req, res) {
    res.render('nom_du_template');
}
```
La fonction `res.render()` ira chercher le template dans `public/views/nom_du_template.ejs`

Il faudra que les templates soient au format ejs. Le html est accepté donc il suffit de renommer le `nom_du_template.html` en `nom_du_template.ejs`

Il est également possible de passer des variables dans le template.
Il suffira de les passer dans un bojet, dans la fonction `res.render()` appelée dans le controller comme suit :
```
module.exports.nouvelle_fonction = function (req, res) {
    let variable_texte = 'Texte random';
    res.render('nom_du_template', {var_text: variable_texte});
}
```
Puis, pour l'appeler dans le template, dans notre `nom_du_template.ejs`, on pourra afficher la variable avec la balise suivante :
```
<%= var_text %>
```

Il est aussi possible d'insérer un template dans un autre en utilisant cette balise dans notre template :
```
<%- include("nom_du_template_a_inclure") %>
```

**EVENT LISTENERS**

Le websocket va trigger des events listener qu'il sera possible d'utiliser  via un addEventListener() sur le document.
```
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
