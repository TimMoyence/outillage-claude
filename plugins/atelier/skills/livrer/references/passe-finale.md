# Passe finale, audit, breaker

Quand toutes les steps sont vertes, contre-preuves et breakers de step compris, et pas avant. `ETAT` est la commande que nomme `SKILL.md`. Cette passe tient l'audit du lot : sous livrer, la garde de fin de tour ne le rappelle pas.

## 1. Tests ciblés et complétude

- Les tests du lot, ceux liés aux fichiers de production, ceux qui mockent un module dont un export a changé, l'e2e des routes dont un adaptateur a bougé, et les **recensements** de `.claude/livrer.md`. Lance-les en parallèle des lectures de l'audit, pas l'un après l'autre.
- `git status --short` confronté à `carte.prod` et `carte.tests` : chaque fichier modifié y figure, chaque fichier listé est touché ou sa ligne dit pourquoi.
- Un `impact` sur chaque symbole exporté modifié, comparé à `carte.direct`.
- Un rouge qui accuse un fichier non touché accuse d'abord le poste (`dist`, base, contrat d'une voisine : `git log -1 -- <fichier>`), puis il se corrige.

## 2. Audit mesuré → `final.audit`

Trois champs, chacun une mesure et non une impression :

- **`shortstat`** : `git diff --shortstat <base.sha>` (fichiers non suivis compris). En `refactor` et sur un constat, les suppressions dépassent les ajouts ; sinon chaque ligne ajoutée au-delà se justifie dans le champ.
- **`duplications`** : une mesure par forme, jamais par texte. `pnpm doublons`, `jscpd` et leurs pareils ne voient que des textes identiques : `a.dividedBy(b).times(CENT)` et `partEnPourCent(a, b)` leur échappent. La commande AST du dépôt (`pnpm dup:ast --diff`) ; sans elle, un script du scratchpad qui parse chaque fichier touché et ses voisins, remplace les identifiants par `_`, garde les constantes métier (`CENT`, `UN`) et les opérateurs, puis regroupe les fonctions et expressions par forme. Le champ porte la commande et son verdict. Une duplication trouvée devient une step d'extraction.
- **`jumelles`** : pour chaque fonction, composant ou calcul exporté que le lot fait naître (`git diff <base.sha> -U0 | grep -E '^\+export'`), la recherche de son double par nom, par libellé et par forme (`git grep`, GitNexus `query`) ; pour chaque calcul, la vérification qu'il vit côté serveur et que l'écran l'affiche sans le refaire ; et pour chaque formule partagée, la garde qui l'entoure chez chaque appelant (`> 0`, `≠ 0`, aucune). Deux gardes donnent deux réponses sur les mêmes données (0, « non établi », un négatif) : une seule fonction ne suffit pas, il faut une seule garde. Une jumelle trouvée, formule ou garde, devient une step qui branche l'appelant sur la fonction qui tient la règle et sa garde, et supprime l'autre.
- **Spec par fonction neuve** : le test du lecteur fige ce que voit l'utilisateur, mais ne prouve une fonction que sur les cas que ses lecteurs exercent. Chaque fonction ou méthode publique que le lot fait naître a sa petite spec, qui l'appelle et ferme ses cas limites (zéro, vide, borne, négatif). Le juge refuse le `LIVRABLE` à une fonction exportée neuve qu'aucun test du lot n'appelle ; une méthode neuve d'une classe existante se vérifie à la main.

## 3. Breaker final → `final.breaker`

1. `ETAT --empreinte` donne l'empreinte de l'état que le breaker va juger.
2. `Agent(subagent_type: "atelier:breaker")` en mode lot, avec le contrat, la liste des fichiers (`carte` confrontée à `git status`, jamais de mémoire), les preuves, les `CLEAR` des steps à risque et le diff écrit dans le scratchpad. Une relance ne porte que sur le delta depuis la passe précédente.
3. `COUNTEREXAMPLE` : `final.passes` augmente de un ; chaque contre-exemple devient une step et suit la boucle ; la passe finale se rejoue sur les fichiers touchés, puis le breaker sur le delta. Un `gap` sous `CLEAR` devient une step ou une question.
4. **Plafond** : à la troisième passe en `COUNTEREXAMPLE`, il n'y a pas de quatrième passe aveugle. La classe des contre-exemples restants part à l'humain par `AskUserQuestion` (contrat trop large, règle produit non tranchée, ou découpe à revoir), et sa réponse décide de la suite.
5. `CLEAR` : `final.breaker = { "status": "CLEAR", "empreinte": "<celle du point 1>" }`.

## 4. Livrable

`ETAT` rend `LIVRABLE` (exit 0) ; sinon il nomme chaque manque, qui se traite avant le rapport. Toute édition de production ou de test change l'empreinte : le breaker se relance sur le delta avant le `LIVRÉ`. Le `LIVRÉ` accepté supprime la task list.
