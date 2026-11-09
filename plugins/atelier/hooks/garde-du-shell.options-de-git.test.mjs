import assert from "node:assert/strict";
import { test } from "node:test";

import { juge, passe } from "./essais-de-la-garde.mjs";

test("LEC-2 · une option de git à valeur séparée ne cache ni la clé des hooks ni le verbe", () => {
  const refusDesHooks = juge("git -c core.hooksPath=/dev/null commit -F m -- a.ts");
  assert.notEqual(refusDesHooks, null);
  passe(["git --config-env user.name=NOM commit -F m -- a.ts", "git --attr-source HEAD log --oneline"]);
  for (const commande of [
    "git --config-env core.hooksPath=VIDE commit -F m -- a.ts",
    "git --config-env core.hooksPath=VIDE merge feat/x",
    "git --attr-source HEAD commit -n -F m -- a.ts",
    "git --namespace x --attr-source HEAD -C . commit -n -F m -- a.ts",
  ])
    assert.equal(juge(commande), refusDesHooks, `${commande} a franchi le garde`);
});
