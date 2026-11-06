import assert from "node:assert/strict";
import { test } from "node:test";

import { contenus, depot, ranger } from "./depot-de-test.mjs";

test("RNG-01 · un @use écrit dans les styles en ligne d'un composant suit son partiel quand le composant bouge", () => {
  const racine = depot({
    "src/auth/formulaire.component.ts": "@Component({\n  styles: `\n    @use './auth-shared';\n    @use 'voisin';\n  `,\n})\nexport class Formulaire {}\n",
    "src/auth/_auth-shared.scss": "$a: 1;\n",
    "src/auth/_voisin.scss": "$b: 1;\n",
  });

  const sortie = ranger(racine, { deplacements: { "src/auth/formulaire.component.ts": "src/auth/connexion/formulaire.component.ts" } });

  assert.deepEqual(
    { code: sortie.code, ...contenus(racine, ["src/auth/connexion/formulaire.component.ts"]) },
    {
      code: 0,
      "src/auth/connexion/formulaire.component.ts": "@Component({\n  styles: `\n    @use '../auth-shared';\n    @use '../voisin';\n  `,\n})\nexport class Formulaire {}\n",
    },
    sortie.texte,
  );
});
