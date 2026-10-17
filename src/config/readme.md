# baseCards.json & lang.json

## Cheat-sheet

* Retour à la ligne
``\n``

* Non-breaking space
``\u00a0``

___

## Templates

### Card Template

```json
    {
      "desc": "\n \u00a0 ",
      "mjreveal":"",
      "timer": false,
      "choices": [
        {
          "value": "",
          "reveal": "\n \u00a0 ",
          "mjreveal":""
        },
        {
          "value": "",
          "reveal": "\n \u00a0 ",
          "mjreveal":""
        },
        {
          "value": "Ne rien faire",
          "reveal": "\n \u00a0",
          "mjreveal":"Perte de moral."
        }
      ]
      "alts": {
        "blackout": {
          "desc": "\n\u00a0 ",
          "choices": [
            {
              "value": "",
              "reveal": "\n\u00a0 ",
              "mjreveal":""
            }
          ]
        }
        "
      }
    }
```

### Choix avec un jet

La suite dépend d'un jet : en jeu, le chrono se met en pause et le MJ dit si le jet est réussi ou raté (menu MJ ou boutons sous la carte).
`stat` : combat, pilotage, engineering, survival ou recon. Chaque suite a un `reveal` (résultat) ou un `next` (carte suivante d'un lieu), et peut avoir `mjreveal`, `humans` et `loot` comme un choix.
Le `humans` et le `loot` du choix lui-même s'appliquent quel que soit le résultat. Les variantes (`alts`) n'ont pas de jet.

```json
        {
          "value": "Tenter une manoeuvre d'evitement",
          "mjreveal": "Jet de pilotage",
          "roll": {
            "stat": "pilotage",
            "success": { "reveal": "\n   ", "mjreveal": "" },
            "failure": { "reveal": "\n   ", "mjreveal": "" }
          }
        }
```

### Planet Template

```json
    {
      "value": ,
      "modules": {
        "oxy": {
          "cost": ,
          "value": 
        },
        "grv": {
          "cost": ,
          "value": 
        },
        "wtr": {
          "cost": ,
          "value": 
        },
        "fau": {
          "cost": ,
          "value": 
        },
        "flo": {
          "cost": ,
          "value": 
        },
        "civ": {
          "cost": ,
          "value": 
        },
        "cli": {
          "cost": ,
          "value": 
        },
        "res": {
          "cost": ,
          "value": 
        }
      }
    }
```

### Place Template
<br> 
Pour tous les textes utiliser ChatGPT pour vérifier les fautes, le vocabulaires et la syntaxe 
<br><br> <br> <br> 

#### Drawflow
  http://localhost:8080/buildCard
  <br> Il faut autoriser les notifications !!<br> <br> <br> 


##### Tutoriel Drawflow
<br>
Pour créer une carte il suffit de rentrer le nom de la carte dans la textbox et d'appuyer sur le boutton "ADD" juste à droite.<br> 
<br> 
Pour Sauvegarder ta carte appuie sur "Save" en étant sur la carte que tu veux sauvegarder.<br> 
<br> 
Pour Récupérer le .json correspondant à ta carte lieu il faut cliquer sur "Export"  une fois le document télécharger il faut copier son contenu et le coller dans le baseCards.json dans la catégorie "place"
<br> <br> 

Pour éditer une carte lieu tu peux ajouter des blocs avec un click&drag,
tu peux relier plusieurs blocs avec un click&drag sur les points.
Tu peux supprimer des objets en les selectionnant et ta touche "suppr" ou avec un clique droit
<br> <br> 

Pour supprimer une carte lieux il suffit de cliquer sur le boutton rouge "Delete" (un pop-up de confirmation apparaitra) <br> <br>

Précisions :
1) Tous les "name" doivent être différents pour pouvoir export 
2) Tous les chemins doivent aboutir à un reveal
3) pas de ctrl+z si tu modifie un truc 
<br> 
<br> 
<br> 
<br> 

#### Creation Carte lieu

1) Imaginner le lieux
2) Le décrire (décris le décors et les personnages qui sont présents)
3) trouver des actions que les joueurs auront naturellement envie de faire (parler aux personnages, visiter le lieu, inspecter un point d'intérert ...) et les transfromer en 3 choix
4) Inventer une histoire pour ses trois choix
5) faire progresser les joueurs étapes par étapes en décrivant petits à petits leur progression.
6) Donner une récompense (si possible ayant un lien avec l'histoire que les joueurs viennent de suivre)
<br> <br> 

### Item-Template

```json
    {
      "name": "",
      "slug": "",
      "desc": "",
      "race": ""
    },
```

___

## Variables

### Modules

#### 0 = id

#### _art = "le", "votre", "du", "no"_

* ```[art_module_0]``` **(tout les modules)**

  cryopods, motors, scanner, proximity, energy, oxygen, gravity, landing, construction, dbscience, dbhistory

* ```[art_module-bdd_0]``` **(tout les modules sans les bdd)**

  cryopods, motors, scanner, proximity, energy, oxygen, gravity, landing, construction

* ```[art_module-h_0]``` **(tout les modules sans cryo)**

  motors, scanner, proximity, energy, oxygen, gravity, landing, construction, dbscience, dbhistory

* ```[art_module-h-bdd_0]``` **(modules principaux et secondaires)**

  motors, scanner, proximity, energy, oxygen, gravity, landing, construction

* ```[art_module-main_0]``` **(uniquement les modules principaux)**

  motors, scanner, proximity, energy, oxygen, gravity

### Race

#### _art = "le", "des", "un", "du", "au", "aux", "no"_

* ```[art_race_0]``` **(toute les races)**

  fnek, omphor, sylv, ygrl, shrymp, aku, york, nek_eau, nek_feu, nek_terre, nek_air.

### Stats

#### _art = "la", "votre", "de", "ses"_
  
* ```[art_stats_0]``` **(toute les stats)**

  combat, pilotage, ingenierie, survie, reconnaissance.
