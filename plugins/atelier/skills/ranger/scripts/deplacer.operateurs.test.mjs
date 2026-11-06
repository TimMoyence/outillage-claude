import assert from "node:assert/strict";
import { test } from "node:test";

import { depot, ranger } from "./depot-de-test.mjs";

test("RNG-03 · une chaîne sans aucun nom de chemin ('*', '**', '/*', '/**') n'est pas un glob, un vrai glob reste jugé", () => {
  const fichiers = {
    "outil.config.cjs": "module.exports = {};\n",
    "src/formule.ts": "export const operateurs = ['*', '**', '/*', '/**'];\n",
    "eslint.config.js": "export default [{ files: ['*.cjs'] }];\n",
  };
  const plan = { deplacements: { "outil.config.cjs": "config/outil.config.cjs" } };

  const sansVraiGlob = ranger(depot({ ...fichiers, "eslint.config.js": "export default [];\n" }), plan);
  const avecVraiGlob = ranger(depot(fichiers), plan);

  assert.deepEqual(
    [sansVraiGlob.code, avecVraiGlob.code, avecVraiGlob.texte.includes("eslint.config.js:1 le glob *.cjs change"), avecVraiGlob.texte.includes("src/formule.ts")],
    [0, 1, true, false],
    `${sansVraiGlob.texte}${avecVraiGlob.texte}`,
  );
});
