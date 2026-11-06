---
name: ranger
description: Déplacer des fichiers d'un dépôt TypeScript ou Angular en réécrivant chaque chemin qui les désigne. À utiliser quand un dossier dépasse le plafond d'entrées que juge le dépôt, quand on découpe un dossier par sujet, ou pour tout « déplace », « range », « découpe ce dossier ». Jamais un git mv ou un mv à la main.
---

# ranger

Un dossier se découpe par sujet, jamais par type de fichier : `domain/seance/`, pas `domain/ports/`. Un fichier et son `.spec` restent côte à côte.

## Le plan

Un JSON hors du dépôt (le scratchpad) :

```json
{
  "deplacements": { "src/a/cible.ts": "src/a/sujet/cible.ts" },
  "dossiers": { "src/a/vieux": "src/a/neuf" },
  "reecritures": { "eslint.config.js": { "src/a/vieux/**": "src/a/neuf/**" } },
  "globs_acceptes": ["eslint.config.mjs → src/**/__tests__/**"]
}
```

- `deplacements` liste chaque fichier, avec son `.spec`, son `.html` et son `.scss`.
- `dossiers` déclare un dossier qui disparaît et que des chemins écrits depuis la racine désignent encore.
- `reecritures` remplace un texte que le script ne sait pas lire (chemin construit par morceaux, glob) ; un remplacement qui ne trouve rien est refusé.
- `globs_acceptes` accepte qu'un glob change de périmètre, par sa clé `fichier → glob` après réécriture.

## Le geste

1. `node <cette skill>/scripts/deplacer.mjs <plan.json> --a-blanc` depuis le dépôt : chaque déplacement et chaque fichier réécrit, rien n'est écrit.
2. Un refus nomme sa cause (`fichier:ligne`) et la forme qui passe : on corrige le plan, jamais le dépôt à la main.
3. Sans `--a-blanc` : réécriture, puis `git mv` (l'historique suit).
4. La suite complète du dépôt juge ce que le script ne voit pas statiquement : un chemin construit par segments ou par gabarit.
