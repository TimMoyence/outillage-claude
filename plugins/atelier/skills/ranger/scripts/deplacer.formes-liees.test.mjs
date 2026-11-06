import assert from "node:assert/strict";
import { test } from "node:test";

import { depot, ranger, statutGit } from "./depot-de-test.mjs";

test("RNG-03 · createRequire(import.meta.url) rangé sous un autre nom que require est refusé, et rien ne bouge", () => {
  const racine = depot({
    "scripts/garde.test.mjs": 'const charger = createRequire(import.meta.url);\nconst regles = charger("../config/regles.cjs");\n',
    "config/regles.cjs": "module.exports = {};\n",
  });

  const sortie = ranger(racine, { deplacements: { "scripts/garde.test.mjs": "scripts/gardes/garde.test.mjs" } });

  assert.deepEqual(
    { code: sortie.code, cause: sortie.texte.includes("scripts/garde.test.mjs:1 construit un chemin depuis import.meta.url hors d'une forme reconnue"), statut: statutGit(racine) },
    { code: 1, cause: true, statut: "" },
    sortie.texte,
  );
});

test("RNG-03 · un glob relatif sans nom ('./*') désigne le dossier du lecteur : le vider est refusé", () => {
  const racine = depot({
    "scripts/a.mjs": "export const a = 1;\n",
    "scripts/liste.mjs": "export const tous = glob('./*');\n",
  });

  const sortie = ranger(racine, { deplacements: { "scripts/a.mjs": "scripts/sujet/a.mjs" } });

  assert.deepEqual(
    { code: sortie.code, cause: sortie.texte.includes("scripts/liste.mjs:1 le glob ./* change (sortants : scripts/a.mjs"), statut: statutGit(racine) },
    { code: 1, cause: true, statut: "" },
    sortie.texte,
  );
});
