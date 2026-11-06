import assert from "node:assert/strict";
import { test } from "node:test";

import { depot, ranger, statutGit } from "./depot-de-test.mjs";

test("RNG-03 · un dossier déclaré qui garde un fichier suivi est refusé, et rien ne bouge", () => {
  const racine = depot({
    "src/vieux/a.ts": "export const a = 1;\n",
    "src/vieux/b.ts": "export const b = 1;\n",
    "src/c.ts": 'import { b } from "./vieux/b";\n',
  });

  const sortie = ranger(racine, { deplacements: { "src/vieux/a.ts": "src/neuf/a.ts" }, dossiers: { "src/vieux": "src/neuf" } });

  assert.deepEqual(
    {
      code: sortie.code,
      cause: sortie.texte.includes("plan.dossiers src/vieux ne disparaît pas : src/vieux/b.ts y reste — ajoute-le à deplacements ou retire la déclaration"),
      statut: statutGit(racine),
    },
    { code: 1, cause: true, statut: "" },
    sortie.texte,
  );
});
