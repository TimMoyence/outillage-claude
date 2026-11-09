---
name: memoire
description: Convention et contrôle des carnets de mémoire de Claude Code (`~/.claude/projects/*/memory/`). À utiliser avant d'écrire, de modifier ou de supprimer une fiche ou un `MEMORY.md`, puis pour vérifier le carnet. Jamais pour le code d'un dépôt.
---

# memoire

Une seule convention pour tous les projets. `MEMORY.md` de chaque projet est un routeur : il dit dans quelle fiche regarder, il ne contient aucun savoir.

## Ce qui entre, ce qui sort

- **Entre** : une décision ou une préférence de l'humain qui décide, ou un piège dont la redécouverte coûte nettement plus cher que la vérification, et que ni le code, ni un test, ni un lint, ni un hook, ni `~/.claude/CLAUDE.md`, ni le `CLAUDE.md` du dépôt, ni une skill ne tient.
- **Sort** : dès qu'un de ces mécanismes la tient, ou qu'elle contredit `~/.claude/CLAUDE.md` (qui prime). La fiche se supprime, elle ne se garde pas « encodée ».
- **Sort aussi** : l'état d'un chantier (task list, plan en cours, « pas encore poussé »), un récit d'incident, une URL non revérifiée. Ce qui est fini se lit dans git.

## Forme

- Frontmatter `name` (= nom du fichier), `description` (une ligne, sert au rappel), `type` : `user | feedback | project | reference`.
- Dix lignes non vides au plus : fait → mécanisme → preuve.
- Une preuve cite un fichier qui existe, ou un symbole retrouvable par `git grep`, jamais un numéro de ligne : il dérive au premier rangement.
- Aucun compte qui se périme : on garde la commande qui le produit. Une date ne sert qu'à dater une décision de l'humain.

## Contrôle

`node <cette skill>/scripts/verifier.mjs [fragment du nom de projet]`, après toute écriture dans un carnet.

Il refuse, dans chaque carnet : une fiche non routée, un lien mort, un champ absent, un `type` hors taxonomie, un `name` qui ne vaut pas le fichier, une fiche de plus de dix lignes, un routeur de plus de soixante, un chemin cité qui n'existe ni dans le dépôt, ni chez ses voisins, ni dans le carnet, et un numéro de ligne.
