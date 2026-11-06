# Carte, découpe, boucle

## Carte — borner

1. Index GitNexus frais : `status`, sinon `analyze --index-only` en arrière-plan, sans le demander.
2. **Racines** : un `context` pour situer, un `impact` par racine à modifier, lu à `direct`.
3. **L'existant** : avant d'écrire un composant, un calcul, un port ou un faux, cherche celui qui existe (`query`, `git grep -n -w` du concept, du libellé, de l'`aria-label`, la commande de doublons du dépôt). Trouvé, il se réutilise ; recopié une fois, il s'extrait.
4. **Écrivains et consommateurs** de chaque donnée ou composant touché : chacun entre au lot.
5. **Retrait ou renommage** : `git grep -n -w <nom>`, puis chaque ancienne valeur littérale ; jamais tronqué par `head`.
6. `risk: UNKNOWN` ou zéro appelant se croise au `grep` avant de conclure.
7. **État de départ** : `git status --short`, les rouges présents dans `base.rouges_connus`, chacun devenant une step, sauf celui d'un fichier qu'une voisine active tient.

## Découpe — la task list JSON

**Une task list par session.** Elle vit dans le dossier que fixe `.claude/livrer.md`, sinon dans `<dossier parent du dépôt>/<nom du dépôt>-<slug>.tasklist.json`, hors du dépôt. Ce qui n'y est pas n'existe pas. Une reprise reprend la task list ouverte que nomme le contexte de session au lieu d'en créer une autre. Une ligne = **un comportement observable** = un cycle complet ; trois à huit steps pour une petite feature, au-delà d'une quinzaine on scinde.

```json
{
  "lot": "slug", "depot": "<nom du dépôt>", "mode": "feature|bug|refactor",
  "contrat": { "references": [], "must": [], "must_not": [], "risques": [], "brainstorm": [], "valide": null, "critique": null },
  "carte": { "racines": [], "direct": [], "prod": [], "tests": [] },
  "base": { "sha": "", "rouges_connus": [] },
  "steps": [{
    "id": "S1", "must": "", "ref": "", "risques": [],
    "test": "<chemin du test> :: <titre>",
    "proprietes": null,
    "prod": ["<chemin>"],
    "cmd": "<commande ciblée de .claude/livrer.md>",
    "etat": "todo|rouge|vert|bloque", "sha_test": null, "avant": null, "preuve": null,
    "contre_preuve": null, "breaker": null
  }],
  "final": { "commandes": [], "audit": null, "breaker": null, "passes": 0 }
}
```

- Chaque step peut devenir verte seule ; sinon la découpe est fausse. Une step qui ne traverse qu'une couche technique n'est pas un comportement.
- Deux steps ne figent jamais le même fichier de test : `sha_test` est celui du fichier entier. Un cas ajouté après un contre-exemple va dans un fichier de test à lui.
- Un retrait de colonne ou de table vit dans la step qui répare tous ses lecteurs.
- `risques` de la step reprend ceux du contrat qu'elle touche (`MONEY`, `SECURITY`, `TENANT`, `AUDIT`, `PERSISTENCE`, `EXTERNAL`). Le juge exige, pour `MONEY`, un test de propriétés dans `proprietes`, et pour `MONEY`, `SECURITY` ou `TENANT`, un breaker CLEAR sur l'empreinte de la step.

## Boucle — une step à la fois

`S(n+1)` ne commence pas avant que `S(n)` porte sa preuve. Le breaker d'une step à risque tourne en arrière-plan pendant que la step suivante avance.

1. **Écris le test.** Il parle produit : il monte l'écran, appelle le cas d'usage, joue la route. Ni forme de fichier, ni compteur, ni convention. Son nom porte `ref`. Un refus se grave par sa phrase entière, après le cas limite accepté ; une assertion de texte se borne à sa région ; une absence assertée s'accompagne d'une présence.
2. **Joue `cmd`** et exige le bon rouge : une assertion métier. Import, compilation, fixture ou timeout ne sont pas un rouge (un module neuf passe par un squelette exporté qui rend une valeur neutre). Les attendus viennent de la fixture ou du juge, jamais d'un calcul de tête. Un vert d'emblée en `feature` ou `bug` signale une découpe fausse ; quand le code précède le test, défais la ligne, constate le rouge, remets-la. En `refactor`, le test fige l'existant et il est vert.
3. **Gèle la step** : formatte, linte le test, liste dans `prod` chaque fichier que la step va créer ou modifier (un module neuf existe déjà sous la forme de son squelette exporté : hors `refactor`, le gel refuse un fichier absent), puis `ETAT <task list> --gel Sn`, qui écrit `sha_test` et photographie dans `avant` la production telle qu'elle est avant la step. Un fichier ajouté à `prod` plus tard demande de regeler.
4. **Le plus petit code de production** qui rend le test vert, puis linte la step. Ni le test de la step, ni le seuil ou l'inventaire d'un test voisin ne bougent.
5. **Rejoue `cmd`** : le juge refuse un test qui a bougé depuis son gel, ce qui ramène en 1.
6. **Contre-preuve** : `ETAT <task list> --contre-preuve Sn` remet les fichiers `prod` de la step à leur état d'`avant`, rejoue `cmd`, restaure, et écrit `contre_preuve` avec la cause lue dans le journal. Elle ne dépend pas de git. Hors `refactor`, un rouge de chargement (`SyntaxError`, `ReferenceError`, export manquant, appel d'une liaison d'import absente, module introuvable, `error TS`) est refusé : le squelette ne tient pas, retour en 3. Une `TypeError` d'exécution n'est pas un chargement : elle passe comme cause inconnue. Un rouge d'assertion passe. Un rouge de cause inconnue passe aussi, mais il est écrit `cause: "inconnue"` : vérifie dans le journal qu'il vient bien de l'assertion de la règle, et le breaker le regarde. En `feature` et `bug`, le test doit rougir sans le code de la step ; s'il passe, il prouve autre chose que la règle : retour en 1. En `refactor`, il doit passer sur la base. La contre-preuve modifie l'arbre le temps d'un test ciblé : sur un arbre partagé, elle ne touche que des fichiers de la step.
7. **Step à risque** :
   - `MONEY` : un test de propriétés (fast-check) dans `proprietes` attaque bornes, zéro, négatif, arrondis et sommes qui se recoupent, vu rouge comme le test de la step ;
   - `MONEY`, `SECURITY`, `TENANT` : `ETAT --empreinte Sn`, puis `Agent(subagent_type: "atelier:breaker")`, qui tourne en arrière-plan, en mode step, avec la step, ses fichiers, son diff et cette empreinte. Son `CLEAR` s'écrit dans `step.breaker = { status, empreinte }` ; un contre-exemple devient une step.
8. **`etat: "vert"` et `preuve`**, écrits dans le tour qui a joué la commande : `ROUGE <assertion> · CONTRE-PREUVE EXIT=<n> · VERT <cmd> → EXIT=0, n passed · <journal>`.

Un code minimal qui contredit un `must` déjà vert révèle un contrat ambigu : retour au cadrage.
