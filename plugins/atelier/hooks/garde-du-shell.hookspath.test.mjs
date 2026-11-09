import assert from "node:assert/strict";
import { test } from "node:test";

import { juge, passe } from "./essais-de-la-garde.mjs";

const REFUS =
  "les hooks du dépôt ne se contournent jamais (`--no-verify`, `-n`, `HUSKY`, `LEFTHOOK*`, `SKIP_PRE_*`, `SKIP`, `GIT_CONFIG_*`, l'écriture de `core.hooksPath`, la section `core` retirée ou renommée) : " +
  "un rouge du pre-commit ou du pre-push se corrige. La lecture passe : `git config --get core.hooksPath`.";

test("LEC-2 · lire core.hooksPath passe, l'écrire reste refusé", () => {
  passe([
    "git config core.hooksPath",
    "git config --get core.hooksPath",
    "git config --get-all core.HooksPath",
    "git config --local --get core.hooksPath",
    "git config --global --show-origin core.hooksPath",
    "git config --show-scope --get core.hooksPath",
    "git config get core.hooksPath",
    "git config get --show-origin core.hooksPath",
    "git -C /ailleurs config core.hooksPath",
    "git grep -n -w core.hooksPath",
    "git log -S core.hooksPath --oneline",
    'git commit -m "lire core.hooksPath" -- a.ts',
  ]);
  for (const commande of [
    "git config core.hooksPath /dev/null",
    "git config core.hooksPath get",
    "git config --local core.hooksPath .husky",
    "git config --unset core.hooksPath",
    "git config --unset-all core.hooksPath",
    "git config --replace-all core.hooksPath x",
    "git config --add core.hooksPath x",
    "git config --file .git/config core.hooksPath x",
    "git config set core.hooksPath x",
    "git config unset core.hooksPath",
    "git config --get core.hooksPath core.hooksPath",
    "git -c core.hooksPath=/dev/null config core.hooksPath",
    "git -c core.hooksPath=/dev/null grep -n x",
    "git --config-env=core.hooksPath=VIDE commit -F m -- a.ts",
    "git -c core.hooksPath=/dev/null commit -F m -- a.ts",
  ])
    assert.equal(juge(commande), REFUS, `${commande} a franchi le garde`);
});
