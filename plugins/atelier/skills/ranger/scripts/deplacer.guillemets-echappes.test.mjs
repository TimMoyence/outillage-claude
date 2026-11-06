import assert from "node:assert/strict";
import { test } from "node:test";

import { depot, ranger, statutGit } from "./depot-de-test.mjs";

test("RNG-03 · un glob écrit entre guillemets échappés dans un script de package.json est jugé comme les autres", () => {
  const racine = depot({
    "src/f/a.instantane.json": "{}\n",
    "package.json": '{ "scripts": { "contrat": "generer && prettier --write \\"src/f/*.instantane.json\\"" } }\n',
  });

  const sortie = ranger(racine, { deplacements: { "src/f/a.instantane.json": "src/f/json/a.instantane.json" } });

  assert.deepEqual(
    { code: sortie.code, cause: sortie.texte.includes("package.json:1 le glob src/f/*.instantane.json change (sortants : src/f/a.instantane.json"), statut: statutGit(racine) },
    { code: 1, cause: true, statut: "" },
    sortie.texte,
  );
});
