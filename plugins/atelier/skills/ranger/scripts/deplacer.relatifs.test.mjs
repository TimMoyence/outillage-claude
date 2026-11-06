import assert from "node:assert/strict";
import { test } from "node:test";

import { contenus, depot, ranger } from "./depot-de-test.mjs";

const LECTEUR = "export const c = (p: string) => p !== '.' && p !== '..';\n";

test("RNG-01 · un chemin relatif en position reconnue suit sa cible et son lecteur, le reste ne bouge pas", () => {
  const racine = depot(
    {
      "src/a/cible.ts": "import { autre } from './autre';\nimport { tout } from '.';\nexport const cible = autre + tout;\n",
      "src/a/autre.ts": "export const autre = 1;\n",
      "src/a/index.ts": "export const tout = 2;\n",
      "src/b/lecteur.ts": `import { cible } from '../a/cible';\njest.mock('../a/cible');\nexport const charger = () => import('../a/cible');\n${LECTEUR}`,
      "src/b/vue.component.ts": "@Component({ templateUrl: './vue.component.html', styleUrl: './vue.component.scss' })\nexport class Vue {}\n",
      "src/b/vue.component.html": "<p></p>\n",
      "src/b/vue.component.scss": "@use '../styles/jetons';\n@use 'voisin';\n.p { background: url('../../node_modules/police/f.woff2'); }\n",
      "src/b/_voisin.scss": "$x: 1;\n",
      "src/styles/_jetons.scss": "$y: 2;\n",
      "src/c/racine.ts": "export const RACINE = join(__dirname, '..', '..');\nexport const dist = (d: string) => resolve(d, '..');\n",
      "src/c/depot.mjs": "export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '../..');\n",
      "docs/guide.md": "[cible](../src/a/cible.ts)\n",
    },
    { "node_modules/police/f.woff2": "police" },
  );

  const sortie = ranger(racine, {
    deplacements: {
      "src/a/cible.ts": "src/a/sujet/cible.ts",
      "src/b/vue.component.ts": "src/b/vue/vue.component.ts",
      "src/b/vue.component.html": "src/b/vue/vue.component.html",
      "src/b/vue.component.scss": "src/b/vue/vue.component.scss",
      "src/c/racine.ts": "src/c/outils/racine.ts",
      "src/c/depot.mjs": "src/c/outils/depot.mjs",
    },
  });

  assert.deepEqual(
    {
      code: sortie.code,
      ...contenus(racine, [
        "src/a/cible.ts",
        "src/a/sujet/cible.ts",
        "src/b/lecteur.ts",
        "src/b/vue/vue.component.ts",
        "src/b/vue/vue.component.scss",
        "src/c/outils/racine.ts",
        "src/c/outils/depot.mjs",
        "docs/guide.md",
      ]),
    },
    {
      code: 0,
      "src/a/cible.ts": null,
      "src/a/sujet/cible.ts": "import { autre } from '../autre';\nimport { tout } from '..';\nexport const cible = autre + tout;\n",
      "src/b/lecteur.ts": `import { cible } from '../a/sujet/cible';\njest.mock('../a/sujet/cible');\nexport const charger = () => import('../a/sujet/cible');\n${LECTEUR}`,
      "src/b/vue/vue.component.ts": "@Component({ templateUrl: './vue.component.html', styleUrl: './vue.component.scss' })\nexport class Vue {}\n",
      "src/b/vue/vue.component.scss": "@use '../../styles/jetons';\n@use '../voisin';\n.p { background: url('../../../node_modules/police/f.woff2'); }\n",
      "src/c/outils/racine.ts": "export const RACINE = join(__dirname, '../../..');\nexport const dist = (d: string) => resolve(d, '..');\n",
      "src/c/outils/depot.mjs": "export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '../../..');\n",
      "docs/guide.md": "[cible](../src/a/sujet/cible.ts)\n",
    },
  );
});
