import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, juge } from "./essais-de-la-garde.mjs";
import { dossierDeLaCommande } from "./garde-du-shell.mjs";

test("LEC-4.7 · un cd littéral à espace échappé vers un dossier existant reste lisible", () => {
  const depot = depotGit({ "Mon Dossier/a.md": "a\n" });
  for (const commande of ["cd Mon\\ Dossier && git add a.md", 'cd "Mon Dossier" && git add a.md', "ls; cd Mon\\ Dossier; git commit -F m -- a.md"])
    assert.equal(juge(commande, { cwd: depot, racine: depot }), null, `${commande} a ete refusee a tort`);
  assert.equal(dossierDeLaCommande("cd Mon\\ Dossier; ls", depot), join(depot, "Mon Dossier"));
});
