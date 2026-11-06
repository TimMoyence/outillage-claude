import assert from "node:assert/strict";
import { test } from "node:test";

import { depot, ranger, statutGit } from "./depot-de-test.mjs";

test("RNG-03 · un motif d'import sans extension désigne les modules qu'il nomme : le plan qui l'en fait sortir est refusé", () => {
  const racine = depot({
    "src/x/contracts/langchain-contracts.ts": "export type C = 1;\n",
    "eslint.config.js": "export default [{ rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/x/contracts/langchain-contracts'] }] }] } }];\n",
  });

  const sortie = ranger(racine, { deplacements: { "src/x/contracts/langchain-contracts.ts": "src/x/r/contracts/langchain-contracts.ts" } });

  assert.deepEqual(
    { code: sortie.code, cause: sortie.texte.includes("eslint.config.js:1 le glob **/x/contracts/langchain-contracts change (sortants : src/x/contracts/langchain-contracts.ts"), statut: statutGit(racine) },
    { code: 1, cause: true, statut: "" },
    sortie.texte,
  );
});
