#!/usr/bin/env bash
set -euo pipefail

mkdir -p src test .claude
cat > package.json <<'JSON'
{ "name": "dossier", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > CLAUDE.md <<'MD'
# Dossier

Le serveur calcule, l'écran affiche. Les heures vendables d'une journée se lisent dans `src/heures.mjs`, la fiche entreprise dans `src/entreprise.mjs`.

L'écran « Journée type » envoie au serveur `{ ouverture, fermeture, plages }` : l'ouverture de la première plage, la fermeture de la dernière, et les plages d'ouverture dans l'ordre, par exemple `plages: [{ ouverture: "9h", fermeture: "12h" }, { ouverture: "14h", fermeture: "19h" }]`. Une journée sans pause n'a qu'une plage ; un appel sans `plages` vaut une seule plage. Le serveur rend le nombre d'heures vendables, que l'écran affiche tel quel.
MD
cat > .claude/livrer.md <<'MD'
# livrer — ce que ce dépôt ajoute

- Task list : dans `./.lots/` à la racine du dépôt.
- Commande ciblée : `node --test <fichier de test>`. Suite complète : `npm test`.
- Doublons : `git grep -n -w <nom>`. Aucun recensement.
MD
cat > src/heures.mjs <<'JS'
const enHeures = (texte) => {
  const [h, m = "0"] = texte.split("h");
  return Number(h) + Number(m || 0) / 60;
};

export const heuresVendables = ({ ouverture, fermeture }) => enHeures(fermeture) - enHeures(ouverture);
JS
cat > test/heures.test.mjs <<'JS'
import assert from "node:assert/strict";
import { test } from "node:test";

import { heuresVendables } from "../src/heures.mjs";

test("une journée de 9h à 17h vend 8 heures", () => {
  assert.equal(heuresVendables({ ouverture: "9h", fermeture: "17h" }), 8);
});
JS
cat > src/entreprise.mjs <<'JS'
const FORMES = { 5499: "SARL", 5710: "SAS", 5720: "SASU", 1000: "Entrepreneur individuel" };

export const formeJuridiqueDepuisCategorie = (categorieJuridique) => FORMES[categorieJuridique] ?? "Autre";

export const ficheEntreprise = ({ siren, raisonSociale, categorieJuridique }) => ({
  siren,
  raisonSociale,
  formeJuridique: formeJuridiqueDepuisCategorie(categorieJuridique),
});
JS
cat > test/entreprise.test.mjs <<'JS'
import assert from "node:assert/strict";
import { test } from "node:test";

import { ficheEntreprise } from "../src/entreprise.mjs";

test("la forme juridique se déduit de la catégorie INSEE", () => {
  assert.equal(ficheEntreprise({ siren: "1", raisonSociale: "A", categorieJuridique: 5710 }).formeJuridique, "SAS");
});
JS
printf '.lots/\nnode_modules/\n' > .gitignore
git init -q
git add -A
git -c user.email=eval@local -c user.name=eval commit -q -m "dossier"
