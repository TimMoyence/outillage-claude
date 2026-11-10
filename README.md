# outillage-claude

Marketplace Claude Code qui porte un plugin, **atelier** : une méthode de livraison où l'agent prouve chaque comportement par un test qu'il a vu rouge, où un second agent en lecture seule cherche à le contredire, et où des hooks refusent les gestes qui ont déjà coûté cher.

> Le produit décide. Le test grave. La contre-preuve le confirme. Le breaker contredit.

## Installation

```text
/plugin marketplace add TimMoyence/outillage-claude
/plugin install atelier@outillage
```

À la première conversation, le plugin crée `~/.claude/plugins/data/atelier-outillage/atelier.json`, hors de tout dépôt :

```json
{ "humain": "Tim", "profils": {} }
```

- `humain` : la personne qui décide du produit et valide push, PR et merge. Il se déduit de `git config user.name` (premier mot) ; corrige-le à la main au besoin.
- `profils` : les réglages propres à un dépôt, rangés sous le nom du dépôt (commandes ciblées, typecheck, scripts de suite complète, arbre partagé entre sessions, Docker, migrations). Un dépôt absent prend le profil générique. Ce fichier reste sur ta machine.

## Ce que contient atelier

| Élément | Rôle |
|---|---|
| skill `livrer` | Seul chemin d'écriture du code produit. Brainstorm puis contrat validé pour une feature ; task list JSON d'un comportement par ligne ; test rouge, test figé avec la production d'avant la step, contre-preuve qui rejoue le test sur cet état d'avant ; breaker en arrière-plan sur chaque step `MONEY`, `SECURITY` ou `TENANT`, test de propriétés pour `MONEY` ; spec exigée pour chaque fonction exportée neuve ; audit mesuré (doublons par forme d'AST, formules et gardes jumelles) ; breaker final plafonné à trois passes. |
| skill `cartographier` | Carte JSON de tous les parcours e2e, rôle × écran × geste, permis ou refusé, cas de casse compris ; breakers en mode parcours pour les cas oubliés ; `couverture.mjs` juge la couverture ; chaque trou devient un lot `livrer`. |
| skill `publier` | Revalide le diff, commite par lots, pousse et ouvre la PR sur demande, dresse l'inventaire à 100 % de ce qui part, écrit le mail de mise en production lisible dans Outlook. La charte du mail vient du `.claude/publier.md` du dépôt. |
| skill `ranger` | Déplace des fichiers d'un dépôt TypeScript ou Angular en réécrivant chaque chemin qui les désigne. |
| skill `memoire` | Convention des carnets de mémoire de Claude Code, et vérificateur qui refuse une fiche non routée, un lien mort, un chemin cité absent ou un numéro de ligne. |
| agent `breaker` | Cherche le plus petit contre-exemple, en mode contrat, step, lot ou parcours. Lecture seule, garantie par un hook. |
| `etat-du-lot.mjs` | Juge d'une task list : `LIVRABLE` ou la liste des manques. Il rejoue aussi la contre-preuve. |
| `couverture.mjs` | Juge d'une carte de parcours : `COUVERT` ou chaque rôle, geste et cas sans test e2e réel. |
| hook `reprise` (SessionStart) | Crée les réglages, nomme l'humain qui décide, réinjecte les task lists ouvertes du dépôt avec leur phase et leur prochaine step, après une compaction ou un crash. |
| hook `garde-du-shell` (PreToolUse) | Refuse, en nommant la forme qui passe : verdict lu derrière un pipe sans `pipefail`, suite complète hors commit, heredoc qui nourrit un interpréteur, `sed -i`, `git add -A` sur un arbre partagé, push ou merge sans demande de l'humain, et d'autres. |
| hook `garde-de-la-reponse` (Stop) | Refuse une fin de tour qui pose une question en prose, fait une offre, range un rouge chez autrui ou affirme sans mesurer ; refuse un `LIVRÉ` que le juge ne porte pas ; supprime la task list d'un `LIVRÉ` accepté. |
| skills `gitnexus-*` | Guides d'usage de GitNexus pour explorer, mesurer l'impact et refactoriser. Licence PolyForm Noncommercial, voir `NOTICE`. |

Ces règles sont opinionnées : elles viennent d'un usage quotidien sur des dépôts TypeScript en pnpm, avec plusieurs sessions sur le même arbre. Lis les hooks avant de les adopter.

## Développer

```text
npm run test:unitaire   # tests node --test des hooks et des scripts, puis claude plugin validate --strict
npm run test:evals      # claude plugin eval, avec et sans le plugin
npm test                # les deux
```

## Licence

MIT, sauf les six skills `gitnexus-*`, qui dérivent de GitNexus et restent sous sa licence PolyForm Noncommercial 1.0.0 : voir `NOTICE`.
