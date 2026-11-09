import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

test("LEC-4.7 · les dossiers possibles se cumulent, une condition qui déplace compte, function déclare un corps", () => {
  const hors = mkdtempSync(join(tmpdir(), "garde-hors-"));
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = depuis(partage, "git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const [cwd, commande] of [
    [partage, `true || cd ${seul}; true || cd ${seul}; git rm a.md`],
    [seul, `if cd ${partage}; false; then :; else git rm a.md; fi`],
    [seul, `if cd ${partage} && false; then :; elif true; then git rm a.md; fi`],
    [seul, `function f { cd ${partage}; }; f; git rm a.md`],
    [seul, `function f\n{ cd ${partage}; }\nf\ngit rm a.md`],
    [partage, `function f { git rm a.md; }; f`],
    [hors, `if true; then if true; then cd ${partage}; fi; else cd ${seul}; fi; git rm a.md`],
  ])
    assert.equal(depuis(cwd, commande), refusDuPartage, `${commande} a franchi le garde`);
  for (const commande of [`if cd ${seul}; then git rm a.md; fi`, `function f { echo; }; cd ${seul}; git rm a.md`])
    assert.equal(depuis(partage, commande), null, `${commande} a ete refusee a tort`);
});
