import assert from "node:assert/strict";
import { test } from "node:test";

import { contenus, depot, ranger } from "./depot-de-test.mjs";

test("RNG-02 · un chemin écrit depuis la racine suit le fichier ou le dossier déclaré, et une réécriture déclarée s'applique", () => {
  const racine = depot({
    "src/x/cible.ts": "export const c = 1;\n",
    "src/x/cible.tsx": "export const t = 1;\n",
    "src/x/vieux/a.ts": "export const a = 1;\n",
    "scripts/garde.test.mjs": "const F = 'src/x/cible.ts';\nconst D = 'src/x/vieux';\nconst T = 'src/x/cible.tsx';\nconst I = '/src/x/vieux/';\n",
    "docs/notes.md": "Voir `src/x/cible.ts:12` et src/x/vieux/a.ts.\n",
    "package.json": '{ "scripts": { "garde": "node ./scripts/garde.test.mjs" } }\n',
    "config.json": '{ "cible": "src/x/cible.ts" }\n',
    "eslint.config.js": "const REGLE = 'regle-a-renommer';\n",
  });

  const sortie = ranger(racine, {
    deplacements: {
      "src/x/cible.ts": "src/x/sujet/cible.ts",
      "src/x/vieux/a.ts": "src/x/neuf/a.ts",
      "scripts/garde.test.mjs": "scripts/gardes/garde.test.mjs",
    },
    dossiers: { "src/x/vieux": "src/x/neuf" },
    reecritures: { "eslint.config.js": { "regle-a-renommer": "regle-renommee" } },
  });

  assert.deepEqual(
    { code: sortie.code, ...contenus(racine, ["scripts/gardes/garde.test.mjs", "docs/notes.md", "package.json", "config.json", "eslint.config.js"]) },
    {
      code: 0,
      "scripts/gardes/garde.test.mjs": "const F = 'src/x/sujet/cible.ts';\nconst D = 'src/x/neuf';\nconst T = 'src/x/cible.tsx';\nconst I = '/src/x/neuf/';\n",
      "docs/notes.md": "Voir `src/x/sujet/cible.ts:12` et src/x/neuf/a.ts.\n",
      "package.json": '{ "scripts": { "garde": "node ./scripts/gardes/garde.test.mjs" } }\n',
      "config.json": '{ "cible": "src/x/sujet/cible.ts" }\n',
      "eslint.config.js": "const REGLE = 'regle-renommee';\n",
    },
  );
});
