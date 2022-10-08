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
Puis, pour l'appeler dans le template, dnas notre `nom_du_template.ejs`, on pourra afficher la variable avec la balise suivante :
```
<%= var_text %>
```

Il est aussi possible d'insérer un template dans un autre en utilisant cette balise dans notre template :
```
<%- include("nom_du_template_a_inclure") %>
```
