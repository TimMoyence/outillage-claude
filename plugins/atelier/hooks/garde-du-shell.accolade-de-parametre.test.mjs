import assert from "node:assert/strict";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

test("LEC-4.7 · le } qui ferme un ${…} ne ferme ni le groupe ni la boucle", () => {
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = depuis(partage, "git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const commande of [
    `{ cd ${seul}; echo \${v:- }; } | cat; git rm a.md`,
    `{ cd ${seul}; x=\${l%% }; } | cat; git rm a.md`,
    `for i in 1; do cd ${seul}; echo \${i:- }; done | cat; git rm a.md`,
  ])
    assert.equal(depuis(partage, commande), refusDuPartage, `${commande} a franchi le garde`);
  assert.match(depuis(partage, `ls | { echo \${v:- }; cd ${seul}; }; git rm a.md`) ?? "", /^le dossier où ce git s'exécute ne se lit pas/);
  assert.equal(depuis(partage, `{ cd ${seul}; echo \${v:- }; }; git rm a.md`), null);
});
