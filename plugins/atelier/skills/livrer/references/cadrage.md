# Cadrer — brainstorm, puis contrat, décidé une seule fois

## Lire avant de demander

Lis en entier, pour la zone touchée, le code, ses tests et les juges que nomme le `CLAUDE.md`. Une question ou un `BLOCK` émis sans avoir lu le juge est faux. Avant de « corriger » une incohérence, cherche le test qui la grave : un test qui exige l'état actuel EST l'arbitrage, sauf un no-op silencieux ou un test dont la fonction n'a aucun appelant de production.

## Le contrat

Chaque `must` est **observable, décidable, testable**, écrit dans le vocabulaire de l'écran, et porte sa référence, que le nom du test conserve : `it("DEC-018 · vider un champ renseigné vaut zéro", ...)`.

- Ce qui se déduit ne se saisit pas : cherche la source qui le déduit. Un état que le produit ne doit pas permettre se **verrouille** (schéma, contrainte), il ne se migre pas ; une migration n'invente aucune valeur.
- `risques` (`MONEY`, `TENANT`, `AUDIT`, `SECURITY`, `PERSISTENCE`, `EXTERNAL`) : chacun est prouvé ou réfuté par `fichier:ligne` ; celui que rien ne réfute devient une step qui le porte dans ses `risques`. Une route, une ressource ou un fichier lu porte au moins `SECURITY`.

## Feature : barrière dure

Aucun test ni code tant que `contrat.valide` et `contrat.critique` ne sont pas écrits dans la task list.

1. **Brainstorm, une question à la fois.** Avant chaque question, cherche ce qui la tranche peut-être déjà : le code et ses tests, le juge du dépôt, et sur le web l'usage du métier ou de l'écran quand il compte. Ce qui se tranche par la lecture ne se demande pas. Puis un `AskUserQuestion` d'**une seule** question produit, deux ou trois variantes, recommandation en tête ; une question d'écran porte, sur chaque option, un `preview` ASCII de l'écran : champs, ce qui est saisi, ce qui est déduit et d'où, le geste. La réponse suivante se nourrit de la précédente. Le brainstorm s'arrête quand plus rien d'ouvert ne change un nombre, un refus ou un geste ; chaque réponse, citée et datée, va dans `contrat.brainstorm`.
2. **Le contrat présenté** : `must`, `must_not`, risques, en une page d'écran, puis un `AskUserQuestion` « Valider ce contrat » (valider / corriger). La réponse de l'humain, citée et datée, va dans `contrat.valide`.
3. **La critique** : `Agent(subagent_type: "atelier:breaker")` en mode contrat, avec le contrat validé, l'écran et les données touchées. Chaque contre-exemple devient un `must`, ou une question à l'humain s'il demande un arbitrage ; la critique se rejoue jusqu'à `CLEAR`, écrit dans `contrat.critique`.

Avant la critique, vérifie toi-même les invariants qu'elle attaque :

- toute saisie change un nombre, un refus ou un geste visible (une pause qui ne change aucune heure est un défaut de contrat) ;
- rien de déductible ne se saisit ;
- un réglage n'existe qu'à un endroit ;
- un même fait se nomme d'un seul mot dans tout le produit ;
- aucune dimension d'écran n'est figée en `px` ;
- chaque refus nomme sa cause et le geste qui le lève ; sans geste possible, pas de blocage.

## Bug et refactor

Pas de barrière de validation : le contrat est le comportement attendu (bug, reproduit à la valeur que l'humain a vue, et cherché comme classe dans toute l'application) ou le comportement visible figé (refactor). Ce qui reste ouvert après lecture part par `AskUserQuestion`, une question à la fois, avant de découper.
