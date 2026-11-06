---
name: livrer
description: Seul chemin d'écriture du code produit. À utiliser dès qu'une demande change un comportement de l'application — « ajoute », « corrige », « le champ devrait », « l'écran doit », « bug: », « refactor: », un constat d'audit, une reprise. Cadre la demande par un brainstorm puis un contrat validé, la découpe en task list JSON d'un comportement par ligne, grave chaque ligne par un test rouge que la contre-preuve confirme, fait attaquer les steps à risque par le breaker en arrière-plan, audite, puis dépêche le breaker final. Jamais pour une simple lecture, une explication, un document, un mail ou de l'outillage.
argument-hint: "<référence produit | bug: symptôme | refactor: zone>"
---

# livrer

Tu fais le travail toi-même : contrat, tests, code, preuves. Le seul agent que tu dépêches est `atelier:breaker`, en lecture seule : sur le contrat d'une feature, en arrière-plan sur chaque step à risque, puis une passe finale sur le delta. `~/.claude/CLAUDE.md` et le `CLAUDE.md` du dépôt s'appliquent. **Lis `.claude/livrer.md` du dépôt avant de cadrer** : commandes ciblées, suite complète, recensements, dossier de la task list ; il l'emporte sur cette skill. L'humain qui décide est celui que nomme le contexte de session.

> Le produit décide. Le test grave. La contre-preuve le confirme. Le breaker contredit.

## État au lancement

!`git rev-parse --short HEAD 2>/dev/null; git status --short 2>/dev/null | head -30; true`

## Le flux

`feature` boucle `ROUGE → VERT → PREUVE` après un contrat validé ; `bug: symptôme` boucle `ROUGE → VERT → PREUVE` ; `refactor: zone` boucle `FIGÉ → CHANGÉ → PREUVE`. Une demande qui ne change aucun comportement produit s'arrête : dis-le, ne lance rien. Une question (« pourquoi… ») se répond par la lecture, et le défaut qu'elle révèle devient l'argument d'un livrer.

`ETAT` désigne `node ${CLAUDE_PLUGIN_ROOT}/skills/livrer/scripts/etat-du-lot.mjs`, joué depuis la racine du dépôt :

| Commande | Effet |
|---|---|
| `ETAT <task list>` | juge le lot : `LIVRABLE` ou la liste des manques |
| `ETAT <task list> --gel Sn` | fige le test (`sha_test`) et photographie la production d'avant la step (`avant`), juste avant d'écrire le code |
| `ETAT <task list> --contre-preuve Sn` | rejoue `cmd` sur la production d'avant la step, restaure, écrit `contre_preuve` dans la step |
| `ETAT <task list> --empreinte [Sn]` | empreinte du lot, ou de la step |

Chaque phase se lit, en entier, au moment d'y entrer :

1. **CADRER** — `${CLAUDE_PLUGIN_ROOT}/skills/livrer/references/cadrage.md`. Une feature n'a ni test ni code avant `contrat.valide` et `contrat.critique.status = CLEAR`.
2. **CARTE, DÉCOUPE, BOUCLE** — `${CLAUDE_PLUGIN_ROOT}/skills/livrer/references/boucle.md`. Une task list par session ; une step à la fois, rouge métier vu, test figé, contre-preuve, breaker de step en fond si la step porte un risque.
3. **PASSE FINALE, AUDIT, BREAKER** — `${CLAUDE_PLUGIN_ROOT}/skills/livrer/references/passe-finale.md`. Audit mesuré dans `final.audit`, une passe de breaker sur le delta, plafonnée.
4. **LIVRÉ** — `ETAT` rend `LIVRABLE`, puis le rapport. La garde de fin de tour rejoue ce juge sur la task list citée, refuse un `LIVRÉ` qu'il ne porte pas, et supprime la task list d'un `LIVRÉ` accepté.

Après une compaction ou une reprise, le contexte de session liste les task lists ouvertes du dépôt avec leur phase et leur prochaine step : relis la référence de cette phase avant d'agir.

## Gestes du shell

Les gardes refusent les autres formes ; prends celles-ci d'emblée.

- Un verdict se lit sur son propre code : `<cmd> > "$LOG" 2>&1; echo "EXIT=$?"`, ou `set -o pipefail; <cmd> | tail -20; echo "EXIT=$?"`.
- Pendant la boucle, seules les commandes ciblées de `.claude/livrer.md` ; la suite complète ne part que dans la commande du commit, devant lui.
- Un script de mesure ou de transformation s'écrit par Write dans le scratchpad, puis se joue ; jamais un heredoc qui nourrit un interpréteur, jamais `sed -i`.
- Push et PR : `PUSH_DEMANDE=1`, seulement quand le dernier message de l'humain le demande.

## Périmètre

- Aucun outillage commité dans un lot produit ; un script de mesure vit dans le scratchpad et ne prouve rien.
- Aucune lecture hors carte. Un fichier hors carte s'ajoute à `carte.prod` avec sa raison, puis se prend.
- Un défaut constaté en route devient une step. Un `must` venu d'un audit, d'un agent ou d'une autre session est une hypothèse confrontée au code avant la première step.
- Une option proposée à l'humain traite la cause entière, dans le vocabulaire de l'écran, et repose sur l'écrivain et le lecteur de la donnée, mesurés.

## Rapport

```text
Écran      : <titre de l'écran> (<menu>) — ce qui change pour l'utilisateur
Lot        : <feature|bug|refactor> · <contrat en une ligne>
Verdict    : LIVRÉ | BLOCK
Demande    : <chaque phrase de la demande> → <sa preuve>
Steps      : S1..Sn — <must> → <preuve recopiée de la task list, commande comprise : ROUGE <assertion> · CONTRE-PREUVE EXIT=<n> (<cause>) · VERT <cmd> → EXIT=0>
Risques    : <step · risque · propriétés · breaker de step CLEAR <empreinte>> | aucun
Audit      : <shortstat> · <duplications> · <jumelles>
Impact     : <appelants prévus / réels>
Breaker    : CLEAR <empreinte> | <contre-exemple et sa réponse>
Commit     : <sha · avance sur l'amont> | aucun
JSON       : <chemin du tasklist>
```

`LIVRÉ` se confronte à la demande phrase par phrase. Toute édition après le breaker change l'empreinte et le relance sur le delta. Le commit est libre ; s'il part, la suite complète de `.claude/livrer.md` le précède. Push et PR : l'humain, puis la skill `publier` pour l'inventaire, la PR et le mail de mise en production.

## BLOCK

Uniquement si une règle produit manque ou se contredit après lecture entière du juge, si un système indispensable est inaccessible, ou si un contre-exemple révèle une décision non tranchée : la question part par `AskUserQuestion`. Un problème mécanique (base éteinte, `dist` périmé, migration non appliquée) n'est pas un `BLOCK` : c'est un poste à remettre d'aplomb.
