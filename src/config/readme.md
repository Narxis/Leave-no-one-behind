# baseCards.json & lang.json

## Cheat-sheet

* Retour à la ligne
``\n``

* Non-breaking space
``\u00a0``

___

## Templates

### Card-Template

```json
    {
      "desc": "\u00a0 <span class=\"blackout\">\u00a0 </span>",
      "timer": false,
      "choices": [
        {
          "value": "",
          "reveal": "\u00a0 <span class=\"mjreveal\">\u00a0 </span>"
        },
        {
          "value": "",
          "reveal": ""
        },
        {
          "value": "Ne rien faire",
          "reveal": "\u00a0 <span class=\"mjreveal\">\u00a0 Perte de moral.</span>"
        }
      ]
    }
```

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
```json
    {
      "start": true,
      "desc": "",
      "timer": false,
      "choices": [
        {
          "value": "",
          "next": "carte1"
        },
        {
          "value": "",
          "next": "carte2"
        },
        {
          "value": "",
          "next": "carte3"
        }
      ]
    }
```

```json
    {
      "desc": "",
      "name":"bibli2",
      "timer": false,
      "shuffle":true,
      "choices": [
        {
          "value": "",
          "next": ""
        },
        {
          "value": "",
          "next": ""
        },
        {
          "value": "",
          "next": ""
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

### Blackout

* ```<span class=\"blackout\">\u00a0 </span>```

### MJ-Reveal

* ```<span class=\"mjreveal\">\u00a0 </span>```

### Data-condition

* ```<span class=\"alt-text\" data-condition=\"ship.energy == 100\"></span>```

  ship.motors, ship.scanner, ship.proximity, ship.oxygen, ship.energy, ship.gravity, ship.landing, ship.construction, ship.dbscience, ship.dbhistory

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
