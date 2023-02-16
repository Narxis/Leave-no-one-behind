La première carte d'un lieu n'a pas de name.
Pour les choix des cartes lieux, si il y a un followup, utiliser "next" avec le "name" de la carte suivante
Si c'est le dernier choix, utiliser reveal
Le name de la carte permet de la lier avec un choix.

J'ai mis les 2 première cartes pos/neg/neu ainsi que 2 planètes random pour l'exemple
Pour les lieux, j'ai fait la bibliothèque avec le follow up du choix 3 uniqument à titre d'exemple.

## Cheat-sheet

* Retour à la ligne
``\n``

* Non-breaking space
``\u00a0``

## Templates

### Card-Template

```json
    {
      "desc": "\u00a0 <span class=\"blackout\"></span>",
      "timer": false,
      "choices": [
        {
          "value": "",
          "reveal": ""
        },
        {
          "value": "",
          "reveal": ""
        },
        {
          "value": "Ne rien faire",
          "reveal": ""
        }
      ]
    }
```

### Item-Template

```json
    {
      "name": "",
      "slug": "",
      "desc": "",
      "race": ""
    },
```

### Span

Différents span présent dans le baseCards.json :

* ```<span class=\"blackout\">\u00a0 </span>```

* ```<span class=\"mjreveal\">\u00a0 </span>```

* ```<span class=\"alt-text\" data-condition=\"ship.energy == 100\"></span>```
