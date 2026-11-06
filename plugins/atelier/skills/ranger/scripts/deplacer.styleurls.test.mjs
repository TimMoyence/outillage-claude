import assert from "node:assert/strict";
import { test } from "node:test";

import { contenus, depot, ranger } from "./depot-de-test.mjs";

test("RNG-01 · styleUrls suit chacune de ses feuilles quand le composant bouge seul", () => {
  const racine = depot({
    "src/b/vue.component.ts": '@Component({ templateUrl: "./vue.component.html", styleUrls: ["./vue.component.scss", "../commun.scss"] })\nexport class Vue {}\n',
    "src/b/vue.component.html": "<p></p>\n",
    "src/b/vue.component.scss": ".p {}\n",
    "src/commun.scss": ".c {}\n",
  });

  const sortie = ranger(racine, { deplacements: { "src/b/vue.component.ts": "src/b/vue/vue.component.ts", "src/b/vue.component.html": "src/b/vue/vue.component.html" } });

  assert.deepEqual(
    { code: sortie.code, ...contenus(racine, ["src/b/vue/vue.component.ts"]) },
    {
      code: 0,
      "src/b/vue/vue.component.ts": '@Component({ templateUrl: "./vue.component.html", styleUrls: ["../vue.component.scss", "../../commun.scss"] })\nexport class Vue {}\n',
    },
  );
});
