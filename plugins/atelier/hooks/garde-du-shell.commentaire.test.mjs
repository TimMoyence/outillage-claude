import assert from "node:assert/strict";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

test("LEC-4.7 · un commentaire ne compte ni comme argument du cd ni comme segment", () => {
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = (commande) => jugeDepuis(partage)(partage, commande);
  const refusDuPartage = depuis("git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const commande of [`cd ${seul}  # depot\ngit add a.md`, `cd ${seul} # depot ; git rm a.md\ngit rm a.md`, "ls # puis ; git rm a.md"])
    assert.equal(depuis(commande), null, `${commande} a ete refusee a tort`);
  for (const commande of ["git rm a.md # note", "echo a#b; git rm a.md", "echo $# ; git rm a.md", "echo '#' ; git rm a.md", "echo x;# rien\ngit rm a.md"])
    assert.equal(depuis(commande), refusDuPartage, `${commande} a franchi le garde`);
});
