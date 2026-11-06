import assert from "node:assert/strict";
import { test } from "node:test";

import { contenus, depot, ranger } from "./depot-de-test.mjs";

test("RNG-01 · createRequire(import.meta.url) est une forme reconnue, et son appel relatif suit sa cible", () => {
  const racine = depot({
    "scripts/garde.test.mjs": "const absolu = createRequire(import.meta.url)(CHEMIN_ABSOLU);\nconst relatif = createRequire(import.meta.url)('../config/regles.cjs');\n",
    "config/regles.cjs": "module.exports = {};\n",
  });

  const sortie = ranger(racine, { deplacements: { "scripts/garde.test.mjs": "scripts/gardes/garde.test.mjs" } });

  assert.deepEqual(
    { code: sortie.code, ...contenus(racine, ["scripts/gardes/garde.test.mjs"]) },
    {
      code: 0,
      "scripts/gardes/garde.test.mjs": "const absolu = createRequire(import.meta.url)(CHEMIN_ABSOLU);\nconst relatif = createRequire(import.meta.url)('../../config/regles.cjs');\n",
    },
    sortie.texte,
  );
});
