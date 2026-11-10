---
name: cartographier
description: Cartographier en e2e tous les parcours de l'application, rôle par rôle, écran par écran, geste par geste, jusqu'à 100 % des cas couverts par un test réel. À utiliser pour « cartographie les cas », « est-ce que tout le circuit utilisateur est valable », « liste les cas e2e », « quels boutons ne sont pas testés », « chemins non validés ». Lit le code produit sans l'écrire, écrit la carte JSON des cas hors du dépôt, fait chercher par des breakers en arrière-plan les cas qu'elle oublie, juge la couverture, puis découpe chaque trou en lots livrer. N'écrit aucun test ni code produit.
argument-hint: "[zone ou rôle]"
---

# cartographier

Tu dresses la carte des parcours : chaque rôle, sur chaque écran, devant chaque geste qu'il a le droit de faire ou non, avec ce que le produit doit rendre. `~/.claude/CLAUDE.md`, le `CLAUDE.md` du dépôt et son `.claude/livrer.md` s'appliquent. Tu n'écris ni test ni code produit : le seul fichier que tu écris est la carte, hors du dépôt, dans le dossier des task lists que fixe `.claude/livrer.md`, sinon `<dossier parent du dépôt>/<nom du dépôt>-parcours.cas.json`. Une carte ouverte se reprend, elle ne se recrée pas.

## État au lancement

!`git rev-parse --short HEAD 2>/dev/null; git status --short 2>/dev/null | head -30; ls "$(dirname "$(git rev-parse --show-toplevel 2>/dev/null)")"/*.cas.json 2>/dev/null; true`

## 1. Recenser la surface, par commande

Chaque entrée porte son `fichier:ligne`, et chaque recensement sa commande avec son compte, jamais un souvenir.

- **Rôles** : chaque combinaison qui change un droit (rôle × type d'entreprise × profil), lue dans la source qui la tient (enum, garde de route, table des droits).
- **Écrans** : chaque route du front, avec son titre de menu et sa garde.
- **Gestes** : chaque élément actif de l'écran, états conditionnels compris : bouton, lien, champ saisi, envoi de formulaire, menu, onglet, téléversement, téléchargement. Recense-les par `git grep -n` des formes du framework (`(click)`, `<button`, `routerLink`, `formControlName`, `(ngSubmit)`, `onClick`, `href`), puis lis chaque gabarit : un bouton qui n'apparaît qu'à une condition se recense avec elle.
- **Routes** : chaque route du back qu'un geste appelle, avec sa garde et ses rôles.
- **e2e existants** : chaque titre de test e2e, et ce qu'il joue réellement (lu, pas déduit du titre).

## 2. Écrire les cas

```json
{
  "depot": "<nom du dépôt>",
  "roles": ["expert · cabinet", "dirigeant · SAS"],
  "ecrans": [{ "id": "E-dossier", "titre": "<titre de menu>", "source": "fichier:ligne",
               "gestes": [{ "id": "G-dossier-valider", "libelle": "Valider", "source": "fichier:ligne" }] }],
  "cas": [{ "id": "CAS-001", "role": "expert · cabinet", "ecran": "E-dossier", "geste": "G-dossier-valider",
            "attendu": "autorise|refuse", "effet": "<le nombre, la phrase de refus ou le geste visible>",
            "source": "fichier:ligne", "origine": "lecture|breaker", "e2e": "<chemin> :: CAS-001 · <titre>" }]
}
```

- Chaque rôle a un cas sur chaque geste de chaque écran, permis ou refusé. Un cas `geste: null, attendu: "refuse"` dit que la garde de route ferme l'écran à ce rôle ; il couvre tous ses gestes, et sa `source` est cette garde.
- Au-delà du geste nominal, chaque geste qui écrit reçoit ses cas de casse : saisie vide, zéro, négatif, trop longue, au mauvais format ou dans le mauvais champ ; double envoi, retour arrière, rechargement en cours de saisie, deux onglets, session expirée ; identifiant d'un autre dossier ou d'un autre tenant dans l'URL. L'`effet` dit ce que le produit doit rendre ; un plantage n'est jamais un effet.
- `e2e` ne nomme qu'un test lu qui joue ce rôle, ce geste et cet effet, et dont le titre porte l'identifiant du cas ; sinon `null`.
- Ce que l'écran rend ne se décide pas ici : un `attendu` que le code et ses tests ne tranchent pas part par `AskUserQuestion`, une question à la fois, recommandation en tête.

## 3. Breakers en mode parcours

Dès que la carte d'un rôle est écrite, un `Agent(subagent_type: "atelier:breaker")` part en arrière-plan, en mode parcours, avec le chemin de la carte, ce rôle et ses écrans ; tu continues le rôle suivant pendant qu'il travaille. Chaque contre-exemple qu'il rend entre dans la carte, `origine: "breaker"`. Un rôle se relance sur ce qu'il a ajouté jusqu'à une passe sans cas neuf ; à la troisième passe qui en trouve encore, la classe des cas restants part à l'humain par `AskUserQuestion`.

## 4. Juger la couverture

`node ${CLAUDE_PLUGIN_ROOT}/skills/cartographier/scripts/couverture.mjs <carte>`, joué depuis la racine du dépôt ou son dossier parent, rend `COUVERT` (exit 0) ou chaque manque : un rôle sans cas sur un geste, un cas sans e2e, un e2e absent ou dont le titre ne porte pas le cas, une référence inconnue, puis `couverture : n/m cas`. Cette sortie, recopiée, est la mesure du rapport.

## 5. Découper les trous en lots livrer

Les cas sans e2e, rangés par parcours, en lots de quinze au plus, chacun une demande `atelier:livrer` :

- `refactor: parcours <écran> (CAS-…)` quand le produit rend déjà l'`attendu` : l'e2e fige l'existant ;
- `bug: <symptôme> (CAS-…)` quand il ne le rend pas : plantage, refus sans cause, valeur rangée au mauvais endroit, geste permis qu'il fallait refuser.

Chaque test que livrer écrit porte l'identifiant du cas dans son titre, et la carte reçoit son `e2e`. La carte vit jusqu'au `COUVERT`.

## Rapport

```text
Carte      : <chemin> · <r> rôles · <e> écrans · <g> gestes · <n> cas (<b> venus du breaker)
Recensés   : <commande → compte> pour chaque surface
Couverture : <sortie de couverture.mjs> · EXIT=<n>
Trous      : <CAS-… · ce qui casse, fichier:ligne> | aucun
Lots       : <refactor|bug: … (CAS-…)> dans l'ordre où livrer les prend
```
