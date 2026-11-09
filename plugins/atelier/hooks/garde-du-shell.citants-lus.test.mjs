import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, juge } from "./essais-de-la-garde.mjs";

test("LEC-4.3 · CITANTS_LUS égal au compte lève le refus, un autre compte le maintient", () => {
  const depot = depotGit({ "docs/a.md": "a\n", "index.md": "Voir docs/a.md\net docs/a.md\n" });
  rmSync(join(depot, "docs/a.md"));
  const dans = (commande) => juge(commande, { cwd: depot, racine: depot });
  const refus = dans("git commit -F m -- docs/a.md");
  assert.match(refus ?? "", /\(2 citations\)[^]*`CITANTS_LUS=2`/);

  for (const commande of ["CITANTS_LUS=2 git commit -F m -- docs/a.md", "env CITANTS_LUS=2 git commit -F m -- docs/a.md"])
    assert.equal(dans(commande), null, `${commande} a ete refusee a tort`);
  for (const commande of [
    "CITANTS_LUS=1 git commit -F m -- docs/a.md",
    "CITANTS_LUS=02 git commit -F m -- docs/a.md",
    "export CITANTS_LUS=2; git commit -F m -- docs/a.md",
    "CITANTS_LUS=2 ls; git commit -F m -- docs/a.md",
    "git commit -m CITANTS_LUS=2 -- docs/a.md",
  ])
    assert.equal(dans(commande), refus, `${commande} a franchi le garde`);
  assert.equal(dans("CITANTS_LUS=2 git commit -a -F m -- docs/a.md"), dans("git commit -a -F m -- docs/a.md"));
  assert.match(dans("cd /nexiste/pas; CITANTS_LUS=2 git commit -F m -- docs/a.md") ?? "", /^le dossier où ce git s'exécute ne se lit pas/);
});
