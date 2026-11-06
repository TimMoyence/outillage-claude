---
name: publier
description: Mettre en production ce qui est livré, sans rien oublier. À utiliser pour « commit, push, PR », « rends-le public », « publie », « prépare la mise en production », « écris le mail de déploiement », ou un inventaire de ce qui part. Revalide le diff complet, commite par lots, pousse et ouvre la PR quand le dernier message de l'humain le demande, dresse l'inventaire à 100 % de origin/main à HEAD, puis écrit le mail de mise en production visuel, sans jargon, lisible dans Outlook. N'écrit aucun code produit : un écart trouvé part dans livrer.
argument-hint: "[branche ou PR] [destinataires du mail]"
---

# publier

Tu publies ce que livrer a livré. `~/.claude/CLAUDE.md` et le `CLAUDE.md` du dépôt s'appliquent ; **lis `.claude/publier.md` du dépôt s'il existe** : charte du mail (couleurs, briques, exemples), destinataires, branches de mise en production. Il l'emporte sur cette skill.

## État au lancement

!`git fetch -q 2>/dev/null; git status -sb 2>/dev/null | head -20; git log --oneline origin/main..HEAD 2>/dev/null | head -40; true`

## 1. Revalider le diff complet

Lis `git diff origin/main...HEAD` en entier, fichiers non suivis compris : fonctionnalités terminées, simplicité, responsabilités claires, logique métier unique entre front et back, échanges par routes typées par un contrat généré. Cherche les duplications sémantiques au-delà du texte (la commande de doublons du dépôt, sinon une normalisation de l'AST). Chaque écart est un lot de `atelier:livrer`, qui le grave et le corrige avant que publier reprenne ; publier ne corrige rien lui-même. Les task lists entièrement livrées n'existent plus ; une task list encore ouverte bloque la publication du lot qu'elle porte.

## 2. Commiter, pousser, ouvrir la PR

- La suite complète du dépôt passe dans la commande du commit, devant lui. Un commit par lot global, qui nomme ses chemins et les morceaux d'une voisine qu'il embarque.
- Push et PR partent avec `PUSH_DEMANDE=1`, seulement si le dernier message de l'humain les demande ; sinon le rapport donne le SHA et l'avance sur l'amont.
- La description de la PR reprend l'inventaire du point 3, avec ses preuves.

## 3. Inventaire à 100 %

- Liste chaque nouveauté visible par un utilisateur entre ce que voient les lecteurs (`origin/main`) et ce qui part (`HEAD`) : écrans, gestes, libellés, messages, retraits. Chacune porte sa preuve : `fichier:ligne` à `HEAD`, ou sur `origin/main` pour un retrait.
- Range chacune : **HISTOIRE** (elle change la façon de travailler ou de décider) ou **MÉNAGE** (simplification, finition).
- Le tableau nouveauté → preuve → rang → endroit du mail se montre à la fin du rapport : aucune ligne vide.

## 4. Le mail de mise en production

**Forme dictée par le contenu**

- Autant de points numérotés que de vraies histoires, jamais un nombre fixé d'avance. Le ménage tient dans un texte court rangé par écran. Chaque geste est décrit.
- « En bref » ouvre le mail : la lecture en trente secondes qui situe un néophyte, puis une phrase « en 1 s » propre à cette mise en production.
- Pour chaque histoire, nomme d'abord l'objet qui change (un graphique, une fenêtre, un tableau, un parcours, un chiffre). L'image le redessine avec la géométrie, les libellés et les couleurs de l'écran réel, lus dans le composant et sa feuille de style ; jamais une tuile générique ni un avant / après plaqué. Un retrait se montre barré à l'endroit exact où il vivait.
- Le mail se termine sur ce que le lecteur a réellement à faire : un geste précis, ou rien.

**Lecture, pour qui ne connaît pas le logiciel**

- Zéro jargon : ni code, ni N-1, staging, migration, PR, verdict. « l'année dernière », « votre objectif du jour », « mieux que prévu ». Un écran se nomme par son intitulé de menu.
- Les chiffres d'illustration sont des exemples annoncés « Exemple », qui se recoupent (sommes, pourcentages) et suivent le calcul réel de l'application. Tout le reste est un fait prouvé.
- Pas d'introduction, pas de tableau de lignes, pas de frise technique, pas de phrase là où une image, un schéma ou un graphique suffit.

**Code couleur** : celui de `.claude/publier.md`, une couleur pour un seul sens dans tout le mail (maintenant, mieux, moins bien, avant ou retiré, reste à faire). Une teinte de l'écran réel se traduit dans ce code. Une légende en pastilles précède toute image qui mélange plusieurs couleurs.

**Outlook** (collé dans Outlook web, lu dans Outlook Windows)

- Couleur, bordure et arrondi se posent sur un `<td>` : `bgcolor` et `background-color`, `border`, `border-radius`. Ni `<span>`, ni `<div>`, ni `inline-block`.
- Une barre : des cellules de largeur fixe dans une table de largeur fixe ; une barre verticale : `height`, `line-height`, `font-size:1px`, dans cet ordre. Une marque (rond, croix, icône) vit dans sa propre table de largeur fixe.
- Le sens ne dépend ni des tailles ni des arrondis. Tables de 870 px, styles en ligne, accents en entités, fichier 100 % ASCII.
- Les briques et les mails d'exemple que nomme `.claude/publier.md` inspirent la forme ; ils ne se recopient pas.

**Preuves avant livraison**

- Chaque « avant » lu sur `origin/main` (`git show origin/main:<fichier>`), chaque « après » à `HEAD`, le jour même.
- `grep -c '<span\|<div'` rend 0 ; `LC_ALL=C grep -c '[^ -~]'` rend 0.
- Le mail s'ouvre dans Chrome et se regarde.

## Rapport

```text
Publié     : <branche> · <sha> · <avance sur l'amont> | PR <url> | état local seulement
Suite      : <commande> → EXIT=0, n passed
Inventaire : <n> nouveautés · <h> histoires · <m> ménage · tableau ci-dessous
Mail       : <chemin du fichier> · span/div 0 · non-ASCII 0 · ouvert dans Chrome
```
