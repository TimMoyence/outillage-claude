import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { depot, ranger, statutGit } from "./depot-de-test.mjs";

test("RNG-03 · une source suivie par git mais effacée du disque est refusée, et rien ne bouge", () => {
  const racine = depot({ "src/a.ts": "export const a = 1;\n", "src/b.ts": "export const b = 1;\n" });
  rmSync(join(racine, "src/a.ts"));

  const sortie = ranger(racine, { deplacements: { "src/a.ts": "src/x/a.ts", "src/b.ts": "src/x/b.ts" } });

  assert.deepEqual(
    { code: sortie.code, cause: sortie.texte.includes("source absente : src/a.ts"), statut: statutGit(racine) },
    { code: 1, cause: true, statut: " D src/a.ts\n" },
    sortie.texte,
  );
});
