import assert from "node:assert/strict";
import { test } from "node:test";

import { contenus, depot, ranger, statutGit } from "./depot-de-test.mjs";

const SUIVIS = { "src/a.ts": "export const a = 1;\n", "src/b.ts": "import { a } from './a';\nexport const b = a;\n" };
const NON_SUIVI = { "src/neuf.ts": "export const n = 1;\n" };
const PLAN = { deplacements: { "src/a.ts": "src/x/a.ts", "src/neuf.ts": "src/x/neuf.ts" } };

test("RNG-04 · --a-blanc décrit chaque déplacement et chaque réécriture sans rien écrire", () => {
  const racine = depot(SUIVIS, NON_SUIVI);
  const sortie = ranger(racine, PLAN, "--a-blanc");
  assert.deepEqual(
    {
      code: sortie.code,
      decrit: ["src/a.ts → src/x/a.ts", "src/neuf.ts → src/x/neuf.ts", "réécrit src/b.ts"].map((ligne) => sortie.texte.includes(ligne)),
      statut: statutGit(racine),
      fichiers: contenus(racine, ["src/b.ts", "src/x/a.ts"]),
    },
    { code: 0, decrit: [true, true, true], statut: "?? src/neuf.ts\n", fichiers: { "src/b.ts": SUIVIS["src/b.ts"], "src/x/a.ts": null } },
    sortie.texte,
  );
});

test("RNG-04 · un fichier suivi bouge par git mv et garde son historique, un fichier non suivi bouge aussi", () => {
  const racine = depot(SUIVIS, NON_SUIVI);
  const sortie = ranger(racine, PLAN);
  assert.deepEqual(
    { code: sortie.code, statut: statutGit(racine), fichiers: contenus(racine, ["src/x/neuf.ts", "src/neuf.ts"]) },
    { code: 0, statut: " M src/b.ts\nR  src/a.ts -> src/x/a.ts\n?? src/x/neuf.ts\n", fichiers: { "src/x/neuf.ts": NON_SUIVI["src/neuf.ts"], "src/neuf.ts": null } },
    sortie.texte,
  );
});
